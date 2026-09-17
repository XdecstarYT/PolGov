/**
 * policy.ts — the life of a law after it is written.
 *
 * Tabling a bill is the beginning, not the end. This module covers what
 * happens around and after that: whether the country actually wants the thing,
 * how long it takes to bite, whether it expires, whether a later government
 * tears it up, and the promises a party made to get elected in the first place.
 *
 * The recurring idea is that a policy's popularity is NOT a number written on
 * it. It is computed from what the policy does to the issues each segment of
 * the electorate cares about — so the same bill is welcome in one region and
 * resented in another, without anyone having authored that.
 */

import {
  EXECUTIVE_ORDER_APPROVAL_COST,
  IMPLEMENTATION_DELAY_MAJOR,
  IMPLEMENTATION_DELAY_MINOR,
  PROMISE_BROKEN_APPROVAL,
  PROMISE_KEPT_APPROVAL,
  REFERENDUM_TURNOUT_PENALTY,
  SUNSET_DEFAULT_TURNS,
} from '../balance.ts';
import type { IssueKey, SegmentKey } from '../content/segments.ts';
import { ISSUE_LABELS, SEGMENT_TEMPLATES, segmentTemplate } from '../content/segments.ts';
import { affinity } from '../ideology.ts';
import type {
  Bill,
  Effects,
  Ideology,
  ManifestoPromise,
  Party,
  Region,
  SectorKey,
} from '../types.ts';
import { segmentTurnout, type IssueScores } from './electorate.ts';

/* ------------------------------------------------------------------ *
 * Is this thing actually popular?
 * ------------------------------------------------------------------ */

/** Which issue each sector speaks to. */
const SECTOR_ISSUE: Record<SectorKey, IssueKey> = {
  economy: 'economy',
  health: 'health',
  education: 'education',
  infrastructure: 'infrastructure',
  environment: 'environment',
};

/**
 * How a bill reads to one segment, roughly −1 (hostile) to +1 (enthusiastic).
 *
 * Two parts: what it DOES to the issues they weight, and how far its politics
 * sit from theirs. A segment can approve of a policy's substance and still
 * dislike who is proposing it and why.
 */
export function billAppealToSegment(
  bill: Bill,
  segmentKey: SegmentKey,
  scores: IssueScores,
): number {
  const segment = segmentTemplate(segmentKey);
  let substance = 0;
  let weightTotal = 0;

  const consider = (issue: IssueKey, delta: number) => {
    const weight = segment.issueWeights[issue];
    if (!weight || delta === 0) return;
    /*
     * Improving an issue that is already excellent wins less than rescuing one
     * that is failing — diminishing political returns on good news.
     */
    const headroom = issue === 'tax' || issue === 'debt' ? 1 : (100 - scores[issue]) / 100 + 0.35;
    substance += Math.sign(delta) * Math.min(1, Math.abs(delta) / 8) * weight * headroom;
    weightTotal += Math.abs(weight);
  };

  for (const [key, delta] of Object.entries(bill.effects.sectorDeltas ?? {})) {
    consider(SECTOR_ISSUE[key as SectorKey], delta ?? 0);
  }
  for (const [key, delta] of Object.entries(bill.effects.fundingDeltas ?? {})) {
    consider(SECTOR_ISSUE[key as SectorKey], (delta ?? 0) * 1.5);
  }
  /* Raising recurring revenue is a tax rise, and lands as one. */
  if (bill.effects.revenueDelta) {
    consider('tax', -bill.effects.revenueDelta * 2);
    consider('cost_of_living', -bill.effects.revenueDelta);
  }
  if (bill.effects.debt) consider('debt', -bill.effects.debt / 6);
  if (bill.effects.treasury) consider('debt', bill.effects.treasury / 8);

  const substanceScore = weightTotal > 0 ? substance / weightTotal : 0;
  const politics = affinity(bill.ideology, segment.ideology);

  return Math.max(-1, Math.min(1, substanceScore * 0.65 + politics * 0.35));
}

export interface PolicyOpinion {
  /** Net national opinion, −1 to +1, weighted by segment size and turnout. */
  net: number;
  /** How divided the country is: 0 is consensus, 1 is a national argument. */
  controversy: number;
  supporters: { key: SegmentKey; label: string; appeal: number }[];
  opponents: { key: SegmentKey; label: string; appeal: number }[];
}

