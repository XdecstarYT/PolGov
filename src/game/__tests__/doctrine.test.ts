/**
 * doctrine.test.ts — what the army believes, and what it is buying for
 * a decade it cannot see.
 *
 * The defect found by measuring: a war going badly taught the army that
 * the doctrine it had just lost with was the right one. Which is
 * backwards — a losing war is not evidence for anything the loser is
 * already doing. Armies adopt the doctrine of whoever beat them, and
 * nobody has ever adopted the doctrine of an army they beat.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import { buildOrbat } from '../systems/orbat.ts';
import {
  adoptionRate,
  buildDoctrine,
  cancelResearch,
  describeDoctrine,
  describeResearch,
  doctrineChange,
  doctrineEffect,
  doctrineFit,
  effectiveness,
  forceDoctrine,
  orderDoctrine,
  researchCost,
  running,
  startResearch,
  stepDoctrine,
  yearsToAdopt,
  type DoctrineInputs,
} from '../systems/doctrine.ts';
import {
  WAR_DOCTRINE_TEMPLATES,
  HALF_ADOPTED_PENALTY,
  RESEARCH_TEMPLATES,
  findResearch,
  findWarDoctrine,
} from '../content/doctrine.ts';
import { ADOPTION_YEARS, TURNS_PER_YEAR } from '../balance.ts';
import type { Doctrine, Orbat } from '../types.ts';

const army = (): Orbat => buildOrbat(190_000, 'verdana' as never, new Rng(3), new Set());

const quiet = (turn: number, over: Partial<DoctrineInputs> = {}): DoctrineInputs => ({
  orbat: army(),
  turnover: 0,
  atWar: false,
  battlefield: 0,
  opposing: null,
  funding: 1,
  turn,
  ...over,
});

const run = (
  doctrine: Doctrine,
  weeks: number,
  inputs: (t: number) => DoctrineInputs = quiet,
) => {
  let d = doctrine;
  const out = { adoptedAt: -1, learnedAt: -1, delivered: [] as { field: string; dated: boolean; worth: number }[] };
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepDoctrine(d, inputs(t));
    d = tick.doctrine;
    if (tick.adopted && out.adoptedAt < 0) out.adoptedAt = t;
    if (tick.learned && out.learnedAt < 0) out.learnedAt = t;
    for (const item of tick.delivered) {
      out.delivered.push({
        field: item.programme.field,
        dated: item.dated,
        worth: item.programme.realised ?? 0,
      });
    }
  }
  return { doctrine: d, ...out };
};

/* ------------------------------------------------------------------ *
 * Doctrine is a belief system
 * ------------------------------------------------------------------ */

describe('doctrine: a government can order a change and the army will not make one', () => {
  it('keeps what was ordered and what is done as separate facts', () => {
    const ordered = orderDoctrine(buildDoctrine(), 'manoeuvre', 0);
    expect(ordered.ordered).toBe('manoeuvre');
    expect(ordered.current).toBe('combined_arms');
    expect(ordered.adoption).toBe(0);
    /* Restating it every week changes nothing. */
    const restated = orderDoctrine(ordered, 'manoeuvre', 52);
    expect(restated.current).toBe('combined_arms');
  });

  it('moves at the speed of officer turnover, which is years', () => {
    const out = run(orderDoctrine(buildDoctrine(), 'manoeuvre', 0), 1040);
    expect(out.adoptedAt).toBeGreaterThan(ADOPTION_YEARS * TURNS_PER_YEAR);
    expect(out.doctrine.current).toBe('manoeuvre');
    expect(out.doctrine.ordered).toBeNull();
  });

  it('takes longer for the doctrines that ask most of subordinates', () => {
    const easy = orderDoctrine(buildDoctrine(), 'positional', 0);
    const hard = orderDoctrine(buildDoctrine(), 'counterinsurgency', 0);
    expect(yearsToAdopt(hard)).toBeGreaterThan(yearsToAdopt(easy) * 2);
    expect(findWarDoctrine('counterinsurgency').delegation).toBeGreaterThan(
      findWarDoctrine('positional').delegation,
    );
  });

  it('makes the army worse at both while it is halfway', () => {
    /*
     * The cost nobody prices when ordering a change. It is not a cost of
     * the new doctrine; it is a cost of not yet having it while no
     * longer quite having the old one.
     */
    const settled = buildDoctrine();
    expect(effectiveness(settled)).toBe(1);

    const halfway: Doctrine = { ...orderDoctrine(settled, 'manoeuvre', 0), adoption: 0.5 };
    expect(effectiveness(halfway)).toBeCloseTo(HALF_ADOPTED_PENALTY, 3);
    expect(effectiveness({ ...halfway, adoption: 0.05 })).toBeGreaterThan(effectiveness(halfway));
    expect(effectiveness({ ...halfway, adoption: 0.95 })).toBeGreaterThan(effectiveness(halfway));
  });

  it('delivers a doctrine that is believed in full and one that is not in part', () => {
    const believed = buildDoctrine('manoeuvre');
    const half: Doctrine = { ...orderDoctrine(buildDoctrine(), 'manoeuvre', 0), adoption: 0.5 };
    expect(doctrineEffect(believed, 'attack')).toBeCloseTo(
      findWarDoctrine('manoeuvre').attack,
      3,
    );
    expect(doctrineEffect(half, 'attack')).toBeLessThan(doctrineEffect(believed, 'attack'));
  });
});

