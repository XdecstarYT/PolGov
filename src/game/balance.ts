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
/**
 * The debt penalty on approval, expressed against output.
 *
 * Voters do not know what ₡2,020bn is. They know whether the debt is the
 * sort of number that gets talked about, and that is a ratio. Below 45% of
 * output nobody mentions it; each further point of ratio costs a fraction of
 * a point of approval, to a cap — because past a certain point the people
 * who care about debt already dislike you and the rest never will.
 */
export const APPROVAL_DEBT_FREE_RATIO = 0.45;
/** Points of approval lost per percentage point of ratio above that. */
export const APPROVAL_DEBT_PER_POINT = 0.16;
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
 * Policy lifecycle
 * ------------------------------------------------------------------ */

/**
 * Turns between a law passing and being felt.
 *
 * Nothing arrives the month it passes. Major programmes take longer, which is
 * the quiet tragedy of a twelve-month term: the things worth doing land after
 * the election that decides whether you were right to do them.
 */
export const IMPLEMENTATION_DELAY_MINOR = 1;
export const IMPLEMENTATION_DELAY_MAJOR = 2;

/** Turns before a bill with a sunset clause lapses unless renewed. */
export const SUNSET_DEFAULT_TURNS = 8;

/** Approval for each manifesto promise kept, and each one broken. */
export const PROMISE_KEPT_APPROVAL = 2.4;
export const PROMISE_BROKEN_APPROVAL = -5.5;
/** Promises a manifesto may carry. */
export const MANIFESTO_SIZE = 3;

/** Referendums draw a smaller crowd than a general election. */
export const REFERENDUM_TURNOUT_PENALTY = 0.18;

/** Approval cost of the first executive order in a term; later ones cost more. */
export const EXECUTIVE_ORDER_APPROVAL_COST = -3.2;

export const PC_COSTS_POLICY = {
  /** Repeal a law already on the books. */
  repealBill: 14,
  /** Call a referendum. */
  callReferendum: 26,
  /** Govern by decree, without a vote. */
  executiveOrder: 16,
  /** Renew a law about to lapse under its sunset clause. */
  renewSunset: 6,
  /** Open a public consultation, which slows a policy and de-risks it. */
  consultation: 5,
} as const;

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
/**
 * The debt-to-output ratio at which voters score the public finances zero.
 *
 * A ratio rather than an absolute figure, because an absolute one silently
 * becomes lenient as the economy grows: the same ₡2,000bn is a crisis in a
 * small country and unremarkable in a large one, and a constant could not
 * tell the difference. At 55% — a normal inheritance — this scores 62.
 */
export const ISSUE_DEBT_ZERO_AT_RATIO = 1.45;
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
 * Campaigning and media
 * ------------------------------------------------------------------ */

/** Campaigning fades: a push in month nine is worth little by month twelve. */
export const REACH_DECAY_PER_TURN = 0.22;
/** Scales accumulated reach into a persuasion bonus. */
export const REACH_PERSUASION_SCALE = 0.11;
/** Scales accumulated reach into a turnout bonus. */
export const REACH_TURNOUT_SCALE = 0.09;
/** Door-knocking pushes available per thousand party members. */
export const VOLUNTEERS_PER_MEMBER = 0.02;

/**
 * Poll sample sizes.
 *
 * The player never sees the true figure. A small poll's margin of error is
 * wide enough to be actively misleading, which is the intended experience:
 * a campaign run off polling is a campaign run off noise.
 */
export const POLL_SAMPLE_SMALL = 420;
export const POLL_SAMPLE_STANDARD = 1100;
export const POLL_SAMPLE_LARGE = 3200;

export const PC_COSTS_MEDIA = {
  /** Commission a poll. Bigger samples cost more. */
  pollSmall: 2,
  pollStandard: 4,
  pollLarge: 7,
  /** A rally: regional turnout and enthusiasm. */
  rally: 6,
  /** A town hall: smaller, more persuasive, better with the undecided. */
  townHall: 5,
  /** A set-piece interview. */
  interview: 4,
  /** A press conference: fast, and you do not control the questions. */
  pressConference: 3,
} as const;

