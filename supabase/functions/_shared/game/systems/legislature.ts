/**
 * legislature.ts — tabling bills and counting the votes.
 *
 * Pass chance is fully deterministic and fully inspectable: `computePassChance`
 * returns the arithmetic alongside the number, and the Policy Desk renders that
 * breakdown before the player spends anything.
 *
 * Red lines are the strategic core. Crossing one does not block the bill — the
 * offended partner's seats defect on that division and their mood takes a heavy
 * hit. A large enough majority can govern straight through a partner; it just
 * costs the coalition.
 */

import {
  ALIGNMENT_WEIGHT,
  MAJOR_BILL_PENALTY,
  MOOD_WEIGHT,
  PASS_CHANCE_MAX,
  PASS_CHANCE_MIN,
  PC_COSTS,
  SEAT_SHARE_WEIGHT,
  WHIP_STEP_BONUS,
} from '../balance.ts';
import { affinity } from '../ideology.ts';
import type { Bill, Party, RedLine, Sector } from '../types.ts';
import type { Rng } from '../rng.ts';
import { findSector } from './budget.ts';
import { rebellionRisks, type PartyInternals, type RebellionRisk } from './partyInternals.ts';

/** Does this bill cross this specific red line? */
export function billViolatesRedLine(
  bill: Bill,
  redLine: RedLine,
  sectors: readonly Sector[],
): boolean {
  switch (redLine.kind) {
    case 'ideology_axis': {
      if (!redLine.axis || !redLine.direction) return false;
      const position = bill.ideology[redLine.axis];
      const magnitude = redLine.magnitude ?? 0.5;
      return redLine.direction === 'positive'
        ? position >= magnitude
        : position <= -magnitude;
    }
    case 'sector_floor': {
      if (!redLine.sector || redLine.threshold === undefined) return false;
      const delta = bill.effects.fundingDeltas?.[redLine.sector] ?? 0;
      if (delta >= 0) return false;
      const current = findSector(sectors, redLine.sector).funding;
      return current + delta < redLine.threshold;
    }
    case 'bill_category':
      return redLine.category === bill.category;
    default:
      return false;
  }
}

export interface RedLineBreach {
  party: Party;
  redLine: RedLine;
}

/** Every coalition partner this bill would offend, and on which commitment. */
export function findRedLineBreaches(
  bill: Bill,
  parties: readonly Party[],
  sectors: readonly Sector[],
): RedLineBreach[] {
  const breaches: RedLineBreach[] = [];
  for (const party of parties) {
    if (!party.inCoalition || party.isPlayer) continue;
    for (const redLine of party.redLines) {
      if (billViolatesRedLine(bill, redLine, sectors)) {
        breaches.push({ party, redLine });
        break;
      }
    }
  }
  return breaches;
}

export interface PassChanceBreakdown {
  chance: number;
  /** Seats counted as supporting: player + loyal partners. */
  supportingSeats: number;
  /** Partner seats withheld because the bill crosses a red line. */
  defectingSeats: number;
  totalSeats: number;
  terms: { label: string; value: number; detail: string }[];
  breaches: RedLineBreach[];
  /** How each wing of the player's own party is likely to vote. */
  rebellionRisks: RebellionRisk[];
  /** Seats expected to be withheld by the player's own benches. */
  expectedRebelSeats: number;
}

/**
 * pass_chance = clamp(
 *     seatShare · SEAT_SHARE_WEIGHT
 *   + alignment · ALIGNMENT_WEIGHT
 *   + mood      · MOOD_WEIGHT
 *   + whipSteps · WHIP_STEP_BONUS
 *   − major-bill penalty,
 *   0.05, 0.95)
 *
 * where seatShare counts only seats that will actually vote for it.
 */
