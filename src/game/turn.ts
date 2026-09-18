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
  PC_COSTS_POLICY,
  PC_COSTS_MEDIA,
  RALLY_COST,
  TOWN_HALL_COST,
  MANIFESTO_SIZE,
  SUNSET_DEFAULT_TURNS,
  FUNDRAISING_DRIVE_YIELD,
  HEADQUARTERS_COST,
  AD_BUY_PARTY_COST,
} from './balance.ts';
import { generateNews, fallbackDebateAttack } from './content/news.ts';
import { Rng } from './rng.ts';
import type {
  Bill,
  FiscalRuleKind,
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
  averageSectorHealth,
  driftSectorHealth,
  fiscalImpulse,
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
  decreeEffects,
  executiveOrderCost,
  implementationDelay,
  judgePromises,
  reverseEffects,
  runReferendum,
  sunsetTurn,
} from './systems/policy.ts';
import { computeIssueScores } from './systems/electorate.ts';
import {
  describeCycle,
  economyIssueScore,
  productivityTarget,
  stepEconomy,
} from './systems/economy.ts';
import {
  CREDIT_RATINGS,
  FISCAL_RULE_PC_COST,
  FISCAL_RULE_REPEAL_PC_COST,
  INFLATION_TARGET,
  RATING_REVIEW_MONTHS,
  RESERVE_CONTRIBUTION_MAX,
  RESERVE_CONTRIBUTION_PC_COST,
  MAINTENANCE_LEVEL_MAX,
  MAX_ACTIVE_PROJECTS,
  PROJECT_PC_COST,
  REGIONAL_JOBS_WEIGHT,
  TAX_CHANGE_PC_COST,
} from './balance.ts';
import {
  canStartProject,
  commission,
  findInfrastructure,
  industryEffects,
  infrastructureSpend,
  sectorEffects,
  stepInfrastructure,
  totalBacklog,
  type InfrastructureKey,
} from './systems/infrastructure.ts';
import {
  apportionSeats,
  isApportionmentDue,
  skillsDrag,
  stepDemography,
  workforceGrowth,
} from './systems/demography.ts';
import {
  employmentGap,
  findIndustry,
  industryPressure,
  regionalEmployment,
  stepIndustries,
} from './systems/industry.ts';
import {
  findTaxTemplate,
  forgetOldChanges,
  recordChange,
  taxEffects,
  type TaxKey,
} from './systems/taxation.ts';
import {
  FISCAL_RULE_LABELS,
  averageCoupon,
  borrowingCost,
  breachApprovalCost,
  regionalSwing,
  rulesInBreach,
  stepPublicFinance,
} from './systems/publicFinance.ts';
import {
  applyChannelPush,
  availableVolunteerPushes,
  conductPoll,
  decayReach,
  persuasionBySegment,
  trueNationalShares,
  turnoutBySegment,
  computeSwing,
  exitPoll,
  recountCandidates,
  type PollQuality,
} from './systems/media.ts';
import { channelTemplate, type ChannelKey } from './content/channels.ts';
import { REFERENDUM_TEMPLATES } from './content/referendums.ts';
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
  | { type: 'set_maintenance'; level: number }
  | { type: 'start_project'; asset: InfrastructureKey; units: number }
  | { type: 'cancel_project'; projectId: string }
  | { type: 'set_tax_rate'; tax: TaxKey; rate: number }
  | { type: 'set_tax_dial'; dial: 'progressivity' | 'deductions' | 'credits'; value: number }
  | { type: 'adopt_fiscal_rule'; kind: FiscalRuleKind; threshold: number }
  | { type: 'repeal_fiscal_rule'; kind: FiscalRuleKind }
  | { type: 'set_reserve_contribution'; amount: number }
  | { type: 'draw_emergency_fund'; amount: number }
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
  | { type: 'repeal_bill'; billId: string }
  | { type: 'renew_sunset'; billId: string }
  | { type: 'executive_order'; billId: string }
  | { type: 'call_referendum'; questionId: string }
  | { type: 'set_manifesto'; billKeys: string[] }
  | { type: 'campaign_push'; channel: ChannelKey }
  | { type: 'commission_poll'; quality: PollQuality }
  | { type: 'hold_rally'; regionId: string }
  | { type: 'town_hall'; regionId: string }
  | { type: 'press_conference' }
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

  /* Campaigning fades. A push in month nine is worth little by month twelve. */
  if (next.campaign) {
    next.campaign.reach = decayReach(next.campaign.reach);
  }

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
    next.campaign = {
      stopsMade: 0,
      adBuys: 0,
      debates: [],
      debateSwing: 0,
      reach: {},
      channelPushes: {},
      volunteerPushesUsed: 0,
      polls: [],
      rallies: 0,
      townHalls: 0,
    };
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
      /*
       * Nothing arrives the month it passes. The effects are scheduled, and
       * land later — which is the quiet tragedy of a twelve-month term: the
       * things worth doing take effect after the election that decides
       * whether you were right to do them.
       */
      const delay = implementationDelay(bill);
      bill.takesEffectOn = next.turnNumber + delay;
      bill.inEffect = false;
      bill.lapsesOn = sunsetTurn(bill, next.turnNumber);

      log(entries, {
        kind: 'legislature',
        label: `${bill.title} — implementation`,
        delta: delay,
        cause: `Enacted. It will begin to be felt in ${delay} month${delay === 1 ? '' : 's'}.${bill.lapsesOn ? ` Lapses on month ${bill.lapsesOn} unless renewed.` : ''}`,
        unit: 'months',
      });

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

  /* Laws passed earlier now begin to bite. */
  for (const bill of next.bills) {
    if (bill.status !== 'passed' || bill.inEffect) continue;
    if (bill.takesEffectOn !== null && (bill.takesEffectOn ?? 0) > next.turnNumber) continue;
    bill.inEffect = true;
    applyEffects(
      next,
      bill.effects,
      `${bill.title} takes effect${bill.turnResolved !== null ? ` (enacted month ${bill.turnResolved})` : ''}`,
      entries,
    );
  }

  /* Laws with a sunset clause lapse unless they were renewed. */
  for (const bill of next.bills) {
    if (bill.status !== 'passed' || !bill.inEffect) continue;
    if (bill.lapsesOn === null || bill.lapsesOn === undefined) continue;
    if (bill.lapsesOn > next.turnNumber) continue;

    bill.status = 'available';
    bill.inEffect = false;
    bill.lapsesOn = null;
    bill.takesEffectOn = null;
    applyEffects(
      next,
      reverseEffects(bill.effects),
      `${bill.title} lapsed under its sunset clause and was not renewed`,
      entries,
    );
  }

  /*
   * Sector drift toward the equilibrium implied by funding — plus whatever
   * the tax code is doing to it. A carbon price that raises almost no money
   * because nobody is emitting any more is not a failed tax; it is a tax
   * that worked, and this is where that shows up.
   */
  const fromTax = taxEffects(next.taxes).sectors;
  const fromAssets = sectorEffects(next.infrastructure, next.demography.population);
  for (const sector of next.sectors) {
    const before = sector.health;
    const nudge = (fromTax[sector.key] ?? 0) + (fromAssets[sector.key] ?? 0);
    sector.health = driftSectorHealth(
      sector.key,
      sector.health,
      sector.funding,
      next.difficulty,
      nudge,
    );
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

  /* Public finances, priced off the economy as it stands this month. */
  const fiscal = resolveFiscalTurn(
    next.sectors,
    next.economy,
    next.revenueModifier,
    next.debt,
    next.finance.bonds,
    next.taxes,
    /* Keeping what exists, and building what does not. Both are spending,
       and the first is the one nobody notices being cut. */
    infrastructureSpend(next.infrastructure),
  );
  next.treasury += fiscal.treasuryDelta;
  next.debt = Math.max(0, next.debt + fiscal.debtDelta);

  log(entries, {
    kind: 'treasury',
    label: 'Revenue',
    delta: fiscal.revenue,
    cause:
      `Every instrument at its current rate, on ₡${Math.round(next.economy.gdp)}bn of output`,
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
    cause:
      `Coupons on ₡${Math.round(next.debt)}bn of paper, averaging ` +
      `${averageCoupon(next.finance.bonds).toFixed(2)}%`,
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

  /*
   * The infrastructure.
   *
   * Stepped first, because the condition of the hospitals is part of what
   * the health sector's health MEANS, and the capacity of the roads is part
   * of what the logistics industry can do. Everything downstream reads it.
   */
  const infraTick = stepInfrastructure(next.infrastructure);
  next.infrastructure = infraTick.infrastructure;
  for (const project of infraTick.opened) {
    const template = findInfrastructure(project.key);
    log(entries, {
      kind: 'note',
      label: `${template.name} — opened`,
      delta: 0,
      cause:
        `Commissioned in term ${project.startedTerm}, ${Math.round(
          (next.turnNumber - project.startedTurn) / 12,
        )} years ago. ${project.units} units of capacity in service.`,
      unit: '',
    });
  }
  for (const key of infraTick.newlyFailing) {
    log(entries, {
      kind: 'note',
      label: `${findInfrastructure(key).name} — failing`,
      delta: 0,
      cause:
        'Condition has fallen past the point where people notice. The work owed on it ' +
        'costs more now than it would have cost to keep up with.',
      unit: '',
    });
  }
  if (infraTick.backlogAdded > 0.05) {
    log(entries, {
      kind: 'treasury',
      label: 'Maintenance deferred',
      delta: 0,
      cause:
        `₡${infraTick.backlogAdded.toFixed(1)}bn of work not done, added to a backlog now at ` +
        `₡${totalBacklog(next.infrastructure).toFixed(0)}bn. It compounds.`,
      unit: '',
      informational: true,
    });
  }

  /*
   * The people.
   *
   * Stepped first, because the workforce it produces is the economy's speed
   * limit and the skills it produces are what several industries stand on.
   * Nothing here moves fast enough for this government to see the result of
   * its own decisions about it, which is the honest shape of the thing.
   */
  const demographyBefore = next.demography;
  {
    const services = averageSectorHealth(next.sectors);
    next.demography = stepDemography(next.demography, {
      unemployment: next.economy.unemployment,
      healthQuality: findSector(next.sectors, 'health').health,
      educationQuality: findSector(next.sectors, 'education').health,
      serviceQuality: services,
      regionalJobs: regionalEmployment(next.industries),
      turn: next.turnNumber,
    });

    /*
     * Apportionment. Once a term the seats follow the people, so a
     * government that presided over Estmoor emptying into Ternhill fights
     * the next election on a map it did not draw and may not like.
     */
    if (isApportionmentDue(next.demography, next.turnNumber)) {
      const moves = apportionSeats(next.regions, next.demography.regional);
      next.demography.lastApportionment = next.turnNumber;
      const changed = moves.filter((m) => m.after !== m.before);
      for (const move of moves) {
        const region = next.regions.find((r) => r.id === move.regionId);
        if (region) region.seats = move.after;
      }
      if (changed.length > 0) {
        log(entries, {
          kind: 'note',
          label: 'Seats redistributed',
          delta: 0,
          cause: changed
            .map((m) => {
              const name = next.regions.find((r) => r.id === m.regionId)?.name ?? m.regionId;
              return `${name} ${m.after > m.before ? '+' : '−'}${Math.abs(m.after - m.before)}`;
            })
            .join(', ') + '. The boundary commission has caught up with where people now live.',
          unit: '',
        });
      }
    }
  }

  /*
   * The industries.
   *
   * Stepped before the finances and the economy, because what the industries
   * are doing is what the economy is: the aggregate below is a correction to
   * output, not a second opinion about it. They move slowly, so most of what
   * happens here is the consequence of a decision taken several months ago —
   * often by somebody else.
   */
  {
    const before = next.industries;
    const drag = skillsDrag(next.demography);
    const assets = industryEffects(next.infrastructure, next.demography.population);
    next.industries = stepIndustries(
      next.industries,
      next.economy,
      next.taxes,
      next.sectors,
      drag,
      assets,
    );

    for (const industry of next.industries) {
      const was = before.find((i) => i.key === industry.key);
      if (!was) continue;
      const delta = industry.health - was.health;
      /* Only report a move worth a line. Twenty industries drifting by a
         tenth of a point each would bury everything else in the report. */
      if (Math.abs(delta) < 0.35) continue;
      const pressure = industryPressure(
        was,
        next.economy,
        next.taxes,
        next.sectors,
        drag,
        assets[industry.key],
      );
      const leading = pressure.reasons[0];
      log(entries, {
        kind: 'economy',
        label: findIndustry(industry.key).name,
        delta,
        cause: leading
          ? `${leading.label} ${leading.value >= 0 ? 'helping' : 'hurting'} it most`
          : 'Drifting toward its normal level',
        unit: 'pts',
      });
    }
  }

  /*
   * The public finances.
   *
   * Stepped before the economy, because the market prices this government's
   * paper off the month it has just had, and the rating it lands on is what
   * the next tranche is issued at. What falls due this month is refinanced
   * at today's price, whether or not today's price is one anybody planned
   * for — which is the entire reason maturities are tracked rather than
   * collapsed into a single debt figure.
   */
  {
    const tick = stepPublicFinance(next.finance, {
      debt: next.debt,
      economy: next.economy,
      monthlyBalance: fiscal.balance,
      spending: fiscal.spending,
      regions: next.regions,
      nationalRevenue: fiscal.revenue,
      newBorrowing: Math.max(0, fiscal.debtDelta),
      /* The treasury funds at five years by default: dearer than short
         paper, and it does not hand the next crisis a refinancing cliff. */
      tenor: 60,
      turn: next.turnNumber,
    });
    const beforeRating = next.finance.rating.grade;
    next.finance = tick.finance;

    if (tick.ratingMoved) {
      const worse =
        CREDIT_RATINGS.findIndex((r) => r.grade === tick.finance.rating.grade) >
        CREDIT_RATINGS.findIndex((r) => r.grade === beforeRating);
      log(entries, {
        kind: 'debt',
        label: worse ? 'Downgraded' : 'Upgraded',
        delta: 0,
        cause:
          `${beforeRating} → ${tick.finance.rating.grade}. ` +
          `${tick.finance.rating.reasons.join('. ')}. ` +
          `Every tranche issued from here carries ${tick.finance.spread.toFixed(2)} points more.`,
        unit: '',
      });
    } else if (
      next.finance.rating.pending !== next.finance.rating.grade &&
      next.finance.rating.reviewMonths > 0
    ) {
      log(entries, {
        kind: 'debt',
        label: 'On review',
        delta: 0,
        cause:
          `The agencies are ${next.finance.rating.reviewMonths} of ` +
          `${RATING_REVIEW_MONTHS} months into a review that would take you to ` +
          `${next.finance.rating.pending}. ${next.finance.rating.reasons.join('. ')}.`,
        unit: '',
      });
    }

    if (tick.matured > 0) {
      log(entries, {
        kind: 'debt',
        label: 'Refinanced',
        delta: 0,
        cause:
          `₡${Math.round(tick.matured)}bn of paper matured and was reissued at ` +
          `${borrowingCost(next.economy.policyRate, next.finance.spread, 60).toFixed(2)}%`,
        unit: '',
        informational: true,
      });
    }

    for (const kind of tick.newBreaches) {
      log(entries, {
        kind: 'note',
        label: `${FISCAL_RULE_LABELS[kind]} breached`,
        delta: 0,
        cause:
          'Your own rule, broken by your own budget. It costs approval every month it stands, ' +
          'and the credibility it bought with lenders is gone until it is kept again.',
        unit: '',
      });
    }

    /* Breaking your own fiscal rule is a political cost, not a fiscal one. */
    const breachCost = breachApprovalCost(next.finance.rules);
    if (breachCost > 0) {
      next.approval = Math.max(0, next.approval - breachCost);
      log(entries, {
        kind: 'approval',
        label: 'Fiscal rules',
        delta: -breachCost,
        cause: rulesInBreach(next.finance.rules)
          .map((r) => `${FISCAL_RULE_LABELS[r.kind]} in breach for ${r.breachMonths} months`)
          .join('; '),
        unit: 'pts',
      });
    }

    if (tick.reserveContributed > 0 || tick.reserveReturn > 0.05) {
      log(entries, {
        kind: 'treasury',
        label: 'Reserve fund',
        delta: 0,
        cause:
          `₡${Math.round(next.finance.reserveFund)}bn held` +
          (tick.reserveReturn > 0.05 ? `, earning ₡${tick.reserveReturn.toFixed(1)}bn` : '') +
          (tick.reserveContributed > 0
            ? `, paid ₡${tick.reserveContributed.toFixed(0)}bn in`
            : ''),
        unit: '',
        informational: true,
      });
    }
  }

  /*
   * The economy.
   *
   * Stepped after the fiscal result, because the deficit the government just
   * ran is the fiscal impulse the economy feels. Growth, jobs, prices and the
   * policy rate all move here, and none of them are the government's to set
   * — which is why the entries below are recorded as things that happened
   * rather than as things that were decided.
   */
  /* Voters stop being angry about a rate long before the treasury stops
     collecting it, so the memory of a change is aged out each month. */
  next.taxes = forgetOldChanges(next.taxes, next.turnNumber);

  const economyBefore = next.economy;
  next.economy = stepEconomy(next.economy, {
    fiscalImpulse: fiscalImpulse(fiscal),
    approval: next.approval,
    productivityTarget: productivityTarget(
      findSector(next.sectors, 'education').health,
      findSector(next.sectors, 'infrastructure').health,
    ),
    turn: next.turnNumber,
    /* What the shape of the tax code does, as distinct from its size. */
    taxEffects: taxEffects(next.taxes),
    /*
     * What the industries are doing to the jobs. Okun's law works off the
     * output gap alone, which cannot tell a downturn concentrated in retail
     * — a ninth of the jobs — from the same downturn in mining, which is a
     * sixtieth of them. This is that difference.
     */
    employmentGap: employmentGap(next.industries),
    /*
     * More people of working age is more the country can produce. This is
     * the second half of the speed limit, alongside productivity, and it is
     * the one no government can move inside a term.
     */
    workforceGrowth: workforceGrowth(demographyBefore, next.demography),
    /*
     * This month's weather, off the run's own seeded RNG, so a replayed turn
     * produces the identical month and the server can check it. The Treasury
     * forecast runs the same step with these set to zero, which is why the
     * forecast is always a little wrong in a way nobody could have told the
     * player in advance.
     */
    noise: { demand: rng.range(-1, 1), supply: rng.range(-1, 1) },
  });

  /*
   * The economy sector's health is no longer a dial that its own funding
   * settles: it is what the macroeconomy is actually doing. Economic
   * programme spending still matters, but through the fiscal impulse above,
   * which is a slower and more honest channel than a funding slider that
   * moved its own score.
   */
  const economySector = findSector(next.sectors, 'economy');
  economySector.health = economyIssueScore(next.economy);

  {
    const e = next.economy;
    const b = economyBefore;
    const move = (
      label: string,
      before: number,
      after: number,
      unit: string,
      cause: string,
      threshold = 0.05,
    ) => {
      if (Math.abs(after - before) < threshold) return;
      log(entries, { kind: 'economy', label, delta: after - before, cause, unit });
    };

    move('Growth', b.growth, e.growth, '%', describeCycle(e), 0.02);
    move(
      'Unemployment',
      b.unemployment,
      e.unemployment,
      'pts',
      `${e.employment.toFixed(1)}% of the workforce in work`,
      0.02,
    );
    move(
      'Inflation',
      b.inflation,
      e.inflation,
      '%',
      e.inflation > INFLATION_TARGET + 1
        ? 'Above target, and the bank will act on it'
        : e.inflation < 0
          ? 'Prices are falling'
          : 'Near target',
      0.02,
    );
    move(
      'Policy rate',
      b.policyRate,
      e.policyRate,
      '%',
      e.policyRate > b.policyRate
        ? 'The central bank tightened — your debt service rises with it'
        : 'The central bank eased',
      0.01,
    );
    if (b.phase !== e.phase && e.phase === 'recession') {
      log(entries, {
        kind: 'economy',
        label: 'Recession',
        delta: 0,
        cause: `${e.contractionRun} consecutive months of contraction. It is now called what it is.`,
        unit: '',
      });
    }
  }

  /* Approval eases toward the standing the country's condition implies. */
  const served = turnsServed(next.termNumber, next.turnNumber);
  const target = computeApprovalTarget(
    next.sectors,
    next.debt,
    served,
    next.difficulty,
    next.economy.gdp,
  );
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
    /* Channels only move the people they actually reached. */
    segmentPersuasion: next.campaign ? persuasionBySegment(next.campaign.reach) : undefined,
    segmentTurnout: next.campaign ? turnoutBySegment(next.campaign.reach) : undefined,
    /* The electorate judges the record directly, so pass it the record. */
    sectors: next.sectors,
    debt: next.debt,
    revenueModifier: next.revenueModifier,
    economy: next.economy,
    /*
     * Regional services AND regional jobs reach the ballot in the regions
     * they failed in — not as a national issue score, where they would be
     * averaged away, but as a swing in exactly those places. This is the
     * end of the chain that starts at a rate the central bank set: rates →
     * construction → Estmoor → seats.
     */
    regionalSwing: Object.fromEntries(
      next.regions.map((region) => {
        const budget = next.finance.regional.find((b) => b.regionId === region.id);
        const jobs = regionalEmployment(next.industries)[region.id] ?? 0;
        return [
          region.id,
          (budget ? regionalSwing(budget) : 0) + jobs * REGIONAL_JOBS_WEIGHT,
        ];
      }),
    ),
  });

  for (const party of next.parties) {
    party.seats = result.seatsByParty[party.id] ?? 0;
    party.inCoalition = party.isPlayer;
    party.coalitionMood = null;
    party.cabinetPosts = 0;
    party.redLines = [];
  }

  /*
   * Election-night reporting: an exit poll published before counting begins,
   * the seats close enough to turn on a recount, and the swing — the number
   * that actually explains a result, because it says who moved rather than
   * who won.
   */
  result.exitPoll = (() => {
    const sample = exitPoll(result.voteShareByParty, rng);
    return { shares: sample.shares, marginOfError: sample.marginOfError };
  })();
  result.recounts = recountCandidates(result.districtOutcomes ?? []);
  const previous = next.elections[next.elections.length - 1];
  if (previous) result.swing = computeSwing(previous.voteShareByParty, result.voteShareByParty);

  /*
   * Half the Senate faces the voters; the other half carries on. This is what
   * makes divided government normal rather than exceptional.
   */
  next.senate = renewSenate(next.senate, result.voteShareByParty);

  /* The manifesto falls due. */
  const verdict = judgePromises(next.promises, next.bills, next.termNumber);
  next.promises = verdict.updated;
  if (verdict.kept + verdict.broken > 0) {
    const entries = currentLog(next);
    applyEffects(
      next,
      { approval: verdict.approvalDelta },
      `Manifesto judged: ${verdict.kept} commitment${verdict.kept === 1 ? '' : 's'} kept, ${verdict.broken} broken`,
      entries,
    );
  }
  next.executiveOrdersThisTerm = 0;

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
    case 'set_maintenance':
      return handleSetMaintenance(state, intent.level);
    case 'start_project':
      return handleStartProject(state, intent.asset, intent.units);
    case 'cancel_project':
      return handleCancelProject(state, intent.projectId);
    case 'set_tax_rate':
      return handleSetTaxRate(state, intent.tax, intent.rate);
    case 'set_tax_dial':
      return handleSetTaxDial(state, intent.dial, intent.value);
    case 'adopt_fiscal_rule':
      return handleAdoptFiscalRule(state, intent.kind, intent.threshold);
    case 'repeal_fiscal_rule':
      return handleRepealFiscalRule(state, intent.kind);
    case 'set_reserve_contribution':
      return handleReserveContribution(state, intent.amount);
    case 'draw_emergency_fund':
      return handleDrawEmergencyFund(state, intent.amount);
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
    case 'repeal_bill':
      return handleRepeal(state, intent.billId);
    case 'renew_sunset':
      return handleRenewSunset(state, intent.billId);
    case 'executive_order':
      return handleExecutiveOrder(state, intent.billId);
    case 'call_referendum':
      return handleReferendum(state, intent.questionId);
    case 'set_manifesto':
      return handleManifesto(state, intent.billKeys);
    case 'campaign_push':
      return handleChannelPush(state, intent.channel);
    case 'commission_poll':
      return handlePoll(state, intent.quality);
    case 'hold_rally':
      return handleRally(state, intent.regionId);
    case 'town_hall':
      return handleTownHall(state, intent.regionId);
    case 'press_conference':
      return handlePressConference(state);
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

/**
 * Set what share of full upkeep the country is paying.
 *
 * The most consequential dial in the game that nobody will ever thank a
 * government for setting correctly. Below one, money is freed for things
 * people can see, and the work not done is owed at more than it was avoided
 * for. It costs nothing for about four years.
 */
function handleSetMaintenance(state: GameState, level: number): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'Maintenance is set at the budget.');
  if (!Number.isFinite(level) || level < 0 || level > MAINTENANCE_LEVEL_MAX) {
    return reject(state, `Maintenance runs from 0 to ${MAINTENANCE_LEVEL_MAX}× full upkeep.`);
  }
  const next = clone(state);
  next.infrastructure.maintenanceLevel = Math.round(level * 100) / 100;
  return ok(next);
}

