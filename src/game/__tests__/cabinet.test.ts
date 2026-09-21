/**
 * cabinet.test.ts — the table, and the building behind it.
 *
 * The defect found by measuring: POLITICISATION BOUGHT LESS COMPLIANCE
 * THAN PARTNERSHIP. Morale was applied to every posture equally, so
 * replacing the officials with people who agree produced officials who
 * agreed, were miserable, and did less of what they were told than the
 * ones who had not been replaced — which inverts the single mechanic
 * that posture exists for. Officials appointed to comply do comply,
 * whatever they think. What that buys is compliance from people who
 * cannot do the job.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import {
  appoint,
  arguesFor,
  buildCabinet,
  buildCivilService,
  delivery,
  describeCabinet,
  describeCivilService,
  ministerFor,
  plotting,
  removalCost,
  reshuffle,
  reshuffleValue,
  sittingMinisters,
  setMachinePosture,
  stepCabinet,
  stepCivilService,
  type CabinetInputs,
} from '../systems/cabinet.ts';
import {
  APPOINTMENT_BASES,
  CAPTURE_WEEKS,
  LEADERSHIP_AMBITION,
  MACHINE_POSTURES,
  findBasis,
  findPosture,
} from '../content/cabinet.ts';
import { MINISTRY_TEMPLATES } from '../content/ministries.ts';
import {
  COHESION_BREAKS,
  MACHINE_CAPABILITY,
  RESHUFFLE_DECAY,
} from '../balance.ts';
import type { Cabinet, CivilService, Minister } from '../types.ts';

const table = (seed = 9) =>
  buildCabinet('verdana' as never, new Rng(seed), new Set<string>());

const week = (turn: number, over: Partial<CabinetInputs> = {}): CabinetInputs => ({
  approval: 50,
  polling: 50,
  delivery: 0.6,
  crisis: false,
  turn,
  ...over,
});

const run = (cabinet: Cabinet, weeks: number, over: Partial<CabinetInputs> = {}) => {
  let c = cabinet;
  const out = { captured: 0, brokeAt: -1 };
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepCabinet(c, week(t, over));
    c = tick.cabinet;
    out.captured += tick.captured.length;
    if (tick.brokeDown && out.brokeAt < 0) out.brokeAt = t;
  }
  return { cabinet: c, ...out };
};

const machineFor = (posture: Parameters<typeof setMachinePosture>[1], weeks: number) => {
  let m: CivilService = setMachinePosture(buildCivilService(), posture);
  let departures = 0;
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepCivilService(m, { funding: 1, demands: 1, turn: t });
    m = tick.machine;
    departures += tick.departures;
  }
  return { machine: m, departures };
};

/* ------------------------------------------------------------------ *
 * The cabinet
 * ------------------------------------------------------------------ */

describe('cabinet: a coalition you have to keep, not a team you picked', () => {
  it('gives every department somebody, on some basis other than merit', () => {
    const c = table();
    expect(sittingMinisters(c)).toHaveLength(MINISTRY_TEMPLATES.length);
    for (const ministry of MINISTRY_TEMPLATES) {
      expect(ministerFor(c, ministry.key)).toBeDefined();
    }
    /* And more than one way of having got there. */
    expect(new Set(sittingMinisters(c).map((m) => m.basis)).size).toBeGreaterThan(2);
  });

  it('charges for removing a minister according to what they represent', () => {
    /* The appointment was a payment. Removing it is a withdrawal, and
       the person who notices is not the minister. */
    expect(findBasis('technocrat').removalCost).toBeLessThan(
      findBasis('coalition').removalCost,
    );
    const c = table();
    const cheap: Minister = { ...sittingMinisters(c)[0]!, basis: 'technocrat', standing: 50 };
    const dear: Minister = { ...sittingMinisters(c)[0]!, basis: 'coalition', standing: 50 };
    expect(removalCost(cheap)).toBeLessThan(removalCost(dear));
    /* And a minister the public can name costs more than one it cannot,
       whatever they are like to work with. */
    expect(removalCost({ ...dear, standing: 85 })).toBeGreaterThan(
      removalCost({ ...dear, standing: 15 }),
    );
  });

  it('costs the table when somebody is removed from it', () => {
    const c = table();
    const target = ministerFor(c, 'health')!;
    const after = appoint(
      { ...c, ministers: c.ministers.map((m) => ({ ...m, basis: 'coalition' as const })) },
      'health',
      'loyalist',
      'verdana' as never,
      new Rng(2),
      new Set(),
      20,
    );
    expect(after.cost).toBeGreaterThan(0);
    expect(after.cabinet.cohesion).toBeLessThan(c.cohesion);
    expect(ministerFor(after.cabinet, 'health')!.id).not.toBe(target.id);
  });

  it('makes each reshuffle worth less than the last', () => {
    /* The first is a government taking charge. The third is a government
       saying on the front pages that it cannot make its ministers work. */
    let c = table();
    const values: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      values.push(reshuffleValue(c));
      c = reshuffle(c, 'verdana' as never, new Rng(i + 1), new Set(), i * 52).cabinet;
    }
    expect(values[0]).toBe(1);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
    expect(values[3]).toBeCloseTo(RESHUFFLE_DECAY ** 3, 5);
    expect(c.reshuffles).toBe(4);
  });
});

