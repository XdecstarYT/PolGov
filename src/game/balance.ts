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

/**
 * One turn is one WEEK.
 *
 * It used to be a month, and a term was twelve of them — a year in office,
 * which is not a term anywhere. A week is the unit a government actually
 * works in: the grid is weekly, the press cycle is weekly, and the gap
 * between deciding something and its first consequence is measured in weeks
 * rather than in quarters.
 *
 * Everything else in this file follows from that constant. Rates are still
 * WRITTEN the way a person states them — per month, per year, in months —
 * and converted here, once, by the helpers below. That keeps the numbers
 * readable and means the turn length can be changed again by editing one
 * line rather than by hunting through nine systems for stray divisions by
 * twelve.
 */
export const TURNS_PER_YEAR = 52;

/** A rate stated per month, as a rate per turn. */
export const perMonth = (rate: number): number => (rate * 12) / TURNS_PER_YEAR;

/** An amount stated per year, as an amount per turn. */
export const perYear = (amount: number): number => amount / TURNS_PER_YEAR;

/**
 * A number of months, as a number of turns.
 *
 * Rounded, because a month is not a whole number of weeks and the game does
 * not need it to be. Never rounds below one: a one-month process must still
 * take at least one turn or it happens instantly and invisibly.
 */
export const months = (n: number): number =>
  Math.max(1, Math.round((n * TURNS_PER_YEAR) / 12));

/**
 * A persistence coefficient stated per month, as one per turn.
 *
 * An AR(1) carried forward more often has to carry less each time to decay
 * at the same speed. Getting this wrong is the classic weekly-conversion
 * bug: the same 0.88 applied weekly instead of monthly turns a cycle that
 * faded over a year and a half into one that never fades at all.
 */
export const persistPerMonth = (coefficient: number): number =>
  coefficient ** (12 / TURNS_PER_YEAR);

/**
 * The size of a shock stated per month, as one per turn.
 *
 * NOT the same conversion as a rate, and this is the subtle one. A rate
 * applied more often does less each time, so it divides. A random shock
 * drawn more often accumulates differently: an AR(1) driven by noise has
 * stationary variance σ²/(1−ρ²), so matching the amount of cycle across two
 * sampling frequencies means
 *
 *     σ_weekly = σ_monthly · √((1 − ρ_weekly²) / (1 − ρ_monthly²))
 *
 * which is roughly a half rather than the ~0.23 a rate would take. Dividing
 * it like a rate flattened the economy exactly the way the first version of
 * this model did: growth never went negative, half of forty-year careers
 * contained no recession at all, and unemployment moved by under a point in
 * four decades.
 */
export const noisePerMonth = (sigma: number, persistence: number): number => {
  const weekly = persistPerMonth(persistence);
  return sigma * Math.sqrt((1 - weekly ** 2) / (1 - persistence ** 2));
};

/** Four years, which is what a term is. */
export const YEARS_PER_TERM = 4;
export const TURNS_PER_TERM = TURNS_PER_YEAR * YEARS_PER_TERM;

/** The last eight weeks before polling day are the campaign. */
export const CAMPAIGN_WEEKS = 8;
export const CAMPAIGN_START_TURN = TURNS_PER_TERM - CAMPAIGN_WEEKS + 1;

/**
 * The budget is set quarterly — thirteen weeks — unless an emergency budget
 * forces it open. A government that could rewrite its spending every week
 * would never have to live with a decision.
 */
export const BUDGET_TURN_INTERVAL = 13;

/* ------------------------------------------------------------------ *
 * Political Capital
 * ------------------------------------------------------------------ */

export const PC_MAX = 100;
export const PC_START = 50;
/** Regen = base + (approval/100 * scale). At 50% approval this is ~16/turn. */
export const PC_REGEN_BASE = perMonth(10);
export const PC_REGEN_APPROVAL_SCALE = perMonth(12);

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
  /**
   * Removing a serving commander.
   *
   * Never presented as a political act and always read as one, which is
   * why it costs capital rather than nothing. The larger cost is not
   * here: it is with the officers who did not lose a battle this week
   * and have now watched what happens to the one who did.
   */
  dismissCommander: 14,
} as const;

/**
 * What laying down a ship costs politically.
 *
 * The argument is never about the ship. It is about the yard it is built
 * in and the seats around it, which is why the decision is expensive
 * here and why cancelling one later is so much harder than it looks on
 * the spreadsheet.
 */
export const SHIP_ORDER_PC = 16;

/** And a squadron, which nobody's constituency is built around. */
export const SQUADRON_ORDER_PC = 9;

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
export const APPROVAL_FATIGUE_PER_TURN = perMonth(0.16);
export const APPROVAL_FATIGUE_CAP = 7;
/** How fast approval closes the gap to its target each turn. */
export const APPROVAL_INERTIA = persistPerMonth(0.34);

export const PUBLIC_ADDRESS_APPROVAL = 3.5;
/** Addresses lose potency if spammed within a term. */
export const PUBLIC_ADDRESS_DIMINISH = 0.6;

/* ------------------------------------------------------------------ *
 * Treasury, debt, sectors
 * ------------------------------------------------------------------ */

/** Revenue = base * (0.5 + economyHealth/100). At health 60 this is ~104.5. */
export const REVENUE_BASE = perYear(95 * 12);
/** Per-turn interest charged on outstanding debt (~11%/yr). */
export const DEBT_INTEREST_RATE = perMonth(0.009);
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
/**
 * What each sector is funded at, ₡bn A YEAR.
 *
 * Annual, because that is how a budget is stated everywhere outside this
 * file — a finance minister does not think in weekly rates, and neither
 * should the player. The engine divides by `TURNS_PER_YEAR` at the point of
 * spending and nowhere else.
 *
 * These are twelve times what they were when a turn was a month, so the real
 * fiscal position is unchanged.
 */
export const SECTOR_BASELINE_FUNDING: Record<SectorKey, number> = {
  economy: 240,
  health: 360,
  education: 240,
  infrastructure: 240,
  environment: 168,
};

export const SECTOR_START_HEALTH: Record<SectorKey, number> = {
  economy: 58,
  health: 62,
  education: 60,
  infrastructure: 55,
  environment: 52,
};

/** How fast health closes the gap to its funding-implied equilibrium. */
export const SECTOR_DRIFT_RATE = perMonth(0.18);
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
export const FUNDS_PER_MEMBER = perYear(0.055 * 12);
/** Additional donations scale with standing: this much at 100% approval. */
export const FUNDS_APPROVAL_BONUS = perYear(6 * 12);
/** Running the party costs this much per turn before anything is spent. */
export const PARTY_OVERHEADS = perYear(3.5 * 12);
/** Each level of headquarters investment adds this to fundraising. */
export const FUNDS_PER_HQ_LEVEL = perYear(2.2 * 12);

/** Membership drifts toward a level implied by approval, at this rate. */
export const MEMBERS_DRIFT_RATE = perMonth(0.12);
/** Members at 0% and 100% approval respectively, in thousands. */
export const MEMBERS_FLOOR = 60;
export const MEMBERS_CEILING = 340;
/** Members lost when the leadership crosses one of its own faction's lines. */
export const MEMBERS_LOST_PER_REBELLION = 6;

/** Cohesion drifts toward this, modified by authority and recent rebellions. */
export const COHESION_BASE_TARGET = 62;
export const COHESION_DRIFT_RATE = perMonth(0.22);
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
export const AUTHORITY_DRIFT_RATE = perMonth(0.2);
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
export const CHALLENGE_COOLDOWN_TURNS = months(6);
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
export const MOOD_DRIFT_RATE = perMonth(0.25);
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
export const IMPLEMENTATION_DELAY_MINOR = months(1);
export const IMPLEMENTATION_DELAY_MAJOR = months(2);

