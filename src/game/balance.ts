/**
 * balance.ts — every tunable number in Statecraft.
 *
 * Nothing in the engine hardcodes a magic constant; it all lives here so the
 * game can be retuned without hunting through systems code. Values are
 * deliberate but provisional — they are a starting point for playtesting, not
 * a finished balance pass.
 *
 * Money is expressed in "credits, billions" (written ₡bn in the UI) and every
 * flow is PER TURN, where one turn is one in-game month.
 */

import type { Difficulty, SectorKey } from './types.ts';

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

export const TURNS_PER_TERM = 12;
/** Turns 11–12 are the campaign run-up; the Agenda phase changes shape. */
export const CAMPAIGN_START_TURN = 11;
/** The budget is only editable on these turns (every 3rd), unless forced. */
export const BUDGET_TURN_INTERVAL = 3;

/* ------------------------------------------------------------------ *
 * Political Capital
 * ------------------------------------------------------------------ */

export const PC_MAX = 100;
export const PC_START = 50;
/** Regen = base + (approval/100 * scale). At 50% approval this is ~16/turn. */
export const PC_REGEN_BASE = 10;
export const PC_REGEN_APPROVAL_SCALE = 12;

export const PC_COSTS = {
  proposeMinorBill: 8,
  proposeMajorBill: 20,
  /** Per whip step. Each step buys +5% pass chance. */
  whipStep: 4,
  publicAddress: 6,
  coalitionConcession: 12,
  emergencyBudget: 25,
  reshuffleCabinet: 18,
  callEarlyElection: 40,
  campaignStop: 7,
  adBuy: 5,
} as const;

/** Each whip step bought adds this much to pass chance. */
export const WHIP_STEP_BONUS = 0.05;
/** Hard ceiling on whip steps per bill, so PC can't trivially buy any bill. */
export const WHIP_MAX_STEPS = 5;

/* ------------------------------------------------------------------ *
 * Approval
 * ------------------------------------------------------------------ */

export const APPROVAL_START = 50;

/**
 * Approval eases toward a target implied by the state of the country, rather
 * than being set directly. One-off deltas (events, addresses, bill passage)
 * are applied on top and always itemised in the turn log.
 */
export const APPROVAL_BASE = 40;
/** Weight on (average sector health − 50). */
export const APPROVAL_W_SECTOR = 0.42;
/** Extra weight on (economy health − 50) — the economy counts twice. */
export const APPROVAL_W_ECONOMY = 0.22;
/** Debt above this threshold starts costing approval. */
export const APPROVAL_DEBT_FREE_ALLOWANCE = 150;
export const APPROVAL_DEBT_DIVISOR = 40;
export const APPROVAL_DEBT_MAX_PENALTY = 14;
/** Voters tire of an incumbent. Accrues per turn served, capped. */
export const APPROVAL_FATIGUE_PER_TURN = 0.16;
export const APPROVAL_FATIGUE_CAP = 7;
/** How fast approval closes the gap to its target each turn. */
export const APPROVAL_INERTIA = 0.34;

export const PUBLIC_ADDRESS_APPROVAL = 3.5;
/** Addresses lose potency if spammed within a term. */
export const PUBLIC_ADDRESS_DIMINISH = 0.6;

/* ------------------------------------------------------------------ *
 * Treasury, debt, sectors
 * ------------------------------------------------------------------ */

/** Revenue = base * (0.5 + economyHealth/100). At health 60 this is ~104.5. */
export const REVENUE_BASE = 95;
/** Per-turn interest charged on outstanding debt (~11%/yr). */
export const DEBT_INTEREST_RATE = 0.009;
/** A surplus pays down debt at this fraction before banking the remainder. */
export const SURPLUS_TO_DEBT_RATIO = 0.7;

export const SECTOR_KEYS: SectorKey[] = [
  'economy',
  'health',
  'education',
  'infrastructure',
  'environment',
];

