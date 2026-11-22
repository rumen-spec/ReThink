import { describe, expect, it } from 'vitest';
import {
  DEMO_PRODUCT_CATEGORY_KEYS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_KEYS,
  colorForBudget,
  findBudgetCategoryFor,
  getProductCategory,
  isProductCategoryKey,
  isSubtypeOf,
} from '../src/categories.ts';
import { FIXTURE_CATEGORIES } from '../src/fixtures.ts';

describe('PRODUCT_CATEGORIES registry', () => {
  it('has six categories in the validated display order', () => {
    expect(PRODUCT_CATEGORIES.map((c) => c.key)).toEqual([
      'clothing', 'beauty', 'home', 'electronics', 'entertainment', 'other',
    ]);
    const keys = PRODUCT_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z-]*$/);
  });
  it('every category has a label, a scope sentence, keywords, and ends its subtypes with "other"', () => {
    for (const c of PRODUCT_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.scope.length).toBeGreaterThan(10);
      if (c.key !== 'other') expect(c.keywords.length).toBeGreaterThan(0);
      expect(c.subtypes.at(-1)).toBe('other');
      expect(new Set(c.subtypes).size).toBe(c.subtypes.length);
    }
  });
  it('every category has distinct dark and light hex colours; other is muted ink', () => {
    const darks = PRODUCT_CATEGORIES.map((c) => c.color.dark);
    expect(new Set(darks).size).toBe(darks.length);
    for (const c of PRODUCT_CATEGORIES) {
      expect(c.color.dark).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.color.light).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(getProductCategory('other').color.dark).toBe('#8FA09B');
    expect(colorForBudget({ productCategory: 'beauty' })).toBe('#D55181');
    expect(colorForBudget({ productCategory: undefined })).toBe('#8FA09B'); // Food / Transport
  });
  it('demo keys are a subset of the registry', () => {
    for (const k of DEMO_PRODUCT_CATEGORY_KEYS) expect(PRODUCT_CATEGORY_KEYS).toContain(k);
  });
  it('clothing subtypes match spec §7.2', () => {
    expect([...getProductCategory('clothing').subtypes]).toEqual([
      'tops', 'bottoms', 'outerwear', 'footwear', 'accessories', 'other',
    ]);
  });
});

describe('validators', () => {
  it('isProductCategoryKey accepts registry keys only', () => {
    expect(isProductCategoryKey('clothing')).toBe(true);
    expect(isProductCategoryKey('beauty')).toBe(true);
    expect(isProductCategoryKey('Clothing')).toBe(false);
    expect(isProductCategoryKey('food')).toBe(false);
    expect(isProductCategoryKey(null)).toBe(false);
  });
  it('isSubtypeOf scopes subtypes to their category', () => {
    expect(isSubtypeOf('clothing', 'footwear')).toBe(true);
    expect(isSubtypeOf('beauty', 'footwear')).toBe(false);
    expect(isSubtypeOf('beauty', 'lipstick')).toBe(false);
    expect(isSubtypeOf('beauty', 'makeup')).toBe(true);
  });
  it('getProductCategory throws on an unknown key', () => {
    expect(() => getProductCategory('toys' as never)).toThrow(RangeError);
  });
});

describe('findBudgetCategoryFor', () => {
  it('routes fixture products to Clothing and Beauty by key, not by name', () => {
    expect(findBudgetCategoryFor(FIXTURE_CATEGORIES, 'clothing')?.id).toBe('cat-clothing');
    expect(findBudgetCategoryFor(FIXTURE_CATEGORIES, 'beauty')?.id).toBe('cat-beauty');
  });
  it('returns null when no enabled budget exists for the key → "Set a … budget"', () => {
    expect(findBudgetCategoryFor(FIXTURE_CATEGORIES, 'electronics')).toBeNull();
    const disabled = FIXTURE_CATEGORIES.map((c) => (c.id === 'cat-beauty' ? { ...c, enabled: false } : c));
    expect(findBudgetCategoryFor(disabled, 'beauty')).toBeNull();
  });
  it('ignores a category whose name matches but has no productCategory link', () => {
    const renamed = [{ ...FIXTURE_CATEGORIES[3]!, name: 'Electronics' }];
    expect(findBudgetCategoryFor(renamed, 'electronics')).toBeNull();
  });
});