/**
 * Commission something.
 *
 * Costs political capital to start and years to finish. Most of these open
 * under a government that did not commission them, which is the honest
 * reason so little gets built: the credit goes to whoever cuts the ribbon.
 */
function handleStartProject(
  state: GameState,
  asset: InfrastructureKey,
  units: number,
): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'Projects are commissioned at the budget.');
  if (!canStartProject(state.infrastructure)) {
    return reject(state, `Only ${MAX_ACTIVE_PROJECTS} projects can be under way at once.`);
  }
  if (!Number.isFinite(units) || units < 1 || units > 40) {
    return reject(state, 'A project builds between 1 and 40 units of capacity.');
  }
  if (state.politicalCapital < PROJECT_PC_COST) {
    return reject(state, 'Not enough political capital to commission a project.');
  }

  const template = findInfrastructure(asset);
  const next = clone(state);
  spendPc(next, PROJECT_PC_COST);
  next.infrastructure.projects = [
    ...next.infrastructure.projects,
    commission(template, Math.round(units), next.turnNumber, next.termNumber),
  ];
  return ok(next);
}

/**
 * Stop building something.
 *
 * The money already spent is gone — that is what makes cancelling a capital
 * project such a bad decision and such a common one. Nothing is refunded and
 * no capacity arrives.
 */