/** Turns before a bill with a sunset clause lapses unless renewed. */
export const SUNSET_DEFAULT_TURNS = months(8);

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

/*
 * Two a turn was two a month. A turn is a week now, so the CHANCE of one
 * arriving is scaled to keep the same number per year — otherwise a
 * government faces four times as many crises with a quarter of the capital
 * to answer them, which is not a harder game, just an impossible one.
 */
export const MAX_EVENTS_PER_TURN = 2;
/** Probability that any event at all fires on a given turn. */
export const EVENT_BASE_CHANCE = perMonth(0.62);
/** Probability of a second event, given the first fired. */
export const EVENT_SECOND_CHANCE = perMonth(0.3);

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
export const REACH_DECAY_PER_TURN = perMonth(0.22);
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
export const OUTPUT_GAP_CLOSE_RATE = perMonth(0.032);
/** How much harder a boom is pulled back than a slump is pulled up. */
export const OUTPUT_GAP_BOOM_DAMPING = 1.9;

/** Productivity index at the start. 100 is "as productive as last decade". */
export const PRODUCTIVITY_START = 100;
/** Drift per month toward the level education and infrastructure imply. */
export const PRODUCTIVITY_DRIFT_RATE = perMonth(0.012);
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
export const CYCLE_DEMAND_NOISE = noisePerMonth(1.5, 0.88);
export const CYCLE_SUPPLY_NOISE = noisePerMonth(0.3, 0.88);

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
export const CYCLE_PERSISTENCE = persistPerMonth(0.88);
/** How fast growth eases toward what the IS curve implies. */
export const GROWTH_ADJUST_RATE = perMonth(0.22);

/* --- Okun's law: output and jobs --- */

/** Unemployment where inflation neither rises nor falls. */
export const NATURAL_UNEMPLOYMENT = 4.8;
/** Points of unemployment per point of output gap. Okun's coefficient. */
export const OKUN_COEFFICIENT = 0.42;
/** Unemployment is sticky: it eases toward its implied level at this rate. */
export const UNEMPLOYMENT_ADJUST_RATE = perMonth(0.17);

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
export const INFLATION_PERSISTENCE = persistPerMonth(0.86);
/** Wages chase prices plus productivity, at this speed. */
export const WAGE_ADJUST_RATE = perMonth(0.25);
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
export const POLICY_RATE_MAX_STEP = perMonth(0.5);
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
export const CONFIDENCE_ADJUST_RATE = perMonth(0.2);
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
export const RECESSION_TURNS = months(3);
/** Output gap above this is a boom. */
export const BOOM_OUTPUT_GAP = 1.8;
/** Output gap below this is a slump, whatever growth is doing. */
export const SLUMP_OUTPUT_GAP = -1.8;

/** Months of macro history kept for charts and forecasts. */
export const ECONOMY_HISTORY_LIMIT = 120;
/** How far ahead the Treasury forecast runs, in months. */
export const FORECAST_HORIZON = months(12);

/**
 * Revenue is a share of output now, not a flat base scaled by a health dial.
 *
 * Just under 39% of GDP, which is where a state with this much public
 * provision actually sits — twenty services, twenty infrastructure assets,
 * a pension system and a health service do not come out of a third of
 * national output, and pretending they did left the country running a
 * deficit of 7% of GDP in week one through nobody's decision.
 *
 * It still does not balance. Spending is about 42% of output, so a new
 * government inherits a structural deficit of roughly three points — real,
 * survivable, and the first thing a serious finance minister would want to
 * do something about. That is a better starting position than a balanced
 * one: it gives the player a problem on day one that they did not cause and
 * cannot ignore.
 */
export const REVENUE_GDP_SHARE = 0.386;

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
export const RATING_REVIEW_TURNS = months(3);

/* --- fiscal rules, which a government imposes on itself --- */

/** PC to legislate a fiscal rule. Binding yourself is a political act. */
export const FISCAL_RULE_PC_COST = 18;
/** PC to repeal one. Cheaper than adopting it, which is the trap. */
export const FISCAL_RULE_REPEAL_PC_COST = 10;
/** Approval cost per month a rule is in breach. Compounds while it lasts. */
export const FISCAL_RULE_BREACH_APPROVAL = perMonth(0.9);
/** Coalition mood cost per month in breach, for partners who demanded it. */
export const FISCAL_RULE_BREACH_MOOD = perMonth(1.6);
/** Yield relief for a government holding to its own rules, in points. */
export const FISCAL_RULE_CREDIBILITY_RELIEF = 0.35;
/** Months of compliance before the market believes you. */
export const FISCAL_RULE_CREDIBILITY_TURNS = months(12);

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
export const RESERVE_FUND_RETURN = perMonth(0.0055);
/** Political capital to change the standing contribution. */
export const RESERVE_CONTRIBUTION_PC_COST = 6;
/** The most that can be paid in per month, ₡bn. */
export const RESERVE_CONTRIBUTION_MAX = perYear(40 * 12);

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
 * The funding per seat, per YEAR, that sustains a regional service quality
 * of 60 — the same "adequate" the national sectors are calibrated to.
 *
 * Derived rather than picked: at the starting economy the centre raises
 * ₡1,420bn a year, sends 22% of it to the regions, and the regions add 18%
 * of that from their own base, which is ₡369bn across 180 seats — ₡2.05bn
 * each. Setting the constant to anything else means the regions start
 * failing in week one through nobody's decision, which is what happened
 * when this was an unexamined 1.15 and every region decayed to a quality
 * of 17.
 */
export const REGIONAL_FUNDING_PER_SEAT = 2.05;
/** How fast regional service quality drifts toward what funding sustains. */
export const REGIONAL_SERVICE_DRIFT = perMonth(0.16);
/** Points of regional satisfaction per point of regional service quality. */
export const REGIONAL_SERVICE_WEIGHT = 0.0022;

/** Months between statements of the public accounts. */
export const BUDGET_UPDATE_INTERVAL = months(6);

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
export const TAX_CHANGE_MEMORY_MONTHS = months(18);
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
export const INDUSTRY_ADJUST_RATE = perMonth(0.055);

/**
 * The share of employment that is not in any of the twenty industries.
 *
 * Public administration, self-employment, and everything uncounted. It is
 * here rather than being distributed among the twenty because pretending it
 * belongs somewhere would put people in industries they do not work in.
 */
export const INDUSTRY_UNCOUNTED_EMPLOYMENT = 0.065;

/**
 * Points of industry health per ₡bn A YEAR of funding above or below what
 * the sector it lives on is normally funded at.
 *
 * At 0.08, doubling a sector's budget is worth about thirty points to the
 * industry that lives on it — a lot, and it should be: the state is that
 * industry's only customer.
 */
export const INDUSTRY_PUBLIC_FUNDING_WEIGHT = 0.08;

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

/**
 * What net migration cannot exceed, per thousand per year, either way.
 *
 * Not a taste: a physical limit on how fast people can actually move, and
 * the thing that stops the most dangerous feedback loop in the engine.
 *
 * Without it, migration rises with jobs and services, the arrivals join
 * the workforce, a larger workforce raises potential growth, faster growth
 * cuts unemployment, and lower unemployment raises migration again. It
 * compounds every week with nothing to stop it: a measured run of Canada
 * reached net migration of 97 per thousand — a tenth of the country
 * arriving every year — and trend growth of 12% a year, four terms in,
 * under a government that had done nothing at all.
 *
 * The ceiling is roughly the highest rate any country has actually
 * sustained, and the floor is roughly the fastest a country empties short
 * of a war. Both are reachable; neither is an equilibrium.
 */
export const MIGRATION_MAX = 18;
export const MIGRATION_MIN = -9;
/** How fast the actual flow eases toward what conditions imply. */
export const MIGRATION_ADJUST_RATE = perMonth(0.12);

