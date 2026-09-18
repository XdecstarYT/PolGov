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
} from '../balance.ts';
import {
  NATION_TEMPLATES,
  findNation,
  type NationKey,
  type NationTemplate,
} from '../content/nations.ts';
import { affinity } from '../ideology.ts';
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
const clampRelations = (v: number) => clamp(v, RELATIONS_MIN, RELATIONS_MAX);

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
export function buildWorld(): World {
  const nations: NationState[] = NATION_TEMPLATES.map((template) => ({
    key: template.key,
    relations: template.startingRelations,
    embassy: template.startingRelations > -25,
    ambassadorMonths: template.startingRelations > 0 ? 24 : null,
    recognised: true,
    lastSummitTurn: null,
    sanctioned: false,
    tradeDependence: dependenceOn(template, 'theirs'),
    ourDependence: dependenceOn(template, 'ours'),
  }));

  const treaties: Treaty[] = NATION_TEMPLATES.filter((t) => t.inheritedTreaty).map(
    (template, i) => ({
      id: `inherited-${template.key}`,
      kind: template.inheritedTreaty as TreatyKind,
      parties: [template.key],
      signedTurn: -(12 * (i + 2)),
      signedTerm: 0,
      obligation: inheritedObligation(template),
      dividend: 0.25,
    }),
  );

  return {
    nations,
    treaties,
    reputation: 60,
    influence: 42,
    tension: 30,
    history: [],
  };
}

function inheritedObligation(template: NationTemplate): string {
  switch (template.inheritedTreaty) {
    case 'trade':
      return `Preferential terms with ${template.name}, signed by a previous government.`;
    case 'defence':
      return `Consultation and basing rights with ${template.name}. Inherited, and load-bearing.`;
    case 'non_aggression':
      return `Neither party will use force against the other. ${template.name} has kept it so far.`;
    default:
      return `A standing partnership with ${template.name}, renewed without discussion for years.`;
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
function dependenceOn(template: NationTemplate, side: 'ours' | 'theirs'): number {
  const links = template.buys.length + template.sells.length;
  const base = clamp(links / 14, 0.05, 0.6);
  /* The smaller economy depends more on the relationship. Always. */
  return side === 'theirs'
    ? clamp(base * (1 / Math.max(0.3, template.economy)), 0.02, 0.85)
    : clamp(base * Math.min(1.4, template.economy), 0.02, 0.85);
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
      (template.neighbour ? RELATIONS_NEIGHBOUR_PENALTY : 0) +
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
  return nation.relations >= treatyThreshold(kind) + reputationPenalty;
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
  turn: number;
}

export interface WorldTick {
  world: World;
  /** Countries that crossed into friendly or hostile this month. */
  shifted: { key: NationKey; to: ReturnType<typeof standingWith> }[];
}

/**
 * Advance the world by one month.
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
    const natural = naturalRelations(template, inputs.playerIdeology, nation);

    /* An embassy does not improve relations. It slows their decay, which is
       the quiet and unglamorous argument for keeping one open. */
    const drift = RELATIONS_DRIFT_RATE * (nation.embassy ? EMBASSY_STABILISER : 1);
    let relations = nation.relations + (natural - nation.relations) * drift;

    /* A settled ambassador is worth a little, every month, forever. */
    if (nation.ambassadorMonths !== null && nation.ambassadorMonths >= AMBASSADOR_SETTLING_MONTHS) {
      relations += 0.12;
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

  /* Influence: what the country can actually get done in a room. Built from
     standing, reputation and the number of agreements it is part of. */
  const influence = clamp(
    40 + standing * 0.35 + (world.reputation - 60) * 0.3 + world.treaties.length * 1.6,
    0,
    100,
  );

  const point: WorldPoint = {
    turn: inputs.turn,
    standing,
    influence,
    tension: world.tension,
  };

  const next: World = {
    nations,
    treaties: world.treaties,
    reputation: world.reputation,
    influence,
    tension: world.tension,
    history: [...world.history, point].slice(-WORLD_HISTORY_LIMIT),
  };

  const shifted = nations
    .map((n) => ({ key: n.key, to: standingWith(n) }))
    .filter((n) => before.get(n.key) !== n.to);

  return { world: next, shifted };
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