function handleCancelProject(state: GameState, projectId: string): IntentResult {
  const project = state.infrastructure.projects.find((p) => p.id === projectId);
  if (!project) return reject(state, 'No such project.');

  const next = clone(state);
  next.infrastructure.projects = next.infrastructure.projects.filter((p) => p.id !== projectId);
  return ok(next);
}

/**
 * Change a rate.
 *
 * Costs political capital, because a rate change is legislation. The revenue
 * arrives immediately and the resentment decays over eighteen months, which
 * makes raising something unpopular at the start of a term and letting it
 * cool before the election a genuine strategy — a cynical one, and the game
 * permits it rather than pretending it does not work.
 */
function handleSetTaxRate(state: GameState, tax: TaxKey, rate: number): IntentResult {
  if (state.phase !== 'budget' && state.phase !== 'agenda') {
    return reject(state, 'Rates are set at the budget or legislated on the floor.');
  }
  const template = findTaxTemplate(tax);
  if (!Number.isFinite(rate) || rate < 0 || rate > template.maxRate) {
    return reject(
      state,
      `${template.name} must be between 0% and ${(template.maxRate * 100).toFixed(0)}%.`,
    );
  }

  const current = state.taxes.rates[tax];
  const next = clone(state);
  const rounded = Math.round(rate * 10000) / 10000;
  if (Math.abs(rounded - current) < 1e-9) return ok(next);

  if (next.politicalCapital < TAX_CHANGE_PC_COST) {
    return reject(state, 'Not enough political capital to legislate a rate change.');
  }
  spendPc(next, TAX_CHANGE_PC_COST);
  next.taxes = recordChange(
    { ...next.taxes, rates: { ...next.taxes.rates, [tax]: rounded } },
    tax,
    current,
    rounded,
    next.turnNumber,
  );
  return ok(next);
}

