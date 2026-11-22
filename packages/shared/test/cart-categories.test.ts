import { describe, expect, it } from 'vitest';
import { cartSubtotalsByCategory, computeBudgetConsequence } from '../src/budget.ts';
import { findBudgetCategoryFor } from '../src/categories.ts';
import { FIXTURE_CART, FIXTURE_CATEGORIES } from '../src/fixtures.ts';
import type { CartItem } from '../src/types.ts';

const line = (over: Partial<CartItem>): CartItem => ({
  productKey: 'p',
  variantKey: null,
  title: 'x',
  unitPriceCents: 1_000,
  quantity: 1,
  productCategory: 'clothing',
  ...over,
});

describe('cartSubtotalsByCategory', () => {
  it('fixture cart is all clothing → { clothing: 24_600 }', () => {
    expect(cartSubtotalsByCategory(FIXTURE_CART.items)).toEqual({ clothing: 24_600 });
  });
  it('a mixed Fenty cart splits lipstick from a keychain (keychain → other, never dropped)', () => {
    expect(cartSubtotalsByCategory([
      line({ productKey: 'lipstick', unitPriceCents: 2_900, productCategory: 'beauty' }),
      line({ productKey: 'serum', unitPriceCents: 4_500, quantity: 2, productCategory: 'beauty' }),
      line({ productKey: 'keychain', unitPriceCents: 1_500, productCategory: 'other' }),
    ])).toEqual({ beauty: 11_900, other: 1_500 });
  });
  it('an unknown price only blanks the category it belongs to', () => {
    expect(cartSubtotalsByCategory([
      line({ productKey: 'a', productCategory: 'clothing', unitPriceCents: null }),
      line({ productKey: 'b', productCategory: 'beauty', unitPriceCents: 2_000 }),
    ])).toEqual({ clothing: null, beauty: 2_000 });
  });
  it('each category is then compared only against its own budget', () => {
    const r = cartSubtotalsByCategory([
      line({ productKey: 'hoodie', unitPriceCents: 14_800, productCategory: 'clothing' }),
      line({ productKey: 'lipstick', unitPriceCents: 2_900, productCategory: 'beauty' }),
      line({ productKey: 'keychain', unitPriceCents: 1_500, productCategory: 'other' }),
    ]);
    const clothing = computeBudgetConsequence(findBudgetCategoryFor(FIXTURE_CATEGORIES, 'clothing')!, r.clothing!);
    const beauty = computeBudgetConsequence(findBudgetCategoryFor(FIXTURE_CATEGORIES, 'beauty')!, r.beauty!);
    const other = computeBudgetConsequence(findBudgetCategoryFor(FIXTURE_CATEGORIES, 'other')!, r.other!);
    expect(clothing.cartOverageCents).toBe(8_300); // $148 vs $65 left
    expect(beauty.status).toBe('within'); // $29 vs $60 left
    expect(other.projectedRemainingCents).toBe(3_500); // $15 vs $50 left
  });
  it('a category with no enabled budget resolves to null → UI prompts "Set a … budget"', () => {
    expect(findBudgetCategoryFor(FIXTURE_CATEGORIES, 'electronics')).toBeNull();
  });
});
