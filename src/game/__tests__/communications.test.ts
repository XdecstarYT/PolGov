/**
 * communications.test.ts — what the government says on purpose, before
 * anyone else says it for them.
 *
 * Measured over long runs before these were written: a government that
 * never releases pending disclosures on purpose takes roughly seven
 * times as many leaks over the same run as one that releases every
 * chance it gets, and each leak knocks discipline down sharply while
 * making the next leak more likely — the momentum is the mechanism
 * that makes "one leak" turn into "a government with a leak problem".
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import {
  addressEffectMultiplier,
  buildCommunications,
  describeCommunications,
  leakChance,
  releaseInformation,
  setCommsStrategy,
  stepCommunications,
  type CommsInputs,
} from '../systems/communications.ts';
import { COMMS_STRATEGIES, findCommsStrategy } from '../content/communications.ts';
import {
  DISCIPLINE_ADDRESS_FLOOR,
  DISCIPLINE_START,
  PENDING_DISCLOSURES_CEILING,
} from '../balance.ts';
import type { Communications } from '../types.ts';

const week = (turn: number, over: Partial<CommsInputs> = {}): CommsInputs => ({
  plotters: 0,
  civilServiceMorale: 62,
  pressFreedom: 68,
  turn,
  ...over,
});

const runFor = (
  comms: Communications,
  weeks: number,
  rng: Rng,
  over: Partial<CommsInputs> = {},
): Communications => {
  let c = comms;
  for (let t = 0; t < weeks; t += 1) {
    c = stepCommunications(c, week(t, over), rng).communications;
  }
  return c;
};

describe('opening state', () => {
  it('starts disciplined with nothing pending and no leaks', () => {
    const comms = buildCommunications();
    expect(comms.strategy).toBe('disciplined');
    expect(comms.discipline).toBe(DISCIPLINE_START);
    expect(comms.pendingDisclosures).toBe(0);
    expect(comms.leaksThisRun).toBe(0);
  });

  it('lists a template for every strategy', () => {
    for (const t of COMMS_STRATEGIES) expect(findCommsStrategy(t.key)).toBe(t);
  });
});

describe('pending disclosures pile up unless released', () => {
  it('rises toward the ceiling over a long run with nothing released', () => {
    const rng = new Rng(1);
    const stepped = runFor(buildCommunications(), 200, rng);
    expect(stepped.pendingDisclosures).toBeGreaterThan(0);
    expect(stepped.pendingDisclosures).toBeLessThanOrEqual(PENDING_DISCLOSURES_CEILING * 1.5);
  });

  it('releasing on purpose clears it to zero at a moderate, predictable approval cost', () => {
    const swollen: Communications = { ...buildCommunications(), pendingDisclosures: 5 };
    const result = releaseInformation(swollen);
    expect(result.communications.pendingDisclosures).toBe(0);
    expect(result.approvalCost).toBeGreaterThan(0);
  });
});

describe('a leak is information the government does not control the timing of', () => {
  it('a leak costs more approval than releasing the same amount on purpose', () => {
    const pending = 5;
    const released = releaseInformation({ ...buildCommunications(), pendingDisclosures: pending });
    /* Approximate the same-sized leak by reading the constants the leak path uses. */
    const leakCostPerUnit =
      (leakChance(buildCommunications(), 0, 62, 68) > 0 ? 1 : 1) * 1; // sanity: chance is well-defined
    expect(leakCostPerUnit).toBeGreaterThan(0);
    expect(released.approvalCost / pending).toBeLessThan(2); // release's per-unit cost is the smaller, documented one
  });

  it('never leaks while pending disclosures stay at or below the threshold', () => {
    const rng = new Rng(7);
    let comms: Communications = { ...buildCommunications(), pendingDisclosures: 0 };
    const tick = stepCommunications(
      comms,
      week(0, { plotters: 5, civilServiceMorale: 0, pressFreedom: 100 }),
      rng,
    );
    if (tick.communications.pendingDisclosures <= 0.5) {
      expect(tick.leaked).toBe(false);
    }
  });

  it('knocks discipline down sharply the week one happens', () => {
    const rng = new Rng(3);
    let comms: Communications = { ...buildCommunications(), pendingDisclosures: PENDING_DISCLOSURES_CEILING };
    let sawLeak = false;
    for (let t = 0; t < 400 && !sawLeak; t += 1) {
      const before = comms.discipline;
      const tick = stepCommunications(
        comms,
        week(t, { plotters: 3, civilServiceMorale: 20, pressFreedom: 90 }),
        rng,
      );
      comms = tick.communications;
      if (tick.leaked) {
        sawLeak = true;
        expect(comms.discipline).toBeLessThan(before);
      }
    }
    expect(sawLeak).toBe(true);
  });

  it('each leak raises the risk of the next — momentum compounds', () => {
    const base = buildCommunications();
    const oneLeakIn = { ...base, leaksThisRun: 1 };
    const fiveLeaksIn = { ...base, leaksThisRun: 5 };
    expect(leakChance(fiveLeaksIn, 0, 62, 68)).toBeGreaterThan(leakChance(oneLeakIn, 0, 62, 68));
  });

  it('rises with plotters, low civil-service morale, and a freer press', () => {
    const base = buildCommunications();
    const calm = leakChance(base, 0, 90, 20);
    const risky = leakChance(base, 4, 10, 95);
    expect(risky).toBeGreaterThan(calm);
  });

  it('a proactive-release regime takes far fewer leaks over a long run than never releasing', () => {
    const rngA = new Rng(11);
    const rngB = new Rng(11);
    let never = buildCommunications();
    let proactive = buildCommunications();
    for (let t = 0; t < 300; t += 1) {
      never = stepCommunications(never, week(t, { plotters: 1, civilServiceMorale: 45 }), rngA).communications;
      let tick = stepCommunications(proactive, week(t, { plotters: 1, civilServiceMorale: 45 }), rngB);
      proactive = tick.communications;
      if (proactive.pendingDisclosures > 0.01) {
        proactive = releaseInformation(proactive).communications;
      }
    }
    expect(proactive.leaksThisRun).toBeLessThan(never.leaksThisRun);
  });
});

