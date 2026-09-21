/**
 * problems.ts — what a budget does to people, eighteen months later.
 *
 * Sixteen measured problems, every one derived from something the game
 * already tracks. Nothing here is a dial and nothing arrives at random.
 *
 * Two properties carry the file.
 *
 * They COMPOUND. Each problem's target is computed from the conditions
 * that cause it AND from the other problems, so youth unemployment feeds
 * crime, crime feeds community decline, decline feeds exclusion, and
 * exclusion feeds everything. A country with four problems has
 * considerably more than four problems' worth of trouble, which is why
 * letting several run at once is so much harder to reverse than the
 * arithmetic of any one of them suggests.
 *
 * And they are SLOW COMING BACK. Every one has an inertia heavier in
 * recovery than in onset, because the thing that was lost — a job
 * history, a tenancy, a school year, a high street, a bus route — is not
 * returned by restoring the conditions that took it. A government can
 * therefore create a problem in one term and hand on a country that
 * cannot fix it in two, which is the honest shape of most of them.
 *
 * Unrest is the composite, weighted by how much each problem actually
 * produces public anger rather than by how much harm it does. Those are
 * very different orderings, and a great deal of the worst harm on this
 * list is suffered quietly.
 */

import { PROBLEM_TEMPLATES, findProblem, type ProblemKey } from '../content/problems.ts';
import {
  PROBLEM_COMPOUNDING,
  UNREST_BREADTH_THRESHOLD,
  UNREST_BREADTH_WEIGHT,
  UNREST_TRUST_RELIEF,
} from '../balance.ts';
import type { ProblemState, Problems } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildProblems(): Problems {
  return {
    problems: PROBLEM_TEMPLATES.map((t) => ({ key: t.key, level: t.opening })),
    /* Where the formula below puts an ordinary country, so one that
       is left alone is left alone. */
    stability: 70.8,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading them
 * ------------------------------------------------------------------ */

export function problemOf(problems: Problems, key: ProblemKey): number {
  const found = problems.problems.find((p) => p.key === key);
  if (!found) throw new Error(`problems: no reading for ${key}`);
  return found.level;
}

/**
 * How bad a problem is on its own scale, 0–1.
 *
 * The readings are in different units — per ten thousand, per cent,
 * years of life — so nothing may be compared or summed without being put
 * on a common footing first. Zero is the ordinary level for a country
 * that is not in trouble; one is a country that is.
 */
export function severity(problems: Problems, key: ProblemKey): number {
  const template = findProblem(key);
  const span = template.severe - template.opening;
  if (span <= 0) return 0;
  return clamp((problemOf(problems, key) - template.opening) / span, 0, 1.4);
}

/** The problems that have got materially worse than a country expects. */
export function acute(problems: Problems): ProblemKey[] {
  return problems.problems
    .filter((p) => severity(problems, p.key) > 0.5 && p.key !== 'unrest')
    .map((p) => p.key)
    .sort((a, b) => severity(problems, b) - severity(problems, a));
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface ProblemInputs {
  /** The labour market. */
  unemployment: number;
  youthShare: number;
  /** The distribution, and what the bottom has left. */
  povertyRate: number;
  lowerDisposable: number;
  incomeGini: number;
  housingCostBurden: number;
  homeownership: number;
  /** What households can actually reach, by domain, 0–100. */
  access: Partial<Record<string, number>>;
  /** And how much worse each is at the bottom than the top, in points. */
  gradient: Partial<Record<string, number>>;
  /** Service quality for the services that bear on these. */
  serviceQuality: Partial<Record<string, number>>;
  /** How far the countryside sits below the country, and the spread. */
  ruralGap: number;
  regionalInequality: number;
  /** Whether people believe anything can be changed, 0–100. */
  efficacy: number;
  /** And what they make of the institutions, 0–100. */
  institutionalTrust: number;
  /** The mood, which is what despair is measured off. */
  happiness: number;
  /** Retired share, for the age divide. */
  retiredShare: number;
  turn: number;
}

export interface ProblemsTick {
  problems: Problems;
  /** Problems that have just crossed into serious, reported once each. */
  worsened: ProblemKey[];
  /** True the week unrest crosses the point a movement forms out of. */
  boiling: boolean;
}

/**
 * The conditions an ordinary country is in.
 *
 * Every target below is written as a DEVIATION from these, so a country
 * sitting at all of them generates exactly zero pressure and stays where
 * it was found. Written absolutely instead, the formulas quietly walked
 * an untouched country from six per cent food insecurity to twenty-seven
 * over two terms — the problems drifting on their own, which is the one
 * thing a model of consequences must never do.
 */
const ORDINARY = {
  unemployment: 5,
  povertyRate: 15,
  lowerDisposable: 100,
  incomeGini: 0.33,
  housingCostBurden: 24,
  homeownership: 66,
  access: 66,
  gradient: 12,
  service: 60,
  ruralGap: 4,
  regionalInequality: 11,
  efficacy: 54,
  institutionalTrust: 52,
  happiness: 50,
  retiredShare: 0.19,
} as const;

/**
 * What each problem is actually caused by.
 *
 * `sev` reads the OTHER problems, which is what makes them compound: a
 * target computed partly from its neighbours means a country cannot fix
 * one of these in isolation, and does not have to fix all of them to
 * start seeing several move. At ordinary conditions every severity is
 * zero, so those terms vanish and the whole system sits still.
 */
function targetFor(
  key: ProblemKey,
  inputs: ProblemInputs,
  sev: (k: ProblemKey) => number,
): number {
  const template = findProblem(key);
  /* Every reader is a deviation from ordinary, so zero means ordinary. */
  const access = (k: string) => ORDINARY.access - (inputs.access[k] ?? ORDINARY.access);
  const gradient = (k: string) => (inputs.gradient[k] ?? ORDINARY.gradient) - ORDINARY.gradient;
  const service = (k: string) =>
    ORDINARY.service - (inputs.serviceQuality[k] ?? ORDINARY.service);
  const unemployment = inputs.unemployment - ORDINARY.unemployment;
  const poverty = inputs.povertyRate - ORDINARY.povertyRate;
  const squeeze = ORDINARY.lowerDisposable - inputs.lowerDisposable;
  const gini = inputs.incomeGini - ORDINARY.incomeGini;
  const rent = inputs.housingCostBurden - ORDINARY.housingCostBurden;
  const ownership = ORDINARY.homeownership - inputs.homeownership;
  const rural = inputs.ruralGap - ORDINARY.ruralGap;
  const spread = inputs.regionalInequality - ORDINARY.regionalInequality;
  const hopeless = ORDINARY.efficacy - inputs.efficacy;
  const joyless = ORDINARY.happiness - inputs.happiness;
  const ageing = inputs.retiredShare - ORDINARY.retiredShare;

  /* Map a 0–1 pressure onto the problem's own scale. */
  const at = (pressure: number) =>
    template.opening + clamp(pressure, -0.35, 1.4) * (template.severe - template.opening);

  switch (key) {
    case 'homelessness':
      /* Follows rents rather than the economy, and follows the loss of
         anywhere to be put next. */
      return at(rent / 24 + poverty / 34 + service('housing_assistance') / 90 + sev('drug_harm') * 0.25);
    case 'crime':
      return at(
        unemployment / 22 +
          sev('youth_unemployment') * 0.45 +
          sev('social_exclusion') * 0.4 +
          service('police') / 140 +
          gini * 1.3,
      );
    case 'violent_crime':
      return at(sev('crime') * 0.75 + sev('drug_harm') * 0.3 + sev('social_exclusion') * 0.3);
    case 'drug_harm':
      /* Despair rather than deprivation alone: places where nothing is
         expected to change do much worse than equally poor places where
         something is. */
      return at(joyless / 42 + hopeless / 70 + poverty / 46 + service('healthcare') / 130);
    case 'domestic_violence':
      return at(
        squeeze / 40 + sev('housing_stress') * 0.35 + service('police') / 170 + service('welfare') / 170,
      );
    case 'youth_unemployment':
      /* Roughly twice the headline rate, worse where there is no route
         out through education. */
      return clamp(
        inputs.unemployment * 2.1 + access('education') / 7 + sev('regional_decline') * 5,
        2,
        60,
      );
    case 'food_insecurity':
      return at(access('food') / 30 + poverty / 26);
    case 'energy_poverty':
      return at(access('energy') / 30 + poverty / 34);
    case 'housing_stress':
      return at(rent / 20 + ownership / 42);
    case 'social_exclusion':
      /* The composite: outside work, outside secure housing, outside
         anything civic. All three at once, which is why it is so much
         smaller than any of its parts and so much harder to reverse. */
      return at(
        sev('youth_unemployment') * 0.3 +
          sev('housing_stress') * 0.3 +
          sev('community_decline') * 0.25 +
          hopeless / 80 +
          poverty / 50,
      );
    case 'community_decline':
      return at(
        sev('regional_decline') * 0.45 +
          access('recreation') / 52 +
          access('transport') / 72 +
          sev('crime') * 0.25,
      );
    case 'regional_decline':
      return at(rural / 16 + spread / 26 + sev('youth_unemployment') * 0.2);
    case 'education_gap':
      return at(gradient('education') / 24 + gini * 1.6);
    case 'health_gap':
      return at(gradient('healthcare') / 26 + gini * 1.5 + sev('drug_harm') * 0.25);
    case 'age_divide':
      /* The young pay the housing costs and the old hold the housing.
         That gap, plus how much of the country is retired. */
      return at(rent / 26 + ageing * 3.4 + sev('youth_unemployment') * 0.3);
    case 'unrest': {
      /*
       * The composite, weighted by how much public anger each problem
       * actually produces rather than by how much harm it does. Those are
       * different orderings: a great deal of the worst harm on this list
       * is suffered quietly, and the engine says so rather than pretending
       * that suffering and protest are the same quantity.
       */
      let total = 0;
      let weight = 0;
      let broad = 0;
      for (const t of PROBLEM_TEMPLATES) {
        if (t.key === 'unrest' || t.unrest <= 0) continue;
        total += sev(t.key) * t.unrest;
        weight += t.unrest;
        if (sev(t.key) > UNREST_BREADTH_THRESHOLD) broad += t.unrest;
      }
      const depth = weight > 0 ? total / weight : 0;
      /*
       * BREADTH, separately from depth. A mean alone is linear, so four
       * grievances produced exactly what four grievances summed to — and
       * that is not what happens. Simultaneous unrelated grievances find
       * each other: people with one complaint stay home, and people with
       * one complaint who meet people with three others do not. This term
       * is what makes several problems at once worse than the arithmetic
       * of any of them.
       */
      const breadth = weight > 0 ? broad / weight : 0;
      /*
       * Multiplicative, not additive. Breadth saturates — four causes do
       * not put four times as many problems past the threshold — so added
       * to depth it works against the very effect it is there to produce.
       * Scaling depth by it makes the pressure grow faster than the
       * number of grievances, which is the claim: four things going wrong
       * at once is a different kind of trouble from one larger complaint.
       */
      const pressure = depth * (1 + breadth * UNREST_BREADTH_WEIGHT);
      /*
       * A country that still believes in its institutions absorbs a great
       * deal more of this before any of it reaches the street. Measured
       * against the ordinary level of trust, so an ordinary country gets
       * no bonus and no penalty for being ordinary.
       */
      const relief =
        ((inputs.institutionalTrust - ORDINARY.institutionalTrust) / 100) * UNREST_TRUST_RELIEF;
      return at(pressure * 1.25 - relief);
    }
  }
}

export function stepProblems(problems: Problems, inputs: ProblemInputs): ProblemsTick {
  /* Severities read from the state at the start of the week, so a problem
     compounds off last week's neighbours rather than off a half-updated
     version of them. Order of evaluation must not change the answer. */
  const sev = (k: ProblemKey) => severity(problems, k);

  const worsened: ProblemKey[] = [];
  const next: ProblemState[] = problems.problems.map((state) => {
    const template = findProblem(state.key);
    const target = targetFor(state.key, inputs, sev);

    /*
     * Heavier coming back than going. The job history, the tenancy, the
     * school year and the high street are not returned by restoring the
     * conditions that took them.
     */
    const worseningNow = target > state.level;
    const rate = worseningNow ? template.onset : template.onset / template.stickiness;
    const level = Math.max(0, state.level + (target - state.level) * rate * PROBLEM_COMPOUNDING);

    const before = (state.level - template.opening) / Math.max(1e-9, template.severe - template.opening);
    const after = (level - template.opening) / Math.max(1e-9, template.severe - template.opening);
    if (after > 0.5 && before <= 0.5 && state.key !== 'unrest') worsened.push(state.key);

    return { key: state.key, level };
  });

  const staged: Problems = { ...problems, problems: next };

  /*
   * Stability is the country's capacity to absorb all of this without
   * anything breaking. It is not the inverse of unrest: a country can
   * be angry and stable, and a quiet country with hollow institutions
   * can be neither.
   */
  const stability = clamp100(
    problems.stability +
      (clamp100(
        34 +
          inputs.institutionalTrust * 0.5 +
          inputs.efficacy * 0.2 -
          severity(staged, 'unrest') * 42 -
          severity(staged, 'social_exclusion') * 18,
      ) -
        problems.stability) *
        0.01,
  );

  const result: Problems = {
    problems: next,
    stability,
    history: [
      ...problems.history,
      {
        turn: inputs.turn,
        unrest: problemOf(staged, 'unrest'),
        exclusion: problemOf(staged, 'social_exclusion'),
        crime: problemOf(staged, 'crime'),
        stability,
      },
    ].slice(-208),
  };

  return {
    problems: result,
    worsened,
    boiling: severity(result, 'unrest') > 0.6 && severity(problems, 'unrest') <= 0.6,
  };
}

/** One line on what is going wrong. */
export function describeProblems(problems: Problems): string {
  const worst = acute(problems);
  if (worst.length === 0) {
    return `Nothing on the social register is running badly. Unrest at ${problemOf(problems, 'unrest').toFixed(0)} and stability at ${problems.stability.toFixed(0)}.`;
  }
  const top = findProblem(worst[0]!);
  if (worst.length >= 4) {
    return `${worst.length} of the sixteen are running seriously, led by ${top.label.toLowerCase()} at ${problemOf(problems, worst[0]!).toFixed(1)} ${top.unit}. These compound: a country with four of them has considerably more than four problems, and each one is slower to reverse than it was to cause.`;
  }
  return `${top.label} is at ${problemOf(problems, worst[0]!).toFixed(1)} ${top.unit} against an ordinary ${top.opening} — ${top.blurb.toLowerCase()}`;
}