/** Party funds cost of a rally and a town hall, in ₡m. */
export const RALLY_COST = 4;
export const TOWN_HALL_COST = 1.5;

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export interface DifficultyProfile {
  readonly label: string;
  readonly blurb: string;
  /** Debt the run opens with. */
  /**
   * Debt inherited on day one, ₡bn.
   *
   * These used to be 90 / 200 / 340, from before output existed as a number
   * in this game. Against a ₡3,680bn economy that was a debt of five per
   * cent, which is not a hand anybody has ever been dealt and which left the
   * entire lending model — the rating, the spread, the refinancing cliff —
   * permanently inert at AAA. They are 35% / 55% / 80% of output now.
   */
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
    startingDebt: 1_290,
    coalitionVolatility: 0.7,
    eventSeverity: 0.75,
    decayPressure: 0.85,
    approvalBias: 3,
  },
  standard: {
    label: 'Standard',
    blurb:
      'A normal hand. Real debt, partners with real demands, crises that cost something.',
    startingDebt: 2_020,
    coalitionVolatility: 1,
    eventSeverity: 1,
    decayPressure: 1,
    approvalBias: 0,
  },
  fractured: {
    label: 'Fractured',
    blurb:
      'A poisoned chalice. Heavy debt, brittle partners, severe crises. Survival is the achievement.',
    startingDebt: 2_950,
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
  /** Multiplied by debt as a percentage of output, so it scales with the country. */
  finalDebtRatio: -3.4,
  /** Multiplied by (peak approval − 50). */
  peakApproval: 4,
  perElectionWon: 90,
} as const;

/* ------------------------------------------------------------------ *
 * Engine 2A — the macroeconomy
 *
 * One turn is one month, but every rate here is expressed the way a
 * finance minister would read it: annualised, in percent. The monthly
 * step divides by twelve where it needs to. Keeping the units the way
 * the briefing states them is worth the division.
 *
 * The model is the standard undergraduate three-equation one — an IS
 * curve, a Phillips curve and a Taylor rule — because it is the smallest
 * thing that produces the behaviour the game needs: stimulus works and
 * then costs you, inflation is punished late, and the central bank will
 * undo what you do if you do too much of it.
 * ------------------------------------------------------------------ */

/** Real output at the start of a run, ₡bn per year. */
export const GDP_START = 3_680;
/** Trend growth the economy reverts to, % a year, before productivity. */
export const POTENTIAL_GROWTH_BASE = 2.1;
/**
 * Speed the output gap closes at, per month.
 *
 * Applied to a slump. A boom is pulled back harder — see
 * `OUTPUT_GAP_BOOM_DAMPING` — because an economy above capacity runs into
 * shortages of people, parts and premises, while one below capacity just has
 * idle people who stay idle. That asymmetry is why the cycle this produces
 * has sharp, frightening downturns and unremarkable upswings, which is the
 * shape real cycles have and the shape the game needs: a recession has to be
 * the thing a government is afraid of.
 */
export const OUTPUT_GAP_CLOSE_RATE = 0.032;
/** How much harder a boom is pulled back than a slump is pulled up. */
export const OUTPUT_GAP_BOOM_DAMPING = 1.9;

/** Productivity index at the start. 100 is "as productive as last decade". */
export const PRODUCTIVITY_START = 100;
/** Drift per month toward the level education and infrastructure imply. */
export const PRODUCTIVITY_DRIFT_RATE = 0.012;
/** A point of productivity above 100 is worth this much trend growth. */
export const PRODUCTIVITY_TO_GROWTH = 0.055;

/* --- the IS curve: what moves output away from trend --- */

/** A point of real interest rate above neutral costs this much growth. */
export const IS_REAL_RATE_WEIGHT = 0.38;
/** The real rate the economy is indifferent to. */
export const NEUTRAL_REAL_RATE = 1.6;
/** A point of combined confidence above 50 adds this much growth. */
export const IS_CONFIDENCE_WEIGHT = 0.021;
/**
 * Fiscal impulse: points of annual growth per percentage point of GDP run as
 * a deficit.
 *
 * Expressed as a ratio rather than as ₡bn per point, because an absolute
 * figure silently weakens as the economy grows — the same ₡20bn deficit
 * should matter less to a country half again as large, and with an absolute
 * constant it would matter exactly as much forever.
 *
 * 0.18 puts a deficit worth 10% of GDP at roughly +1.8 points of growth.
 * Below the textbook multiplier, deliberately: this is a persistent impulse
 * applied every month it continues, so it compounds, and a headline figure
 * that matched the literature would make deficit spending a cheat code.
 */
export const IS_FISCAL_MULTIPLIER = 0.18;

/* --- the cycle has weather --- */

/**
 * How hard an ordinary month's economic noise pushes growth and prices.
 *
 * Real economies cycle without anyone doing anything to them. Without this
 * the model sits exactly on trend forever, the player's budget is the only
 * thing that ever moves it, and the whole thing reads as a spreadsheet rather
 * than as a country.
 *
 * The noise is drawn from the game's own seeded RNG, so a replayed turn
 * produces the identical month — and it is passed in rather than drawn here,
 * so that `forecastEconomy` can run the same function with the noise set to
 * zero. That is what makes the Treasury forecast honest AND wrong: it is the
 * model's true expectation, and reality will differ from it, every time, in
 * the direction nobody could have told you in advance.
 */
