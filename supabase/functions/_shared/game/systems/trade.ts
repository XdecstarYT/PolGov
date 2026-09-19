/**
 * trade.ts — what the country sells, what it buys, and who it needs.
 *
 * The temptation in a political game is to model trade as a number that goes
 * up when you are nice to people. What makes it interesting is the opposite:
 * trade is the one part of foreign policy with a domestic constituency on
 * both sides of every decision, and the decisions are irreversible on a
 * political timescale.
 *
 * Four mechanics carry that.
 *
 *   GRAVITY, NOT GOODWILL. How much two countries trade is mostly decided by
 *   how big they are and how close, and a government can move it at the
 *   margin. A player who expects a warm summit to double exports has
 *   misunderstood the shape of the thing; a player who ignores a neighbour
 *   for a term will find the flows were there the whole time anyway. Policy
 *   works on the margin, and the margin is where the politics is.
 *
 *   TARIFFS ARE PAID AT HOME. A tariff shelters the industry it protects and
 *   is paid by everybody who buys anything, which is everybody. Both halves
 *   reach the electorate through different doors — jobs in one region,
 *   prices in every till — and a government that only reads one of them is
 *   about to be surprised.
 *
 *   THEY ANSWER BACK, AND NOT IMMEDIATELY. Raise a tariff and the partner
 *   retaliates weeks later, by which time the domestic benefit has been
 *   announced and the cost has not arrived. That lag is the entire political
 *   economy of protection and it is modelled explicitly.
 *
 *   DEPENDENCE IS LEVERAGE, IN WHICHEVER DIRECTION IT RUNS. A country that
 *   buys a third of its energy from one state has handed that state a lever,
 *   and no amount of being right about anything takes it back. The panel
 *   names the exposure before the crisis rather than after it.
 */

import {
  EXPORT_INTENSITY,
  IMPORT_INTENSITY,
  NEIGHBOUR_GRAVITY,
  RETALIATION_DELAY,
  RETALIATION_RATIO,
  SANCTION_TRADE_MULTIPLIER,
  TARIFF_ELASTICITY,
  TRADE_ADJUST_RATE,
  TRADE_RELATIONS_WEIGHT,
  TRADE_TREATY_BONUS,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  INDUSTRY_TEMPLATES,
  findIndustry,
  type IndustryKey,
} from '../content/industries.ts';
import { NATION_TEMPLATES, findNation, type NationKey } from '../content/nations.ts';
import type { Economy, Trade, TradeFlow, World } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Building the book
 * ------------------------------------------------------------------ */

/**
 * The trade a new government inherits.
 *
 * Nobody arrives with a blank ledger. Every flow here was built by decades
 * of geography and somebody else's agreements, and the first thing a player
 * should notice is how little of it is theirs to decide.
 */
export function buildTrade(
  gdp: number,
  world: World,
  agreements: ReadonlySet<NationKey> = new Set(),
): Trade {
  const blank: TradeFlow[] = NATION_TEMPLATES.map((template) => ({
    nation: template.key,
    exports: 0,
    imports: 0,
    /* Surcharges are a government's doing. There are none on day one:
       whatever the last one thought about trade, it left no tariffs. */
    surcharge: 0,
    theirTariff: 0,
    retaliationDue: null,
    dispute: 'none' as const,
  }));

  /*
   * Every flow starts AT its natural level rather than at the bare gravity
   * figure, because the relationships and the inherited agreements already
   * exist. Starting below it would have every flow drifting upward for
   * years for no reason anybody could see, and would quietly cancel the
   * first tariff a government ever laid.
   */
  const inputs: TradeInputs = { world, economy: { gdp } as Economy, nationalRate: 0, agreements, turn: 0 };
  const flows = blank.map((flow) => ({ ...flow, ...naturalFlow(flow, inputs) }));

  return { flows, history: [] };
}

/**
 * How much of the country's trade a partner naturally accounts for.
 *
 * Size and distance, which is the gravity model and is one of the most
 * reliably predictive things in economics. A neighbour trades far more than
 * its size implies, and there is no policy that changes that.
 */
export function gravityShare(key: NationKey): number {
  const weights = NATION_TEMPLATES.map((t) => ({
    key: t.key,
    weight: t.economy * (t.neighbour ? NEIGHBOUR_GRAVITY : 1),
  }));
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  return (weights.find((w) => w.key === key)?.weight ?? 0) / total;
}

