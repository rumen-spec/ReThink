import type { ProductCategoryKey } from './categories.ts';
import { assertCents } from './money.ts';
import type { BudgetCategory, CartItem, Cents } from './types.ts';

/**
 * Budget consequence of a proposed cart (docs/SPEC.md §9.1).
 * "Hypothetical" fields never touch confirmedSpentCents.
 */
export interface BudgetConsequence {
  allocatedCents: Cents;
  confirmedSpentCents: Cents;
  /** allocated − confirmed. May be negative. */
  remainingCents: Cents;
  /** Over-budget amount that already exists before this cart: max(0, −remaining). */
  existingOverageCents: Cents;
  /** null when any cart item has an unknown price. */
  cartSubtotalCents: Cents | null;
  /** Hypothetical: remaining − subtotal. */
  projectedRemainingCents: Cents | null;
  /** Incremental overage caused by this cart: max(0, subtotal − max(0, remaining)). */
  cartOverageCents: Cents | null;
  /**
   * Precedence: unknown-price → no-budget (allocation 0) → over (projected < 0) → within.
   * "over" also covers a category that is already over budget with an empty cart.
   */
  status: 'within' | 'over' | 'unknown-price' | 'no-budget';
}

/** Sum of known line totals, or null if any item price is unknown ("Partial subtotal", §7.5). */
export function cartSubtotalCents(items: CartItem[]): Cents | null {
  let total = 0;
  for (const item of items) {
    if (item.unitPriceCents === null) return null;
    assertCents(item.unitPriceCents, 'unitPriceCents');
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      throw new TypeError(`quantity must be a non-negative integer, got ${String(item.quantity)}`);
    }
    total += item.unitPriceCents * item.quantity;
  }
  return total;
}

/** One entry per category present in the cart; null when any line in that category has an unknown price. */
export type CategorySubtotals = Partial<Record<ProductCategoryKey, Cents | null>>;

/**
 * Split a (possibly mixed) cart into per-category subtotals, so each budget is compared only
 * against the lines that belong to it. A Fenty cart with lipstick + keychain → beauty: lipstick,
 * other: keychain. Feed each entry to `computeBudgetConsequence` with the budget that
 * `findBudgetCategoryFor` returns for that key (or show "Set a … budget" when it returns null).
 */
export function cartSubtotalsByCategory(items: CartItem[]): CategorySubtotals {
  const groups = new Map<ProductCategoryKey, CartItem[]>();
  for (const item of items) {
    const g = groups.get(item.productCategory);
    if (g) g.push(item);
    else groups.set(item.productCategory, [item]);
  }
  const out: CategorySubtotals = {};
  for (const [key, group] of groups) out[key] = cartSubtotalCents(group);
  return out;
}

export function computeBudgetConsequence(
  category: BudgetCategory,
  cartSubtotal: Cents | null,
): BudgetConsequence {
  const { allocatedCents, confirmedSpentCents } = category;
  assertCents(allocatedCents, 'allocatedCents');
  assertCents(confirmedSpentCents, 'confirmedSpentCents');
  if (cartSubtotal !== null) assertCents(cartSubtotal, 'cartSubtotal');

  const remainingCents = allocatedCents - confirmedSpentCents;
  const existingOverageCents = Math.max(0, -remainingCents);

  if (cartSubtotal === null) {
    return {
      allocatedCents,
      confirmedSpentCents,
      remainingCents,
      existingOverageCents,
      cartSubtotalCents: null,
      projectedRemainingCents: null,
      cartOverageCents: null,
      status: 'unknown-price',
    };
  }

  const projectedRemainingCents = remainingCents - cartSubtotal;
  const cartOverageCents = Math.max(0, cartSubtotal - Math.max(0, remainingCents));
  const status =
    allocatedCents === 0 ? 'no-budget' : projectedRemainingCents < 0 ? 'over' : 'within';

  return {
    allocatedCents,
    confirmedSpentCents,
    remainingCents,
    existingOverageCents,
    cartSubtotalCents: cartSubtotal,
    projectedRemainingCents,
    cartOverageCents,
    status,
  };
}

export interface MonthAvailable {
  /** What is left across every enabled budget. Negative when the month as a whole is overspent. */
  availableCents: Cents;
  allocatedCents: Cents;
  confirmedSpentCents: Cents;
  /** How much of the overspend is dragging the total down, as a positive number. 0 when none. */
  overspentCents: Cents;
}

/**
 * The Home headline: what is left of the money you set aside this month (§5.5).
 *
 * Overspend subtracts. An earlier version floored each budget at zero so one blown budget could not
 * "eat" another, which read as fair but made the headline lie in the user's favour — exactly the
 * blind spot this product exists to remove. If Clothing is $40 over, that $40 is really gone, and
 * the number says so. The per-budget cards still show which one it was.
 *
 * Only enabled budgets count, and only confirmed spending: a cart is never in here (§1.4).
 */
export function monthAvailable(categories: BudgetCategory[]): MonthAvailable {
  let allocatedCents = 0;
  let confirmedSpentCents = 0;
  let overspentCents = 0;

  for (const c of categories) {
    if (!c.enabled) continue;
    assertCents(c.allocatedCents, 'allocatedCents');
    assertCents(c.confirmedSpentCents, 'confirmedSpentCents');
    allocatedCents += c.allocatedCents;
    confirmedSpentCents += c.confirmedSpentCents;
    overspentCents += Math.max(0, c.confirmedSpentCents - c.allocatedCents);
  }

  return { availableCents: allocatedCents - confirmedSpentCents, allocatedCents, confirmedSpentCents, overspentCents };
}

/**
 * Order for the Home "pressing budgets" list (§5.5). Only enabled categories.
 * 1. Over budget (remaining < 0), most-over first.
 * 2. Positive allocation, ascending remaining/allocated ratio.
 * 3. Zero allocation with nothing spent — last; nothing to press on.
 * Ties break by name for a stable order. Never divides by zero.
 */
export function sortPressingBudgets(categories: BudgetCategory[]): BudgetCategory[] {
  const rank = (c: BudgetCategory) => {
    const remaining = c.allocatedCents - c.confirmedSpentCents;
    if (remaining < 0) return { group: 0, key: remaining };
    if (c.allocatedCents === 0) return { group: 2, key: 0 };
    return { group: 1, key: remaining / c.allocatedCents };
  };
  return categories
    .filter((c) => c.enabled)
    .map((c) => ({ c, r: rank(c) }))
    .sort((a, b) => a.r.group - b.r.group || a.r.key - b.r.key || a.c.name.localeCompare(b.c.name))
    .map(({ c }) => c);
}
