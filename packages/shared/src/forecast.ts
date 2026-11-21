import type { Cents, IllustrativeRate } from './types';

/**
 * Future Me projection (docs/SPEC.md §9.2).
 * Convention: monthly rate = annual / 12, end-of-month contribution,
 *   B[next] = B[current] × (1 + r/12) + C.
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
  month: number;
  plannedCents: Cents;
  scenarioCents: Cents;
}

export interface ForecastResult {
  points: ForecastPoint[];
  /** min(C, overage) — the one-time reduction applied to month 1. */
  reducedFirstContributionCents: Cents;
  /** max(0, overage − C) — "requires another funding source". */
  uncoveredOverageCents: Cents;
  /** planned − scenario at the final month. */
  deltaAtHorizonCents: Cents;
}

export function projectSavings(input: ForecastInput): ForecastResult {
  throw new Error('TODO(block-1): implement per §9.2; must satisfy fixtures.ts expectations');
}