export const CYCLE_DEMAND_NOISE = 1.9;
export const CYCLE_SUPPLY_NOISE = 0.30;

/**
 * How much of last month's cycle carries into this one.
 *
 * Without this the noise is white and averages to nothing: every month is an
 * independent nudge, the output-gap term pulls each one straight back, and
 * the economy never has a bad YEAR — only a scattering of unrelated bad
 * months. Carrying the deviation forward is what turns weather into a
 * climate, and it is what makes a downturn something a government is living
 * through rather than something that happened once in March.
 *
 * At 0.88 a run of bad draws compounds into a swing of a point or so of
 * growth that takes a year and a half to unwind — long enough that the
 * government which caused it is often not the one that wears it, which is
 * the most honest thing the economic model does.
 */
export const CYCLE_PERSISTENCE = 0.88;
/** How fast growth eases toward what the IS curve implies. */
export const GROWTH_ADJUST_RATE = 0.22;

/* --- Okun's law: output and jobs --- */

/** Unemployment where inflation neither rises nor falls. */
export const NATURAL_UNEMPLOYMENT = 4.8;
/** Points of unemployment per point of output gap. Okun's coefficient. */
export const OKUN_COEFFICIENT = 0.42;
/** Unemployment is sticky: it eases toward its implied level at this rate. */
export const UNEMPLOYMENT_ADJUST_RATE = 0.17;

/* --- the Phillips curve: jobs and prices --- */

export const INFLATION_TARGET = 2.5;
/** A point of unemployment below natural adds this much inflation a year. */
export const PHILLIPS_SLOPE = 0.55;
/**
 * How much of that slope survives on the slack side of the natural rate.
 *
 * Downward nominal rigidity: firms cut hiring long before they cut wages, and
 * cut wages long before they cut prices. So slack pushes inflation down far
 * more weakly than tightness pushes it up — the flat bottom of the Phillips
 * curve that every real economy has.
 *
 * Without this the curve is symmetric, and a deep enough slump compounds
 * through expectations into a deflationary spiral with no floor: a forty-year
 * run with no government in it reached −32% inflation, an output gap of −24
 * and a policy rate pinned at zero, which is a liquidity trap the model had
 * no way out of because nothing stopped prices falling.
 */
export const PHILLIPS_SLACK_DAMPING = 0.3;
/** How much of last month's inflation carries into expectations. */
export const INFLATION_PERSISTENCE = 0.86;
/** Wages chase prices plus productivity, at this speed. */
export const WAGE_ADJUST_RATE = 0.25;
/** Wage growth above prices that tight labour markets buy. */
export const WAGE_TIGHTNESS_WEIGHT = 0.7;

/* --- the Taylor rule: the central bank, which is not yours --- */

/** The rate the bank would set with inflation on target and no output gap. */
export const POLICY_RATE_NEUTRAL = 4.1;
/** Response to a point of inflation above target. Above 1 by the Taylor principle. */
export const TAYLOR_INFLATION_WEIGHT = 1.4;
/** Response to a point of output gap. */
export const TAYLOR_OUTPUT_WEIGHT = 0.5;
/**
 * The bank moves in steps, not jumps. Max change per month, in points.
 *
 * At 0.25 it took the bank four years to travel from neutral to its ceiling,
 * which is slower than any real central bank and slow enough to be beaten:
 * expectations ratcheted faster than the rate could climb, and a forty-year
 * run with no government in it at all reached 32% inflation. Half a point a
 * month is roughly what a committee meeting monthly actually does, and it is
 * fast enough for the Taylor principle to hold.
 */
export const POLICY_RATE_MAX_STEP = 0.5;
export const POLICY_RATE_FLOOR = 0;
/**
 * The ceiling has to sit above any inflation the model can reach, or the rule
 * inverts: pinned at a rate below inflation, the real rate is negative, which
 * is stimulus, which raises inflation further. A cap low enough to bind is
 * not a safety limit — it is a hyperinflation trap with a friendly name.
 */
export const POLICY_RATE_CEILING = 30;

/* --- confidence --- */

