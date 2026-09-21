/**
 * opinion.test.ts — the trap, and the price of trust.
 *
 * The claim this file exists to protect is the one a player is least
 * likely to believe: a government that fails AND destroys the belief that
 * politics can fix anything ends up with a QUIETER country than one that
 * merely fails. Protest, petitions and organised activism all fall. Every
 * measure a government would be judged by improves. It is the worse
 * outcome by a distance and it looks exactly like success.
 *
 * So the two failing countries are run side by side and the quiet one is
 * shown to be the angrier one. If that ever inverts, the most interesting
 * thing in this engine has gone.
 *
 * The rest is arithmetic with consequences: distrust spreads and trust
 * does not, and the gap between tax owed and tax collected is trust
 * rather than enforcement.
 */

import { describe, expect, it } from 'vitest';
import {
  buildOpinion,
  complianceFactor,
  institutionalTrust,
  mobilisation,
  stepOpinion,
  trustOf,
  type OpinionInputs,
} from '../systems/opinion.ts';
import { TRUST_KEYS } from '../content/trust.ts';
import { COMPLIANCE_FLOOR } from '../balance.ts';
import type { Opinion } from '../types.ts';

const inputs = (over: Partial<OpinionInputs> = {}): OpinionInputs => ({
  approval: 48,
  growth: 2.1,
  unemployment: 5,
  lowerDisposable: 100,
  costOfLivingChange: 2.5,
  qualityOfLife: 66,
  happiness: 50,
  polarisation: 0.35,
  norms: 72,
  corruption: 0,
  courtsQuality: 62,
  policeQuality: 60,
  adminQuality: 60,
  crimeRate: 20,
  mediaConcentration: 0.4,
  disinformation: 0,
  incomeGini: 0.33,
  legislativeSuccess: 0.55,
  externalTension: 30,
  turn: 1,
  ...over,
});

function run(weeks: number, over: Partial<OpinionInputs> = {}) {
  let opinion = buildOpinion();
  let withdrew = false;
  let withdrawals = 0;
  const collapsed = new Set<string>();
  for (let t = 1; t <= weeks; t += 1) {
    const tick = stepOpinion(opinion, { ...inputs(over), turn: t });
    opinion = tick.opinion;
    if (tick.withdrawn) {
      withdrew = true;
      withdrawals += 1;
    }
    for (const key of tick.collapsed) collapsed.add(key);
  }
  return { opinion, withdrew, withdrawals, collapsed };
}

const YEARS = (n: number) => n * 52;

/** A country that is failing its people. */
const FAILING: Partial<OpinionInputs> = {
  approval: 30,
  qualityOfLife: 45,
  lowerDisposable: 80,
  happiness: 38,
};
/** One that still answers when pushed. */
const RESPONSIVE: Partial<OpinionInputs> = { legislativeSuccess: 0.8, polarisation: 0.2 };
/** And one that has stopped. */
const UNRESPONSIVE: Partial<OpinionInputs> = {
  legislativeSuccess: 0.05,
  polarisation: 0.95,
  norms: 30,
};

