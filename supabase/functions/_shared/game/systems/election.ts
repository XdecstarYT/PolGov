/**
 * election.ts — the regional swing model.
 *
 * Each region has a baseline electorate position. A party's support there is
 * its national mass, warmed or cooled by how close it sits to that region's
 * lean, then adjusted for the player's approval, campaign activity and debate
 * performance. Seats are allocated within each region by largest remainder.
 */

import {
  ELECTION_APPROVAL_FLOOR,
  ELECTION_APPROVAL_RANGE,
  NATIONAL_MOOD_WEIGHT,
  REGION_AFFINITY_SPREAD,
} from '../balance.ts';
import { distance } from '../ideology.ts';
import type {
  CampaignState,
  ElectionResult,
  Party,
  Region,
  RegionResult,
  Economy,
  Sector,
} from '../types.ts';
import type { Rng } from '../rng.ts';
import {
  compositionBreakdown,
  computeIssueScores,
  regionBreakdown,
  type SupportContext,
} from './electorate.ts';
import {
  allocateMixedMember,
  contestFptp,
  contestPreferential,
  contestTwoRound,
  gallagherIndex,
  tallyDistricts,
  type DistrictOutcome,
  type DistrictVote,
  type ElectoralSystem,
  type PartyPosition,
  type Shares,
} from './electoralSystems.ts';
import type { District } from './districts.ts';

/**
 * How warmly a region receives a party, on a 0..1-ish curve. Gaussian falloff
 * means a party close to a region's lean dominates there, and a distant party
 * is not merely behind but effectively absent.
 */
export function regionalAffinity(partyPosition: Parameters<typeof distance>[0], lean: Parameters<typeof distance>[1]): number {
  const d = distance(partyPosition, lean);
  return Math.exp(-(d * d) / (2 * REGION_AFFINITY_SPREAD * REGION_AFFINITY_SPREAD));
}

/**
 * Allocate `seats` across parties by largest remainder, given vote shares.
 * Guarantees the seats sum exactly to the region's entitlement.
 */
export function allocateSeats(
  shares: Record<string, number>,
  seats: number,
): Record<string, number> {
  const ids = Object.keys(shares);
  const quotas = ids.map((id) => ({ id, quota: (shares[id] ?? 0) * seats }));
  const allocation: Record<string, number> = {};
  let assigned = 0;

  for (const { id, quota } of quotas) {
    const base = Math.floor(quota);
    allocation[id] = base;
    assigned += base;
  }

  const remaining = seats - assigned;
  if (remaining > 0) {
    const byRemainder = quotas
      .map(({ id, quota }) => ({ id, remainder: quota - Math.floor(quota) }))
      /* Tie-break on party id so allocation is fully deterministic. */
      .sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));

    for (let i = 0; i < remaining; i += 1) {
      const target = byRemainder[i % byRemainder.length]!;
      allocation[target.id] = (allocation[target.id] ?? 0) + 1;
    }
  }

  return allocation;
}

/** The multiplier applied to the player's support by their standing. */
export function approvalMultiplier(approval: number): number {
  return ELECTION_APPROVAL_FLOOR + (approval / 100) * ELECTION_APPROVAL_RANGE;
}

/** Everything an election needs to run. */
export interface ElectionInput {
  parties: readonly Party[];
  regions: readonly Region[];
  /** Single-member seats. Ignored under pure proportional counting. */
  districts: readonly District[];
  system: ElectoralSystem;
  approval: number;
  campaign: CampaignState | null;
  termNumber: number;
  rng: Rng;
  /** The record the electorate judges. Omitted only for the opening parliament. */
  sectors?: readonly Sector[];
  debt?: number;
  revenueModifier?: number;
  /**
   * Regional service quality, by region id, as a swing toward or away from
   * the incumbent.
   *
   * This is how a grant cut made in the national budget reaches the ballot:
   * not as a national issue score, where it would be averaged away, but as a
   * penalty in exactly the regions whose services were degraded — and
   * nowhere else. A government can be liked nationally and thrown out of the
   * three regions it quietly stopped funding.
   */
  regionalSwing?: Record<string, number>;
  /**
   * The macroeconomy the country votes in. Omitted only by tests that care
   * about seat arithmetic rather than about why anyone voted; without it the
   * electorate falls back to neutral scores on every issue.
   */
  economy?: Economy;
  /** Extra support per segment, from campaigning that reached them. */
  segmentPersuasion?: SupportContext['segmentPersuasion'];
  /** Extra turnout per segment, from campaigning that reached them. */
  segmentTurnout?: SupportContext['segmentTurnout'];
}

const NEUTRAL_SCORES = {
  economy: 50,
  health: 50,
  education: 50,
  infrastructure: 50,
  environment: 50,
  cost_of_living: 50,
  tax: 50,
  debt: 50,
};

/**
 * Run a general election under whichever rules the country uses.
 *
 * Vote shares come from the electorate model: each district or region's
 * segments judge the government on the issues they care about, and their
 * ideological proximity to each party decides where that verdict lands.
 * Approval survives only as a small national mood term, because the things
 * that drive approval are already being weighed directly by voters.
 *
 * The counting then differs entirely by system, which is the point — the same
 * votes produce a different parliament depending on the rules.
 *
 * Deterministic given the RNG cursor, so an election can be replayed
 * server-side and reach the same result.
 */