export const CONFIDENCE_START = 55;
export const CONFIDENCE_ADJUST_RATE = 0.2;
/** A point of unemployment above natural costs consumers this much confidence. */
export const CONFIDENCE_UNEMPLOYMENT_WEIGHT = 3.4;
/** A point of inflation above target costs this much. */
export const CONFIDENCE_INFLATION_WEIGHT = 2.6;
/** A point of annual growth is worth this much to business. */
export const CONFIDENCE_GROWTH_WEIGHT = 4.2;
/** Business confidence also reads the political weather: approval − 50. */
export const CONFIDENCE_APPROVAL_WEIGHT = 0.18;

/* --- households and firms --- */

/** Share of GDP that is household income. */
export const HOUSEHOLD_INCOME_SHARE = 0.56;
/** Savings rate with confidence at 50 and the real rate at neutral, %. */
export const SAVINGS_RATE_BASE = 7.5;
/** A point of confidence below 50 raises precautionary saving by this much. */
export const SAVINGS_CONFIDENCE_WEIGHT = 0.09;
/** A point of real rate above neutral raises saving by this much. */
export const SAVINGS_RATE_WEIGHT = 0.55;
export const SAVINGS_RATE_MIN = 0.5;
export const SAVINGS_RATE_MAX = 22;

/** Investment as a share of GDP at neutral confidence and neutral rates. */
export const INVESTMENT_SHARE_BASE = 0.22;
export const INVESTMENT_CONFIDENCE_WEIGHT = 0.0022;
export const INVESTMENT_RATE_WEIGHT = 0.011;

/* --- the cycle --- */

/** Annualised growth below this counts as a contracting month. */
export const CONTRACTION_THRESHOLD = 0;
/** Consecutive contracting months before it is called a recession. */
export const RECESSION_MONTHS = 3;
/** Output gap above this is a boom. */
export const BOOM_OUTPUT_GAP = 1.8;
/** Output gap below this is a slump, whatever growth is doing. */
export const SLUMP_OUTPUT_GAP = -1.8;

/** Months of macro history kept for charts and forecasts. */
export const ECONOMY_HISTORY_LIMIT = 120;
/** How far ahead the Treasury forecast runs, in months. */
export const FORECAST_HORIZON = 12;

/**
 * Revenue is a share of output now, not a flat base scaled by a health dial.
 *
 * 34% of GDP is where a mixed economy with this much public provision
 * actually sits. At GDP_START that is ₡104bn a month, which is what
 * `computeRevenue` returned at the old economy health of 60 — so every
 * fiscal number the rest of the game was tuned against holds, and the
 * tax system in Engine 2C moves this share rather than replacing it.
 */
export const REVENUE_GDP_SHARE = 0.34;

/* ------------------------------------------------------------------ *
 * Engine 2B — government finance
 *
 * The national budget already existed. What did not was everything that
 * makes a budget a constraint rather than a set of sliders: what the debt
 * is actually made of, who is willing to lend, at what price, on what
 * conditions, and what a government has promised about all of it.
 * ------------------------------------------------------------------ */

/* --- the debt, as instruments rather than a single number --- */

/** Maturities the treasury can issue at, in months. */
export const BOND_TENORS = [12, 60, 120] as const;
/**
 * Yield premium over the policy rate for each tenor, in points.
 *
 * Longer money costs more, because the lender is taking a longer view of
 * a government that may not be this one. Issuing short is cheap and leaves
 * a refinancing cliff; issuing long is dear and buys certainty. That trade
 * is the whole reason bonds are modelled separately from a debt total.
 */
export const BOND_TERM_PREMIUM: Record<number, number> = { 12: 0, 60: 0.55, 120: 1.05 };

/** Debt as a share of GDP at which the market starts charging for the risk. */
export const SPREAD_FREE_DEBT_RATIO = 0.55;
/** Extra points of yield per point of debt-to-GDP above that. */
export const SPREAD_PER_DEBT_POINT = 0.028;
/** Extra yield per point of deficit-to-GDP, which lenders read as direction. */
export const SPREAD_PER_DEFICIT_POINT = 0.09;
/** The most the market will add before it simply stops buying. */
export const SPREAD_CEILING = 9;

/* --- credit ratings --- */

/**
 * The rating bands, best first, with the debt-to-GDP each one tolerates.
 *
 * The agencies are not modelled as characters with opinions; they are a
 * transparent function of the numbers, because a rating the player cannot
 * predict is a punishment rather than a constraint. What makes it bite is
 * that the rating sets the spread, the spread sets the debt service, and
 * the debt service is in the budget before the player allocates a credit.
 */