export function computePassChance(
  bill: Bill,
  parties: readonly Party[],
  sectors: readonly Sector[],
  whipSteps: number,
  internals?: PartyInternals,
  /**
   * Seats actually withheld by the player's own benches. Supplied at the
   * division, once the rebellion has been rolled; omitted beforehand, when the
   * expected loss is the honest figure to show.
   */
  actualRebelSeats?: number,
): PassChanceBreakdown {
  const totalSeats = parties.reduce((sum, p) => sum + p.seats, 0);
  const breaches = findRedLineBreaches(bill, parties, sectors);
  const breachedIds = new Set(breaches.map((b) => b.party.id));

  const player = parties.find((p) => p.isPlayer);
  const loyalPartners = parties.filter(
    (p) => p.inCoalition && !p.isPlayer && !breachedIds.has(p.id),
  );
  const defectingSeats = breaches.reduce((sum, b) => sum + b.party.seats, 0);
  const supportingSeats = (player?.seats ?? 0) + loyalPartners.reduce((s, p) => s + p.seats, 0);

  /*
   * Your own benches are the first parliament you have to win. A wing that
   * finds the bill too far from where it stands simply does not turn up, and
   * those seats come out of the government's side before anything else is
   * counted. The EXPECTED loss is used here so the figure shown to the player
   * before they commit reflects the risk they are taking; the actual walkout
   * is rolled at the division.
   */
  const risks =
    internals && player
      ? rebellionRisks(internals, player.seats, bill.ideology, whipSteps)
      : [];
  const expectedRebelSeats = risks.reduce(
    (sum, risk) => sum + risk.seats * risk.probability,
    0,
  );

  const rebelSeats = actualRebelSeats ?? expectedRebelSeats;
  const effectiveSupport = Math.max(0, supportingSeats - rebelSeats);
  const seatShare = totalSeats > 0 ? effectiveSupport / totalSeats : 0;
  const base = seatShare * SEAT_SHARE_WEIGHT;

  const alignmentRaw =
    loyalPartners.length > 0
      ? loyalPartners.reduce((sum, p) => sum + affinity(p.ideology, bill.ideology), 0) /
        loyalPartners.length
      : 0;
  const alignmentBonus = alignmentRaw * ALIGNMENT_WEIGHT;

  const moodRaw =
    loyalPartners.length > 0
      ? loyalPartners.reduce((sum, p) => sum + (p.coalitionMood ?? 50), 0) / loyalPartners.length
      : 50;
  const moodModifier = ((moodRaw - 50) / 50) * MOOD_WEIGHT;

  const whipBonus = whipSteps * WHIP_STEP_BONUS;
  const magnitudePenalty = bill.magnitude === 'major' ? -MAJOR_BILL_PENALTY : 0;

  const raw = base + alignmentBonus + moodModifier + whipBonus + magnitudePenalty;
  const chance = Math.max(PASS_CHANCE_MIN, Math.min(PASS_CHANCE_MAX, raw));

  const terms = [
    {
      label: 'Seat arithmetic',
      value: base,
      detail:
        rebelSeats >= 0.5
          ? `${supportingSeats} of ${totalSeats} seats, less ${rebelSeats.toFixed(0)} withheld by your own benches`
          : `${supportingSeats} of ${totalSeats} seats voting for`,
    },
    {
      label: 'Partner alignment',
      value: alignmentBonus,
      detail:
        loyalPartners.length > 0
          ? `average affinity ${alignmentRaw.toFixed(2)} across ${loyalPartners.length} partner${loyalPartners.length === 1 ? '' : 's'}`
          : 'no coalition partners',
    },
    {
      label: 'Coalition mood',
      value: moodModifier,
      detail: `average mood ${Math.round(moodRaw)}/100`,
    },
    {
      label: 'Whipping',
      value: whipBonus,
      detail:
        whipSteps > 0
          ? `${whipSteps} step${whipSteps === 1 ? '' : 's'} at ${PC_COSTS.whipStep} PC each`
          : 'no votes whipped',
    },
  ];

  if (magnitudePenalty !== 0) {
    terms.push({
      label: 'Major legislation',
      value: magnitudePenalty,
      detail: 'large bills attract more resistance',
    });
  }

  return {
    chance,
    supportingSeats,
    defectingSeats,
    totalSeats,
    terms,
    breaches,
    rebellionRisks: risks,
    expectedRebelSeats,
  };
}

/** The PC price of tabling a bill with a given amount of whipping. */
export function billPcCost(bill: Bill, whipSteps: number): number {
  const base =
    bill.magnitude === 'major' ? PC_COSTS.proposeMajorBill : PC_COSTS.proposeMinorBill;
  return base + whipSteps * PC_COSTS.whipStep;
}

/** Roll the division. Deterministic given the RNG cursor. */
export function resolveBillVote(rng: Rng, chance: number): boolean {
  return rng.next() < chance;
}
