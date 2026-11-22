import { describe, expect, it } from 'vitest';
import { cartSubtotalCents, computeBudgetConsequence, monthAvailable, sortPressingBudgets } from '../src/budget.ts';
import { FIXTURE_CART, FIXTURE_CATEGORIES, FIXTURE_HOODIE_PRICE_CENTS } from '../src/fixtures.ts';
import type { BudgetCategory } from '../src/types.ts';

const clothing = FIXTURE_CATEGORIES.find((c) => c.name === 'Clothing')!;
const cat = (over: Partial<BudgetCategory>): BudgetCategory => ({
  id: over.name ?? 'x',
  name: 'X',
  allocatedCents: 10_000,
  confirmedSpentCents: 0,
  enabled: true,
  ...over,
});

describe('cartSubtotalCents', () => {
  it('sums unitPrice × quantity for the fixture cart → 24_600', () => {
    expect(cartSubtotalCents(FIXTURE_CART.items)).toBe(24_600);
    expect(cartSubtotalCents(FIXTURE_CART.items)).toBe(FIXTURE_CART.subtotalCents);
  });
  it('multiplies by quantity', () => {
    expect(cartSubtotalCents([{ ...FIXTURE_CART.items[0]!, quantity: 3 }])).toBe(44_400);
  });
  it('empty cart → 0', () => {
    expect(cartSubtotalCents([])).toBe(0);
  });
  it('returns null when any item price is unknown', () => {
    expect(cartSubtotalCents([...FIXTURE_CART.items, { ...FIXTURE_CART.items[0]!, unitPriceCents: null }])).toBeNull();
  });
  it('rejects float prices and bad quantities', () => {
    expect(() => cartSubtotalCents([{ ...FIXTURE_CART.items[0]!, unitPriceCents: 148.5 }])).toThrow(TypeError);
    expect(() => cartSubtotalCents([{ ...FIXTURE_CART.items[0]!, quantity: -1 }])).toThrow(TypeError);
  });
});

describe('computeBudgetConsequence', () => {
  it('fixture: $200 / $135 / hoodie $148 → remaining 6_500, projected −8_300, overage 8_300, status over', () => {
    expect(computeBudgetConsequence(clothing, FIXTURE_HOODIE_PRICE_CENTS)).toEqual({
      allocatedCents: 20_000,
      confirmedSpentCents: 13_500,
      remainingCents: 6_500,
      existingOverageCents: 0,
      cartSubtotalCents: 14_800,
      projectedRemainingCents: -8_300,
      cartOverageCents: 8_300,
      status: 'over',
    });
  });
  it('fixture full cart $246 → $181 over', () => {
    const r = computeBudgetConsequence(clothing, 24_600);
    expect(r.cartOverageCents).toBe(18_100);
    expect(r.projectedRemainingCents).toBe(-18_100);
  });
  it('within budget: $65 remaining, $40 cart → overage 0, status within', () => {
    const r = computeBudgetConsequence(clothing, 4_000);
    expect(r.cartOverageCents).toBe(0);
    expect(r.projectedRemainingCents).toBe(2_500);
    expect(r.status).toBe('within');
  });
  it('exactly spending the remainder is within', () => {
    expect(computeBudgetConsequence(clothing, 6_500).status).toBe('within');
  });
  it('already over budget: reports existing and incremental overage separately, never collapsed', () => {
    const r = computeBudgetConsequence(cat({ allocatedCents: 10_000, confirmedSpentCents: 12_000 }), 5_000);
    expect(r.remainingCents).toBe(-2_000);
    expect(r.existingOverageCents).toBe(2_000);
    expect(r.cartOverageCents).toBe(5_000);
    expect(r.projectedRemainingCents).toBe(-7_000);
    expect(r.status).toBe('over');
  });
  it('already over with an empty cart is still over, with no incremental overage', () => {
    const r = computeBudgetConsequence(cat({ allocatedCents: 10_000, confirmedSpentCents: 12_000 }), 0);
    expect(r.cartOverageCents).toBe(0);
    expect(r.status).toBe('over');
  });
  it('zero allocation → status no-budget, no division by zero', () => {
    const r = computeBudgetConsequence(cat({ allocatedCents: 0 }), 4_000);
    expect(r.status).toBe('no-budget');
    expect(r.cartOverageCents).toBe(4_000);
    expect(Number.isFinite(r.projectedRemainingCents)).toBe(true);
  });
  it('unknown subtotal → status unknown-price, numeric fields null', () => {
    const r = computeBudgetConsequence(clothing, null);
    expect(r.status).toBe('unknown-price');
    expect(r.cartSubtotalCents).toBeNull();
    expect(r.projectedRemainingCents).toBeNull();
    expect(r.cartOverageCents).toBeNull();
    expect(r.remainingCents).toBe(6_500);
  });
  it('never mutates confirmed spending (§1.4 rule 1)', () => {
    const before = { ...clothing };
    computeBudgetConsequence(clothing, 24_600);
    expect(clothing).toEqual(before);
  });
});