/**
 * What the country makes of a bill.
 *
 * Weighted by how many people are in each segment and how reliably they vote,
 * so a policy adored by students and loathed by retirees polls badly even if
 * more people like it than not.
 */
export function policyOpinion(
  bill: Bill,
  regions: readonly Region[],
  scores: IssueScores,
): PolicyOpinion {
  const weights: Record<string, number> = {};
  for (const region of regions) {
    for (const [key, weight] of Object.entries(region.composition ?? {})) {
      weights[key] = (weights[key] ?? 0) + (weight ?? 0) * region.seats;
    }
  }

  const rows = SEGMENT_TEMPLATES.filter((s) => (weights[s.key] ?? 0) > 0).map((segment) => {
    const appeal = billAppealToSegment(bill, segment.key, scores);
    const influence = (weights[segment.key] ?? 0) * segmentTurnout(segment);
    return { key: segment.key, label: segment.label, appeal, influence };
  });

  const totalInfluence = rows.reduce((sum, r) => sum + r.influence, 0) || 1;
  const net = rows.reduce((sum, r) => sum + r.appeal * r.influence, 0) / totalInfluence;

  /* Controversy is the spread of opinion, not its average. */
  const variance =
    rows.reduce((sum, r) => sum + (r.appeal - net) ** 2 * r.influence, 0) / totalInfluence;
  const controversy = Math.min(1, Math.sqrt(variance) * 1.6);

  const sorted = [...rows].sort((a, b) => b.appeal - a.appeal);
  return {
    net,
    controversy,
    supporters: sorted.filter((r) => r.appeal > 0.08).slice(0, 4).map(({ key, label, appeal }) => ({ key, label, appeal })),
    opponents: sorted
      .filter((r) => r.appeal < -0.08)
      .slice(-4)
      .reverse()
      .map(({ key, label, appeal }) => ({ key, label, appeal })),
  };
}

/* ------------------------------------------------------------------ *
 * Implementation, sunset, repeal
 * ------------------------------------------------------------------ */

/**
 * How long a policy takes to be felt.
 *
 * Nothing arrives the month it passes. Major programmes take longer, which is
 * the quiet tragedy of a twelve-month term: the things worth doing land after
 * the election that decides whether you were right to do them.
 */
export function implementationDelay(bill: Bill): number {
  return bill.magnitude === 'major' ? IMPLEMENTATION_DELAY_MAJOR : IMPLEMENTATION_DELAY_MINOR;
}

export function sunsetTurn(bill: Bill, turnPassed: number): number | null {
  return bill.sunset ? turnPassed + SUNSET_DEFAULT_TURNS : null;
}

/**
 * Reverse a bill's effects.
 *
 * Repeal undoes what a law did to funding and recurring revenue — those are
 * standing arrangements that can be unwound. It does NOT undo one-off cash or
 * the health a service accumulated while it was funded; that money is spent
 * and that improvement happened. Repealing is cheaper than never having
 * passed it, and more expensive than it looks.
 */
export function reverseEffects(effects: Effects): Effects {
  const negate = (value?: number) => (value === undefined ? undefined : -value);
  return {
    fundingDeltas: effects.fundingDeltas
      ? Object.fromEntries(
          Object.entries(effects.fundingDeltas).map(([k, v]) => [k, -(v ?? 0)]),
        )
      : undefined,
    revenueDelta: negate(effects.revenueDelta),
  };
}

/* ------------------------------------------------------------------ *
 * Referendums
 * ------------------------------------------------------------------ */

export interface ReferendumQuestion {
  id: string;
  question: string;
  /** The politics of a Yes vote. */
  ideology: Ideology;
  /** What passing it does. */
  effects: Effects;
  /** Plain statement of the case against, shown alongside the case for. */
  tradeoff: string;
}

export interface ReferendumResult {
  question: string;
  yesShare: number;
  turnout: number;
  passed: boolean;
  /** Segments that carried it, and those that opposed. */
  breakdown: { key: SegmentKey; label: string; yes: number; influence: number }[];
}

