/**
 * legacy.ts — scoring a career.
 *
 * There is no win condition. A run ends and is then measured: how long you
 * lasted, what you passed, what condition you left the country in, and what
 * it cost. The weights are deliberately plural so no single strategy
 * dominates the table.
 */

import { LEGACY_WEIGHTS } from '../balance.ts';
import type { GameState } from '../types.ts';
import { averageSectorHealth } from './budget.ts';

export interface LegacyLine {
  label: string;
  detail: string;
  points: number;
}

export interface LegacyScore {
  total: number;
  lines: LegacyLine[];
  verdict: string;
}

export function computeLegacy(state: GameState): LegacyScore {
  const avgHealth = averageSectorHealth(state.sectors);
  const { career } = state;

  const lines: LegacyLine[] = [
    {
      label: 'Terms served',
      detail: `${career.termsServed} full term${career.termsServed === 1 ? '' : 's'} in office`,
      points: career.termsServed * LEGACY_WEIGHTS.perTermServed,
    },
    {
      label: 'Elections won',
      detail: `${career.electionsWon} general election${career.electionsWon === 1 ? '' : 's'} carried`,
      points: career.electionsWon * LEGACY_WEIGHTS.perElectionWon,
    },
    {
      label: 'Legislation enacted',
      detail: `${career.billsPassed} bills passed, ${career.billsFailed} defeated`,
      points: career.billsPassed * LEGACY_WEIGHTS.perBillPassed,
    },
    {
      label: 'Condition of public services',
      detail: `average sector health ${avgHealth.toFixed(1)}/100 at the end`,
      points: (avgHealth - 50) * LEGACY_WEIGHTS.finalSectorHealth,
    },
    {
      label: 'Public debt',
      detail: `₡${Math.round(state.debt)}bn outstanding`,
      points: state.debt * LEGACY_WEIGHTS.finalDebt,
    },
    {
      label: 'Peak standing',
      detail: `highest approval ${career.peakApproval.toFixed(0)}%`,
      points: (career.peakApproval - 50) * LEGACY_WEIGHTS.peakApproval,
    },
  ];

  const total = Math.round(lines.reduce((sum, line) => sum + line.points, 0));
  return { total, lines, verdict: verdictFor(total, state) };
}

/**
 * A neutral, descriptive summary. It reports what happened; it does not praise
 * or condemn a programme.
 */
function verdictFor(total: number, state: GameState): string {
  const ending =
    state.status === 'defeated'
      ? 'The administration ended at the ballot box.'
      : state.status === 'collapsed'
        ? 'The administration ended when the government could not be reformed.'
        : 'The administration ended by the leader’s own decision.';

  if (total >= 700) {
    return `${ending} It leaves behind a long tenure, a substantial legislative record, and a state in better condition than it was found.`;
  }
  if (total >= 400) {
    return `${ending} It leaves a solid record: real legislation delivered, and the national accounts and public services in recognisable order.`;
  }
  if (total >= 150) {
    return `${ending} It leaves a mixed inheritance — achievements in some departments, unfinished business and unpaid bills in others.`;
  }
  if (total >= 0) {
    return `${ending} It leaves little settled. The next administration inherits most of the same problems.`;
  }
  return `${ending} It leaves the country's finances and services measurably worse than it found them.`;
}