/** Share of the working-age population in or seeking work. */
export const PARTICIPATION_START = 0.647;
/** Participation rises this much per point of unemployment below natural. */
export const PARTICIPATION_JOBS_WEIGHT = 0.004;
/** How fast participation follows conditions. People are slow to re-enter. */
export const PARTICIPATION_ADJUST_RATE = perMonth(0.05);

/** Share of the population in cities at the start. */
/**
 * Deprecated: the national urban share is now derived.
 *
 * It is the population-weighted average of the regions' own shares, which
 * is what it always was in reality — a country is 71% urban because of
 * where its people live, not the other way round. Kept only so an older
 * save that stored the figure still reads.
 */
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
export const SKILLS_ADJUST_RATE = perMonth(0.004);
/** Points of industry health lost per point of skills shortage. */
export const SKILLS_SHORTAGE_WEIGHT = 0.4;

/** Life expectancy gained per point of health-sector health above 60, a year. */
export const LIFE_EXPECTANCY_PER_HEALTH = 0.016;
/** Births per thousand gained per point of average service quality above 60. */
export const BIRTH_RATE_PER_SERVICE = 0.012;
/** How fast the vital rates follow conditions. Generational, not annual. */
export const VITAL_RATE_ADJUST = perMonth(0.006);

/**
 * How often the seats are redistributed between regions, in turns.
 *
 * Forty-eight months — once a term. Population moves, and when the boundary
 * commission catches up, the electoral map the government won on is not the
 * one it will defend. A player who lets a region empty out is handing seats
 * to wherever those people went.
 */
export const APPORTIONMENT_INTERVAL = months(48);
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
export const BACKLOG_REPAYMENT_RATE = perMonth(0.035);

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
export const SERVICE_QUALITY_DRIFT = perMonth(0.12);
/** How fast staffing follows funding. Hiring and firing both take time. */
export const SERVICE_STAFFING_DRIFT = perMonth(0.08);

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
export const RELATIONS_DRIFT_RATE = perMonth(0.04);
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
export const AMBASSADOR_SETTLING_MONTHS = months(4);

/** Months between summits a country will attend. */
export const SUMMIT_COOLDOWN = months(12);
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

/* ------------------------------------------------------------------ *
 * The budget engine
 *
 * A budget is the most important vote a government takes. Everything
 * else it does is optional; this is the one it cannot avoid, cannot
 * delay past the year, and cannot lose without the whole thing coming
 * down. The mechanics below exist to make losing it possible.
 * ------------------------------------------------------------------ */

/** Political capital to move a single line, however far. */
export const BUDGET_LINE_PC_COST = 2;
/** Political capital to put the finished budget to the chamber. */
export const BUDGET_PRESENT_PC_COST = 14;

/**
 * How far a line can move in one budget, as a share of what it was.
 *
 * Nobody halves a department in a year. Staff are on contracts, buildings
 * are leased, and a minister who is told to find forty per cent resigns.
 * A budget is a series of small movements repeated over years, which is
 * why a government that wants to change the shape of the state has to win
 * twice.
 */
export const BUDGET_MAX_CUT = 0.25;
export const BUDGET_MAX_RISE = 0.4;

/** Coalition mood lost per percentage point cut from a partner's ministry. */
export const MINISTRY_CUT_MOOD = 0.55;
/** Mood gained per point ADDED, which is worth much less. Gratitude is cheap. */
export const MINISTRY_RISE_MOOD = 0.18;

/**
 * How much a minister's own party backs the budget in the division.
 *
 * A partner whose ministry was cut hard votes for the budget anyway — they
 * are in the government — but their backbenchers do not, and that is where
 * budgets are actually lost.
 */
export const MINISTRY_REBELLION_PER_POINT = 0.011;

/** Approval cost of losing a budget vote. A government that cannot pass one. */
export const BUDGET_DEFEAT_APPROVAL = -9;
/** Political capital cost of having to come back with another one. */
export const BUDGET_DEFEAT_PC = 20;
/** Coalition mood cost across every partner when the budget falls. */
export const BUDGET_DEFEAT_MOOD = -12;

/**
 * Years a capital commitment binds the budget for.
 *
 * Capital spending is contracted. A successor who wants the money back has
 * to break a contract, which costs more than the money — this is why so
 * much of any government's budget was decided by somebody else.
 */
export const CAPITAL_COMMITMENT_YEARS = 3;

/** Share of a capital line that reaches infrastructure condition, per year. */
export const CAPITAL_TO_CONDITION = 0.035;

/**
 * The share of the budget nobody votes on.
 *
 * Pensions, debt service and standing legal entitlements are paid whether
 * or not a budget passes, because they are statute rather than
 * appropriation. It is the single most important fact about public
 * finance and almost no game says it: most of the budget is not a
 * decision, and the argument is always about the remaining fifth.
 */
export const STATUTORY_SERVICES = ['pensions', 'welfare', 'disability'] as const;

/* ------------------------------------------------------------------ *
 * Supply
 * ------------------------------------------------------------------ */

/**
 * What it costs to buy a budget through a chamber you do not control.
 *
 * A minority government that could never pass a budget would simply be a
 * losing position rather than a hard one, so there has to be a way through
 * — and in real parliaments there is exactly one: confidence and supply. An
 * opposition party agrees to abstain on the budget, for a year, in return
 * for something. The price is their seats and their distance from you, and
 * it is paid partly in capital and partly in your own party's patience,
 * because nothing annoys a backbench like watching the other side get paid.
 */
export const SUPPLY_PC_BASE = 8;
export const SUPPLY_PC_PER_SEAT = 0.45;
/** Multiplier on the capital cost per unit of ideological distance. */
export const SUPPLY_DISTANCE_COST = 0.85;
/** What a deal with the other side costs in your own party's cohesion. */
export const SUPPLY_COHESION_COST = -3.5;

/* ------------------------------------------------------------------ *
 * The rooms where nobody is in charge
 * ------------------------------------------------------------------ */

/**
 * What walking out of an international body costs.
 *
 * Not paid to the body. Paid to every government watching, which is all of
 * them, and in the one currency a country cannot print: the expectation
 * that its commitments mean something. The dues stop immediately and this
 * does not come back for years.
 */
export const WITHDRAWAL_REPUTATION = -9;
/** And every member of the room it left takes it personally. */
export const WITHDRAWAL_RELATIONS = -7;

/**
 * Putting a resolution and losing it.
 *
 * Worse than not putting it. The room has now formally declined, and that
 * is a fact about this government that anybody can cite — which is why a
 * foreign ministry counts the votes before it tables anything.
 */
export const RESOLUTION_DEFEAT_INFLUENCE = -2.5;
/** A state does not forget who named it. */
export const RESOLUTION_TARGET_RELATIONS = -14;

/* ------------------------------------------------------------------ *
 * Trade
 * ------------------------------------------------------------------ */

/**
 * How open the economy is.
 *
 * Exports and imports each around a fifth of output, with imports slightly
 * ahead, which is a middling open economy running a small deficit — the
 * position most countries of this size are actually in and a more
 * interesting one to start from than balance.
 */
export const EXPORT_INTENSITY = 0.19;
export const IMPORT_INTENSITY = 0.205;

/**
 * How much more a neighbour trades than its size implies.
 *
 * The gravity model, which is one of the most reliably predictive things in
 * economics and almost never appears in a game. Distance is not a modifier
 * on a relationship; it is most of the relationship.
 */
export const NEIGHBOUR_GRAVITY = 2.4;

/** How far relations move trade at the extremes, either way. */
export const TRADE_RELATIONS_WEIGHT = 0.25;
/** What a trade agreement is worth on top of that. */
export const TRADE_TREATY_BONUS = 1.22;
/** What sanctions leave of a trading relationship. */
export const SANCTION_TRADE_MULTIPLIER = 0.2;
/** How much a point of tariff suppresses the flow it falls on. */
export const TARIFF_ELASTICITY = 0.9;
/** Supply chains are physical objects with contracts attached. */
export const TRADE_ADJUST_RATE = 0.035;