describe('cabinet: ministers are captured by their departments', () => {
  it('turns every one of them within about eighteen months', () => {
    const fresh = table();
    expect(sittingMinisters(fresh).every((m) => arguesFor(m) === 'government')).toBe(true);
    const later = run(fresh, CAPTURE_WEEKS + 10).cabinet;
    expect(sittingMinisters(later).every((m) => arguesFor(m) === 'department')).toBe(true);
  });

  it('is not disloyalty, and happens whatever the leader does', () => {
    /* They know things the rest of the table does not, and the officials
       are extremely good at their jobs. */
    const popular = run(table(), CAPTURE_WEEKS + 10, { approval: 80 }).cabinet;
    const sinking = run(table(), CAPTURE_WEEKS + 10, { approval: 20 }).cabinet;
    expect(sittingMinisters(popular).every((m) => arguesFor(m) === 'department')).toBe(true);
    expect(sittingMinisters(sinking).every((m) => arguesFor(m) === 'department')).toBe(true);
  });

  it('resets when somebody new arrives', () => {
    const captured = run(table(), CAPTURE_WEEKS + 10).cabinet;
    const after = appoint(
      captured,
      'health',
      'technocrat',
      'verdana' as never,
      new Rng(5),
      new Set(),
      CAPTURE_WEEKS + 10,
    ).cabinet;
    expect(arguesFor(ministerFor(after, 'health')!)).toBe('government');
  });
});

describe('cabinet: loyalty is a calculation, not a character trait', () => {
  it('follows whether this leader is going to win', () => {
    const up = run(table(), 208, { approval: 75, polling: 72 }).cabinet;
    const down = run(table(), 208, { approval: 25, polling: 22 }).cabinet;
    const mean = (c: Cabinet) =>
      sittingMinisters(c).reduce((s, m) => s + m.loyalty, 0) / sittingMinisters(c).length;
    expect(mean(up)).toBeGreaterThan(mean(down) + 15);
  });

  it('is done most carefully by the ablest people in the room', () => {
    /* The dangerous minister is not the incompetent one or the disloyal
       one. It is the able, ambitious one who is loyal right up until the
       arithmetic changes. */
    const sinking = run(table(), 208, { approval: 22, polling: 20 }).cabinet;
    const counting = plotting(sinking);
    expect(counting.length).toBeGreaterThan(0);
    for (const m of counting) {
      expect(m.ambition).toBeGreaterThan(LEADERSHIP_AMBITION);
    }
  });

  it('breaks collective responsibility when the leader sinks far enough', () => {
    const out = run(table(), 260, { approval: 20, polling: 18 });
    expect(out.brokeAt).toBeGreaterThan(0);
    expect(out.cabinet.cohesion).toBeLessThan(COHESION_BREAKS);
    expect(describeCabinet(out.cabinet, 260)).toMatch(/collective/i);
  });

  it('holds together for a leader who is winning', () => {
    const out = run(table(), 260, { approval: 68, polling: 66 });
    expect(out.brokeAt).toBe(-1);
    expect(out.cabinet.cohesion).toBeGreaterThan(COHESION_BREAKS + 10);
  });

  it('is suspended by a crisis, which is why governments like them', () => {
    const calm = run(table(), 104, { approval: 34, crisis: false }).cabinet;
    const crisis = run(table(), 104, { approval: 34, crisis: true }).cabinet;
    expect(crisis.cohesion).toBeGreaterThan(calm.cohesion);
  });
});

