/**
 * approval.ts — public standing.
 *
 * Approval is never set directly by a system. It eases toward a target implied
 * by the state of the country, and every one-off nudge on top of that drift is
 * itemised in the turn log. The player should always be able to read the
 * report and account for the whole movement.
 */

import {
  APPROVAL_BASE,
  APPROVAL_DEBT_DIVISOR,
  APPROVAL_DEBT_FREE_ALLOWANCE,
  APPROVAL_DEBT_MAX_PENALTY,
  APPROVAL_FATIGUE_CAP,
  APPROVAL_FATIGUE_PER_TURN,
  APPROVAL_INERTIA,
  APPROVAL_W_ECONOMY,
  APPROVAL_W_SECTOR,
  DIFFICULTY,
  PC_MAX,
  PC_REGEN_APPROVAL_SCALE,
  PC_REGEN_BASE,
  TURNS_PER_TERM,
} from '../balance.ts';
import type { Difficulty, Sector } from '../types.ts';
import { averageSectorHealth, findSector } from './budget.ts';

export interface ApprovalTarget {
  target: number;
  /** Itemised so the End of Turn Report can show the whole derivation. */
  components: { label: string; value: number }[];
}

/**
 * The standing the country's condition implies. Approval chases this.
 */
export function computeApprovalTarget(
  sectors: readonly Sector[],
  debt: number,
  turnsServed: number,
  difficulty: Difficulty,
): ApprovalTarget {
  const profile = DIFFICULTY[difficulty];
  const avgHealth = averageSectorHealth(sectors);
  const economyHealth = findSector(sectors, 'economy').health;

  const sectorTerm = (avgHealth - 50) * APPROVAL_W_SECTOR;
  const economyTerm = (economyHealth - 50) * APPROVAL_W_ECONOMY;
  const debtPenalty = -Math.min(
    APPROVAL_DEBT_MAX_PENALTY,
    Math.max(0, (debt - APPROVAL_DEBT_FREE_ALLOWANCE) / APPROVAL_DEBT_DIVISOR),
  );
  const fatigue = -Math.min(APPROVAL_FATIGUE_CAP, turnsServed * APPROVAL_FATIGUE_PER_TURN);

  const components = [
    { label: 'Base standing', value: APPROVAL_BASE },
    { label: 'Public services', value: sectorTerm },
    { label: 'Economy', value: economyTerm },
    { label: 'Debt burden', value: debtPenalty },
    { label: 'Time in office', value: fatigue },
    { label: 'Difficulty', value: profile.approvalBias },
  ];

  const target = components.reduce((sum, c) => sum + c.value, 0);
  return { target: Math.max(0, Math.min(100, target)), components };
}

/** One turn of easing toward the target. Returns the new approval value. */
export function driftApproval(current: number, target: number): number {
  return clampApproval(current + (target - current) * APPROVAL_INERTIA);
}

export function clampApproval(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Political capital earned at the start of a turn. */
export function computePcRegen(approval: number): number {
  return PC_REGEN_BASE + (approval / 100) * PC_REGEN_APPROVAL_SCALE;
}

export function clampPc(value: number): number {
  return Math.max(0, Math.min(PC_MAX, value));
}

/** Total turns the player has been in office across all terms. */
export function turnsServed(termNumber: number, turnNumber: number): number {
  return (termNumber - 1) * TURNS_PER_TERM + (turnNumber - 1);
}
