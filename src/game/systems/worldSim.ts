/**
 * worldSim.ts — the world is not about you.
 *
 * Every other system in this engine is downstream of a decision the player
 * took. This one runs whether or not they are in the room, and most of what
 * it produces has nothing to do with Verdana at all: two countries neither
 * of whom have ever mentioned this one fall out, a middling economy grows
 * for twenty years and stops being middling, a bloc realigns around a
 * quarrel nobody here was party to.
 *
 * Three things make that a system rather than a backdrop.
 *
 *   COUNTRIES HAVE RELATIONSHIPS WITH EACH OTHER. Not just with the player.
 *   The pairs that matter — same bloc, shared border, opposite postures —
 *   drift on their own, and a pair that goes far enough negative goes to
 *   war without anybody here voting on it.
 *
 *   POWER IS A LIVE NUMBER. A country's weight in the world is set at the
 *   start and then moves, which means the trade gravity, the balance of
 *   force in a crisis and the arithmetic of every international vote all
 *   look different in term four than they did in term one. Nothing the
 *   player did caused that, and everything the player does has to account
 *   for it.
 *
 *   GLOBAL EVENTS ARRIVE THROUGH EXISTING CHANNELS. A commodity shock is an
 *   economic shock, a foreign war is tension plus a trade multiplier, a
 *   pandemic is the health sector and the workforce. Nothing here gets its
 *   own machinery, because an event that needs its own machinery is an
 *   event that will not interact with anything.
 */

import {
  FOREIGN_WAR_THRESHOLD,
  GLOBAL_EVENT_BASE_RISK,
  PAIR_DRIFT_RATE,
  PAIR_WAR_RATE,
  PAIR_WOBBLE,
  POWER_DRIFT_RATE,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  GLOBAL_EVENT_TEMPLATES,
  findGlobalEvent,
  type GlobalEventTemplate,
} from '../content/globalEvents.ts';
import {
  NATION_TEMPLATES,
  findNation,
  type NationKey,
  type Posture,
} from '../content/nations.ts';
import type { Rng } from '../rng.ts';
import type { ForeignWar, GlobalEvent, NationPair } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A stable key for an unordered pair, so a:b and b:a are the same thing. */
export function pairKey(a: NationKey, b: NationKey): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/* ------------------------------------------------------------------ *
 * The pairs that matter
 * ------------------------------------------------------------------ */

/**
 * What two countries naturally think of each other.
 *
 * Bloc first, because alignment is the strongest single predictor of
 * anything in international relations and pretending otherwise would be
 * modelling a world that has never existed. Then whether they share a
 * border, which cuts both ways — neighbours trade most and fight most — and
 * then how far apart their politics actually are.
 */
export function naturalPair(
  a: NationKey,
  b: NationKey,
  /**
   * Live postures, where they are known.
   *
   * A government removed overnight is a different country by the following
   * week, and every relationship it is in moves with it. Without this the
   * map would be a constant and sixteen years would change nothing.
   */
  live?: ReadonlyMap<NationKey, Posture>,
): number {
  const template = findNation(a);
  const otherTemplate = findNation(b);
  const first = { ...template, posture: live?.get(a) ?? template.posture };
  const second = { ...otherTemplate, posture: live?.get(b) ?? otherTemplate.posture };

  let standing = 0;
  if (first.bloc === second.bloc && first.bloc !== 'unaligned') standing += 38;
  else if (first.bloc !== 'unaligned' && second.bloc !== 'unaligned') standing -= 22;

  /* Neighbours trade most and fight most. Both are true and the second is
     what makes a border a fact about a relationship rather than a map. */
  if (first.neighbour && second.neighbour) standing -= 8;

  const distance =
    Math.abs(first.ideology.economic - second.ideology.economic) +
    Math.abs(first.ideology.social - second.ideology.social);
  standing -= distance * 14;

  /* Two assertive countries in the same region is the oldest story there
     is, and two aligned ones is the least interesting. */
  if (first.posture === 'assertive' && second.posture === 'assertive') standing -= 16;
  if (first.posture === 'aligned' && second.posture === 'aligned') standing += 10;

  return clamp(standing, -100, 100);
}