/**
 * Change who the income tax falls on, without changing how much it raises.
 *
 * Progressivity moves burden between the top and the bottom and collects the
 * same total either way. Deductions and credits do cost money — the first is
 * worth most to whoever has the most to deduct, the second is paid straight
 * back out to the people with the least. Keeping the three separate means a
 * government has to say which one it is doing.
 */
function handleSetTaxDial(
  state: GameState,
  dial: 'progressivity' | 'deductions' | 'credits',
  value: number,
): IntentResult {
  if (state.phase !== 'budget') return reject(state, 'The income tax is shaped at the budget.');
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return reject(state, 'That dial runs from 0 to 1.');
  }
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - state.taxes[dial]) < 1e-9) return ok(clone(state));
  if (state.politicalCapital < TAX_CHANGE_PC_COST) {
    return reject(state, 'Not enough political capital to reshape the income tax.');
  }

  const next = clone(state);
  spendPc(next, TAX_CHANGE_PC_COST);
  next.taxes = { ...next.taxes, [dial]: rounded };
  return ok(next);
}

/**
 * Bind your own hands.
 *
 * A fiscal rule costs political capital to adopt and buys a cheaper cost of
 * borrowing — but only after a year of actually keeping it, because the
 * market prices behaviour rather than announcements. It is the one lever in
 * the game whose entire payoff arrives after the election that could remove
 * the government that pulled it.
 */
