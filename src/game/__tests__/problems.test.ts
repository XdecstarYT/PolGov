/**
 * problems.test.ts — compounding, stickiness, and standing still.
 *
 * Three claims, in order of how easy they are to get wrong.
 *
 * The first is that an untouched country stays where it was found. Every
 * target here is written as a deviation from ordinary conditions, and the
 * first draft was not: the formulas quietly walked a country nobody had
 * governed from six per cent food insecurity to twenty-seven over two
 * terms. A model of consequences whose outputs drift on their own is not
 * a model of consequences.
 *
 * The second is that they compound. Each problem reads the others, so a
 * country with four of them has considerably more than four problems'
 * worth of trouble.
 *
 * The third is that they are heavier coming back than going. A job
 * history, a tenancy, a school year and a high street are not returned by
 * restoring the conditions that took them, which is why a government can
 * cause something in one term that two terms cannot fix.
 */

import { describe, expect, it } from 'vitest';
import {
  acute,
  buildProblems,
  problemOf,
  severity,
  stepProblems,
  type ProblemInputs,
} from '../systems/problems.ts';
import { PROBLEM_KEYS, PROBLEM_TEMPLATES, findProblem } from '../content/problems.ts';
import type { Problems } from '../types.ts';

const ACCESS = ['food', 'energy', 'education', 'healthcare', 'transport', 'recreation', 'housing'];
const SERVICES = ['police', 'healthcare', 'welfare', 'housing_assistance'];

/** A country in ordinary condition, matching the engine's own reference. */
const inputs = (over: Partial<ProblemInputs> = {}): ProblemInputs => ({
  unemployment: 5,
  youthShare: 0.2,
  povertyRate: 15,
  lowerDisposable: 100,
  incomeGini: 0.33,
  housingCostBurden: 24,
  homeownership: 66,
  access: Object.fromEntries(ACCESS.map((k) => [k, 66])),
  gradient: { education: 12, healthcare: 12 },
  serviceQuality: Object.fromEntries(SERVICES.map((k) => [k, 60])),
  ruralGap: 4,
  regionalInequality: 11,
  efficacy: 54,
  institutionalTrust: 52,
  happiness: 50,
  retiredShare: 0.19,
  turn: 1,
  ...over,
});

function run(weeks: number, over: Partial<ProblemInputs> = {}, from?: Problems) {
  let problems = from ?? buildProblems();
  let boiled = false;
  const worsened = new Set<string>();
  let reports = 0;
  for (let t = 1; t <= weeks; t += 1) {
    const tick = stepProblems(problems, { ...inputs(over), turn: t });
    problems = tick.problems;
    if (tick.boiling) boiled = true;
    for (const key of tick.worsened) {
      worsened.add(key);
      reports += 1;
    }
  }
  return { problems, boiled, worsened, reports };
}

const YEARS = (n: number) => n * 52;

describe('an untouched country', () => {
  it('is handed on exactly as it was found', () => {
    const before = buildProblems();
    const { problems, worsened, boiled } = run(YEARS(8));

    for (const template of PROBLEM_TEMPLATES) {
      const started = template.opening;
      const ended = problemOf(problems, template.key);
      expect(ended, `${template.key} drifted on its own`).toBeCloseTo(started, 1);
    }
    expect(worsened.size).toBe(0);
    expect(boiled).toBe(false);
    expect(acute(problems)).toHaveLength(0);
    expect(Math.abs(problems.stability - before.stability)).toBeLessThan(2);
  });
});

describe('compounding', () => {
  it('makes four problems worse than four problems', () => {
    /*
     * Each cause in isolation, then all four together. The combination
     * produces more unrest than the sum of the separate effects, because
     * every one of them feeds the others.
     */
    const base = run(YEARS(6)).problems;
    const baseline = problemOf(base, 'unrest');

    const causes: Partial<ProblemInputs>[] = [
      { unemployment: 13 },
      { housingCostBurden: 42, homeownership: 46 },
      { povertyRate: 27, lowerDisposable: 80 },
      { ruralGap: 20, regionalInequality: 30 },
    ];
    const separate = causes
      .map((c) => problemOf(run(YEARS(6), c).problems, 'unrest') - baseline)
      .reduce((a, b) => a + b, 0);
    const together =
      problemOf(run(YEARS(6), Object.assign({}, ...causes)).problems, 'unrest') - baseline;

    expect(together).toBeGreaterThan(separate);
  });

  it('carries youth unemployment through to crime and on to exclusion', () => {
    const calm = run(YEARS(6)).problems;
    const jobless = run(YEARS(6), { unemployment: 15 }).problems;

    expect(problemOf(jobless, 'youth_unemployment')).toBeGreaterThan(
      problemOf(calm, 'youth_unemployment') + 10,
    );
    /* Nothing was said about crime or exclusion. Both moved. */
    expect(problemOf(jobless, 'crime')).toBeGreaterThan(problemOf(calm, 'crime') + 20);
    expect(problemOf(jobless, 'social_exclusion')).toBeGreaterThan(
      problemOf(calm, 'social_exclusion'),
    );
  });

  it('lets a trusted country absorb the same pressure with less unrest', () => {
    const pressure: Partial<ProblemInputs> = {
      unemployment: 13,
      povertyRate: 26,
      housingCostBurden: 40,
    };
    const trusted = run(YEARS(6), { ...pressure, institutionalTrust: 82 }).problems;
    const not = run(YEARS(6), { ...pressure, institutionalTrust: 18 }).problems;

    /* The problems themselves are similar; what reaches the street is not. */
    expect(problemOf(not, 'unrest')).toBeGreaterThan(problemOf(trusted, 'unrest') + 8);
  });
});

