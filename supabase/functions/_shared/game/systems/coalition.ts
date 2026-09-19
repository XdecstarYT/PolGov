/**
 * coalition.ts — forming a government and keeping it.
 *
 * Partner mood drifts on four things: whether red lines were respected,
 * whether budget promises were kept, whether the partner got the cabinet
 * weight it demanded, and how the government is doing overall. Success is
 * forgiving and failure is not — the approval term is doubled below 50.
 */

import {
  COUNTER_OFFER_RELIEF,
  DIFFICULTY,
  MAJORITY_SEATS,
  MOOD_BASE_TARGET,
  MOOD_BUDGET_BROKEN,
  MOOD_BUDGET_KEPT,
  MOOD_DRIFT_RATE,
  MOOD_FAILURE_MULTIPLIER,
  MOOD_PER_MISSING_CABINET_POST,
  MOOD_START,
  MOOD_THREATEN_EXIT,
  MOOD_W_AFFINITY,
  MOOD_W_APPROVAL,
} from '../balance.ts';
import { affinity, normalisedDistance } from '../ideology.ts';
import { fallbackCoalitionLine } from '../content/news.ts';
import { SECTOR_LABELS } from '../balance.ts';
import type {
  CoalitionDemand,
  Difficulty,
  NegotiationState,
  Party,
  Sector,
} from '../types.ts';
import { findSector } from './budget.ts';