/**
 * How long a partner takes to answer a tariff.
 *
 * Six weeks: long enough that the domestic benefit has been announced and
 * the cost has not arrived, which is exactly why protection is politically
 * attractive and economically expensive.
 */
export const RETALIATION_DELAY = 6;

/**
 * And how hard, by disposition.
 *
 * An assertive government answers a tariff with a larger one. An
 * institutional one files a complaint instead, which is slower and worse
 * for a government that cares what the world thinks of it.
 */
export const RETALIATION_RATIO: Record<string, number> = {
  assertive: 1.35,
  mercantile: 1.1,
  institutional: 0.8,
  guarded: 1.0,
  aligned: 0.7,
  volatile: 1.5,
};

/** Political capital to lay a tariff on one partner, or take one off. */
export const TARIFF_PC_COST = 7;
/** And to take a complaint to the trade body. */
export const TRADE_COMPLAINT_PC_COST = 9;
/** The most one government may add to another's goods, in points. */
export const SURCHARGE_MAX = 30;

/**
 * What using the institutions is worth.
 *
 * A country that takes a trade dispute to the Convention rather than
 * answering in kind is read by every other government as one that settles
 * arguments a particular way. It also annoys the country complained about,
 * but less than a tariff would.
 */
export const COMPLAINT_REPUTATION = 3;
export const COMPLAINT_RELATIONS = -4;

/**
 * How hard net exports pull on growth.
 *
 * Below one, because a fall in exports is partly offset by the imports that
 * stop coming with them, and because an economy where trade moved growth
 * one-for-one would make every other lever in the game irrelevant.
 */
export const IS_TRADE_WEIGHT = 0.28;

/* ------------------------------------------------------------------ *
 * The forces
 * ------------------------------------------------------------------ */

/**
 * Where the defence line stops being upkeep and starts being readiness.
 *
 * Below this share of what the force costs to keep, readiness falls however
 * loudly anybody insists it is not falling. Above it, the money buys flying
 * hours, sea days and exercises — the things that make a force something
 * other than a budget line.
 */
export const READINESS_FUNDING_PIVOT = 0.7;

/**
 * And how much more than upkeep a fully ready force costs.
 *
 * Level funding buys a force about half ready; a genuinely ready one costs
 * a third again on top. That is the real number and the reason almost no
 * country has one — and a steeper curve would let a government reach full
 * readiness by merely not cutting, at which point readiness stops being a
 * decision and becomes a default.
 */
export const READINESS_FUNDING_SPAN = 0.65;

/** How fast a force can be grown or cut. Both directions are slow. */
export const STRENGTH_ADJUST_RATE = 0.012;

/** Equipment never falls below this. Something is always serviceable. */
export const EQUIPMENT_FLOOR = 12;

/**
 * How late a programme already is on the day it is announced.
 *
 * Thirty-five per cent, before anything has gone wrong, because the
 * announced date was never the expected one. Everything after this is the
 * slip on top of the slip.
 */
export const PROCUREMENT_SLIP = 0.35;

/** And what each further slip adds to the bill. */
export const PROCUREMENT_OVERRUN = 0.09;

/**
 * How late and how expensive it is allowed to get.
 *
 * Bounded, because unbounded slip is not realism — it is a programme that
 * never arrives, which teaches nothing and is not what happens. Big
 * projects run about half again as long and most of the way again as
 * expensive, and then they land.
 */
export const PROCUREMENT_SLIP_CAP = 0.55;
export const PROCUREMENT_COST_CAP = 1.8;

/** Points of readiness a fully committed force loses each week. */
export const DEPLOYMENT_WEAR = 0.55;

/** Thousands of veterans a fully committed force produces a year. */
export const VETERANS_PER_DEPLOYMENT_YEAR = 34;

/** Years of expense and argument before a deterrent exists at all. */
export const DETERRENT_PROGRAMME_YEARS = 11;

/* ------------------------------------------------------------------ *
 * Conflict
 * ------------------------------------------------------------------ */

/**
 * The rally, in points of annual approval.
 *
 * The single most reliable finding about war and public opinion: approval
 * jumps when a crisis begins. It is large on purpose, because it is large in
 * reality and because the whole mechanic depends on the temptation being
 * real rather than nominal.
 */
export const CRISIS_RALLY = 9;

/** And how fast it goes. Halved every quarter, which is also real. */
export const CRISIS_RALLY_HALFLIFE = 13;

/**
 * The most a stale crisis can cost in approval each week.
 *
 * A steady bleed rather than a spiral. A spiral would make every long
 * crisis fatal, and long crises are usually survived — which is precisely
 * why governments let them run.
 */
export const PATIENCE_FLOOR = 0.35;

/** What going up a rung does to the escalation figure. */
export const ESCALATION_STEP = 14;

/** Standing firm is popular the week it happens. */
export const ESCALATION_APPROVAL = 3.5;

/** Backing down is not, and the cost arrives immediately and in public. */
export const DEESCALATION_APPROVAL = -6;

/** Points of approval a casualty costs, and does not give back. */
export const CASUALTY_APPROVAL = -0.25;

/** Points of growth a week of war takes out of the economy. */
export const WAR_ECONOMY_SHOCK = -0.09;

/**
 * How often something happens at all.
 *
 * Scaled by how dangerous the world is and by the worst relationship the
 * country has, so a government that keeps its quarrels small has fewer of
 * them — and a deterrent halves what is left, but never to nothing. A
 * country can do everything right and still have a bad year.
 */
export const CRISIS_BASE_RISK = 0.25;

/** How fast each side's willingness to continue erodes, per week. */
export const RESOLVE_DECAY = 0.42;

/** Political capital to go up a rung, or to come down one. */
export const ESCALATE_PC_COST = 12;
export const DEESCALATE_PC_COST = 18;
export const SETTLE_PC_COST = 22;
/** And to send forces somewhere, or change the whole doctrine. */
export const DEPLOY_PC_COST = 16;
export const PROGRAMME_PC_COST = 14;

/* ------------------------------------------------------------------ *
 * Intelligence
 * ------------------------------------------------------------------ */

/** Where the agencies' funding stops being upkeep and starts being reach. */
export const INTEL_FUNDING_PIVOT = 0.75;

/** Capability is people and relationships, so it moves like people do. */
export const CAPABILITY_ADJUST_RATE = 0.008;

/**
 * How fast somebody gets inside.
 *
 * Upward, always, because somebody is always trying. The only thing that
 * reduces it is looking for them, which is unglamorous and nobody funds it.
 */
export const PENETRATION_DRIFT = 0.055;

/**
 * How much oversight raises the chance an operation surfaces.
 *
 * The honest half of the oversight argument: an agency nobody is watching
 * is genuinely harder to catch. That is a real argument for weak oversight,
 * and the price of winning it is SCANDAL_OVERSIGHT_GUARD below.
 */
export const OVERSIGHT_EXPOSURE_WEIGHT = 0.85;

/** Below this, an agency nobody is watching starts doing things nobody asked for. */
export const SCANDAL_OVERSIGHT_GUARD = 55;

/** Points of unrest a fully surveilled country avoids each week. */
export const SURVEILLANCE_UNREST_WEIGHT = 0.9;

/**
 * How often an assessment is more certain of itself than it should be.
 *
 * Scaled by the difficulty of the question, because analysts systematically
 * understate the spread on exactly the questions where the political demand
 * for an answer is highest. That is not cynicism about analysts; it is the
 * documented shape of every famous intelligence failure, and it is the only
 * way a game can produce one honestly.
 */
export const OVERCONFIDENCE_BASE = 0.08;

