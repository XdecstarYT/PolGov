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
  Sector,
} from '../types.ts';
import type { Rng } from '../rng.ts';
import { computeIssueScores, regionBreakdown, type SupportContext } from './electorate.ts';

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

/**
 * Run a general election.
 *
 * Vote shares now come from the electorate model: each region's segments judge
 * the government on the issues they care about, and their ideological
 * proximity to each party decides where that verdict lands. Approval survives
 * only as a small national mood term, because the things that drive approval —
 * services, the economy, debt — are already being weighed directly by voters,
 * and counting them twice would make elections hypersensitive to one number.
 *
 * Deterministic given the RNG cursor, so an election can be replayed
 * server-side and reach the same result.
 */
export function simulateElection(
  parties: readonly Party[],
  regions: readonly Region[],
  approval: number,
  campaign: CampaignState | null,
  termNumber: number,
  rng: Rng,
  sectors?: readonly Sector[],
  debt = 0,
  revenueModifier = 0,
): ElectionResult {
  const player = parties.find((p) => p.isPlayer);

  /*
   * Without sectors we cannot score the issues, so fall back to treating the
   * whole electorate as neutral on the record and let ideology and mood decide.
   * setup.ts seats the opening parliament through this path.
   */
  const scores = sectors
    ? computeIssueScores(sectors, debt, revenueModifier)
    : {
        economy: 50,
        health: 50,
        education: 50,
        infrastructure: 50,
        environment: 50,
        cost_of_living: 50,
        tax: 50,
        debt: 50,
      };

  const context: SupportContext = {
    scores,
    incumbentId: player?.id ?? 'player',
    incumbentBonus:
      ((approval - 50) / 100) * NATIONAL_MOOD_WEIGHT + (campaign?.debateSwing ?? 0),
  };

  const regionResults: RegionResult[] = [];
  const nationalVotes: Record<string, number> = {};
  const nationalSeats: Record<string, number> = {};
  let totalVotes = 0;
  let turnoutWeighted = 0;

  for (const region of regions) {
    const breakdown = regionBreakdown(region, parties, context);

    /* Small seeded local variation so identical runs still feel alive. */
    const jittered: Record<string, number> = {};
    let jitterTotal = 0;
    for (const party of parties) {
      const value = Math.max(1e-6, (breakdown.shares[party.id] ?? 0) * rng.range(0.94, 1.06));
      jittered[party.id] = value;
      jitterTotal += value;
    }

    const shares: Record<string, number> = {};
    for (const party of parties) shares[party.id] = (jittered[party.id] ?? 0) / jitterTotal;

    const seatsByParty = allocateSeats(shares, region.seats);

    for (const party of parties) {
      nationalVotes[party.id] =
        (nationalVotes[party.id] ?? 0) + (shares[party.id] ?? 0) * region.seats;
      nationalSeats[party.id] = (nationalSeats[party.id] ?? 0) + (seatsByParty[party.id] ?? 0);
    }
    totalVotes += region.seats;
    turnoutWeighted += breakdown.turnout * region.seats;

    regionResults.push({
      regionId: region.id,
      regionName: region.name,
      seats: region.seats,
      seatsByParty,
      voteShareByParty: shares,
    });
  }

  const voteShareByParty: Record<string, number> = {};
  for (const party of parties) {
    voteShareByParty[party.id] = (nationalVotes[party.id] ?? 0) / totalVotes;
  }

  const turnout = (turnoutWeighted / totalVotes) * rng.range(0.97, 1.03);

  return {
    termNumber,
    turnout: Math.max(0.35, Math.min(0.95, turnout)),
    seatsByParty: nationalSeats,
    voteShareByParty,
    regions: regionResults,
    playerSeatsBefore: player?.seats ?? 0,
    playerSeatsAfter: nationalSeats[player?.id ?? ''] ?? 0,
  };
}
