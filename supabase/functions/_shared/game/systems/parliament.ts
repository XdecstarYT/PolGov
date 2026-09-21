/**
 * parliament.ts — the second chamber, the committees, and the procedure.
 *
 * The lower house is where a government is made; the upper house is where it
 * is slowed down. The Senate here is deliberately awkward:
 *
 *   - It is renewed by HALVES, so half its members were elected by a previous
 *     electorate. A government that has just won a landslide still faces a
 *     chamber that reflects the mood of three years ago.
 *   - It is elected by straight proportional representation regardless of the
 *     system used for the lower house, so a party that manufactures a majority
 *     through first past the post does not get to manufacture a second one.
 *
 * Together those make divided government a normal condition rather than a
 * failure state, which is the point.
 */

import {
  SENATE_ALIGNMENT_WEIGHT,
  SENATE_PASS_MAX,
  SENATE_PASS_MIN,
  SENATE_SEAT_WEIGHT,
  SENATE_SIZE,
} from '../balance.ts';
import { affinity } from '../ideology.ts';
import { allocateLargestRemainder } from './electoralSystems.ts';
import type { Bill, BillCategory, Party } from '../types.ts';
import type { Rng } from '../rng.ts';

export interface Senate {
  /** partyId → seats held. */
  seatsByParty: Record<string, number>;
  /** Total seats. */
  size: number;
  /** How many general elections this chamber has seen. */
  renewals: number;
}

/**
 * Categories that bypass the second chamber.
 *
 * Money bills are the government's own business — a convention that exists in
 * most bicameral systems precisely because an upper house that can block
 * supply can starve a government it cannot remove.
 */
export const MONEY_BILL_CATEGORIES: BillCategory[] = ['fiscal'];

export function isMoneyBill(bill: Bill): boolean {
  return MONEY_BILL_CATEGORIES.includes(bill.category);
}

/** An opening Senate, elected on the same national shares as the first house. */
export function buildSenate(voteShares: Record<string, number>): Senate {
  return {
    seatsByParty: allocateLargestRemainder(voteShares, SENATE_SIZE),
    size: SENATE_SIZE,
    renewals: 0,
  };
}

/**
 * Renew half the Senate on the national vote, leaving the other half as it was.
 *
 * This is what creates the lag. The retained half still represents whoever was
 * popular last time, which is why a new government's first term is so often
 * spent negotiating with a chamber it did not win.
 */
export function renewSenate(
  senate: Senate,
  voteShares: Record<string, number>,
): Senate {
  const half = Math.floor(senate.size / 2);
  const freshlyElected = allocateLargestRemainder(voteShares, half);

  /* Retain half the existing chamber, proportionally to how it currently sits. */
  const retainedTotal = senate.size - half;
  const currentShares: Record<string, number> = {};
  const currentTotal = Object.values(senate.seatsByParty).reduce((a, b) => a + b, 0) || 1;
  for (const [id, seats] of Object.entries(senate.seatsByParty)) {
    currentShares[id] = seats / currentTotal;
  }
  const retained = allocateLargestRemainder(currentShares, retainedTotal);

  const seatsByParty: Record<string, number> = {};
  for (const id of new Set([...Object.keys(retained), ...Object.keys(freshlyElected)])) {
    seatsByParty[id] = (retained[id] ?? 0) + (freshlyElected[id] ?? 0);
  }

  return { seatsByParty, size: senate.size, renewals: senate.renewals + 1 };
}

export interface SenateVerdict {
  /** True when the bill does not need the second chamber at all. */
  bypassed: boolean;
  /** Probability the Senate passes it. */
  chance: number;
  /** Seats behind it in the upper house. */
  supportingSeats: number;
  size: number;
  terms: { label: string; value: number; detail: string }[];
}

/**
 * How the second chamber is likely to treat a bill.
 *
 * Government seats count, and so does how close the bill sits to the parties
 * that hold the rest — a chamber the government does not control can still be
 * persuaded by a bill its members happen to agree with.
 */
export function senateVerdict(
  bill: Bill,
  senate: Senate,
  parties: readonly Party[],
): SenateVerdict {
  if (isMoneyBill(bill)) {
    return {
      bypassed: true,
      chance: 1,
      supportingSeats: 0,
      size: senate.size,
      terms: [
        {
          label: 'Money bill',
          value: 1,
          detail: 'Supply is the lower house’s alone; the Senate has no say',
        },
      ],
    };
  }

  const government = parties.filter((p) => p.isPlayer || p.inCoalition);
  const supportingSeats = government.reduce(
    (sum, party) => sum + (senate.seatsByParty[party.id] ?? 0),
    0,
  );

  const seatShare = senate.size > 0 ? supportingSeats / senate.size : 0;
  const base = seatShare * SENATE_SEAT_WEIGHT;

  /* The crossbench weighs the bill on its merits, which here means its position. */
  const opposition = parties.filter((p) => !p.isPlayer && !p.inCoalition);
  const oppositionSeats = opposition.reduce(
    (sum, party) => sum + (senate.seatsByParty[party.id] ?? 0),
    0,
  );
  const alignmentRaw =
    oppositionSeats > 0
      ? opposition.reduce(
          (sum, party) =>
            sum + affinity(party.ideology, bill.ideology) * (senate.seatsByParty[party.id] ?? 0),
          0,
        ) / oppositionSeats
      : 0;
  const alignment = alignmentRaw * SENATE_ALIGNMENT_WEIGHT;

  const chance = Math.max(SENATE_PASS_MIN, Math.min(SENATE_PASS_MAX, base + alignment));

  return {
    bypassed: false,
    chance,
    supportingSeats,
    size: senate.size,
    terms: [
      {
        label: 'Senate arithmetic',
        value: base,
        detail: `${supportingSeats} of ${senate.size} senators sit with the government`,
      },
      {
        label: 'Crossbench view',
        value: alignment,
        detail:
          oppositionSeats > 0
            ? `average affinity ${alignmentRaw.toFixed(2)} among the ${oppositionSeats} senators you do not control`
            : 'the government holds the whole chamber',
      },
    ],
  };
}

