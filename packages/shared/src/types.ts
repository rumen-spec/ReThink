/**
 * Canonical contracts shared by the extension, the iOS app and the backend.
 * Mirrors docs/SPEC.md §11 (entities) and §12 (wire contracts).
 *
 * Invariant: every money field is an integer number of CAD cents.
 * Unknown amounts are `null`, never 0.
 */

/** Integer CAD cents. */
export type Cents = number;

export type Currency = 'CAD';

import type { ProductCategoryKey, ProductSubtype } from './categories.ts';
import type { MerchantKey } from './merchants.ts';

// Product categories (`clothing`, `beauty`, …) and merchants are registries, not unions:
// see ./categories.ts and ./merchants.ts. Add entries there; never hardcode either in an app.
export type { ProductCategoryKey, ProductSubtype, ClothingSubtype, BeautySubtype } from './categories.ts';
export type { MerchantKey } from './merchants.ts';

/** Where a price was observed. Gemini alone never verifies an amount (§1.4 rule 4). */
export type PriceSource = 'structured-metadata' | 'dom' | 'user-entry' | 'gemini';

export type PriceConfidence = 'verified' | 'needs_confirmation' | 'unknown';

/** §12.1 — output of the product detector. */
export interface NormalizedProduct {
  merchantKey: MerchantKey;
  productKey: string;
  variantKey: string | null;
  canonicalUrl: string;
  title: string;
  /** null when the page did not expose a verifiable price. */
  priceCents: Cents | null;
  currency: Currency | string;
  category: ProductCategoryKey;
  subtype: ProductSubtype;
  imageUrl?: string;
  source: PriceSource;
  confidence: PriceConfidence;
  /** ISO-8601 UTC. */
  observedAt: string;
}

export type CartSource = 'retailer-detected' | 'manual-consideration';

export type CartSyncQuality = 'complete' | 'partial' | 'manual' | 'stale' | 'unavailable';

export interface CartItem {
  productKey: string;
  variantKey: string | null;
  title: string;
  /** null when unknown → subtotal becomes "partial" and impact is disabled. */
  unitPriceCents: Cents | null;
  quantity: number;
  imageUrl?: string;
  source?: CartSource;
  confidence?: PriceConfidence;
}

/** §12.2 — proposed items only. Never an actual expense. */
export interface CartSnapshot {
  cartId: string;
  merchantKey: MerchantKey;
  sessionId: string;
  currency: Currency | string;
  source: CartSource;
  syncQuality: CartSyncQuality;
  items: CartItem[];
  subtotalCents: Cents | null;
  includesTax: boolean;
  includesShipping: boolean;
  discountStatus: 'unknown' | 'none' | 'applied';
  observedAt: string;
  /** Monotonic per cart; older versions are ignored by the server (§13.3). */
  version: number;
}

/** §12.3 — P0 event types. */
export type SpendingEventType =
  | 'CART_UPDATED'
  | 'PURCHASE_CONFIRMED'
  | 'BUDGET_UPDATED'
  | 'HOTSPOT_ENTERED'
  | 'HOTSPOT_SIMULATED'
  | 'DEVICE_PAIRED'
  | 'DEVICE_REVOKED'
  | 'TEST_NOTIFICATION';

export type EventSource = 'browser' | 'ios-owner' | 'ios-trigger' | 'server';

export interface EventEnvelope<P = Record<string, unknown>> {
  /** Client-generated UUID v4. Doubles as the idempotency key. */
  eventId: string;
  type: SpendingEventType;
  source: EventSource;
  /** Server-registered device id. An identifier, never a credential. */
  deviceId: string;
  occurredAt: string;
  /** Must be true for anything produced by a demo control (§1.4 rule 7). */
  isSimulated: boolean;
  payload: P;
}

export type DeviceRole = 'owner' | 'browser' | 'trigger';

export interface BudgetCategory {
  id: string;
  name: string;
  allocatedCents: Cents;
  /** Sum of confirmed expenses for the active period. Never includes cart items. */
  confirmedSpentCents: Cents;
  enabled: boolean;
  /**
   * Which detected products land here. Absent for dashboard-only categories (Food, Transport…).
   * At most one enabled category per key per period (DB-enforced); the extension shows
   * "Set a … budget" if none. Resolve with `findBudgetCategoryFor`, never by name.
   */
  productCategory?: ProductCategoryKey;
}

/** Illustrative nominal annual rates offered in the UI (§5.7). 0 is the default. */
export type IllustrativeRate = 0 | 0.05 | 0.07 | 0.1;

export interface SavingsPlan {
  openingBalanceCents: Cents;
  monthlyContributionCents: Cents;
  illustrativeRateAnnual: IllustrativeRate;
  horizonMonths: number;
}

export interface Hotspot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  categoryId: string;
  enabled: boolean;
  snoozedUntil: string | null;
}

/**
 * §15 — sanitized context sent to the classify-product edge function. Store-level signals plus
 * product signals narrow Gemini's answer; no cookies, no page HTML, no browsing history.
 * Built from JSON-LD, Shopify `/products/<handle>.js` and the URL path. Only merchantKey, title
 * and urlPath are required, so non-Shopify pages (Lululemon) can still use it.
 * The store-level prior (`defaultCategory`, `mixedCatalog`) is looked up server-side from
 * `MERCHANTS` by `merchantKey`; the client doesn't get to assert it.
 */
export interface ClassificationContext {
  merchantKey: MerchantKey;
  /** Shopify `vendor`, else JSON-LD `brand.name`. */
  vendor?: string;
  title: string;
  /** Shopify `product_type` verbatim (e.g. "Women:Bottoms:Shorts", "Hoodies", "Womens", "ACCESSORIES"). A hint, never decisive. */
  productType?: string;
  /** Shopify tags, filtered to ≤ 20 and stripped of internal-looking tags. */
  tags?: string[];
  /** JSON-LD `category` or breadcrumb trail, e.g. ["Women", "Bottoms", "Shorts"]. */
  breadcrumbs?: string[];
  /** Variant option names, e.g. ["Size", "Color"]. A "Size" option is a strong apparel signal. */
  optionNames?: string[];
  /** Up to 10 distinct option values, e.g. ["XS", "S", "M"]. */
  optionValues?: string[];
  /** Path only, no query string: "/products/w6334r-match-point-short". */
  urlPath: string;
  /** First 300 chars of plain-text description. */
  descriptionSnippet?: string;
}

/** §15.2 — constrained Gemini output. Reject anything outside this shape. */
export interface GeminiClassification {
  isProductPage: boolean;
  /** null = a product, but not one we budget (e.g. a keychain on a beauty store). Validate with `isProductCategoryKey`. */
  category: ProductCategoryKey | null;
  /** Must belong to `category` (`isSubtypeOf`); the server rejects mismatches. */
  subtype: ProductSubtype | null;
  normalizedTitle: string;
  /** Unverified until corroborated by DOM/metadata or edited by the user. */
  suggestedPriceCents: Cents | null;
  suggestedCurrency: string;
  confidence: number;
  requiresUserConfirmation: boolean;
  reasonCode: string;
}
