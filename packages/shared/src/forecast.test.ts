import { describe, expect, it } from 'vitest';
import { projectSavings } from './forecast.ts';
import { FIXTURE_SAVINGS_PLAN } from './fixtures.ts';

const base = {
  openingBalanceCents: FIXTURE_SAVINGS_PLAN.openingBalanceCents,
  monthlyContributionCents: FIXTURE_SAVINGS_PLAN.monthlyContributionCents,
  annualRate: FIXTURE_SAVINGS_PLAN.illustrativeRateAnnual,
  horizonMonths: FIXTURE_SAVINGS_PLAN.horizonMonths,
};

describe('projectSavings', () => {
  it('0% rate, $300/mo, 12 months, opening $1,000 → planned month 12 = 460_000', () => {
    const r = projectSavings({ ...base, horizonMonths: 12 });
    expect(r.points).toHaveLength(13);
    expect(r.points[0]).toEqual({ month: 0, plannedCents: 100_000, scenarioCents: 100_000 });
    expect(r.points[12]!.plannedCents).toBe(460_000);
  });

  it('overage $83 reduces only the first contribution: $300 → $217', () => {
    const r = projectSavings({ ...base, overageFundedFromSavingsCents: 8_300 });
    expect(r.reducedFirstContributionCents).toBe(8_300);
    expect(r.uncoveredOverageCents).toBe(0);
    expect(r.points[1]!.scenarioCents - r.points[0]!.scenarioCents).toBe(21_700);
    expect(r.points[2]!.scenarioCents - r.points[1]!.scenarioCents).toBe(30_000);
  });

  it('0% rate → delta stays exactly 8_300 at every later month', () => {
    const r = projectSavings({ ...base, overageFundedFromSavingsCents: 8_300 });
    for (const p of r.points.slice(1)) expect(p.plannedCents - p.scenarioCents).toBe(8_300);
    expect(r.deltaAtHorizonCents).toBe(8_300);
  });

  it('overage > contribution → reducedFirstContribution = C, uncoveredOverage = overage − C', () => {
    const r = projectSavings({ ...base, overageFundedFromSavingsCents: 45_000 });
    expect(r.reducedFirstContributionCents).toBe(30_000);
    expect(r.uncoveredOverageCents).toBe(15_000);
    // Month 1 contribution is 0, never negative.
    expect(r.points[1]!.scenarioCents).toBe(100_000);
  });

  it('overage 0 (within budget) → planned and scenario paths are identical (FIN-03)', () => {
    const r = projectSavings({ ...base, annualRate: 0.07 });
    for (const p of r.points) expect(p.scenarioCents).toBe(p.plannedCents);
    expect(r.deltaAtHorizonCents).toBe(0);
  });

  it('5% rate compounds monthly at r/12 with end-of-month contribution', () => {
    const r = projectSavings({ ...base, annualRate: 0.05, horizonMonths: 2 });
    // m1: round(100_000 × 1.0041666…) + 30_000 = 100_417 + 30_000
    expect(r.points[1]!.plannedCents).toBe(130_417);
    // m2: round(130_417 × 1.0041666…) + 30_000 = 130_960 + 30_000
    expect(r.points[2]!.plannedCents).toBe(160_960);
  });

  it('positive rate → overage delta compounds above 8_300 and every point is an integer', () => {
    const r = projectSavings({ ...base, annualRate: 0.07, overageFundedFromSavingsCents: 8_300 });
    expect(r.deltaAtHorizonCents).toBeGreaterThan(8_300);
    for (const p of r.points) {
      expect(Number.isInteger(p.plannedCents)).toBe(true);
      expect(Number.isInteger(p.scenarioCents)).toBe(true);
    }
  });

  it('contribution 0 → flat line at opening balance (0% rate)', () => {
    const r = projectSavings({ ...base, monthlyContributionCents: 0, overageFundedFromSavingsCents: 8_300 });
    for (const p of r.points) expect(p.plannedCents).toBe(100_000);
    expect(r.reducedFirstContributionCents).toBe(0);
    expect(r.uncoveredOverageCents).toBe(8_300);
  });

  it('rejects non-cent and negative inputs', () => {
    expect(() => projectSavings({ ...base, monthlyContributionCents: 300.5 })).toThrow(TypeError);
    expect(() => projectSavings({ ...base, monthlyContributionCents: -1 })).toThrow(RangeError);
    expect(() => projectSavings({ ...base, overageFundedFromSavingsCents: -1 })).toThrow(RangeError);
    expect(() => projectSavings({ ...base, horizonMonths: 1.5 })).toThrow(RangeError);
  });
});
