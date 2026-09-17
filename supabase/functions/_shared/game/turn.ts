/**
 * turn.ts — the turn state machine and every way a player can change the world.
 *
 * The design's spine. Each turn walks the canonical phase order:
 *
 *   1 briefing → 2 events* → 3 agenda* → 4 budget* → 5 legislature
 *   → 6 resolution → 7 report → 8 advance          (* = player may act)
 *
 * Player actions are expressed as `Intent`s rather than direct mutations.
 * `applyIntent` validates cost and legality and is the ONLY way state changes
 * outside of resolution. That is what lets the `resolve-turn` edge function be
 * genuinely authoritative: it runs exactly this code over the client's intents
 * and never trusts a number the client computed.
 */

import {
  BUDGET_TURN_INTERVAL,
  CAMPAIGN_START_TURN,
  COALITION_FAILURE_APPROVAL_PENALTY,
  COALITION_MAX_ATTEMPTS,
  COUNTER_OFFER_PC_COST,
  DEBATE_SWING_PER_WIN,
  MOOD_CONCESSION_GAIN,
  MOOD_RED_LINE_VIOLATION,
  MOOD_RESHUFFLE_GAIN,
  MOOD_START,
  PC_COSTS,
  PUBLIC_ADDRESS_APPROVAL,
  PUBLIC_ADDRESS_DIMINISH,
  SECTOR_LABELS,
  TURNS_PER_TERM,
  WHIP_MAX_STEPS,
  AD_BUY_INVESTMENT,
  CAMPAIGN_STOP_INVESTMENT,
  PC_REDRAW_BOUNDARIES,
  REDRAW_APPROVAL_PENALTY,
  PC_COSTS_PARTY,
  PC_COSTS_PROCEDURE,
  AMENDMENT_STRENGTH,
  AMENDMENT_DILUTION,
  CROSSBENCH_SENATE_BONUS,
  FUNDRAISING_DRIVE_YIELD,
  HEADQUARTERS_COST,
  AD_BUY_PARTY_COST,
} from './balance.ts';
import { generateNews, fallbackDebateAttack } from './content/news.ts';
import { Rng } from './rng.ts';
import type {
  Bill,
  DebateExchange,
  Effects,
  GameEvent,
  GameState,
  LogEntry,
  Party,
  SectorKey,
} from './types.ts';
import {
  clampApproval,
  clampPc,
  computeApprovalTarget,
  computePcRegen,
  driftApproval,
  turnsServed,
} from './systems/approval.ts';
import {
  clamp01to100,
  driftSectorHealth,
  findSector,
  resolveFiscalTurn,
} from './systems/budget.ts';
import {
  applyCounterOffer,
  buildNegotiation,
  clampMood,
  coalitionPartners,
  computeMoodTarget,
  driftMood,
  hasMajority,
  noConfidenceTriggered,
  partnersWalkingOut,
  playerIsLargestParty,
  playerParty,
} from './systems/coalition.ts';
import { buildWeightContext, drawEvents } from './systems/eventEngine.ts';
import { simulateElection } from './systems/election.ts';
import { meanDistortion, redrawBoundaries } from './systems/districts.ts';
import {
  committeeReport,
  isMoneyBill,
  renewSenate,
  senateVerdict,
  senateVote,
} from './systems/parliament.ts';
import {
  authorityTarget,
  cohesionTarget,
  driftAuthority,
  driftCohesion,
  driftMembers,
  facesLeadershipChallenge,
  leadershipChallengeSupport,
  membershipTarget,
  partyFinanceTick,
  rebellionRisks,
  resolveRebellions,
  surviveChallenge,
} from './systems/partyInternals.ts';
import {
  billPcCost,
  computePassChance,
  resolveBillVote,
} from './systems/legislature.ts';

/* ------------------------------------------------------------------ *
 * Intents
 * ------------------------------------------------------------------ */

export type Intent =
  | { type: 'advance_phase' }
  | { type: 'resolve_event'; eventId: string; choiceIndex: number }
  | { type: 'propose_bill'; billId: string; whipSteps: number }
  | { type: 'withdraw_bill'; billId: string }
  | { type: 'public_address' }
  | { type: 'coalition_concession'; partyId: string }
  | { type: 'reshuffle_cabinet'; partyId: string }
  | { type: 'emergency_budget' }
  | { type: 'set_funding'; sector: SectorKey; amount: number }
  | { type: 'call_early_election' }
  | { type: 'retire' }
  | { type: 'campaign_stop'; regionId: string }
  | { type: 'ad_buy'; regionId: string }
  | { type: 'answer_debate'; debateId: string; choiceIndex: number }
  | { type: 'redraw_boundaries'; regionId: string }
  | { type: 'rally_party' }
  | { type: 'fundraising_drive' }
  | { type: 'appoint_deputy'; factionId: string }
  | { type: 'discipline_rebels'; factionId: string }
  | { type: 'invest_headquarters' }
  | { type: 'rename_party'; name: string }
  | { type: 'send_to_committee'; billId: string }
  | { type: 'amend_bill'; billId: string; towardFactionId?: string; towardPartyId?: string }
  | { type: 'crossbench_deal'; billId: string }
  | { type: 'close_debate'; billId: string }
  | { type: 'question_time' }
  | { type: 'negotiation_accept'; partyId: string }
  | { type: 'negotiation_counter'; partyId: string }
  | { type: 'negotiation_remove'; partyId: string }
  | { type: 'negotiation_form_government' }
  | { type: 'negotiation_abandon' }
  | { type: 'acknowledge_election' };

export interface IntentResult {
  state: GameState;
  /** Present when the intent was rejected. State is returned unchanged. */
  error?: string;
}

const ok = (state: GameState): IntentResult => ({ state });
const reject = (state: GameState, error: string): IntentResult => ({ state, error });

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function log(entries: LogEntry[], entry: LogEntry): void {
  entries.push(entry);
}

function currentLog(state: GameState): LogEntry[] {
  let existing = state.logs.find((l) => l.turnNumber === state.turnNumber);
  if (!existing) {
    existing = { turnNumber: state.turnNumber, entries: [] };
    state.logs.push(existing);
  }
  return existing.entries;
}

export function isBudgetTurn(turnNumber: number): boolean {
  return turnNumber % BUDGET_TURN_INTERVAL === 1;
}

export function isCampaignTurn(turnNumber: number): boolean {
  return turnNumber >= CAMPAIGN_START_TURN;
}

export function canEditBudget(state: GameState): boolean {
  return isBudgetTurn(state.turnNumber) || state.budgetUnlocked;
}

function spendPc(state: GameState, amount: number): boolean {
  if (state.politicalCapital < amount) return false;
  state.politicalCapital = clampPc(state.politicalCapital - amount);
  return true;
}

/**
 * Apply a bundle of effects, itemising every component into the turn log.
 * This is the single place mechanical consequences land, which is what keeps
 * the End of Turn Report complete by construction.
 */
