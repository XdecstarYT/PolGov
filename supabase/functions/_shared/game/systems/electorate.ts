/**
 * electorate.ts — how twenty kinds of voter decide.
 *
 * The chain, end to end:
 *
 *   state of the country  →  a score on each issue
 *   issue scores × a segment's own priorities  →  that segment's verdict
 *   verdict + ideological affinity  →  support for each party in that segment
 *   support × segment weight × turnout, summed  →  a region's vote shares
 *
 * Every link is derived from state the simulation already tracks, so no part
 * of a voter's opinion is asserted. A government that funds health well will
 * find retirees warming to it without anything being hardcoded to say so.
 */

import {
  CAMPAIGN_EFFECT_PER_INVESTMENT,
  INCUMBENT_PERFORMANCE_SWING,
  ISSUE_COST_PER_REVENUE,
  ISSUE_DEBT_ZERO_AT_RATIO,
  ISSUE_TAX_BASE,
  ISSUE_TAX_PER_REVENUE,
  OPPOSITION_PERFORMANCE_SWING,
  SEGMENT_IDEOLOGY_PULL,
  TURNOUT_BASELINE,
  TURNOUT_CAMPAIGN_LIFT,
} from '../balance.ts';
import {
  ISSUE_KEYS,
  segmentTemplate,
  type IssueKey,
  type SegmentKey,
  type SegmentTemplate,
} from '../content/segments.ts';
import { affinity } from '../ideology.ts';
import type { Economy, Party, Region, Sector, TaxCode } from '../types.ts';
import { findSector } from './budget.ts';
import { costOfLivingScore, economyIssueScore } from './economy.ts';
import { debtRatio } from './publicFinance.ts';
import { taxBurdenScore } from './taxation.ts';

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

/* ------------------------------------------------------------------ *
 * Issue scores
 * ------------------------------------------------------------------ */

export type IssueScores = Record<IssueKey, number>;

/**
 * Score the government's record on each issue, 0–100.
 *
 * Four of the eight are simply the health of the sector responsible. The
 * other four are composites, because voters experience them that way:
 *
 *   · "Jobs and the economy" is read off the macroeconomy — unemployment,
 *     real wages and direction — not off what the economy line in the budget
 *     is funded at. A government cannot buy this score; it has to produce it.
 *   · The tax burden is what the government has added to recurring revenue.
 *   · The debt score falls as borrowing climbs.
 *   · Cost of living is the gap between what wages do and what prices do,
 *     plus whatever tax has been layered on top. A country with 6% inflation
 *     and 8% wage growth is not having a cost-of-living crisis; one with 2%
 *     and 0% is.
 */
export function computeIssueScores(
  sectors: readonly Sector[],
  debt: number,
  revenueModifier: number,
  economy: Economy,
  /** The tax code, when there is one. Without it the old proxy stands in. */
  taxes?: TaxCode,
): IssueScores {
  const taxBurden = Math.max(0, revenueModifier) * ISSUE_COST_PER_REVENUE;

  return {
    economy: economyIssueScore(economy),
    health: findSector(sectors, 'health').health,
    education: findSector(sectors, 'education').health,
    infrastructure: findSector(sectors, 'infrastructure').health,
    environment: findSector(sectors, 'environment').health,
    /* What the government is charging, against what it inherited. Voters
       judge a tax system against what they were paying before, not against
       an abstract optimum. */
    tax: taxes
      ? taxBurdenScore(taxes, economy.gdp)
      : clamp100(ISSUE_TAX_BASE - revenueModifier * ISSUE_TAX_PER_REVENUE),
    debt: clamp100(
      100 * (1 - debtRatio(debt, economy.gdp) / ISSUE_DEBT_ZERO_AT_RATIO),
    ),
    cost_of_living: costOfLivingScore(economy, taxBurden),
  };
}

/* ------------------------------------------------------------------ *
 * A segment's verdict
 * ------------------------------------------------------------------ */

/**
 * How satisfied a segment is with the government, 0–1, where 0.5 is neutral.
 *
 * Only the issues the segment actually weights count, and they count in
 * proportion to how much it cares. A negative weight means the segment reads
 * a high score on that issue as a mark against the government — industrial
 * districts that treat environmental spending as a cost, for instance.
 */
