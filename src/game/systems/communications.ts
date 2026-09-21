/**
 * communications.ts — what the government says on purpose, before
 * anyone else says it for them.
 *
 * A LEAK IS INFORMATION THE GOVERNMENT DOESN'T CONTROL THE TIMING OF.
 * `releaseInformation` clears pending disclosures at a moderate,
 * predictable approval cost. A leak clears the same stock at a larger
 * cost, on a week the government did not choose, and each one makes the
 * next more likely — a plotting cabinet, a demoralised civil service and
 * a free press are exactly the three places a leak comes from, so the
 * risk this file computes is read from `cabinet.ts`, `stateCapacity.ts`
 * (via civilService) and `press.ts` rather than asserted on its own.
 */

import {
  DISCIPLINE_RATE,
  DISCIPLINE_START,
  LEAK_APPROVAL_COST,
  LEAK_BASE_CHANCE,
  LEAK_DISCIPLINE_HIT,
  LEAK_MOMENTUM,
  PENDING_DISCLOSURES_CEILING,
  PENDING_DISCLOSURES_RATE,
  PLOTTER_DISCIPLINE_DRAG,
  RELEASE_APPROVAL_COST,
  DISCIPLINE_ADDRESS_FLOOR,
} from '../balance.ts';
import { findCommsStrategy, type CommsStrategy } from '../content/communications.ts';
import type { Communications } from '../types.ts';
import type { Rng } from '../rng.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);
const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildCommunications(): Communications {
  return {
    strategy: 'disciplined',
    discipline: DISCIPLINE_START,
    pendingDisclosures: 0,
    leaksThisRun: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/**
 * The weekly probability of a leak, built from exactly the three places
 * one comes from: a cabinet with people counting rather than serving, a
 * civil service that has stopped feeling loyal to this government, and
 * a press free and hungry enough to go digging — plus how much there
 * currently is to find, and how many times this has already happened.
 */
export function leakChance(
  comms: Communications,
  plotters: number,
  civilServiceMorale: number,
  pressFreedom: number,
): number {
  const riskMultiplier =
    1 +
    plotters * 0.5 +
    Math.max(0, (50 - civilServiceMorale) / 50) * 1.2 +
    (pressFreedom / 100) * 1.0 +
    (comms.pendingDisclosures / PENDING_DISCLOSURES_CEILING) * 1.5 +
    comms.leaksThisRun * LEAK_MOMENTUM;
  return clamp(LEAK_BASE_CHANCE * riskMultiplier, 0, 0.6);
}

/** How much a public address is worth right now, as a multiplier on its ordinary effect. */
export function addressEffectMultiplier(comms: Communications): number {
  return DISCIPLINE_ADDRESS_FLOOR + (1 - DISCIPLINE_ADDRESS_FLOOR) * (comms.discipline / 100);
}

export function describeCommunications(comms: Communications): string {
  if (comms.leaksThisRun >= 3) {
    return 'The press already has a source in the building. Every story now starts from the assumption that this one does too.';
  }
  if (comms.discipline < 30) {
    return 'Three departments gave three different answers to the same question this week, and all three were reported.';
  }
  if (comms.pendingDisclosures > PENDING_DISCLOSURES_CEILING * 0.6) {
    return 'There is more sitting unannounced than anyone not looking for it would guess.';
  }
  return 'An ordinary week: a line agreed, mostly held, and nothing obviously sitting unannounced.';
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface CommsInputs {
  plotters: number;
  civilServiceMorale: number;
  pressFreedom: number;
  turn: number;
}

export interface CommsTick {
  communications: Communications;
  /** True the week a leak actually happened. */
  leaked: boolean;
  /** What the leak revealed, in approval terms — 0 when nothing leaked. */
  leakApprovalCost: number;
}

/** Steps the week. Draws from `rng` only when a leak is possible at all. */
export function stepCommunications(comms: Communications, inputs: CommsInputs, rng: Rng): CommsTick {
  const strategy = findCommsStrategy(comms.strategy);
  const disciplineTarget = clamp100(
    strategy.disciplineTarget - inputs.plotters * PLOTTER_DISCIPLINE_DRAG,
  );
  const discipline = clamp100(toward(comms.discipline, disciplineTarget, DISCIPLINE_RATE));

  const pendingDisclosures = clamp(
    toward(comms.pendingDisclosures, PENDING_DISCLOSURES_CEILING, PENDING_DISCLOSURES_RATE),
    0,
    PENDING_DISCLOSURES_CEILING * 1.5,
  );

  const chance = leakChance(comms, inputs.plotters, inputs.civilServiceMorale, inputs.pressFreedom);
  const leaked = pendingDisclosures > 0.5 && rng.chance(chance);

  const revealed = leaked ? Math.min(pendingDisclosures, 1 + pendingDisclosures * 0.4) : 0;
  const leakApprovalCost = revealed * LEAK_APPROVAL_COST;

  const next: Communications = {
    ...comms,
    discipline: leaked ? clamp100(discipline - LEAK_DISCIPLINE_HIT) : discipline,
    pendingDisclosures: leaked ? pendingDisclosures - revealed : pendingDisclosures,
    leaksThisRun: leaked ? comms.leaksThisRun + 1 : comms.leaksThisRun,
    history: [
      ...comms.history,
      { turn: inputs.turn, discipline, pendingDisclosures, leaked },
    ].slice(-208),
  };

  return { communications: next, leaked, leakApprovalCost };
}

/* ------------------------------------------------------------------ *
 * Decisions
 * ------------------------------------------------------------------ */

export function setCommsStrategy(comms: Communications, strategy: CommsStrategy): Communications {
  return { ...comms, strategy };
}

export interface ReleaseResult {
  communications: Communications;
  /** The approval cost of releasing what was pending — moderate, and chosen. */
  approvalCost: number;
}

export function releaseInformation(comms: Communications): ReleaseResult {
  const released = comms.pendingDisclosures;
  return {
    communications: { ...comms, pendingDisclosures: 0 },
    approvalCost: released * RELEASE_APPROVAL_COST,
  };
}