/* ------------------------------------------------------------------ *
 * The machine
 * ------------------------------------------------------------------ */

describe('the civil service outlasts you and knows it', () => {
  it('stays exactly where it was found when it is left alone', () => {
    const opening = buildCivilService();
    const after = machineFor('partnership', 624).machine;
    expect(after.capability).toBeCloseTo(opening.capability, 4);
    expect(after.compliance).toBeCloseTo(opening.compliance, 4);
    expect(after.morale).toBeCloseTo(opening.morale, 4);
    expect(after.memory).toBeCloseTo(opening.memory, 4);
  });

  it('wins on the day and loses over the term when it is fought', () => {
    const fought = machineFor('confrontation', 416).machine;
    expect(fought.compliance).toBeLessThan(0.55);
    expect(fought.capability).toBeLessThan(MACHINE_CAPABILITY * 0.9);
    expect(fought.morale).toBeLessThan(45);
  });

  it('buys compliance with capability when it is replaced', () => {
    /*
     * The defect this replaced: morale was applied to every posture
     * equally, so politicisation produced officials who agreed, were
     * miserable, and did LESS of what they were told than the ones who
     * had not been replaced — which inverts the only mechanic the
     * posture exists for.
     */
    const replaced = machineFor('politicisation', 416).machine;
    const partnership = machineFor('partnership', 416).machine;
    expect(replaced.compliance).toBeGreaterThan(partnership.compliance);
    expect(replaced.capability).toBeLessThan(partnership.capability * 0.5);
    /* And what is complied with is being done by people who cannot do
       it, so the delivery is no better. */
    const effective = (m: CivilService) => (m.capability / 100) * m.compliance;
    expect(effective(replaced)).toBeLessThan(effective(partnership));
  });

  it('loses the memory with the people, and it does not come back', () => {
    const replaced = machineFor('politicisation', 416);
    expect(replaced.departures).toBeGreaterThan(10);
    expect(replaced.machine.memory).toBeLessThan(45);
    /* And going back to working with them does not recover it. */
    let recovering = setMachinePosture(replaced.machine, 'partnership');
    for (let t = 0; t < 624; t += 1) {
      recovering = stepCivilService(recovering, { funding: 1, demands: 1, turn: t }).machine;
    }
    expect(recovering.memory).toBeLessThan(45);
    expect(describeCivilService(recovering)).toMatch(/forgotten/);
  });

  it('orders the postures by what each one costs the norms', () => {
    expect(findPosture('partnership').normsCost).toBe(0);
    expect(findPosture('politicisation').normsCost).toBeGreaterThan(
      findPosture('confrontation').normsCost,
    );
    for (const posture of MACHINE_POSTURES) {
      expect(posture.blurb.length).toBeGreaterThan(30);
    }
  });
});

describe('delivery: what the government decided, and what happens', () => {
  it('rises with the minister and with the machine, and the machine matters more', () => {
    const machine = buildCivilService();
    const base = sittingMinisters(table())[0]!;
    const poor = delivery({ ...base, competence: 20, traits: [] }, machine);
    const good = delivery({ ...base, competence: 95, traits: [] }, machine);
    expect(good).toBeGreaterThan(poor);

    const hollow = machineFor('politicisation', 416).machine;
    expect(delivery({ ...base, competence: 95, traits: [] }, hollow)).toBeLessThan(poor);
  });

  it('is worse with nobody in post than with a poor minister', () => {
    /* A department without a minister runs itself perfectly well, which
       is not the same as being governed. */
    const machine = buildCivilService();
    const base = sittingMinisters(table())[0]!;
    expect(delivery(undefined, machine)).toBeLessThan(
      delivery({ ...base, competence: 20, traits: [] }, machine),
    );
  });

  it('gives every appointment basis a price and a thing it buys', () => {
    for (const basis of APPOINTMENT_BASES) {
      expect(basis.removalCost).toBeGreaterThan(0);
      expect(basis.blurb.length).toBeGreaterThan(30);
    }
    /* The technocrat is the ablest and the cheapest to sack, which is
       why they are the first to go when a sacking is needed. */
    expect(findBasis('technocrat').competence).toBeGreaterThan(
      findBasis('loyalist').competence,
    );
    expect(findBasis('technocrat').removalCost).toBeLessThan(
      findBasis('loyalist').removalCost,
    );
  });
});