export function applyEffects(
  state: GameState,
  effects: Effects,
  cause: string,
  entries: LogEntry[],
): void {
  if (effects.approval) {
    state.approval = clampApproval(state.approval + effects.approval);
    log(entries, {
      kind: 'approval',
      label: 'Approval',
      delta: effects.approval,
      cause,
      unit: 'pts',
    });
  }

  if (effects.politicalCapital) {
    state.politicalCapital = clampPc(state.politicalCapital + effects.politicalCapital);
    log(entries, {
      kind: 'political_capital',
      label: 'Political capital',
      delta: effects.politicalCapital,
      cause,
      unit: 'PC',
    });
  }

  if (effects.treasury) {
    state.treasury += effects.treasury;
    log(entries, {
      kind: 'treasury',
      label: 'Treasury',
      delta: effects.treasury,
      cause,
      unit: '₡bn',
    });
  }

  if (effects.debt) {
    state.debt = Math.max(0, state.debt + effects.debt);
    log(entries, { kind: 'debt', label: 'Debt', delta: effects.debt, cause, unit: '₡bn' });
  }

  if (effects.revenueDelta) {
    state.revenueModifier += effects.revenueDelta;
    log(entries, {
      kind: 'treasury',
      label: 'Recurring revenue',
      delta: effects.revenueDelta,
      cause,
      unit: '₡bn/turn',
      /* A change to a per-turn rate, not cash moving this month. */
      informational: true,
    });
  }

  for (const [key, delta] of Object.entries(effects.sectorDeltas ?? {})) {
    if (!delta) continue;
    const sector = findSector(state.sectors, key as SectorKey);
    sector.health = clamp01to100(sector.health + delta);
    log(entries, {
      kind: 'sector',
      label: SECTOR_LABELS[key as SectorKey],
      delta,
      cause,
      unit: 'pts',
    });
  }

  for (const [key, delta] of Object.entries(effects.fundingDeltas ?? {})) {
    if (!delta) continue;
    const sector = findSector(state.sectors, key as SectorKey);
    sector.funding = Math.max(0, sector.funding + delta);
    log(entries, {
      kind: 'sector',
      label: `${SECTOR_LABELS[key as SectorKey]} funding`,
      delta,
      cause,
      unit: '₡bn/turn',
    });
  }

  if (effects.coalitionMood) {
    for (const partner of coalitionPartners(state.parties)) {
      partner.coalitionMood = clampMood((partner.coalitionMood ?? MOOD_START) + effects.coalitionMood);
    }
    if (coalitionPartners(state.parties).length > 0) {
      log(entries, {
        kind: 'coalition',
        label: 'Coalition mood',
        delta: effects.coalitionMood,
        cause: `${cause} (all partners)`,
        unit: 'pts',
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Turn lifecycle
 * ------------------------------------------------------------------ */

/**
 * Open a turn: bank political capital, draw this turn's events, and set the
 * briefing. Called on entering every turn, including the first of a term.
 */
export function beginTurn(state: GameState): GameState {
  const next = clone(state);
  const rng = new Rng(next.rngState);
  const entries = currentLog(next);

  const regen = computePcRegen(next.approval);
  next.politicalCapital = clampPc(next.politicalCapital + regen);
  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: regen,
    cause: `Monthly regeneration at ${Math.round(next.approval)}% approval`,
    unit: 'PC',
  });

  next.budgetUnlocked = false;

  const recentKeys = next.logs
    .slice(-3)
    .flatMap((l) => l.entries.filter((e) => e.kind === 'event').map((e) => e.label));

  const ctx = buildWeightContext(
    next.sectors,
    next.approval,
    next.debt,
    next.treasury,
    next.turnNumber,
    next.parties,
  );
  next.events = drawEvents(rng, ctx, next.difficulty, next.turnNumber, recentKeys);

  if (isCampaignTurn(next.turnNumber) && !next.campaign) {
    next.campaign = { stopsMade: 0, adBuys: 0, debates: [], debateSwing: 0 };
  }
  if (isCampaignTurn(next.turnNumber) && next.campaign) {
    next.campaign.debates.push(buildDebate(next, rng));
  }

  next.phase = 'briefing';
  next.rngState = rng.state;
  next.updatedAt = new Date().toISOString();
  return next;
}

function buildDebate(state: GameState, rng: Rng): DebateExchange {
  const opponents = state.parties.filter((p) => !p.isPlayer && p.seats > 0);
  const opponent = rng.pickWeighted(opponents, (p) => p.seats);
  return {
    id: `debate-${state.turnNumber}-${opponent.id}`,
    opponentPartyId: opponent.id,
    attack: fallbackDebateAttack(opponent.name, state.approval),
    responses: [
      {
        label: 'Answer on the record — cite what was delivered',
        style: 'neutral',
        quality: state.career.billsPassed >= 4 ? 1 : 0.35,
      },
      {
        label: 'Answer on values — restate what the party is for',
        style: 'social',
        quality: 0.7,
      },
      {
        label: 'Answer on cost — attack their arithmetic',
        style: 'economic',
        quality: state.debt < 220 ? 0.95 : 0.3,
      },
      {
        label: 'Decline the framing and pivot to the future',
        style: 'neutral',
        quality: 0.5,
      },
    ],
    chosenIndex: null,
    swing: null,
  };
}

/**
 * Phases 5–7: count the votes, apply the month, and write the report.
 *
 * This is the authoritative step. It never reads a number the client supplied;
 * it recomputes pass chances from state at the moment of the division.
 */
export function resolveTurn(state: GameState): GameState {
  const next = clone(state);
  const rng = new Rng(next.rngState);
  const entries = currentLog(next);

  /* ---------------- phase 5: legislature ---------------- */
  next.phase = 'legislature';
  const tabled = next.bills.filter((b) => b.status === 'proposed');

  const player = playerParty(next.parties);

  /* Bills come back from committee before anything else is counted. */
  for (const bill of next.bills) {
    if (bill.status !== 'in_committee') continue;
    if (bill.committeeReturnsOn !== null && bill.committeeReturnsOn > next.turnNumber) continue;

    const report = committeeReport(bill, rng);
    bill.status = 'proposed';
    bill.committeeBonus = report.chanceBonus;
    bill.committeeReturnsOn = null;
    /* Scrutiny sands the edges off: better drafted, less distinctive. */
    bill.ideology = {
      economic: bill.ideology.economic * (1 - report.moderation),
      social: bill.ideology.social * (1 - report.moderation),
      environmental: bill.ideology.environmental * (1 - report.moderation),
    };
    tabled.push(bill);

    log(entries, {
      kind: 'legislature',
      label: `${bill.title} returns from committee`,
      delta: report.chanceBonus * 100,
      cause: report.findings,
      unit: '%',
    });
  }

  for (const bill of tabled) {
    /*
     * Roll the party's own benches first. A wing that refuses takes its seats
     * out of the government's side before the chamber is counted at all.
     */
    const risks = rebellionRisks(
      next.partyInternals,
      player.seats,
      bill.ideology,
      bill.whipSteps,
    );
    const rebellion = resolveRebellions(rng, risks);

    if (rebellion.rebelled.length > 0) {
      next.partyInternals.rebellionsThisTerm += rebellion.rebelled.length;
      next.partyInternals.cohesion = Math.max(
        0,
        next.partyInternals.cohesion + rebellion.cohesionCost,
      );
      for (const rebel of rebellion.rebelled) {
        const faction = next.partyInternals.factions.find((f) => f.id === rebel.factionId);
        if (faction) {
          faction.rebelling = true;
          faction.loyalty = Math.max(0, faction.loyalty - 5);
        }
        log(entries, {
          kind: 'legislature',
          label: `${rebel.factionName} rebels`,
          delta: -rebel.seats,
          cause: `${rebel.seats} of your own MPs refused to back ${bill.title}. It sits too far from where that wing stands.`,
          unit: 'seats',
        });
      }
    }

    const breakdown = computePassChance(
      bill,
      next.parties,
      next.sectors,
      bill.whipSteps,
      next.partyInternals,
      rebellion.seatsLost,
    );
    bill.passChance = breakdown.chance;
    const chance = Math.min(0.97, breakdown.chance + bill.committeeBonus);
    bill.passChance = chance;
    const carriedInHouse = resolveBillVote(rng, chance);

    /*
     * Clearing the lower house is not the end of it. The Senate is renewed by
     * halves, so half of it was elected by a previous electorate — a
     * government with a fresh mandate can still be stopped by the last one.
     * Money bills are the exception, by convention.
     */
    let passed = carriedInHouse;
    let senateBlocked = false;

    if (carriedInHouse) {
      const verdict = senateVerdict(bill, next.senate, next.parties);
      const senateChance = Math.min(
        0.98,
        verdict.chance + bill.crossbenchDeals * CROSSBENCH_SENATE_BONUS,
      );
      const clearedSenate = senateVote(rng, { ...verdict, chance: senateChance });

      if (!clearedSenate) {
        passed = false;
        senateBlocked = true;
        bill.blockedBySenate = true;
        log(entries, {
          kind: 'legislature',
          label: `${bill.title} blocked by the Senate`,
          delta: null,
          cause: `Carried in the lower house and stopped in the upper, where the government holds ${verdict.supportingSeats} of ${verdict.size} seats.`,
        });
      } else if (!verdict.bypassed) {
        log(entries, {
          kind: 'legislature',
          label: `${bill.title} clears the Senate`,
          delta: null,
          cause: `The upper house assented at ${(senateChance * 100).toFixed(0)}% projected.`,
        });
      }
    }

    bill.status = passed ? 'passed' : 'failed';
    bill.turnResolved = next.turnNumber;

    if (senateBlocked) {
      next.career.billsFailed += 1;
    } else if (passed) {
      next.career.billsPassed += 1;
      log(entries, {
        kind: 'legislature',
        label: bill.title,
        delta: null,
        cause: `Division passed at ${(chance * 100).toFixed(0)}% projected — ${breakdown.supportingSeats} of ${breakdown.totalSeats} seats behind it.`,
      });
      applyEffects(next, bill.effects, `${bill.title} enacted`, entries);

      /* Crossing a red line carries: the bill stands, the partner is furious. */
      for (const breach of breakdown.breaches) {
        const partner = next.parties.find((p) => p.id === breach.party.id);
        if (!partner) continue;
        partner.coalitionMood = clampMood(
          (partner.coalitionMood ?? MOOD_START) + MOOD_RED_LINE_VIOLATION,
        );
        log(entries, {
          kind: 'coalition',
          label: `${partner.name} mood`,
          delta: MOOD_RED_LINE_VIOLATION,
          cause: `${bill.title} crossed a stated red line: ${breach.redLine.description}`,
          unit: 'pts',
        });
      }
    } else if (!senateBlocked) {
      next.career.billsFailed += 1;
      log(entries, {
        kind: 'legislature',
        label: bill.title,
        delta: null,
        cause: `Division failed at ${(chance * 100).toFixed(0)}% projected — ${breakdown.supportingSeats} of ${breakdown.totalSeats} seats behind it${breakdown.defectingSeats > 0 ? `, with ${breakdown.defectingSeats} partner seats withheld over a red line` : ''}.`,
      });
    }
  }

  /* ---------------- phase 6: resolution ---------------- */
  next.phase = 'resolution';

  /* Sector drift toward the equilibrium implied by funding. */
  for (const sector of next.sectors) {
    const before = sector.health;
    sector.health = driftSectorHealth(sector.key, sector.health, sector.funding, next.difficulty);
    const delta = sector.health - before;
    if (Math.abs(delta) >= 0.05) {
      log(entries, {
        kind: 'sector',
        label: SECTOR_LABELS[sector.key],
        delta,
        cause: `Drift toward the level ₡${sector.funding.toFixed(0)}bn per turn sustains`,
        unit: 'pts',
      });
    }
  }

  /* Public finances. */
  const economyHealth = findSector(next.sectors, 'economy').health;
  const fiscal = resolveFiscalTurn(next.sectors, economyHealth, next.revenueModifier, next.debt);
  next.treasury += fiscal.treasuryDelta;
  next.debt = Math.max(0, next.debt + fiscal.debtDelta);

  log(entries, {
    kind: 'treasury',
    label: 'Revenue',
    delta: fiscal.revenue,
    cause: `Tax take at economy health ${economyHealth.toFixed(0)}`,
    unit: '₡bn',
    informational: true,
  });
  log(entries, {
    kind: 'treasury',
    label: 'Programme spending',
    delta: -fiscal.spending,
    cause: 'Total allocated across five sectors',
    unit: '₡bn',
    informational: true,
  });
  log(entries, {
    kind: 'debt',
    label: 'Debt service',
    delta: -fiscal.debtService,
    cause: `Interest on ₡${Math.round(next.debt)}bn outstanding`,
    unit: '₡bn',
    informational: true,
  });
  if (Math.abs(fiscal.treasuryDelta) >= 0.05) {
    log(entries, {
      kind: 'treasury',
      label: 'Treasury',
      delta: fiscal.treasuryDelta,
      cause:
        fiscal.balance >= 0
          ? 'Surplus remaining after debt repayment, banked as cash'
          : 'Net cash movement for the month',
      unit: '₡bn',
    });
  }
  if (fiscal.debtDelta > 0) {
    log(entries, {
      kind: 'debt',
      label: 'Debt',
      delta: fiscal.debtDelta,
      cause: 'Deficit financed by new borrowing',
      unit: '₡bn',
    });
  } else if (fiscal.debtDelta < 0) {
    log(entries, {
      kind: 'debt',
      label: 'Debt',
      delta: fiscal.debtDelta,
      cause: 'Surplus applied to outstanding principal',
      unit: '₡bn',
    });
  }

  /*
   * A negative treasury is not a free line of credit: cash shortfalls are
   * financed on the market like any other borrowing. Without this, one-off
   * spending from bills and events accumulates as invisible debt that never
   * accrues interest and never shows up in the approval calculation.
   */
  if (next.treasury < 0) {
    const overdraft = -next.treasury;
    next.debt += overdraft;
    next.treasury = 0;
    log(entries, {
      kind: 'debt',
      label: 'Debt',
      delta: overdraft,
      cause: 'Cash shortfall carried into borrowing',
      unit: '₡bn',
    });
    /*
     * Both halves of the transfer are logged. Recording only the debt side
     * would leave the report's treasury total short by exactly the overdraft,
     * and a player tracing the number would find the wrong answer.
     */
    log(entries, {
      kind: 'treasury',
      label: 'Treasury',
      delta: overdraft,
      cause: 'Cash shortfall covered by borrowing, returning the balance to zero',
      unit: '₡bn',
    });
  }

  /* Approval eases toward the standing the country's condition implies. */
  const served = turnsServed(next.termNumber, next.turnNumber);
  const target = computeApprovalTarget(next.sectors, next.debt, served, next.difficulty);
  const beforeApproval = next.approval;
  next.approval = driftApproval(next.approval, target.target);
  const approvalDelta = next.approval - beforeApproval;
  if (Math.abs(approvalDelta) >= 0.05) {
    log(entries, {
      kind: 'approval',
      label: 'Approval',
      delta: approvalDelta,
      cause: `Drift toward standing of ${target.target.toFixed(0)}% implied by services, economy and debt`,
      unit: 'pts',
    });
  }

  /* Coalition mood drift. */
  for (const partner of coalitionPartners(next.parties)) {
    const moodTarget = computeMoodTarget(
      partner,
      player,
      next.approval,
      next.sectors,
      next.difficulty,
    );
    const beforeMood = partner.coalitionMood ?? MOOD_START;
    partner.coalitionMood = driftMood(beforeMood, moodTarget.target);
    const moodDelta = partner.coalitionMood - beforeMood;
    if (Math.abs(moodDelta) >= 0.05) {
      log(entries, {
        kind: 'coalition',
        label: `${partner.name} mood`,
        delta: moodDelta,
        cause: `Drift toward ${Math.round(moodTarget.target)}/100 given budget commitments, cabinet weight and government standing`,
        unit: 'pts',
      });
    }
  }

  /* Partners at zero walk out. */
  const walkedOut = partnersWalkingOut(next.parties);
  for (const partner of walkedOut) {
    partner.inCoalition = false;
    partner.coalitionMood = null;
    partner.cabinetPosts = 0;
    partner.redLines = [];
    log(entries, {
      kind: 'coalition',
      label: `${partner.name} leaves the government`,
      delta: -partner.seats,
      cause: 'Mood reached zero. The party has withdrawn from the coalition agreement.',
      unit: 'seats',
    });
  }

  next.approvalHistory.push({
    turn: (next.termNumber - 1) * TURNS_PER_TERM + next.turnNumber,
    approval: next.approval,
  });

  /* ---- the party's own affairs ---- */
  const internals = next.partyInternals;

  const finance = partyFinanceTick(internals, next.approval);
  internals.funds = Math.max(0, internals.funds + finance.net);
  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: finance.net,
    cause: `Subscriptions ₡${finance.subscriptions.toFixed(1)}m and donations ₡${finance.donations.toFixed(1)}m against ₡${finance.overheads.toFixed(1)}m of running costs`,
    unit: '₡m',
  });

  const beforeMembers = internals.members;
  internals.members = driftMembers(
    internals.members,
    membershipTarget(next.approval, internals.cohesion),
  );
  const memberDelta = internals.members - beforeMembers;
  if (Math.abs(memberDelta) >= 0.5) {
    log(entries, {
      kind: 'note',
      label: 'Party membership',
      delta: memberDelta,
      cause:
        memberDelta > 0
          ? 'People are joining while the party is doing well'
          : 'Members are letting their subscriptions lapse',
      unit: 'k',
    });
  }

  const beforeCohesion = internals.cohesion;
  internals.cohesion = driftCohesion(internals.cohesion, cohesionTarget(internals));
  const cohesionDelta = internals.cohesion - beforeCohesion;
  if (Math.abs(cohesionDelta) >= 0.5) {
    log(entries, {
      kind: 'note',
      label: 'Party discipline',
      delta: cohesionDelta,
      cause: `Drift toward the level your authority and the factions' loyalty sustain`,
      unit: 'pts',
    });
  }

  const beforeAuthority = internals.authority;
  internals.authority = driftAuthority(
    internals.authority,
    authorityTarget(
      next.approval,
      internals.rebellionsThisTerm,
      player.seats - (next.elections.at(-1)?.playerSeatsBefore ?? player.seats),
    ),
  );
  const authorityDelta = internals.authority - beforeAuthority;
  if (Math.abs(authorityDelta) >= 0.5) {
    log(entries, {
      kind: 'note',
      label: 'Your authority in the party',
      delta: authorityDelta,
      cause:
        internals.rebellionsThisTerm > 0
          ? `${internals.rebellionsThisTerm} rebellion${internals.rebellionsThisTerm === 1 ? '' : 's'} this term have made the next one easier to organise`
          : 'Drift toward the level your standing in the country sustains',
      unit: 'pts',
    });
  }

  /*
   * A leader who has lost their own party is challenged for the job. The
   * country does not get a vote; the factions do.
   */
  if (facesLeadershipChallenge(internals, next.turnNumber)) {
    const support = leadershipChallengeSupport(internals);
    if (support >= 50) {
      next.partyInternals = surviveChallenge(internals, next.turnNumber);
      log(entries, {
        kind: 'note',
        label: 'Leadership challenge survived',
        delta: support,
        cause: `A challenge was mounted and beaten with ${support.toFixed(0)}% of the party behind you. The benches have rallied — for now.`,
        unit: '%',
      });
    } else {
      internals.lastChallengeTurn = next.turnNumber;
      next.status = 'collapsed';
      next.phase = 'career_summary';
      log(entries, {
        kind: 'note',
        label: 'Removed as leader',
        delta: support,
        cause: `The party voted you out with only ${support.toFixed(0)}% behind you. A government can survive the country turning on it; it cannot survive its own side doing so.`,
        unit: '%',
      });
    }
  }

  next.career.peakApproval = Math.max(next.career.peakApproval, next.approval);
  next.career.lowestApproval = Math.min(next.career.lowestApproval, next.approval);

  /* Coverage of this turn, shown in next turn's briefing. */
  next.news = generateNews(
    entries,
    {
      turnNumber: next.turnNumber,
      countryName: next.countryName,
      approval: next.approval,
      debt: next.debt,
      playerPartyName: player.name,
    },
    rng,
  );

  /* ---------------- phase 7: report ---------------- */
  next.phase = 'report';
  next.rngState = rng.state;
  next.updatedAt = new Date().toISOString();

  /* A walkout that costs the majority is a confidence crisis. */
  next.confidenceCrisis = noConfidenceTriggered(next.parties, walkedOut);
  if (next.confidenceCrisis) {
    log(entries, {
      kind: 'note',
      label: 'Confidence in question',
      delta: null,
      cause:
        'The government no longer commands a majority. A new agreement must be negotiated.',
    });
  }

  return next;
}

/**
 * Phase 8: advance. Increments the turn, or hands off to an election.
 */
export function advanceTurn(state: GameState): GameState {
  let next = clone(state);

  /*
   * A confidence crisis takes precedence over the calendar — but only a real
   * one. Governing in a minority the player assembled deliberately is a
   * legitimate position and must not reopen negotiations every turn.
   */
  if (next.confidenceCrisis) {
    next.confidenceCrisis = false;
    next.negotiation = buildNegotiation(next.parties, 1, true);
    next.phase = 'coalition';
    return next;
  }

  if (next.turnNumber >= TURNS_PER_TERM) {
    return runElection(next);
  }

  next.turnNumber += 1;
  next = beginTurn(next);
  return next;
}

/** Hold a general election and present the result. */
export function runElection(state: GameState): GameState {
  const next = clone(state);
  const rng = new Rng(next.rngState);

  const result = simulateElection({
    parties: next.parties,
    regions: next.regions,
    districts: next.districts,
    system: next.electoralSystem,
    approval: next.approval,
    campaign: next.campaign,
    termNumber: next.termNumber,
    rng,
    /* The electorate judges the record directly, so pass it the record. */
    sectors: next.sectors,
    debt: next.debt,
    revenueModifier: next.revenueModifier,
  });

  for (const party of next.parties) {
    party.seats = result.seatsByParty[party.id] ?? 0;
    party.inCoalition = party.isPlayer;
    party.coalitionMood = null;
    party.cabinetPosts = 0;
    party.redLines = [];
  }

  /*
   * Half the Senate faces the voters; the other half carries on. This is what
   * makes divided government normal rather than exceptional.
   */
  next.senate = renewSenate(next.senate, result.voteShareByParty);

  next.elections.push(result);
  next.career.termsServed += 1;

  const playerSeats = result.playerSeatsAfter;
  const largest = Math.max(...Object.values(result.seatsByParty));
  if (playerSeats >= largest) next.career.electionsWon += 1;

  next.campaign = null;
  for (const region of next.regions) region.campaignInvestment = 0;

  next.phase = 'election_night';
  next.rngState = rng.state;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Leave the election night screen and take up (or fail to take up) office. */
function acknowledgeElection(state: GameState): GameState {
  const next = clone(state);
  next.termNumber += 1;
  next.turnNumber = 1;
  next.addressesThisTerm = 0;

  /* Bills that were never enacted return to the order paper for the new term. */
  for (const bill of next.bills) {
    if (bill.status === 'failed' || bill.status === 'proposed') {
      bill.status = 'available';
      bill.whipSteps = 0;
      bill.pcSpent = 0;
      bill.passChance = null;
      bill.turnProposed = null;
      bill.turnResolved = null;
    }
  }

  if (hasMajority(next.parties)) {
    return beginTurn(next);
  }

  next.negotiation = buildNegotiation(next.parties, 1);
  next.phase = 'coalition';
  return next;
}


/**
 * End the run. A government that falls mid-term has collapsed; a party that
 * cannot form one after an election has been defeated and goes into
 * opposition. Both land on the career summary.
 */
function endRun(state: GameState, crisis: boolean, reason: string): GameState {
  const next = clone(state);
  const entries = currentLog(next);
  next.status = crisis ? 'collapsed' : 'defeated';
  next.phase = 'career_summary';
  next.negotiation = null;
  log(entries, {
    kind: 'note',
    label: crisis ? 'The government has fallen' : 'Out of office',
    delta: null,
    cause: reason,
  });
  return next;
}

/* ------------------------------------------------------------------ *
 * Intent handling
 * ------------------------------------------------------------------ */

export function applyIntent(state: GameState, intent: Intent): IntentResult {
  if (state.status !== 'active' && intent.type !== 'advance_phase') {
    return reject(state, 'This run has ended.');
  }

  switch (intent.type) {
    case 'advance_phase':
      return handleAdvancePhase(state);
    case 'resolve_event':
      return handleResolveEvent(state, intent.eventId, intent.choiceIndex);
    case 'propose_bill':
      return handleProposeBill(state, intent.billId, intent.whipSteps);
    case 'withdraw_bill':
      return handleWithdrawBill(state, intent.billId);
    case 'public_address':
      return handlePublicAddress(state);
    case 'coalition_concession':
      return handleConcession(state, intent.partyId);
    case 'reshuffle_cabinet':
      return handleReshuffle(state, intent.partyId);
    case 'emergency_budget':
      return handleEmergencyBudget(state);
    case 'set_funding':
      return handleSetFunding(state, intent.sector, intent.amount);
    case 'call_early_election':
      return handleEarlyElection(state);
    case 'retire':
      return handleRetire(state);
    case 'campaign_stop':
      return handleCampaignStop(state, intent.regionId);
    case 'ad_buy':
      return handleAdBuy(state, intent.regionId);
    case 'answer_debate':
      return handleDebate(state, intent.debateId, intent.choiceIndex);
    case 'redraw_boundaries':
      return handleRedraw(state, intent.regionId);
    case 'rally_party':
      return handleRallyParty(state);
    case 'fundraising_drive':
      return handleFundraising(state);
    case 'appoint_deputy':
      return handleAppointDeputy(state, intent.factionId);
    case 'discipline_rebels':
      return handleDiscipline(state, intent.factionId);
    case 'invest_headquarters':
      return handleHeadquarters(state);
    case 'rename_party':
      return handleRenameParty(state, intent.name);
    case 'send_to_committee':
      return handleSendToCommittee(state, intent.billId);
    case 'amend_bill':
      return handleAmendBill(state, intent.billId, intent.towardFactionId, intent.towardPartyId);
    case 'crossbench_deal':
      return handleCrossbenchDeal(state, intent.billId);
    case 'close_debate':
      return handleCloseDebate(state, intent.billId);
    case 'question_time':
      return handleQuestionTime(state);
    case 'negotiation_accept':
      return handleNegotiationAccept(state, intent.partyId);
    case 'negotiation_counter':
      return handleNegotiationCounter(state, intent.partyId);
    case 'negotiation_remove':
      return handleNegotiationRemove(state, intent.partyId);
    case 'negotiation_form_government':
      return handleFormGovernment(state);
    case 'negotiation_abandon':
      return handleAbandonNegotiation(state);
    case 'acknowledge_election':
      return ok(acknowledgeElection(state));
    default:
      return reject(state, 'Unrecognised action.');
  }
}

/** Apply a list of intents in order, stopping at the first rejection. */
export function applyIntents(state: GameState, intents: Intent[]): IntentResult {
  let current = state;
  for (const intent of intents) {
    const result = applyIntent(current, intent);
    if (result.error) return result;
    current = result.state;
  }
  return ok(current);
}

function handleAdvancePhase(state: GameState): IntentResult {
  switch (state.phase) {
    case 'briefing': {
      const next = clone(state);
      next.phase = 'events';
      return ok(next);
    }
    case 'events': {
      if (state.events.some((e) => !e.resolved)) {
        return reject(state, 'Every event must be resolved before the agenda.');
      }
      const next = clone(state);
      next.phase = 'agenda';
      return ok(next);
    }
    case 'agenda': {
      const next = clone(state);
      next.phase = 'budget';
      return ok(next);
    }
    case 'budget':
      return ok(resolveTurn(state));
    case 'report':
      return ok(advanceTurn(state));
    case 'election_night':
      return ok(acknowledgeElection(state));
    default:
      return reject(state, `Cannot advance from the ${state.phase} phase.`);
  }
}

function handleResolveEvent(
  state: GameState,
  eventId: string,
  choiceIndex: number,
): IntentResult {
  if (state.phase !== 'events') return reject(state, 'Events can only be resolved in the events phase.');
  const target = state.events.find((e) => e.id === eventId);
  if (!target) return reject(state, 'No such event.');
  if (target.resolved) return reject(state, 'That event is already resolved.');

  const choice = target.choices[choiceIndex];
  if (!choice) return reject(state, 'No such choice.');
  if (state.politicalCapital < choice.pcCost) {
    return reject(state, 'Not enough political capital for that response.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  const event = next.events.find((e) => e.id === eventId) as GameEvent;

  if (choice.pcCost > 0) {
    spendPc(next, choice.pcCost);
    log(entries, {
      kind: 'political_capital',
      label: 'Political capital',
      delta: -choice.pcCost,
      cause: `${event.title} — ${choice.label}`,
      unit: 'PC',
    });
  }

  applyEffects(next, choice.effects, `${event.title} — ${choice.label}`, entries);

  log(entries, {
    kind: 'event',
    label: event.title,
    delta: null,
    cause: `${choice.label}. ${choice.tradeoff}`,
  });

  event.chosenIndex = choiceIndex;
  event.resolved = true;
  next.career.eventsResolved += 1;
  return ok(next);
}

function handleProposeBill(
  state: GameState,
  billId: string,
  whipSteps: number,
): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Bills are tabled during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return reject(state, 'No such bill.');
  if (bill.status !== 'available') return reject(state, 'That bill is not available to table.');

  const steps = Math.max(0, Math.min(WHIP_MAX_STEPS, Math.floor(whipSteps)));
  const cost = billPcCost(bill, steps);
  if (state.politicalCapital < cost) {
    return reject(state, 'Not enough political capital to table that bill.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  const target = next.bills.find((b) => b.id === billId) as Bill;

  spendPc(next, cost);
  target.status = 'proposed';
  target.whipSteps = steps;
  target.pcSpent = cost;
  target.turnProposed = next.turnNumber;
  target.passChance = computePassChance(
    target,
    next.parties,
    next.sectors,
    steps,
    next.partyInternals,
  ).chance;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -cost,
    cause: `Tabled ${target.title}${steps > 0 ? ` with ${steps} whip step${steps === 1 ? '' : 's'}` : ''}`,
    unit: 'PC',
  });

  return ok(next);
}

function handleWithdrawBill(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Bills can only be withdrawn during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'proposed') return reject(state, 'That bill is not on the order paper.');

  const next = clone(state);
  const entries = currentLog(next);
  const target = next.bills.find((b) => b.id === billId) as Bill;

  /* Half the capital is recoverable; the rest is spent persuading people. */
  const refund = Math.floor(target.pcSpent / 2);
  next.politicalCapital = clampPc(next.politicalCapital + refund);
  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: refund,
    cause: `Withdrew ${target.title} — half the capital spent is recovered`,
    unit: 'PC',
  });

  target.status = 'available';
  target.whipSteps = 0;
  target.pcSpent = 0;
  target.passChance = null;
  target.turnProposed = null;
  return ok(next);
}

