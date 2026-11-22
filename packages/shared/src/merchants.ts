import type { ProductCategoryKey } from './categories.ts';

/**
 * Merchant registry — the ONE place an allowlisted store is defined (docs/RETAILERS.md has the
 * probe evidence behind each entry). Consumed by: the extension manifest (host allowlist), the
 * content script (which adapter, which CAD path, whether the Ajax cart is readable), the
 * classify-product edge function (category prior) and every edge function that validates a
 * `merchantKey`.
 *
 * Adding a store = adding one entry + a RETAILERS.md row. Nothing in an app should hardcode a host.
 */
export interface MerchantDef {
  /** Stable key used in cart snapshots and events. Never renamed once persisted. */
  readonly key: string;
  readonly label: string;
  /** Exact hostnames the content script may run on. Lowercase, no scheme, no path. */
  readonly hosts: readonly string[];
  readonly platform: 'shopify' | 'custom';
  /**
   * Path prefix under which the store serves CAD (Shopify Markets subfolder), e.g. '/en-ca/'.
   * '/' when the root storefront is already CAD. Cart/product JSON must be fetched under this
   * prefix (`window.Shopify.routes.root` at runtime should agree; if the page's active currency
   * isn't CAD, budget math is refused — spec §7.8).
   */
  readonly cadRoot: string;
  /** Classification prior for products on this store. undefined = no prior. */
  readonly defaultCategory?: ProductCategoryKey;
  /** true when the catalog holds products outside `defaultCategory` (merch, cases, keychains): always classify. */
  readonly mixedCatalog: boolean;
  /** 'auto' = Ajax cart mirror verified; 'manual' = manual-consideration cart only. */
  readonly cartMirror: 'auto' | 'manual';
  /** demo = rehearsed live; backup = verified fallback; overlay-only = product overlay, no cart. */
  readonly tier: 'demo' | 'backup' | 'overlay-only';
}

export const MERCHANTS = [
  {
    key: 'frankandoak-ca',
    label: 'Frank And Oak',
    hosts: ['www.frankandoak.com', 'frankandoak.com'],
    platform: 'shopify',
    cadRoot: '/',
    defaultCategory: 'clothing',
    mixedCatalog: false,
    cartMirror: 'auto',
    tier: 'demo',
  },
  {
    key: 'alo-ca',
    label: 'Alo',
    hosts: ['www.aloyoga.com', 'aloyoga.com'],
    platform: 'shopify',
    cadRoot: '/en-ca/',
    defaultCategory: 'clothing',
    mixedCatalog: false,
    cartMirror: 'auto',
    tier: 'demo',
  },
  {
    key: 'ovo-ca',
    label: 'OVO',
    hosts: ['octobersveryown.com', 'www.octobersveryown.com'],
    platform: 'shopify',
    cadRoot: '/',
    defaultCategory: 'clothing',
    mixedCatalog: true,
    cartMirror: 'auto',
    tier: 'demo',
  },
  {
    key: 'fenty-beauty-ca',
    label: 'Fenty Beauty',
    hosts: ['fentybeauty.com', 'www.fentybeauty.com'],
    platform: 'shopify',
    cadRoot: '/en-ca/',
    defaultCategory: 'beauty',
    mixedCatalog: true,
    cartMirror: 'auto',
    tier: 'demo',
  },
  {
    key: 'glossier-ca',
    label: 'Glossier',
    hosts: ['www.glossier.com', 'glossier.com'],
    platform: 'shopify',
    cadRoot: '/en-ca/',
    defaultCategory: 'beauty',
    mixedCatalog: true,
    cartMirror: 'auto',
    tier: 'backup',
  },
  {
    key: 'tentree-ca',
    label: 'tentree',
    hosts: ['www.tentree.ca', 'tentree.ca'],
    platform: 'shopify',
    cadRoot: '/',
    defaultCategory: 'clothing',
    mixedCatalog: false,
    cartMirror: 'auto',
    tier: 'backup',
  },
  {
    key: 'peace-collective-ca',
    label: 'Peace Collective',
    hosts: ['www.peace-collective.com', 'peace-collective.com'],
    platform: 'shopify',
    cadRoot: '/',
    defaultCategory: 'clothing',
    mixedCatalog: true,
    cartMirror: 'auto',
    tier: 'backup',
  },
  {
    key: 'lululemon-ca',
    label: 'Lululemon',
    hosts: ['shop.lululemon.com'],
    platform: 'custom',
    cadRoot: '/en-ca/',
    defaultCategory: 'clothing',
    mixedCatalog: false,
    cartMirror: 'manual',
    tier: 'overlay-only',
  },
] as const satisfies readonly MerchantDef[];

export type MerchantKey = (typeof MERCHANTS)[number]['key'];

export const MERCHANT_KEYS = MERCHANTS.map((m) => m.key) as readonly MerchantKey[];

/** Every allowlisted host, for the extension manifest's `host_permissions` / content-script matches. */
export const MERCHANT_HOSTS: readonly string[] = MERCHANTS.flatMap((m) => m.hosts);

export function isMerchantKey(value: unknown): value is MerchantKey {
  return typeof value === 'string' && (MERCHANT_KEYS as readonly string[]).includes(value);
}

export function getMerchant(key: MerchantKey): MerchantDef {
  const def = MERCHANTS.find((m) => m.key === key);
  if (!def) throw new RangeError(`Unknown merchant: ${String(key)}`);
  return def;
}

/** Resolve a page's hostname to its merchant, or null when the page is not allowlisted. */
export function findMerchantByHost(hostname: string): MerchantDef | null {
  const h = hostname.toLowerCase();
  return MERCHANTS.find((m) => (m.hosts as readonly string[]).includes(h)) ?? null;
}