function handleAdoptFiscalRule(
  state: GameState,
  kind: FiscalRuleKind,
  threshold: number,
): IntentResult {
  if (state.phase !== 'budget' && state.phase !== 'agenda') {
    return reject(state, 'A fiscal rule is adopted at the budget or on the floor.');
  }
  if (state.finance.rules.some((r) => r.kind === kind)) {
    return reject(state, `A ${FISCAL_RULE_LABELS[kind].toLowerCase()} is already in force.`);
  }
  if (state.politicalCapital < FISCAL_RULE_PC_COST) {
    return reject(state, 'Not enough political capital to legislate a fiscal rule.');
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return reject(state, 'A rule needs a number in it.');
  }

  const next = clone(state);
  spendPc(next, FISCAL_RULE_PC_COST);
  next.finance.rules = [
    ...next.finance.rules,
    { kind, threshold, adoptedTurn: next.turnNumber, breachMonths: 0, complianceMonths: 0 },
  ];
  return ok(next);
}

/**
 * Untie them again.
 *
 * Cheaper than adopting the rule was, which is the trap: the cheap way out
 * of a binding constraint is always to abolish it rather than to meet it.
 * What it costs instead is credibility — every month of compliance the rule
 * had banked with lenders goes with it, and the next rule starts from zero.
 */
