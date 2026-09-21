/**
 * orbat.test.ts — the army as a flow of people and as a structure.
 *
 * Two defect classes are locked down here because both were found by
 * measurement rather than by reasoning, and both were invisible to the
 * typechecker and to any test written against a single week.
 *
 * The first is a LEVEL written as a RATE, which compounds a constant
 * into a runaway. The guard against it is the fixed-point test: an
 * untouched country must sit exactly where it was found after eight
 * years, and every quantity here is written as a deviation from a
 * stated ordinary condition so that it does.
 *
 * The second is a THRESHOLD CALIBRATED AGAINST A CONVENIENT SYNTHETIC
 * NUMBER rather than the range the rest of the simulation emits. The
 * army's morale was once wired to an index that ordinarily reads fifty
 * against a formula that expected a hundred, and every country in the
 * world quietly demoralised for eight years because of it.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import {
  ARMY_SHARE,
  applyMobilisation,
  buildManpower,
  careerWeeks,
  demobilisationLockWeeks,
  effectiveStrength,
  establishment,
  mobilisationChange,
  replacementIntake,
  reserveDepth,
  restShares,
  stepManpower,
  underArms,
  type ManpowerInputs,
} from '../systems/manpower.ts';
import {
  buildOrbat,
  chainDepthFor,
  combatValue,
  commanderOf,
  describeOrbat,
  dismissCommander,
  issueOrder,
  makeCommander,
  orderLag,
  orderOfBattle,
  reliability,
  replacementDemand,
  setCommitment,
  stepOrbat,
  topEchelonFor,
  unreliableShare,
  workingEchelonFor,
  type OrbatInputs,
} from '../systems/orbat.ts';
import { MANPOWER_MODELS, findManpowerModel } from '../content/manpower.ts';
import { ECHELON_ORDER } from '../content/orbat.ts';
import { RELIABILITY_PIVOT, TRAINING_HEADROOM } from '../balance.ts';
import type { Manpower, Orbat } from '../types.ts';

const WORKFORCE = 33;

/** An ordinary week: no war, fed, funded, and nobody doing anything. */
const quiet = (turn: number): ManpowerInputs => ({
  workforce: WORKFORCE,
  unemployment: 5,
  trainingFunding: 1,
  casualties: 0,
  atWar: false,
  warIntensity: 0,
  publicSupport: 50,
  norms: 70,
  supply: 100,
  turn,
});

const war = (turn: number, over: Partial<ManpowerInputs> = {}): ManpowerInputs => ({
  ...quiet(turn),
  atWar: true,
  warIntensity: 60,
  casualties: 2,
  publicSupport: 48,
  supply: 80,
  ...over,
});

const peacetimeOrbat = (turn: number): OrbatInputs => ({
  atWar: false,
  warIntensity: 0,
  battlefield: 0,
  communications: 0.5,
  supply: 100,
  equipmentDelta: 0,
  replacements: 1,
  normsStanding: 70,
  turn,
});

const runManpower = (weeks: number, inputs: (t: number) => ManpowerInputs): Manpower => {
  let m = buildManpower(WORKFORCE, 1);
  for (let t = 0; t < weeks; t += 1) m = stepManpower(m, inputs(t)).manpower;
  return m;
};

/* ------------------------------------------------------------------ *
 * Manpower — the flow
 * ------------------------------------------------------------------ */