export const CREDIT_RATINGS = [
  { grade: 'AAA', maxDebtRatio: 0.45, spread: 0 },
  { grade: 'AA', maxDebtRatio: 0.65, spread: 0.3 },
  { grade: 'A', maxDebtRatio: 0.85, spread: 0.8 },
  { grade: 'BBB', maxDebtRatio: 1.05, spread: 1.6 },
  { grade: 'BB', maxDebtRatio: 1.3, spread: 3.0 },
  { grade: 'B', maxDebtRatio: 1.7, spread: 5.0 },
  { grade: 'CCC', maxDebtRatio: Infinity, spread: 8.0 },
] as const;

/** A sustained deficit costs a notch regardless of the debt level. */
export const RATING_DEFICIT_NOTCH_AT = 0.06;
/** A recession costs a notch too — lenders price the revenue, not the promise. */
export const RATING_RECESSION_NOTCH = true;
/** Months a downgrade takes to arrive. Agencies are slow, and then sudden. */
export const RATING_REVIEW_MONTHS = 3;

/* --- fiscal rules, which a government imposes on itself --- */

/** PC to legislate a fiscal rule. Binding yourself is a political act. */
export const FISCAL_RULE_PC_COST = 18;
/** PC to repeal one. Cheaper than adopting it, which is the trap. */
export const FISCAL_RULE_REPEAL_PC_COST = 10;
/** Approval cost per month a rule is in breach. Compounds while it lasts. */
export const FISCAL_RULE_BREACH_APPROVAL = 0.9;
/** Coalition mood cost per month in breach, for partners who demanded it. */
export const FISCAL_RULE_BREACH_MOOD = 1.6;
/** Yield relief for a government holding to its own rules, in points. */
export const FISCAL_RULE_CREDIBILITY_RELIEF = 0.35;
/** Months of compliance before the market believes you. */
export const FISCAL_RULE_CREDIBILITY_MONTHS = 12;

/* --- the funds --- */

/**
 * The emergency fund: cash set aside that can only be released against a
 * declared emergency. Drawing it is free; refilling it is not, which is why
 * the honest failure mode is arriving at the next crisis with it empty.
 */
export const EMERGENCY_FUND_TARGET = 60;
/** Share of a surplus that tops it up automatically, before debt repayment. */
export const EMERGENCY_FUND_REFILL_SHARE = 0.15;

/**
 * The reserve fund: a sovereign fund that compounds.
 *
 * It returns more than debt costs, which makes paying into it correct on a
 * long horizon and wrong on a short one — the exact shape of every decision
 * this game is about. A government that funds it is handing a stronger
 * position to whoever wins the election it just lost.
 */
export const RESERVE_FUND_RETURN = 0.0055;
/** Political capital to change the standing contribution. */
export const RESERVE_CONTRIBUTION_PC_COST = 6;
/** The most that can be paid in per month, ₡bn. */
export const RESERVE_CONTRIBUTION_MAX = 40;

/* --- the tiers --- */

/**
 * Share of national revenue that flows automatically to the regions.
 *
 * Regions deliver services and have almost no ability to raise their own
 * money, which is the arrangement most countries actually have and the one
 * that produces the argument the game wants: a national government that
 * cuts the grant has cut regional services without appearing anywhere in
 * the regional accounts.
 */
export const REGIONAL_GRANT_SHARE = 0.22;
/** Share of the grant a region raises locally, from its own base. */
export const LOCAL_OWN_REVENUE_SHARE = 0.18;
/**
 * The funding per seat, per month, that sustains a regional service quality
 * of 60 — the same "adequate" the national sectors are calibrated to.
 *
 * Derived rather than picked: at the starting economy the centre raises
 * ₡104bn a month, sends 22% of it to the regions, and the regions add 18% of
 * that from their own base, which is ₡27bn across 180 seats — ₡0.15bn each.
 * Setting the constant to anything else means the regions start failing on
 * turn one through nobody's decision, which is what happened when this was
 * an unexamined 1.15 and every region decayed to a quality of 17.
 */
export const REGIONAL_FUNDING_PER_SEAT = 0.15;
/** How fast regional service quality drifts toward what funding sustains. */
export const REGIONAL_SERVICE_DRIFT = 0.16;
/** Points of regional satisfaction per point of regional service quality. */
export const REGIONAL_SERVICE_WEIGHT = 0.0022;

/** Months between statements of the public accounts. */
export const BUDGET_UPDATE_INTERVAL = 6;

/* ------------------------------------------------------------------ *
 * Engine 2C — taxation
 * ------------------------------------------------------------------ */

/** The most of the income tax base that deductions can carve away. */
export const INCOME_TAX_DEDUCTION_MAX = 0.28;
/** The most of the income tax yield that credits can pay back out. */
export const INCOME_TAX_CREDIT_MAX = 0.22;
/**
 * How much burden a full swing of progressivity moves between top and bottom.
 *
 * Progressivity raises no extra money — it collects the same total from
 * different people — so this figure never appears in the yield. It appears
 * only in who resents you for it.
 */
