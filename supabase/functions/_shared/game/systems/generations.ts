/**
 * generations.ts — the electorate that replaces itself underneath you.
 *
 * Four cohorts, each formed by the country it grew up in and each keeping
 * that formation for life. They do not converge with age: people do not
 * become their parents, they become older versions of themselves, and the
 * apparent conservatism of the old is very largely the persistence of
 * what was normal when they were twenty.
 *
 * That gives the one mechanic this file exists for. The national centre
 * of gravity is the cohort-weighted average of positions nobody is
 * changing — so it MOVES ON ITS OWN, at the rate the oldest cohort is
 * replaced by the youngest, and in a direction set by what the country
 * was like a generation ago. A government can be perfectly positioned
 * against the electorate of its first term and quietly mispositioned by
 * its third, having changed nothing.
 *
 * The rate is roughly one and a quarter per cent of the electorate a
 * year, which sounds like nothing and is eight per cent a term. Over the
 * span of a long career it is the largest single force acting on where
 * the votes are, and it is the only one no campaign can address.
 *
 * Formation is not asserted. Each new cohort is formed by the conditions
 * the simulation was actually in while it was growing up: a cohort that
 * came of age under a housing crisis and a squeezed bottom band carries
 * that, and the government responsible will be answering for it in
 * twenty years.
 */

import {
  COHORT_FORMATION_YEARS,
  COHORT_REPLACEMENT_PER_YEAR,
  TURNS_PER_YEAR,
} from '../balance.ts';
import { makeIdeology } from '../ideology.ts';
import type { Generations, Cohort, Ideology } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const axis = (v: number) => clamp(v, -1, 1);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

/**
 * The four cohorts a country starts with.
 *
 * Positions are OFFSETS from the country's own centre, not absolutes, so
 * that a country's politics as a whole can sit anywhere and the internal
 * spread — which is what this file is about — survives being moved.
 *
 * The shape is the ordinary one: each cohort somewhat more socially
 * liberal and somewhat more environmentally concerned than the one before
 * it, with the economic axis not moving in any consistent direction at
 * all, because it does not.
 */
