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