describe('the trap', () => {
  it('makes the worse country the quieter one', () => {
    const responsive = run(YEARS(8), { ...FAILING, ...RESPONSIVE });
    const unresponsive = run(YEARS(8), { ...FAILING, ...UNRESPONSIVE });

    /* The unresponsive country is ANGRIER. */
    expect(unresponsive.opinion.frustration).toBeGreaterThan(
      responsive.opinion.frustration,
    );
    /* And quieter on every measure of it. */
    expect(unresponsive.opinion.protestParticipation).toBeLessThan(
      responsive.opinion.protestParticipation,
    );
    expect(unresponsive.opinion.petitionParticipation).toBeLessThan(
      responsive.opinion.petitionParticipation,
    );
    expect(unresponsive.opinion.activism).toBeLessThan(responsive.opinion.activism);
    expect(unresponsive.opinion.engagement).toBeLessThan(responsive.opinion.engagement);
  });

  it('says so, once, on the week the country gives up', () => {
    const gaveUp = run(YEARS(8), { ...FAILING, ...UNRESPONSIVE });
    expect(gaveUp.withdrew).toBe(true);
    /*
     * Exactly once. Both halves of the test use the same threshold: with
     * two different ones the drive moved too slowly for any single week
     * to span the gap and the transition never fired at all.
     */
    expect(gaveUp.withdrawals).toBe(1);

    const stillTrying = run(YEARS(8), { ...FAILING, ...RESPONSIVE });
    expect(stillTrying.withdrew).toBe(false);
  });

  it('needs both anger and belief to produce any action at all', () => {
    /* Content and efficacious: nothing to march about. */
    const content = run(YEARS(4), { approval: 70, qualityOfLife: 85, happiness: 62 });
    /* Furious and hopeless: nothing to march for. */
    const hopeless = run(YEARS(8), { ...FAILING, ...UNRESPONSIVE });
    /* Furious and hopeful: the only combination that marches. */
    const angry = run(YEARS(4), { ...FAILING, ...RESPONSIVE });

    expect(angry.opinion.protestParticipation).toBeGreaterThan(
      content.opinion.protestParticipation,
    );
    expect(angry.opinion.protestParticipation).toBeGreaterThan(
      hopeless.opinion.protestParticipation,
    );
    expect(mobilisation(angry.opinion)).toBeGreaterThan(mobilisation(hopeless.opinion));
  });
});

describe('trust', () => {
  it('spreads downward and not upward', () => {
    /*
     * The asymmetry. One institution failing drags the others; one
     * institution recovering does not lift them, which is why
     * institutional trust is so much cheaper to destroy than to build.
     */
    const base = run(YEARS(6));
    const policeGone = run(YEARS(6), { policeQuality: 5, crimeRate: 85 });

    /* The courts were not touched and are trusted less anyway. */
    expect(trustOf(policeGone.opinion, 'police')).toBeLessThan(
      trustOf(base.opinion, 'police') - 10,
    );
    expect(trustOf(policeGone.opinion, 'courts')).toBeLessThan(
      trustOf(base.opinion, 'courts'),
    );

    /* An excellent police force does not make the courts more trusted to
       anything like the same degree. */
    const policeExcellent = run(YEARS(6), { policeQuality: 100, crimeRate: 2 });
    const liftUp = trustOf(policeExcellent.opinion, 'courts') - trustOf(base.opinion, 'courts');
    const dragDown = trustOf(base.opinion, 'courts') - trustOf(policeGone.opinion, 'courts');
    expect(Math.abs(liftUp)).toBeLessThan(dragDown);
  });

  it('moves at the speed each institution actually moves at', () => {
    /* A government turns on a week. The courts take a decade. */
    const wrecked = run(YEARS(2), {
      approval: 5,
      qualityOfLife: 20,
      courtsQuality: 5,
      norms: 10,
    });
    const base = buildOpinion();
    const govFall = trustOf(base, 'government') - trustOf(wrecked.opinion, 'government');
    const courtFall = trustOf(base, 'courts') - trustOf(wrecked.opinion, 'courts');
    expect(govFall).toBeGreaterThan(courtFall);
  });

  it('reports a collapse once per institution', () => {
    const gone = run(YEARS(8), {
      approval: 2,
      qualityOfLife: 10,
      courtsQuality: 2,
      policeQuality: 2,
      adminQuality: 2,
      crimeRate: 95,
      norms: 5,
      polarisation: 1,
      mediaConcentration: 1,
      incomeGini: 0.62,
      unemployment: 24,
      legislativeSuccess: 0,
    });
    expect(gone.collapsed.size).toBeGreaterThan(2);
  });
});

describe('what trust costs', () => {
  it('is a line in the accounts rather than a mood', () => {
    const trusted = run(YEARS(6), { approval: 75, qualityOfLife: 85, adminQuality: 95 });
    const not = run(YEARS(6), { approval: 8, qualityOfLife: 25, adminQuality: 8 });

    const good = complianceFactor(trusted.opinion);
    const bad = complianceFactor(not.opinion);
    expect(good).toBeGreaterThan(bad + 0.1);

    /* Even a thoroughly distrusted state collects from wages it can see. */
    expect(bad).toBeGreaterThanOrEqual(COMPLIANCE_FLOOR);
    /* And a well-trusted one does not collect more than is owed. */
    expect(good).toBeLessThanOrEqual(1.05);
  });
});

