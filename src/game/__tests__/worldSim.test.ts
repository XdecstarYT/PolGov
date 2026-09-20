/**
 * worldSim.test.ts — the world is not about you.
 *
 * Every other system in this engine is downstream of a decision the player
 * took. This one runs whether or not they are in the room, and the test
 * that matters is the long one: over sixteen years the map has to have
 * changed shape without the player having done anything to it.
 *
 * The rest of these check that the changes arrive through channels that
 * already exist — the economy's shocks, the trade book, the migration
 * figure — because an event with its own machinery is an event that will
 * not interact with anything.
 */

import { describe, expect, it } from 'vitest';
import {
  FOREIGN_WAR_THRESHOLD,
  GLOBAL_EVENT_BASE_RISK,
  PAIR_DRIFT_RATE,
  TURNS_PER_YEAR,
} from '../balance.ts';
import { GLOBAL_EVENT_TEMPLATES, findGlobalEvent } from '../content/globalEvents.ts';
import { NATION_TEMPLATES, findNation } from '../content/nations.ts';
import { Rng } from '../rng.ts';
import {
  alliesOf,
  buildPairs,
  describeWorld,
  findPair,
  globalEffects,
  liveWars,
  naturalPair,
  pairKey,
  stepWorldSim,
} from '../systems/worldSim.ts';
import { createStandardGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import type { ForeignWar, GameState, GlobalEvent, NationPair } from '../index.ts';

function inOffice(id = 'world-test'): GameState {
  let state = createStandardGame(id);
  if (state.phase === 'coalition') {
    for (const candidate of state.negotiation!.candidates) {
      state = applyIntent(state, {
        type: 'negotiation_accept',
        partyId: candidate.partyId,
      }).state;
    }
    state = applyIntent(state, { type: 'negotiation_form_government' }).state;
  }
  return state;
}

/** Run the simulation on its own for a number of weeks. */
function simulate(
  weeks: number,
  seed = 7,
  tension = 40,
): { pairs: NationPair[]; wars: ForeignWar[]; events: GlobalEvent[]; reports: string[] } {
  let pairs = buildPairs();
  let wars: ForeignWar[] = [];
  let events: GlobalEvent[] = [];
  const reports: string[] = [];
  const rng = new Rng(seed);

  for (let week = 1; week <= weeks; week += 1) {
    const tick = stepWorldSim(pairs, wars, events, { turn: week, rng, tension });
    pairs = tick.pairs;
    wars = tick.wars;
    events = tick.events;
    reports.push(...tick.reports.map((r) => r.label));
  }
  return { pairs, wars, events, reports };
}

describe('countries have relationships with each other', () => {
  it('reads a pair the same way round either way', () => {
    expect(pairKey('united_states', 'new_zealand')).toBe(pairKey('new_zealand', 'united_states'));
  });

  it('puts bloc first, because alignment predicts more than anything else', () => {
    const sameBloc = NATION_TEMPLATES.filter((n) => n.bloc === 'western');
    expect(sameBloc.length).toBeGreaterThan(1);
    const within = naturalPair(sameBloc[0]!.key, sameBloc[1]!.key);

    const other = NATION_TEMPLATES.find(
      (n) => n.bloc !== 'western' && n.bloc !== 'non_aligned',
    )!;
    const across = naturalPair(sameBloc[0]!.key, other.key);
    expect(within).toBeGreaterThan(across);
  });

  it('simulates the pairs with something at stake and not the rest', () => {
    const pairs = buildPairs();
    const possible = (NATION_TEMPLATES.length * (NATION_TEMPLATES.length - 1)) / 2;
    expect(pairs.length).toBeGreaterThan(5);
    /* Not all of them. A relationship between two small countries on
       opposite sides of the world is not a fact anybody here will need. */
    expect(pairs.length).toBeLessThan(possible);
    for (const pair of pairs) {
      expect(findPair(pairs, pair.b, pair.a)).toEqual(pair);
    }
  });

  it('names who counts as a friend, for the votes that turn on it', () => {
    const pairs = buildPairs().map((p) => ({ ...p, standing: 70 }));
    const allies = alliesOf(pairs, 'united_states');
    expect(allies.length).toBeGreaterThan(0);
    expect(allies).not.toContain('united_states');
  });

  it('drifts slowly, because nothing this government does is driving them', () => {
    const moved = simulate(TURNS_PER_YEAR);
    const start = buildPairs();
    for (const pair of moved.pairs) {
      const before = findPair(start, pair.a, pair.b)!;
      /* They move. Not fast. */
      expect(Math.abs(pair.standing - before.standing)).toBeLessThan(30);
    }
    expect(PAIR_DRIFT_RATE).toBeLessThan(0.02);
  });
});

describe('wars between other people', () => {
  it('needs a relationship to have fallen a long way first', () => {
    /* Most bad relationships never become wars. A model where they did
       would produce a world at permanent war, which is wrong and boring. */
    expect(FOREIGN_WAR_THRESHOLD).toBeLessThan(-50);
  });

  it('holds the relationship at the floor while it runs', () => {
    const pairs = buildPairs();
    const pair = pairs[0]!;
    const war: ForeignWar = {
      a: pair.a,
      b: pair.b,
      since: 1,
      expected: 200,
      ended: false,
      endedTurn: null,
    };

    let current = [pair];
    const rng = new Rng(3);
    for (let week = 2; week <= 120; week += 1) {
      current = stepWorldSim(current, [war], [], { turn: week, rng, tension: 50 }).pairs;
    }
    expect(current[0]!.standing).toBeLessThan(pair.standing);
    expect(current[0]!.standing).toBeLessThan(-30);
  });

  it('makes the whole world more dangerous while it runs', () => {
    const pairs = buildPairs();
    const war: ForeignWar = {
      a: pairs[0]!.a,
      b: pairs[0]!.b,
      since: 1,
      expected: 400,
      ended: false,
      endedTurn: null,
    };
    const tick = stepWorldSim(pairs, [war], [], { turn: 5, rng: new Rng(1), tension: 40 });
    expect(tick.tension).toBeGreaterThan(0);
    expect(liveWars(tick.wars)).toHaveLength(1);
  });

  it('ends when it ends, and nobody here is consulted', () => {
    const pairs = buildPairs();
    let wars: ForeignWar[] = [
      { a: pairs[0]!.a, b: pairs[0]!.b, since: 1, expected: 20, ended: false, endedTurn: null },
    ];
    const rng = new Rng(9);
    let ended = false;
    for (let week = 2; week <= 400 && !ended; week += 1) {
      const tick = stepWorldSim(pairs, wars, [], { turn: week, rng, tension: 40 });
      wars = tick.wars;
      ended = wars[0]!.ended;
    }
    expect(ended).toBe(true);
    expect(wars[0]!.endedTurn).not.toBeNull();
  });
});

describe('things that were not aimed here', () => {
  it('describes every event from the outside in', () => {
    for (const template of GLOBAL_EVENT_TEMPLATES) {
      expect(template.headline.length).toBeGreaterThan(0);
      /* Every one says how it reaches here, because that is the thing a
         player has to learn and the thing no game ever says. */
      expect(template.transmission.length).toBeGreaterThan(20);
    }
  });

  it('offers no response to most of them, deliberately', () => {
    const silent = GLOBAL_EVENT_TEMPLATES.filter((t) => t.response === null);
    /* A government that could act on everything would be governing a world
       that revolved around it, which is the fantasy this is avoiding. */
    expect(silent.length).toBeGreaterThan(2);
  });

  it('arrives a few times a decade, and never more than three at once', () => {
    /*
     * A rate, not a count. One seed of a stochastic process says nothing —
     * an earlier version of this test asserted a threshold that one seed
     * happened to clear, which is a test of the seed. Five runs of sixteen
     * years measure the distribution instead.
     *
     * The band matters both ways. Too few and the world outside is
     * scenery; too many and there is always something running, which is
     * the failure this system was rebalanced to fix — a permanent
     * emergency reads as no emergency at all.
     */
    /*
     * One pass per seed, used for both claims. It ran the same five
     * sixteen-year simulations twice — once for the rate and once for the
     * concurrency cap — which doubled the slowest test in the suite for
     * nothing and made it the one that timed out under parallel load.
     */
    const seeds = [3, 5, 7, 11, 13];
    const runs = seeds.map((seed) => simulate(TURNS_PER_YEAR * 16, seed, 45));

    const counts = runs.map((run) => run.events.length);
    const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length;

    expect(mean).toBeGreaterThan(2);
    expect(mean).toBeLessThan(12);
    /* And no run of sixteen years passes without the world doing anything. */
    for (const count of counts) expect(count).toBeGreaterThan(0);
    expect(GLOBAL_EVENT_BASE_RISK).toBeLessThan(0.05);

    /* Three at once is the cap, so a bad year is bad and not absurd. */
    for (const run of runs) {
      let mostAtOnce = 0;
      for (let week = 1; week <= TURNS_PER_YEAR * 16; week += 1) {
        const live = run.events.filter(
          (e) => e.startedTurn <= week && week < e.startedTurn + findGlobalEvent(e.key).weeks,
        ).length;
        mostAtOnce = Math.max(mostAtOnce, live);
      }
      expect(mostAtOnce).toBeLessThanOrEqual(3);
    }
  });

  it('sums through channels that already exist', () => {
    const none = globalEffects([]);
    expect(none.trade).toBe(1);
    expect(none.growth).toBe(0);

    const running: GlobalEvent[] = [
      { key: 'foreign_war', startedTurn: 1, ended: false, respondedTurn: null },
      { key: 'shipping_disruption', startedTurn: 1, ended: false, respondedTurn: null },
    ];
    const both = globalEffects(running);
    /* Additive on rates, multiplicative on the flow — because two shocks
       to the same flow compound and two shocks to a rate do not. */
    expect(both.inflation).toBeCloseTo(
      findGlobalEvent('foreign_war').effects.inflation! +
        findGlobalEvent('shipping_disruption').effects.inflation!,
      6,
    );
    expect(both.trade).toBeLessThan(findGlobalEvent('shipping_disruption').effects.trade!);
    expect(both.trade).toBeLessThan(findGlobalEvent('foreign_war').effects.trade!);
  });

  it('gives a government that acted about half of it back, and never all', () => {
    const ignored: GlobalEvent[] = [
      { key: 'oil_shock', startedTurn: 1, ended: false, respondedTurn: null },
    ];
    const answered: GlobalEvent[] = [
      { key: 'oil_shock', startedTurn: 1, ended: false, respondedTurn: 4 },
    ];
    expect(globalEffects(answered).inflation).toBeLessThan(globalEffects(ignored).inflation);
    expect(globalEffects(answered).inflation).toBeGreaterThan(0);
  });

  it('stops when it stops', () => {
    const template = findGlobalEvent('oil_shock');
    let events: GlobalEvent[] = [
      { key: 'oil_shock', startedTurn: 1, ended: false, respondedTurn: null },
    ];
    const rng = new Rng(2);
    events = stepWorldSim([], [], events, {
      turn: 1 + template.weeks,
      rng,
      tension: 30,
    }).events;
    expect(events[0]!.ended).toBe(true);
    expect(globalEffects(events).inflation).toBe(0);
  });
});

describe('sixteen years of it', () => {
  it('leaves a different map than it started with', () => {
    /*
     * The measurement this system exists for. Nothing the player did
     * caused any of this, and everything the player does afterwards has to
     * account for it.
     */
    const start = buildPairs();
    const seeds = [3, 5, 7];

    let reports = 0;
    let events = 0;
    for (const seed of seeds) {
      const end = simulate(TURNS_PER_YEAR * 16, seed, 55);

      /* Every run redraws the map, whatever else it does or does not do. */
      const moved = end.pairs.filter((pair) => {
        const before = findPair(start, pair.a, pair.b)!;
        return Math.abs(pair.standing - before.standing) > 8;
      });
      expect(moved.length).toBeGreaterThan(0);

      reports += end.reports.length;
      events += end.events.length;
    }

    /* And things happened, to people who never mentioned this country.
       Summed across seeds, because a quiet sixteen years is a legitimate
       outcome and a quiet half-century is not. */
    expect(reports).toBeGreaterThan(seeds.length);
    expect(events).toBeGreaterThan(seeds.length);
  });
});

describe('through the turn engine', () => {
  it('starts with a world that already has relationships in it', () => {
    const state = inOffice('world-start');
    expect(state.world.pairs.length).toBeGreaterThan(5);
    expect(state.world.wars).toHaveLength(0);
    expect(state.world.globalEvents).toHaveLength(0);
  });

  it('refuses a response to something with no response', () => {
    const silent = GLOBAL_EVENT_TEMPLATES.find((t) => t.response === null)!;
    const state: GameState = {
      ...inOffice('world-silent'),
      politicalCapital: 200,
      world: {
        ...inOffice('world-silent').world,
        globalEvents: [
          { key: silent.key, startedTurn: 1, ended: false, respondedTurn: null },
        ],
      },
    };
    const result = applyIntent(state, { type: 'respond_globally', event: silent.key });
    expect(result.error).toContain('nothing a government here can do');
  });

  it('lets a government act once on the ones that have an answer', () => {
    const answerable = GLOBAL_EVENT_TEMPLATES.find((t) => t.response !== null)!;
    const base = inOffice('world-answer');
    const state: GameState = {
      ...base,
      politicalCapital: 200,
      world: {
        ...base.world,
        globalEvents: [
          { key: answerable.key, startedTurn: 1, ended: false, respondedTurn: null },
        ],
      },
    };

    const first = applyIntent(state, { type: 'respond_globally', event: answerable.key });
    expect(first.error).toBeUndefined();
    expect(first.state.world.globalEvents[0]!.respondedTurn).not.toBeNull();

    const again = applyIntent(
      { ...first.state, politicalCapital: 200 },
      { type: 'respond_globally', event: answerable.key },
    );
    expect(again.error).toContain('already been done');
  });

  it('describes the world without making it about this country', () => {
    const quiet = describeWorld([], [], 30);
    expect(quiet.length).toBeGreaterThan(0);

    const war: ForeignWar = {
      a: 'united_states',
      b: 'russia',
      since: 1,
      expected: 100,
      ended: false,
      endedTurn: null,
    };
    expect(describeWorld([war], [], 50)).toContain(findNation('united_states').name);
    expect(describeWorld([war], [], 50)).toContain('Nobody here voted on it');
  });
});