function handlePublicAddress(state: GameState): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Addresses are made during the agenda.');
  if (state.politicalCapital < PC_COSTS.publicAddress) {
    return reject(state, 'Not enough political capital for an address.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.publicAddress);

  const effect =
    PUBLIC_ADDRESS_APPROVAL * Math.pow(PUBLIC_ADDRESS_DIMINISH, next.addressesThisTerm);
  next.addressesThisTerm += 1;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.publicAddress,
    cause: 'Public address',
    unit: 'PC',
  });
  applyEffects(
    next,
    { approval: effect },
    next.addressesThisTerm > 1
      ? `Public address (${next.addressesThisTerm} this term — the country is tiring of them)`
      : 'Public address',
    entries,
  );
  return ok(next);
}

function handleConcession(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Concessions are made during the agenda.');
  const partner = state.parties.find((p) => p.id === partyId && p.inCoalition && !p.isPlayer);
  if (!partner) return reject(state, 'That party is not a coalition partner.');
  if (state.politicalCapital < PC_COSTS.coalitionConcession) {
    return reject(state, 'Not enough political capital for a concession.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.coalitionConcession);
  const target = next.parties.find((p) => p.id === partyId) as Party;
  target.coalitionMood = clampMood((target.coalitionMood ?? MOOD_START) + MOOD_CONCESSION_GAIN);

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.coalitionConcession,
    cause: `Concession to ${target.name}`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'coalition',
    label: `${target.name} mood`,
    delta: MOOD_CONCESSION_GAIN,
    cause: 'Policy concession granted at the coalition committee',
    unit: 'pts',
  });
  return ok(next);
}