/**
 * Funding level at which a sector settles at 60/100 health. Health then obeys
 * equilibrium(f) = 100 * f / (f + k) where k = baseline * 2/3, which gives
 * genuine diminishing returns: doubling health spend from 30 to 60 moves
 * equilibrium from 60 to 75, not to 120.
 */
export const SECTOR_BASELINE_FUNDING: Record<SectorKey, number> = {
  economy: 20,
  health: 30,
  education: 20,
  infrastructure: 20,
  environment: 14,
};

export const SECTOR_START_HEALTH: Record<SectorKey, number> = {
  economy: 58,
  health: 62,
  education: 60,
  infrastructure: 55,
  environment: 52,
};

/** How fast health closes the gap to its funding-implied equilibrium. */
export const SECTOR_DRIFT_RATE = 0.18;
/** Sector health below this starts generating related crisis events. */
export const SECTOR_DISTRESS_THRESHOLD = 40;

export const SECTOR_LABELS: Record<SectorKey, string> = {
  economy: 'Economy',
  health: 'Health',
  education: 'Education',
  infrastructure: 'Infrastructure',
  environment: 'Environment',
};

/* ------------------------------------------------------------------ *
 * Ideology
 * ------------------------------------------------------------------ */

/**
 * The distance at which two positions count as maximally opposed.
 *
 * NOT the theoretical maximum. Opposite corners of the 3-axis cube are
 * sqrt(12) ≈ 3.46 apart, but no two parties ever sit that way: the widest real
 * pair in the roster (Verdant Compact against Heritage Assembly) is about 1.7,
 * and most pairs are under 1.1. Normalising against 3.46 squeezed every
 * relationship into the friendly half of the scale, so every party at the
 * negotiating table read as a natural ally. Calibrating to the range positions
 * actually occupy makes affinity span its full −1..1 and gives the coalition,
 * alignment and mood terms their intended spread.
 */
export const IDEOLOGY_MAX_DISTANCE = 2.2;

/* ------------------------------------------------------------------ *
 * Legislature
 * ------------------------------------------------------------------ */

export const TOTAL_SEATS = 180;
export const MAJORITY_SEATS = Math.floor(TOTAL_SEATS / 2) + 1;

/**
 * pass_chance = clamp(
 *     seatShare * SEAT_SHARE_WEIGHT
 *   + alignment  * ALIGNMENT_WEIGHT
 *   + mood       * MOOD_WEIGHT
 *   + whipSteps  * WHIP_STEP_BONUS
 *   − magnitude penalty,
 *   0.05, 0.95)
 *
 * SEAT_SHARE_WEIGHT is above 1.0 on purpose: a disciplined majority should
 * pass most of what it tables, not barely half of it.
 */
export const SEAT_SHARE_WEIGHT = 1.3;
export const ALIGNMENT_WEIGHT = 0.12;
export const MOOD_WEIGHT = 0.15;
export const MAJOR_BILL_PENALTY = 0.08;
export const PASS_CHANCE_MIN = 0.05;
export const PASS_CHANCE_MAX = 0.95;

/* ------------------------------------------------------------------ *
 * Party internals
 * ------------------------------------------------------------------ */

/** Party members at the start of a run, in thousands. */
export const MEMBERS_START = 180;
/** Party funds at the start of a run, in ₡m. Separate from the treasury. */
export const PARTY_FUNDS_START = 40;
/** Internal discipline at the start of a run, 0–100. */
export const COHESION_START = 68;
/** The leader's authority over their own party at the start, 0–100. */
export const AUTHORITY_START = 70;

/** Subscription income per thousand members per turn, in ₡m. */
export const FUNDS_PER_MEMBER = 0.055;
/** Additional donations scale with standing: this much at 100% approval. */
export const FUNDS_APPROVAL_BONUS = 6;
/** Running the party costs this much per turn before anything is spent. */
export const PARTY_OVERHEADS = 3.5;
/** Each level of headquarters investment adds this to fundraising. */
export const FUNDS_PER_HQ_LEVEL = 2.2;

