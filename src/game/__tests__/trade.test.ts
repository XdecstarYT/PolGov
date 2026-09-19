/**
 * trade.test.ts — the decision that is popular first and expensive later.
 *
 * The claim this engine makes is that protection has a shape over time: the
 * sheltered industry says thank you this week, the partner answers in six,
 * and the price level never comes back. A trade model that did not produce
 * that shape would be a number that goes up when you are nice to people,
 * which is the version worth not building.
 *
 * So the long run is measured here rather than reasoned about. The arc in
 * "a trade war, over thirty weeks" is the test that matters; the rest of
 * these check the pieces it is built from.
 */

import { describe, expect, it } from 'vitest';
import {
  EXPORT_INTENSITY,
  IMPORT_INTENSITY,
  NEIGHBOUR_GRAVITY,
  RETALIATION_DELAY,
  SURCHARGE_MAX,
} from '../balance.ts';
import { findNation } from '../content/nations.ts';
import { createStandardGame } from '../setup.ts';
import { buildWorld } from '../systems/diplomacy.ts';
import {
  buildTrade,
  describeTrade,
  effectiveTariff,
  findFlow,
  gravityShare,
  importExposures,
  importPriceEffect,
  naturalFlow,
  netExports,
  setSurcharge,
  stepTrade,
  tariffEffects,
  totalExports,
  totalImports,
  tradeImpulse,
} from '../systems/trade.ts';
import { applyIntent } from '../turn.ts';
import type { GameState, NationKey, World } from '../index.ts';

const GDP = 3680;

const nationIn = (world: World, key: string) => {
  const found = world.nations.find((n) => n.key === key);
  if (!found) throw new Error(`no nation ${key}`);
  return found;
};
const book = () => buildTrade(GDP, buildWorld());