export function senateVote(rng: Rng, verdict: SenateVerdict): boolean {
  return verdict.bypassed || rng.next() < verdict.chance;
}

/* ------------------------------------------------------------------ *
 * Committees
 * ------------------------------------------------------------------ */

export type CommitteeKey =
  | 'finance'
  | 'services'
  | 'infrastructure'
  | 'environment'
  | 'standards';

export const COMMITTEE_LABELS: Record<CommitteeKey, string> = {
  finance: 'Public Accounts Committee',
  services: 'Health and Education Committee',
  infrastructure: 'Infrastructure Committee',
  environment: 'Environment Committee',
  standards: 'Standards and Procedure Committee',
};

/** Which committee scrutinises which kind of bill. */
export function committeeFor(bill: Bill): CommitteeKey {
  switch (bill.category) {
    case 'fiscal':
      return 'finance';
    case 'health':
    case 'education':
      return 'services';
    case 'infrastructure':
      return 'infrastructure';
    case 'environment':
      return 'environment';
    default:
      return 'standards';
  }
}

/**
 * Send a bill to committee: it is delayed a turn, and comes back better.
 *
 * Scrutiny genuinely improves legislation — the committee finds the drafting
 * errors and the unintended consequences — which is modelled as a boost to the
 * bill's chance and a reduction in how far it offends anyone. The cost is a
 * month, and a month is not cheap when a term is twelve of them.
 */
export interface CommitteeReport {
  committee: CommitteeKey;
  /** Added to the bill's pass chance once it returns. */
  chanceBonus: number;
  /** Fraction by which the bill's ideological edge is sanded down. */
  moderation: number;
  findings: string;
}

export function committeeReport(bill: Bill, rng: Rng): CommitteeReport {
  const committee = committeeFor(bill);
  const thorough = rng.next();

  return {
    committee,
    chanceBonus: 0.06 + thorough * 0.09,
    moderation: 0.25 + thorough * 0.2,
    findings:
      thorough > 0.66
        ? `The ${COMMITTEE_LABELS[committee]} reported at length, and the redraft is materially better than what went in.`
        : thorough > 0.33
          ? `The ${COMMITTEE_LABELS[committee]} took evidence and tightened the drafting.`
          : `The ${COMMITTEE_LABELS[committee]} reported briefly, with a handful of technical corrections.`,
  };
}

/* ------------------------------------------------------------------ *
 * Procedure
 * ------------------------------------------------------------------ */

/**
 * How likely the opposition is to filibuster a bill.
 *
 * They obstruct what they hate and what they think they can stop: a bill far
 * from their position, tabled by a government without the numbers to close
 * debate down quickly.
 */
export function filibusterRisk(
  bill: Bill,
  parties: readonly Party[],
  governmentSeatShare: number,
): number {
  const opposition = parties.filter((p) => !p.isPlayer && !p.inCoalition && p.seats > 0);
  if (opposition.length === 0) return 0;

  const totalOppositionSeats = opposition.reduce((sum, p) => sum + p.seats, 0);
  const hostility =
    opposition.reduce(
      (sum, party) => sum + (1 - affinity(party.ideology, bill.ideology)) * party.seats,
      0,
    ) /
    (totalOppositionSeats * 2);

  /* A government with the floor under control can simply close debate. */
  const opportunity = Math.max(0, 1 - governmentSeatShare * 1.4);

  return Math.max(0, Math.min(0.65, hostility * opportunity * 1.6));
}

/**
 * How far apart the chamber actually is, 0–1.
 *
 * The seat-weighted spread of the benches' own positions, rather than a
 * constant a country was handed. Measured rather than asserted for the
 * same reason everything else here is: a chamber polarises because of
 * what happened in it, and a government that governed through the centre
 * for two terms should be able to see the number come down.
 *
 * Computed as mean distance from the seat-weighted centre across all
 * three ideological axes, normalised so that a chamber split between two
 * opposite poles reads near one and a chamber that agrees reads near
 * zero.
 */
export function chamberPolarisation(parties: readonly Party[]): number {
  const seated = parties.filter((p) => p.seats > 0);
  const total = seated.reduce((sum, p) => sum + p.seats, 0);
  if (total <= 0 || seated.length < 2) return 0;

  const axes = ['economic', 'social', 'environmental'] as const;
  const centre = axes.map(
    (axis) => seated.reduce((sum, p) => sum + p.ideology[axis] * p.seats, 0) / total,
  );

  const spread =
    seated.reduce((sum, party) => {
      const distance = Math.sqrt(
        axes.reduce((d, axis, i) => d + (party.ideology[axis] - centre[i]!) ** 2, 0) / axes.length,
      );
      return sum + distance * party.seats;
    }, 0) / total;

  /* A spread of about 0.7 on a -1..1 axis is a chamber at war with
     itself; anything beyond that is not a parliament. */
  return Math.max(0, Math.min(1, spread / 0.7));
}