describe('manpower: an untouched country stays where it was found', () => {
  it('holds its force, morale, quality and reserve over eight years', () => {
    const opening = buildManpower(WORKFORCE, 1);
    const after = runManpower(416, quiet);

    /*
     * The fixed-point guard. If the opening state is not a fixed point of
     * the step, every country starts drifting on turn one and every
     * measurement taken afterwards measures the drift rather than the
     * government.
     */
    expect(underArms(after) / underArms(opening)).toBeCloseTo(1, 2);
    expect(after.morale).toBeCloseTo(opening.morale, 1);
    /* Half a point of discretisation drift over eight years. Stated as a
       bound rather than a rounding, because the bound is the guarantee. */
    expect(Math.abs(after.quality - opening.quality)).toBeLessThan(0.5);
    expect(reserveDepth(after)).toBeCloseTo(reserveDepth(opening), 1);
    expect(after.resistance).toBe(0);
  });

  it('is not held still by being frozen — the people underneath turn over', () => {
    /* A standing army replaces its whole strength over a career. If this
       ever reads zero, the force is a stock rather than a flow and the
       recruiting budget has stopped meaning anything. */
    const opening = buildManpower(WORKFORCE, 1);
    const tick = stepManpower(opening, quiet(0));
    expect(tick.discharged).toBeGreaterThan(0);
    expect(tick.arrivals).toBeGreaterThan(0);
    expect(tick.discharged).toBeCloseTo(
      replacementIntake(underArms(opening), opening.model),
      0,
    );
  });

  it('shrinks when nobody recruits, and does it with a lag of years', () => {
    let m = buildManpower(WORKFORCE, 1);
    const opening = underArms(m);
    for (let t = 0; t < 52; t += 1) {
      m = stepManpower(m, { ...quiet(t), trainingFunding: 0 }).manpower;
    }
    /*
     * A year of cutting recruiting costs a few per cent — nothing that
     * shows up as a crisis, nothing anybody resigns over. That is the
     * trap: the saving is banked now and the army is smaller under a
     * government that will not be this one.
     */
    expect(underArms(m) / opening).toBeGreaterThan(0.9);
    expect(underArms(m) / opening).toBeLessThan(0.97);
    for (let t = 52; t < 416; t += 1) {
      m = stepManpower(m, { ...quiet(t), trainingFunding: 0 }).manpower;
    }
    expect(underArms(m) / opening).toBeLessThan(0.8);
  });
});

describe('manpower: length of service decides the shape of the army', () => {
  it('solves a rest shape for every arrangement, and they sum to one', () => {
    for (const model of MANPOWER_MODELS) {
      const rest = restShares(model);
      expect(rest.recruits + rest.trained + rest.veterans).toBeCloseTo(1, 3);
      expect(careerWeeks(model)).toBe(14 + findManpowerModel(model).serviceWeeks);
    }
  });

  it('gives conscription a huge army of people who are not soldiers yet', () => {
    const professional = restShares('professional');
    const conscript = restShares('conscript');

    /* The whole argument against conscription in two numbers: it raises
       far more people, of whom a sixth are still in training and a
       twentieth have ever seen anything. */
    expect(conscript.recruits).toBeGreaterThan(professional.recruits * 4);
    expect(conscript.veterans).toBeLessThan(professional.veterans * 0.25);
    expect(
      establishment(1_000_000, 'conscript', false) /
        establishment(1_000_000, 'professional', false),
    ).toBeGreaterThan(4);
  });

  it('makes veterans by fighting and very nearly not at all otherwise', () => {
    const peace = runManpower(208, quiet);
    const fought = runManpower(208, (t) => (t > 26 ? war(t, { casualties: 0 }) : quiet(t)));
    /*
     * Counted absolutely rather than as a share. A war also floods the
     * army with recruits and reservists, so the veteran SHARE can fall
     * while the number of people who have been in a war rises — which is
     * both true and the reason an army three years into a war is not the
     * army that started it.
     */
    expect(fought.veterans).toBeGreaterThan(peace.veterans * 1.6);
  });
});

describe('manpower: the pipeline is the constraint nobody plans for', () => {
  it('cannot raise an army faster than it can train one', () => {
    let m = buildManpower(WORKFORCE, 1);
    /* Empty the reserve first, so the only way in is through training. */
    m = { ...m, reserves: 0 };
    let bound = false;
    for (let t = 0; t < 104; t += 1) {
      const tick = stepManpower(m, war(t, { casualties: 0 }));
      m = tick.manpower;
      bound = bound || tick.pipelineBound;
    }
    expect(bound).toBe(true);
    /* Two years of war and the force is nowhere near the establishment a
       war reaches for, because the building is the limit and the
       building takes years. */
    expect(underArms(m)).toBeLessThan(establishment(m.pool, m.model, true) * 0.65);
  });

  it('empties the reserve, and that is the week the war changes character', () => {
    let m = buildManpower(WORKFORCE, 1);
    let emptied = -1;
    for (let t = 0; t < 208; t += 1) {
      const tick = stepManpower(m, war(t));
      m = tick.manpower;
      if (tick.reserveExhausted) emptied = t;
    }
    expect(emptied).toBeGreaterThan(0);
    expect(reserveDepth(m)).toBeLessThan(0.1);
  });

  it('opens with a training establishment that exactly covers replacement', () => {
    const m = buildManpower(WORKFORCE, 1);
    expect(m.trainingCapacity).toBeCloseTo(
      replacementIntake(underArms(m), m.model) * TRAINING_HEADROOM,
      0,
    );
  });
});