/** How long before an assessment can be marked right or wrong. */
export const ASSESSMENT_DECAY_WEEKS = 26;

/** Political capital to reshape collection, or to change the oversight regime. */
export const POSTURE_PC_COST = 10;
export const OVERSIGHT_PC_COST = 16;

/** What an agency scandal costs a government that argued against oversight. */
export const AGENCY_SCANDAL_APPROVAL = -9;

/* ------------------------------------------------------------------ *
 * The world, running on its own
 * ------------------------------------------------------------------ */

/**
 * How fast relationships between OTHER countries move.
 *
 * Slower than this country's own, because nothing this government does is
 * driving them. They drift toward what geography and politics imply, and
 * over sixteen years that is enough to redraw the map.
 */
export const PAIR_DRIFT_RATE = 0.004;

/** And how fast a country's weight in the world changes. */
export const POWER_DRIFT_RATE = 0.0015;

/**
 * How much a relationship moves for no reason anybody can name.
 *
 * A remark, a funeral, a fishing dispute. Without it the map would sit
 * exactly where it was drawn and sixteen years would change nothing, which
 * is the one thing the world is definitely not like.
 */
export const PAIR_WOBBLE = 3.0;

/**
 * And how fast one collapses once shooting starts.
 *
 * Far faster than anything else here, because a relationship between two
 * countries at war does not drift anywhere — it is gone within the month,
 * and it is the only thing in this system that moves quickly.
 */
export const PAIR_WAR_RATE = 0.07;

/**
 * How far a pair has to fall before they fight.
 *
 * Deep in hostile territory, because most bad relationships never become
 * wars — and a model where they did would produce a world at permanent war,
 * which is both wrong and boring.
 */
export const FOREIGN_WAR_THRESHOLD = -72;

/**
 * How often something happens that was not aimed here.
 *
 * One every couple of years. Sized by measurement rather than by intuition:
 * at one a year, with events running forty to a hundred weeks, something was
 * ALWAYS running, and since most of them are inflationary the economy sat
 * under a permanent supply shock and never returned to target. A shock the
 * country is always having is not a shock; it is the weather.
 */
export const GLOBAL_EVENT_BASE_RISK = 0.010;

/** Political capital to respond to something that started somewhere else. */
export const GLOBAL_RESPONSE_PC_DEFAULT = 14;

/**
 * Where the world settles when nothing is happening to it.
 *
 * Tension was a one-way ratchet: wars and shocks added to it and nothing
 * ever took away, so every run reached a permanently maximally dangerous
 * world by the second term and the whole engine flattened. Countries do
 * calm down — slowly, and from wherever they are.
 */
/**
 * The debt ratio past which a bottom-rated government stops being lent to.
 *
 * Twice annual output — the ratio is a fraction here, as everywhere else in
 * the finance system — and only when the deficit is still being
 * run. A high debt that is falling is a country everybody lends to; a
 * modest debt rising fast is not. The question the market asks is about
 * direction, which is why both conditions are required.
 */
export const MARKET_ACCESS_DEBT_RATIO = 2.0;

/**
 * How long a government survives without anybody lending to it.
 *
 * Two years. Long enough to be a crisis the player can govern through, short
 * enough that it is not a permanent state of the world — and the whole time
 * the deficit has to be closed out of receipts, which is the punishment and
 * is quite bad enough on its own.
 */
export const SHUTOUT_WEEKS_FATAL = 104;

/** What losing market access costs in approval, per week, while it lasts. */
export const SHUTOUT_APPROVAL = -0.22;

/**
 * The most a forced reduction takes out of the discretionary budget at once.
 *
 * A twelfth, quarterly. Enough that the country notices immediately and the
 * gap closes over a year or two; not so much that a single bad quarter
 * dismantles the state, which would be a different game.
 */
export const EMERGENCY_CUT_MAX = 0.085;

export const TENSION_BASELINE = 28;
export const TENSION_DECAY_RATE = 0.011;

/**
 * How many weeks of the journal are kept.
 *
 * Every intent deep-clones the whole state, so a run that kept every week's
 * entries would be cloning twenty thousand objects on every click by the
 * final term — a game that gets slower the longer it is played. Nothing
 * reads further back than the last few weeks: the report shows this one and
 * the event weighting looks at three.
 */
export const LOG_HISTORY_WEEKS = 12;

/* ------------------------------------------------------------------ *
 * Drafting a bill
 * ------------------------------------------------------------------ */

/**
 * What it costs to put a bill of the player's own on the order paper.
 *
 * More than tabling one that was already drafted, because somebody has to
 * write it: parliamentary counsel, a committee clerk, and a fortnight of
 * the leader's own political capital spent on an idea nobody asked for.
 * The cost is paid when the bill is drafted, and tabling it costs again.
 */
export const DRAFT_BILL_PC_COST = 8;

/** How many bills of their own one government may have on the paper at once. */
export const DRAFT_BILL_LIMIT = 3;

/**
 * How long a remembered remark may be.
 *
 * Prose arriving from a client, stored in authoritative state, so it is
 * capped rather than trusted. Six remarks per person and a dozen people
 * puts the ceiling on the whole cast's memory at about thirty kilobytes.
 */
export const REMARK_LIMIT = 400;

/* ------------------------------------------------------------------ *
 * Engine 4 — Society, class and the cost of living
 * ------------------------------------------------------------------ */

/**
 * The poverty line, as a share of median disposable income.
 *
 * Sixty per cent is the figure used by most statistical offices and it has
 * the property that matters here: it is relative, so it does not fall
 * because the whole country got poorer at once.
 */
export const POVERTY_LINE_SHARE = 0.6;

/** How fast income shares respond to the cycle and the tax code. Slow. */
export const INCOME_SHARE_DRIFT = 0.006;

/**
 * How fast wealth shares respond to asset prices.
 *
 * Faster than income, because a change in the discount rate reprices every
 * holding in the country at once while a wage settlement takes a year to
 * negotiate. This asymmetry is why inequality in wealth can move a great
 * deal inside one term and inequality in income cannot.
 */
export const WEALTH_SHARE_DRIFT = 0.012;

/** How fast a household's disposable income converges on what it should be. */
export const DISPOSABLE_ADJUST_RATE = 0.22;

/** How fast saving responds to a squeeze. Quickly — it is the shock absorber. */
export const SAVINGS_ADJUST_RATE = 0.06;

/** How hard a housing shortage pushes on what housing costs. */
export const HOUSING_SHORTAGE_WEIGHT = 0.55;

/** Housing cannot take less than this share of a typical income, %. */
export const HOUSING_BURDEN_FLOOR = 12;

/** Nor more than this, %. Beyond it households leave rather than pay. */
export const HOUSING_BURDEN_CEILING = 58;

/** How much housing costs feed the headline cost-of-living index. */
export const COST_OF_LIVING_HOUSING_WEIGHT = 0.62;

/** And how much energy does. */
export const COST_OF_LIVING_ENERGY_WEIGHT = 0.18;

/** How fast ownership gives way to renting under price pressure. */
export const TENURE_DRIFT = 0.006;

/** The share of bottom-band households reaching the top two, at the start. */
export const MOBILITY_START = 26;

/** What a point of school quality is worth to that number. */
export const MOBILITY_EDUCATION_WEIGHT = 0.22;

/** And a point of housing quality. */
export const MOBILITY_HOUSING_WEIGHT = 0.1;

/**
 * And what concentrated wealth takes off it.
 *
 * The largest of the three, because past a certain gap no wage closes it:
 * the thing being competed for is a deposit, and deposits are priced off
 * the stock of wealth rather than the flow of income.
 */
export const MOBILITY_WEALTH_WEIGHT = 0.55;

/** How fast what housing costs converges on what the shortage implies. */
export const HOUSING_ADJUST_RATE = 0.004;

