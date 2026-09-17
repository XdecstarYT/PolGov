/**
 * partyInternals.ts — the party you have to lead before you can lead a country.
 *
 * A leader's own benches are the first parliament they must win. This module
 * gives the player's party the things a real one has: factions with their own
 * views and their own share of the MPs, discipline that can be spent and
 * exhausted, members who join and leave, money that is the party's rather than
 * the state's, and a leadership that can be challenged.
 *
 * The load-bearing connection is rebellion. A faction that finds a bill too
 * far from where it stands simply does not vote for it, and those MPs come
 * straight out of the seat arithmetic in `computePassChance`. It is entirely
 * possible to hold a comfortable majority and lose a division to your own side.
 */

import {
  AUTHORITY_AFTER_SURVIVING,
  AUTHORITY_CHALLENGE_THRESHOLD,
  CHALLENGE_COOLDOWN_TURNS,
  AUTHORITY_DRIFT_RATE,
  COHESION_BASE_TARGET,
  COHESION_DRIFT_RATE,
  COHESION_PER_AUTHORITY,
  COHESION_PER_REBELLION,
  FUNDS_APPROVAL_BONUS,
  FUNDS_PER_HQ_LEVEL,
  FUNDS_PER_MEMBER,
  MEMBERS_CEILING,
  MEMBERS_DRIFT_RATE,
  MEMBERS_FLOOR,
  PARTY_OVERHEADS,
  REBELLION_SENSITIVITY,
  REBELLION_TOLERANCE,
  REBELLION_WHIP_SUPPRESSION,
} from '../balance.ts';
import { FACTION_TEMPLATES, factionPosition } from '../content/factions.ts';
import { normalisedDistance } from '../ideology.ts';
import type { Ideology } from '../types.ts';
import type { Rng } from '../rng.ts';

export interface Faction {
  id: string;
  name: string;
  blurb: string;
  /** Where this wing actually stands. */
  ideology: Ideology;
  /** Share of the party's MPs, 0–1. Sums to 1 across factions. */
  share: number;
  /** Loyalty to the leadership, 0–100. */
  loyalty: number;
  /** True while this faction is refusing to back the leadership's bills. */
  rebelling: boolean;
}

export interface PartyInternals {
  /** Members, in thousands. */
  members: number;
  /** Party money in ₡m. Deliberately NOT the national treasury. */
  funds: number;
  /** Internal discipline, 0–100. */
  cohesion: number;
  /** The leader's standing inside their own party, 0–100. */
  authority: number;
  /** Faction id holding the deputy leadership, or null. */
  deputyFactionId: string | null;
  /** Headquarters investment level. Raises fundraising and campaign reach. */
  headquarters: number;
  factions: Faction[];
  /** Rebellions suffered this term, for the leadership-challenge calculation. */
  rebellionsThisTerm: number;
  /** Turn on which the last challenge was mounted, so they cannot be monthly. */
  lastChallengeTurn: number;
}

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

/* ------------------------------------------------------------------ *
 * Setup
 * ------------------------------------------------------------------ */

export function buildPartyInternals(leaderIdeology: Ideology): PartyInternals {
  const factions: Faction[] = FACTION_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    blurb: template.blurb,
    ideology: factionPosition(template, leaderIdeology),
    share: template.share,
    loyalty: template.loyalty,
    rebelling: false,
  }));

  return {
    members: 0, // set by the caller from balance defaults
    funds: 0,
    cohesion: 0,
    authority: 0,
    deputyFactionId: null,
    headquarters: 0,
    factions,
    rebellionsThisTerm: 0,
    lastChallengeTurn: -CHALLENGE_COOLDOWN_TURNS,
  };
}

/* ------------------------------------------------------------------ *
 * Rebellion
 * ------------------------------------------------------------------ */

export interface RebellionRisk {
  factionId: string;
  factionName: string;
  /** Seats this faction controls. */
  seats: number;
  /** Ideological distance between the bill and this wing, 0–1. */
  distance: number;
  /** Probability this faction refuses to back the bill, 0–1. */
  probability: number;
}

/**
 * How likely each wing is to refuse a given bill.
 *
 * Distance past the tolerance is what starts it; low cohesion, low loyalty and
 * a weak leader all make it worse; whipping suppresses it. The result is
 * shown to the player in full before they table anything, because a rebellion
 * they could not have foreseen is just a dice roll.
 */
export function rebellionRisks(
  internals: PartyInternals,
  playerSeats: number,
  billIdeology: Ideology,
  whipSteps: number,
): RebellionRisk[] {
  return internals.factions.map((faction) => {
    const distance = normalisedDistance(billIdeology, faction.ideology);
    const excess = Math.max(0, distance - REBELLION_TOLERANCE);

    const disciplineFactor =
      (1 - internals.cohesion / 100) * 0.6 +
      (1 - faction.loyalty / 100) * 0.4 +
      (1 - internals.authority / 100) * 0.3;

    const raw =
      excess * REBELLION_SENSITIVITY * (0.55 + disciplineFactor) -
      whipSteps * REBELLION_WHIP_SUPPRESSION;

    return {
      factionId: faction.id,
      factionName: faction.name,
      seats: Math.round(playerSeats * faction.share),
      distance,
      probability: Math.max(0, Math.min(0.9, raw)),
    };
  });
}

export interface RebellionOutcome {
  /** Factions that actually refused. */
  rebelled: RebellionRisk[];
  /** Seats withheld from the government's own side. */
  seatsLost: number;
  /** Discipline lost as a result. Negative. */
  cohesionCost: number;
}

