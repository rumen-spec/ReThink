import { describe, it } from 'vitest';

// Block 1 — turn these into real tests as budget.ts is implemented (docs/SPEC.md §9.1, §9.3).
describe('cartSubtotalCents', () => {
  it.todo('sums unitPrice × quantity for the fixture cart → 24_600');
  it.todo('returns null when any item price is unknown');
});

describe('computeBudgetConsequence', () => {
  it.todo('fixture: $200 / $135 / hoodie $148 → remaining 6_500, projected −8_300, overage 8_300, status over');
  it.todo('within budget: $65 remaining, $40 cart → overage 0, status within');
  it.todo('already over budget: reports existing and incremental overage separately, never collapsed');
  it.todo('zero allocation → status no-budget, no division by zero');
  it.todo('unknown subtotal → status unknown-price, numeric fields null');
});

describe('sortPressingBudgets', () => {
  it.todo('over-budget categories come first');
  it.todo('then ascending remaining/allocated ratio');
  it.todo('zero-allocation categories have a defined position');
  it.todo('disabled categories are excluded');
});
