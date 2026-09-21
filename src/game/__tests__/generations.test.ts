/**
 * generations.test.ts — the electorate that moves without anybody moving.
 *
 * The claim: nobody in this file ever changes their mind. Cohorts are
 * formed by the country they grew up in and keep that formation for life,
 * and the national centre of gravity moves anyway — because the oldest
 * cohort is replaced by the youngest at about one and a quarter per cent
 * a year, and the youngest was formed by a different country.
 *
 * That is why a government can be perfectly positioned against the
 * electorate of its first term and quietly mispositioned by its third
 * having changed nothing, and it is the one force acting on where the
 * votes are that no campaign can address.
 *
 * The second claim is that the government forms the cohort. A generation
 * that comes of age unable to afford a house, or watching a state
 * visibly fail, carries that for sixty years — and the government
 * responsible is long gone by the time it votes.
 */

import { describe, expect, it } from 'vitest';
import {
  buildGenerations,
  centreDrift,
  generationGap,
  stepGenerations,
  weightedCentre,
  type GenerationsInputs,
} from '../systems/generations.ts';
import { COHORT_FORMATION_YEARS, COHORT_REPLACEMENT_PER_YEAR } from '../balance.ts';

const inputs = (over: Partial<GenerationsInputs> = {}): GenerationsInputs => ({
  housingCostBurden: 24,
  homeownership: 66,
  lowerDisposable: 100,
  incomeGini: 0.33,
  institutionalTrust: 52,
  efficacy: 54,
  environmentHealth: 60,
  youthUnemployment: 10.5,
  turn: 1,
  ...over,
});

function run(years: number, over: Partial<GenerationsInputs> = {}) {
  let generations = buildGenerations();
  let arrivals = 0;
  let drifted = 0;
  for (let t = 1; t <= years * 52; t += 1) {
    const tick = stepGenerations(generations, { ...inputs(over), turn: t });
    generations = tick.generations;
    if (tick.cohortArrived) arrivals += 1;
    if (tick.driftedAway) drifted += 1;
  }
  return { generations, arrivals, drifted };
}

describe('the ground moving', () => {
  it('moves the centre while every cohort stays exactly where it was', () => {
    const before = buildGenerations();
    const { generations } = run(8);

    /* Not one position changed. */
    for (let i = 0; i < before.cohorts.length; i += 1) {
      expect(generations.cohorts[i]!.lean).toEqual(before.cohorts[i]!.lean);
    }
    /* And the centre moved anyway. */
    const drift = centreDrift(generations);
    expect(Math.abs(drift.social)).toBeGreaterThan(0.03);
  });

  it('moves it further the longer a career runs', () => {
    const eight = Math.abs(centreDrift(run(8).generations).social);
    const twenty = Math.abs(centreDrift(run(20).generations).social);
    const forty = Math.abs(centreDrift(run(40).generations).social);
    /*
     * Measured against a stored opening rather than the history buffer,
     * which is capped at eight years — reading the first entry made a
     * forty-year career report less movement than an eight-year one.
     */
    expect(twenty).toBeGreaterThan(eight);
    expect(forty).toBeGreaterThan(twenty);
  });

  it('replaces the electorate at the rate it says it does', () => {
    const { generations } = run(8);
    const before = buildGenerations();
    const eldestLost = before.cohorts[0]!.share - generations.cohorts[0]!.share;
    expect(eldestLost).toBeCloseTo(COHORT_REPLACEMENT_PER_YEAR * 8, 2);
  });

  it('says so, once, when the drift passes what a campaign can cover', () => {
    const { drifted } = run(40);
    expect(drifted).toBe(1);
  });
});

