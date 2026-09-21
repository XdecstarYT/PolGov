/**
 * diplomacy.ts — the twelve countries that are not yours.
 *
 * One asymmetry runs through everything here: a large country's opinion
 * costs more to ignore than a small one's. Every instrument scales with the
 * other side's power, which is why a government can afford to be principled
 * with Holm and cannot afford to be principled with Astrun.
 *
 * That is not a puzzle with a solution. It is the uncomfortable position
 * every small and middling state is actually in, and the game's job is to
 * put the player in it honestly rather than to offer a clever way out. A
 * player who takes the principled line with a power three times their size
 * will pay for it in trade, in influence, and eventually at home — and the
 * game will not tell them they were wrong.
 *
 * Three things make the diplomacy more than a relations number:
 *
 *   Reputation. Kept agreements are noticed by everybody, and so are broken
 *   ones. Withdrawing from a treaty costs relations with every country
 *   watching, not only with the one that was let down. This is the only
 *   mechanic in the game where the punishment is administered by parties
 *   who were not involved.
 *
 *   Embassies stabilise rather than improve. A mission in a country nobody
 *   likes does not make them like you; it stops the relationship
 *   deteriorating and gives you somewhere to talk when it does. Closing one
 *   is cheap, popular, and removes the channel through which the next crisis
 *   could have been defused.
 *
 *   Dependence runs both ways. A country that buys half its energy from you
 *   is leverage; a country you buy half your energy from is exposure. Both
 *   are tracked, because sanctions are only ever a good idea in one of
 *   those two situations and governments routinely confuse them.
 */

import {
  AMBASSADOR_SETTLING_MONTHS,
  EMBASSY_STABILISER,
  PACT_MINIMUM_RELATIONS,
  RELATIONS_DRIFT_RATE,
  RELATIONS_FRIENDLY,
  RELATIONS_HOSTILE,
  RELATIONS_IDEOLOGY_WEIGHT,
  RELATIONS_MAX,
  RELATIONS_MIN,
  RELATIONS_NEIGHBOUR_PENALTY,
  RELATIONS_TRADE_WEIGHT,
  SUMMIT_COOLDOWN,
  TREATY_MINIMUM_RELATIONS,
  WORLD_HISTORY_LIMIT,
  TENSION_BASELINE,
  TENSION_DECAY_RATE,
} from '../balance.ts';
import {
  NATION_TEMPLATES,
  findNation,
  type NationKey,
  type NationTemplate,
} from '../content/nations.ts';
import { ambassadorDividend, tierStabiliserMultiplier } from './diplomats.ts';
import { decayGrievance, grievanceSigningPenalty } from './grievances.ts';
import { decayGoodwill, goodwillSigningRelief } from './negotiation.ts';
import { decaySoftPower, softPowerBoost } from './softPower.ts';
import {
  worldFrom,
  type ForeignCountry,
} from '../content/world/derive.ts';
import type { CountryKey } from '../content/world/countries.ts';
import { affinity } from '../ideology.ts';
import { buildOrganisations, stepOrganisations } from './organisations.ts';
import { buildPairs } from './worldSim.ts';
import type {
  Ideology,
  IndustryState,
  NationState,
  Treaty,
  TreatyKind,
  World,
  WorldPoint,
} from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const clampRelations = (v: number) => clamp(v, RELATIONS_MIN, RELATIONS_MAX);

/* ------------------------------------------------------------------ *
 * Starting state
 * ------------------------------------------------------------------ */

/**
 * The world as inherited.
 *
 * Alliances the player did not make and quarrels they did not start,
 * because every government inherits both. Embassies exist wherever
 * relations are not already hostile, which is roughly how real diplomatic
 * networks look and means the player begins with something to lose.
 */
export const DEFAULT_PLAYER_COUNTRY: CountryKey = 'verdana';