export function segmentSatisfaction(
  segment: SegmentTemplate,
  scores: IssueScores,
): number {
  let weighted = 0;
  let total = 0;

  for (const issue of ISSUE_KEYS) {
    const weight = segment.issueWeights[issue];
    if (!weight) continue;
    weighted += scores[issue] * weight;
    total += Math.abs(weight);
  }

  if (total === 0) return 0.5;
  /* Negative weights can push the weighted sum below zero; clamp at the ends. */
  return Math.max(0, Math.min(1, weighted / (total * 100)));
}

/** The issues this segment cares most about, most important first. */
export function topIssues(segment: SegmentTemplate, count = 3): IssueKey[] {
  return ISSUE_KEYS.filter((issue) => (segment.issueWeights[issue] ?? 0) > 0)
    .sort((a, b) => (segment.issueWeights[b] ?? 0) - (segment.issueWeights[a] ?? 0))
    .slice(0, count);
}

/* ------------------------------------------------------------------ *
 * Support within a segment
 * ------------------------------------------------------------------ */

export interface SupportContext {
  scores: IssueScores;
  /** Party id of the incumbent — the player. */
  incumbentId: string;
  /** Extra national support for the incumbent, e.g. debate performance. */
  incumbentBonus?: number;
  /**
   * Extra support per segment, from campaigning that actually reached them.
   * This is what makes advertising channels matter: television moves retirees
   * and does nothing for students, because only one of them is watching.
   */
  segmentPersuasion?: Partial<Record<SegmentKey, number>>;
  /** Extra turnout per segment, from campaigning that reached them. */
  segmentTurnout?: Partial<Record<SegmentKey, number>>;
}

/**
 * Vote shares within one segment, summing to 1.
 *
 * Ideological proximity sets the shape; the government's record then moves
 * support toward or away from the incumbent, scaled by how volatile the
 * segment is. A loyal segment barely moves on performance; a volatile one
 * can swing most of its vote on a bad year.
 */
export function segmentVoteShares(
  segment: SegmentTemplate,
  parties: readonly Party[],
  context: SupportContext,
): Record<string, number> {
  const reached = context.segmentPersuasion?.[segment.key] ?? 0;
  const satisfaction = segmentSatisfaction(segment, context.scores);
  /* −1 (fully dissatisfied) … +1 (fully satisfied) */
  const verdict = (satisfaction - 0.5) * 2;

  const raw: Record<string, number> = {};

  for (const party of parties) {
    const proximity = affinity(party.ideology, segment.ideology);
    let weight = Math.exp(proximity * SEGMENT_IDEOLOGY_PULL) * party.baseStrength;

    if (party.id === context.incumbentId) {
      const swing = verdict * segment.volatility * INCUMBENT_PERFORMANCE_SWING;
      weight *= Math.max(0.05, 1 + swing + (context.incumbentBonus ?? 0) + reached);
    } else {
      const swing = -verdict * segment.volatility * OPPOSITION_PERFORMANCE_SWING;
      weight *= Math.max(0.05, 1 + swing);
    }

    raw[party.id] = Math.max(1e-6, weight);
  }

  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const shares: Record<string, number> = {};
  for (const party of parties) shares[party.id] = (raw[party.id] ?? 0) / total;
  return shares;
}

/* ------------------------------------------------------------------ *
 * Turnout
 * ------------------------------------------------------------------ */

/**
 * The share of a segment that actually votes.
 *
 * Habit dominates: retirees turn out whatever happens, students mostly do not.
 * Campaign effort lifts it, and lifts it most among the segments that were
 * least likely to vote — there is little headroom above a group already at 90%.
 */
export function segmentTurnout(
  segment: SegmentTemplate,
  campaignInvestment = 0,
): number {
  const habitual = TURNOUT_BASELINE * segment.turnout;
  const headroom = Math.max(0, 1 - habitual);
  const lift = campaignInvestment * TURNOUT_CAMPAIGN_LIFT * headroom;
  return Math.max(0.05, Math.min(0.98, habitual + lift));
}

/* ------------------------------------------------------------------ *
 * Aggregation to a region
 * ------------------------------------------------------------------ */