/**
 * How far behind the country a band must be falling to count as squeezed.
 *
 * Points of disposable income against the national change. A shock that
 * lowers every household equally squeezes nobody in particular, and a
 * report that named all five bands every time would be noise.
 */
export const SQUEEZE_GAP = 1.5;

/* ------------------------------------------------------------------ *
 * Engine 4 — Living standards
 * ------------------------------------------------------------------ */

/** How fast access converges on what the state is actually providing. */
export const ACCESS_ADJUST_RATE = 0.02;

/**
 * How fast satisfaction converges on the standard of living.
 *
 * Slow, and it never stops: a country that is genuinely well run
 * eventually reports being content with it, however long that takes.
 */
export const SATISFACTION_ADJUST_RATE = 0.012;

/** How fast the mood reacts to things getting better or worse. */
export const HAPPINESS_ADJUST_RATE = 0.09;

/**
 * How fast the mood forgets.
 *
 * The other half of the treadmill. Improvement that stops being
 * improvement stops being felt, which is why a government cannot bank
 * goodwill and spend it in the fourth year.
 */
export const HAPPINESS_DECAY = 0.035;

/** Points of mood per point-per-year of change in quality of life. */
export const HAPPINESS_CHANGE_SCALE = 3.2;

/**
 * Points of standard of living per unit of urban share above the national rate.
 *
 * What a town has that a village does not: the hospital, the line, the
 * jobs, the connection. Real urban–rural gaps in developed countries run
 * to several points on most measures of access, and considerably more on
 * transport and work.
 */
export const URBAN_STANDARD_TILT = 20;

/**
 * Points of standard of living per per-cent-a-year of net internal migration.
 *
 * Deliberately small. People move because of the standard of living, so a
 * large weight here would run the causality backwards and let the flow
 * decide the thing that caused it.
 */
export const FLOW_STANDARD_TILT = 0.6;

/* ------------------------------------------------------------------ *
 * Engine 4 — Culture
 * ------------------------------------------------------------------ */

/** How fast a shared national story follows what is actually shared. */
export const IDENTITY_ADJUST_RATE = 0.006;

/** How fast a community's sense of belonging follows how it is treated. */
export const BELONGING_ADJUST_RATE = 0.008;

/**
 * Where the norms sit in a country nobody has damaged.
 *
 * High, because in an ordinary democracy conceding an election and
 * obeying a court are not decisions anybody makes — which is exactly what
 * makes them possible to lose without repealing anything.
 */
export const NORMS_START = 72;

/** How fast norms recover. They erode a good deal faster. */
export const NORMS_ADJUST_RATE = 0.004;

/** How fast pride follows how the country is actually doing. */
export const PRIDE_ADJUST_RATE = 0.02;

/** Points of religiosity a country loses per year, absent anything else. */
export const SECULARISATION_PER_YEAR = 0.55;

/** Scales how fast an institution follows its funding. */
export const INSTITUTION_DECAY_SCALE = 0.11;

/**
 * Points of belonging gap at which a country is said to be coming apart.
 *
 * Paired with a test that enough of the country is in the affected
 * communities: a wide gap over one household in fifty is a real grievance
 * and is not a nation fracturing.
 */
export const BELONGING_ALARM = 22;

/* ------------------------------------------------------------------ *
 * Engine 4 — Public opinion and trust
 * ------------------------------------------------------------------ */

/** Base rate at which trust follows an institution's performance. */
export const TRUST_ADJUST_RATE = 0.012;

/**
 * How far an institution is dragged down by distrust of the others.
 *
 * Distrust spreads. A country that stops believing its police will
 * conclude something about its courts.
 */
export const CONTAGION_DOWN = 0.3;

/**
 * And how far it is lifted by confidence in them. Much less.
 *
 * Restored trust in one institution says nothing about any other, which
 * is the asymmetry that makes institutional trust so much cheaper to
 * destroy than to build.
 */
export const CONTAGION_UP = 0.06;

/** How fast the public mood moves. */
export const MOOD_ADJUST_RATE = 0.035;

/** How fast the belief that participation works moves. Slowly, both ways. */
export const EFFICACY_ADJUST_RATE = 0.008;

/**
 * What a thoroughly distrusted state still collects, as a share of what
 * is owed.
 *
 * Not zero: even a state nobody believes in can see a wage packet. The
 * rest is the part that depends on people deciding to comply, which is
 * what trust buys and enforcement does not.
 */
export const COMPLIANCE_FLOOR = 0.72;

/**
 * The drive below which an angry country has stopped acting on it.
 *
 * Frustration times the belief that acting works. Both the "was acting"
 * and "no longer acting" tests use this one number, so the crossing is a
 * single week and is reported exactly once.
 */
export const WITHDRAWAL_DRIVE = 0.05;

/** And how angry it has to be for that quiet to mean anything. */
export const WITHDRAWAL_FRUSTRATION = 52;

/* ------------------------------------------------------------------ *
 * Engine 4 — Social problems
 * ------------------------------------------------------------------ */

/**
 * Scales how fast the social problems respond at all.
 *
 * One multiplier over the whole set, so the pace of this engine can be
 * tuned without disturbing the relative speeds the templates express.
 */
export const PROBLEM_COMPOUNDING = 1;

/**
 * How much of the pressure a fully trusted set of institutions absorbs.
 *
 * A country that still believes its arrangements are fair and its state
 * competent takes a great deal more before any of it reaches the street.
 * This is the single largest reason two countries with identical problems
 * have entirely different politics.
 */
export const UNREST_TRUST_RELIEF = 0.55;

/* ------------------------------------------------------------------ *
 * Engine 4 — Generations
 * ------------------------------------------------------------------ */

/**
 * How much of the electorate is replaced each year.
 *
 * About one and a quarter per cent — which sounds like nothing, is eight
 * per cent over a term, and across a long career is the largest single
 * force acting on where the votes are. It is also the only one no
 * campaign can address.
 */
export const COHORT_REPLACEMENT_PER_YEAR = 0.0125;

/**
 * How long a cohort spends being formed before its position is fixed.
 *
 * Long enough that one bad year does not define a generation and a bad
 * decade does.
 */
export const COHORT_FORMATION_YEARS = 16;

/** How bad a problem has to be to count toward the breadth of trouble. */
export const UNREST_BREADTH_THRESHOLD = 0.3;

/**
 * What breadth adds to unrest, over and above depth.
 *
 * A weighted mean of severities is linear, so four grievances produce
 * exactly what four grievances sum to — which is not what happens.
 * Simultaneous unrelated grievances find one another, and a country with
 * four things going wrong is in a different kind of trouble from one with
 * a single larger complaint.
 */
export const UNREST_BREADTH_WEIGHT = 0.9;

/* ------------------------------------------------------------------ *
 * Engine 4 — Social movements
 * ------------------------------------------------------------------ */

/**
 * How much grievance, constituency and mobilisation together it takes
 * before anybody organises.
 *
 * The three multiply, so a severe grievance in a country that has given
 * up clears nothing and a mobilised country with nothing wrong clears
 * nothing either.
 */
export const MOVEMENT_FORM_THRESHOLD = 0.02;

/** How fast support follows the case a movement has. */
export const MOVEMENT_SUPPORT_RATE = 0.04;

/** How fast a movement runs out of people. Organising is exhausting. */
export const MOVEMENT_DECAY = 0.02;

/**
 * What conceding does to the belief that acting works.
 *
 * Positive, and deliberately so: a concession addresses the grievance AND
 * teaches the country that organising is how things get done. Both are
 * true, and the second is the bill.
 */
export const CONCESSION_EFFICACY_GAIN = 0.55;

/**
 * What clearing a movement out does to its resolve.
 *
 * Suppression makes a movement smaller and angrier, and hands it the
 * sympathy of people who were not previously involved. That combination
 * is why it so often fails on a timescale longer than a news cycle.
 */