describe('doctrine: every army prepares for the last war, and it is rational to', () => {
  it('takes up a doctrine the last war vindicated about twice as fast', () => {
    const neutral = orderDoctrine(buildDoctrine(), 'manoeuvre', 0);
    const vindicated: Doctrine = { ...neutral, lastWarLesson: 'manoeuvre' };
    expect(adoptionRate(vindicated)).toBeGreaterThan(adoptionRate(neutral) * 1.8);
    expect(yearsToAdopt(vindicated)).toBeLessThan(yearsToAdopt(neutral));
  });

  it('and one it appeared to refute at less than half the speed', () => {
    const neutral = orderDoctrine(buildDoctrine(), 'manoeuvre', 0);
    const entrenched: Doctrine = { ...neutral, lastWarLesson: 'combined_arms' };
    expect(adoptionRate(entrenched)).toBeLessThan(adoptionRate(neutral) * 0.6);
    /* Twenty years or so, which is a generation and is the honest
       answer rather than a punishment. */
    expect(yearsToAdopt(entrenched)).toBeGreaterThan(18);
  });

  it('charges almost nothing for ordering what the evidence supports', () => {
    const backed: Doctrine = { ...buildDoctrine(), lastWarLesson: 'manoeuvre' };
    const unbacked = buildDoctrine();
    expect(doctrineChange(backed, 'manoeuvre').approvalCost).toBeLessThan(
      doctrineChange(unbacked, 'manoeuvre').approvalCost,
    );
    expect(doctrineChange(backed, 'manoeuvre').vindicated).toBe(true);
  });

  it('learns from the army that beat it, not from the one it beat', () => {
    /*
     * The defect this replaced: a war going badly set the lesson to the
     * doctrine that had just lost with, which is not evidence for
     * anything. Nobody has ever adopted the doctrine of an army they
     * beat.
     */
    const losing = run(buildDoctrine(), 208, (t) =>
      quiet(t, { atWar: true, battlefield: -0.7, opposing: 'deep_battle' }),
    );
    expect(losing.doctrine.lastWarLesson).toBe('deep_battle');

    const winning = run(buildDoctrine(), 208, (t) =>
      quiet(t, { atWar: true, battlefield: 0.7, opposing: 'deep_battle' }),
    );
    expect(winning.doctrine.lastWarLesson).toBe('combined_arms');
  });

  it('learns nothing from a war that is going neither way', () => {
    const drawn = run(buildDoctrine(), 208, (t) =>
      quiet(t, { atWar: true, battlefield: 0.1, opposing: 'deep_battle' }),
    );
    expect(drawn.doctrine.lastWarLesson).toBeNull();
  });
});

describe('doctrine: forcing it through', () => {
  it('works, immediately, and costs the officer corps', () => {
    const orbat = army();
    const before = orbat.commanders.reduce((s, c) => s + c.competence, 0);
    const out = forceDoctrine(orderDoctrine(buildDoctrine(), 'counterinsurgency', 0), orbat);

    expect(out.doctrine.current).toBe('counterinsurgency');
    expect(out.doctrine.adoption).toBe(1);
    expect(out.competenceLost).toBeGreaterThan(before * 0.25);
    /* And the ones who remain draw a conclusion about what this
       government does to people who were right at the time. */
    expect(out.orbat.commanders[0]!.loyalty).toBeLessThan(orbat.commanders[0]!.loyalty);
  });

  it('does nothing when nothing was ordered', () => {
    const out = forceDoctrine(buildDoctrine(), army());
    expect(out.competenceLost).toBe(0);
  });
});

