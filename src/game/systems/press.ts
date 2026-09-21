/**
 * press.ts — who owns the feed, and what the government does about it.
 *
 * CAPTURE THROUGH PRESSURE IS FAST, VISIBLE AND EXPENSIVE. `pressureOutlet`
 * moves the freedom index a large amount in a single week, for a real
 * political capital cost, because everyone can see exactly what
 * happened and why.
 *
 * CAPTURE THROUGH OWNERSHIP IS SLOW, QUIET AND DURABLE. `consolidateOwnership`
 * costs little and moves `concentration` — the same Herfindahl–Hirschman
 * Index used against real monopolies — by a small amount each time. No
 * single use is a story. Used patiently over a long run, it changes the
 * landscape as thoroughly as a pressure campaign would, at a fraction of
 * the visible political cost and without ever giving anyone a single
 * moment to react to.
 */

import {
  BREAK_UP_OWNERSHIP_EFFECT,
  CONCENTRATION_FREEDOM_DRAG,
  CONSOLIDATE_OWNERSHIP_EFFECT,
  DISINFORMATION_RATE,
  LAUNCH_MEDIA_LITERACY_EFFECT,
  LITERACY_DECAY,
  PRESSURE_OUTLET_EFFECT,
  PRESS_FREEDOM_RATE,
  PRESS_FREEDOM_START,
} from '../balance.ts';
import { findPressPosture, type OwnerType, type PressPosture } from '../content/press.ts';
import type { Ownership, Press } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);
const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

const OPENING_OWNERSHIP: Ownership = {
  independent: 0.4,
  conglomerate: 0.3,
  state_owned: 0.15,
  partisan_patron: 0.15,
};

export function buildPress(): Press {
  return {
    posture: 'hands_off',
    freedomIndex: PRESS_FREEDOM_START,
    ownership: OPENING_OWNERSHIP,
    concentration: herfindahl(OPENING_OWNERSHIP),
    disinformation: 12,
    literacyStock: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/** The Herfindahl–Hirschman Index of an ownership distribution. */
export function herfindahl(ownership: Ownership): number {
  return (
    ownership.independent ** 2 +
    ownership.conglomerate ** 2 +
    ownership.state_owned ** 2 +
    ownership.partisan_patron ** 2
  );
}

export function describePress(press: Press): string {
  if (press.freedomIndex < 30 && press.concentration > 0.5) {
    return 'Almost everything a reader sees traces back to the same small set of interests, and none of them are eager to cross this government.';
  }
  if (press.concentration > 0.55) {
    return 'Ownership has quietly consolidated to the point that plurality is closer to a fiction than a fact, and nobody can point to the week it happened.';
  }
  if (press.freedomIndex < 35) {
    return 'Editors know exactly which calls come from the government and what happens if a story runs anyway.';
  }
  return 'An ordinary press: plural enough, free enough, and read with the usual amount of suspicion.';
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface PressInputs {
  /** How far apart the country's own factions are — disinformation finds room in the gaps. */
  polarisation: number;
  turn: number;
}

export interface PressTick {
  press: Press;
}

export function stepPress(press: Press, inputs: PressInputs): PressTick {
  const posture = findPressPosture(press.posture);

  const freedomTarget = clamp100(posture.freedomTarget - press.concentration * CONCENTRATION_FREEDOM_DRAG);
  const freedomIndex = clamp100(toward(press.freedomIndex, freedomTarget, PRESS_FREEDOM_RATE));

  const literacyStock = clamp(press.literacyStock * (1 - LITERACY_DECAY), 0, 100);

  const disinformationTarget = clamp100(
    press.concentration * 55 + inputs.polarisation * 30 - freedomIndex * 0.25 - literacyStock * 0.5,
  );
  const disinformation = clamp100(toward(press.disinformation, disinformationTarget, DISINFORMATION_RATE));

  const next: Press = {
    ...press,
    freedomIndex,
    disinformation,
    literacyStock,
    history: [
      ...press.history,
      { turn: inputs.turn, freedomIndex, concentration: press.concentration, disinformation },
    ].slice(-208),
  };

  return { press: next };
}

/* ------------------------------------------------------------------ *
 * Decisions
 * ------------------------------------------------------------------ */

export function setPressPosture(press: Press, posture: PressPosture): Press {
  return { ...press, posture };
}

export function pressureOutlet(press: Press): Press {
  return { ...press, freedomIndex: clamp(press.freedomIndex - PRESSURE_OUTLET_EFFECT, 0, 100) };
}

/** Shifts a small, fixed share from independent ownership to the target owner. */
export function consolidateOwnership(press: Press, target: Exclude<OwnerType, 'independent'>): Press {
  const move = Math.min(CONSOLIDATE_OWNERSHIP_EFFECT, press.ownership.independent);
  const ownership: Ownership = {
    ...press.ownership,
    independent: press.ownership.independent - move,
    [target]: press.ownership[target] + move,
  };
  return { ...press, ownership, concentration: herfindahl(ownership) };
}

/** Antitrust in reverse: moves a small, fixed share of the LARGEST non-independent owner back to independent. */
export function breakUpOwnership(press: Press): Press {
  const candidates: Exclude<OwnerType, 'independent'>[] = ['conglomerate', 'state_owned', 'partisan_patron'];
  const largest = candidates.reduce((a, b) => (press.ownership[b] > press.ownership[a] ? b : a));
  const move = Math.min(BREAK_UP_OWNERSHIP_EFFECT, press.ownership[largest]);
  const ownership: Ownership = {
    ...press.ownership,
    independent: press.ownership.independent + move,
    [largest]: press.ownership[largest] - move,
  };
  return { ...press, ownership, concentration: herfindahl(ownership) };
}

export function launchMediaLiteracy(press: Press): Press {
  return { ...press, literacyStock: clamp(press.literacyStock + LAUNCH_MEDIA_LITERACY_EFFECT, 0, 100) };
}