export const SUPPRESSION_BACKFIRE = 0.09;

/**
 * The efficacy below which a country does not act on its anger at all.
 *
 * Deliberately below the range ordinary runs produce. Set inside that
 * range it silently zeroed the mobilisation of about half of all
 * countries, and nothing organised in any of them.
 */
export const MOBILISATION_PIVOT = 30;

/* ------------------------------------------------------------------ *
 * Engine 7 — War
 * ------------------------------------------------------------------ */

/**
 * The war score a side needs before it can claim an ordinary aim.
 *
 * Multiplied by the aim's own difficulty, so surviving is cheap and
 * removing a government is not.
 */
export const WAR_SCORE_TO_WIN = 55;

/** How fast the score follows the battlefield. Slowly: a week is not a war. */
export const WAR_SCORE_ADJUST = 0.035;

/** Points of exhaustion per thousand casualties. */
export const EXHAUSTION_CASUALTY_WEIGHT = 0.9;

/** And per point of a year's output spent on it. */
export const EXHAUSTION_COST_WEIGHT = 2.2;

/**
 * And per week in which nothing has visibly been achieved.
 *
 * The largest of the three in the kinds of war where nothing is ever
 * visibly achieved, which is why those are the wars that end
 * governments rather than the bloody ones.
 */
export const EXHAUSTION_STALEMATE_WEIGHT = 0.55;

/** How much of the opening rally shows up as approval. */
export const RALLY_APPROVAL_SHARE = 0.8;

/**
 * The exhaustion at which a government can no longer carry a war.
 *
 * Below a hundred, because a country does not reach the theoretical
 * maximum of anything before it stops.
 */
export const EXHAUSTION_BREAKS = 86;

/**
 * How much of the other side's exhaustion is absorbed by whatever they
 * have that we cannot see.
 *
 * Given no relief at all they exhausted three times faster than we did,
 * and every war in the game was won by outlasting an opponent who had
 * been given no capacity to outlast anybody.
 */
export const THEIR_RELIEF = 0.42;

/* ------------------------------------------------------------------ *
 * Engine 7 — Manpower
 * ------------------------------------------------------------------ */

/** How fast morale follows the conditions it is under. */
export const MORALE_ADJUST_RATE = 0.03;

/** Share of a force that leaves each week under ordinary conditions. */
export const DESERTION_BASE = 0.0004;

/**
 * How much conscripting a country that does not want it costs the norms.
 *
 * Compelling people to fight is a constitutional act as much as a
 * military one, and a state that does it against the grain of its own
 * population spends something it does not get back.
 */
export const MOBILISATION_RATCHET = 1;

/** Share of the working-age population that can in principle be called. */
export const ELIGIBLE_SHARE = 0.42;

/**
 * How far an arrangement can be stretched by a war before it has to be
 * replaced by a different arrangement.
 *
 * A country at war raises more people under the same rules — deferments
 * stop being granted, the age band widens, the medical standard falls.
 * Beyond this it has to legislate, which is the point at which the war
 * arrives on the domestic desk.
 */
export const WAR_REACH = 2.4;

/**
 * Weekly chance a trained soldier becomes a veteran in PEACETIME.
 *
 * Deliberately almost nothing: a twenty-three-year career. Veterans are
 * made by fighting, and a peacetime army that believes otherwise is
 * counting length of service as though it were experience.
 */
export const VETERAN_PEACE_RATE = 0.00084;

/**
 * How much more than its replacement rate a country can train at once.
 *
 * A peacetime training establishment has slack, not capacity. It was
 * built to replace the people leaving and a bit more, and the "and a
 * bit more" is the entire margin a country has when it needs an army in
 * a hurry. Set it much above this and the pipeline stops being the
 * binding constraint, which is the one thing this whole file exists to
 * say that it is.
 */
export const TRAINING_HEADROOM = 1.6;

/**
 * How fast a training establishment grows, and how fast it shrinks.
 *
 * Asymmetric on purpose. Standing a depot up means instructors, ranges
 * and married quarters and takes years; closing one takes a signature.
 * A government that cut the establishment in a good year and needs it in
 * a bad one is going to be told how long it takes.
 */
export const CAPACITY_GROWTH = 0.006;
export const CAPACITY_DECAY = 0.02;

/**
 * Weekly desertion rate at which people leaving becomes a visible problem.
 *
 * Set inside the range the formula above it can actually produce, which
 * is not the trivial requirement it sounds like: the first version of
 * this alarm sat above the theoretical maximum of its own input and
 * could never have fired in any run of any country.
 */
export const DESERTION_ALARM = 0.0018;

/** Share of the gap the reserve fills per week once it is called. */
export const RESERVE_CALL_RATE = 0.06;

/** What a recalled reservist is worth against somebody still serving. */
export const RESERVE_RUST = 0.88;

/** Morale of an ordinary peacetime army, and the baseline all else moves from. */
export const MORALE_BASE = 68;

/** Quality points per point of veteran share above the arrangement's own rest share. */
export const QUALITY_VETERAN_BONUS = 22;

/** And per point of recruit share above it. Training shows. */
export const QUALITY_RECRUIT_PENALTY = 40;

/** How far quality falls per unit of force raised beyond the peacetime establishment. */
export const QUALITY_STRAIN_PENALTY = 0.22;

/**
 * The most a force can lose in a single week and still be a force.
 *
 * A defensive cap rather than a model of anything. The war engine
 * computes casualties from the fighting without knowing how many people
 * are in the army, so a small country in a large war can be handed a
 * figure that annihilates it in a month. Past this point an army does
 * not take losses, it disintegrates — and disintegration is the war
 * engine's business, not this file's.
 */
export const CASUALTY_CEILING = 0.035;

/**
 * How fast a force above its establishment is let go, per week.
 *
 * Not the ratchet: the ratchet is about the ARRANGEMENT, which is a law
 * and stays on the books. This is the headcount, which falls back on its
 * own the moment nobody is signing the extensions.
 */
export const DEMOBILISATION_RATE = 0.04;

/* ------------------------------------------------------------------ *
 * Engine 7 — Order of battle
 * ------------------------------------------------------------------ */

/**
 * How much of the structural lag actually reaches the player's clock.
 *
 * The raw sum of per-echelon delays is in weeks of staff work, which at
 * a weekly turn would make a deep chain unplayable rather than merely
 * frustrating. This scales it into something a government can work
 * around: an ordinary army lands near a week and a half, a very deep one
 * near three, and no arrangement ever reaches zero because somebody
 * still has to read the order and somebody still has to agree with it.
 */
export const COMMAND_LAG_SCALE = 0.95;

/**
 * The loyalty at which an officer stops being certain to carry out an
 * order they disagree with, and the range over which that comes on.
 *
 * A threshold with a slope rather than a cliff, because the thing a
 * government wants to know is not "how many disloyal generals do I
 * have" — it is "how much of the army is doubtful", and that number
 * moves by degrees as the norms go.
 */
export const RELIABILITY_PIVOT = 55;
export const RELIABILITY_SPAN = 32;

/** Share of the force under doubtful command that counts as a problem. */
export const UNRELIABLE_ALARM = 0.25;

/**
 * Roughly how many formations a player should be given to work with.
 *
 * Fixes the ECHELON the country manoeuvres at rather than the number of
 * units: a small state moves battalions and a superpower moves corps,
 * and both get a list of about this length. Which is also the honest
 * answer — the echelon a government actually gives orders at is set by
 * how much army there is, not by how much detail anybody wants.
 */
export const FORMATION_TARGET_COUNT = 34;

/* ------------------------------------------------------------------ *
 * Engine 7 — The theatre
 * ------------------------------------------------------------------ */