/** Roll the rebellions for a division. Deterministic given the RNG cursor. */
export function resolveRebellions(
  rng: Rng,
  risks: readonly RebellionRisk[],
): RebellionOutcome {
  const rebelled = risks.filter((risk) => rng.chance(risk.probability));
  return {
    rebelled,
    seatsLost: rebelled.reduce((sum, risk) => sum + risk.seats, 0),
    cohesionCost: rebelled.length * COHESION_PER_REBELLION,
  };
}

/* ------------------------------------------------------------------ *
 * Money and members
 * ------------------------------------------------------------------ */

export interface PartyFinanceTick {
  subscriptions: number;
  donations: number;
  overheads: number;
  net: number;
}

/**
 * One turn of party finances, in ₡m.
 *
 * Members pay subscriptions, donors give more when the party is doing well,
 * and running the machine costs money whether or not any of that happens.
 * None of this touches the national treasury — a party spending public money
 * on its own campaigning would be a scandal, not a strategy.
 */
export function partyFinanceTick(
  internals: PartyInternals,
  approval: number,
): PartyFinanceTick {
  const subscriptions = internals.members * FUNDS_PER_MEMBER;
  const donations =
    (approval / 100) * FUNDS_APPROVAL_BONUS + internals.headquarters * FUNDS_PER_HQ_LEVEL;
  const overheads = PARTY_OVERHEADS + internals.headquarters * 1.2;

  return {
    subscriptions,
    donations,
    overheads,
    net: subscriptions + donations - overheads,
  };
}

/** The membership level the party's current standing implies, in thousands. */
export function membershipTarget(approval: number, cohesion: number): number {
  const standing = (approval / 100) * 0.7 + (cohesion / 100) * 0.3;
  return MEMBERS_FLOOR + standing * (MEMBERS_CEILING - MEMBERS_FLOOR);
}

export function driftMembers(current: number, target: number): number {
  return Math.max(0, current + (target - current) * MEMBERS_DRIFT_RATE);
}

/* ------------------------------------------------------------------ *
 * Discipline and authority
 * ------------------------------------------------------------------ */

export function cohesionTarget(internals: PartyInternals): number {
  const authorityTerm = (internals.authority - 50) * COHESION_PER_AUTHORITY;
  const loyaltyTerm =
    internals.factions.reduce((sum, f) => sum + f.loyalty * f.share, 0) - 60;
  return clamp100(COHESION_BASE_TARGET + authorityTerm + loyaltyTerm * 0.3);
}

export function driftCohesion(current: number, target: number): number {
  return clamp100(current + (target - current) * COHESION_DRIFT_RATE);
}

/**
 * The authority a leader's record implies.
 *
 * Popularity is most of it — a leader who is winning is hard to move against.
 * Rebellions compound: each one this term makes the next easier to organise.
 */
export function authorityTarget(
  approval: number,
  rebellionsThisTerm: number,
  seatsChange: number,
): number {
  /*
   * A leader's standing inside the party is not the same thing as their
   * standing in the country. Parties stick with an unpopular leader for a long
   * time — inertia, loyalty, and the absence of an obvious alternative all
   * push the same way. Tying authority too tightly to approval made any leader
   * below about a third removable within a year, which is not how it works.
   */
  const popularity = 26 + approval * 0.58;
  const rebellionPenalty = rebellionsThisTerm * 4.5;
  const resultBonus = Math.max(-18, Math.min(18, seatsChange * 0.6));
  return clamp100(popularity - rebellionPenalty + resultBonus);
}

export function driftAuthority(current: number, target: number): number {
  return clamp100(current + (target - current) * AUTHORITY_DRIFT_RATE);
}

export function facesLeadershipChallenge(
  internals: PartyInternals,
  turnNumber = Infinity,
): boolean {
  if (internals.authority >= AUTHORITY_CHALLENGE_THRESHOLD) return false;
  return turnNumber - internals.lastChallengeTurn >= CHALLENGE_COOLDOWN_TURNS;
}

/**
 * A leadership challenge, decided by the party rather than the country.
 *
 * Support comes from the factions weighted by their share of the MPs, plus the
 * leader's own authority. The deputy's faction backs the leader — that is what
 * the job is for.
 */
export function leadershipChallengeSupport(internals: PartyInternals): number {
  /*
   * Removing a leader takes an active majority against them, and the benches
   * default to backing the incumbent — a challenge has to be WON by the
   * plotters, not merely survived by the leader. Hence the baseline.
   */
  let support = 12 + internals.authority * 0.35;

  for (const faction of internals.factions) {
    const bonus = faction.id === internals.deputyFactionId ? 18 : 0;
    support += (faction.loyalty + bonus) * faction.share * 0.75;
  }

  return clamp100(support);
}

export function surviveChallenge(
  internals: PartyInternals,
  turnNumber = 0,
): PartyInternals {
  return {
    ...internals,
    lastChallengeTurn: turnNumber,
    authority: Math.max(internals.authority, AUTHORITY_AFTER_SURVIVING),
    rebellionsThisTerm: 0,
    factions: internals.factions.map((faction) => ({
      ...faction,
      /* Everyone rallies, at least in public, at least for now. */
      loyalty: clamp100(faction.loyalty + 8),
      rebelling: false,
    })),
  };
}

/** Seats a faction controls, given the party's total. */
export function factionSeats(faction: Faction, playerSeats: number): number {
  return Math.round(playerSeats * faction.share);
}
