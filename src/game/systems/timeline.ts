/**
 * timeline.ts — what a war does to everything that is not the war, and
 * what the country remembers afterwards.
 *
 * A WAR IS NOT A SUBSYSTEM. It is a pressure on every other subsystem,
 * and the reason governments lose elections over wars they are winning
 * is that the winning happens in one place and the pressure arrives
 * everywhere else. This file exists so the whole shape of that can be
 * read at once rather than spread through the turn loop as thirty
 * unrelated adjustments.
 *
 * The five chains:
 *
 *   WAR → ECONOMY. Growth, through disruption and through what the
 *   civilian economy is not making. Debt or inflation, depending on how
 *   it is being paid for. And a defence industry that does not unwind.
 *
 *   WAR → SOCIETY. Bereavement, which is a social fact before it is a
 *   political one. Displacement, from ground that has been fought over.
 *   And the belief that acting changes things, which drains at exactly
 *   the moment the country most wants it to be true.
 *
 *   WAR → POLITICS. Trust, the norms, and an emergency nobody voted for.
 *
 *   WAR → MEDIA. One story, crowding out every other story, which is why
 *   a government at war can do almost nothing else and why everything it
 *   does do goes unreported.
 *
 *   WAR → GEOPOLITICS. Reputation, which falls for whoever started it
 *   regardless of who was right.
 *
 * AND THE COUNTRY REMEMBERS. Every major war becomes an entry in a
 * record that outlives the government that fought it and is read back
 * fifty and a hundred years later — which is the difference between a
 * strategy game and an alternate history somebody is living in.
 */

import {
  AGGRESSOR_REPUTATION,
  BEREAVEMENT_PER_THOUSAND,
  DISPLACEMENT_RATE,
  GENERATIONAL_CASUALTIES,
  TURNS_PER_YEAR,
  VETERANS_PER_THOUSAND,
  WAR_EFFICACY_DRAIN,
  WAR_GROWTH_DRAG,
  WAR_NORMS_DRAIN,
  WAR_TRUST_DRAIN,
} from '../balance.ts';
import type { Crisis, Theatre, Timeline, TimelineEntry, TimelineKind } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildTimeline(firstYear: number): Timeline {
  return { entries: [], wars: [], firstYear };
}

/** The in-game year a given week falls in. */
export function yearOf(timeline: Timeline, week: number): number {
  return timeline.firstYear + Math.floor(week / TURNS_PER_YEAR);
}

/* ------------------------------------------------------------------ *
 * The five chains
 * ------------------------------------------------------------------ */

export interface WarPressureInputs {
  wars: readonly Crisis[];
  theatres: readonly Theatre[];
  /** Whether this country started any of them. */
  weStarted: boolean;
  population: number;
  /** Casualties this week, in thousands. */
  casualties: number;
  turn: number;
}

/**
 * What the wars are doing to everything else this week.
 *
 * Returned as a bundle rather than applied, so the turn loop applies it
 * in one place and a reader can see the whole chain in one object
 * instead of hunting for thirty adjustments.
 */
export interface WarPressure {
  growthDrag: number;
  bereaved: number;
  displaced: number;
  efficacyDrain: number;
  trustDrain: number;
  normsDrain: number;
  /** How much of the news is this and nothing else, 0–1. */
  newsCrowding: number;
  reputationDrain: number;
  /** Veterans created this week, in thousands. A constituency, later. */
  veterans: number;
  /** Whether this is a generational event rather than an episode. */
  generational: boolean;
  intensity: number;
}

const QUIET: WarPressure = {
  growthDrag: 0,
  bereaved: 0,
  displaced: 0,
  efficacyDrain: 0,
  trustDrain: 0,
  normsDrain: 0,
  newsCrowding: 0,
  reputationDrain: 0,
  veterans: 0,
  generational: false,
  intensity: 0,
};

export function warPressure(inputs: WarPressureInputs): WarPressure {
  const live = inputs.wars.filter((c) => c.stage === 'war');
  if (live.length === 0) return QUIET;

  const intensity = Math.min(100, live.reduce((sum, c) => sum + c.escalation, 0));
  const totalCasualties = live.reduce((sum, c) => sum + c.casualties, 0);

  /*
   * How long they have been going, which is the term that matters most:
   * a war in its third year is a different political object from the
   * same war in its third month, and nothing about the fighting has to
   * change for that to be true.
   */
  const longest = live.reduce((weeks, c) => Math.max(weeks, inputs.turn - c.startedTurn), 0);
  const grinding = clamp(longest / (TURNS_PER_YEAR * 2), 0, 2.5);

  return {
    growthDrag: (intensity / 100) * WAR_GROWTH_DRAG * (1 + grinding * 0.4),
    /* Bereavement, measured against the size of the country rather than
       in absolutes, because that is how it is felt. */
    bereaved: inputs.casualties * BEREAVEMENT_PER_THOUSAND,
    displaced: inputs.theatres.reduce(
      (sum, t) =>
        sum +
        t.sectors.reduce(
          (inner, s) => inner + (s.devastation / 100) * s.population * DISPLACEMENT_RATE * 0.004,
          0,
        ),
      0,
    ),
    /*
     * And the belief that acting changes anything, which drains at
     * exactly the moment the country most wants it to be true. A war
     * that will not end teaches people that what they think about it
     * does not matter, and that lesson outlasts the war.
     */
    efficacyDrain: WAR_EFFICACY_DRAIN * (1 + grinding),
    trustDrain: WAR_TRUST_DRAIN * grinding,
    normsDrain: WAR_NORMS_DRAIN * (intensity / 100) * (1 + grinding * 0.5),
    newsCrowding: clamp(0.3 + (intensity / 100) * 0.55, 0, 0.92),
    /* Falls for whoever started it, regardless of who was right, and
       there is no version of the argument that recovers it while the war
       is running. */
    reputationDrain: inputs.weStarted ? AGGRESSOR_REPUTATION * (intensity / 100) : 0,
    veterans: inputs.casualties * VETERANS_PER_THOUSAND,
    generational: totalCasualties > GENERATIONAL_CASUALTIES,
    intensity,
  };
}

