/**
 * media.ts — polling, projections, and the campaign's reach.
 *
 * The important idea here is that the player does not get to see the truth.
 * Approval on the top bar is the real figure because it is the player's own
 * internal read; every POLL is a sample, with a margin of error that widens as
 * the sample shrinks. A campaign run off polling is a campaign run off noise,
 * and that is the intended experience.
 */

import {
  POLL_SAMPLE_LARGE,
  POLL_SAMPLE_SMALL,
  POLL_SAMPLE_STANDARD,
  REACH_DECAY_PER_TURN,
  REACH_PERSUASION_SCALE,
  REACH_TURNOUT_SCALE,
  VOLUNTEERS_PER_MEMBER,
} from '../balance.ts';
import { channelTemplate, type ChannelKey } from '../content/channels.ts';
import type { SegmentKey } from '../content/segments.ts';
import type { Party, Region } from '../types.ts';
import type { Rng } from '../rng.ts';
import { nationalShares, type SupportContext } from './electorate.ts';

/* ------------------------------------------------------------------ *
 * Campaign reach
 * ------------------------------------------------------------------ */

/** How much campaigning has landed with each segment, nationally. */
export type Reach = Partial<Record<SegmentKey, number>>;

/**
 * Apply one push on a channel.
 *
 * Reach accumulates per segment, so repeatedly buying television builds a
 * large effect among older voters and none at all among students — which is
 * the entire reason for modelling channels separately.
 */
export function applyChannelPush(reach: Reach, channel: ChannelKey): Reach {
  const template = channelTemplate(channel);
  const next: Reach = { ...reach };

  for (const [segment, exposure] of Object.entries(template.reach) as [SegmentKey, number][]) {
    next[segment] = (next[segment] ?? 0) + exposure;
  }
  return next;
}

/** Campaigning fades. A push in month nine is worth little by month twelve. */
export function decayReach(reach: Reach): Reach {
  const next: Reach = {};
  for (const [segment, value] of Object.entries(reach) as [SegmentKey, number][]) {
    const decayed = value * (1 - REACH_DECAY_PER_TURN);
    if (decayed > 0.01) next[segment] = decayed;
  }
  return next;
}

/** The persuasion bonus this reach gives the incumbent, per segment. */
export function persuasionBySegment(reach: Reach): Reach {
  const out: Reach = {};
  for (const [segment, value] of Object.entries(reach) as [SegmentKey, number][]) {
    /* Diminishing: the tenth advertisement is worth far less than the first. */
    out[segment] = Math.log1p(value) * REACH_PERSUASION_SCALE;
  }
  return out;
}

/** The turnout bonus this reach gives, per segment. */
export function turnoutBySegment(reach: Reach): Reach {
  const out: Reach = {};
  for (const [segment, value] of Object.entries(reach) as [SegmentKey, number][]) {
    out[segment] = Math.log1p(value) * REACH_TURNOUT_SCALE;
  }
  return out;
}

/**
 * How many door-knocking pushes the party's membership can sustain.
 *
 * The ground game is the cheapest and most persuasive channel, and it cannot
 * be bought — only a party with members can run one.
 */
export function availableVolunteerPushes(members: number, used: number): number {
  return Math.max(0, Math.floor(members * VOLUNTEERS_PER_MEMBER) - used);
}

/* ------------------------------------------------------------------ *
 * Polling
 * ------------------------------------------------------------------ */

export type PollQuality = 'small' | 'standard' | 'large';

const SAMPLE: Record<PollQuality, number> = {
  small: POLL_SAMPLE_SMALL,
  standard: POLL_SAMPLE_STANDARD,
  large: POLL_SAMPLE_LARGE,
};

/** A standard normal draw from the seeded stream (Box–Muller). */
function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface PollResult {
  /** partyId → sampled share. Sums to 1. */
  shares: Record<string, number>;
  /** 95% margin of error on a 50% figure, in percentage points. */
  marginOfError: number;
  sampleSize: number;
  quality: PollQuality;
}

/**
 * Sample the electorate.
 *
 * Each party's share is drawn around its true value with the standard error
 * of a proportion, so a small poll can be wrong by several points in either
 * direction — and two polls taken the same week can disagree. That is not a
 * bug being simulated; it is the thing polls actually do.
 */
