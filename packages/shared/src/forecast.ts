import { assertCents } from './money.ts';
import type { Cents, IllustrativeRate } from './types.ts';

/**
 * Future Me projection (docs/SPEC.md §9.2).
 * Convention: monthly rate = annual / 12, end-of-month contribution,
 *   B[next] = round(B[current] × (1 + r/12)) + C.
 * Growth is rounded to whole cents each month so every point stays an integer.
 * Scenario path reduces ONLY the first future contribution by min(C, overage).
 * Anything beyond C is reported as uncovered, never as a negative contribution.
 */
export interface ForecastInput {
  openingBalanceCents: Cents;
  monthlyContributionCents: Cents;
  annualRate: IllustrativeRate;
  horizonMonths: number;
  /** Over-budget portion the user opted to fund from savings. 0 when within budget (FIN-03). */
  overageFundedFromSavingsCents?: Cents;
}

export interface ForecastPoint {
  /** 0 = today (opening balance), 1 = after the first contribution, … */
  month: number;
  plannedCents: Cents;
  scenarioCents: Cents;
}

export interface ForecastResult {
  /** horizonMonths + 1 points; points[m].month === m. */
  points: ForecastPoint[];
  /** min(C, overage) — the one-time reduction applied to month 1. */
  reducedFirstContributionCents: Cents;
  /** max(0, overage − C) — "requires another funding source". */
  uncoveredOverageCents: Cents;
  /** planned − scenario at the final month. */
  deltaAtHorizonCents: Cents;
}

export function projectSavings(input: ForecastInput): ForecastResult {
  const {
    openingBalanceCents: opening,
    monthlyContributionCents: contribution,
    annualRate,
    horizonMonths,
    overageFundedFromSavingsCents: overage = 0,
  } = input;

  assertCents(opening, 'openingBalanceCents');
  assertCents(contribution, 'monthlyContributionCents');
  assertCents(overage, 'overageFundedFromSavingsCents');
  if (contribution < 0) throw new RangeError('monthlyContributionCents must be ≥ 0');
  if (overage < 0) throw new RangeError('overageFundedFromSavingsCents must be ≥ 0');
  if (!Number.isInteger(horizonMonths) || horizonMonths < 0) {
    throw new RangeError('horizonMonths must be a non-negative integer');
  }

  const monthlyRate = annualRate / 12;
  const grow = (balance: Cents) => Math.round(balance * (1 + monthlyRate));

  const reducedFirstContributionCents = Math.min(contribution, overage);
  const uncoveredOverageCents = Math.max(0, overage - contribution);

  const points: ForecastPoint[] = [{ month: 0, plannedCents: opening, scenarioCents: opening }];
  let planned = opening;
  let scenario = opening;
  for (let month = 1; month <= horizonMonths; month++) {
    planned = grow(planned) + contribution;
    scenario =
      grow(scenario) + (month === 1 ? contribution - reducedFirstContributionCents : contribution);
    points.push({ month, plannedCents: planned, scenarioCents: scenario });
  }

  return {
    points,
    reducedFirstContributionCents,
    uncoveredOverageCents,
    deltaAtHorizonCents: planned - scenario,
  };
}