export function buildWorld(player: CountryKey = DEFAULT_PLAYER_COUNTRY): World {
  /* Every relational figure below is computed from the player's capital
     rather than read off a table, which is what makes the same world
     playable from any of its capitals. */
  const foreign = worldFrom(player);

  const nations: NationState[] = foreign.map((f) => ({
    key: f.key,
    relations: f.startingRelations,
    embassy: f.startingRelations > -25,
    ambassadorMonths: f.startingRelations > 0 ? 24 : null,
    ambassador: null,
    embassyTier: 'standard',
    grievance: 0,
    negotiationGoodwill: 0,
    sweetenedThisRun: 0,
    recognised: true,
    lastSummitTurn: null,
    sanctioned: false,
    sanctionedSince: null,
    tradeDependence: dependenceOn(f, 'theirs'),
    ourDependence: dependenceOn(f, 'ours'),
    /* Live from here on. Countries rise, fall, and change what they are. */
    power: f.power,
    posture: findNation(f.key).posture,
    neighbour: f.neighbour,
    economy: f.economy,
    buys: f.buys,
    sells: f.sells,
  }));

  const treaties: Treaty[] = foreign
    .filter((f) => f.inheritedTreaty)
    .map((f, i) => ({
      id: `inherited-${f.key}`,
      kind: f.inheritedTreaty as TreatyKind,
      parties: [f.key],
      signedTurn: -(12 * (i + 2)),
      signedTerm: 0,
      obligation: inheritedObligation(f),
      dividend: 0.25,
    }));

  return {
    nations,
    treaties,
    /* Somebody joined these before the player was born, and somebody
       declined the ones the country is not in. Both are inherited. */
    organisations: buildOrganisations(player),
    resolutions: [],
    /* And the half of the world that is not about this one: who else gets
       on with whom, who is already fighting, and what is going wrong
       somewhere nobody here has been. */
    pairs: buildPairs(),
    wars: [],
    globalEvents: [],
    reputation: 60,
    influence: 42,
    softPower: 18,
    tension: 30,
    history: [],
  };
}

function inheritedObligation(f: ForeignCountry): string {
  const name = findNation(f.key).name;
  switch (f.inheritedTreaty) {
    case 'trade':
      return `Preferential terms with ${name}, signed by a previous government.`;
    case 'defence':
      return `Consultation and basing rights with ${name}. Inherited, and load-bearing.`;
    case 'non_aggression':
      return `Neither party will use force against the other. ${name} has kept it so far.`;
    default:
      return `A standing partnership with ${name}, renewed without discussion for years.`;
  }
}

/**
 * How much of a country's trade runs through the relationship.
 *
 * A rough proxy from how many industries each side buys and sells to the
 * other, scaled by the relative size of the two economies. The point is not
 * precision — it is that the number is DIFFERENT in each direction, so a
 * player can tell leverage from exposure before deciding which they have.
 */
function dependenceOn(f: ForeignCountry, side: 'ours' | 'theirs'): number {
  const links = f.buys.length + f.sells.length;
  const base = clamp(links / 14, 0.05, 0.6);
  /* The smaller economy depends more on the relationship. Always. */
  return side === 'theirs'
    ? clamp(base * (1 / Math.max(0.3, f.economy)), 0.02, 0.85)
    : clamp(base * Math.min(1.4, f.economy), 0.02, 0.85);
}

/* ------------------------------------------------------------------ *
 * Where relations naturally sit
 * ------------------------------------------------------------------ */

/**
 * The relations these two countries would have if nobody did anything.
 *
 * Ideology, geography and trade. A government that shares a worldview with a
 * trading partner will find the relationship maintains itself; one that does
 * not will spend political capital every year just to hold position, which
 * is the honest cost of an inconvenient friendship.
 */
export function naturalRelations(
  template: NationTemplate,
  playerIdeology: Ideology,
  nation: NationState,
): number {
  const fit = affinity(playerIdeology, template.ideology);
  return clampRelations(
    fit * RELATIONS_IDEOLOGY_WEIGHT +
      (nation.neighbour ? RELATIONS_NEIGHBOUR_PENALTY : 0) +
      nation.tradeDependence * RELATIONS_TRADE_WEIGHT,
  );
}