export function findFlow(trade: Trade, key: NationKey): TradeFlow {
  const found = trade.flows.find((f) => f.nation === key);
  if (!found) throw new Error(`trade: no flow with ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Reading the book
 * ------------------------------------------------------------------ */

/** Everything the country sells abroad, ₡bn a year. */
export function totalExports(trade: Trade): number {
  return trade.flows.reduce((sum, f) => sum + f.exports, 0);
}

/** Everything it buys, ₡bn a year. */
export function totalImports(trade: Trade): number {
  return trade.flows.reduce((sum, f) => sum + f.imports, 0);
}

/**
 * Net exports, ₡bn a year.
 *
 * The term the textbooks put at the end of Y = C + I + G + NX and most
 * games leave out entirely. A trade war is a contractionary fiscal policy
 * nobody voted for.
 */
export function netExports(trade: Trade): number {
  return totalExports(trade) - totalImports(trade);
}

/**
 * The tariff actually charged on a partner's goods, in points.
 *
 * The national rate applies to everybody who has no agreement. An agreement
 * removes it; a surcharge is laid on top of it. That is how tariff schedules
 * work and it is why a trade treaty is worth more than a warm relationship.
 */
export function effectiveTariff(
  flow: TradeFlow,
  nationalRate: number,
  hasAgreement: boolean,
): number {
  return Math.max(0, (hasAgreement ? 0 : nationalRate * 100) + flow.surcharge);
}

/**
 * Who the country cannot afford to fall out with.
 *
 * Exposure is not the same as a large flow: it is a large flow the country
 * could not replace. A partner that supplies a third of the imports in
 * industries with few other sources has a lever, and being right about
 * something does not take it back.
 */
export function importExposures(trade: Trade, world: World): {
  nation: NationKey;
  share: number;
  industries: IndustryKey[];
  hostile: boolean;
}[] {
  const total = Math.max(1, totalImports(trade));

  return trade.flows
    .map((flow) => {
      const template = findNation(flow.nation);
      const relations = world.nations.find((n) => n.key === flow.nation)?.relations ?? 0;
      return {
        nation: flow.nation,
        share: flow.imports / total,
        industries: template.sells,
        hostile: relations < -20,
      };
    })
    .filter((e) => e.share > 0.12)
    .sort((a, b) => b.share - a.share);
}

/**
 * What a tariff does to each industry, in points of output.
 *
 * Sheltered industries gain and exporters lose, and the two are never the
 * same places on the map. This is the join between a decision taken in a
 * trade ministry and a result that arrives as a regional swing.
 */
export function tariffEffects(
  trade: Trade,
  nationalRate: number,
  agreements: ReadonlySet<NationKey>,
): Record<string, number> {
  /* The average tariff faced by our exporters, weighted by where we sell. */
  const exportsTotal = Math.max(1, totalExports(trade));
  const facedAbroad = trade.flows.reduce(
    (sum, f) => sum + f.theirTariff * (f.exports / exportsTotal),
    0,
  );

  /* And the average we charge, which is what shelters domestic producers. */
  const importsTotal = Math.max(1, totalImports(trade));
  const chargedHere = trade.flows.reduce(
    (sum, f) =>
      sum + effectiveTariff(f, nationalRate, agreements.has(f.nation)) * (f.imports / importsTotal),
    0,
  );

  const effects: Record<string, number> = {};
  for (const template of INDUSTRY_TEMPLATES) {
    /* Sheltered by what we charge, punished by what we are charged. An
       industry with no tariff sensitivity feels neither. */
    effects[template.key] =
      (chargedHere * template.tariffSensitivity - facedAbroad * template.tariffSensitivity) * 0.06;
  }
  return effects;
}

/* ------------------------------------------------------------------ *
 * Acting
 * ------------------------------------------------------------------ */

/**
 * Put a surcharge on one partner's goods, or take one off.
 *
 * The retaliation clock starts here, not when it lands. That gap is the
 * whole political economy of protection: the announcement is this week and
 * the bill arrives after the news cycle has moved on.
 */
export function setSurcharge(trade: Trade, key: NationKey, points: number): Trade {
  return {
    ...trade,
    flows: trade.flows.map((flow) => {
      if (flow.nation !== key) return flow;
      const rising = points > flow.surcharge + 0.5;
      return {
        ...flow,
        surcharge: points,
        /* Lowering a tariff is not answered. Only raising one is. */
        retaliationDue: rising ? RETALIATION_DELAY : flow.retaliationDue,
      };
    }),
  };
}

/** Lodge a formal objection, or record one lodged against us. */
export function setDispute(trade: Trade, key: NationKey, dispute: TradeFlow['dispute']): Trade {
  return {
    ...trade,
    flows: trade.flows.map((f) => (f.nation === key ? { ...f, dispute } : f)),
  };
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface TradeInputs {
  world: World;
  economy: Economy;
  /** The national tariff rate, 0–1, from the tax code. */
  nationalRate: number;
  /** Partners the country holds a trade or partnership agreement with. */
  agreements: ReadonlySet<NationKey>;
  /**
   * What the world is doing to every flow at once.
   *
   * A closed strait, a foreign war or a pandemic is a multiplier on the
   * whole book rather than a fact about any one partner, and it belongs
   * here so that the flows settle at the level the world allows rather
   * than being corrected downstream.
   */
  globalMultiplier?: number;
  turn: number;
}

export interface TradeTick {
  trade: Trade;
  /** Partners that retaliated this week, for the report. */
  retaliated: { nation: NationKey; to: number }[];
  /** Partners that opened a formal dispute this week. */
  disputed: NationKey[];
}

/**
 * What a flow would settle at, given everything currently true.
 *
 * Gravity sets the scale and policy moves the margin, in that order,
 * because that is the order the world works in.
 */
export function naturalFlow(
  flow: TradeFlow,
  inputs: TradeInputs,
): { exports: number; imports: number } {
  const nation = inputs.world.nations.find((n) => n.key === flow.nation);
  const share = gravityShare(flow.nation);
  const gdp = inputs.economy.gdp;

  /* Relations move trade at the margin — a quarter either way at the
     extremes, which is a great deal of money and nothing like a doubling. */
  const warmth = 1 + ((nation?.relations ?? 0) / 100) * TRADE_RELATIONS_WEIGHT;
  const treaty = inputs.agreements.has(flow.nation) ? TRADE_TREATY_BONUS : 1;
  /* Sanctions do not stop trade. They make it expensive and furtive. */
  const sanctioned = nation?.sanctioned ? SANCTION_TRADE_MULTIPLIER : 1;
  /* A country that does not recognise another does not clear its cargo. */
  const recognised = nation?.recognised === false ? 0.05 : 1;

  const ourTariff = effectiveTariff(
    flow,
    inputs.nationalRate,
    inputs.agreements.has(flow.nation),
  );

  const world = inputs.globalMultiplier ?? 1;

  return {
    exports:
      gdp *
      EXPORT_INTENSITY *
      share *
      warmth *
      treaty *
      sanctioned *
      recognised *
      world *
      Math.max(0.1, 1 - (flow.theirTariff / 100) * TARIFF_ELASTICITY),
    imports:
      gdp *
      IMPORT_INTENSITY *
      share *
      warmth *
      treaty *
      sanctioned *
      recognised *
      world *
      Math.max(0.1, 1 - (ourTariff / 100) * TARIFF_ELASTICITY),
  };
}

/**
 * Advance the trade book by one week.
 *
 * Flows move slowly toward what conditions imply, because a supply chain is
 * a physical object with contracts attached and does not re-route because a
 * minister said something. Retaliation, by contrast, arrives all at once,
 * on its own clock, weeks after the decision that caused it.
 */
export function stepTrade(trade: Trade, inputs: TradeInputs): TradeTick {
  const retaliated: { nation: NationKey; to: number }[] = [];
  const disputed: NationKey[] = [];

  const flows = trade.flows.map((flow) => {
    const want = naturalFlow(flow, inputs);

    let theirTariff = flow.theirTariff;
    let retaliationDue = flow.retaliationDue;
    let dispute = flow.dispute;

    if (retaliationDue !== null) {
      retaliationDue -= 1;
      if (retaliationDue <= 0) {
        retaliationDue = null;
        const template = findNation(flow.nation);
        const ourTariff = effectiveTariff(
          flow,
          inputs.nationalRate,
          inputs.agreements.has(flow.nation),
        );
        /*
         * An assertive government answers a tariff with a larger one; an
         * institutional one answers it with a complaint. Both are real
         * responses and the second is worse for a government that cares
         * what the world thinks.
         */
        if (template.posture === 'institutional' && dispute === 'none') {
          dispute = 'theirs';
          disputed.push(flow.nation);
        } else {
          const answer = ourTariff * RETALIATION_RATIO[template.posture];
          if (answer > theirTariff + 0.5) {
            theirTariff = answer;
            retaliated.push({ nation: flow.nation, to: answer });
          }
        }
      }
    } else if (flow.surcharge < 0.5 && theirTariff > 0) {
      /* Tariffs come down again once nobody is being punished, slowly and
         without anybody announcing it. */
      theirTariff = Math.max(0, theirTariff - 0.4);
      if (theirTariff === 0 && dispute === 'theirs') dispute = 'none';
    }

    return {
      ...flow,
      theirTariff,
      retaliationDue,
      dispute,
      exports: flow.exports + (want.exports - flow.exports) * TRADE_ADJUST_RATE,
      imports: flow.imports + (want.imports - flow.imports) * TRADE_ADJUST_RATE,
    };
  });

  const next: Trade = {
    flows,
    history: [
      ...trade.history,
      {
        turn: inputs.turn,
        exports: flows.reduce((s, f) => s + f.exports, 0),
        imports: flows.reduce((s, f) => s + f.imports, 0),
      },
    ].slice(-TURNS_PER_YEAR * 8),
  };

  return { trade: next, retaliated, disputed };
}

/**
 * The growth contribution of net exports, in points of annual growth.
 *
 * The open-economy term. A trade war is a contractionary policy that no
 * chancellor announced and no chamber voted for.
 */
export function tradeImpulse(trade: Trade, gdp: number): number {
  if (gdp <= 0) return 0;
  return clamp((netExports(trade) / gdp) * 100, -12, 12);
}

/**
 * What tariffs do to the price level, in points of annual inflation.
 *
 * Paid at the border, felt at the till. This is the half of a tariff that
 * reaches every voter rather than one industry's.
 */
export function importPriceEffect(
  trade: Trade,
  nationalRate: number,
  agreements: ReadonlySet<NationKey>,
  gdp: number,
): number {
  if (gdp <= 0) return 0;
  const importShare = totalImports(trade) / gdp;
  const importsTotal = Math.max(1, totalImports(trade));
  const average = trade.flows.reduce(
    (sum, f) =>
      sum + effectiveTariff(f, nationalRate, agreements.has(f.nation)) * (f.imports / importsTotal),
    0,
  );
  return (average / 100) * importShare * 100 * 0.35;
}

/** A one-line account of the trade position. */
export function describeTrade(trade: Trade, gdp: number): string {
  const balance = netExports(trade);
  const share = gdp > 0 ? Math.abs((balance / gdp) * 100) : 0;
  if (balance > 0) {
    return `A surplus of ₡${balance.toFixed(0)}bn — ${share.toFixed(1)}% of output. The country sells more than it buys, and somebody abroad is complaining about it.`;
  }
  if (balance > -gdp * 0.02) {
    return 'Broadly in balance. What comes in is roughly paid for by what goes out.';
  }
  return `A deficit of ₡${Math.abs(balance).toFixed(0)}bn — ${share.toFixed(1)}% of output, funded by somebody else's willingness to hold the country's paper.`;
}

/** The industries that live on exports, worst-hit first when trade closes. */
export function exportIndustries(): IndustryKey[] {
  return [...INDUSTRY_TEMPLATES]
    .filter((t) => t.tariffSensitivity < 0.4 && !t.publiclyFunded)
    .sort((a, b) => a.tariffSensitivity - b.tariffSensitivity)
    .map((t) => t.key);
}

/** The industries a tariff shelters, and which will say so loudly. */
export function shelteredIndustries(): IndustryKey[] {
  return [...INDUSTRY_TEMPLATES]
    .filter((t) => t.tariffSensitivity > 0.5)
    .sort((a, b) => b.tariffSensitivity - a.tariffSensitivity)
    .map((t) => t.key);
}

export { findIndustry };