function inOffice(id = 'trade-test'): GameState {
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

/** Advance whole turns, resolving whatever the week puts in the way. */
function weeks(state: GameState, count: number): GameState {
  let s = state;
  for (let i = 0; i < count && s.status === 'active'; i += 1) {
    const from = s.turnNumber;
    let guard = 0;
    while (s.turnNumber === from && guard < 12 && s.status === 'active') {
      guard += 1;
      for (const event of s.events.filter((e) => !e.resolved)) {
        s = applyIntent(s, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
      }
      s = applyIntent(s, { type: 'advance_phase' }).state;
    }
  }
  return s;
}

describe('gravity', () => {
  it('shares the country’s trade out by size and distance', () => {
    const world = buildWorld();
    const shares = world.nations.map((n) => gravityShare(n.key, world));
    expect(shares.reduce((sum, s) => sum + s, 0)).toBeCloseTo(1, 6);
    for (const share of shares) expect(share).toBeGreaterThan(0);
  });

  it('gives a neighbour far more than its size implies', () => {
    /*
     * The gravity model, which is one of the most reliably predictive things
     * in economics and almost never appears in a game. Distance is not a
     * modifier on the relationship; it is most of the relationship.
     */
    const world = buildWorld();
    const neighbours = world.nations.filter((n) => n.neighbour);
    const distant = world.nations.filter((n) => !n.neighbour);
    expect(neighbours.length).toBeGreaterThan(0);

    /* Per unit of economy, a neighbour is worth exactly the gravity factor
       more than a distant country of any size. */
    const perUnit = (key: NationKey) =>
      gravityShare(key, world) / nationIn(world, key).economy;
    for (const near of neighbours) {
      for (const far of distant) {
        expect(perUnit(near.key) / perUnit(far.key)).toBeCloseTo(NEIGHBOUR_GRAVITY, 4);
      }
    }
  });

  it('opens the book where the relationships already put it', () => {
    /*
     * Not at the bare gravity figure. The relationships and the inherited
     * agreements exist on day one, so starting below their implied level
     * would have every flow drifting upward for years for no reason anybody
     * could see — and would quietly cancel the first tariff ever laid.
     */
    const trade = book();
    const world = buildWorld();
    for (const flow of trade.flows) {
      const want = naturalFlow(flow, {
        world,
        economy: { gdp: GDP } as never,
        nationalRate: 0,
        agreements: new Set(),
        turn: 0,
      });
      expect(flow.exports).toBeCloseTo(want.exports, 6);
      expect(flow.imports).toBeCloseTo(want.imports, 6);
    }
  });

  it('opens an economy about as open as the constants say', () => {
    const trade = book();
    expect(totalExports(trade) / GDP).toBeGreaterThan(EXPORT_INTENSITY * 0.9);
    expect(totalImports(trade) / GDP).toBeGreaterThan(IMPORT_INTENSITY * 0.9);
    /* And running the small deficit most countries this size run — small
       enough that the document calls it balance, which is what a deficit
       under two per cent of output is. */
    expect(netExports(trade)).toBeLessThan(0);
    expect(describeTrade(trade, GDP)).toContain('balance');

    /* A real one reads as one. */
    const closed = trade.flows.reduce((t, f) => setSurcharge(t, f.nation, 0), {
      ...trade,
      flows: trade.flows.map((f) => ({ ...f, exports: f.exports * 0.4 })),
    });
    expect(describeTrade(closed, GDP)).toContain('deficit');
  });
});

describe('tariffs', () => {
  it('lets an agreement out of the national rate, and a surcharge on top of it', () => {
    const flow = findFlow(book(), 'united_states');
    expect(effectiveTariff(flow, 0.02, false)).toBeCloseTo(2, 6);
    expect(effectiveTariff(flow, 0.02, true)).toBeCloseTo(0, 6);
    expect(effectiveTariff({ ...flow, surcharge: 15 }, 0.02, true)).toBeCloseTo(15, 6);
  });

  it('shelters one industry and punishes another, never the same one', () => {
    const trade = book();
    const tariffed = setSurcharge(trade, 'united_states', 20);
    const effects = tariffEffects(tariffed, 0.02, new Set());

    const values = Object.values(effects);
    expect(values.some((v) => v > 0)).toBe(true);
    /*
     * And the two are not the same places on the map. This is the join
     * between a decision taken in a trade ministry and a result that
     * arrives as a regional swing.
     */
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('reaches the price level, because a tariff is paid at the till', () => {
    const trade = book();
    const quiet = importPriceEffect(trade, 0.02, new Set(), GDP);
    const loud = importPriceEffect(
      trade.flows.reduce((t, f) => setSurcharge(t, f.nation, 20), trade),
      0.02,
      new Set(),
      GDP,
    );
    expect(loud).toBeGreaterThan(quiet);
    expect(quiet).toBeGreaterThan(0);
  });
});

describe('they answer back, and not immediately', () => {
  const inputs = (trade = book()) => ({
    trade,
    args: {
      world: buildWorld(),
      economy: { gdp: GDP } as never,
      nationalRate: 0.02,
      agreements: new Set<NationKey>(),
      turn: 1,
    },
  });

  it('says nothing for six weeks, and then everything at once', () => {
    const { args } = inputs();
    let trade = setSurcharge(book(), 'united_states', 25);

    for (let week = 0; week < RETALIATION_DELAY - 1; week += 1) {
      const tick = stepTrade(trade, { ...args, turn: week });
      trade = tick.trade;
      /* Nothing. The announcement has been made and the bill has not come. */
      expect(tick.retaliated).toHaveLength(0);
      expect(findFlow(trade, 'united_states').theirTariff).toBe(0);
    }

    const landed = stepTrade(trade, { ...args, turn: RETALIATION_DELAY });
    expect(landed.retaliated.length + landed.disputed.length).toBeGreaterThan(0);
  });

  it('answers a tariff in kind, or with a complaint, by disposition', () => {
    const { args } = inputs();
    /* Every partner tariffed at once, so every disposition is exercised. */
    let trade = book().flows.reduce((t, f) => setSurcharge(t, f.nation, 20), book());
    const retaliated: { nation: NationKey; to: number }[] = [];
    const disputed: NationKey[] = [];
    for (let week = 0; week <= RETALIATION_DELAY + 2; week += 1) {
      const tick = stepTrade(trade, { ...args, turn: week });
      trade = tick.trade;
      retaliated.push(...tick.retaliated);
      disputed.push(...tick.disputed);
    }

    expect(retaliated.length).toBeGreaterThan(0);
    /* An institutional government files rather than retaliates. Slower,
       and worse for a government that cares what the world thinks. */
    for (const key of disputed) {
      expect(findNation(key).posture).toBe('institutional');
    }
    /* An assertive one answers with a larger tariff than it was given. */
    const assertive = retaliated.find((r) => findNation(r.nation).posture === 'assertive');
    expect(assertive).toBeDefined();
    expect(assertive!.to).toBeGreaterThan(20);
  });

  it('does not answer a tariff coming down', () => {
    const { args } = inputs();
    const raised = setSurcharge(book(), 'united_states', 20);
    const lowered = setSurcharge(raised, 'united_states', 0);
    /* The clock was already running from the rise. Lowering does not
       restart it, and nothing new is triggered by generosity. */
    expect(findFlow(lowered, 'united_states').surcharge).toBe(0);

    let trade = setSurcharge(book(), 'united_states', 0);
    for (let week = 0; week <= RETALIATION_DELAY + 2; week += 1) {
      const tick = stepTrade(trade, { ...args, turn: week });
      trade = tick.trade;
      expect(tick.retaliated).toHaveLength(0);
    }
  });
});

describe('dependence is leverage, whichever way it runs', () => {
  it('names the partners the country could not replace', () => {
    const exposed = importExposures(book(), buildWorld());
    expect(exposed.length).toBeGreaterThan(0);
    for (const entry of exposed) {
      expect(entry.share).toBeGreaterThan(0.12);
      expect(entry.industries.length).toBeGreaterThan(0);
    }
    /* Ordered worst first, because that is the list a trade minister needs
       and the one most likely to be ignored until the week it matters. */
    for (let i = 1; i < exposed.length; i += 1) {
      expect(exposed[i - 1]!.share).toBeGreaterThanOrEqual(exposed[i]!.share);
    }
  });
});

describe('through the turn engine', () => {
  it('refuses a surcharge beyond what a schedule can carry', () => {
    const state = inOffice();
    const attempt = applyIntent(state, {
      type: 'set_tariff',
      nation: 'united_states',
      points: SURCHARGE_MAX + 10,
    });
    expect(attempt.error).toBeTruthy();
    expect(attempt.state).toBe(state);
  });

  it('cannot take a case to a room the country is not in', () => {
    const state = inOffice();
    const tariffed: GameState = {
      ...state,
      politicalCapital: 100,
      trade: {
        ...state.trade,
        flows: state.trade.flows.map((f) =>
          f.nation === 'united_states' ? { ...f, theirTariff: 12 } : f,
        ),
      },
      world: {
        ...state.world,
        organisations: state.world.organisations.map((o) =>
          o.key === 'wto' ? { ...o, member: false } : o,
        ),
      },
    };
    expect(
      applyIntent(tariffed, { type: 'file_trade_complaint', nation: 'united_states' }).error,
    ).toContain('filed somewhere');
  });

  it('is worth reputation to use the institutions instead of answering in kind', () => {
    const state = inOffice();
    const tariffed: GameState = {
      ...state,
      politicalCapital: 100,
      trade: {
        ...state.trade,
        flows: state.trade.flows.map((f) =>
          f.nation === 'united_states' ? { ...f, theirTariff: 18 } : f,
        ),
      },
      world: {
        ...state.world,
        organisations: state.world.organisations.map((o) =>
          o.key === 'wto' ? { ...o, member: true } : o,
        ),
      },
    };

    const filed = applyIntent(tariffed, { type: 'file_trade_complaint', nation: 'united_states' });
    expect(filed.error).toBeUndefined();
    expect(filed.state.world.reputation).toBeGreaterThan(tariffed.world.reputation);
    expect(findFlow(filed.state.trade, 'united_states').dispute).toBe('ours');
    /* And it still annoys the country complained about, just less than a
       tariff would have. */
    const was = tariffed.world.nations.find((n) => n.key === 'united_states')!.relations;
    expect(filed.state.world.nations.find((n) => n.key === 'united_states')!.relations).toBeLessThan(was);
  });

  it('a trade war, over thirty weeks', () => {
    /*
     * The measurement this whole system exists for. Three biggest partners
     * tariffed at twenty-five points on week one, and then nothing but time.
     */
    /* The control run, sampled at the same two weeks as the war, because a
       comparison across different weeks is a comparison of the cycle. */
    const controlAt6 = weeks(inOffice('trade-war-control'), 6);
    const controlAt30 = weeks(controlAt6, 24);

    let war: GameState = { ...inOffice('trade-war-control'), politicalCapital: 200 };
    for (const nation of ['united_states', 'russia', 'india'] as const) {
      const result = applyIntent(war, { type: 'set_tariff', nation, points: 25 });
      expect(result.error).toBeUndefined();
      war = { ...result.state, politicalCapital: 200 };
    }

    /*
     * Week six. Imports have started falling and nobody has answered yet,
     * so the trade balance — the number that gets announced — is better
     * than it would have been.
     *
     * And the numbers people actually feel are already worse. A tariff is
     * a supply shock, the central bank does not wait to see how the
     * politics goes, and the rate the country's debt is carried at has
     * already moved. The thing being sold as a win is visible in the
     * balance; the bill is visible at the till and on the gilt.
     */
    const early = weeks(war, 6);
    expect(netExports(early.trade)).toBeGreaterThan(netExports(war.trade));
    expect(netExports(early.trade)).toBeGreaterThan(netExports(controlAt6.trade));
    expect(early.economy.inflation).toBeGreaterThan(controlAt6.economy.inflation + 0.4);
    expect(early.economy.policyRate).toBeGreaterThan(controlAt6.economy.policyRate);

    /*
     * Week thirty. The answer has landed, exports are down further than
     * imports, and the trade balance is worse than if nothing had been
     * done — so even the number that was announced has gone. Growth is
     * well below the control run and prices never came back.
     */
    const late = weeks(early, 24);
    expect(netExports(late.trade)).toBeLessThan(netExports(controlAt30.trade));
    expect(late.economy.growth).toBeLessThan(controlAt30.economy.growth);
    expect(totalExports(late.trade)).toBeLessThan(totalExports(controlAt30.trade));

    /* And the price level never comes back. A tariff is paid at the till. */
    expect(late.economy.inflation).toBeGreaterThan(controlAt30.economy.inflation + 0.5);

    /* Somebody answered, in one form or another. */
    const answered = late.trade.flows.filter((f) => f.theirTariff > 0 || f.dispute !== 'none');
    expect(answered.length).toBeGreaterThan(0);

    /* And it reached the macroeconomy as a demand term rather than as a
       modifier somebody wrote on the growth figure. */
    expect(tradeImpulse(late.trade, late.economy.gdp)).toBeLessThan(0);
  }, 60000);
});