export function conductPoll(
  trueShares: Record<string, number>,
  quality: PollQuality,
  rng: Rng,
): PollResult {
  const sampleSize = SAMPLE[quality];
  const sampled: Record<string, number> = {};

  for (const [id, share] of Object.entries(trueShares)) {
    const standardError = Math.sqrt(Math.max(0.0001, share * (1 - share)) / sampleSize);
    sampled[id] = Math.max(0.001, share + gaussian(rng) * standardError);
  }

  const total = Object.values(sampled).reduce((a, b) => a + b, 0);
  for (const id of Object.keys(sampled)) sampled[id] = (sampled[id] ?? 0) / total;

  return {
    shares: sampled,
    marginOfError: (1.96 * Math.sqrt(0.25 / sampleSize)) * 100,
    sampleSize,
    quality,
  };
}

/** True national shares right now, before any sampling error. */
export function trueNationalShares(
  regions: readonly Region[],
  parties: readonly Party[],
  context: SupportContext,
): Record<string, number> {
  return nationalShares(regions, parties, context).shares;
}

/* ------------------------------------------------------------------ *
 * Projections
 * ------------------------------------------------------------------ */

export interface SeatProjection {
  /** partyId → projected seats at the poll's central estimate. */
  seats: Record<string, number>;
  /**
   * Seats that party would take at the bottom and top of its own margin of
   * error. These are per-party bands, so they do NOT sum to the chamber —
   * every party cannot simultaneously be at the edge of its range.
   */
  low: Record<string, number>;
  high: Record<string, number>;
}

/**
 * Turn a poll into a seat projection, with the uncertainty carried through.
 *
 * A projection that quotes a single number from a sampled poll is lying. The
 * band is what the margin of error actually implies, and under a majoritarian
 * system it is very wide indeed.
 */
export function projectSeats(
  poll: PollResult,
  totalSeats: number,
  allocate: (shares: Record<string, number>, seats: number) => Record<string, number>,
): SeatProjection {
  const margin = poll.marginOfError / 100;
  const ids = Object.keys(poll.shares);

  /*
   * The band has to be computed PER PARTY. Shifting everyone by the same
   * margin and renormalising moves nobody relative to anybody else, which
   * collapses the band to a single number and quietly turns an honest
   * projection back into a false certainty.
   */
  const shiftedFor = (target: string, direction: number): Record<string, number> => {
    const base = poll.shares[target] ?? 0;
    const moved = Math.max(0.001, Math.min(0.999, base + direction * margin));
    const delta = moved - base;

    const othersTotal = ids
      .filter((id) => id !== target)
      .reduce((sum, id) => sum + (poll.shares[id] ?? 0), 0);

    const out: Record<string, number> = { [target]: moved };
    for (const id of ids) {
      if (id === target) continue;
      const share = poll.shares[id] ?? 0;
      /* The rest absorb the difference in proportion to their own size. */
      out[id] = othersTotal > 0 ? Math.max(0.001, share - delta * (share / othersTotal)) : share;
    }
    return out;
  };

  const low: Record<string, number> = {};
  const high: Record<string, number> = {};
  for (const id of ids) {
    low[id] = allocate(shiftedFor(id, -1), totalSeats)[id] ?? 0;
    high[id] = allocate(shiftedFor(id, 1), totalSeats)[id] ?? 0;
  }

  return { seats: allocate(poll.shares, totalSeats), low, high };
}

/* ------------------------------------------------------------------ *
 * Election night extras
 * ------------------------------------------------------------------ */

/**
 * An exit poll: taken from real voters, so tighter than a campaign poll, but
 * published before a single ballot has been counted.
 */
export function exitPoll(
  trueShares: Record<string, number>,
  rng: Rng,
): PollResult {
  return conductPoll(trueShares, 'large', rng);
}

/** Districts close enough that the result could go either way on a recount. */
export function recountCandidates(
  outcomes: readonly { districtId: string; districtName: string; shares: Record<string, number> }[],
  threshold = 0.01,
): { districtId: string; districtName: string; margin: number }[] {
  return outcomes
    .map((outcome) => {
      const sorted = Object.values(outcome.shares).sort((a, b) => b - a);
      return {
        districtId: outcome.districtId,
        districtName: outcome.districtName,
        margin: (sorted[0] ?? 0) - (sorted[1] ?? 0),
      };
    })
    .filter((row) => row.margin < threshold)
    .sort((a, b) => a.margin - b.margin);
}

/**
 * Swing between two elections, per party, in percentage points.
 *
 * The number every broadcaster leads on, and the one that actually explains
 * a result: not who won, but who moved.
 */
export function computeSwing(
  previous: Record<string, number>,
  current: Record<string, number>,
): Record<string, number> {
  const swing: Record<string, number> = {};
  for (const id of new Set([...Object.keys(previous), ...Object.keys(current)])) {
    swing[id] = ((current[id] ?? 0) - (previous[id] ?? 0)) * 100;
  }
  return swing;
}