describe('sortPressingBudgets', () => {
  it('fixture order: Clothing (32.5% left) then Entertainment (53%)', () => {
    expect(sortPressingBudgets(FIXTURE_CATEGORIES).map((c) => c.name).slice(0, 2)).toEqual([
      'Clothing',
      'Entertainment',
    ]);
  });
  it('over-budget categories come first, most-over first', () => {
    const r = sortPressingBudgets([
      cat({ name: 'A', allocatedCents: 10_000, confirmedSpentCents: 1_000 }),
      cat({ name: 'B', allocatedCents: 10_000, confirmedSpentCents: 10_500 }),
      cat({ name: 'C', allocatedCents: 10_000, confirmedSpentCents: 13_000 }),
    ]);
    expect(r.map((c) => c.name)).toEqual(['C', 'B', 'A']);
  });
  it('then ascending remaining/allocated ratio', () => {
    const r = sortPressingBudgets([
      cat({ name: 'Big', allocatedCents: 100_000, confirmedSpentCents: 50_000 }), // 50%
      cat({ name: 'Small', allocatedCents: 10_000, confirmedSpentCents: 8_000 }), // 20%
    ]);
    expect(r.map((c) => c.name)).toEqual(['Small', 'Big']);
  });
  it('zero-allocation categories: spent → over group; unspent → last', () => {
    const r = sortPressingBudgets([
      cat({ name: 'ZeroUnspent', allocatedCents: 0 }),
      cat({ name: 'Normal', allocatedCents: 10_000, confirmedSpentCents: 9_000 }),
      cat({ name: 'ZeroSpent', allocatedCents: 0, confirmedSpentCents: 500 }),
    ]);
    expect(r.map((c) => c.name)).toEqual(['ZeroSpent', 'Normal', 'ZeroUnspent']);
  });
  it('disabled categories are excluded', () => {
    const r = sortPressingBudgets([cat({ name: 'On' }), cat({ name: 'Off', enabled: false })]);
    expect(r.map((c) => c.name)).toEqual(['On']);
  });
  it('does not mutate the input array', () => {
    const input = [...FIXTURE_CATEGORIES];
    sortPressingBudgets(input);
    expect(input).toEqual(FIXTURE_CATEGORIES);
  });
});

describe('monthAvailable', () => {
  it('sums what is left across the seeded budgets', () => {
    // 65 + 60 + 80 + 160 + 75 + 50
    expect(monthAvailable(FIXTURE_CATEGORIES).availableCents).toBe(49_000);
  });

  it('lets an overspent budget drag the total down instead of flooring it', () => {
    const over = monthAvailable([
      cat({ name: 'Clothing', allocatedCents: 20_000, confirmedSpentCents: 24_000 }),
      cat({ name: 'Beauty', allocatedCents: 8_000, confirmedSpentCents: 2_000 }),
    ]);
    // $40 over on Clothing, $60 left on Beauty → $20 really left, not $60.
    expect(over.availableCents).toBe(2_000);
    expect(over.overspentCents).toBe(4_000);
  });

  it('goes negative when the whole month is overspent', () => {
    const r = monthAvailable([cat({ allocatedCents: 10_000, confirmedSpentCents: 15_000 })]);
    expect(r.availableCents).toBe(-5_000);
  });

  it('counts only enabled budgets', () => {
    const r = monthAvailable([
      cat({ name: 'On', allocatedCents: 10_000, confirmedSpentCents: 2_000 }),
      cat({ name: 'Off', allocatedCents: 50_000, confirmedSpentCents: 0, enabled: false }),
    ]);
    expect(r.availableCents).toBe(8_000);
    expect(r.allocatedCents).toBe(10_000);
  });

  it('is zero for no budgets, and reports no overspend', () => {
    expect(monthAvailable([])).toEqual({ availableCents: 0, allocatedCents: 0, confirmedSpentCents: 0, overspentCents: 0 });
  });
});