export function buildGenerations(): Generations {
  const cohorts: Cohort[] = [
    {
      id: 'eldest',
      label: 'Formed before the last settlement',
      share: 0.22,
      lean: makeIdeology(0.08, -0.34, -0.2),
      turnout: 1.34,
      formedAtTurn: 0,
    },
    {
      id: 'older',
      label: 'Formed in the long expansion',
      share: 0.29,
      lean: makeIdeology(0.06, -0.12, -0.08),
      turnout: 1.15,
      formedAtTurn: 0,
    },
    {
      id: 'middle',
      label: 'Formed in the years after it ended',
      share: 0.27,
      lean: makeIdeology(-0.04, 0.12, 0.1),
      turnout: 0.94,
      formedAtTurn: 0,
    },
    {
      id: 'youngest',
      label: 'Coming of age now',
      share: 0.22,
      lean: makeIdeology(-0.06, 0.3, 0.24),
      turnout: 0.72,
      formedAtTurn: 0,
    },
  ];
  const centre = weightedCentre(cohorts);
  return {
    cohorts,
    centre,
    /* Where the country started, kept so drift is measured over the whole
       career rather than over whatever the history buffer still holds. */
    opening: centre,
    /* Enough of a run has to pass before a cohort has anything to be
       formed by. Until then the youngest is the one the country was
       handed. */
    formingSince: 0,
    forming: makeIdeology(0, 0, 0),
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/** The electorate's centre of gravity, weighted by share and by turnout. */
export function weightedCentre(cohorts: readonly Cohort[]): Ideology {
  let weight = 0;
  let economic = 0;
  let social = 0;
  let environmental = 0;
  for (const cohort of cohorts) {
    const w = cohort.share * cohort.turnout;
    weight += w;
    economic += cohort.lean.economic * w;
    social += cohort.lean.social * w;
    environmental += cohort.lean.environmental * w;
  }
  if (weight <= 0) return makeIdeology(0, 0, 0);
  return makeIdeology(economic / weight, social / weight, environmental / weight);
}

/**
 * How far the centre has moved since the run began, per axis.
 *
 * The number a government that has not changed its positions should be
 * looking at, and the one it will not think to look at.
 *
 * Measured against a stored opening rather than against the first entry
 * in the history, which is capped at eight years — so a long run was
 * reporting drift over a sliding window and a forty-year career looked
 * like less movement than an eight-year one.
 */
export function centreDrift(generations: Generations): Ideology {
  return makeIdeology(
    generations.centre.economic - generations.opening.economic,
    generations.centre.social - generations.opening.social,
    generations.centre.environmental - generations.opening.environmental,
  );
}

/** How far the youngest cohort sits from the eldest, across all axes. */
export function generationGap(generations: Generations): number {
  const young = generations.cohorts[generations.cohorts.length - 1];
  const old = generations.cohorts[0];
  if (!young || !old) return 0;
  return (
    Math.sqrt(
      ((young.lean.economic - old.lean.economic) ** 2 +
        (young.lean.social - old.lean.social) ** 2 +
        (young.lean.environmental - old.lean.environmental) ** 2) /
        3,
    ) * 100
  );
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface GenerationsInputs {
  /**
   * What the country is like for the people growing up in it now.
   *
   * These form the next cohort. A generation that comes of age unable to
   * afford a house and watching the bottom of the distribution lose
   * ground carries that for sixty years, and whoever is sitting at this
   * desk now is the one forming it.
   */
  housingCostBurden: number;
  homeownership: number;
  lowerDisposable: number;
  incomeGini: number;
  /** Whether the state is seen to work, which forms attitudes to it. */
  institutionalTrust: number;
  efficacy: number;
  /** The environment they are inheriting. */
  environmentHealth: number;
  /** Whether anybody has a job, which forms attitudes to the market. */
  youthUnemployment: number;
  turn: number;
}

export interface GenerationsTick {
  generations: Generations;
  /** True the week a new cohort takes its place in the electorate. */
  cohortArrived: boolean;
  /** True the week the centre has drifted further than a campaign can cover. */
  driftedAway: boolean;
}

/**
 * What the country now is doing to the people growing up in it.
 *
 * Offsets from the centre, accumulated over the formation years and then
 * fixed for life. Nothing here is asserted: each term reads a condition
 * the player is responsible for.
 */
function formationOf(inputs: GenerationsInputs): Ideology {
  /*
   * Shut out of housing: a generation that cannot buy is more willing to
   * see the state intervene in who owns what, and considerably less
   * attached to the arrangements that produced it.
   */
  const shutOut = (inputs.housingCostBurden - 24) / 30 + (66 - inputs.homeownership) / 60;
  /* And a squeezed bottom band with a widening distribution. */
  const squeezed = (100 - inputs.lowerDisposable) / 45 + (inputs.incomeGini - 0.33) * 2.2;
  /* A state that visibly does not work forms people who do not expect it
     to, which is a durable and largely irreversible attitude. */
  const failed = (52 - inputs.institutionalTrust) / 55 + (54 - inputs.efficacy) / 60;
  /* No work at the point of entering it. */
  const jobless = (inputs.youthUnemployment - 10.5) / 22;

  return makeIdeology(
    axis(-0.06 - shutOut * 0.16 - squeezed * 0.14 + jobless * 0.05),
    axis(0.3 - failed * 0.1),
    axis(0.24 + (60 - inputs.environmentHealth) / 130),
  );
}

export function stepGenerations(
  generations: Generations,
  inputs: GenerationsInputs,
): GenerationsTick {
  const weekly = 1 / TURNS_PER_YEAR;

  /*
   * The cohort currently being formed. An average over the whole
   * formation period rather than a snapshot, so one bad year does not
   * define a generation and a bad decade does.
   */
  const yearsForming = (inputs.turn - generations.formingSince) * weekly;
  const sample = formationOf(inputs);
  const blend = yearsForming > 0 ? Math.min(1, weekly / Math.max(weekly, yearsForming)) : 1;
  const forming = makeIdeology(
    generations.forming.economic + (sample.economic - generations.forming.economic) * blend,
    generations.forming.social + (sample.social - generations.forming.social) * blend,
    generations.forming.environmental +
      (sample.environmental - generations.forming.environmental) * blend,
  );

  /*
   * Replacement. Every week a sliver of the eldest cohort leaves the
   * electorate and a sliver of the youngest enters it. Nobody's opinions
   * change; the weights do. This is the whole mechanic and it is why a
   * government can be perfectly positioned in its first term and
   * mispositioned in its third having changed nothing.
   */
  const move = COHORT_REPLACEMENT_PER_YEAR * weekly;
  let cohorts = generations.cohorts.map((cohort, i) => {
    if (i === 0) return { ...cohort, share: Math.max(0, cohort.share - move) };
    if (i === generations.cohorts.length - 1) {
      return { ...cohort, share: cohort.share + move };
    }
    return cohort;
  });

  /* And as a cohort ages it votes more, which is the other half of why
     the old are over-represented in every democracy that has ever
     counted. */
  cohorts = cohorts.map((cohort, i) => ({
    ...cohort,
    turnout: clamp(cohort.turnout + (i === cohorts.length - 1 ? 0.00012 : 0), 0.5, 1.5),
  }));

  /*
   * When the youngest cohort has been arriving for a full formation
   * period, it stops being the youngest: it is fixed at what it became,
   * and a new one begins arriving behind it formed by the country as it
   * is now. The eldest, by then a rounding error, leaves the list.
   */
  let cohortArrived = false;
  if (yearsForming >= COHORT_FORMATION_YEARS) {
    cohortArrived = true;
    const settled = cohorts.map((c, i) =>
      i === cohorts.length - 1 ? { ...c, lean: forming, label: labelFor(inputs.turn) } : c,
    );
    cohorts = [
      ...settled.slice(1),
      {
        id: `cohort-${inputs.turn}`,
        label: 'Coming of age now',
        share: 0.01,
        lean: forming,
        turnout: 0.72,
        formedAtTurn: inputs.turn,
      },
    ];
    /*
     * The settled cohorts are levelled and the new arrival starts small.
     *
     * Without this the ends of the ladder accumulate everything — the
     * youngest gathers sixteen years of arrivals while nobody leaves it,
     * and after two replacements nearly half the electorate sits in one
     * cohort, which is not a shape any country's age structure has. The
     * three settled cohorts are each roughly a generation wide, so they
     * are each roughly a generation's worth of people.
     */
    const arriving = cohorts[cohorts.length - 1]!;
    const settledCount = cohorts.length - 1;
    const each = (1 - arriving.share) / Math.max(1, settledCount);
    cohorts = cohorts.map((c, i) =>
      i === cohorts.length - 1 ? c : { ...c, share: each },
    );
  }

  const centre = weightedCentre(cohorts);
  const next: Generations = {
    cohorts,
    centre,
    opening: generations.opening,
    formingSince: cohortArrived ? inputs.turn : generations.formingSince,
    forming: cohortArrived ? makeIdeology(0, 0, 0) : forming,
    history: [
      ...generations.history,
      { turn: inputs.turn, centre, gap: generationGap({ ...generations, cohorts, centre }) },
    ].slice(-416),
  };

  const drift = centreDrift(next);
  const distance = Math.sqrt(
    (drift.economic ** 2 + drift.social ** 2 + drift.environmental ** 2) / 3,
  );
  const before = centreDrift(generations);
  const wasDistance = Math.sqrt(
    (before.economic ** 2 + before.social ** 2 + before.environmental ** 2) / 3,
  );

  return {
    generations: next,
    cohortArrived,
    driftedAway: distance > 0.08 && wasDistance <= 0.08,
  };
}

/** A name for a cohort, from when it was formed. */
function labelFor(turn: number): string {
  const years = Math.floor(turn / TURNS_PER_YEAR);
  return `Formed in the ${years === 0 ? 'opening' : `year ${years}`} settlement`;
}

/** One line on where the electorate is going without being asked. */
export function describeGenerations(generations: Generations): string {
  const drift = centreDrift(generations);
  const gap = generationGap(generations);
  const biggest = (
    [
      ['economically', drift.economic],
      ['socially', drift.social],
      ['on the environment', drift.environmental],
    ] as const
  ).reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));

  if (Math.abs(biggest[1]) > 0.06) {
    return `The electorate's centre has moved ${Math.abs(biggest[1] * 100).toFixed(0)} points ${biggest[1] > 0 ? 'one way' : 'the other'} ${biggest[0]} since you took office, and nobody changed their mind: the oldest cohort is being replaced by the youngest at about one and a quarter per cent a year. A position that fitted the country in your first term does not have to fit it now.`;
  }
  if (gap > 30) {
    return `The youngest and oldest cohorts sit ${gap.toFixed(0)} points apart. They are not converging — people do not become their parents, they become older versions of themselves — so this is a gap that closes only by replacement.`;
  }
  return `Four cohorts, ${gap.toFixed(0)} points between the ends of them, and a centre that moves about one and a quarter per cent of the electorate a year whatever anybody does.`;
}