describe('manpower: an army that doubles does not double', () => {
  it('loses quality as the numbers rise', () => {
    let m = applyMobilisation(buildManpower(WORKFORCE, 1), 'conscript', 0);
    const opening = m.quality;
    for (let t = 0; t < 260; t += 1) m = stepManpower(m, war(t, { casualties: 0 })).manpower;
    expect(underArms(m)).toBeGreaterThan(underArms(buildManpower(WORKFORCE, 1)) * 1.5);
    expect(m.quality).toBeLessThan(opening);
  });

  it('spends the experienced first, because they are the ones sent', () => {
    let m = buildManpower(WORKFORCE, 1);
    const before = m.veterans / underArms(m);
    for (let t = 0; t < 104; t += 1) {
      m = stepManpower(m, { ...war(t), warIntensity: 5, casualties: 4 }).manpower;
    }
    /* At low intensity almost nobody is being made a veteran, so what
       this measures is who is being lost. */
    expect(m.veterans / underArms(m)).toBeLessThan(before);
  });

  it('counts a recruit as a third of a soldier and a veteran as half again', () => {
    const base = buildManpower(WORKFORCE, 1);
    const force = underArms(base);
    const allRecruits = effectiveStrength({ ...base, recruits: force, trained: 0, veterans: 0 });
    const allTrained = effectiveStrength({ ...base, recruits: 0, trained: force, veterans: 0 });
    const allVeterans = effectiveStrength({ ...base, recruits: 0, trained: 0, veterans: force });
    expect(allRecruits).toBeLessThan(allTrained * 0.4);
    expect(allVeterans).toBeGreaterThan(allTrained * 1.5);
  });
});

describe('manpower: mobilisation is a ratchet', () => {
  it('goes up in an afternoon', () => {
    const m = buildManpower(WORKFORCE, 1);
    const up = mobilisationChange(m, 'conscript', 0);
    expect(up.allowed).toBe(true);
    expect(up.approvalCost).toBeGreaterThan(0);
    expect(up.normsCost).toBeGreaterThan(0);
  });

  it('and does not come down for years', () => {
    const m = applyMobilisation(buildManpower(WORKFORCE, 1), 'conscript', 10);
    expect(demobilisationLockWeeks(m, 10)).toBe(findManpowerModel('conscript').demobilisationWeeks);
    expect(mobilisationChange(m, 'professional', 60).allowed).toBe(false);
    expect(mobilisationChange(m, 'professional', 10 + 104).allowed).toBe(true);
  });

  it('but the headcount comes down on its own once the war stops', () => {
    let m = buildManpower(WORKFORCE, 1);
    const peace = underArms(m);
    for (let t = 0; t < 156; t += 1) m = stepManpower(m, war(t, { casualties: 0 })).manpower;
    const mobilised = underArms(m);
    expect(mobilised).toBeGreaterThan(peace * 1.1);
    for (let t = 156; t < 260; t += 1) m = stepManpower(m, quiet(t)).manpower;
    /* Back to the establishment inside two years, because the emergency
       extensions lapse all at once and nobody will sign another. */
    expect(underArms(m) / peace).toBeLessThan(1.05);
  });

  it('builds resistance where the arrangement asks a lot of an unwilling country', () => {
    let m = applyMobilisation(buildManpower(WORKFORCE, 1), 'total_mobilisation', 0);
    for (let t = 0; t < 208; t += 1) {
      m = stepManpower(m, war(t, { publicSupport: 22, norms: 45 })).manpower;
    }
    expect(m.resistance).toBeGreaterThan(0.4);
    /* And a country looking for a way out does not raise the numbers on
       paper, whatever the statute says. */
    expect(m.morale).toBeLessThan(buildManpower(WORKFORCE, 1).morale);
  });
});

