/**
 * electoralSystems.ts — five ways of turning votes into seats.
 *
 * The same electorate, counted five different ways, produces five different
 * parliaments. That is the point: the rules are not neutral machinery, and a
 * government elected under one system would not exist under another.
 *
 * Every function here is pure and deterministic. None of them knows anything
 * about Verdana — they take votes and return seats, which is what makes them
 * straightforward to test exhaustively.
 */

import { affinity } from '../ideology.ts';
import type { Ideology } from '../types.ts';

export type ElectoralSystem =
  | 'fptp'
  | 'proportional'
  | 'mixed_member'
  | 'preferential'
  | 'two_round';

export const ELECTORAL_SYSTEM_LABELS: Record<ElectoralSystem, string> = {
  fptp: 'First past the post',
  proportional: 'Proportional representation',
  mixed_member: 'Mixed-member proportional',
  preferential: 'Preferential (instant runoff)',
  two_round: 'Two-round runoff',
};

export const ELECTORAL_SYSTEM_BLURBS: Record<ElectoralSystem, string> = {
  fptp:
    'One seat per district, to whoever leads it. Manufactures majorities, and punishes parties whose support is spread thin.',
  proportional:
    'Seats within each region in proportion to votes. Represents small parties faithfully, and rarely produces a majority.',
  mixed_member:
    'District seats topped up from a national list until the totals are proportional. Keeps a local member and a fair result.',
  preferential:
    'Districts again, but voters rank. Eliminate the last party, transfer its votes, repeat until someone has half.',
  two_round:
    'Districts again. If nobody clears half, the top two meet in a runoff and everyone else’s voters choose between them.',
};

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

export type Shares = Record<string, number>;
export type Seats = Record<string, number>;

/** Normalise a set of weights to shares summing to 1. */
export function normalise(weights: Shares): Shares {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...weights };
  const out: Shares = {};
  for (const [key, value] of Object.entries(weights)) out[key] = value / total;
  return out;
}

/** Deterministic winner of a share map. Ties break on id, never randomly. */
export function leader(shares: Shares): string | null {
  const entries = Object.entries(shares);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

/* ------------------------------------------------------------------ *
 * Proportional families
 * ------------------------------------------------------------------ */

/**
 * Largest remainder (Hare quota). Every party gets its whole quotas, then the
 * leftover seats go to the largest fractional remainders.
 */
export function allocateLargestRemainder(shares: Shares, seats: number): Seats {
  const ids = Object.keys(shares);
  const quotas = ids.map((id) => ({ id, quota: (shares[id] ?? 0) * seats }));
  const allocation: Seats = {};
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
      .sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
    for (let i = 0; i < remaining; i += 1) {
      const target = byRemainder[i % byRemainder.length]!;
      allocation[target.id] = (allocation[target.id] ?? 0) + 1;
    }
  }

  return allocation;
}

/**
 * Highest averages, parameterised by divisor.
 *
 * D'Hondt (1, 2, 3, …) mildly favours larger parties; Sainte-Laguë
 * (1, 3, 5, …) is closer to neutral between large and small.
 */
function allocateHighestAverages(
  shares: Shares,
  seats: number,
  divisorFor: (seatsWon: number) => number,
): Seats {
  const ids = Object.keys(shares);
  const allocation: Seats = {};
  for (const id of ids) allocation[id] = 0;

  for (let seat = 0; seat < seats; seat += 1) {
    let bestId: string | null = null;
    let bestQuotient = -Infinity;

    for (const id of ids) {
      const quotient = (shares[id] ?? 0) / divisorFor(allocation[id] ?? 0);
      /* Deterministic tie-break on id so a replay matches exactly. */
      if (quotient > bestQuotient || (quotient === bestQuotient && bestId !== null && id < bestId)) {
        bestQuotient = quotient;
        bestId = id;
      }
    }

    if (bestId === null) break;
    allocation[bestId] = (allocation[bestId] ?? 0) + 1;
  }

  return allocation;
}

export function allocateDHondt(shares: Shares, seats: number): Seats {
  return allocateHighestAverages(shares, seats, (won) => won + 1);
}

export function allocateSainteLague(shares: Shares, seats: number): Seats {
  return allocateHighestAverages(shares, seats, (won) => 2 * won + 1);
}

/* ------------------------------------------------------------------ *
 * Preference transfers
 * ------------------------------------------------------------------ */

export interface PartyPosition {
  id: string;
  ideology: Ideology;
}

/**
 * Where a party's voters go when it is eliminated.
 *
 * Built from ideological proximity: the supporters of a party that drops out
 * move to whichever surviving party sits closest to the one they backed. It is
 * an approximation of a real preference deal, and it has the property that
 * matters — transfers flow along the ideological grain rather than at random.
 */
export function preferenceOrder(
  from: PartyPosition,
  all: readonly PartyPosition[],
): string[] {
  return all
    .filter((p) => p.id !== from.id)
    .sort(
      (a, b) =>
        affinity(from.ideology, b.ideology) - affinity(from.ideology, a.ideology) ||
        a.id.localeCompare(b.id),
    )
    .map((p) => p.id);
}