function handleRepealFiscalRule(state: GameState, kind: FiscalRuleKind): IntentResult {
  if (state.phase !== 'budget' && state.phase !== 'agenda') {
    return reject(state, 'A fiscal rule is repealed at the budget or on the floor.');
  }
  if (!state.finance.rules.some((r) => r.kind === kind)) {
    return reject(state, 'No such rule is in force.');
  }
  if (state.politicalCapital < FISCAL_RULE_REPEAL_PC_COST) {
    return reject(state, 'Not enough political capital to repeal a fiscal rule.');
  }

  const next = clone(state);
  spendPc(next, FISCAL_RULE_REPEAL_PC_COST);
  next.finance.rules = next.finance.rules.filter((r) => r.kind !== kind);
  return ok(next);
}

/**
 * Set the standing payment into the sovereign fund.
 *
 * The fund returns more than the debt costs, so paying into it is correct on
 * a long horizon and wrong on a short one. A government that funds it is
 * handing a stronger position to whoever wins the election it may well lose
 * for having funded it.
 */
function handleReserveContribution(state: GameState, amount: number): IntentResult {
  if (state.phase !== 'budget') {
    return reject(state, 'The reserve contribution is set at the budget.');
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > RESERVE_CONTRIBUTION_MAX) {
    return reject(state, `The contribution must be between ₡0bn and ₡${RESERVE_CONTRIBUTION_MAX}bn.`);
  }
  if (
    amount !== state.finance.reserveContribution &&
    state.politicalCapital < RESERVE_CONTRIBUTION_PC_COST
  ) {
    return reject(state, 'Not enough political capital to change the contribution.');
  }

  const next = clone(state);
  if (amount !== next.finance.reserveContribution) spendPc(next, RESERVE_CONTRIBUTION_PC_COST);
  next.finance.reserveContribution = Math.round(amount * 10) / 10;
  return ok(next);
}

/**
 * Release money from the emergency fund.
 *
 * Free to draw and slow to refill — it tops up only out of surplus, and only
 * a sixth of one. The honest failure mode this is built around is arriving at
 * the second crisis with the fund emptied by the first.
 */
function handleDrawEmergencyFund(state: GameState, amount: number): IntentResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return reject(state, 'Nothing to draw.');
  }
  if (amount > state.finance.emergencyFund) {
    return reject(
      state,
      `The emergency fund holds ₡${state.finance.emergencyFund.toFixed(0)}bn.`,
    );
  }

  const next = clone(state);
  const drawn = Math.round(amount * 10) / 10;
  next.finance.emergencyFund -= drawn;
  next.treasury += drawn;
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


/* ----------------------- the life of a law ------------------------ */

/**
 * Repeal a law already on the books.
 *
 * Unwinds the standing arrangements — funding lines and recurring revenue —
 * but not the one-off money already spent or the improvement a service
 * actually accumulated while it was funded. Repeal is cheaper than never
 * having passed it, and more expensive than it looks.
 */