describe('who forms the next one', () => {
  it('is the government sitting now, and it will not be here to answer for it', () => {
    const ordinary = centreDrift(run(40).generations);
    const shutOut = centreDrift(
      run(40, { housingCostBurden: 48, homeownership: 40 }).generations,
    );
    /* A generation that could not buy a house is economically elsewhere. */
    expect(shutOut.economic).toBeLessThan(ordinary.economic - 0.08);

    const wrecked = centreDrift(run(40, { environmentHealth: 12 }).generations);
    expect(wrecked.environmental).toBeGreaterThan(ordinary.environmental + 0.15);

    const failed = centreDrift(
      run(40, { institutionalTrust: 15, efficacy: 12 }).generations,
    );
    /* A state that visibly did not work forms people who do not expect it
       to, which shows up as a smaller move toward wanting more of it. */
    expect(failed.social).toBeLessThan(ordinary.social);
  });

  it('takes a formation period before a cohort is fixed', () => {
    const early = run(COHORT_FORMATION_YEARS - 2);
    expect(early.arrivals).toBe(0);
    const later = run(COHORT_FORMATION_YEARS + 2);
    expect(later.arrivals).toBe(1);
  });

  it('keeps the age structure a shape a country could actually have', () => {
    for (const years of [8, 20, 40, 70]) {
      const { generations } = run(years);
      const shares = generations.cohorts.map((c) => c.share);
      expect(shares.reduce((a, b) => a + b, 0), `${years}y`).toBeCloseTo(1, 6);
      for (const share of shares) {
        expect(share, `${years}y`).toBeGreaterThanOrEqual(0);
        /*
         * Without levelling the settled cohorts on arrival, the youngest
         * gathered sixteen years of entrants while nobody left it and
         * ended up holding nearly half the electorate, which is not a
         * shape any country's age structure has.
         */
        expect(share, `${years}y`).toBeLessThan(0.45);
      }
    }
  });
});

describe('the gap between the ends', () => {
  it('closes by replacement rather than by persuasion', () => {
    /*
     * People do not become their parents. A gap between the youngest and
     * oldest cohorts narrows only because the oldest leaves, so it
     * narrows over decades and never within a term.
     */
    const start = generationGap(buildGenerations());
    const oneTerm = generationGap(run(4).generations);
    const longRun = generationGap(run(40).generations);

    expect(Math.abs(oneTerm - start)).toBeLessThan(2);
    expect(longRun).toBeLessThan(start);
  });
});

describe('seventy years of anything', () => {
  it('never produces an electorate that could not exist', () => {
    const cases: [string, Partial<GenerationsInputs>][] = [
      ['nothing', {}],
      ['everything wrong', {
        housingCostBurden: 58,
        homeownership: 20,
        lowerDisposable: 45,
        incomeGini: 0.7,
        institutionalTrust: 2,
        efficacy: 2,
        environmentHealth: 1,
        youthUnemployment: 45,
      }],
      ['everything right', {
        housingCostBurden: 14,
        homeownership: 82,
        lowerDisposable: 130,
        incomeGini: 0.24,
        institutionalTrust: 92,
        efficacy: 90,
        environmentHealth: 95,
        youthUnemployment: 3,
      }],
    ];

    for (const [label, over] of cases) {
      const { generations } = run(70, over);
      const where = `after seventy years of ${label}`;

      expect(generations.cohorts.length, where).toBeGreaterThanOrEqual(3);
      expect(generations.cohorts.length, where).toBeLessThanOrEqual(6);
      expect(
        generations.cohorts.reduce((a, c) => a + c.share, 0),
        where,
      ).toBeCloseTo(1, 6);
      for (const cohort of generations.cohorts) {
        for (const axis of ['economic', 'social', 'environmental'] as const) {
          expect(cohort.lean[axis], `${cohort.id} ${axis} ${where}`).toBeGreaterThanOrEqual(-1);
          expect(cohort.lean[axis], `${cohort.id} ${axis} ${where}`).toBeLessThanOrEqual(1);
        }
        expect(cohort.turnout, where).toBeGreaterThan(0.4);
        expect(cohort.turnout, where).toBeLessThan(1.6);
      }
      for (const axis of ['economic', 'social', 'environmental'] as const) {
        expect(generations.centre[axis], `centre ${axis} ${where}`).toBeGreaterThanOrEqual(-1);
        expect(generations.centre[axis], `centre ${axis} ${where}`).toBeLessThanOrEqual(1);
      }
      expect(generations.history.length, where).toBeLessThanOrEqual(416);
    }
  });

  it('weights the centre by who actually turns out', () => {
    const cohorts = buildGenerations().cohorts;
    const even = weightedCentre(cohorts.map((c) => ({ ...c, turnout: 1 })));
    const asIs = weightedCentre(cohorts);
    /*
     * The old vote more, in every democracy that has counted, so the
     * centre of the ELECTORATE sits away from the centre of the country.
     * That difference is the whole reason turnout is weighted here.
     */
    expect(asIs.social).toBeLessThan(even.social);
  });
});