function handleReshuffle(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Reshuffles happen during the agenda.');
  const partner = state.parties.find((p) => p.id === partyId && p.inCoalition && !p.isPlayer);
  if (!partner) return reject(state, 'That party is not a coalition partner.');
  if (state.politicalCapital < PC_COSTS.reshuffleCabinet) {
    return reject(state, 'Not enough political capital to reshuffle.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.reshuffleCabinet);
  const target = next.parties.find((p) => p.id === partyId) as Party;
  target.cabinetPosts += 1;
  target.coalitionMood = clampMood((target.coalitionMood ?? MOOD_START) + MOOD_RESHUFFLE_GAIN);

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.reshuffleCabinet,
    cause: `Cabinet reshuffle favouring ${target.name}`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'coalition',
    label: `${target.name} mood`,
    delta: MOOD_RESHUFFLE_GAIN,
    cause: `Given an additional cabinet post (now holds ${target.cabinetPosts})`,
    unit: 'pts',
  });
  return ok(next);
}

function handleEmergencyBudget(state: GameState): IntentResult {
  if (canEditBudget(state)) return reject(state, 'The budget is already open this turn.');
  if (state.politicalCapital < PC_COSTS.emergencyBudget) {
    return reject(state, 'Not enough political capital for an emergency budget.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.emergencyBudget);
  next.budgetUnlocked = true;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.emergencyBudget,
    cause: 'Emergency budget called outside the normal cycle',
    unit: 'PC',
  });
  return ok(next);
}

