import type { BudgetCategory } from './types.ts';

/**
 * Product-category registry — the ONE place a budgetable product category is defined.
 *
 * Adding a category = adding one entry here (and a row in the `product_categories` lookup table,
 * seeded from this list). Everything else derives from it: the `ProductCategoryKey` / subtype
 * types, the Gemini prompt (keys + subtypes + scope line), the deterministic classifier's
 * keyword pass, onboarding's suggested categories and the extension's routing.
 *
 * Demo scope (2026-11-21): only `clothing` and `beauty` are exercised live. The rest prove the
 * design is general; a product that classifies to one without an enabled budget gets a
 * "Set a <label> budget" prompt, not a number.
 */
export interface ProductCategoryDef {
  /** Stable wire/DB key. Lowercase, never shown to users, never renamed once persisted. */
  readonly key: string;
  /** Display name; also the default `BudgetCategory.name` created in onboarding. */
  readonly label: string;
  /** Closed subtype list. Always ends with 'other'. */
  readonly subtypes: readonly string[];
  /** One plain-language scope sentence, reused verbatim in the Gemini prompt. */
  readonly scope: string;
  /**
   * Lowercase hints for the deterministic classifier, matched as whole words against
   * product_type, tags, breadcrumbs and title. A hit is a prior, not a verdict.
   */
  readonly keywords: readonly string[];
}

export const PRODUCT_CATEGORIES = [
  {
    key: 'clothing',
    label: 'Clothing',
    subtypes: ['tops', 'bottoms', 'outerwear', 'footwear', 'accessories', 'other'],
    scope: 'Apparel, shoes, bags and clothing accessories such as hats, belts, socks and underwear.',
    keywords: [
      'hoodie', 'sweatshirt', 'sweater', 'shirt', 'tee', 't-shirt', 'top', 'tank', 'pant', 'pants',
      'legging', 'leggings', 'short', 'shorts', 'jogger', 'jacket', 'coat', 'dress', 'skirt',
      'sneaker', 'shoe', 'boot', 'sock', 'hat', 'cap', 'beanie', 'belt', 'bra', 'underwear', 'boxer',
      'apparel', 'womens', 'mens', 'outerwear', 'footwear',
    ],
  },
  {
    key: 'beauty',
    label: 'Beauty',
    subtypes: ['makeup', 'skincare', 'haircare', 'fragrance', 'bath-body', 'tools', 'other'],
    scope: 'Makeup, skincare, hair care, fragrance, bath and body products, and beauty tools.',
    keywords: [
      'makeup', 'lipstick', 'lip', 'gloss', 'foundation', 'concealer', 'blush', 'bronzer', 'mascara',
      'eyeliner', 'brow', 'skincare', 'serum', 'moisturizer', 'cleanser', 'toner', 'spf', 'sunscreen',
      'shampoo', 'conditioner', 'hair', 'fragrance', 'perfume', 'cologne', 'bath', 'body', 'balm',
      'brush', 'sponge', 'cosmetic', 'cosmetics',
    ],
  },
  {
    key: 'electronics',
    label: 'Electronics',
    subtypes: ['audio', 'phone', 'computing', 'wearable', 'accessories', 'other'],
    scope: 'Consumer electronics and their accessories: headphones, speakers, phones, cases, chargers, cables, laptops, tablets, wearables.',
    keywords: [
      'headphone', 'headphones', 'earbud', 'earbuds', 'speaker', 'phone', 'iphone', 'case', 'charger',
      'cable', 'power bank', 'laptop', 'tablet', 'keyboard', 'mouse', 'monitor', 'watch', 'camera',
      'electronics', 'tech',
    ],
  },
  {
    key: 'home',
    label: 'Home',
    subtypes: ['furniture', 'decor', 'kitchen', 'bedding', 'other'],
    scope: 'Furniture, home decor, kitchenware, bedding and other household goods.',
    keywords: [
      'sofa', 'couch', 'chair', 'table', 'desk', 'shelf', 'lamp', 'rug', 'candle', 'vase', 'frame',
      'mug', 'kettle', 'pan', 'knife', 'plate', 'bowl', 'glassware', 'duvet', 'pillow', 'sheet',
      'blanket', 'towel', 'home', 'decor', 'kitchen', 'furniture',
    ],
  },
  {
    key: 'entertainment',
    label: 'Entertainment',
    subtypes: ['books', 'games', 'music', 'hobby', 'other'],
    scope: 'Books, video games and consoles, music and vinyl, and hobby or collectible goods.',
    keywords: [
      'book', 'novel', 'paperback', 'hardcover', 'game', 'games', 'console', 'controller', 'vinyl',
      'record', 'album', 'cd', 'puzzle', 'board game', 'lego', 'collectible', 'figure', 'poster',
    ],
  },
  {
    // The catch-all. A cart line is never uncategorised: merch, keychains, gift cards land here and
    // count against the user's "Other" budget if they have one. Decided 2026-11-21.
    key: 'other',
    label: 'Other',
    subtypes: ['other'],
    scope: 'A real product that fits none of the categories above (merch, keychains, gift cards, stationery).',
    keywords: [],
  },
] as const satisfies readonly ProductCategoryDef[];

export type ProductCategoryKey = (typeof PRODUCT_CATEGORIES)[number]['key'];

export type ProductCategoryDefOf<K extends ProductCategoryKey> = Extract<
  (typeof PRODUCT_CATEGORIES)[number],
  { key: K }
>;

export type SubtypeOf<K extends ProductCategoryKey> = ProductCategoryDefOf<K>['subtypes'][number];

/** Union of every subtype across every category. */
export type ProductSubtype = SubtypeOf<ProductCategoryKey>;

export type ClothingSubtype = SubtypeOf<'clothing'>;
export type BeautySubtype = SubtypeOf<'beauty'>;

export const PRODUCT_CATEGORY_KEYS = PRODUCT_CATEGORIES.map((c) => c.key) as readonly ProductCategoryKey[];

/** Categories exercised in the live demo. Others are supported but not rehearsed. */
export const DEMO_PRODUCT_CATEGORY_KEYS = ['clothing', 'beauty'] as const satisfies readonly ProductCategoryKey[];

export function getProductCategory<K extends ProductCategoryKey>(key: K): ProductCategoryDefOf<K> {
  const def = PRODUCT_CATEGORIES.find((c) => c.key === key);
  if (!def) throw new RangeError(`Unknown product category: ${String(key)}`);
  return def as ProductCategoryDefOf<K>;
}

/** Validate a wire/DB value (edge-function input, Gemini output) before trusting it as a key. */
export function isProductCategoryKey(value: unknown): value is ProductCategoryKey {
  return typeof value === 'string' && (PRODUCT_CATEGORY_KEYS as readonly string[]).includes(value);
}

export function isSubtypeOf(key: ProductCategoryKey, subtype: unknown): subtype is ProductSubtype {
  return (
    typeof subtype === 'string' &&
    (getProductCategory(key).subtypes as readonly string[]).includes(subtype)
  );
}

/**
 * The enabled budget a detected product lands in, or null → UI shows "Set a <label> budget".
 * Matched on `productCategory`, never on display name. The DB enforces at most one enabled
 * match per owner/period; if data is bad we take the first and let the server reject the write.
 */
export function findBudgetCategoryFor(
  categories: readonly BudgetCategory[],
  key: ProductCategoryKey,
): BudgetCategory | null {
  return categories.find((c) => c.enabled && c.productCategory === key) ?? null;
}