/** Is this a friend, an adversary, or neither? */
export function standingWith(nation: NationState): 'allied' | 'friendly' | 'neutral' | 'strained' | 'hostile' {
  if (nation.relations >= 75) return 'allied';
  if (nation.relations >= RELATIONS_FRIENDLY) return 'friendly';
  if (nation.relations <= RELATIONS_HOSTILE) return 'hostile';
  if (nation.relations < 0) return 'strained';
  return 'neutral';
}

/**
 * How much weight this country's opinion carries.
 *
 * The asymmetry, expressed as a number. Everything a player does to Astrun
 * costs and returns nearly three times what the same act does with Holm,
 * and there is no mechanic anywhere that lets them opt out of that.
 */
export function leverage(template: NationTemplate): number {
  return template.power;
}

/* ------------------------------------------------------------------ *
 * Treaties
 * ------------------------------------------------------------------ */

export const TREATY_LABELS: Record<TreatyKind, string> = {
  bilateral: 'Bilateral agreement',
  multilateral: 'Multilateral agreement',
  trade: 'Trade agreement',
  defence: 'Defence agreement',
  peace: 'Peace agreement',
  non_aggression: 'Non-aggression pact',
  mutual_defence: 'Mutual defence treaty',
  partnership: 'Strategic partnership',
};

/** The relations a country wants before it will sign this kind of thing. */
export function treatyThreshold(kind: TreatyKind): number {
  switch (kind) {
    case 'non_aggression':
    case 'peace':
      /* You make peace with people you do not like. That is what it is for. */
      return PACT_MINIMUM_RELATIONS;
    case 'mutual_defence':
      /* Promising to fight somebody else's war takes more than warmth. */
      return 65;
    case 'defence':
      return 50;
    case 'partnership':
      return 40;
    default:
      return TREATY_MINIMUM_RELATIONS;
  }
}

export function willSign(nation: NationState, kind: TreatyKind, reputation: number): boolean {
  if (!nation.recognised || nation.sanctioned) return false;
  /* A country with a record of breaking agreements is offered fewer. */
  const reputationPenalty = (60 - reputation) * 0.25;
  /* And a country that remembers being sanctioned or walked out on asks
     for more than the relations number alone would suggest — the
     grievance outlives the recovery. */
  const grievancePenalty = grievanceSigningPenalty(nation.grievance);
  /* A recently sweetened offer buys real, temporary room — worth using
     the week it is offered, since it will not still be there in a
     month. */
  const goodwillRelief = goodwillSigningRelief(nation.negotiationGoodwill);
  return (
    nation.relations >=
    treatyThreshold(kind) + reputationPenalty + grievancePenalty - goodwillRelief
  );
}

/** What a treaty actually obliges, in one line. */
export function obligationOf(kind: TreatyKind, name: string): string {
  switch (kind) {
    case 'trade':
      return `Preferential terms with ${name}. Tariff changes now have to be argued with them first.`;
    case 'defence':
      return `Consultation and basing with ${name}. Their security problems become your agenda.`;
    case 'mutual_defence':
      return `An attack on ${name} is an attack on you. This is not a figure of speech.`;
    case 'non_aggression':
      return `Neither party will use force against the other, whatever else happens.`;
    case 'peace':
      return `Hostilities with ${name} are formally ended. The grievances are not.`;
    case 'partnership':
      return `Standing coordination with ${name} across trade, security and votes.`;
    case 'multilateral':
      return `A shared commitment with ${name} and others. Harder to leave than to join.`;
    default:
      return `A bilateral undertaking with ${name}.`;
  }
}

export function treatiesWith(world: World, key: NationKey): Treaty[] {
  return world.treaties.filter((t) => t.parties.includes(key));
}

/** Does a mutual defence treaty drag us into this country's quarrels? */
export function boundToDefend(world: World, key: NationKey): boolean {
  return treatiesWith(world, key).some((t) => t.kind === 'mutual_defence');
}

/* ------------------------------------------------------------------ *
 * The month
 * ------------------------------------------------------------------ */