function handleSetFunding(
  state: GameState,
  sectorKey: SectorKey,
  amount: number,
): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'Funding is set in the budget phase.');
  if (!canEditBudget(state)) {
    return reject(state, 'The budget is fixed this turn. Call an emergency budget to reopen it.');
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 120) {
    return reject(state, 'Funding must be between ₡0bn and ₡120bn per turn.');
  }

  const next = clone(state);
  const sector = findSector(next.sectors, sectorKey);
  sector.funding = Math.round(amount * 10) / 10;
  return ok(next);
}

function handleEarlyElection(state: GameState): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'An election is called during the agenda.');
  if (state.politicalCapital < PC_COSTS.callEarlyElection) {
    return reject(state, 'Not enough political capital to call an election.');
  }
  const next = clone(state);
  spendPc(next, PC_COSTS.callEarlyElection);
  return ok(runElection(next));
}

function handleRetire(state: GameState): IntentResult {
  const next = clone(state);
  next.status = 'retired';
  next.phase = 'career_summary';
  return ok(next);
}

function handleCampaignStop(state: GameState, regionId: string): IntentResult {
  if (state.phase !== 'agenda' || !isCampaignTurn(state.turnNumber)) {
    return reject(state, 'Campaign stops are only available during the campaign.');
  }
  if (state.politicalCapital < PC_COSTS.campaignStop) {
    return reject(state, 'Not enough political capital for a campaign stop.');
  }
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.campaignStop);
  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += CAMPAIGN_STOP_INVESTMENT;
  if (next.campaign) next.campaign.stopsMade += 1;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS.campaignStop,
    cause: `Campaign stop in ${target.name}`,
    unit: 'PC',
  });
  return ok(next);
}