/** Membership drifts toward a level implied by approval, at this rate. */
export const MEMBERS_DRIFT_RATE = 0.12;
/** Members at 0% and 100% approval respectively, in thousands. */
export const MEMBERS_FLOOR = 60;
export const MEMBERS_CEILING = 340;
/** Members lost when the leadership crosses one of its own faction's lines. */
export const MEMBERS_LOST_PER_REBELLION = 6;

/** Cohesion drifts toward this, modified by authority and recent rebellions. */
export const COHESION_BASE_TARGET = 62;
export const COHESION_DRIFT_RATE = 0.22;
/** Each point of authority above 50 adds this much to the cohesion target. */
export const COHESION_PER_AUTHORITY = 0.35;
/** A rebellion costs this much cohesion immediately. */
export const COHESION_PER_REBELLION = -7;

/**
 * Ideological distance between a bill and a faction beyond which that faction
 * starts seriously considering rebellion.
 */
export const REBELLION_TOLERANCE = 0.55;
/** How sharply rebellion probability rises past that tolerance. */
export const REBELLION_SENSITIVITY = 1.35;
/** Each whip step suppresses this much rebellion probability. */
export const REBELLION_WHIP_SUPPRESSION = 0.14;

/** Authority drifts toward a level implied by approval and party results. */
export const AUTHORITY_DRIFT_RATE = 0.2;
/** A leadership challenge fires below this authority. */
export const AUTHORITY_CHALLENGE_THRESHOLD = 25;
/**
 * Turns that must pass between challenges.
 *
 * Without this, a leader below the threshold faces a fresh challenge every
 * single month and is removed almost immediately — which made the mechanic a
 * guillotine rather than a risk. Parties do not move against their leader
 * monthly; organising one costs the plotters something too.
 */
export const CHALLENGE_COOLDOWN_TURNS = 6;
/** Surviving a challenge restores authority to at least this. */
export const AUTHORITY_AFTER_SURVIVING = 55;

export const PC_COSTS_PARTY = {
  /** Address the party's own members to shore up the leadership. */
  rallyParty: 7,
  /** A fundraising drive: costs capital, raises money. */
  fundraisingDrive: 6,
  /** Promote a faction's figure to deputy leader. */
  appointDeputy: 9,
  /** Discipline rebels: raises cohesion, costs loyalty in the punished wing. */
  disciplineRebels: 10,
  /** Invest party funds in headquarters and staff. */
  investHeadquarters: 5,
} as const;

/** Funds raised by one fundraising drive, in ₡m. */
export const FUNDRAISING_DRIVE_YIELD = 14;
/** Cost in ₡m of one level of headquarters investment. */
export const HEADQUARTERS_COST = 18;
/** Party funds spent per advertising push, in ₡m. */
export const AD_BUY_PARTY_COST = 7;

/* ------------------------------------------------------------------ *
 * The second chamber
 * ------------------------------------------------------------------ */

/** Seats in the Senate. Smaller than the lower house, and renewed by halves. */
export const SENATE_SIZE = 60;
/** Weight on the government's share of the upper house. */
export const SENATE_SEAT_WEIGHT = 1.25;
/** Weight on how the senators the government does not control view the bill. */
export const SENATE_ALIGNMENT_WEIGHT = 0.35;
export const SENATE_PASS_MIN = 0.08;
export const SENATE_PASS_MAX = 0.97;

/** Political capital for the procedural actions. */
export const PC_COSTS_PROCEDURE = {
  /** Send a bill to committee: delayed a month, returns stronger. */
  sendToCommittee: 5,
  /** Amend a bill toward a faction or partner to buy their votes. */
  amendBill: 7,
  /** Break a filibuster by closing debate. */
  closeDebate: 12,
  /** Buy a crossbench senator's vote on one bill. */
  crossbenchDeal: 9,
  /** Face the chamber at question time. */
  questionTime: 4,
} as const;

/** How far one amendment moves a bill toward the target position, 0–1. */
export const AMENDMENT_STRENGTH = 0.4;
/** Each amendment waters the bill's effects down by this fraction. */
export const AMENDMENT_DILUTION = 0.18;
/** A crossbench deal adds this to a bill's Senate chance. */
export const CROSSBENCH_SENATE_BONUS = 0.18;