/**
 * How an eliminated party's votes actually split.
 *
 * Sending every one of them to the single nearest surviving party is wrong,
 * and wrong in a way that matters: it consolidates the field far faster than
 * real transfers do and pushes preferential counting to absurd
 * disproportionality. Real supporters of a party disagree with each other
 * about their second choice. So the vote is spread across survivors in
 * proportion to closeness, with the nearest taking the largest share.
 */
export function transferSplit(
  from: PartyPosition,
  survivors: readonly PartyPosition[],
): Shares {
  if (survivors.length === 0) return {};
  if (survivors.length === 1) return { [survivors[0]!.id]: 1 };

  const weights: Shares = {};
  for (const survivor of survivors) {
    /* Exponential in closeness: a clear favourite, but never the whole vote. */
    weights[survivor.id] = Math.exp(affinity(from.ideology, survivor.ideology) * TRANSFER_SHARPNESS);
  }
  return normalise(weights);
}

/**
 * How concentrated preference transfers are. Higher sends more of the vote to
 * the single nearest survivor; lower spreads it more evenly.
 */
export const TRANSFER_SHARPNESS = 2.2;

export interface RunoffRound {
  /** Shares at the start of this round. */
  shares: Shares;
  /** Party eliminated at the end of it, if any. */
  eliminated: string | null;
}

export interface RunoffResult {
  winner: string;
  rounds: RunoffRound[];
}

/**
 * Instant runoff. Eliminate the lowest-polling party, transfer its votes to
 * each voter's next surviving preference, and repeat until someone holds more
 * than half.
 */
export function runInstantRunoff(
  shares: Shares,
  positions: readonly PartyPosition[],
): RunoffResult {
  let current = normalise({ ...shares });
  const rounds: RunoffRound[] = [];
  const eliminated = new Set<string>();

  const orders = new Map<string, string[]>();
  for (const position of positions) {
    orders.set(position.id, preferenceOrder(position, positions));
  }

  for (let guard = 0; guard < positions.length + 2; guard += 1) {
    const surviving = Object.keys(current).filter((id) => !eliminated.has(id));

    if (surviving.length <= 1) {
      const winner = surviving[0] ?? leader(current) ?? '';
      rounds.push({ shares: { ...current }, eliminated: null });
      return { winner, rounds };
    }

    const top = leader(current);
    if (top && (current[top] ?? 0) > 0.5) {
      rounds.push({ shares: { ...current }, eliminated: null });
      return { winner: top, rounds };
    }

    /* Eliminate the weakest surviving party; ties break on id. */
    const weakest = surviving.sort(
      (a, b) => (current[a] ?? 0) - (current[b] ?? 0) || a.localeCompare(b),
    )[0]!;

    rounds.push({ shares: { ...current }, eliminated: weakest });
    eliminated.add(weakest);

    const transfer = current[weakest] ?? 0;
    const next = { ...current };
    delete next[weakest];

    const eliminatedPosition = positions.find((p) => p.id === weakest);
    const survivors = positions.filter((p) => !eliminated.has(p.id) && p.id in next);

    if (eliminatedPosition && survivors.length > 0) {
      const split = transferSplit(eliminatedPosition, survivors);
      for (const [id, portion] of Object.entries(split)) {
        next[id] = (next[id] ?? 0) + transfer * portion;
      }
    } else {
      /* Nobody left to receive them: the votes exhaust and we renormalise. */
      current = normalise(next);
      continue;
    }

    current = normalise(next);
  }

  return { winner: leader(current) ?? '', rounds };
}

/**
 * Two-round runoff. An outright majority wins immediately; otherwise the top
 * two meet again and every other party's voters pick the closer of the pair.
 */