function handleAdBuy(state: GameState, regionId: string): IntentResult {
  if (state.phase !== 'agenda' || !isCampaignTurn(state.turnNumber)) {
    return reject(state, 'Advertising is only available during the campaign.');
  }
  if (state.politicalCapital < PC_COSTS.adBuy) {
    return reject(state, 'Not enough political capital for an advertising push.');
  }
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');

  /*
   * Paid for out of PARTY funds, not the national treasury. A governing party
   * billing the state for its own election advertising would be a scandal,
   * not a strategy — and it is the reason the party needs money of its own.
   */
  if (state.partyInternals.funds < AD_BUY_PARTY_COST) {
    return reject(state, `The party has only ₡${state.partyInternals.funds.toFixed(1)}m left. Raise more before buying advertising.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.adBuy);
  next.partyInternals.funds -= AD_BUY_PARTY_COST;
  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += AD_BUY_INVESTMENT;
  if (next.campaign) next.campaign.adBuys += 1;

  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: -AD_BUY_PARTY_COST,
    cause: `Advertising in ${target.name}, paid for by the party`,
    unit: '₡m',
  });
  return ok(next);
}

function handleDebate(
  state: GameState,
  debateId: string,
  choiceIndex: number,
): IntentResult {
  if (!state.campaign) return reject(state, 'There is no campaign under way.');
  const debate = state.campaign.debates.find((d) => d.id === debateId);
  if (!debate) return reject(state, 'No such debate.');
  if (debate.chosenIndex !== null) return reject(state, 'That exchange is already answered.');
  const response = debate.responses[choiceIndex];
  if (!response) return reject(state, 'No such response.');

  const next = clone(state);
  const entries = currentLog(next);
  const target = next.campaign!.debates.find((d) => d.id === debateId)!;

  /* Quality is derived from the state of the run, not from a die roll. */
  const swing = (response.quality - 0.5) * 2 * DEBATE_SWING_PER_WIN;
  target.chosenIndex = choiceIndex;
  target.swing = swing;
  next.campaign!.debateSwing += swing;

  log(entries, {
    kind: 'note',
    label: 'Debate exchange',
    delta: swing * 100,
    cause: `${response.label} — national support moved ${swing >= 0 ? 'up' : 'down'} ${Math.abs(swing * 100).toFixed(1)}%`,
    unit: '%',
  });
  return ok(next);
}


/**
 * Redraw a region's boundaries in your own favour.
 *
 * Legal in Verdana, and never free. The map gets more distorted each time, and
 * the approval penalty scales with total distortion — the first redraw is
 * barely noticed, the fourth is a scandal. Only meaningful under systems that
 * use single-member seats; proportional counting ignores boundaries entirely.
 */
function handleRedraw(state: GameState, regionId: string): IntentResult {
  if (state.phase !== 'agenda') {
    return reject(state, 'Boundary reviews are commissioned during the agenda.');
  }
  if (state.electoralSystem === 'proportional') {
    return reject(
      state,
      'Boundaries do not decide anything under proportional counting. There is nothing to gain.',
    );
  }
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');

  const inRegion = state.districts.filter((d) => d.regionId === regionId);
  if (inRegion.length < 2) {
    return reject(state, 'That region has too few seats for boundaries to matter.');
  }
  if (state.politicalCapital < PC_REDRAW_BOUNDARIES) {
    return reject(state, 'Not enough political capital to commission a boundary review.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_REDRAW_BOUNDARIES);

  const player = playerParty(next.parties);
  const target = next.districts.filter((d) => d.regionId === regionId);
  const result = redrawBoundaries(target, player.ideology, 0.6);

  next.districts = next.districts.map(
    (district) => result.districts.find((d) => d.id === district.id) ?? district,
  );

  /* The cost rises with how far the map has already been bent. */
  const distortion = meanDistortion(next.districts.filter((d) => d.regionId === regionId));
  const penalty = -REDRAW_APPROVAL_PENALTY * distortion;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_REDRAW_BOUNDARIES,
    cause: `Boundary review commissioned in ${region.name}`,
    unit: 'PC',
  });
  applyEffects(
    next,
    { approval: penalty },
    `Boundaries redrawn in ${region.name} — ${result.packed.length} seat conceded, ${result.cracked.length} made competitive. The map there is now ${(distortion * 100).toFixed(0)}% distorted.`,
    entries,
  );

  return ok(next);
}


/* ------------------------- the party itself ------------------------ */

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

function requireAgenda(state: GameState, what: string): string | null {
  return state.phase === 'agenda' ? null : `${what} happen during the agenda.`;
}

/**
 * Address your own members. Shores up the leadership at the cost of time you
 * could have spent on the country.
 */
function handleRallyParty(state: GameState): IntentResult {
  const wrong = requireAgenda(state, 'Party addresses');
  if (wrong) return reject(state, wrong);
  if (state.politicalCapital < PC_COSTS_PARTY.rallyParty) {
    return reject(state, 'Not enough political capital to address the party.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.rallyParty);

  next.partyInternals.authority = clamp100(next.partyInternals.authority + 7);
  next.partyInternals.factions = next.partyInternals.factions.map((faction) => ({
    ...faction,
    loyalty: clamp100(faction.loyalty + 5),
  }));

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.rallyParty,
    cause: 'Addressed the party membership',
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Your authority in the party',
    delta: 7,
    cause: 'A direct appeal to the membership over the heads of the factions',
    unit: 'pts',
  });
  return ok(next);
}

/** Raise money for the party. Not for the treasury — this is the party's own. */
function handleFundraising(state: GameState): IntentResult {
  const wrong = requireAgenda(state, 'Fundraising drives');
  if (wrong) return reject(state, wrong);
  if (state.politicalCapital < PC_COSTS_PARTY.fundraisingDrive) {
    return reject(state, 'Not enough political capital for a fundraising drive.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.fundraisingDrive);

  /* Donors give more to a party that looks like winning. */
  const yieldAmount = FUNDRAISING_DRIVE_YIELD * (0.6 + next.approval / 100);
  next.partyInternals.funds += yieldAmount;

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.fundraisingDrive,
    cause: 'Fundraising drive',
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: yieldAmount,
    cause: `Fundraising drive at ${Math.round(next.approval)}% approval — donors give more to a party that looks like winning`,
    unit: '₡m',
  });
  return ok(next);
}

/**
 * Give a faction the deputy leadership. Buys that wing's loyalty outright and
 * tells every other wing exactly where they stand.
 */
function handleAppointDeputy(state: GameState, factionId: string): IntentResult {
  const wrong = requireAgenda(state, 'Appointments');
  if (wrong) return reject(state, wrong);
  const faction = state.partyInternals.factions.find((f) => f.id === factionId);
  if (!faction) return reject(state, 'No such faction.');
  if (state.partyInternals.deputyFactionId === factionId) {
    return reject(state, 'They already hold the deputy leadership.');
  }
  if (state.politicalCapital < PC_COSTS_PARTY.appointDeputy) {
    return reject(state, 'Not enough political capital to reshape the leadership.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.appointDeputy);

  const previous = next.partyInternals.deputyFactionId;
  next.partyInternals.deputyFactionId = factionId;
  next.partyInternals.factions = next.partyInternals.factions.map((f) => {
    if (f.id === factionId) return { ...f, loyalty: clamp100(f.loyalty + 14) };
    /* Passing anyone over is noticed, and the outgoing deputy notices most. */
    const slight = f.id === previous ? 12 : 4;
    return { ...f, loyalty: clamp100(f.loyalty - slight) };
  });

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.appointDeputy,
    cause: `${faction.name} given the deputy leadership`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Deputy leadership',
    delta: null,
    cause: `${faction.name} take the deputy leadership. Every other wing has been passed over and knows it.`,
  });
  return ok(next);
}

/**
 * Discipline a rebellious wing. Restores order and earns their resentment —
 * exactly the trade a chief whip makes.
 */
function handleDiscipline(state: GameState, factionId: string): IntentResult {
  const wrong = requireAgenda(state, 'Disciplinary actions');
  if (wrong) return reject(state, wrong);
  const faction = state.partyInternals.factions.find((f) => f.id === factionId);
  if (!faction) return reject(state, 'No such faction.');
  if (state.politicalCapital < PC_COSTS_PARTY.disciplineRebels) {
    return reject(state, 'Not enough political capital to move against them.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.disciplineRebels);

  next.partyInternals.cohesion = clamp100(next.partyInternals.cohesion + 12);
  next.partyInternals.factions = next.partyInternals.factions.map((f) =>
    f.id === factionId
      ? { ...f, loyalty: clamp100(f.loyalty - 15), rebelling: false }
      : { ...f, loyalty: clamp100(f.loyalty + 2) },
  );

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PARTY.disciplineRebels,
    cause: `Whip withdrawn from ${faction.name}`,
    unit: 'PC',
  });
  log(entries, {
    kind: 'note',
    label: 'Party discipline',
    delta: 12,
    cause: `${faction.name} brought to heel. The rest of the party has taken the point; that wing has taken it differently.`,
    unit: 'pts',
  });
  return ok(next);
}

/** Invest party money in the machine that raises party money. */
function handleHeadquarters(state: GameState): IntentResult {
  const wrong = requireAgenda(state, 'Party investments');
  if (wrong) return reject(state, wrong);
  if (state.politicalCapital < PC_COSTS_PARTY.investHeadquarters) {
    return reject(state, 'Not enough political capital.');
  }
  if (state.partyInternals.funds < HEADQUARTERS_COST) {
    return reject(state, `The party cannot afford ₡${HEADQUARTERS_COST}m for that.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PARTY.investHeadquarters);
  next.partyInternals.funds -= HEADQUARTERS_COST;
  next.partyInternals.headquarters += 1;

  log(entries, {
    kind: 'note',
    label: 'Party funds',
    delta: -HEADQUARTERS_COST,
    cause: `Headquarters and staff expanded to level ${next.partyInternals.headquarters} — better fundraising, and higher running costs`,
    unit: '₡m',
  });
  return ok(next);
}

function handleRenameParty(state: GameState, name: string): IntentResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return reject(state, 'A party needs a name.');
  if (trimmed.length > 40) return reject(state, 'That name is too long.');

  const next = clone(state);
  const player = playerParty(next.parties);
  player.name = trimmed;
  player.shortName = trimmed.split(' ')[0] ?? trimmed;
  return ok(next);
}