/* ------------------------------------------------------------------ *
 * Coalition
 * ------------------------------------------------------------------ */

export const MOOD_START = 62;
export const MOOD_THREATEN_EXIT = 30;
export const MOOD_DRIFT_RATE = 0.25;
export const MOOD_BASE_TARGET = 50;
/** Weight on ideological affinity between player and partner (−1..1). */
export const MOOD_W_AFFINITY = 20;
/** Weight on (approval − 50). Doubled when approval is below 50: failure bites. */
export const MOOD_W_APPROVAL = 0.25;
export const MOOD_FAILURE_MULTIPLIER = 2;
/** Applied when the budget honours / breaks a partner's sector floor. */
export const MOOD_BUDGET_KEPT = 6;
export const MOOD_BUDGET_BROKEN = -14;
/** Cost of passing a bill that crosses a partner's stated red line. */
export const MOOD_RED_LINE_VIOLATION = -22;
export const MOOD_CONCESSION_GAIN = 15;
export const MOOD_RESHUFFLE_GAIN = 8;
/** Cabinet posts short of a partner's demand cost this much mood each. */
export const MOOD_PER_MISSING_CABINET_POST = -5;
/** Attempts allowed to form a government before a fresh election is forced. */
export const COALITION_MAX_ATTEMPTS = 3;
export const COALITION_FAILURE_APPROVAL_PENALTY = -8;
export const COUNTER_OFFER_PC_COST = 10;
/** A counter-offer shaves this much off each numeric demand. */
export const COUNTER_OFFER_RELIEF = 0.35;

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export const MAX_EVENTS_PER_TURN = 2;
/** Probability that any event at all fires on a given turn. */
export const EVENT_BASE_CHANCE = 0.62;
/** Probability of a second event, given the first fired. */
export const EVENT_SECOND_CHANCE = 0.3;

/* ------------------------------------------------------------------ *
 * The electorate
 * ------------------------------------------------------------------ */

/**
 * How sharply voters favour parties near their own position. Support is
 * exp(affinity * pull), so a close party does not merely lead a distant one —
 * it dominates within that segment.
 */
export const SEGMENT_IDEOLOGY_PULL = 2.4;

/**
 * How far a segment's verdict on the government's record can move its vote,
 * before the segment's own volatility is applied. A fully satisfied segment
 * swings this far toward the incumbent; a fully dissatisfied one, away.
 */
export const INCUMBENT_PERFORMANCE_SWING = 0.55;
/** The share of incumbent dissatisfaction that opposition parties pick up. */
export const OPPOSITION_PERFORMANCE_SWING = 0.35;

/** Baseline share of a segment that votes at all, before its own habit. */
export const TURNOUT_BASELINE = 0.62;
/** Campaign effort in a region lifts turnout among persuadable segments. */
export const TURNOUT_CAMPAIGN_LIFT = 0.04;

/** Debt at which the debt issue scores zero. Below it, the score scales up. */
export const ISSUE_DEBT_ZERO_AT = 620;
/** Each ₡bn of recurring revenue above baseline costs this much tax score. */
export const ISSUE_TAX_PER_REVENUE = 2.1;
/** Baseline tax score when the revenue modifier is zero. */
export const ISSUE_TAX_BASE = 66;
/** How much economy health moves the cost-of-living score, around health 60. */
export const ISSUE_COST_ECONOMY_WEIGHT = 0.85;
/** Each ₡bn of recurring revenue also raises prices for households. */
export const ISSUE_COST_PER_REVENUE = 1.4;

/* ------------------------------------------------------------------ *
 * Elections
 * ------------------------------------------------------------------ */

/** How sharply regional support falls off with ideological distance. */
export const REGION_AFFINITY_SPREAD = 0.55;
/**
 * Player support multiplier ranges over this band as approval goes 0 → 100.
 * The band is wide on purpose: elections must actually turn on standing, or a
 * term of governing well changes nothing on the night.
 */