export interface DiplomacyInputs {
  /** The governing party's position. Ideology makes friendships cheap or dear. */
  playerIdeology: Ideology;
  /** The industries, for the trade dependence that holds relations up. */
  industries: readonly IndustryState[];
  /** Output, because assessed contributions scale with the ability to pay. */
  gdp: number;
  turn: number;
}

export interface WorldTick {
  world: World;
  /** Countries that crossed into friendly or hostile this week. */
  shifted: { key: NationKey; to: ReturnType<typeof standingWith> }[];
  /** Dues payable to every body the country belongs to, ₡bn this week. */
  dues: number;
}

/**
 * Advance the world by one week.
 *
 * Relations drift toward what ideology, geography and trade imply, slowed by
 * an embassy where there is one. Nothing here is fast: a relationship is a
 * decade-long object, and a government that wants one changed has to spend
 * political capital on it repeatedly rather than once.
 */
export function stepWorld(world: World, inputs: DiplomacyInputs): WorldTick {
  const before = new Map(world.nations.map((n) => [n.key, standingWith(n)]));

  const nations = world.nations.map((nation) => {
    const template = findNation(nation.key);
    /* Soft power moves every relationship's equilibrium point a little
       instead of any one of them a lot — the one instrument here that
       is not bilateral. */
    const natural = clampRelations(
      naturalRelations(template, inputs.playerIdeology, nation) + softPowerBoost(world.softPower),
    );

    /* An embassy does not improve relations. It slows their decay, which is
       the quiet and unglamorous argument for keeping one open. A higher
       tier is a bigger brake on the same decline, never an improvement. */
    const drift =
      RELATIONS_DRIFT_RATE *
      (nation.embassy ? EMBASSY_STABILISER * tierStabiliserMultiplier(nation.embassyTier) : 1);
    let relations = nation.relations + (natural - nation.relations) * drift;

    /* A settled ambassador is worth a little, every month, forever. */
    if (nation.ambassadorMonths !== null && nation.ambassadorMonths >= AMBASSADOR_SETTLING_MONTHS) {
      relations += 0.12;
    }

    /* A named appointee is a second, independent dividend on top of the
       flat settling figure above — real skill and connections doing
       something the generic posting alone does not. */
    if (nation.ambassador) {
      relations += ambassadorDividend(nation.ambassador);
    }

    /* Treaties in force pay a standing dividend while they hold. */
    for (const treaty of treatiesWith(world, nation.key)) {
      relations += treaty.dividend;
    }

    /* Sanctions hold a relationship at the floor for as long as they last. */
    if (nation.sanctioned) relations -= 1.2;

    return {
      ...nation,
      relations: clampRelations(relations),
      grievance: decayGrievance(nation.grievance),
      negotiationGoodwill: decayGoodwill(nation.negotiationGoodwill),
      ambassadorMonths:
        nation.ambassadorMonths === null ? null : nation.ambassadorMonths + 1,
    };
  });

  /* Standing is what the world thinks of us on average, weighted by how much
     each country's opinion is worth. A warm relationship with Holm does not
     offset a cold one with Astrun. */
  const totalPower = NATION_TEMPLATES.reduce((sum, t) => sum + t.power, 0);
  const standing =
    nations.reduce((sum, n) => sum + n.relations * findNation(n.key).power, 0) / totalPower;

  /*
   * Membership pays, slowly. The influence a seat in a room is worth is
   * small per week and compounds over a term, which is the honest shape of
   * multilateralism: nothing a government joins helps it this year.
   */
  const bodies = stepOrganisations(world.organisations, inputs.gdp);

  /* Influence: what the country can actually get done in a room. Built from
     standing, reputation, the agreements it is part of, and the rooms it is
     entitled to speak in. */
  const influence = clamp(
    40 +
      standing * 0.35 +
      (world.reputation - 60) * 0.3 +
      world.treaties.length * 1.6 +
      world.organisations.filter((o) => o.member && !o.suspended).length * 1.2 +
      bodies.influence,
    0,
    100,
  );

  /* And a country inside the institutions is a country other governments
     expect to behave, which is what reputation is. */
  const reputation = clamp(world.reputation + bodies.reputation, 0, 100);
  /*
   * Tension eases back toward its resting level whenever nothing is feeding
   * it. Without this it is a one-way ratchet — wars and shocks add, and
   * nothing ever takes away — and every run arrives at a permanently
   * maximally dangerous world by the second term, which flattens the whole
   * engine. Countries do calm down. Slowly, and from wherever they are.
   */
  const eased =
    world.tension + (TENSION_BASELINE - world.tension) * TENSION_DECAY_RATE;
  const tension = clamp(eased - bodies.stability, 0, 100);

  const point: WorldPoint = {
    turn: inputs.turn,
    standing,
    influence,
    tension,
  };

  const next: World = {
    nations,
    treaties: world.treaties,
    organisations: world.organisations,
    resolutions: world.resolutions,
    pairs: world.pairs,
    wars: world.wars,
    globalEvents: world.globalEvents,
    reputation,
    influence,
    softPower: decaySoftPower(world.softPower),
    tension,
    history: [...world.history, point].slice(-WORLD_HISTORY_LIMIT),
  };

  const shifted = nations
    .map((n) => ({ key: n.key, to: standingWith(n) }))
    .filter((n) => before.get(n.key) !== n.to);

  return { world: next, shifted, dues: bodies.dues };
}