describe('the mood', () => {
  it('is four things rather than one', () => {
    /* An external threat raises fear without touching frustration much. */
    const threatened = run(YEARS(3), { externalTension: 95 });
    const calm = run(YEARS(3), { externalTension: 5 });
    expect(threatened.opinion.fear).toBeGreaterThan(calm.opinion.fear + 10);

    /* A cost-of-living crisis raises frustration without raising fear
       to anything like the same degree. */
    const squeezed = run(YEARS(3), { lowerDisposable: 70, costOfLivingChange: 12 });
    expect(squeezed.opinion.frustration).toBeGreaterThan(calm.opinion.frustration + 10);

    /* And a growing economy raises optimism whatever else is true. */
    const booming = run(YEARS(3), { growth: 4.5, unemployment: 3, happiness: 64 });
    const slumped = run(YEARS(3), { growth: -3, unemployment: 15, happiness: 34 });
    expect(booming.opinion.optimism).toBeGreaterThan(slumped.opinion.optimism + 20);
  });
});

describe('eight years of anything', () => {
  it('never produces a figure that could not be a real country', () => {
    const cases: [string, Partial<OpinionInputs>][] = [
      ['nothing', {}],
      ['excellence', {
        approval: 88,
        qualityOfLife: 92,
        happiness: 70,
        courtsQuality: 95,
        policeQuality: 95,
        adminQuality: 95,
        crimeRate: 3,
        norms: 95,
        polarisation: 0.05,
        legislativeSuccess: 1,
      }],
      ['total collapse', {
        approval: 0,
        qualityOfLife: 5,
        lowerDisposable: 40,
        costOfLivingChange: 30,
        happiness: 5,
        courtsQuality: 0,
        policeQuality: 0,
        adminQuality: 0,
        crimeRate: 100,
        norms: 0,
        polarisation: 1,
        corruption: 100,
        mediaConcentration: 1,
        disinformation: 100,
        incomeGini: 0.7,
        unemployment: 30,
        legislativeSuccess: 0,
        externalTension: 100,
      }],
      ['sawtooth', {}],
    ];

    for (const [label, over] of cases) {
      const { opinion } = run(YEARS(8), over);
      const where = `after eight years of ${label}`;

      for (const key of [
        'efficacy',
        'frustration',
        'optimism',
        'fear',
        'confidence',
        'engagement',
      ] as const) {
        expect(opinion[key], `${key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(opinion[key], `${key} ${where}`).toBeLessThanOrEqual(100);
        expect(Number.isFinite(opinion[key]), `${key} ${where}`).toBe(true);
      }
      expect(opinion.trust, where).toHaveLength(TRUST_KEYS.length);
      for (const state of opinion.trust) {
        expect(state.level, `${state.key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(state.level, `${state.key} ${where}`).toBeLessThanOrEqual(100);
      }
      /* Participation is a share of a country, not a multiple of one. */
      expect(opinion.protestParticipation, where).toBeGreaterThanOrEqual(0);
      expect(opinion.protestParticipation, where).toBeLessThan(31);
      expect(opinion.petitionParticipation, where).toBeLessThan(71);
      expect(opinion.activism, where).toBeLessThan(46);
      expect(institutionalTrust(opinion), where).toBeGreaterThanOrEqual(0);
      expect(institutionalTrust(opinion), where).toBeLessThanOrEqual(100);
      expect(complianceFactor(opinion), where).toBeGreaterThanOrEqual(COMPLIANCE_FLOOR);
      expect(opinion.history.length, where).toBeLessThanOrEqual(208);
    }
  });

  it('leaves an untouched country where it found it', () => {
    const before = buildOpinion();
    const { opinion } = run(YEARS(8));
    /* Ordinary conditions, so the country should settle near where it
       started rather than drifting somewhere on its own. */
    expect(Math.abs(institutionalTrust(opinion) - institutionalTrust(before))).toBeLessThan(12);
    expect(Math.abs(opinion.frustration - before.frustration)).toBeLessThan(14);
  });
});