/* ------------------------------------------------------------------ *
 * What the country remembers
 * ------------------------------------------------------------------ */

/** Add something to the record. It outlives whoever put it there. */
export function record(timeline: Timeline, entry: Omit<TimelineEntry, 'id'>): Timeline {
  return {
    ...timeline,
    entries: [
      ...timeline.entries,
      { ...entry, id: `tl-${entry.kind}-${entry.startYear}-${timeline.entries.length}` },
    ],
  };
}

/** Close an entry that was still running. */
export function closeEntry(
  timeline: Timeline,
  id: string,
  endYear: number,
  consequences: string[] = [],
): Timeline {
  return {
    ...timeline,
    entries: timeline.entries.map((e) =>
      e.id === id ? { ...e, endYear, consequences: [...e.consequences, ...consequences] } : e,
    ),
  };
}

/** The entry still open for a given war, if there is one. */
export function openEntryFor(timeline: Timeline, warId: string): TimelineEntry | undefined {
  return timeline.entries.find((e) => e.warId === warId && e.endYear === null);
}

/**
 * Everything the country remembers, newest first.
 *
 * With a horizon, because the whole point is being able to look back
 * fifty or a hundred years and find that the reason a region votes the
 * way it does is a war nobody in the government was alive for.
 */
export function lookBack(timeline: Timeline, fromYear: number, years: number): TimelineEntry[] {
  return timeline.entries
    .filter((e) => e.startYear >= fromYear - years)
    .sort((a, b) => b.startYear - a.startYear);
}

/** What still explains the present, by weight. */
export function stillMatters(timeline: Timeline, fromYear: number): TimelineEntry[] {
  return [...timeline.entries]
    .map((e) => ({
      entry: e,
      /* Everything fades. Wars fade slowest, which is why the map of a
         country's politics is so often a map of its wars. */
      live: e.weight * Math.max(0.15, 1 - (fromYear - e.startYear) / 90),
    }))
    .sort((a, b) => b.live - a.live)
    .slice(0, 6)
    .map((x) => x.entry);
}

/**
 * The line a history would write about a war.
 *
 * Written from the record rather than from anybody's account of it,
 * which is the only reason it is worth keeping.
 */
export function warSummary(
  war: {
    name: string;
    startedTurn: number;
    endedTurn: number;
    casualties: number;
    outcome: string;
    governmentsFallen: number;
    alliesInvolved: number;
    territoryChanged: number;
  },
  firstYear: number,
): { title: string; summary: string; consequences: string[] } {
  const from = firstYear + Math.floor(war.startedTurn / TURNS_PER_YEAR);
  const to = firstYear + Math.floor(war.endedTurn / TURNS_PER_YEAR);
  const years = Math.max(0.1, (war.endedTurn - war.startedTurn) / TURNS_PER_YEAR);

  const consequences: string[] = [
    `${war.casualties.toFixed(0)}k casualties over ${years.toFixed(1)} years`,
  ];
  if (war.alliesInvolved > 0) consequences.push(`${war.alliesInvolved + 2} countries involved`);
  if (war.territoryChanged > 0) consequences.push(`${war.territoryChanged} territorial changes`);
  if (war.governmentsFallen > 0) {
    consequences.push(
      war.governmentsFallen === 1
        ? 'The government changed once'
        : `The government changed ${war.governmentsFallen} times`,
    );
  }

  return {
    title: `${from}${to > from ? `–${to}` : ''} — ${war.name}`,
    summary: `${war.outcome}. ${
      war.casualties > GENERATIONAL_CASUALTIES
        ? 'A generation was formed by it, and voted accordingly for the next forty years.'
        : 'Remembered in the places it was fought and largely not elsewhere.'
    }`,
    consequences,
  };
}

/** How much of the country's later life an entry explains. */
export function weightOf(kind: TimelineKind, casualties = 0, governmentsFallen = 0): number {
  const base: Record<TimelineKind, number> = {
    war: 45,
    government: 12,
    election: 10,
    treaty: 18,
    economy: 24,
    constitutional: 40,
    disaster: 22,
  };
  return clamp(base[kind] + casualties * 0.35 + governmentsFallen * 8, 5, 100);
}

/** One line on what the country is still carrying. */
export function describeTimeline(timeline: Timeline, year: number): string {
  const wars = timeline.wars.length;
  const live = stillMatters(timeline, year);

  if (timeline.entries.length === 0 && wars === 0) {
    return 'Nothing yet that a history would record. Everything the country is now, it was when this government arrived.';
  }
  if (wars > 0) {
    const worst = [...timeline.wars].sort((a, b) => b.casualties - a.casualties)[0]!;
    const ago = year - (timeline.firstYear + Math.floor(worst.startedTurn / TURNS_PER_YEAR));
    return `${wars === 1 ? 'One war' : `${wars} wars`} in the record. The largest was ${ago} years ago and cost ${worst.casualties.toFixed(0)}k; the parts of the country it was fought in still vote differently because of it, and nobody in this government was there.`;
  }
  return `${timeline.entries.length} entries. The one still doing most to explain the present is ${live[0]?.title ?? 'none of them'}.`;
}