describe('doctrine: ground decides whether any of it was the right belief', () => {
  it('rewards a doctrine on the ground it was learned for', () => {
    const manoeuvre = buildDoctrine('manoeuvre');
    expect(doctrineFit(manoeuvre, 'plains')).toBeGreaterThan(1);
    expect(doctrineFit(manoeuvre, 'mountains')).toBeLessThan(1);
    const counterinsurgency = buildDoctrine('counterinsurgency');
    expect(doctrineFit(counterinsurgency, 'urban')).toBeGreaterThan(
      doctrineFit(manoeuvre, 'urban'),
    );
  });

  it('gives every doctrine somewhere it is wrong', () => {
    for (const template of WAR_DOCTRINE_TEMPLATES) {
      expect(template.favours.length).toBeGreaterThan(0);
      expect(template.poorIn.length).toBeGreaterThan(0);
      expect(template.learnedFrom.length).toBeGreaterThan(20);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Research
 * ------------------------------------------------------------------ */

describe('research: delivers after the war it was for', () => {
  it('records the doctrine it was specified against', () => {
    const started = startResearch(buildDoctrine(), 'precision', 0);
    expect(started.doctrine.programmes[0]!.specifiedFor).toBe('combined_arms');
    expect(started.dueTurn).toBeGreaterThan(TURNS_PER_YEAR * 7);
  });

  it('delivers what was promised when the army still believes the same thing', () => {
    const started = startResearch(buildDoctrine(), 'precision', 0).doctrine;
    const out = run(started, Math.round(9 * TURNS_PER_YEAR));
    expect(out.delivered).toHaveLength(1);
    expect(out.delivered[0]!.dated).toBe(false);
    expect(out.delivered[0]!.worth).toBeCloseTo(findResearch('precision').benefit, 3);
  });

  it('delivers a fraction of it when the decade has moved on', () => {
    let d = startResearch(buildDoctrine(), 'precision', 0).doctrine;
    d = forceDoctrine(orderDoctrine(d, 'counterinsurgency', 4), army()).doctrine;
    const out = run(d, Math.round(9 * TURNS_PER_YEAR));
    expect(out.delivered[0]!.dated).toBe(true);
    expect(out.delivered[0]!.worth).toBeLessThan(findResearch('precision').benefit * 0.5);
  });

  it('dates the specific things and not the general ones', () => {
    /* A better radio is a better radio. A weapon built for an engagement
       that stopped happening is a museum piece. */
    const specific = findResearch('firepower');
    const general = findResearch('communications');
    expect(specific.specificity).toBeGreaterThan(general.specificity * 3);

    const survives = (field: 'firepower' | 'communications') => {
      let d = startResearch(buildDoctrine(), field, 0).doctrine;
      d = forceDoctrine(orderDoctrine(d, 'counterinsurgency', 4), army()).doctrine;
      const out = run(d, Math.round(10 * TURNS_PER_YEAR));
      return out.delivered[0]!.worth / findResearch(field).benefit;
    };
    expect(survives('communications')).toBeGreaterThan(survives('firepower') * 2);
  });

  it('costs every year it runs and gives nothing back until it lands', () => {
    const started = startResearch(buildDoctrine(), 'firepower', 0).doctrine;
    expect(researchCost(started, 1)).toBeCloseTo(findResearch('firepower').annualCost, 3);
    expect(running(started)).toHaveLength(1);
    const halfway = run(started, Math.round(4 * TURNS_PER_YEAR)).doctrine;
    expect(halfway.capability).toBe(0);
    expect(running(halfway)).toHaveLength(1);
  });

  it('cancels, and the years already spent do not come back', () => {
    const started = startResearch(buildDoctrine(), 'firepower', 0).doctrine;
    const cancelled = cancelResearch(started, started.programmes[0]!.id);
    expect(running(cancelled)).toHaveLength(0);
    expect(cancelled.capability).toBe(0);
  });

  it('gives every field a lead time longer than a term', () => {
    const term = 4;
    for (const template of RESEARCH_TEMPLATES) {
      expect(template.annualCost).toBeGreaterThan(0);
      expect(template.benefit).toBeGreaterThan(0);
      if (template.key !== 'uncrewed') expect(template.leadYears).toBeGreaterThan(term);
    }
    /* With one exception, because the short lead time is the entire
       reason that category exists. */
    expect(findResearch('uncrewed').leadYears).toBeLessThan(term);
  });

  it('says one true thing about both', () => {
    expect(describeDoctrine(buildDoctrine())).toMatch(/\S/);
    expect(describeResearch(buildDoctrine(), 0)).toMatch(/twelve years/);
    const mid = orderDoctrine(buildDoctrine(), 'manoeuvre', 0);
    expect(describeDoctrine(mid)).toMatch(/worse at both/);
  });
});