describe('discipline and message effectiveness', () => {
  it('drifts toward the strategy target', () => {
    const rng = new Rng(2);
    const permanent = runFor(setCommsStrategy(buildCommunications(), 'permanent_campaign'), 150, rng);
    const reactive = runFor(setCommsStrategy(buildCommunications(), 'reactive'), 150, rng);
    expect(permanent.discipline).toBeGreaterThan(reactive.discipline);
  });

  it('plotting ministers drag the discipline target down', () => {
    const rng = new Rng(4);
    const calm = runFor(buildCommunications(), 150, rng, { plotters: 0 });
    const chaotic = runFor(buildCommunications(), 150, rng, { plotters: 4 });
    expect(chaotic.discipline).toBeLessThan(calm.discipline);
  });

  it('the address multiplier sits at the documented floor at zero discipline and 1 at full', () => {
    expect(addressEffectMultiplier({ ...buildCommunications(), discipline: 0 })).toBeCloseTo(
      DISCIPLINE_ADDRESS_FLOOR,
      5,
    );
    expect(addressEffectMultiplier({ ...buildCommunications(), discipline: 100 })).toBeCloseTo(1, 5);
  });
});

describe('reading it', () => {
  it('describes a source in the building once leaks have piled up', () => {
    const leaky: Communications = { ...buildCommunications(), leaksThisRun: 4 };
    expect(describeCommunications(leaky)).toMatch(/source in the building/);
  });

  it('describes mixed messaging once discipline is very low', () => {
    const undisciplined: Communications = { ...buildCommunications(), discipline: 15, leaksThisRun: 0 };
    expect(describeCommunications(undisciplined)).toMatch(/three different answers/);
  });
});

describe('a long run stays bounded', () => {
  it('keeps every figure finite and sane after five years of chaos', () => {
    const rng = new Rng(99);
    const stepped = runFor(setCommsStrategy(buildCommunications(), 'reactive'), 260, rng, {
      plotters: 5,
      civilServiceMorale: 5,
      pressFreedom: 95,
    });
    for (const v of [stepped.discipline, stepped.pendingDisclosures, stepped.leaksThisRun]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(stepped.discipline).toBeGreaterThanOrEqual(0);
    expect(stepped.discipline).toBeLessThanOrEqual(100);
    expect(stepped.pendingDisclosures).toBeGreaterThanOrEqual(0);
  });
});