describe('manpower: an army can stop existing without losing a battle', () => {
  it('loses people to desertion when morale goes', () => {
    let m = buildManpower(WORKFORCE, 1);
    let alarmed = false;
    for (let t = 0; t < 208; t += 1) {
      const tick = stepManpower(m, war(t, { supply: 25, publicSupport: 15, casualties: 0 }));
      m = tick.manpower;
      alarmed = alarmed || tick.desertionAlarm;
    }
    expect(alarmed).toBe(true);
    expect(m.desertion).toBeGreaterThan(0);
    expect(m.morale).toBeLessThan(45);
  });

  it('survives a casualty figure out of all proportion to the force', () => {
    /* The war engine computes casualties from the fighting without
       knowing how many people are in the army. A small country in a
       large war must not be annihilated by an integer. */
    let m = buildManpower(2, 1);
    for (let t = 0; t < 52; t += 1) m = stepManpower(m, war(t, { casualties: 900 })).manpower;
    expect(underArms(m)).toBeGreaterThan(0);
    expect(Number.isFinite(underArms(m))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Order of battle — the structure
 * ------------------------------------------------------------------ */

const build = (personnel: number, norms = 70): Orbat =>
  buildOrbat(personnel, 'verdana' as never, new Rng(42), new Set<string>(), norms);

describe('orbat: large armies are slow', () => {
  it('puts more headquarters between the desk and the rifle company', () => {
    const small = build(20_000);
    const large = build(1_400_000);
    expect(chainDepthFor(large.topLevel)).toBeGreaterThan(chainDepthFor(small.topLevel));
    expect(orderLag(large, 0.5)).toBeGreaterThan(orderLag(small, 0.5) * 2);
  });

  it('shortens the chain with communications but never removes it', () => {
    const o = build(1_400_000);
    expect(orderLag(o, 1)).toBeLessThan(orderLag(o, 0));
    expect(orderLag(o, 1)).toBeGreaterThan(0.5);
    expect(orderLag(o, 1)).toBeGreaterThanOrEqual(0.5);
  });

  it('delivers an order on a battlefield that has already moved', () => {
    const o = build(1_400_000);
    const issued = issueOrder(
      o,
      { id: 'o1', kind: 'advance', formationId: o.formations[0]!.id },
      0.5,
      0,
    );
    expect(issued.orders).toHaveLength(1);
    expect(issued.orders[0]!.weeksRemaining).toBeGreaterThan(1);

    let state = issued;
    let arrived = 0;
    for (let t = 0; t < 8; t += 1) {
      const tick = stepOrbat(state, peacetimeOrbat(t));
      state = tick.orbat;
      if (tick.executed.length) arrived = t;
    }
    expect(arrived).toBeGreaterThan(0);
    expect(state.orders).toHaveLength(0);
  });

  it('gives the country a working echelon sized to its army', () => {
    expect(workingEchelonFor(20_000)).toBe('battalion');
    expect(ECHELON_ORDER.indexOf(workingEchelonFor(1_400_000))).toBeLessThan(
      ECHELON_ORDER.indexOf(workingEchelonFor(20_000)),
    );
    expect(topEchelonFor(1_400_000)).toBe('army_group');
    expect(topEchelonFor(4_000)).toBe('brigade');
  });
});

describe('orbat: the army adds up', () => {
  it('accounts for every soldier and every arm of service', () => {
    for (const personnel of [6_000, 24_000, 190_000, 1_400_000]) {
      const o = build(personnel);
      const total = o.formations.reduce((s, f) => s + f.personnel, 0);
      expect(total).toBeCloseTo(personnel, -1);
      /* A country does not stop having engineers because its working
         echelon grew past them. */
      expect(new Set(o.formations.map((f) => f.kind)).size).toBeGreaterThan(8);
      expect(orderOfBattle(o).reduce((s, r) => s + r.personnel, 0)).toBeCloseTo(personnel, -1);
    }
  });

  it('calls each formation what it actually is', () => {
    const o = build(1_400_000);
    for (const f of o.formations) {
      const template = ECHELON_ORDER.indexOf(f.echelon);
      expect(template).toBeGreaterThanOrEqual(0);
    }
    /* A superpower fields corps of infantry and brigades of special
       forces, and both are in the same list. */
    expect(new Set(o.formations.map((f) => f.echelon)).size).toBeGreaterThan(1);
  });
});

describe('orbat: competence and loyalty do not correlate', () => {
  it('draws them independently', () => {
    const rng = new Rng(9);
    const used = new Set<string>();
    let sumC = 0;
    let sumL = 0;
    let sumCL = 0;
    const n = 400;
    for (let i = 0; i < n; i += 1) {
      const c = makeCommander('corps', 'verdana' as never, rng, used, 0);
      sumC += c.competence;
      sumL += c.loyalty;
      sumCL += c.competence * c.loyalty;
    }
    const covariance = sumCL / n - (sumC / n) * (sumL / n);
    /* Near zero. A government that wants both has to be lucky rather
       than clever, and that is the point of the object. */
    expect(Math.abs(covariance)).toBeLessThan(40);
  });

  it('produces the able and unreliable officer often enough to matter', () => {
    const rng = new Rng(4);
    const used = new Set<string>();
    let able = 0;
    const n = 600;
    for (let i = 0; i < n; i += 1) {
      const c = makeCommander('corps', 'verdana' as never, rng, used, 0);
      if (c.competence > 70 && reliability(c) < RELIABILITY_PIVOT) able += 1;
    }
    expect(able / n).toBeGreaterThan(0.04);
    expect(able / n).toBeLessThan(0.3);
  });
});

describe('orbat: the officer corps follows the state of the norms', () => {
  it('gives a well-run country an army it can rely on and a badly-run one an army it cannot', () => {
    const shareAt = (norms: number) => {
      const rng = new Rng(11);
      const used = new Set<string>();
      let sum = 0;
      for (let i = 0; i < 30; i += 1) {
        sum += unreliableShare(
          buildOrbat(190_000, 'verdana' as never, rng, used, norms),
        );
      }
      return sum / 30;
    };
    const good = shareAt(85);
    const poor = shareAt(40);
    expect(good).toBeLessThan(0.15);
    expect(poor).toBeGreaterThan(good * 2.5);
  });

  it('measures doubt by degrees rather than counting generals', () => {
    /*
     * The share used to be a quarter-counter: with four commanders it
     * could only ever read 0, 0.25, 0.5, 0.75 or 1, and it sat on one of
     * them unchanged for eight years. What a government needs to know is
     * how much of the army is doubtful, and that moves continuously.
     */
    const seen = new Set<number>();
    for (let norms = 20; norms <= 90; norms += 5) {
      seen.add(Math.round(unreliableShare(build(190_000, norms)) * 1000));
    }
    expect(seen.size).toBeGreaterThan(6);
  });

  it('is not loyal when nobody is in command', () => {
    const o = build(190_000);
    const orphaned: Orbat = {
      ...o,
      formations: o.formations.map((f) => ({ ...f, parentId: 'nobody' })),
    };
    expect(unreliableShare(orphaned)).toBe(1);
  });
});

describe('orbat: sacking the general who lost the battle', () => {
  it('costs standing with the officers who did not lose one', () => {
    const o = build(190_000);
    const target = o.commanders[0]!;
    const respected: Orbat = {
      ...o,
      commanders: o.commanders.map((c) => ({ ...c, standing: 70 })),
    };
    const before = respected.commanders[1]!.loyalty;
    const after = dismissCommander(
      respected,
      target.id,
      'verdana' as never,
      new Rng(5),
      new Set<string>(),
      12,
    );
    expect(after.loyaltyCost).toBeGreaterThan(0);
    expect(commanderOf(after.orbat, target.id)).toBeUndefined();
    expect(after.orbat.commanders.find((c) => c.id === o.commanders[1]!.id)!.loyalty).toBeLessThan(
      before,
    );
    /* And the formations answer to somebody by the end of the week. */
    expect(after.replacement).toBeDefined();
    expect(
      after.orbat.formations.filter((f) => f.parentId === after.replacement!.id).length,
    ).toBeGreaterThan(0);
    expect(unreliableShare(after.orbat)).toBeLessThan(1);
  });

  it('costs almost nothing when the army had also given up on them', () => {
    const o = build(190_000);
    const written: Orbat = {
      ...o,
      commanders: o.commanders.map((c) => ({ ...c, standing: 20 })),
    };
    const after = dismissCommander(
      written,
      o.commanders[0]!.id,
      'verdana' as never,
      new Rng(5),
      new Set<string>(),
      12,
    );
    expect(after.loyaltyCost).toBe(0);
  });
});

describe('orbat: a formation is a condition, not a headcount', () => {
  it('is worth almost nothing unsupplied', () => {
    const o = build(190_000);
    const f = o.formations[0]!;
    const commander = commanderOf(o, f.parentId);
    const fed = combatValue({ ...f, supply: 100 }, commander, 'defence');
    const starved = combatValue({ ...f, supply: 10 }, commander, 'defence');
    /* Not a modest penalty. An unsupplied formation stops being one. */
    expect(starved).toBeLessThan(fed * 0.1);
  });

  it('is worth less with nobody in command than with anybody in command', () => {
    const o = build(190_000);
    const f = o.formations[0]!;
    const worst = makeCommander('corps', 'verdana' as never, new Rng(1), new Set(), 0);
    expect(combatValue(f, undefined, 'defence')).toBeLessThan(
      combatValue(f, { ...worst, competence: 40 }, 'defence'),
    );
  });

  it('holds its equipment in peace and loses it under fire', () => {
    const o = setCommitment(
      build(190_000),
      build(190_000).formations.map((f) => f.id),
      true,
    );
    const peace = stepOrbat(o, peacetimeOrbat(0));
    expect(peace.orbat.formations[0]!.equipment).toBeCloseTo(o.formations[0]!.equipment, 3);

    let fighting = o;
    for (let t = 0; t < 104; t += 1) {
      fighting = stepOrbat(fighting, {
        ...peacetimeOrbat(t),
        atWar: true,
        warIntensity: 60,
        supply: 70,
      }).orbat;
    }
    expect(fighting.formations[0]!.equipment).toBeLessThan(o.formations[0]!.equipment - 15);
  });

  it('rebuilds only as fast as there are people to rebuild it with', () => {
    const base = build(190_000);
    const worn: Orbat = {
      ...base,
      formations: base.formations.map((f) => ({ ...f, strength: 50, committed: false })),
    };
    expect(replacementDemand(worn)).toBeGreaterThan(0);

    const run = (replacements: number) => {
      let o = worn;
      for (let t = 0; t < 52; t += 1) {
        o = stepOrbat(o, { ...peacetimeOrbat(t), replacements }).orbat;
      }
      return o.formations[0]!.strength;
    };
    expect(run(0)).toBe(50);
    expect(run(1)).toBeGreaterThan(run(0.2));
    expect(run(1)).toBeGreaterThan(70);
  });

  it('learns by fighting and not by training', () => {
    const o = setCommitment(build(190_000), [build(190_000).formations[0]!.id], true);
    const run = (atWar: boolean) => {
      let s = o;
      for (let t = 0; t < 104; t += 1) {
        s = stepOrbat(s, { ...peacetimeOrbat(t), atWar, warIntensity: atWar ? 60 : 0 }).orbat;
      }
      return s.formations[0]!.experience - o.formations[0]!.experience;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 5);
  });
});

describe('orbat: an untouched army stays where it was found', () => {
  it('holds strength, equipment and supply over eight years of peace', () => {
    const opening = build(190_000);
    let o = opening;
    for (let t = 0; t < 416; t += 1) o = stepOrbat(o, peacetimeOrbat(t)).orbat;
    expect(o.formations[0]!.strength).toBeCloseTo(opening.formations[0]!.strength, 3);
    expect(o.formations[0]!.equipment).toBeCloseTo(opening.formations[0]!.equipment, 3);
    expect(o.formations[0]!.supply).toBeGreaterThan(95);
    expect(o.history).toHaveLength(208);
  });

  it('says one true thing about the army without being asked twice', () => {
    expect(describeOrbat(build(190_000), 0.5)).toMatch(/\S/);
    expect(describeOrbat(build(1_400_000), 0.1)).toMatch(/headquarters/);
  });
});

describe('orbat and manpower agree about how many soldiers there are', () => {
  it('makes the army a share of everybody under arms rather than a second figure', () => {
    const m = buildManpower(WORKFORCE, 1);
    const army = underArms(m) * ARMY_SHARE;
    const o = build(army);
    expect(o.formations.reduce((s, f) => s + f.personnel, 0)).toBeCloseTo(army, -1);
    expect(ARMY_SHARE).toBeGreaterThan(0.3);
    expect(ARMY_SHARE).toBeLessThan(0.8);
  });
});
