/**
 * election.ts — the regional swing model.
 *
 * Each region has a baseline electorate position. A party's support there is
 * its national mass, warmed or cooled by how close it sits to that region's
 * lean, then adjusted for the player's approval, campaign activity and debate
 * performance. Seats are allocated within each region by largest remainder.
 */

import {
  CAMPAIGN_EFFECT_PER_INVESTMENT,
  ELECTION_APPROVAL_FLOOR,
  ELECTION_APPROVAL_RANGE,
  REGION_AFFINITY_SPREAD,
  TURNOUT_APPROVAL_RANGE,
  TURNOUT_BASE,
} from '../balance.ts';
import { distance } from '../ideology.ts';
import type {
  CampaignState,
  ElectionResult,
  Party,
  Region,
  RegionResult,
} from '../types.ts';
import type { Rng } from '../rng.ts';

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
 * Run a general election. Deterministic given the RNG cursor, so an election
 * can be replayed server-side and reach the same result.
 */
export function simulateElection(
  parties: readonly Party[],
  regions: readonly Region[],
  approval: number,
  campaign: CampaignState | null,
  termNumber: number,
  rng: Rng,
): ElectionResult {
  const playerMultiplier = approvalMultiplier(approval);
  const debateSwing = campaign?.debateSwing ?? 0;

  const regionResults: RegionResult[] = [];
  const nationalVotes: Record<string, number> = {};
  const nationalSeats: Record<string, number> = {};
  let totalVotes = 0;

  for (const region of regions) {
    const raw: Record<string, number> = {};

    for (const party of parties) {
      const affinityHere = regionalAffinity(party.ideology, region.lean);
      let strength = party.baseStrength * affinityHere;

      if (party.isPlayer) {
        strength *= playerMultiplier * (1 + debateSwing);
        strength *= 1 + region.campaignInvestment * CAMPAIGN_EFFECT_PER_INVESTMENT;
      } else {
        /* Opposition picks up what an unpopular incumbent sheds. */
        strength *= 1 + (1 - playerMultiplier) * 0.5;
      }

      /* Small seeded local variation so identical runs still feel alive. */
      strength *= rng.range(0.93, 1.07);
      raw[party.id] = Math.max(0.0001, strength);
    }

    const rawTotal = Object.values(raw).reduce((a, b) => a + b, 0);
    const shares: Record<string, number> = {};
    for (const party of parties) {
      shares[party.id] = (raw[party.id] ?? 0) / rawTotal;
    }

    const seatsByParty = allocateSeats(shares, region.seats);

    for (const party of parties) {
      const regionVotes = (shares[party.id] ?? 0) * region.seats;
      nationalVotes[party.id] = (nationalVotes[party.id] ?? 0) + regionVotes;
      nationalSeats[party.id] = (nationalSeats[party.id] ?? 0) + (seatsByParty[party.id] ?? 0);
    }
    totalVotes += region.seats;

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

  const player = parties.find((p) => p.isPlayer);
  const turnout =
    TURNOUT_BASE + (approval / 100) * TURNOUT_APPROVAL_RANGE * rng.range(0.9, 1.1);

  return {
    termNumber,
    turnout: Math.max(0.35, Math.min(0.92, turnout)),
    seatsByParty: nationalSeats,
    voteShareByParty,
    regions: regionResults,
    playerSeatsBefore: player?.seats ?? 0,
    playerSeatsAfter: nationalSeats[player?.id ?? ''] ?? 0,
  };
}
