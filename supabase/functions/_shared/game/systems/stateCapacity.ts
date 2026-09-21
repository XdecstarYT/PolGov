/**
 * stateCapacity.ts — how far the state actually reaches, and what it
 * costs to reach further than usual.
 *
 * REACH, NOT WILL. `reach` is built from the civil service's capability,
 * the infrastructure a decision has to travel over, and how legible the
 * regulatory environment is to administer — never from anything the
 * player asks for directly, because wanting something badly is not a
 * mechanism and this file has no dial for it.
 *
 * EASY TO DECLARE, HARD TO STAND DOWN. `legitimacyDebt` accumulates
 * faster the longer an emergency runs, not just because of its level,
 * and `standDownCost` is computed from duration on the same clock: the
 * price of returning to ordinary rule rises every week the government
 * waits, which is the mechanism and not a flavour label on a fixed
 * number.
 */

import {
  DISASTER_READINESS_RATE,
  DISASTER_READINESS_START,
  EMERGENCY_DEBT_DURATION_RATE,
  INVEST_READINESS_EFFECT,
  STAND_DOWN_BASE_COST,
  STAND_DOWN_DURATION_COST,
  STAND_DOWN_MAX_COST,
  STATE_REACH_RATE,
  STATE_REACH_START,
} from '../balance.ts';
import { findEmergencyLevel, type EmergencyLevel } from '../content/emergency.ts';
import type { StateCapacity } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);
const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildStateCapacity(): StateCapacity {
  return {
    reach: STATE_REACH_START,
    level: 'normal',
    weeksInEmergency: 0,
    timesDeclared: 0,
    legitimacyDebt: 0,
    disasterReadiness: DISASTER_READINESS_START,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/** What it would cost, right now, to return to ordinary rule. Zero if already there. */
export function standDownCost(capacity: StateCapacity): number {
  if (capacity.level === 'normal') return 0;
  return clamp(
    STAND_DOWN_BASE_COST + capacity.weeksInEmergency * STAND_DOWN_DURATION_COST,
    STAND_DOWN_BASE_COST,
    STAND_DOWN_MAX_COST,
  );
}

/** Effective response capability this week, reach scaled by whatever level is in force. */
export function responseCapability(capacity: StateCapacity): number {
  return clamp100(capacity.reach * findEmergencyLevel(capacity.level).responseMultiplier);
}

export function describeStateCapacity(capacity: StateCapacity): string {
  if (capacity.level !== 'normal' && capacity.weeksInEmergency > 52) {
    return 'What was declared as an emergency is now simply how this country is governed. Almost nobody in office remembers voting for that.';
  }
  if (capacity.level !== 'normal') {
    return 'The powers are unusual and everyone can still see that they are. That window is the cheap time to stand them down.';
  }
  if (capacity.reach < 45) {
    return 'The state wants a great deal and delivers little of it evenly. The gap is not ambition — it is reach.';
  }
  return 'An ordinary state: it reaches most of the country, most of the time, at ordinary speed.';
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface StateCapacityInputs {
  civilServiceCapability: number;
  infrastructureHealth: number;
  regulatoryQuality: number;
  turn: number;
}

export interface StateCapacityTick {
  capacity: StateCapacity;
  /** True the week an emergency first passes a year in force. */
  normalised: boolean;
}

export function stepStateCapacity(
  capacity: StateCapacity,
  inputs: StateCapacityInputs,
): StateCapacityTick {
  const reachTarget = clamp100(
    inputs.civilServiceCapability * 0.4 +
      inputs.infrastructureHealth * 0.35 +
      inputs.regulatoryQuality * 0.25,
  );
  const reach = clamp100(toward(capacity.reach, reachTarget, STATE_REACH_RATE));

  const inEmergency = capacity.level !== 'normal';
  const weeksInEmergency = inEmergency ? capacity.weeksInEmergency + 1 : 0;

  const template = findEmergencyLevel(capacity.level);
  const legitimacyDebt = inEmergency
    ? capacity.legitimacyDebt +
      template.legitimacyDrag * (1 + weeksInEmergency * EMERGENCY_DEBT_DURATION_RATE)
    : capacity.legitimacyDebt;

  const disasterReadiness = clamp100(
    toward(capacity.disasterReadiness, DISASTER_READINESS_START, DISASTER_READINESS_RATE),
  );

  const next: StateCapacity = {
    ...capacity,
    reach,
    weeksInEmergency,
    legitimacyDebt,
    disasterReadiness,
    history: [
      ...capacity.history,
      { turn: inputs.turn, reach, standDownCost: standDownCost({ ...capacity, weeksInEmergency }) },
    ].slice(-208),
  };

  return {
    capacity: next,
    normalised: weeksInEmergency > 52 && capacity.weeksInEmergency <= 52,
  };
}

/* ------------------------------------------------------------------ *
 * Decisions
 * ------------------------------------------------------------------ */

export function declareEmergency(capacity: StateCapacity, level: EmergencyLevel): StateCapacity {
  return {
    ...capacity,
    level,
    weeksInEmergency: 0,
    timesDeclared: capacity.timesDeclared + 1,
    disasterReadiness: clamp100(capacity.disasterReadiness - 20),
  };
}

export function standDown(capacity: StateCapacity): StateCapacity {
  return { ...capacity, level: 'normal', weeksInEmergency: 0, legitimacyDebt: 0 };
}

export function investReadiness(capacity: StateCapacity): StateCapacity {
  return { ...capacity, disasterReadiness: clamp100(capacity.disasterReadiness + INVEST_READINESS_EFFECT) };
}