/**
 * How much supply a sector loses per sector of depth from its base.
 *
 * THE most important number in land warfare and the one every game
 * leaves out. It is the culminating point: an offensive that succeeds
 * lengthens its own supply line and shortens the enemy's, so the further
 * it goes the weaker it gets and the stronger they get. Every advance
 * carries the arithmetic of its own halt, and the halt arrives whether
 * or not anybody has decided to stop.
 */
export const SUPPLY_DECAY_PER_DEPTH = 9;

/** Supply at the base of it all, where the railheads are. */
export const SUPPLY_AT_BASE = 100;

/**
 * How fast control actually changes hands, per week, at parity.
 *
 * Small on purpose. A front that moves visibly every week is a front
 * that is collapsing, and most fronts do not collapse — they sit, at
 * enormous cost, which is the fact that decides most wars and disappoints
 * every government that starts one.
 */
export const CONTROL_PACE = 3.4;

/**
 * Force ratio at which an attack stops grinding and starts breaking
 * through.
 *
 * Above this the pace multiplies rather than adds, which is why
 * breakthroughs look sudden: nothing happens for months and then a
 * hundred miles happen in a fortnight. It is the same arithmetic
 * throughout.
 */
export const BREAKTHROUGH_RATIO = 2.6;

/** How much faster a breakthrough moves than a grind. */
export const BREAKTHROUGH_PACE = 3.5;

/** Supply below which a formation cannot attack at all, whatever its orders. */
export const ATTACK_SUPPLY_FLOOR = 42;

/**
 * What being cut off does per week.
 *
 * An encircled formation is not a formation under pressure. It is a
 * formation with a deadline, and the deadline is measured in weeks.
 */
export const ENCIRCLEMENT_LOSS = 9;

/** How fast reconnaissance closes the gap between belief and the ground. */
export const RECON_RATE = 0.42;

/**
 * How much better a sector is reported than it is.
 *
 * No commander has ever reported their own sector as worse than it is,
 * and no staff has ever passed one up unimproved. It is small, it is
 * constant, it is in the same direction every time, and it is why a
 * government is always slightly more confident than the ground
 * warrants even when its intelligence is excellent.
 */
export const REPORT_OPTIMISM = 5;

/**
 * What the staff assume about ground nobody has looked at.
 *
 * Not a guess at the truth — a placeholder that gets briefed like one.
 * The map has to say something, so it says this.
 */
export const ASSUMED_CONTROL = 50;

/** Civilian casualties per week per point of fighting, per thousand present. */
export const CIVILIAN_TOLL = 0.00042;

/** How fast a sector is wrecked by being fought over. */
export const DEVASTATION_RATE = 0.38;

/** Weeks of no movement before a front is called what it is. */
export const STAGNANT_THRESHOLD = 16;

/* ------------------------------------------------------------------ *
 * Engine 7 — The fleet
 * ------------------------------------------------------------------ */

/**
 * Weeks at sea before a ship has to come home whatever anybody wants.
 *
 * Crews, stores and machinery, in that order of urgency. A government
 * that keeps a deployment running past this is not getting more presence
 * out of the fleet; it is getting less of it later, and the bill arrives
 * as a refit backlog under somebody else.
 */
export const DEPLOYMENT_LIMIT = 26;

/**
 * How fast a ship wears out on station, per week.
 *
 * Set against the refit rate so that a full deployment is followed by
 * roughly twice as long alongside. That ratio is the rule of three: one
 * ship on station, one working up, one in refit, and a government that
 * wants to be continuously present somewhere needing three times the
 * hulls it thinks it does.
 */
export const SEA_WEAR = 1.6;

/** And how fast it recovers alongside. Slower than it wears. */
export const REFIT_RATE = 1.08;

/**
 * How fast a ship deteriorates alongside regardless.
 *
 * Salt, age and a maintenance schedule that assumes somebody is paying
 * for it. This is what makes a hollow fleet possible: a government that
 * economises on maintenance does not get a smaller navy, it gets the
 * SAME fleet list and fewer ships that can sail — and the fleet list is
 * the figure it is briefed.
 */
export const HARBOUR_DECAY = 0.28;

/**
 * Condition below which a ship is not a warship.
 *
 * It still appears in the fleet list, which is exactly the problem: the
 * number a government is briefed is hulls, and hulls do not distinguish
 * between a ship that can sail and one that is alongside waiting for a
 * part that is not being made any more.
 */
export const SEAWORTHY = 40;

/**
 * Weekly chance a ship in contested water is lost, at parity.
 *
 * Deliberately small and deliberately not zero. The point is not that
 * ships sink often; it is that when one does there is no replacing it
 * inside the war, and everybody involved knew that when the order to
 * sail was given.
 */
export const SHIP_LOSS_RISK = 0.0035;

/** How much of a zone's demand one point of presence covers. */
export const PRESENCE_SCALE = 1;

/**
 * Condition at which a ship is sent home to refit rather than kept out.
 *
 * With the deployment limit, this is what produces the rule of three:
 * one ship on station, one working up, one in refit. A government that
 * wants to be continuously present somewhere needs three times the hulls
 * it thinks it does, discovers this the first time it promises to be
 * somewhere, and never says so out loud afterwards.
 */
export const ROTATE_HOME_AT = 58;

/** And the condition a ship has to reach before it is sent out again. */
export const ROTATE_OUT_AT = 82;

/**
 * Hulls required per hull continuously on station.
 *
 * Falls out of the wear and refit rates above rather than being applied
 * anywhere; stated here so that anything wanting the figure uses the
 * same one, and so that changing the rates without changing this is
 * caught by a test.
 */
export const ROTATION_RATIO = 3;

/* ------------------------------------------------------------------ *
 * Engine 7 — The air force
 * ------------------------------------------------------------------ */

/**
 * Serviceability an air force settles at when it is flying hard.
 *
 * Not losses. Wear, cannibalisation and a part that is three months out,
 * which together take a third of any air force off the line within six
 * months of a war starting, and which no figure briefed to a government
 * has ever included.
 */
export const SERVICEABILITY_AT_WAR = 62;

/** And what it holds at in peacetime, which is where it starts. */
export const SERVICEABILITY_AT_PEACE = 84;

/**
 * Aircrew standard a training establishment produces.
 *
 * New crews are not as good as the ones they replace, which is why an
 * air force does not slowly become elite in peacetime and why one three
 * months into a war has more sorties behind it and worse people flying
 * them.
 *
 * Set to the standard an untouched country is already at, so that an
 * untouched country stays there. Anything else and every air force in
 * the world drifts for twenty years toward a number nobody chose.
 */
export const AIRCREW_TRAINING_STANDARD = 64;

/**
 * How fast the hardening from strategic bombing fades once it stops.
 *
 * Slowly. A population that has been bombed does not go back to what it
 * was when the bombing stops, which is the other half of why the option
 * is worse than it looks: the cost outlives the campaign and the
 * campaign was the part anybody budgeted for.
 */
export const HARDENING_DECAY = 0.004;

/** How fast serviceability moves toward whichever of those applies. */
export const SERVICEABILITY_RATE = 0.05;

/** Sorties per point of effort per squadron per week. */
export const SORTIE_SCALE = 1;

/** How fast air superiority is contested, per week. */
export const SUPERIORITY_PACE = 2.6;

/**
 * How much strategic bombing HARDENS the people it is aimed at.
 *
 * Positive, because it is a cost. The single most robust finding about
 * strategic bombing is that it does not separate a population from its
 * government, and the harder it is pressed the less it does so. An
 * engine in which bombing works is modelling the brochure.
 */
export const BOMBING_HARDENS = 0.055;

/** And how much it actually destroys, which is real and is not the same. */
export const BOMBING_DAMAGE = 0.11;

/** Aircrew a squadron needs per week to stay at establishment. */
export const AIRCREW_REPLACEMENT = 0.012;