export interface RegionBreakdown {
  /** partyId → vote share in this region, summing to 1. */
  shares: Record<string, number>;
  /** Share of the eligible electorate here that voted. */
  turnout: number;
  /** Per-segment detail, for the campaign screen and polling. */
  segments: {
    key: SegmentKey;
    label: string;
    /** Relative weight of this segment in the region. */
    weight: number;
    turnout: number;
    satisfaction: number;
    shares: Record<string, number>;
  }[];
}

/**
 * Roll a region's segments up into vote shares.
 *
 * A segment's influence is its size multiplied by how much of it turns out,
 * which is why a government can win the argument and still lose the seat.
 */
export function regionBreakdown(
  region: Region,
  parties: readonly Party[],
  context: SupportContext,
): RegionBreakdown {
  return compositionBreakdown(
    region.composition ?? {},
    region.campaignInvestment,
    parties,
    context,
  );
}

/**
 * The same calculation for any electorate expressed as segment weights —
 * a region, or a single district within one.
 */
export function compositionBreakdown(
  composition: Partial<Record<SegmentKey, number>>,
  campaignInvestment: number,
  parties: readonly Party[],
  context: SupportContext,
): RegionBreakdown {
  const entries = Object.entries(composition) as [SegmentKey, number][];

  /* A region with no composition falls back to a single average voter. */
  if (entries.length === 0) {
    const shares: Record<string, number> = {};
    for (const party of parties) shares[party.id] = 1 / parties.length;
    return { shares, turnout: TURNOUT_BASELINE, segments: [] };
  }

  /*
   * Campaigning does two different things and both are real: it persuades
   * people already voting, and it drags to the polls people who were not
   * going to bother. The bonus here is the persuasion half; the mobilisation
   * half is in segmentTurnout, which lifts the least reliable segments most.
   */
  const localContext: SupportContext = {
    ...context,
    incumbentBonus:
      (context.incumbentBonus ?? 0) + campaignInvestment * CAMPAIGN_EFFECT_PER_INVESTMENT,
  };

  const detail: RegionBreakdown['segments'] = [];
  const totals: Record<string, number> = {};
  let effectiveTotal = 0;
  let weightTotal = 0;
  let votersTotal = 0;

  for (const [key, weight] of entries) {
    if (!weight) continue;
    const segment = segmentTemplate(key);
    const turnout = Math.min(
      0.98,
      segmentTurnout(segment, campaignInvestment) + (context.segmentTurnout?.[key] ?? 0),
    );
    const shares = segmentVoteShares(segment, parties, localContext);
    const effective = weight * turnout;

    for (const party of parties) {
      totals[party.id] = (totals[party.id] ?? 0) + (shares[party.id] ?? 0) * effective;
    }

    effectiveTotal += effective;
    weightTotal += weight;
    votersTotal += weight * turnout;

    detail.push({
      key,
      label: segment.label,
      weight,
      turnout,
      satisfaction: segmentSatisfaction(segment, localContext.scores),
      shares,
    });
  }

  const shares: Record<string, number> = {};
  for (const party of parties) {
    shares[party.id] = effectiveTotal > 0 ? (totals[party.id] ?? 0) / effectiveTotal : 0;
  }

  return {
    shares,
    turnout: weightTotal > 0 ? votersTotal / weightTotal : TURNOUT_BASELINE,
    segments: detail.sort((a, b) => b.weight - a.weight),
  };
}

/** National vote shares, weighting each region by its seat entitlement. */
export function nationalShares(
  regions: readonly Region[],
  parties: readonly Party[],
  context: SupportContext,
): { shares: Record<string, number>; turnout: number } {
  const totals: Record<string, number> = {};
  let seatTotal = 0;
  let turnoutWeighted = 0;

  for (const region of regions) {
    const breakdown = regionBreakdown(region, parties, context);
    for (const party of parties) {
      totals[party.id] = (totals[party.id] ?? 0) + (breakdown.shares[party.id] ?? 0) * region.seats;
    }
    turnoutWeighted += breakdown.turnout * region.seats;
    seatTotal += region.seats;
  }

  const shares: Record<string, number> = {};
  for (const party of parties) shares[party.id] = (totals[party.id] ?? 0) / seatTotal;
  return { shares, turnout: turnoutWeighted / seatTotal };
}