describe('stickiness', () => {
  it('makes a problem far cheaper to cause than to fix', () => {
    const bad: Partial<ProblemInputs> = {
      housingCostBurden: 48,
      homeownership: 40,
      povertyRate: 30,
      serviceQuality: Object.fromEntries(SERVICES.map((k) => [k, 15])),
    };
    const damaged = run(YEARS(4), bad).problems;
    const peak = problemOf(damaged, 'homelessness');
    expect(peak).toBeGreaterThan(findProblem('homelessness').opening * 3);

    /* Four years of causing it, then four of ideal conditions. */
    const healed = run(YEARS(4), {}, damaged).problems;
    const recovered = peak - problemOf(healed, 'homelessness');
    const caused = peak - findProblem('homelessness').opening;
    expect(recovered).toBeLessThan(caused);
  });

  it('is slowest for the things that take longest to rebuild', () => {
    const wrecked: Partial<ProblemInputs> = {
      ruralGap: 26,
      regionalInequality: 38,
      access: Object.fromEntries(ACCESS.map((k) => [k, 15])),
    };
    const damaged = run(YEARS(8), wrecked).problems;
    const healed = run(YEARS(4), {}, damaged).problems;

    const share = (key: 'community_decline' | 'crime') => {
      const peak = problemOf(damaged, key);
      const open = findProblem(key).opening;
      return peak > open ? (peak - problemOf(healed, key)) / (peak - open) : 1;
    };
    /* A high street comes back more slowly than a crime rate. */
    expect(share('community_decline')).toBeLessThan(share('crime'));
  });
});

describe('reporting', () => {
  it('names each problem once, when it becomes serious', () => {
    const { worsened, reports, boiled } = run(YEARS(8), {
      unemployment: 19,
      povertyRate: 33,
      lowerDisposable: 66,
      housingCostBurden: 50,
      homeownership: 36,
      incomeGini: 0.58,
      efficacy: 12,
      happiness: 18,
      institutionalTrust: 14,
      ruralGap: 26,
      regionalInequality: 38,
      gradient: { education: 34, healthcare: 36 },
      access: Object.fromEntries(ACCESS.map((k) => [k, 16])),
      serviceQuality: Object.fromEntries(SERVICES.map((k) => [k, 8])),
    });
    expect(worsened.size).toBeGreaterThan(5);
    expect(reports).toBe(worsened.size);
    expect(boiled).toBe(true);
    /* Unrest is the composite and is never reported as one of its own parts. */
    expect(worsened.has('unrest')).toBe(false);
  });
});

describe('eight years of anything', () => {
  it('never produces a figure that could not be a real country', () => {
    const cases: [string, Partial<ProblemInputs>][] = [
      ['nothing', {}],
      ['a model country', {
        unemployment: 2.5,
        povertyRate: 6,
        incomeGini: 0.25,
        housingCostBurden: 15,
        homeownership: 78,
        efficacy: 85,
        institutionalTrust: 88,
        happiness: 72,
        access: Object.fromEntries(ACCESS.map((k) => [k, 94])),
        serviceQuality: Object.fromEntries(SERVICES.map((k) => [k, 94])),
      }],
      ['total collapse', {
        unemployment: 32,
        povertyRate: 48,
        lowerDisposable: 45,
        incomeGini: 0.7,
        housingCostBurden: 58,
        homeownership: 22,
        efficacy: 2,
        institutionalTrust: 3,
        happiness: 4,
        ruralGap: 34,
        regionalInequality: 55,
        retiredShare: 0.34,
        gradient: { education: 48, healthcare: 50 },
        access: Object.fromEntries(ACCESS.map((k) => [k, 2])),
        serviceQuality: Object.fromEntries(SERVICES.map((k) => [k, 1])),
      }],
    ];

    for (const [label, over] of cases) {
      const { problems } = run(YEARS(8), over);
      const where = `after eight years of ${label}`;

      expect(problems.problems, where).toHaveLength(PROBLEM_KEYS.length);
      for (const state of problems.problems) {
        const template = findProblem(state.key);
        expect(Number.isFinite(state.level), `${state.key} ${where}`).toBe(true);
        expect(state.level, `${state.key} ${where}`).toBeGreaterThanOrEqual(0);
        /* Nothing runs past half again the "serious country" reading. */
        expect(state.level, `${state.key} ${where}`).toBeLessThan(template.severe * 1.6);
        expect(severity(problems, state.key), `${state.key} ${where}`).toBeLessThanOrEqual(1.4);
      }
      expect(problems.stability, where).toBeGreaterThanOrEqual(0);
      expect(problems.stability, where).toBeLessThanOrEqual(100);
      expect(problems.history.length, where).toBeLessThanOrEqual(208);
    }
  });

  it('makes a model country better than an ordinary one on every count', () => {
    const ordinary = run(YEARS(8)).problems;
    const model = run(YEARS(8), {
      unemployment: 2.5,
      povertyRate: 6,
      incomeGini: 0.25,
      housingCostBurden: 15,
      homeownership: 78,
      efficacy: 85,
      institutionalTrust: 88,
      happiness: 72,
      access: Object.fromEntries(ACCESS.map((k) => [k, 94])),
      serviceQuality: Object.fromEntries(SERVICES.map((k) => [k, 94])),
      gradient: { education: 4, healthcare: 4 },
      ruralGap: 1,
      regionalInequality: 4,
    }).problems;

    for (const key of PROBLEM_KEYS) {
      expect(
        problemOf(model, key),
        `${key} did not improve in a country doing everything right`,
      ).toBeLessThanOrEqual(problemOf(ordinary, key) + 0.01);
    }
    expect(model.stability).toBeGreaterThan(ordinary.stability);
  });
});