/* --------------------------- procedure ---------------------------- */

/** A bill on the order paper this turn, or a rejection explaining why not. */
function tabledBill(state: GameState, billId: string): Bill | string {
  if (state.phase !== 'agenda') return 'Procedural motions are moved during the agenda.';
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return 'No such bill.';
  if (bill.status !== 'proposed') return 'That bill is not before the house.';
  return bill;
}

/**
 * Send a bill to committee. It misses this month's division and comes back
 * better drafted, less distinctive, and harder to vote against.
 */
function handleSendToCommittee(state: GameState, billId: string): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (state.politicalCapital < PC_COSTS_PROCEDURE.sendToCommittee) {
    return reject(state, 'Not enough political capital to move the referral.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.sendToCommittee);

  const target = next.bills.find((b) => b.id === billId)!;
  target.status = 'in_committee';
  target.committeeReturnsOn = next.turnNumber + 1;

  log(entries, {
    kind: 'legislature',
    label: `${target.title} referred to committee`,
    delta: -PC_COSTS_PROCEDURE.sendToCommittee,
    cause: `It will miss this month's division and return next month, better drafted and less contentious.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Amend a bill toward a wing of your own party or a coalition partner.
 *
 * Moves its position toward theirs, which buys their votes — and waters the
 * effects down, which is what an amendment costs. A bill amended three times
 * passes easily and barely does anything.
 */
function handleAmendBill(
  state: GameState,
  billId: string,
  towardFactionId?: string,
  towardPartyId?: string,
): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (state.politicalCapital < PC_COSTS_PROCEDURE.amendBill) {
    return reject(state, 'Not enough political capital to move the amendment.');
  }

  const faction = towardFactionId
    ? state.partyInternals.factions.find((f) => f.id === towardFactionId)
    : undefined;
  const party = towardPartyId
    ? state.parties.find((p) => p.id === towardPartyId && !p.isPlayer)
    : undefined;

  const target = faction?.ideology ?? party?.ideology;
  const towardName = faction?.name ?? party?.name;
  if (!target || !towardName) {
    return reject(state, 'Name the faction or partner the amendment is meant to satisfy.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.amendBill);

  const bill = next.bills.find((b) => b.id === billId)!;
  bill.ideology = {
    economic: bill.ideology.economic + (target.economic - bill.ideology.economic) * AMENDMENT_STRENGTH,
    social: bill.ideology.social + (target.social - bill.ideology.social) * AMENDMENT_STRENGTH,
    environmental:
      bill.ideology.environmental +
      (target.environmental - bill.ideology.environmental) * AMENDMENT_STRENGTH,
  };

  /* Every concession takes something out of the bill. */
  const keep = 1 - AMENDMENT_DILUTION;
  const scale = (value?: number) => (value === undefined ? undefined : value * keep);
  bill.effects = {
    ...bill.effects,
    approval: scale(bill.effects.approval),
    treasury: scale(bill.effects.treasury),
    debt: scale(bill.effects.debt),
    revenueDelta: scale(bill.effects.revenueDelta),
    politicalCapital: scale(bill.effects.politicalCapital),
    sectorDeltas: bill.effects.sectorDeltas
      ? Object.fromEntries(
          Object.entries(bill.effects.sectorDeltas).map(([k, v]) => [k, (v ?? 0) * keep]),
        )
      : undefined,
    fundingDeltas: bill.effects.fundingDeltas
      ? Object.fromEntries(
          Object.entries(bill.effects.fundingDeltas).map(([k, v]) => [k, (v ?? 0) * keep]),
        )
      : undefined,
  };
  bill.amendments += 1;

  log(entries, {
    kind: 'legislature',
    label: `${bill.title} amended`,
    delta: -PC_COSTS_PROCEDURE.amendBill,
    cause: `Moved toward ${towardName} to secure their votes. The bill now does ${(Math.pow(keep, bill.amendments) * 100).toFixed(0)}% of what it originally would have.`,
    unit: 'PC',
  });
  return ok(next);
}

/** Buy a crossbench senator's vote on one bill. */
function handleCrossbenchDeal(state: GameState, billId: string): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (isMoneyBill(found)) {
    return reject(state, 'A money bill does not go to the Senate. There is nothing to buy.');
  }
  if (state.politicalCapital < PC_COSTS_PROCEDURE.crossbenchDeal) {
    return reject(state, 'Not enough political capital for a crossbench arrangement.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.crossbenchDeal);

  const bill = next.bills.find((b) => b.id === billId)!;
  bill.crossbenchDeals += 1;

  log(entries, {
    kind: 'legislature',
    label: `Crossbench arrangement on ${bill.title}`,
    delta: -PC_COSTS_PROCEDURE.crossbenchDeal,
    cause: `Independent senators secured for the division — worth roughly ${(CROSSBENCH_SENATE_BONUS * 100).toFixed(0)}% on its chances in the upper house.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Close debate on a bill the opposition is talking out. Expensive, and it
 * costs you something with anyone who thinks the chamber should be allowed to
 * do its job.
 */
function handleCloseDebate(state: GameState, billId: string): IntentResult {
  const found = tabledBill(state, billId);
  if (typeof found === 'string') return reject(state, found);
  if (state.politicalCapital < PC_COSTS_PROCEDURE.closeDebate) {
    return reject(state, 'Not enough political capital to close debate.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.closeDebate);

  const bill = next.bills.find((b) => b.id === billId)!;
  bill.committeeBonus += 0.1;

  log(entries, {
    kind: 'legislature',
    label: `Debate closed on ${bill.title}`,
    delta: -PC_COSTS_PROCEDURE.closeDebate,
    cause: 'The guillotine was moved and carried. The bill reaches a vote; the opposition has its grievance.',
    unit: 'PC',
  });
  applyEffects(next, { approval: -1.2 }, `Closure motion on ${bill.title}`, entries);
  return ok(next);
}

/**
 * Face the chamber at question time.
 *
 * How it goes depends on the record you actually have. A government with
 * something to show for itself does well; one without is simply handing the
 * opposition a stage.
 */
function handleQuestionTime(state: GameState): IntentResult {
  if (state.phase !== 'agenda') {
    return reject(state, 'Question time is taken during the agenda.');
  }
  if (state.politicalCapital < PC_COSTS_PROCEDURE.questionTime) {
    return reject(state, 'Not enough political capital to prepare properly.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_PROCEDURE.questionTime);

  /* Preparation plus a record to point at. Neither alone is enough. */
  const record = Math.min(1, next.career.billsPassed / 8);
  const standing = next.approval / 100;
  const authority = next.partyInternals.authority / 100;
  const performance = record * 0.4 + standing * 0.35 + authority * 0.25;

  const approvalSwing = (performance - 0.45) * 5;
  const authoritySwing = (performance - 0.45) * 8;

  next.partyInternals.authority = Math.max(
    0,
    Math.min(100, next.partyInternals.authority + authoritySwing),
  );

  log(entries, {
    kind: 'political_capital',
    label: 'Political capital',
    delta: -PC_COSTS_PROCEDURE.questionTime,
    cause: 'Question time',
    unit: 'PC',
  });
  applyEffects(
    next,
    { approval: approvalSwing },
    performance > 0.6
      ? 'Question time — you had a record to point at and pointed at it'
      : performance > 0.42
        ? 'Question time — a competent, forgettable performance'
        : 'Question time — the opposition had the better of it, because the figures were on their side',
    entries,
  );
  log(entries, {
    kind: 'note',
    label: 'Your authority in the party',
    delta: authoritySwing,
    cause: 'Your own benches watched how that went',
    unit: 'pts',
  });
  return ok(next);
}

/* ---------------------- coalition negotiation --------------------- */

function handleNegotiationAccept(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }
  if (state.negotiation.accepted.includes(partyId)) {
    return reject(state, 'That party is already in the provisional agreement.');
  }
  const demand = state.negotiation.candidates.find((c) => c.partyId === partyId);
  if (!demand) return reject(state, 'That party is not at the table.');

  const next = clone(state);
  next.negotiation!.accepted.push(partyId);
  return ok(next);
}

function handleNegotiationRemove(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }
  const next = clone(state);
  next.negotiation!.accepted = next.negotiation!.accepted.filter((id) => id !== partyId);
  return ok(next);
}

function handleNegotiationCounter(state: GameState, partyId: string): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }
  if (state.politicalCapital < COUNTER_OFFER_PC_COST) {
    return reject(state, 'Not enough political capital to counter-offer.');
  }
  const index = state.negotiation.candidates.findIndex((c) => c.partyId === partyId);
  if (index < 0) return reject(state, 'That party is not at the table.');
  if (state.negotiation.candidates[index]!.concessionsWon >= 0.85) {
    return reject(state, 'They will not move any further.');
  }

  const next = clone(state);
  spendPc(next, COUNTER_OFFER_PC_COST);
  next.negotiation!.candidates[index] = applyCounterOffer(
    next.negotiation!.candidates[index]!,
  );
  return ok(next);
}

function handleFormGovernment(state: GameState): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }

  const next = clone(state);
  const negotiation = next.negotiation!;
  const entries = currentLog(next);

  /* Bind the accepted partners into the government. */
  for (const partyId of negotiation.accepted) {
    const party = next.parties.find((p) => p.id === partyId);
    const demand = negotiation.candidates.find((c) => c.partyId === partyId);
    if (!party || !demand) continue;
    party.inCoalition = true;
    party.coalitionMood = MOOD_START;
    party.cabinetPosts = demand.cabinetPosts;
    party.cabinetDemand = demand.cabinetPosts;
    party.redLines = demand.redLines;

    /* Honouring the sector floor is a commitment, so fund it on day one. */
    const sector = findSector(next.sectors, demand.sectorFloor.sector);
    if (sector.funding < demand.sectorFloor.amount) {
      sector.funding = demand.sectorFloor.amount;
    }
  }

  if (!hasMajority(next.parties)) {
    /* The agreement does not command the chamber. */
    negotiation.attempt += 1;

    for (const partyId of negotiation.accepted) {
      const party = next.parties.find((p) => p.id === partyId);
      if (!party) continue;
      party.inCoalition = false;
      party.coalitionMood = null;
      party.cabinetPosts = 0;
      party.redLines = [];
    }

    if (negotiation.attempt > COALITION_MAX_ATTEMPTS) {
      /* Three failures force a fresh election, and the instability costs. */
      next.approval = clampApproval(next.approval + COALITION_FAILURE_APPROVAL_PENALTY);
      log(entries, {
        kind: 'approval',
        label: 'Approval',
        delta: COALITION_FAILURE_APPROVAL_PENALTY,
        cause: 'Three failed attempts to form a government. The country goes back to the polls.',
        unit: 'pts',
      });

      if (negotiation.failed) {
        /* A second consecutive failure ends the run. */
        return ok(
          endRun(
            next,
            negotiation.crisis,
            'No government could be formed after two general elections. Another party has been invited to try.',
          ),
        );
      }

      const afterElection = runElection(next);
      afterElection.negotiation = {
        ...buildNegotiation(afterElection.parties, 1, negotiation.crisis),
        failed: true,
      };
      return ok(afterElection);
    }

    negotiation.accepted = [];
    log(entries, {
      kind: 'coalition',
      label: `Attempt ${negotiation.attempt - 1} failed`,
      delta: null,
      cause:
        'The proposed agreement did not command a majority of the chamber. The parties return to the table.',
    });
    /*
     * Deliberately not an error: the attempt was legal and it consumed one of
     * the three the player gets. Returning it as a rejection would let a
     * well-behaved caller discard the incremented counter.
     */
    return ok(next);
  }

  next.negotiation = null;
  next.phase = 'briefing';
  return ok(beginTurn(next));
}

/**
 * Govern in a minority — but only if entitled to.
 *
 * Carrying on without a majority is legitimate for the largest party in the
 * chamber. It is not available to anyone else: if another party is larger,
 * they are invited to form a government and the player goes into opposition.
 * Without this the run could never be lost, because walking away from every
 * negotiation would always leave the player in office.
 */
function handleAbandonNegotiation(state: GameState): IntentResult {
  if (state.phase !== 'coalition' || !state.negotiation) {
    return reject(state, 'There is no negotiation under way.');
  }

  if (!playerIsLargestParty(state.parties)) {
    const largest = [...state.parties].sort((a, b) => b.seats - a.seats)[0];
    return ok(
      endRun(
        state,
        state.negotiation.crisis,
        `Without an agreement, ${largest?.name ?? 'the largest party'} commands more seats and has been invited to form a government.`,
      ),
    );
  }

  const next = clone(state);
  const entries = currentLog(next);
  next.negotiation = null;
  log(entries, {
    kind: 'note',
    label: 'Minority government',
    delta: null,
    cause:
      'No coalition agreement was signed. The government will have to find its majority vote by vote.',
  });
  return ok(beginTurn(next));
}