export function runTwoRound(
  shares: Shares,
  positions: readonly PartyPosition[],
): RunoffResult {
  const first = normalise({ ...shares });
  const top = leader(first);

  if (top && (first[top] ?? 0) > 0.5) {
    return { winner: top, rounds: [{ shares: first, eliminated: null }] };
  }

  const ranked = Object.entries(first).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const finalists = ranked.slice(0, 2).map(([id]) => id);
  if (finalists.length < 2) {
    return { winner: finalists[0] ?? '', rounds: [{ shares: first, eliminated: null }] };
  }

  const second: Shares = { [finalists[0]!]: first[finalists[0]!] ?? 0, [finalists[1]!]: first[finalists[1]!] ?? 0 };

  const finalistPositions = positions.filter((p) => finalists.includes(p.id));

  for (const [id, share] of ranked.slice(2)) {
    const position = positions.find((p) => p.id === id);
    if (!position || finalistPositions.length < 2) {
      /* Unknown party: split its vote evenly rather than discarding it. */
      second[finalists[0]!] = (second[finalists[0]!] ?? 0) + share / 2;
      second[finalists[1]!] = (second[finalists[1]!] ?? 0) + share / 2;
      continue;
    }
    /* Their voters lean to the closer finalist, but they do not move as a bloc. */
    const split = transferSplit(position, finalistPositions);
    for (const [candidate, portion] of Object.entries(split)) {
      second[candidate] = (second[candidate] ?? 0) + share * portion;
    }
  }

  const normalised = normalise(second);
  return {
    winner: leader(normalised) ?? finalists[0]!,
    rounds: [
      { shares: first, eliminated: ranked.slice(2).map(([id]) => id)[0] ?? null },
      { shares: normalised, eliminated: null },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * District-based systems
 * ------------------------------------------------------------------ */

export interface DistrictVote {
  districtId: string;
  regionId: string;
  shares: Shares;
}

export interface DistrictOutcome {
  districtId: string;
  regionId: string;
  winner: string;
  shares: Shares;
  /** Populated for preferential and two-round contests. */
  rounds?: RunoffRound[];
}

/** One seat per district, to whoever leads it. */
export function contestFptp(districts: readonly DistrictVote[]): DistrictOutcome[] {
  return districts.map((district) => ({
    districtId: district.districtId,
    regionId: district.regionId,
    winner: leader(district.shares) ?? '',
    shares: district.shares,
  }));
}

/** One seat per district, decided by elimination and transfer. */
export function contestPreferential(
  districts: readonly DistrictVote[],
  positions: readonly PartyPosition[],
): DistrictOutcome[] {
  return districts.map((district) => {
    const result = runInstantRunoff(district.shares, positions);
    return {
      districtId: district.districtId,
      regionId: district.regionId,
      winner: result.winner,
      shares: district.shares,
      rounds: result.rounds,
    };
  });
}

/** One seat per district, decided by a runoff between the top two. */
export function contestTwoRound(
  districts: readonly DistrictVote[],
  positions: readonly PartyPosition[],
): DistrictOutcome[] {
  return districts.map((district) => {
    const result = runTwoRound(district.shares, positions);
    return {
      districtId: district.districtId,
      regionId: district.regionId,
      winner: result.winner,
      shares: district.shares,
      rounds: result.rounds,
    };
  });
}

/** Tally district outcomes into a seat count. */
export function tallyDistricts(outcomes: readonly DistrictOutcome[]): Seats {
  const seats: Seats = {};
  for (const outcome of outcomes) {
    if (!outcome.winner) continue;
    seats[outcome.winner] = (seats[outcome.winner] ?? 0) + 1;
  }
  return seats;
}

/**
 * Mixed-member proportional.
 *
 * District seats are won outright, then list seats are handed out so that each
 * party's TOTAL approaches its national vote share. A party that wins more
 * districts than its vote share justifies keeps them — those are overhang
 * seats, and they are why an MMP chamber can end up slightly larger than
 * planned. Here the list pool is fixed, so overhang simply eats into the
 * correction rather than adding seats.
 */
export function allocateMixedMember(
  districtSeats: Seats,
  nationalShares: Shares,
  listSeats: number,
): { list: Seats; total: Seats } {
  const districtTotal = Object.values(districtSeats).reduce((a, b) => a + b, 0);
  const chamber = districtTotal + listSeats;

  /* What a fully proportional chamber would look like. */
  const target = allocateLargestRemainder(nationalShares, chamber);

  /* Each party's shortfall against that target, floored at zero. */
  const deficits: Shares = {};
  for (const id of Object.keys(target)) {
    deficits[id] = Math.max(0, (target[id] ?? 0) - (districtSeats[id] ?? 0));
  }

  const deficitTotal = Object.values(deficits).reduce((a, b) => a + b, 0);
  const list =
    deficitTotal > 0
      ? allocateLargestRemainder(normalise(deficits), listSeats)
      : allocateLargestRemainder(nationalShares, listSeats);

  const total: Seats = {};
  for (const id of new Set([...Object.keys(districtSeats), ...Object.keys(list)])) {
    total[id] = (districtSeats[id] ?? 0) + (list[id] ?? 0);
  }

  return { list, total };
}

/* ------------------------------------------------------------------ *
 * Disproportionality
 * ------------------------------------------------------------------ */

/**
 * Gallagher index: how far a result departs from the votes cast.
 *
 * 0 is perfect proportionality; anything above about 5 is a system that is
 * visibly reshaping the result. Useful for showing the player, in one number,
 * what their electoral system is doing on their behalf.
 */
export function gallagherIndex(shares: Shares, seats: Seats): number {
  const totalSeats = Object.values(seats).reduce((a, b) => a + b, 0);
  if (totalSeats === 0) return 0;

  let sum = 0;
  for (const id of new Set([...Object.keys(shares), ...Object.keys(seats)])) {
    const votePct = (shares[id] ?? 0) * 100;
    const seatPct = ((seats[id] ?? 0) / totalSeats) * 100;
    sum += (votePct - seatPct) ** 2;
  }
  return Math.sqrt(sum / 2);
}