/**
 * Put a question to the country.
 *
 * Uses the same electorate model as an election: each segment weighs the
 * proposition against the issues it cares about and its own politics. Turnout
 * is lower than a general election — referendums draw the committed.
 */
export function runReferendum(
  question: ReferendumQuestion,
  regions: readonly Region[],
  scores: IssueScores,
): ReferendumResult {
  const asBill = {
    ideology: question.ideology,
    effects: question.effects,
    magnitude: 'major',
  } as Bill;

  const weights: Record<string, number> = {};
  for (const region of regions) {
    for (const [key, weight] of Object.entries(region.composition ?? {})) {
      weights[key] = (weights[key] ?? 0) + (weight ?? 0) * region.seats;
    }
  }

  const rows = SEGMENT_TEMPLATES.filter((s) => (weights[s.key] ?? 0) > 0).map((segment) => {
    const appeal = billAppealToSegment(asBill, segment.key, scores);
    /* Appeal maps onto a Yes share centred on 50%. */
    const yes = Math.max(0.02, Math.min(0.98, 0.5 + appeal * 0.45));
    const influence =
      (weights[segment.key] ?? 0) *
      segmentTurnout(segment) *
      (1 - REFERENDUM_TURNOUT_PENALTY);
    return { key: segment.key, label: segment.label, yes, influence };
  });

  const totalInfluence = rows.reduce((sum, r) => sum + r.influence, 0) || 1;
  const yesShare = rows.reduce((sum, r) => sum + r.yes * r.influence, 0) / totalInfluence;

  const baseTurnout =
    rows.reduce((sum, r) => sum + r.influence, 0) /
    (Object.values(weights).reduce((a, b) => a + b, 0) || 1);

  return {
    question: question.question,
    yesShare,
    turnout: Math.max(0.2, Math.min(0.9, baseTurnout)),
    passed: yesShare > 0.5,
    breakdown: rows.sort((a, b) => b.yes - a.yes),
  };
}

/* ------------------------------------------------------------------ *
 * Manifesto promises
 * ------------------------------------------------------------------ */

export type { ManifestoPromise };

/**
 * Judge the manifesto at the end of a term.
 *
 * A promise kept is worth something; a promise broken is worth more, in the
 * wrong direction. This is the asymmetry that makes a manifesto a real
 * commitment rather than a wish list — and the reason promising less can be
 * the stronger play.
 */
export function judgePromises(
  promises: readonly ManifestoPromise[],
  bills: readonly Bill[],
  termNumber: number,
): { updated: ManifestoPromise[]; approvalDelta: number; kept: number; broken: number } {
  let kept = 0;
  let broken = 0;

  const updated = promises.map((promise) => {
    if (promise.status !== 'outstanding' || promise.termMade !== termNumber) return promise;

    const bill = bills.find((b) => b.templateKey === promise.billKey);
    if (bill && bill.status === 'passed') {
      kept += 1;
      return { ...promise, status: 'kept' as const };
    }
    broken += 1;
    return { ...promise, status: 'broken' as const };
  });

  return {
    updated,
    approvalDelta: kept * PROMISE_KEPT_APPROVAL + broken * PROMISE_BROKEN_APPROVAL,
    kept,
    broken,
  };
}

/* ------------------------------------------------------------------ *
 * Executive orders
 * ------------------------------------------------------------------ */

/**
 * The cost of governing without asking.
 *
 * An executive order takes effect immediately and needs no vote at all, which
 * is exactly why it costs standing: a government that legislates by decree is
 * telling the country it cannot win the argument. The penalty compounds with
 * each one issued in a term.
 */
export function executiveOrderCost(ordersThisTerm: number): number {
  return EXECUTIVE_ORDER_APPROVAL_COST * (1 + ordersThisTerm * 0.6);
}

/** Effects are weaker by decree than by statute — an order cannot spend money. */
export function decreeEffects(effects: Effects): Effects {
  return {
    ...effects,
    treasury: undefined,
    debt: undefined,
    fundingDeltas: undefined,
    sectorDeltas: effects.sectorDeltas
      ? Object.fromEntries(
          Object.entries(effects.sectorDeltas).map(([k, v]) => [k, (v ?? 0) * 0.5]),
        )
      : undefined,
  };
}

export { ISSUE_LABELS };
export type { IssueScores, Party };
