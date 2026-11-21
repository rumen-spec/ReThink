import { describe, it } from 'vitest';

// Block 1 — turn these into real tests as forecast.ts is implemented (docs/SPEC.md §9.2, §9.3).
describe('projectSavings', () => {
  it.todo('0% rate, $300/mo, 12 months, opening $1,000 → planned month 12 = 460_000');
  it.todo('overage $83 reduces only the first contribution: scenario month 1 = planned − 8_300');
  it.todo('0% rate → delta stays exactly 8_300 at every later month');
  it.todo('overage > contribution → reducedFirstContribution = C, uncoveredOverage = overage − C');
  it.todo('overage 0 (within budget) → planned and scenario paths are identical (FIN-03)');
  it.todo('5% rate compounds monthly at r/12 with end-of-month contribution');
  it.todo('contribution 0 → flat line at opening balance (0% rate)');
});
