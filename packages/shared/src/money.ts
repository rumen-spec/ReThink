import type { Cents } from './types';

/** Throws unless `value` is a finite integer. Use at every boundary where money enters. */
export function assertCents(value: unknown, label = 'amount'): asserts value is Cents {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer number of cents, got ${String(value)}`);
  }
}

export interface FormatCadOptions {
  /** Append " CAD". Default false. */
  showCode?: boolean;
  /** Prefix positive values with "+". Default false. */
  signed?: boolean;
}

/**
 * The one display format for money: "$148.00" or "$148.00 CAD" (§9.4).
 * Negative values render as "-$83.00"; prefer explicit copy ("$83 over budget") in heroes.
 */
export function formatCad(cents: Cents, options: FormatCadOptions = {}): string {
  assertCents(cents);
  const { showCode = false, signed = false } = options;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-CA');
  const fraction = String(abs % 100).padStart(2, '0');
  const sign = cents < 0 ? '-' : signed && cents > 0 ? '+' : '';
  return `${sign}$${dollars}.${fraction}${showCode ? ' CAD' : ''}`;
}

/**
 * Parse user-typed dollars into cents: "148", "148.5", "$1,480.00", "148 CAD".
 * Returns null for anything invalid (negative, NaN, more than 2 decimals) — the UI
 * should keep Continue disabled rather than guess (§5.3).
 */
export function parseCadToCents(input: string): Cents | null {
  const cleaned = input.trim().replace(/[$,\s]/g, '').replace(/CAD$/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
