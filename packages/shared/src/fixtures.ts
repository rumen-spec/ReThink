import type { BudgetCategory, CartSnapshot, SavingsPlan } from './types';

/**
 * THE demo fixture (docs/SPEC.md §9.3). Used by unit tests and mirrored by supabase/seed.sql.
 * If you change a number here, change the seed too.
 *
 * Clothing $200 allocated, $135 confirmed → $65 remaining.
 * Cart: hoodie $148 + leggings $98 = $246 → $181 over.
 * Hoodie alone: $148 → $83 over; next $300 contribution becomes $217 for one month.
 */
export const FIXTURE_OWNER_NAME = 'Alex';

export const FIXTURE_CATEGORIES: BudgetCategory[] = [
  { id: 'cat-clothing', name: 'Clothing', allocatedCents: 20_000, confirmedSpentCents: 13_500, enabled: true },
  { id: 'cat-entertainment', name: 'Entertainment', allocatedCents: 15_000, confirmedSpentCents: 7_000, enabled: true },
  { id: 'cat-food', name: 'Food', allocatedCents: 25_000, confirmedSpentCents: 9_000, enabled: true },
  { id: 'cat-transport', name: 'Transport', allocatedCents: 10_000, confirmedSpentCents: 2_500, enabled: true },
];

export const FIXTURE_SAVINGS_PLAN: SavingsPlan = {
  openingBalanceCents: 100_000,
  monthlyContributionCents: 30_000,
  illustrativeRateAnnual: 0,
  horizonMonths: 120,
};

export const FIXTURE_HOODIE_PRICE_CENTS = 14_800;
export const FIXTURE_LEGGINGS_PRICE_CENTS = 9_800;

export const FIXTURE_CART: CartSnapshot = {
  cartId: 'cart_fixture_lululemon',
  merchantKey: 'lululemon-ca',
  sessionId: 'session_fixture',
  currency: 'CAD',
  source: 'retailer-detected',
  syncQuality: 'complete',
  items: [
    { productKey: 'hoodie-1', variantKey: 'black-m', title: 'Scuba Oversized Hoodie', unitPriceCents: FIXTURE_HOODIE_PRICE_CENTS, quantity: 1 },
    { productKey: 'leggings-1', variantKey: 'black-6', title: 'Align High-Rise Pant', unitPriceCents: FIXTURE_LEGGINGS_PRICE_CENTS, quantity: 1 },
  ],
  subtotalCents: 24_600,
  includesTax: false,
  includesShipping: false,
  discountStatus: 'unknown',
  observedAt: '2026-11-21T19:00:00Z',
  version: 1,
};

/** Masonville Place, London ON. PLACEHOLDER — verify on-map before build/demo (§5.8). */
export const FIXTURE_HOTSPOT_UNVERIFIED = {
  name: 'Masonville Place',
  radiusM: 250,
  verified: false as const,
};
