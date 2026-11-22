import { describe, expect, it } from 'vitest';
import { assertCents, formatCad, parseCadToCents } from './money.ts';

describe('formatCad', () => {
  it('formats cents with two decimals', () => {
    expect(formatCad(14_800)).toBe('$148.00');
    expect(formatCad(5)).toBe('$0.05');
    expect(formatCad(0)).toBe('$0.00');
  });
  it('adds thousands separators and the currency code on request', () => {
    expect(formatCad(1_234_567, { showCode: true })).toBe('$12,345.67 CAD');
  });
  it('renders negatives and optional plus sign', () => {
    expect(formatCad(-8_300)).toBe('-$83.00');
    expect(formatCad(8_300, { signed: true })).toBe('+$83.00');
  });
  it('rejects non-integer input', () => {
    expect(() => formatCad(1.5)).toThrow(TypeError);
    expect(() => assertCents(NaN)).toThrow(TypeError);
  });
});

describe('parseCadToCents', () => {
  it('parses common user input', () => {
    expect(parseCadToCents('148')).toBe(14_800);
    expect(parseCadToCents('148.5')).toBe(14_850);
    expect(parseCadToCents('$1,480.00')).toBe(148_000);
    expect(parseCadToCents(' 65 CAD ')).toBe(6_500);
    expect(parseCadToCents('0')).toBe(0);
  });
  it('returns null for invalid input (§5.3 validations)', () => {
    expect(parseCadToCents('-5')).toBeNull();
    expect(parseCadToCents('abc')).toBeNull();
    expect(parseCadToCents('1.234')).toBeNull();
    expect(parseCadToCents('')).toBeNull();
  });
});
