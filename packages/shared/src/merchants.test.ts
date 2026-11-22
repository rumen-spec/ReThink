import { describe, expect, it } from 'vitest';
import { isProductCategoryKey } from './categories.ts';
import { FIXTURE_CART } from './fixtures.ts';
import { MERCHANTS, MERCHANT_HOSTS, findMerchantByHost, getMerchant, isMerchantKey } from './merchants.ts';

describe('MERCHANTS registry', () => {
  it('has unique keys and no host claimed by two merchants', () => {
    const keys = MERCHANTS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(MERCHANT_HOSTS).size).toBe(MERCHANT_HOSTS.length);
  });
  it('hosts are bare lowercase hostnames and cadRoot is a slash-wrapped path', () => {
    for (const m of MERCHANTS) {
      for (const h of m.hosts) expect(h).toMatch(/^[a-z0-9.-]+$/);
      expect(m.cadRoot).toMatch(/^\/([a-z-]+\/)?$/);
    }
  });
  it('every defaultCategory is a registry key', () => {
    for (const m of MERCHANTS) if (m.defaultCategory) expect(isProductCategoryKey(m.defaultCategory)).toBe(true);
  });
  it('only Shopify stores can have an automatic cart mirror', () => {
    for (const m of MERCHANTS) if (m.cartMirror === 'auto') expect(m.platform).toBe('shopify');
  });
  it('the demo tier covers both demoed categories', () => {
    const demo = MERCHANTS.filter((m) => m.tier === 'demo').map((m) => m.defaultCategory);
    expect(demo).toContain('clothing');
    expect(demo).toContain('beauty');
  });
  it('the fixture cart belongs to an auto-mirror merchant', () => {
    expect(getMerchant(FIXTURE_CART.merchantKey).cartMirror).toBe('auto');
  });
});

describe('lookups', () => {
  it('findMerchantByHost is case-insensitive and null off-allowlist', () => {
    expect(findMerchantByHost('WWW.ALOYOGA.COM')?.key).toBe('alo-ca');
    expect(findMerchantByHost('shop.lululemon.com')?.cartMirror).toBe('manual');
    expect(findMerchantByHost('www.nike.com')).toBeNull();
  });
  it('isMerchantKey accepts registry keys only', () => {
    expect(isMerchantKey('fenty-beauty-ca')).toBe(true);
    expect(isMerchantKey('nike-ca')).toBe(false);
  });
});
