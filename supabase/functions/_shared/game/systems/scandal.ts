/**
 * scandal.ts — what happens after the story breaks.
 *
 * THE COVER-UP COSTS MORE THAN THE CRIME, BUT ONLY IF IT'S FOUND. A
 * denial's `escalationRisk` is the weekly chance the story is found out
 * anyway; most denials never roll it. When one does, `CONFIRMED_APPROVAL_COST`
 * and `CONFIRMED_DISCIPLINE_HIT` are set well above what admitting the
 * same fact on day one would have cost — the asymmetry is the whole
 * mechanism, and it is why the bet stays rational to take even though
 * it sometimes loses badly.
 *
 * DOING NOTHING IS ITS OWN RESPONSE. A scandal nobody has addressed
 * carries the base unaddressed risk and a weekly drip of its own —
 * silence reads as guilt, mechanically, not just narratively.
 */

import {
  CONFIRMED_APPROVAL_COST,
  CONFIRMED_DISCIPLINE_HIT,
  SCANDAL_FADE_WEEKS,
  SCANDAL_SEVERITY_FROM_LEAK,
  UNADDRESSED_ESCALATION_RISK,
  UNADDRESSED_WEEKLY_COST,
} from '../balance.ts';
import { findResponse, type ScandalCause, type ScandalResponse } from '../content/scandal.ts';
import type { Rng } from '../rng.ts';
import type { Scandal } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Spawning
 * ------------------------------------------------------------------ */

export function severityFromLeak(leakApprovalCost: number): number {
  return clamp100(leakApprovalCost * SCANDAL_SEVERITY_FROM_LEAK);
}

export function spawnScandal(cause: ScandalCause, severity: number, turn: number, rng: Rng): Scandal {
  return {
    id: `scandal-${turn}-${Math.round(rng.range(1000, 9999))}`,
    cause,
    severity: clamp100(severity),
    stage: 'breaking',
    response: null,
    startedTurn: turn,
    weeksSinceResponse: 0,
    escalationRisk: UNADDRESSED_ESCALATION_RISK,
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

export function describeScandal(scandal: Scandal): string {
  if (scandal.stage === 'confirmed') {
    return 'What was denied has been found. The story now is the denial, not the original fact.';
  }
  if (scandal.response === 'deny') {
    return 'Denied, and quiet since. That is not the same as settled.';
  }
  if (scandal.response === 'investigate') {
    return 'Under investigation. Slower, and the risk of this getting worse is actually falling.';
  }
  if (scandal.response === 'admit') {
    return 'Admitted. The worst of it landed on the day it was said.';
  }
  return 'Breaking, and nobody has said anything about it yet.';
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface ScandalWeekResult {
  scandals: Scandal[];
  approvalCost: number;
  disciplineHit: number;
  /** Scandals confirmed this week — a denial that was found out. */
  confirmed: string[];
  /** Scandals that faded to closed this week. */
  closed: string[];
}

export function stepScandals(scandals: readonly Scandal[], rng: Rng): ScandalWeekResult {
  let approvalCost = 0;
  let disciplineHit = 0;
  const confirmed: string[] = [];
  const closed: string[] = [];

  const next: Scandal[] = [];

  for (const scandal of scandals) {
    if (scandal.stage === 'closed') continue;

    const weightedSeverity = scandal.severity / 100;

    /*
     * A scandal is only ever eligible to confirm ONCE, on the week it
     * is still `breaking` and carries a live risk — an unaddressed
     * scandal that stays unaddressed rolls that risk every week it
     * remains in `breaking`, and a denial or investigation rolls it
     * under the same rule. Once it has confirmed, or once it has a
     * response that has already capped the risk, it only ever counts
     * down toward fading — never rolls, and never charges twice.
     */
    const stillAtRisk = scandal.stage === 'breaking' && scandal.escalationRisk > 0;

    if (scandal.response === null) {
      /* Unaddressed. Its own drip, on top of whatever the risk roll costs. */
      approvalCost += UNADDRESSED_WEEKLY_COST * weightedSeverity;
    }

    if (stillAtRisk && rng.chance(scandal.escalationRisk)) {
      approvalCost += CONFIRMED_APPROVAL_COST * weightedSeverity;
      disciplineHit += CONFIRMED_DISCIPLINE_HIT * weightedSeverity;
      confirmed.push(scandal.id);
      next.push({ ...scandal, stage: 'confirmed', weeksSinceResponse: 0 });
      continue;
    }

    const weeksSinceResponse = scandal.weeksSinceResponse + 1;
    const escalationRisk =
      scandal.response === 'investigate' ? scandal.escalationRisk * 0.75 : scandal.escalationRisk;

    if (weeksSinceResponse >= SCANDAL_FADE_WEEKS) {
      closed.push(scandal.id);
      next.push({ ...scandal, stage: 'closed', weeksSinceResponse, escalationRisk });
      continue;
    }

    next.push({ ...scandal, weeksSinceResponse, escalationRisk });
  }

  return { scandals: next.filter((s) => s.stage !== 'closed'), approvalCost, disciplineHit, confirmed, closed };
}

/* ------------------------------------------------------------------ *
 * Decisions
 * ------------------------------------------------------------------ */

export interface RespondResult {
  scandals: Scandal[];
  immediateCost: number;
}

export function respondToScandal(
  scandals: readonly Scandal[],
  scandalId: string,
  response: ScandalResponse,
): RespondResult {
  const template = findResponse(response);
  let immediateCost = 0;

  const next = scandals.map((s) => {
    if (s.id !== scandalId) return s;
    immediateCost = template.immediateCost * (s.severity / 100);
    return {
      ...s,
      response,
      stage: response === 'admit' ? ('contained' as const) : s.stage,
      weeksSinceResponse: 0,
      escalationRisk: s.escalationRisk * template.riskMultiplier,
    };
  });

  return { scandals: next, immediateCost };
}