export const TAX_PROGRESSIVITY_SHIFT = 7;
/**
 * How long a tax change stays raw, in months.
 *
 * A rise is resented sharply and then it becomes the rate. Eighteen months
 * means a government can raise something unpopular at the start of a term
 * and have it stop costing votes before the election — a cynical strategy,
 * and one the game should permit rather than pretend does not work.
 */
export const TAX_CHANGE_MEMORY_MONTHS = 18;
/** Political capital to legislate a rate change. */
export const TAX_CHANGE_PC_COST = 12;

/* ------------------------------------------------------------------ *
 * Engine 2D — industries
 * ------------------------------------------------------------------ */

/**
 * How fast an industry moves toward the health its conditions imply.
 *
 * Low on purpose. A factory does not close because rates went up last
 * Tuesday, and it does not reopen the month they come back down. The
 * practical effect is that a government usually inherits the industrial
 * consequences of the previous one's decisions and hands its own to the
 * next, which is both true and the most interesting thing about the lag.
 */
export const INDUSTRY_ADJUST_RATE = 0.055;

/**
 * The share of employment that is not in any of the twenty industries.
 *
 * Public administration, self-employment, and everything uncounted. It is
 * here rather than being distributed among the twenty because pretending it
 * belongs somewhere would put people in industries they do not work in.
 */
export const INDUSTRY_UNCOUNTED_EMPLOYMENT = 0.065;

/** Points of industry health per ₡bn of funding for the sector it lives on. */
export const INDUSTRY_PUBLIC_FUNDING_WEIGHT = 0.45;

/** Points of regional support per point of regional employment gap. */
export const REGIONAL_JOBS_WEIGHT = 0.0035;

/* ------------------------------------------------------------------ *
 * Engine 2E — population and demographics
 *
 * The slowest system in the game, and the one with the longest reach. A
 * birth rate decided now changes the workforce in twenty years and the
 * pension bill in sixty-five. No government in a four-year term will see
 * the result of anything in this file, which is precisely why it is worth
 * modelling: it is the part of governing that is genuinely about somebody
 * else's problem, and the game should let a player choose to care.
 * ------------------------------------------------------------------ */

/** Starting population, in millions. */
export const POPULATION_START = 42.6;

/** Births per thousand people per year at the start. */
export const BIRTH_RATE_START = 11.4;
/**
 * Deaths per thousand people per year at the start.
 *
 * This is a REPORTED figure, not a setting: the model derives deaths from
 * the age structure — the retired die after however many years past
 * retirement the health service has bought them — and this is what that
 * arithmetic produces at the starting cohorts. Stating the death rate
 * independently is how the first version of this file came to have a
 * population whose deaths did not match its own age structure.
 */
export const IMPLIED_DEATH_RATE_START = 12.1;

/** Years spent as a child before entering the workforce. */
export const YEARS_AS_YOUTH = 18;
/** Years spent in the workforce before retiring. */
export const YEARS_AT_WORK = 47;
/** Deaths per thousand per year among people who have not yet retired. */
export const PREMATURE_DEATH_RATE = 1.15;

/**
 * How arrivals are distributed across the three cohorts.
 *
 * Migrants are overwhelmingly of working age. That is the entire reason
 * migration is an answer to an ageing population, and the entire reason it
 * is argued about.
 */
export const MIGRANT_YOUTH_SHARE = 0.2;
export const MIGRANT_WORKING_SHARE = 0.74;
export const MIGRANT_RETIRED_SHARE = 0.06;
/** Years of life expectancy at birth. */
export const LIFE_EXPECTANCY_START = 81.2;

/**
 * The shares of the population under working age, of working age, and past
 * it. They sum to one and drift with births, deaths and migration.
 */
export const AGE_YOUTH_START = 0.203;
export const AGE_WORKING_START = 0.622;
export const AGE_RETIRED_START = 0.175;

/** Net migration per thousand people per year, at neutral conditions. */
export const MIGRATION_BASE = 3.2;
/** Extra net migration per point of unemployment below the natural rate. */
export const MIGRATION_JOBS_WEIGHT = 0.55;
/** Extra net migration per point of average service quality above 60. */
export const MIGRATION_SERVICES_WEIGHT = 0.06;
/** How fast the actual flow eases toward what conditions imply. */
export const MIGRATION_ADJUST_RATE = 0.12;

