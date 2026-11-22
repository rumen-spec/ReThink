import { describe, expect, it } from 'vitest';
import { AI_THRESHOLD, classifyProduct } from '../src/classify.ts';
import { isSubtypeOf } from '../src/categories.ts';
import type { ClassificationContext } from '../src/types.ts';

const ctx = (over: Partial<ClassificationContext>): ClassificationContext => ({
  merchantKey: 'alo-ca',
  title: 'Product',
  urlPath: '/products/product',
  ...over,
});

describe('classifyProduct — the demo paths', () => {
  it('routes an Alo hoodie to clothing/tops with confidence', () => {
    const r = classifyProduct(
      ctx({
        merchantKey: 'alo-ca',
        title: 'Accolade Hoodie',
        productType: 'Hoodies',
        tags: ['womens', 'sweatshirts'],
        breadcrumbs: ['Women', 'Tops', 'Hoodies'],
        optionNames: ['Size', 'Color'],
        optionValues: ['XS', 'S', 'M'],
        urlPath: '/en-ca/products/accolade-hoodie',
      }),
    );
    expect(r.category).toBe('clothing');
    expect(r.subtype).toBe('tops');
    expect(r.confidence).toBeGreaterThanOrEqual(AI_THRESHOLD);
    expect(r.needsAi).toBe(false);
  });

  it('routes a Fenty lip gloss to beauty/makeup, not to clothing', () => {
    const r = classifyProduct(
      ctx({
        merchantKey: 'fenty-beauty-ca',
        title: 'Gloss Bomb Universal Lip Luminizer',
        productType: 'Lip Gloss',
        tags: ['lip', 'makeup'],
        breadcrumbs: ['Makeup', 'Lip'],
        optionNames: ['Shade'],
        optionValues: ['fenty glow', 'fu$$y'],
        urlPath: '/en-ca/products/gloss-bomb-universal-lip-luminizer',
      }),
    );
    expect(r.category).toBe('beauty');
    expect(r.subtype).toBe('makeup');
    expect(r.needsAi).toBe(false);
  });

  it('lets a clothing product out-vote a beauty store prior (mixed catalog)', () => {
    const r = classifyProduct(
      ctx({
        merchantKey: 'fenty-beauty-ca',
        title: 'Fenty Beauty Logo Hoodie',
        productType: 'Apparel',
        tags: ['merch', 'hoodie'],
        breadcrumbs: ['Merch', 'Apparel'],
        optionNames: ['Size'],
        optionValues: ['S', 'M', 'L'],
        urlPath: '/en-ca/products/fenty-logo-hoodie',
      }),
    );
    expect(r.category).toBe('clothing');
  });

  it('keeps a keychain on a beauty store out of the beauty budget', () => {
    const r = classifyProduct(
      ctx({
        merchantKey: 'fenty-beauty-ca',
        title: 'Enamel Keychain',
        productType: 'Accessories',
        tags: ['gift'],
        urlPath: '/en-ca/products/enamel-keychain',
      }),
    );
    // Either it lands on a non-beauty category or it asks the model; it must not silently be beauty.
    expect(r.category === 'beauty' && !r.needsAi).toBe(false);
  });
});

describe('classifyProduct — guardrails', () => {
  it('never returns a null category and never an invalid subtype', () => {
    const r = classifyProduct(ctx({ merchantKey: 'ovo-ca', title: 'Mystery Item', urlPath: '/products/mystery' }));
    expect(typeof r.category).toBe('string');
    expect(isSubtypeOf(r.category, r.subtype)).toBe(true);
  });

  it('asks for the model when nothing on the page votes', () => {
    const r = classifyProduct(ctx({ merchantKey: 'ovo-ca', title: 'Item 1234', urlPath: '/products/item-1234' }));
    expect(r.category).toBe('other');
    expect(r.needsAi).toBe(true);
  });

  it('does not fire on words that merely contain a keyword', () => {
    const r = classifyProduct(ctx({ merchantKey: 'ovo-ca', title: 'Shortbread Tin', productType: 'Food', urlPath: '/products/shortbread-tin' }));
    expect(r.reasons.join(' ')).not.toContain('short');
  });

  it('uses a single-category store prior when the page is otherwise quiet', () => {
    const r = classifyProduct(ctx({ merchantKey: 'alo-ca', title: 'Item 9', urlPath: '/en-ca/products/item-9' }));
    expect(r.category).toBe('clothing');
    expect(r.needsAi).toBe(true); // prior alone is not enough to show a number
  });

  it('reads a size option as apparel even on a store with no prior', () => {
    const r = classifyProduct(
      ctx({ merchantKey: 'lululemon-ca', title: 'Align Short 6"', optionNames: ['Size'], optionValues: ['2', 'S', 'M'], urlPath: '/en-ca/p/align-short/123.html' }),
    );
    expect(r.category).toBe('clothing');
    expect(r.subtype).toBe('bottoms');
  });

  it('is deterministic: the same context classifies the same way twice', () => {
    const c = ctx({ merchantKey: 'alo-ca', title: 'Airlift Legging', productType: 'Leggings', urlPath: '/en-ca/products/airlift-legging' });
    expect(classifyProduct(c)).toEqual(classifyProduct(c));
  });
});
