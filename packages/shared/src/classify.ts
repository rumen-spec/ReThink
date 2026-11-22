/**
 * Deterministic product classifier (SPEC §7.3). Runs in the extension before anything reaches
 * Gemini: most pages on an allowlisted store are decided here, for free and offline.
 *
 * How it decides, in order:
 *  1. Every signal on the page (title, product_type, tags, breadcrumbs, URL, description) is
 *     scored against the registry's keyword lists. Signals close to the merchandiser — product_type
 *     and breadcrumbs — weigh more than free text.
 *  2. The merchant's `defaultCategory` adds a prior, small on a mixed catalog and large on a
 *     single-category store. A keychain on a beauty store must still be able to out-vote it.
 *  3. A "Size" variant option with clothing-shaped values is a strong apparel signal; shade or
 *     scent options point at beauty.
 *
 * The result always carries a confidence and the signals behind it. Below `AI_THRESHOLD` the
 * caller should ask the classify-product edge function instead of guessing (`needsAi`).
 * Category is never null: `other` is the catch-all (SPEC §1.4).
 */
import { isSubtypeOf, PRODUCT_CATEGORIES, type ProductCategoryKey, type ProductSubtype } from './categories.ts';
import { getMerchant, type MerchantKey } from './merchants.ts';
import type { ClassificationContext } from './types.ts';

export interface ClassificationResult {
  category: ProductCategoryKey;
  subtype: ProductSubtype;
  /** 0–1. ≥ 0.6 is confident enough to show a budget number without asking Gemini. */
  confidence: number;
  /** Which signals carried the decision, newest-reader-first. Shown in logs, never in the UI. */
  reasons: string[];
  /** True when the caller should fall back to the classify-product edge function. */
  needsAi: boolean;
}

/** Below this, show the overlay only after the AI fallback (or let the user pick). */
export const AI_THRESHOLD = 0.6;

/** Weight per signal, highest first: what the merchandiser typed beats what marketing wrote. */
const WEIGHTS = {
  productType: 3,
  breadcrumb: 2.5,
  tag: 1.5,
  title: 2,
  urlPath: 1,
  description: 0.5,
} as const;

const SIZE_VALUES = new Set(['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', 'o/s', 'os', 'one size', 'petite', 'tall']);
const SHADE_OPTIONS = new Set(['shade', 'colour family', 'color family', 'scent', 'fragrance', 'formula', 'finish']);

/** Subtype hints per category: the first list whose word appears wins. Order matters. */
const SUBTYPE_HINTS: Partial<Record<ProductCategoryKey, readonly (readonly [string, readonly string[]])[]>> = {
  clothing: [
    ['footwear', ['sneaker', 'shoe', 'boot', 'sandal', 'slipper', 'trainer']],
    ['outerwear', ['jacket', 'coat', 'parka', 'puffer', 'vest', 'anorak']],
    ['bottoms', ['pant', 'pants', 'legging', 'leggings', 'short', 'shorts', 'jogger', 'skirt', 'jean', 'jeans', 'trouser']],
    ['tops', ['hoodie', 'sweatshirt', 'sweater', 'shirt', 'tee', 't-shirt', 'top', 'tank', 'crewneck', 'bra', 'dress', 'pullover']],
    ['accessories', ['hat', 'cap', 'beanie', 'belt', 'sock', 'socks', 'bag', 'tote', 'scarf', 'glove', 'mitten']],
  ],
  beauty: [
    ['makeup', ['lipstick', 'gloss', 'foundation', 'concealer', 'mascara', 'blush', 'bronzer', 'highlighter', 'eyeliner', 'eyeshadow', 'primer', 'makeup']],
    ['skincare', ['serum', 'moisturizer', 'moisturiser', 'cleanser', 'toner', 'spf', 'sunscreen', 'skincare', 'mask', 'exfoliant']],
    ['haircare', ['shampoo', 'conditioner', 'hair oil', 'haircare', 'styling']],
    ['fragrance', ['perfume', 'fragrance', 'eau de parfum', 'cologne', 'mist']],
    ['bath-body', ['body wash', 'lotion', 'body', 'bath', 'scrub', 'deodorant']],
    ['tools', ['brush', 'sponge', 'applicator', 'tweezer', 'curler', 'tool']],
  ],
  electronics: [
    ['audio', ['headphone', 'earbud', 'speaker', 'soundbar', 'airpods']],
    ['phone', ['phone', 'iphone', 'android', 'charger', 'cable']],
    ['computing', ['laptop', 'keyboard', 'mouse', 'monitor', 'tablet', 'ipad']],
    ['wearable', ['watch', 'tracker', 'band']],
  ],
  home: [
    ['kitchen', ['mug', 'kettle', 'pan', 'pot', 'glass', 'bowl', 'plate', 'kitchen']],
    ['bedding', ['sheet', 'duvet', 'pillow', 'blanket', 'bedding', 'throw']],
    ['furniture', ['chair', 'table', 'desk', 'shelf', 'sofa', 'stool']],
    ['decor', ['candle', 'vase', 'frame', 'print', 'poster', 'decor', 'rug']],
  ],
  entertainment: [
    ['books', ['book', 'novel', 'paperback', 'hardcover']],
    ['games', ['game', 'console', 'puzzle', 'board game']],
    ['music', ['vinyl', 'record', 'album', 'cd']],
    ['hobby', ['kit', 'craft', 'model', 'hobby']],
  ],
};