/**
 * The pairs worth simulating.
 *
 * Not all sixty-six: only the ones with something at stake, because a
 * relationship between two small countries on opposite sides of the world
 * is not a fact anybody here will ever need. Selecting them by what is at
 * stake rather than by size is what keeps the simulation about the world
 * rather than about the big countries in it.
 */
export function buildPairs(): NationPair[] {
  const pairs: NationPair[] = [];

  for (let i = 0; i < NATION_TEMPLATES.length; i += 1) {
    for (let j = i + 1; j < NATION_TEMPLATES.length; j += 1) {
      const a = NATION_TEMPLATES[i]!;
      const b = NATION_TEMPLATES[j]!;
      const natural = naturalPair(a.key, b.key);
      const stakes = a.power + b.power;

      /* Worth simulating if they are close enough to matter to each other,
         far enough apart to argue, or big enough that everybody cares. */
      const notable = Math.abs(natural) > 30 || stakes > 2.4 || a.bloc === b.bloc;
      if (!notable) continue;

      pairs.push({ a: a.key, b: b.key, standing: natural });
    }
  }

  return pairs;
}

export function findPair(pairs: readonly NationPair[], a: NationKey, b: NationKey): NationPair | null {
  const key = pairKey(a, b);
  return pairs.find((p) => pairKey(p.a, p.b) === key) ?? null;
}