export function simulateElection(input: ElectionInput): ElectionResult {
  const { parties, regions, districts, system, approval, campaign, termNumber, rng } = input;
  const player = parties.find((p) => p.isPlayer);

  const scores =
    input.sectors && input.economy
      ? computeIssueScores(
          input.sectors,
          input.debt ?? 0,
          input.revenueModifier ?? 0,
          input.economy,
        )
      : NEUTRAL_SCORES;

  const context: SupportContext = {
    scores,
    incumbentId: player?.id ?? 'player',
    incumbentBonus:
      ((approval - 50) / 100) * NATIONAL_MOOD_WEIGHT + (campaign?.debateSwing ?? 0),
    segmentPersuasion: input.segmentPersuasion,
    segmentTurnout: input.segmentTurnout,
  };

  /** Seeded local variation, so identical runs still feel alive. */
  const jitter = (shares: Shares): Shares => {
    const out: Shares = {};
    let total = 0;
    for (const party of parties) {
      const value = Math.max(1e-6, (shares[party.id] ?? 0) * rng.range(0.94, 1.06));
      out[party.id] = value;
      total += value;
    }
    for (const party of parties) out[party.id] = (out[party.id] ?? 0) / total;
    return out;
  };

  const positions: PartyPosition[] = parties.map((p) => ({ id: p.id, ideology: p.ideology }));

  /* ---- regional vote shares, always computed: they are the popular vote ---- */
  const regionShares = new Map<string, Shares>();
  let turnoutWeighted = 0;
  let seatTotal = 0;

  for (const region of regions) {
    const swing = input.regionalSwing?.[region.id] ?? 0;
    const localContext: SupportContext =
      swing === 0
        ? context
        : { ...context, incumbentBonus: (context.incumbentBonus ?? 0) + swing };
    const breakdown = regionBreakdown(region, parties, localContext);
    regionShares.set(region.id, jitter(breakdown.shares));
    turnoutWeighted += breakdown.turnout * region.seats;
    seatTotal += region.seats;
  }

  const nationalVotes: Shares = {};
  for (const region of regions) {
    const shares = regionShares.get(region.id)!;
    for (const party of parties) {
      nationalVotes[party.id] = (nationalVotes[party.id] ?? 0) + (shares[party.id] ?? 0) * region.seats;
    }
  }
  const voteShareByParty: Shares = {};
  for (const party of parties) voteShareByParty[party.id] = (nationalVotes[party.id] ?? 0) / seatTotal;

  /* ---- district vote shares, for the systems that need them ---- */
  const districtVotes: DistrictVote[] = districts.map((district) => {
    const region = regions.find((r) => r.id === district.regionId);
    const breakdown = compositionBreakdown(
      district.composition,
      region?.campaignInvestment ?? 0,
      parties,
      context,
    );
    return {
      districtId: district.id,
      regionId: district.regionId,
      shares: jitter(breakdown.shares),
    };
  });

  /* ---- counting ---- */
  let seatsByParty: Record<string, number> = {};
  let outcomes: DistrictOutcome[] = [];
  let listSeats: Record<string, number> | undefined;

  if (system === 'proportional' || districts.length === 0) {
    for (const region of regions) {
      const allocation = allocateSeats(regionShares.get(region.id)!, region.seats);
      for (const party of parties) {
        seatsByParty[party.id] = (seatsByParty[party.id] ?? 0) + (allocation[party.id] ?? 0);
      }
    }
  } else if (system === 'mixed_member') {
    outcomes = contestFptp(districtVotes);
    const districtSeats = tallyDistricts(outcomes);
    const list = allocateMixedMember(
      districtSeats,
      voteShareByParty,
      Math.max(0, seatTotal - districts.length),
    );
    listSeats = list.list;
    seatsByParty = list.total;
    for (const party of parties) seatsByParty[party.id] = seatsByParty[party.id] ?? 0;
  } else {
    outcomes =
      system === 'preferential'
        ? contestPreferential(districtVotes, positions)
        : system === 'two_round'
          ? contestTwoRound(districtVotes, positions)
          : contestFptp(districtVotes);
    seatsByParty = tallyDistricts(outcomes);
    for (const party of parties) seatsByParty[party.id] = seatsByParty[party.id] ?? 0;
  }

  /* ---- per-region reporting ---- */
  const regionResults: RegionResult[] = regions.map((region) => {
    const shares = regionShares.get(region.id)!;
    const local: Record<string, number> = {};

    if (outcomes.length > 0) {
      for (const outcome of outcomes) {
        if (outcome.regionId !== region.id || !outcome.winner) continue;
        local[outcome.winner] = (local[outcome.winner] ?? 0) + 1;
      }
    } else {
      Object.assign(local, allocateSeats(shares, region.seats));
    }

    for (const party of parties) local[party.id] = local[party.id] ?? 0;

    return {
      regionId: region.id,
      regionName: region.name,
      seats: Object.values(local).reduce((a, b) => a + b, 0),
      seatsByParty: local,
      voteShareByParty: shares,
    };
  });

  const turnout = (turnoutWeighted / seatTotal) * rng.range(0.97, 1.03);

  return {
    termNumber,
    turnout: Math.max(0.35, Math.min(0.95, turnout)),
    system,
    disproportionality: gallagherIndex(voteShareByParty, seatsByParty),
    seatsByParty,
    voteShareByParty,
    regions: regionResults,
    districtOutcomes: outcomes.map((outcome) => ({
      districtId: outcome.districtId,
      regionId: outcome.regionId,
      districtName: districts.find((d) => d.id === outcome.districtId)?.name ?? outcome.districtId,
      winner: outcome.winner,
      shares: outcome.shares,
    })),
    listSeats,
    playerSeatsBefore: player?.seats ?? 0,
    playerSeatsAfter: seatsByParty[player?.id ?? ''] ?? 0,
  };
}
