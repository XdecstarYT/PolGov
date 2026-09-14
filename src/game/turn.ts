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
  AD_BUY_TREASURY_COST,
  CAMPAIGN_STOP_INVESTMENT,
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

  for (const bill of tabled) {
    const breakdown = computePassChance(bill, next.parties, next.sectors, bill.whipSteps);
    bill.passChance = breakdown.chance;
    const passed = resolveBillVote(rng, breakdown.chance);
    bill.status = passed ? 'passed' : 'failed';
    bill.turnResolved = next.turnNumber;

    if (passed) {
      next.career.billsPassed += 1;
      log(entries, {
        kind: 'legislature',
        label: bill.title,
        delta: null,
        cause: `Division passed at ${(breakdown.chance * 100).toFixed(0)}% projected — ${breakdown.supportingSeats} of ${breakdown.totalSeats} seats behind it.`,
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
    } else {
      next.career.billsFailed += 1;
      log(entries, {
        kind: 'legislature',
        label: bill.title,
        delta: null,
        cause: `Division failed at ${(breakdown.chance * 100).toFixed(0)}% projected — ${breakdown.supportingSeats} of ${breakdown.totalSeats} seats behind it${breakdown.defectingSeats > 0 ? `, with ${breakdown.defectingSeats} partner seats withheld over a red line` : ''}.`,
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
  const player = playerParty(next.parties);
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

  const result = simulateElection(
    next.parties,
    next.regions,
    next.approval,
    next.campaign,
    next.termNumber,
    rng,
  );

  for (const party of next.parties) {
    party.seats = result.seatsByParty[party.id] ?? 0;
    party.inCoalition = party.isPlayer;
    party.coalitionMood = null;
    party.cabinetPosts = 0;
    party.redLines = [];
  }

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
  target.passChance = computePassChance(target, next.parties, next.sectors, steps).chance;

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

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS.adBuy);
  next.treasury -= AD_BUY_TREASURY_COST;
  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += AD_BUY_INVESTMENT;
  if (next.campaign) next.campaign.adBuys += 1;

  log(entries, {
    kind: 'treasury',
    label: 'Treasury',
    delta: -AD_BUY_TREASURY_COST,
    cause: `Advertising in ${target.name}`,
    unit: '₡bn',
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