/** Share of the working-age population in or seeking work. */
export const PARTICIPATION_START = 0.647;
/** Participation rises this much per point of unemployment below natural. */
export const PARTICIPATION_JOBS_WEIGHT = 0.004;
/** How fast participation follows conditions. People are slow to re-enter. */
export const PARTICIPATION_ADJUST_RATE = 0.05;

/** Share of the population in cities at the start. */
export const URBANISATION_START = 0.71;
/** Per year, how much of the rural share moves to cities on its own. */
export const URBANISATION_DRIFT = 0.0022;

/** People per household at the start. Falls slowly as the country ages. */
export const HOUSEHOLD_SIZE_START = 2.41;

/**
 * Skills: the share of the working-age population with the training the
 * economy is asking for.
 *
 * Moved by education spending, and by nothing else that is fast. A skills
 * shortage is the most common way a government discovers that the schools
 * budget it cut eight years ago was a technology policy.
 */
export const SKILLS_START = 0.62;
/*
 * Half a per cent of the gap a month. A full term of excellent schools
 * closes about a sixth of it, which is the pace the story requires: the
 * schools budget a government cuts is a technology policy its successor's
 * successor discovers.
 */
export const SKILLS_ADJUST_RATE = 0.004;
/** Points of industry health lost per point of skills shortage. */
export const SKILLS_SHORTAGE_WEIGHT = 0.4;

/** Life expectancy gained per point of health-sector health above 60, a year. */
export const LIFE_EXPECTANCY_PER_HEALTH = 0.016;
/** Births per thousand gained per point of average service quality above 60. */
export const BIRTH_RATE_PER_SERVICE = 0.012;
/** How fast the vital rates follow conditions. Generational, not annual. */
export const VITAL_RATE_ADJUST = 0.006;

/**
 * How often the seats are redistributed between regions, in turns.
 *
 * Forty-eight months — once a term. Population moves, and when the boundary
 * commission catches up, the electoral map the government won on is not the
 * one it will defend. A player who lets a region empty out is handing seats
 * to wherever those people went.
 */
export const APPORTIONMENT_INTERVAL = 48;
/** The fewest seats any region can be reduced to. */
export const MIN_REGION_SEATS = 4;

/** Months of demographic history kept. */
export const DEMOGRAPHY_HISTORY_LIMIT = 120;

/* ------------------------------------------------------------------ *
 * Engine 2F — infrastructure
 *
 * The most politically honest mechanic in the game. Maintaining a road
 * costs money now and produces nothing anyone notices. Not maintaining it
 * costs nothing now and produces nothing anyone notices either — for about
 * four years. Deferred maintenance is free money for exactly one electoral
 * cycle, and the bill lands on whoever is in office when the bridge shuts.
 * ------------------------------------------------------------------ */

/** Condition every asset starts at. Inherited, and not quite new. */
export const CONDITION_START = 74;

/**
 * Maintenance spending as a multiple of what full upkeep costs.
 *
 * One holds every asset where it is. Below one, conditions fall and the
 * backlog grows. Above one, the backlog is worked off — slowly, because
 * catching up costs more than keeping up ever would have.
 */
export const MAINTENANCE_LEVEL_START = 1;
export const MAINTENANCE_LEVEL_MAX = 1.8;

/**
 * What a point of deferred maintenance adds to the backlog.
 *
 * Above one, because catching up is dearer than keeping up: a resurfacing
 * deferred becomes a reconstruction. This is the entire compounding, and it
 * is why the trap is a trap rather than a loan.
 */
export const BACKLOG_COMPOUNDING = 1.45;
/** Share of the backlog that above-full maintenance works off each month. */
export const BACKLOG_REPAYMENT_RATE = 0.035;

/** Condition below which an asset starts failing visibly. */
export const CONDITION_FAILING = 45;
/** Condition below which it is a scandal. */
export const CONDITION_CRITICAL = 28;

/** Points of the serving sector's health per point of condition above 60. */
export const CONDITION_TO_SECTOR = 0.22;
/** Points of industry health per point of enabling capacity shortfall. */
export const CAPACITY_TO_INDUSTRY = 0.35;
/** Utilisation above this is congestion, and people feel it. */
export const CONGESTION_THRESHOLD = 1;

/** Political capital to start a capital project. */
export const PROJECT_PC_COST = 10;
/** The most projects that can be under construction at once. */
export const MAX_ACTIVE_PROJECTS = 6;
/** Share of a project's cost paid each month it is under construction. */
export const PROJECT_MONTHLY_SHARE = 1;