/** Who a country counts as a friend, for the votes that turn on it. */
export function alliesOf(pairs: readonly NationPair[], key: NationKey): NationKey[] {
  return pairs
    .filter((p) => (p.a === key || p.b === key) && p.standing > 45)
    .map((p) => (p.a === key ? p.b : p.a));
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface WorldSimInputs {
  turn: number;
  rng: Rng;
  /** How dangerous the world already is, which feeds back into itself. */
  tension: number;
  /**
   * The countries as they currently are, rather than as they were written.
   *
   * Optional so the simulation can be run on its own in a test, and read
   * wherever it is given, because power and posture are live.
   */
  nations?: readonly { key: NationKey; power: number; posture: Posture }[];
}

export interface WorldSimTick {
  pairs: NationPair[];
  wars: ForeignWar[];
  events: GlobalEvent[];
  /** Things that happened, for the report. */
  reports: { label: string; cause: string; tension: number }[];
  /** Points of tension the week's events added, net. */
  tension: number;
  /**
   * A government removed overnight, and what the country became.
   *
   * Applied by the caller, because the nations live in the world state
   * rather than here — and it is the single biggest thing that moves the
   * map, since every relationship that country is in moves with it.
   */
  upheaval: { nation: NationKey; from: Posture; to: Posture } | null;
}

/**
 * Advance the world by one week.
 *
 * Relationships drift toward what geography and politics imply, power
 * drifts toward nothing in particular, wars between other countries start
 * and end, and every so often something happens that was not aimed here.
 */
export function stepWorldSim(
  pairs: readonly NationPair[],
  wars: readonly ForeignWar[],
  events: readonly GlobalEvent[],
  inputs: WorldSimInputs,
): WorldSimTick {
  const reports: WorldSimTick['reports'] = [];
  let tension = 0;
  let upheaval: WorldSimTick['upheaval'] = null;

  const postures = new Map<NationKey, Posture>(
    (inputs.nations ?? []).map((n) => [n.key, n.posture]),
  );

  /* 1. Relationships between other countries. */
  const nextPairs = pairs.map((pair) => {
    const natural = naturalPair(pair.a, pair.b, postures);
    /* A war holds a relationship at the floor for as long as it runs. */
    const fighting = wars.some(
      (w) => !w.ended && pairKey(w.a, w.b) === pairKey(pair.a, pair.b),
    );
    const target = fighting ? -95 : natural;
    /* A relationship between two countries at war does not drift anywhere.
       It is gone within the month. */
    const rate = fighting ? PAIR_WAR_RATE : PAIR_DRIFT_RATE;
    /*
     * And a wobble, because relationships between countries move for
     * reasons no model captures — a remark, a funeral, a fishing dispute.
     * Without it the map would sit exactly where it was drawn and sixteen
     * years would change nothing, which is the one thing the world is
     * definitely not like.
     */
    const wobble = (inputs.rng.next() + inputs.rng.next() - 1) * PAIR_WOBBLE;
    const standing = pair.standing + (target - pair.standing) * rate + wobble;
    return { ...pair, standing: clamp(standing, -100, 100) };
  });

  /* 2. Wars between countries that are not this one. */
  const nextWars = wars.map((war) => {
    if (war.ended) return war;
    const weeks = inputs.turn - war.since;
    /* They end when they end. Nothing here is winnable by anybody the
       player can talk to, which is the point. */
    if (weeks > war.expected && inputs.rng.chance(0.06)) {
      reports.push({
        label: `${findNation(war.a).name} and ${findNation(war.b).name} have stopped`,
        cause:
          'A ceasefire that neither side is describing as a defeat. It lasted ' +
          `${Math.round(weeks / TURNS_PER_YEAR * 10) / 10} years and nobody here was consulted ` +
          'about any of it.',
        tension: -10,
      });
      tension -= 10;
      return { ...war, ended: true, endedTurn: inputs.turn };
    }
    /* While it runs it makes the whole world more dangerous. */
    tension += 0.04;
    return war;
  });

  /* A new one, occasionally, between the pair that has fallen furthest. */
  const worst = [...nextPairs].sort((a, b) => a.standing - b.standing)[0];
  if (
    worst &&
    worst.standing < FOREIGN_WAR_THRESHOLD &&
    !nextWars.some((w) => !w.ended && pairKey(w.a, w.b) === pairKey(worst.a, worst.b)) &&
    inputs.rng.chance(0.004 * (1 + inputs.tension / 100))
  ) {
    const first = findNation(worst.a);
    const second = findNation(worst.b);
    nextWars.push({
      a: worst.a,
      b: worst.b,
      since: inputs.turn,
      /* How long it is expected to last. Everybody is wrong about this. */
      expected: Math.round(TURNS_PER_YEAR * (0.8 + inputs.rng.next() * 2.4)),
      ended: false,
      endedTurn: null,
    });
    reports.push({
      label: `${first.name} and ${second.name} are at war`,
      cause:
        'Neither of them has asked Verdana for anything, which will not last. Whatever is ' +
        'being fought over was argued about for years while nobody here was paying attention.',
      tension: 16,
    });
    tension += 16;
  }

  /* 3. Global events: things that were not aimed here. */
  const nextEvents = events.map((event) => {
    if (event.ended) return event;
    if (inputs.turn >= event.startedTurn + findGlobalEvent(event.key).weeks) {
      return { ...event, ended: true };
    }
    return event;
  });

  const running = nextEvents.filter((e) => !e.ended).length;
  if (running < 3 && inputs.rng.chance(GLOBAL_EVENT_BASE_RISK)) {
    const template = pickEvent(nextEvents, inputs.rng);
    if (template) {
      nextEvents.push({
        key: template.key,
        startedTurn: inputs.turn,
        ended: false,
        respondedTurn: null,
      });
      reports.push({
        label: template.headline,
        cause: `${template.body} ${template.transmission}`,
        tension: template.effects.tension ?? 0,
      });
      tension += template.effects.tension ?? 0;

      /*
       * An upheaval is not only a headline. The country it happened in is
       * a different country by the following week, and every relationship
       * it is in moves with it — which is the single biggest thing that
       * redraws the map over a run.
       */
      if (template.kind === 'upheaval' && inputs.nations && inputs.nations.length > 0) {
        const subject = inputs.rng.pick(inputs.nations);
        const to = upheave(subject.posture, inputs.rng);
        upheaval = { nation: subject.key, from: subject.posture, to };
        reports.push({
          label: `${findNation(subject.key).name} is a different country this week`,
          cause:
            `Whatever it was, it is ${POSTURE_WORDS[to]} now. Every agreement it is party to ` +
            'is a question, and nobody in this building predicted it.',
          tension: 0,
        });
      }
    }
  }

  return { pairs: nextPairs, wars: nextWars, events: nextEvents, reports, tension, upheaval };
}

/** Weighted pick, skipping anything already running. */
function pickEvent(
  events: readonly GlobalEvent[],
  rng: Rng,
): GlobalEventTemplate | null {
  const running = new Set(events.filter((e) => !e.ended).map((e) => e.key));
  const available = GLOBAL_EVENT_TEMPLATES.filter((t) => !running.has(t.key));
  if (available.length === 0) return null;
  return rng.pickWeighted(available, (t) => t.weight);
}

/** How a posture reads in a sentence. */
export const POSTURE_WORDS: Record<Posture, string> = {
  assertive: 'assertive, and saying so',
  mercantile: 'interested in trade and nothing else',
  institutional: 'committed to process, sincerely or otherwise',
  guarded: 'closed, and watching the border',
  aligned: 'somebody else\u2019s partner',
  volatile: 'unpredictable, which is the worst of the six to live next to',
};

/**
 * A country's weight in the world, a week older.
 *
 * Drifting rather than trending, because over sixteen years some countries
 * rise and some fall and nobody can say in advance which — and because the
 * consequence is what matters: the trade gravity, the balance of force in a
 * crisis and the arithmetic of every international vote all look different
 * in term four than they did in term one.
 */
export function driftPower(power: number, base: number, rng: Rng): number {
  const pull = (base - power) * 0.02;
  const wander = (rng.next() + rng.next() - 1) * POWER_DRIFT_RATE;
  return clamp(power + pull + wander, base * 0.45, base * 1.9);
}

/**
 * What a government being removed overnight does to a country.
 *
 * Everything it was is now a question, and every relationship it is in
 * moves with it. This is the join between a global event and the map.
 */
export function upheave(posture: Posture, rng: Rng): Posture {
  const options: Posture[] = [
    'assertive',
    'mercantile',
    'institutional',
    'guarded',
    'aligned',
    'volatile',
  ];
  const others = options.filter((p) => p !== posture);
  return rng.pick(others);
}

/* ------------------------------------------------------------------ *
 * What it all adds up to
 * ------------------------------------------------------------------ */

export interface GlobalEffects {
  growth: number;
  inflation: number;
  trade: number;
  migration: number;
  health: number;
  productivity: number;
}

/**
 * Everything currently running, summed.
 *
 * Multiplicative for trade and additive for everything else, because two
 * shocks to the same flow compound and two shocks to a rate do not.
 */
export function globalEffects(events: readonly GlobalEvent[]): GlobalEffects {
  const total: GlobalEffects = {
    growth: 0,
    inflation: 0,
    trade: 1,
    migration: 0,
    health: 0,
    productivity: 0,
  };

  for (const event of events) {
    if (event.ended) continue;
    const template = findGlobalEvent(event.key);
    /* A government that acted gets some of it back. Not all: acting late
       on something that started somewhere else rarely works twice. */
    const relief = event.respondedTurn === null ? 1 : 0.55;

    total.growth += (template.effects.growth ?? 0) * relief;
    total.inflation += (template.effects.inflation ?? 0) * relief;
    total.trade *= 1 - (1 - (template.effects.trade ?? 1)) * relief;
    total.migration += (template.effects.migration ?? 0) * relief;
    total.health += (template.effects.health ?? 0) * relief;
    total.productivity += template.effects.productivity ?? 0;
  }

  return total;
}

/** Wars between other countries that are still running. */
export function liveWars(wars: readonly ForeignWar[]): ForeignWar[] {
  return wars.filter((w) => !w.ended);
}

/** A one-line account of the state of the world. */
export function describeWorld(
  wars: readonly ForeignWar[],
  events: readonly GlobalEvent[],
  tension: number,
): string {
  const fighting = liveWars(wars);
  const running = events.filter((e) => !e.ended);

  if (fighting.length > 1) {
    return 'More than one war, none of them this country’s. That is the kind of decade in which a middling power finds out what its agreements are worth.';
  }
  if (fighting.length === 1) {
    const war = fighting[0]!;
    return `${findNation(war.a).name} and ${findNation(war.b).name} are fighting. Nobody here voted on it and everybody here is paying for it.`;
  }
  if (running.length >= 2) {
    return 'Two things going wrong at once, neither of them aimed here. This is what a normal year in the world actually looks like.';
  }
  if (tension > 60) {
    return 'Quiet, in the way a room is quiet. Everybody is armed and nobody has said anything yet.';
  }
  return 'Nothing much is happening anywhere. It will not last, and no government has ever been given credit for a quiet year.';
}

export { GLOBAL_EVENT_TEMPLATES, findGlobalEvent };
