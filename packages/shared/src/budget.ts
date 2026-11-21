import type { BudgetCategory, CartItem, Cents } from './types';

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
  status: 'within' | 'over' | 'unknown-price' | 'no-budget';
}

/** Sum of known line totals, or null if any item price is unknown ("Partial subtotal", §7.5). */
export function cartSubtotalCents(items: CartItem[]): Cents | null {
  throw new Error('TODO(block-1): implement — see docs/PLAN.md');
}

export function computeBudgetConsequence(
  category: BudgetCategory,
  cartSubtotal: Cents | null,
): BudgetConsequence {
  throw new Error('TODO(block-1): implement per §9.1 — keep existing and incremental overage separate');
}

/**
 * Order for the Home "pressing budgets" list (§5.5):
 * over-budget first, then ascending remaining/allocated; zero-allocation categories
 * get a defined place without dividing by zero. Only enabled categories.
 */
export function sortPressingBudgets(categories: BudgetCategory[]): BudgetCategory[] {
  throw new Error('TODO(block-1): implement per §5.5');
}
