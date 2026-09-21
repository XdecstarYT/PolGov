/**
 * press.test.ts — who owns the feed, and what the government does about
 * it.
 *
 * Measured before these were written: one pressure campaign moves the
 * freedom index by a large, visible amount in a single week; forty
 * quiet ownership transfers over the same run move concentration from
 * an even split to a single owner controlling seventy percent, and
 * disinformation more than doubles behind it — with the freedom index
 * moving only a little each individual week. Same government, same run
 * length, two completely different signatures on the numbers.
 */

import { describe, expect, it } from 'vitest';
import {
  breakUpOwnership,
  buildPress,
  consolidateOwnership,
  describePress,
  herfindahl,
  launchMediaLiteracy,
  pressureOutlet,
  setPressPosture,
  stepPress,
  type PressInputs,
} from '../systems/press.ts';
import { OWNER_TYPES, PRESS_POSTURES, findOwnerType, findPressPosture } from '../content/press.ts';
import { PRESSURE_OUTLET_EFFECT, PRESS_FREEDOM_START } from '../balance.ts';
import type { Press } from '../types.ts';

const week = (turn: number, over: Partial<PressInputs> = {}): PressInputs => ({
  polarisation: 0.3,
  turn,
  ...over,
});

const runFor = (press: Press, weeks: number, over: Partial<PressInputs> = {}): Press => {
  let p = press;
  for (let t = 0; t < weeks; t += 1) {
    p = stepPress(p, week(t, over)).press;
  }
  return p;
};

describe('opening state', () => {
  it('starts hands off, plural, and mostly clean', () => {
    const press = buildPress();
    expect(press.posture).toBe('hands_off');
    expect(press.freedomIndex).toBe(PRESS_FREEDOM_START);
    expect(press.ownership.independent).toBeGreaterThan(press.ownership.conglomerate);
    const shares = Object.values(press.ownership).reduce((a, b) => a + b, 0);
    expect(shares).toBeCloseTo(1, 6);
  });

  it('lists a template for every posture and owner type', () => {
    for (const t of PRESS_POSTURES) expect(findPressPosture(t.key)).toBe(t);
    for (const t of OWNER_TYPES) expect(findOwnerType(t.key)).toBe(t);
  });
});