/** Whole-word match, so "short" does not fire on "shortbread" and "tee" not on "teeth". */
function hasWord(haystack: string, word: string): boolean {
  if (!haystack || !word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystack);
}

const norm = (s: string | undefined): string => (s ?? '').toLowerCase().replace(/[_/|>,-]+/g, ' ').replace(/\s+/g, ' ').trim();

function scoreText(text: string | undefined, weight: number, label: string, scores: Map<ProductCategoryKey, number>, reasons: string[]): void {
  const t = norm(text);
  if (!t) return;
  for (const def of PRODUCT_CATEGORIES) {
    if (def.key === 'other') continue;
    const hits = def.keywords.filter((k) => hasWord(t, k));
    if (hits.length === 0) continue;
    // Several hits in one field are only slightly better than one: the field already voted.
    const add = weight * (1 + Math.min(hits.length - 1, 2) * 0.25);
    scores.set(def.key as ProductCategoryKey, (scores.get(def.key as ProductCategoryKey) ?? 0) + add);
    reasons.push(`${label}:${def.key}(${hits.slice(0, 3).join(',')})`);
  }
}

function pickSubtype(category: ProductCategoryKey, haystack: string): ProductSubtype {
  for (const [subtype, words] of SUBTYPE_HINTS[category] ?? []) {
    if (words.some((w) => hasWord(haystack, w))) return subtype as ProductSubtype;
  }
  return 'other' as ProductSubtype;
}

/**
 * Classify a product page. `merchantKey` comes from the registry via `findMerchantByHost`, never
 * from the page itself. Pure: no network, no DOM, safe to unit-test and to run in an edge function.
 */
export function classifyProduct(context: ClassificationContext): ClassificationResult {
  const merchant = getMerchant(context.merchantKey as MerchantKey);
  const scores = new Map<ProductCategoryKey, number>();
  const reasons: string[] = [];

  scoreText(context.productType, WEIGHTS.productType, 'type', scores, reasons);
  for (const crumb of context.breadcrumbs ?? []) scoreText(crumb, WEIGHTS.breadcrumb, 'crumb', scores, reasons);
  for (const tag of (context.tags ?? []).slice(0, 20)) scoreText(tag, WEIGHTS.tag, 'tag', scores, reasons);
  scoreText(context.title, WEIGHTS.title, 'title', scores, reasons);
  scoreText(context.urlPath, WEIGHTS.urlPath, 'url', scores, reasons);
  scoreText(context.descriptionSnippet, WEIGHTS.description, 'desc', scores, reasons);

  // Variant options: how the store asks you to choose says what the thing is.
  const optionNames = (context.optionNames ?? []).map((o) => o.toLowerCase().trim());
  const optionValues = (context.optionValues ?? []).map((v) => v.toLowerCase().trim());
  if (optionNames.includes('size') && optionValues.some((v) => SIZE_VALUES.has(v))) {
    scores.set('clothing', (scores.get('clothing') ?? 0) + 2.5);
    reasons.push('option:size-letters');
  }
  if (optionNames.some((o) => SHADE_OPTIONS.has(o))) {
    scores.set('beauty', (scores.get('beauty') ?? 0) + 2);
    reasons.push('option:shade-or-scent');
  }

  // What the page itself said, before the store gets a vote. Confidence is earned here and nowhere else.
  const evidenceOnPage = new Map(scores);

  // The merchant prior breaks ties and covers quiet pages. Weak on a mixed catalog, so a keychain
  // on a beauty store can still escape it.
  if (merchant.defaultCategory) {
    const prior = merchant.mixedCatalog ? 1 : 2.5;
    scores.set(merchant.defaultCategory, (scores.get(merchant.defaultCategory) ?? 0) + prior);
    reasons.push(`prior:${merchant.defaultCategory}(${merchant.mixedCatalog ? 'mixed' : 'single'})`);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0] ?? [undefined, 0];
  const runnerUp = ranked[1]?.[1] ?? 0;

  if (!top || topScore < 2) {
    return { category: 'other' as ProductCategoryKey, subtype: 'other' as ProductSubtype, confidence: 0.2, reasons: [...reasons, 'no-signal'], needsAi: true };
  }

  const haystack = norm([context.title, context.productType, (context.breadcrumbs ?? []).join(' '), (context.tags ?? []).join(' '), context.urlPath].join(' '));
  let subtype = pickSubtype(top, haystack);
  if (!isSubtypeOf(top, subtype)) subtype = 'other' as ProductSubtype;

  // A store prior with nothing on the page behind it is a guess. Name the category, but send the
  // caller to the model rather than putting a budget number under an unread product.
  const evidence = evidenceOnPage.get(top) ?? 0;
  if (evidence === 0) {
    return { category: top, subtype, confidence: 0.45, reasons: [...reasons, 'prior-only'], needsAi: true };
  }

  // Confidence rises with how far ahead the winner is, not with its raw score: a landslide on a
  // single-category store and a one-keyword win are not the same thing.
  const margin = (topScore - runnerUp) / topScore;
  const confidence = Math.min(0.97, 0.35 + Math.min(evidence, 8) * 0.045 + margin * 0.35);

  return { category: top, subtype, confidence: Number(confidence.toFixed(2)), reasons, needsAi: confidence < AI_THRESHOLD };
}