/* ------------------------------------------------------------------ *
 * Engine 2G — government services
 *
 * Demand is not something a government sets. Every service is driven by a
 * population figure that moves on its own, so holding a budget flat is a
 * cut — automatically, in real terms, invisibly, and it is the single most
 * common way a real public service is degraded.
 * ------------------------------------------------------------------ */

/** Quality every service starts at, matching the sector health it reports to. */
export const SERVICE_QUALITY_START = 60;
/** How fast a service's quality follows the funding it is getting. */
export const SERVICE_QUALITY_DRIFT = 0.12;
/** How fast staffing follows funding. Hiring and firing both take time. */
export const SERVICE_STAFFING_DRIFT = 0.08;

/**
 * Months of waiting at a service funded exactly to its demand.
 *
 * Not zero. Every real service has a queue at full funding; what
 * underfunding does is lengthen it, and what a player is deciding is how
 * long is acceptable rather than whether a queue exists.
 */
export const WAIT_AT_FULL_FUNDING = 1.2;
/** Months added to the wait per point of funding shortfall, as a ratio. */
export const WAIT_PER_SHORTFALL = 14;
/** The longest wait the model will report. Past this it is simply broken. */
export const WAIT_CEILING = 48;

/** Points of sector health per point of the services in it being underfunded. */
export const SERVICE_TO_SECTOR = 0.55;

/* ------------------------------------------------------------------ *
 * Engine 3A — the world, and diplomacy
 *
 * The asymmetry everything here depends on: a large country's opinion
 * costs more to ignore than a small one's. Every diplomatic mechanic
 * scales with the other side's power, which is why a government can
 * afford to be principled with Holm and cannot afford to be principled
 * with Astrun — and why that is an uncomfortable position rather than a
 * puzzle with a solution.
 * ------------------------------------------------------------------ */

/** Relations run −100 (hostile) to +100 (allied). */
export const RELATIONS_MIN = -100;
export const RELATIONS_MAX = 100;
/** Above this, a country is a friend. Below the negative, an adversary. */
export const RELATIONS_FRIENDLY = 40;
export const RELATIONS_HOSTILE = -40;

/** Relations drift toward this each month, from ideology and trade alone. */
export const RELATIONS_DRIFT_RATE = 0.04;
/** Points of natural relations per point of ideological affinity. */
export const RELATIONS_IDEOLOGY_WEIGHT = 55;
/** Points of natural relations from sharing a border. Neighbours argue. */
export const RELATIONS_NEIGHBOUR_PENALTY = -12;
/** Points of natural relations per unit of trade dependence. */
export const RELATIONS_TRADE_WEIGHT = 34;

/** Political capital costs for the diplomatic instruments. */
export const DIPLOMACY_PC_COSTS = {
  openEmbassy: 6,
  closeEmbassy: 4,
  appointAmbassador: 3,
  meeting: 4,
  stateVisit: 12,
  summit: 16,
  protest: 3,
  expelDiplomats: 8,
  recogniseState: 10,
  proposeTreaty: 14,
  withdrawTreaty: 10,
  sanction: 12,
  liftSanction: 6,
} as const;

/** Relations moved by each instrument, before the other side's power scales it. */
export const DIPLOMACY_EFFECTS = {
  embassy: 6,
  ambassador: 4,
  meeting: 3,
  stateVisit: 9,
  summit: 7,
  protest: -6,
  expelDiplomats: -22,
  recognition: 14,
  treatySigned: 12,
  treatyWithdrawn: -18,
  sanction: -30,
  sanctionLifted: 10,
} as const;

/**
 * How much an embassy slows the decay of relations.
 *
 * The quiet argument for keeping missions open in countries nobody likes:
 * they do not improve relations much, they stop them deteriorating. Closing
 * one is cheap, popular, and removes the only channel through which the next
 * crisis could have been defused.
 */
export const EMBASSY_STABILISER = 0.55;

/** Months an ambassador takes to have any effect at all. */
export const AMBASSADOR_SETTLING_MONTHS = 4;

/** Months between summits a country will attend. */
export const SUMMIT_COOLDOWN = 12;
/** Approval a successful summit is worth at home. */
export const SUMMIT_APPROVAL = 1.8;
/** Approval a state visit is worth, and the cost if relations are hostile. */
export const STATE_VISIT_APPROVAL = 1.2;

/** Treaties in force at once. Each is a commitment, not a bonus. */
export const MAX_TREATIES = 10;
/** Relations below which a country will not sign anything. */
export const TREATY_MINIMUM_RELATIONS = 15;
/** Relations below which even a non-aggression pact is refused. */
export const PACT_MINIMUM_RELATIONS = -25;

/** Months of world history kept. */
export const WORLD_HISTORY_LIMIT = 120;