function handleRepeal(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Repeals are moved during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'passed') return reject(state, 'That law is not on the books.');
  if (state.politicalCapital < PC_COSTS_POLICY.repealBill) {
    return reject(state, 'Not enough political capital to move a repeal.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.repealBill);

  const target = next.bills.find((b) => b.id === billId)!;
  if (target.inEffect) {
    applyEffects(next, reverseEffects(target.effects), `${target.title} repealed`, entries);
  }
  target.status = 'available';
  target.inEffect = false;
  target.takesEffectOn = null;
  target.lapsesOn = null;
  target.amendments = 0;
  target.committeeBonus = 0;

  log(entries, {
    kind: 'legislature',
    label: `${target.title} repealed`,
    delta: -PC_COSTS_POLICY.repealBill,
    cause:
      'The standing arrangements are unwound. The money already spent stays spent, and so does the goodwill.',
    unit: 'PC',
  });
  return ok(next);
}

/** Renew a law about to lapse under its sunset clause. */
function handleRenewSunset(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Renewals are moved during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'passed' || !bill.lapsesOn) {
    return reject(state, 'That law has no sunset clause to renew.');
  }
  if (state.politicalCapital < PC_COSTS_POLICY.renewSunset) {
    return reject(state, 'Not enough political capital to move the renewal.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.renewSunset);

  const target = next.bills.find((b) => b.id === billId)!;
  target.lapsesOn = next.turnNumber + SUNSET_DEFAULT_TURNS;

  log(entries, {
    kind: 'legislature',
    label: `${target.title} renewed`,
    delta: -PC_COSTS_POLICY.renewSunset,
    cause: `Extended to month ${target.lapsesOn}. It will need renewing again.`,
    unit: 'PC',
  });
  return ok(next);
}

/**
 * Govern by decree.
 *
 * Immediate, needs no vote, and cannot spend money — an order can direct, not
 * appropriate. It costs standing precisely because it is an admission that the
 * argument could not be won, and each one in a term costs more than the last.
 */
function handleExecutiveOrder(state: GameState, billId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Orders are issued during the agenda.');
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'available') {
    return reject(state, 'There is nothing to enact by order.');
  }
  if (state.politicalCapital < PC_COSTS_POLICY.executiveOrder) {
    return reject(state, 'Not enough political capital to govern by decree.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.executiveOrder);

  const target = next.bills.find((b) => b.id === billId)!;
  const cost = executiveOrderCost(next.executiveOrdersThisTerm);
  next.executiveOrdersThisTerm += 1;

  target.status = 'passed';
  target.inEffect = true;
  target.turnResolved = next.turnNumber;
  target.takesEffectOn = next.turnNumber;
  next.career.billsPassed += 1;

  applyEffects(next, decreeEffects(target.effects), `${target.title} enacted by order`, entries);
  applyEffects(
    next,
    { approval: cost },
    `Governing by decree (${next.executiveOrdersThisTerm} order${next.executiveOrdersThisTerm === 1 ? '' : 's'} this term) — a government that legislates without a vote is telling the country it cannot win the argument`,
    entries,
  );
  return ok(next);
}

/**
 * Put a question to the country.
 *
 * The electorate decides it, not the government. Losing a referendum you
 * called yourself is worse than never having asked.
 */
function handleReferendum(state: GameState, questionId: string): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Referendums are called during the agenda.');
  const question = REFERENDUM_TEMPLATES.find((q) => q.id === questionId);
  if (!question) return reject(state, 'No such question.');
  if (state.referendums.some((r) => r.question === question.question)) {
    return reject(state, 'That question has already been put to the country.');
  }
  if (state.politicalCapital < PC_COSTS_POLICY.callReferendum) {
    return reject(state, 'Not enough political capital to call a referendum.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_POLICY.callReferendum);

  const scores = computeIssueScores(next.sectors, next.debt, next.revenueModifier, next.economy, next.taxes);
  const result = runReferendum(question, next.regions, scores);

  next.referendums.push({
    termNumber: next.termNumber,
    question: result.question,
    yesShare: result.yesShare,
    turnout: result.turnout,
    passed: result.passed,
  });

  log(entries, {
    kind: 'note',
    label: result.passed ? 'Referendum carried' : 'Referendum defeated',
    delta: result.yesShare * 100,
    cause: `"${result.question}" — Yes ${(result.yesShare * 100).toFixed(1)}% on a turnout of ${(result.turnout * 100).toFixed(0)}%.`,
    unit: '% yes',
  });

  if (result.passed) {
    applyEffects(next, question.effects, `Referendum carried: ${result.question}`, entries);
    applyEffects(next, { approval: 2.5 }, 'Winning a referendum you called', entries);
  } else {
    applyEffects(
      next,
      { approval: -6 },
      'Losing a referendum you called yourself — worse than never having asked',
      entries,
    );
    next.partyInternals.authority = Math.max(0, next.partyInternals.authority - 10);
  }

  return ok(next);
}

/**
 * Commit to a manifesto.
 *
 * A promise kept is worth something; a promise broken is worth more, in the
 * wrong direction. Promising less is often the stronger play.
 */
function handleManifesto(state: GameState, billKeys: string[]): IntentResult {
  if (state.promises.some((p) => p.status === 'outstanding' && p.termMade === state.termNumber)) {
    return reject(state, 'This term’s manifesto is already published.');
  }
  if (billKeys.length === 0) return reject(state, 'A manifesto needs at least one commitment.');
  if (billKeys.length > MANIFESTO_SIZE) {
    return reject(state, `A manifesto may carry at most ${MANIFESTO_SIZE} commitments.`);
  }

  const next = clone(state);
  const entries = currentLog(next);

  for (const key of billKeys) {
    const bill = next.bills.find((b) => b.templateKey === key);
    if (!bill) continue;
    next.promises.push({
      id: `promise-${next.termNumber}-${key}`,
      billKey: key,
      title: bill.title,
      termMade: next.termNumber,
      status: 'outstanding',
    });
  }

  log(entries, {
    kind: 'note',
    label: 'Manifesto published',
    delta: null,
    cause: `${billKeys.length} commitment${billKeys.length === 1 ? '' : 's'} for this term. Keeping them is worth something; breaking them is worth more, the other way.`,
  });
  return ok(next);
}


/* ------------------------- campaign media -------------------------- */

function requireCampaign(state: GameState): string | null {
  if (state.phase !== 'agenda') return 'Campaigning happens during the agenda.';
  if (!isCampaignTurn(state.turnNumber)) return 'The campaign has not begun yet.';
  if (!state.campaign) return 'There is no campaign under way.';
  return null;
}

/**
 * Buy a push on one channel.
 *
 * Channels reach different people, which is the whole reason to model them
 * separately: television lands with retirees and never reaches students,
 * social platforms do the reverse, and door knocking reaches the people least
 * likely to vote at all — but costs volunteers rather than money, so only a
 * party with members can run one.
 */
function handleChannelPush(state: GameState, channel: ChannelKey): IntentResult {
  const wrong = requireCampaign(state);
  if (wrong) return reject(state, wrong);

  const template = channelTemplate(channel);
  if (state.politicalCapital < template.pcCost) {
    return reject(state, 'Not enough political capital for that.');
  }
  if (state.partyInternals.funds < template.cost) {
    return reject(state, `The party cannot afford ₡${template.cost}m for ${template.label}.`);
  }

  if (template.requiresVolunteers) {
    const available = availableVolunteerPushes(
      state.partyInternals.members,
      state.campaign!.volunteerPushesUsed,
    );
    if (available <= 0) {
      return reject(
        state,
        'Your members are already out as far as they will go. Door knocking needs volunteers, and you have run out.',
      );
    }
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, template.pcCost);
  next.partyInternals.funds -= template.cost;

  const campaign = next.campaign!;
  campaign.reach = applyChannelPush(campaign.reach, channel);
  campaign.channelPushes[channel] = (campaign.channelPushes[channel] ?? 0) + 1;
  if (template.requiresVolunteers) campaign.volunteerPushesUsed += 1;

  const reached = Object.entries(template.reach)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([key]) => key.replace(/_/g, ' '))
    .join(', ');

  log(entries, {
    kind: 'note',
    label: `${template.label} campaign`,
    delta: -template.cost,
    cause: `Reaches ${reached} most of all. ${template.persuasion >= 1 ? 'Changes minds' : 'Mobilises more than it persuades'}.`,
    unit: '₡m',
  });
  return ok(next);
}

/**
 * Commission a poll.
 *
 * The player never sees the true figure. Each poll is a sample with a real
 * margin of error, so two polls the same week can disagree — which is what
 * polls actually do, and why running a campaign off them is treacherous.
 */
function handlePoll(state: GameState, quality: PollQuality): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Polls are commissioned during the agenda.');
  const cost =
    quality === 'large'
      ? PC_COSTS_MEDIA.pollLarge
      : quality === 'standard'
        ? PC_COSTS_MEDIA.pollStandard
        : PC_COSTS_MEDIA.pollSmall;
  if (state.politicalCapital < cost) return reject(state, 'Not enough political capital.');

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, cost);

  const rng = new Rng(next.rngState);
  const scores = computeIssueScores(next.sectors, next.debt, next.revenueModifier, next.economy, next.taxes);
  const player = playerParty(next.parties);
  const truth = trueNationalShares(next.regions, next.parties, {
    scores,
    incumbentId: player.id,
    segmentPersuasion: next.campaign
      ? persuasionBySegment(next.campaign.reach)
      : undefined,
  });
  const poll = conductPoll(truth, quality, rng);
  next.rngState = rng.state;

  if (next.campaign) {
    next.campaign.polls.push({
      turnNumber: next.turnNumber,
      quality,
      shares: poll.shares,
      marginOfError: poll.marginOfError,
    });
  }

  log(entries, {
    kind: 'note',
    label: `Poll commissioned (${quality})`,
    delta: (poll.shares[player.id] ?? 0) * 100,
    cause: `Sample of ${poll.sampleSize}, margin of error ±${poll.marginOfError.toFixed(1)} points. Your share is within that band of the truth, not on it.`,
    unit: '%',
  });
  return ok(next);
}

/** A rally: loud, regional, and better at turnout than at persuasion. */
function handleRally(state: GameState, regionId: string): IntentResult {
  const wrong = requireCampaign(state);
  if (wrong) return reject(state, wrong);
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');
  if (state.politicalCapital < PC_COSTS_MEDIA.rally) {
    return reject(state, 'Not enough political capital for a rally.');
  }
  if (state.partyInternals.funds < RALLY_COST) {
    return reject(state, `The party cannot afford ₡${RALLY_COST}m for a rally.`);
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_MEDIA.rally);
  next.partyInternals.funds -= RALLY_COST;

  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += 1.6;
  next.campaign!.rallies += 1;
  /* Rallies fire up the people already with you. */
  next.partyInternals.cohesion = Math.min(100, next.partyInternals.cohesion + 3);

  log(entries, {
    kind: 'note',
    label: `Rally in ${target.name}`,
    delta: -RALLY_COST,
    cause: 'Turnout and enthusiasm among people already minded to vote for you. It persuades nobody new.',
    unit: '₡m',
  });
  return ok(next);
}

/** A town hall: small, awkward, and unusually good at moving the undecided. */
function handleTownHall(state: GameState, regionId: string): IntentResult {
  const wrong = requireCampaign(state);
  if (wrong) return reject(state, wrong);
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return reject(state, 'No such region.');
  if (state.politicalCapital < PC_COSTS_MEDIA.townHall) {
    return reject(state, 'Not enough political capital.');
  }
  if (state.partyInternals.funds < TOWN_HALL_COST) {
    return reject(state, 'The party cannot afford that.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_MEDIA.townHall);
  next.partyInternals.funds -= TOWN_HALL_COST;

  const target = next.regions.find((r) => r.id === regionId)!;
  target.campaignInvestment += 0.9;
  next.campaign!.townHalls += 1;

  /* Facing hostile questions in public is worth something, if it goes well. */
  const performance = next.approval / 100 + next.partyInternals.authority / 200;
  applyEffects(
    next,
    { approval: (performance - 0.55) * 3 },
    `Town hall in ${target.name} — a small room, unscripted questions, and no way to avoid the difficult one`,
    entries,
  );
  return ok(next);
}

/**
 * A press conference. Cheap, immediate, and you do not choose the questions —
 * so it rewards a government with answers and punishes one without.
 */
function handlePressConference(state: GameState): IntentResult {
  if (state.phase !== 'agenda') return reject(state, 'Press conferences are held during the agenda.');
  if (state.politicalCapital < PC_COSTS_MEDIA.pressConference) {
    return reject(state, 'Not enough political capital.');
  }

  const next = clone(state);
  const entries = currentLog(next);
  spendPc(next, PC_COSTS_MEDIA.pressConference);

  /* What the room asks about is whatever is going worst. */
  const scores = computeIssueScores(next.sectors, next.debt, next.revenueModifier, next.economy, next.taxes);
  const worst = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  const defensible = (worst?.[1] ?? 50) > 42;

  applyEffects(
    next,
    { approval: defensible ? 1.4 : -1.8 },
    defensible
      ? `Press conference — the room led on ${worst?.[0].replace(/_/g, ' ')}, and you had an answer`
      : `Press conference — the room led on ${worst?.[0].replace(/_/g, ' ')}, and you did not have an answer`,
    entries,
  );
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