export function clampMood(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function coalitionSeats(parties: readonly Party[]): number {
  return parties
    .filter((p) => p.isPlayer || p.inCoalition)
    .reduce((sum, p) => sum + p.seats, 0);
}

export function hasMajority(parties: readonly Party[]): boolean {
  return coalitionSeats(parties) >= MAJORITY_SEATS;
}

export function playerParty(parties: readonly Party[]): Party {
  const player = parties.find((p) => p.isPlayer);
  if (!player) throw new Error('coalition: no player party');
  return player;
}

export function coalitionPartners(parties: readonly Party[]): Party[] {
  return parties.filter((p) => p.inCoalition && !p.isPlayer);
}

/**
 * Build the negotiation table: every non-player party that could plausibly be
 * approached, ranked by ideological distance from the player.
 */
export function buildNegotiation(
  parties: readonly Party[],
  attempt: number,
  crisis = false,
): NegotiationState {
  const player = playerParty(parties);
  const candidates = parties
    .filter((p) => !p.isPlayer && p.seats > 0)
    .sort(
      (a, b) =>
        normalisedDistance(player.ideology, a.ideology) -
        normalisedDistance(player.ideology, b.ideology),
    )
    .map((party) => buildDemand(party, player));

  return { candidates, accepted: [], attempt, failed: false, crisis };
}

function buildDemand(party: Party, player: Party): CoalitionDemand {
  const prioritySector = party.prioritySector;
  const floor = party.sectorFloor;
  const cabinetDemand = party.cabinetDemand;

  /* Parties further from the player extract more for the same seats. */
  const distance = normalisedDistance(player.ideology, party.ideology);
  const posts = Math.max(1, Math.round(cabinetDemand * (1 + distance * 0.5)));
  const amount = Math.round(floor * (1 + distance * 0.15));

  return {
    partyId: party.id,
    cabinetPosts: posts,
    /* Partners table one or two commitments, drawn from what they campaign on. */
    redLines: party.redLinePool.slice(0, 2),
    sectorFloor: { sector: prioritySector, amount },
    dialogue: fallbackCoalitionLine(
      party.name,
      party.coalitionMood ?? MOOD_START,
      SECTOR_LABELS[prioritySector],
      amount,
      affinity(player.ideology, party.ideology),
    ),
    concessionsWon: 0,
  };
}

/**
 * A counter-offer costs PC and shaves COUNTER_OFFER_RELIEF off what is still
 * outstanding. It can be repeated, with diminishing effect, but it never
 * removes a red line — those are not negotiable, only avoidable.
 */
export function applyCounterOffer(demand: CoalitionDemand, party: Party): CoalitionDemand {
  const won = Math.min(0.85, demand.concessionsWon + COUNTER_OFFER_RELIEF);
  const scale = 1 - won;
  const baseCabinet = party.cabinetDemand;
  const baseFloor = party.sectorFloor;

  return {
    ...demand,
    concessionsWon: won,
    cabinetPosts: Math.max(1, Math.round(baseCabinet * (0.6 + scale * 0.8))),
    sectorFloor: {
      ...demand.sectorFloor,
      amount: Math.round(baseFloor * (0.75 + scale * 0.4)),
    },
  };
}

/** Seats the player would command if the currently accepted set signed up. */
export function projectedSeats(
  parties: readonly Party[],
  acceptedIds: readonly string[],
): number {
  const player = playerParty(parties);
  return (
    player.seats +
    parties
      .filter((p) => acceptedIds.includes(p.id))
      .reduce((sum, p) => sum + p.seats, 0)
  );
}

/** Is a partner's budget promise currently being honoured? */
export function budgetPromiseKept(party: Party, sectors: readonly Sector[]): boolean | null {
  const floors = party.redLines.filter((r) => r.kind === 'sector_floor');
  if (floors.length === 0) return null;
  return floors.every((r) => {
    if (!r.sector || r.threshold === undefined) return true;
    return findSector(sectors, r.sector).funding >= r.threshold;
  });
}

export interface MoodBreakdown {
  partyId: string;
  target: number;
  components: { label: string; value: number }[];
}

/**
 * The mood a partner settles toward, given how the government is treating it.
 */
export function computeMoodTarget(
  party: Party,
  player: Party,
  approval: number,
  sectors: readonly Sector[],
  difficulty: Difficulty,
): MoodBreakdown {
  const profile = DIFFICULTY[difficulty];
  const affinityTerm = affinity(player.ideology, party.ideology) * MOOD_W_AFFINITY;

  const approvalGap = approval - 50;
  const approvalTerm =
    approvalGap >= 0
      ? approvalGap * MOOD_W_APPROVAL
      : approvalGap * MOOD_W_APPROVAL * MOOD_FAILURE_MULTIPLIER;

  const promise = budgetPromiseKept(party, sectors);
  const budgetTerm =
    promise === null ? 0 : promise ? MOOD_BUDGET_KEPT : MOOD_BUDGET_BROKEN;

  const missingPosts = Math.max(0, party.cabinetDemand - party.cabinetPosts);
  const cabinetTerm = missingPosts * MOOD_PER_MISSING_CABINET_POST;

  const components = [
    { label: 'Baseline', value: MOOD_BASE_TARGET },
    { label: 'Ideological fit', value: affinityTerm },
    { label: 'Government standing', value: approvalTerm },
    { label: 'Budget commitment', value: budgetTerm },
    { label: 'Cabinet weight', value: cabinetTerm },
  ];

  const raw = components.reduce((sum, c) => sum + c.value, 0);
  /* Volatility pushes the target away from comfort in whichever direction it already leans. */
  const volatile = MOOD_BASE_TARGET + (raw - MOOD_BASE_TARGET) * profile.coalitionVolatility;

  return { partyId: party.id, target: clampMood(volatile), components };
}

/** One turn of mood easing toward its target. */
export function driftMood(current: number, target: number): number {
  return clampMood(current + (target - current) * MOOD_DRIFT_RATE);
}

export function isThreateningExit(party: Party): boolean {
  return (
    party.inCoalition &&
    !party.isPlayer &&
    (party.coalitionMood ?? 100) < MOOD_THREATEN_EXIT &&
    (party.coalitionMood ?? 100) > 0
  );
}

/** A partner at zero mood walks out. */
export function partnersWalkingOut(parties: readonly Party[]): Party[] {
  return parties.filter(
    (p) => p.inCoalition && !p.isPlayer && (p.coalitionMood ?? 100) <= 0,
  );
}

/**
 * True when the governing bloc no longer commands a majority.
 *
 * This is NOT by itself a collapse: governing in a minority is a legitimate
 * (and hard) position, and the seat arithmetic in `computePassChance` already
 * punishes it properly. A confidence crisis needs a trigger as well — see
 * `noConfidenceTriggered`.
 */
export function blocLacksMajority(parties: readonly Party[]): boolean {
  return !hasMajority(parties);
}

/**
 * A confidence crisis fires when a partner actually walks out and the bloc
 * left behind cannot command the chamber. Losing a partner you did not need,
 * or running a minority you assembled deliberately, does not bring the
 * government down.
 */
export function noConfidenceTriggered(
  partiesAfterWalkouts: readonly Party[],
  walkedOut: readonly Party[],
): boolean {
  return walkedOut.length > 0 && blocLacksMajority(partiesAfterWalkouts);
}

/**
 * Is the player the largest single party in the chamber?
 *
 * This is what entitles them to try to govern at all. A party that is not the
 * largest and cannot assemble a majority does not get to carry on in a
 * minority — somebody else forms the government and they go into opposition.
 */
export function playerIsLargestParty(parties: readonly Party[]): boolean {
  const player = playerParty(parties);
  return parties.every((p) => p.isPlayer || p.seats <= player.seats);
}

/**
 * Could the player reach a majority even with every other party behind them?
 * When they could not, formation is arithmetically hopeless and there is no
 * point spending attempts on it.
 */
export function majorityIsReachable(parties: readonly Party[]): boolean {
  const total = parties.reduce((sum, p) => sum + p.seats, 0);
  return total >= MAJORITY_SEATS;
}