export const ELECTION_APPROVAL_FLOOR = 0.45;
export const ELECTION_APPROVAL_RANGE = 1.25;
/** Effect of one campaign stop's investment on regional support. */
export const CAMPAIGN_STOP_INVESTMENT = 1;
export const CAMPAIGN_EFFECT_PER_INVESTMENT = 0.07;
/**
 * Investment one advertising push buys in a region. The money for it comes
 * from PARTY funds (AD_BUY_PARTY_COST), not the national treasury.
 */
export const AD_BUY_INVESTMENT = 0.8;
/** Debate performance shifts national support by up to this fraction. */
export const DEBATE_SWING_PER_WIN = 0.04;
/**
 * How much headline approval nudges the incumbent's vote on top of the
 * electorate's own issue-by-issue verdict. Deliberately small: the things that
 * move approval are already being weighed directly by voters, so a large value
 * here would count them twice.
 */
export const NATIONAL_MOOD_WEIGHT = 0.35;

/**
 * Share of the chamber elected in districts under mixed-member proportional.
 * The remainder is filled from a national list to correct the total toward
 * each party's vote share.
 */
export const MMP_DISTRICT_SHARE = 0.6;

/**
 * How strongly districts sort geographically.
 *
 * Real electorates are not uniform samples of their region: the industrial
 * district and the professional district sit a few miles apart and vote
 * nothing alike. Each district draws a character, and segments concentrate
 * where they fit it. At 0 districts are statistically identical and
 * single-member systems degenerate into winner-takes-the-region.
 */
export const DISTRICT_SORTING = 4.5;

/** Political capital to redraw one region's boundaries. */
export const PC_REDRAW_BOUNDARIES = 22;
/**
 * Approval cost when a boundary redraw becomes public knowledge, scaled by how
 * distorted the map has become. Drawing your own districts is legal here, and
 * it is never free.
 */
export const REDRAW_APPROVAL_PENALTY = 9;

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export interface DifficultyProfile {
  readonly label: string;
  readonly blurb: string;
  /** Debt the run opens with. */
  readonly startingDebt: number;
  /** Multiplier on coalition mood drift away from comfort. */
  readonly coalitionVolatility: number;
  /** Multiplier on event severity and on negative event weights. */
  readonly eventSeverity: number;
  /** Multiplier on sector decay when underfunded. */
  readonly decayPressure: number;
  /** Flat adjustment to the approval target. */
  readonly approvalBias: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  stable: {
    label: 'Stable',
    blurb:
      'A calm inheritance. Light debt, patient partners, mild crises. Room to learn the machinery.',
    startingDebt: 90,
    coalitionVolatility: 0.7,
    eventSeverity: 0.75,
    decayPressure: 0.85,
    approvalBias: 3,
  },
  standard: {
    label: 'Standard',
    blurb:
      'A normal hand. Real debt, partners with real demands, crises that cost something.',
    startingDebt: 200,
    coalitionVolatility: 1,
    eventSeverity: 1,
    decayPressure: 1,
    approvalBias: 0,
  },
  fractured: {
    label: 'Fractured',
    blurb:
      'A poisoned chalice. Heavy debt, brittle partners, severe crises. Survival is the achievement.',
    startingDebt: 340,
    coalitionVolatility: 1.45,
    eventSeverity: 1.35,
    decayPressure: 1.2,
    approvalBias: -4,
  },
};

/* ------------------------------------------------------------------ *
 * Legacy scoring
 * ------------------------------------------------------------------ */

export const LEGACY_WEIGHTS = {
  perTermServed: 120,
  perBillPassed: 14,
  /** Multiplied by (final average sector health − 50). */
  finalSectorHealth: 6,
  /** Multiplied by debt; negative, so debt subtracts. */
  finalDebt: -0.35,
  /** Multiplied by (peak approval − 50). */
  peakApproval: 4,
  perElectionWon: 90,
} as const;
