/**
 * living.ts — what it is like to live here.
 *
 * This file exists because of one asymmetry, and the asymmetry is the
 * mechanic: PEOPLE ADAPT TO LEVELS AND REACT TO CHANGES.
 *
 * Life satisfaction tracks how good things are. It moves slowly, and it
 * keeps moving toward the level however long the level holds, so a country
 * that is genuinely well run eventually reports being content with it.
 *
 * Happiness tracks how fast things are getting better. It moves quickly and
 * it decays to nothing, so a government that inherits a good country and
 * keeps it exactly as good gets no credit whatsoever — while one that
 * inherits a wreck and improves it by half as much gets a great deal. This
 * is the hedonic treadmill, it is well evidenced, and it is deeply unfair
 * to competent administrators. It is also why the honest strategy and the
 * popular strategy are different strategies, which is the entire subject
 * of the game.
 *
 * Underneath both sits ACCESS, which is not quality. A health service can
 * be excellent and unreachable. Twelve domains, each derived from what the
 * state actually funds and builds, each rationed either by price — which
 * falls on the bottom — or by queue and geography, which fall on
 * everybody. A national average conceals all of it, which is why the
 * regional spread is computed too.
 */

import {
  ACCESS_TEMPLATES,
  findAccess,
  type AccessKey,
} from '../content/access.ts';
import {
  ACCESS_ADJUST_RATE,
  HAPPINESS_ADJUST_RATE,
  HAPPINESS_CHANGE_SCALE,
  HAPPINESS_DECAY,
  SATISFACTION_ADJUST_RATE,
  TURNS_PER_YEAR,
  URBAN_STANDARD_TILT,
  FLOW_STANDARD_TILT,
} from '../balance.ts';
import type { AccessState, Living, Society } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildLiving(): Living {
  const access: AccessState[] = ACCESS_TEMPLATES.map((t) => ({
    key: t.key,
    level: 66,
    gradient: 12 * t.gradient,
  }));
  const standard = 66;
  return {
    access,
    standardOfLiving: standard,
    qualityOfLife: standard,
    lifeSatisfaction: standard,
    /* Nothing has happened yet, so nobody is elated or furious about it.
       Fifty is the neutral reading, not a good one. */
    happiness: 50,
    regionalInequality: 8,
    urbanAdvantage: 5,
    ruralGap: 6,
    regional: [],
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/** One domain's state, by key. */
export function accessOf(living: Living, key: AccessKey): AccessState {
  const found = living.access.find((a) => a.key === key);
  if (!found) throw new Error(`living: no domain ${key}`);
  return found;
}

/**
 * What a band can actually get, as distinct from the national figure.
 *
 * The gradient is applied along the distribution: at the top a domain
 * reads better than the average, at the bottom worse, and how much worse
 * depends on whether the shortage is rationed by price or by queue. A
 * housing shortage is almost entirely a shortage for the bottom; a
 * shortage of hospital beds is very nearly a shortage for everybody.
 */
export function accessForBand(living: Living, key: AccessKey, rank: number): number {
  const state = accessOf(living, key);
  return clamp100(state.level - state.gradient * -rank * 2);
}

/**
 * The composite: everything a household can get, weighted by need.
 *
 * Weighted toward the things whose absence is not an inconvenience —
 * housing, food, work, energy — rather than treating a library and a roof
 * as two units of the same substance.
 */
export function standardFrom(access: readonly AccessState[]): number {
  let total = 0;
  let weight = 0;
  for (const state of access) {
    const template = findAccess(state.key);
    total += state.level * template.weight;
    weight += template.weight;
  }
  return weight > 0 ? total / weight : 0;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface LivingInputs {
  society: Society;
  /** Service quality and waiting, by key, straight off the service book. */
  serviceQuality: Partial<Record<string, number>>;
  serviceWait: Partial<Record<string, number>>;
  /** Infrastructure condition and congestion, by asset key. */
  assetCondition: Partial<Record<string, number>>;
  assetPressure: Partial<Record<string, number>>;
  /** Unemployment, which is what decides whether work is available. */
  unemployment: number;
  /** Environment sector health, 0–100. */
  environmentHealth: number;
  /** Recorded crime per thousand. Safety is the inverse of this. */
  crimeRate: number;
  /** Share of people in cities, 0–1. */
  urbanisation: number;
  /** Population and net flow by region, for the spread. */
  regional: { regionId: string; population: number; netFlow: number; urban: number }[];
  turn: number;
}

export interface LivingTick {
  living: Living;
  /** Domains that have just fallen below the point people notice. */
  failing: AccessKey[];
  /**
   * True while the country is good and the mood has gone flat — the
   * position a competent government that has stopped improving anything
   * finds itself in, and cannot poll its way out of.
   */
  contentedButUnhappy: boolean;
}

/**
 * What each domain is actually derived from.
 *
 * Every one of these reads something the player funds, builds or presides
 * over. None of them is a dial. That is the rule the whole engine is built
 * on and this file is where it would be easiest to break.
 */
function targetFor(key: AccessKey, inputs: LivingInputs): number {
  const service = (k: string) => inputs.serviceQuality[k] ?? 60;
  const wait = (k: string) => inputs.serviceWait[k] ?? 0;
  const asset = (k: string) => inputs.assetCondition[k] ?? 60;
  const pressure = (k: string) => inputs.assetPressure[k] ?? 1;
  const s = inputs.society;

  switch (key) {
    case 'healthcare':
      /* Quality, less what the waiting does to it. A service nobody can
         reach in under a year is not a service that is working. */
      return clamp100(service('healthcare') - wait('healthcare') * 5.5 - (pressure('hospitals') - 1) * 25);
    case 'education':
      return clamp100(service('education') * 0.7 + asset('schools') * 0.3 - (pressure('schools') - 1) * 22);
    case 'housing':
      /* The one domain where the price IS the access. A country can have
         enough houses and no housing, if the houses cost what these do. */
      return clamp100(
        100 - (s.housingCostBurden - 18) * 2.1 - (pressure('housing') - 1) * 35 +
          service('housing_assistance') * 0.12,
      );
    case 'transport':
      return clamp100(
        asset('roads') * 0.26 +
          asset('railways') * 0.24 +
          asset('public_transport') * 0.32 +
          asset('highways') * 0.18 -
          (pressure('public_transport') - 1) * 20,
      );
    case 'internet':
      return clamp100(asset('internet') * 0.62 + asset('telecoms') * 0.28 + 10);
    case 'food':
      /* Not a supply question in a developed country. It is an income
         question, and it is the first thing a squeeze at the bottom shows
         up as. */
      return clamp100(100 - (100 - s.bands[0]!.disposableIndex) * 1.6 - s.povertyRate * 1.1);
    case 'energy':
      return clamp100(
        100 - (s.costOfLiving - 100) * 0.55 - s.povertyRate * 0.9 + asset('grid') * 0.18,
      );
    case 'water':
      return clamp100(asset('water') * 0.9 + 10 - (pressure('water') - 1) * 20);
    case 'safety':
      return clamp100(100 - inputs.crimeRate * 1.4 + service('police') * 0.18 - 12);
    case 'environment':
      return clamp100(inputs.environmentHealth * 0.85 + service('environmental_protection') * 0.15);
    case 'work':
      return clamp100(100 - (inputs.unemployment - 3) * 6.5);
    case 'recreation':
      /* The things cut first and missed longest. Nothing else in the
         budget is as cheap to remove or as visible once it is gone. */
      return clamp100(
        service('administration') * 0.3 +
          service('broadcasting') * 0.2 +
          asset('public_transport') * 0.3 +
          22,
      );
  }
}

export function stepLiving(living: Living, inputs: LivingInputs): LivingTick {
  const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

  /* ---- 1. Access, domain by domain. ---- */
  const failing: AccessKey[] = [];
  const access: AccessState[] = living.access.map((state) => {
    const template = findAccess(state.key);
    const level = clamp100(toward(state.level, targetFor(state.key, inputs), ACCESS_ADJUST_RATE));

    /*
     * How much worse it is at the bottom than at the top. A shortage
     * widens the gradient, and it widens it most where price does the
     * rationing: when housing is short the top simply pays, and when
     * hospital beds are short everybody waits.
     */
    const shortage = Math.max(0, 70 - level) / 70;
    const gradient = toward(
      state.gradient,
      template.gradient * (8 + shortage * 46) * (1 + inputs.society.incomeGini - 0.33),
      ACCESS_ADJUST_RATE,
    );

    if (level < 45 && state.level >= 45) failing.push(state.key);
    return { key: state.key, level, gradient };
  });

  /* ---- 2. The composites. ---- */
  const standardOfLiving = standardFrom(access);

  /*
   * Quality of life is the standard of living plus the parts that are not
   * consumption: whether the place is safe, whether the air is worth
   * breathing, whether there is anywhere to go, and whether a household
   * born at the bottom can expect to end up anywhere else.
   */
  const qualityOfLife = clamp100(
    standardOfLiving * 0.66 +
      accessOf({ ...living, access }, 'safety').level * 0.1 +
      accessOf({ ...living, access }, 'environment').level * 0.09 +
      accessOf({ ...living, access }, 'recreation').level * 0.05 +
      inputs.society.socialMobility * 0.35,
  );

  /* ---- 3. And how people feel about it. ---- */
  /*
   * Satisfaction converges on the level, however long that takes, which
   * is the part that rewards a government for having actually improved
   * the country.
   */
  const lifeSatisfaction = clamp100(
    toward(living.lifeSatisfaction, qualityOfLife, SATISFACTION_ADJUST_RATE),
  );

  /*
   * Happiness tracks the CHANGE and decays to neutral. A country held
   * steady at an excellent standard produces no happiness at all; one
   * improving from a poor standard produces a great deal. This is the
   * hedonic treadmill. It is well evidenced, it is thoroughly unfair to
   * competent administrators, and it is the reason the honest strategy
   * and the popular strategy are not the same strategy.
   */
  const change = (qualityOfLife - living.qualityOfLife) * TURNS_PER_YEAR;
  const happinessTarget = 50 + clamp(change * HAPPINESS_CHANGE_SCALE, -32, 32);
  const happiness = clamp100(
    toward(
      toward(living.happiness, 50, HAPPINESS_DECAY),
      happinessTarget,
      HAPPINESS_ADJUST_RATE,
    ),
  );

  /* ---- 4. Where you live. ---- */
  /*
   * Most of the domains are partly about somewhere rather than someone,
   * and a national average conceals that completely. A region's standard
   * is the national one adjusted by how urban it is and whether people
   * are arriving or leaving — a place people are leaving is a place that
   * has already lost something.
   */
  const regional = inputs.regional.map((r) => {
    const urbanTilt = (r.urban - inputs.urbanisation) * URBAN_STANDARD_TILT;
    /*
     * A place people are leaving has already lost something, and a place
     * they are arriving at has already gained it. A weak signal on
     * purpose: people move BECAUSE of the standard of living, so letting
     * the flow drive the standard would run the causality backwards. It
     * confirms, it does not decide.
     *
     * Rate rather than headcount. Net flow is thousands of people a week,
     * so an absolute figure makes a region of three hundred million look
     * like the best place on earth for gaining a rounding error's worth
     * of people — which saturated this term in every large country and
     * cancelled the rural gap entirely.
     */
    const flowPerYear =
      (r.netFlow / 1000 / Math.max(0.05, r.population)) * TURNS_PER_YEAR * 100;
    const flowTilt = clamp(flowPerYear * FLOW_STANDARD_TILT, -4, 4);
    return {
      regionId: r.regionId,
      standard: clamp100(standardOfLiving + urbanTilt + flowTilt),
    };
  });

  const standards = regional.map((r) => r.standard);
  const regionalInequality =
    standards.length > 1 ? Math.max(...standards) - Math.min(...standards) : living.regionalInequality;

  /* Weighted by where people actually are, so one small region does not
     speak for the countryside. */
  const weighted = (pick: (r: (typeof inputs.regional)[number]) => boolean) => {
    let sum = 0;
    let pop = 0;
    for (let i = 0; i < inputs.regional.length; i += 1) {
      const r = inputs.regional[i]!;
      if (!pick(r)) continue;
      sum += regional[i]!.standard * r.population;
      pop += r.population;
    }
    return pop > 0 ? sum / pop : standardOfLiving;
  };
  const urbanStandard = weighted((r) => r.urban >= inputs.urbanisation);
  const ruralStandard = weighted((r) => r.urban < inputs.urbanisation);

  const next: Living = {
    access,
    standardOfLiving,
    qualityOfLife,
    lifeSatisfaction,
    happiness,
    regionalInequality,
    urbanAdvantage: urbanStandard - ruralStandard,
    ruralGap: Math.max(0, standardOfLiving - ruralStandard),
    regional,
    history: [
      ...living.history,
      {
        turn: inputs.turn,
        standardOfLiving,
        qualityOfLife,
        lifeSatisfaction,
        happiness,
      },
    ].slice(-208),
  };

  return {
    living: next,
    failing,
    /*
     * The shape a long, competent, unrewarded government produces.
     *
     * Not unhappiness — a well-run country does not make people unhappy.
     * It is the ABSENCE OF MOMENTUM: satisfaction high, and the mood
     * sitting at dead neutral because nothing has got better lately.
     * A country still improving does not read this way however good it
     * already is, and a country sliding reads as falling rather than
     * flat. Worth surfacing, because a player who cannot see it concludes
     * the polling is broken.
     */
    contentedButUnhappy: lifeSatisfaction > 68 && Math.abs(happiness - 50) < 4,
  };
}

/** One line on what it is like to live here. */
export function describeLiving(living: Living): string {
  const worst = living.access.reduce((a, b) => (b.level < a.level ? b : a));
  const template = findAccess(worst.key);

  if (living.happiness < 40 && living.lifeSatisfaction > 60) {
    return `A good country that is not getting better. Satisfaction is holding at ${living.lifeSatisfaction.toFixed(0)}, but nothing has improved lately and the mood reads ${living.happiness.toFixed(0)}. Competence is not the same as momentum, and only one of them is felt.`;
  }
  if (living.happiness > 60 && living.lifeSatisfaction < 55) {
    return `Things are still not good — satisfaction at ${living.lifeSatisfaction.toFixed(0)} — but they are getting better fast enough that people have noticed. That is the most valuable position a government can be in and the hardest to stay in.`;
  }
  if (worst.level < 45) {
    return `${template.label.toLowerCase()} is the domain people cannot reach: ${worst.level.toFixed(0)} out of a hundred, and ${worst.gradient.toFixed(0)} points worse at the bottom of the distribution than the top. ${template.blurb}`;
  }
  if (living.ruralGap > 12) {
    return `The national standard of living reads ${living.standardOfLiving.toFixed(0)}, and outside the cities it reads ${(living.standardOfLiving - living.ruralGap).toFixed(0)}. Both numbers are true; only one of them gets quoted.`;
  }
  return `Standard of living ${living.standardOfLiving.toFixed(0)}, quality of life ${living.qualityOfLife.toFixed(0)}, satisfaction ${living.lifeSatisfaction.toFixed(0)}, and a mood of ${living.happiness.toFixed(0)}.`;
}