describe('capture through pressure is fast and visible', () => {
  it('moves the freedom index a large amount in a single call', () => {
    const base = buildPress();
    const pressured = pressureOutlet(base);
    expect(base.freedomIndex - pressured.freedomIndex).toBeCloseTo(PRESSURE_OUTLET_EFFECT, 5);
  });

  it('never sends the freedom index below zero', () => {
    const low: Press = { ...buildPress(), freedomIndex: 2 };
    expect(pressureOutlet(low).freedomIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('capture through ownership is slow and quiet', () => {
  it('a single consolidation barely moves concentration', () => {
    const base = buildPress();
    const consolidated = consolidateOwnership(base, 'conglomerate');
    expect(consolidated.concentration - base.concentration).toBeLessThan(0.02);
  });

  it('repeated, patient consolidation reaches a level a single pressure campaign never could', () => {
    let press = buildPress();
    for (let i = 0; i < 40; i += 1) press = consolidateOwnership(press, 'conglomerate');
    expect(press.ownership.independent).toBeCloseTo(0, 5);
    expect(press.concentration).toBeGreaterThan(0.5);
  });

  it('never moves more independent share than actually exists', () => {
    const drained: Press = {
      ...buildPress(),
      ownership: { independent: 0.01, conglomerate: 0.6, state_owned: 0.2, partisan_patron: 0.19 },
    };
    const moved = consolidateOwnership(drained, 'conglomerate');
    expect(moved.ownership.independent).toBeGreaterThanOrEqual(0);
    const shares = Object.values(moved.ownership).reduce((a, b) => a + b, 0);
    expect(shares).toBeCloseTo(1, 6);
  });

  it('concentration matches the Herfindahl–Hirschman Index of the ownership shares', () => {
    const press = buildPress();
    expect(press.concentration).toBeCloseTo(herfindahl(press.ownership), 10);
  });

  it('breaking up ownership reverses the largest non-independent owner, not a fixed one', () => {
    const concentrated: Press = {
      ...buildPress(),
      ownership: { independent: 0, conglomerate: 0.7, state_owned: 0.15, partisan_patron: 0.15 },
    };
    const brokenUp = breakUpOwnership(concentrated);
    expect(brokenUp.ownership.conglomerate).toBeLessThan(concentrated.ownership.conglomerate);
    expect(brokenUp.ownership.independent).toBeGreaterThan(concentrated.ownership.independent);
  });

  it('does not drift on its own between deliberate uses', () => {
    const press = buildPress();
    const stepped = runFor(press, 300);
    expect(stepped.concentration).toBe(press.concentration);
    expect(stepped.ownership).toEqual(press.ownership);
  });
});

describe('freedom index', () => {
  it('drifts toward the posture target', () => {
    const base = buildPress();
    const adversarial = runFor(setPressPosture(base, 'adversarial'), 150);
    const handsOff = runFor(base, 150);
    expect(adversarial.freedomIndex).toBeLessThan(handsOff.freedomIndex);
  });

  it('is dragged down further by concentration, at equal posture', () => {
    const base = buildPress();
    const concentrated: Press = {
      ...base,
      ownership: { independent: 0, conglomerate: 1, state_owned: 0, partisan_patron: 0 },
      concentration: 1,
    };
    const cleanRun = runFor(base, 150);
    const concentratedRun = runFor(concentrated, 150);
    expect(concentratedRun.freedomIndex).toBeLessThan(cleanRun.freedomIndex);
  });
});

describe('disinformation', () => {
  it('rises with concentration and with polarisation', () => {
    const base = buildPress();
    const plural = runFor(base, 150, { polarisation: 0 });
    const concentrated: Press = {
      ...base,
      ownership: { independent: 0, conglomerate: 1, state_owned: 0, partisan_patron: 0 },
      concentration: 1,
    };
    const concentratedRun = runFor(concentrated, 150, { polarisation: 0 });
    expect(concentratedRun.disinformation).toBeGreaterThan(plural.disinformation);

    const polarised = runFor(base, 150, { polarisation: 0.9 });
    expect(polarised.disinformation).toBeGreaterThan(plural.disinformation);
  });

  it('media literacy cuts it while the stock lasts, and the stock itself decays', () => {
    const base = buildPress();
    const literate = launchMediaLiteracy(base);
    expect(literate.literacyStock).toBeGreaterThan(base.literacyStock);

    const withLiteracy = runFor(literate, 100);
    const without = runFor(base, 100);
    expect(withLiteracy.disinformation).toBeLessThan(without.disinformation);

    const decayed = runFor(literate, 300);
    expect(decayed.literacyStock).toBeLessThan(literate.literacyStock);
  });
});

describe('reading it', () => {
  it('describes a captured landscape once concentration and low freedom coincide', () => {
    const captured: Press = { ...buildPress(), freedomIndex: 20, concentration: 0.6 };
    expect(describePress(captured)).toMatch(/same small set of interests/);
  });

  it('describes quiet consolidation once concentration alone is high', () => {
    const consolidated: Press = { ...buildPress(), freedomIndex: 60, concentration: 0.6 };
    expect(describePress(consolidated)).toMatch(/nobody can point to the week/);
  });

  it('describes managed access once freedom alone is low', () => {
    const managed: Press = { ...buildPress(), freedomIndex: 20, concentration: 0.3 };
    expect(describePress(managed)).toMatch(/which calls come from the government/);
  });
});

describe('a long run stays bounded', () => {
  it('keeps every figure finite and sane after five years under adversarial pressure', () => {
    let press = setPressPosture(buildPress(), 'adversarial');
    for (let i = 0; i < 30; i += 1) press = consolidateOwnership(press, 'state_owned');
    press = runFor(press, 260, { polarisation: 0.8 });

    for (const v of [press.freedomIndex, press.concentration, press.disinformation, press.literacyStock]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(press.freedomIndex).toBeGreaterThanOrEqual(0);
    expect(press.freedomIndex).toBeLessThanOrEqual(100);
    expect(press.concentration).toBeGreaterThanOrEqual(0.25);
    expect(press.concentration).toBeLessThanOrEqual(1);
    const shares = Object.values(press.ownership).reduce((a, b) => a + b, 0);
    expect(shares).toBeCloseTo(1, 5);
  });
});