/* ------------------------------------------------------------------ *
 * Acting
 * ------------------------------------------------------------------ */

/**
 * Apply a diplomatic act, scaled by how much the other side's opinion is
 * worth.
 *
 * The scaling cuts both ways and that is the point: a protest to Astrun is a
 * real diplomatic event and a protest to Holm is a letter. A player who
 * wants to be heard by the powerful has to accept that being heard is
 * expensive, and a player who wants to be principled cheaply will find that
 * only the small countries are cheap.
 */
export function applyDiplomaticAct(
  nation: NationState,
  effect: number,
  template: NationTemplate,
): NationState {
  const scaled = effect * Math.sqrt(leverage(template));
  return { ...nation, relations: clampRelations(nation.relations + scaled) };
}

/**
 * The reputational cost of breaking an agreement.
 *
 * Applied to relations with EVERY country, not just the one let down. This
 * is the only mechanic in the game where the punishment is administered by
 * parties who were not involved, and it is the reason a treaty is a
 * commitment rather than a bonus.
 */
export function breakAgreement(world: World, penalty: number): World {
  return {
    ...world,
    reputation: clamp(world.reputation - penalty, 0, 100),
    nations: world.nations.map((nation) => ({
      ...nation,
      /* Everyone marks it, in proportion to how closely they were watching. */
      relations: clampRelations(nation.relations - penalty * 0.35),
    })),
  };
}

/** Recognising a kept commitment. Slower to earn than to lose, as always. */
export function keepAgreement(world: World, credit: number): World {
  return { ...world, reputation: clamp(world.reputation + credit, 0, 100) };
}

export function canSummit(nation: NationState, turn: number): boolean {
  return (
    nation.recognised &&
    !nation.sanctioned &&
    (nation.lastSummitTurn === null || turn - nation.lastSummitTurn >= SUMMIT_COOLDOWN)
  );
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

export function friends(world: World): NationState[] {
  return world.nations.filter((n) => n.relations >= RELATIONS_FRIENDLY);
}

export function adversaries(world: World): NationState[] {
  return world.nations.filter((n) => n.relations <= RELATIONS_HOSTILE);
}

/** The countries whose opinion costs the most to ignore, in order. */
export function byWeight(world: World): NationState[] {
  return [...world.nations].sort(
    (a, b) => findNation(b.key).power - findNation(a.key).power,
  );
}

/**
 * Where we are exposed: countries we depend on more than they depend on us.
 *
 * The list a foreign minister actually needs, and the one most likely to be
 * ignored until the month it matters.
 */
export function exposures(world: World): NationState[] {
  return world.nations
    .filter((n) => n.ourDependence > n.tradeDependence + 0.08)
    .sort((a, b) => b.ourDependence - a.ourDependence);
}

export { NATION_TEMPLATES, findNation };
export type { NationKey, NationTemplate };
