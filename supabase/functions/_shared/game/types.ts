/**
 * types.ts — the shape of a Statecraft run.
 *
 * This file is imported by both the browser client and the Deno edge
 * functions, so it stays free of any platform-specific imports.
 */

import type { SegmentKey } from './content/segments.ts';
import type { ChannelKey } from './content/channels.ts';
import type { ElectoralSystem } from './systems/electoralSystems.ts';
import type { District } from './systems/districts.ts';
import type { PartyInternals } from './systems/partyInternals.ts';
import type { Senate } from './systems/parliament.ts';

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/**
 * A party's (or electorate's) position. Each axis runs −1..1. The axes are
 * mechanical inputs to coalition compatibility and voter appeal — the game
 * never treats one end of an axis as correct.
 */
export interface Ideology {
  economic: number;
  social: number;
  environmental: number;
}

export type IdeologyAxis = keyof Ideology;

export type SectorKey =
  | 'economy'
  | 'health'
  | 'education'
  | 'infrastructure'
  | 'environment';

export type Difficulty = 'stable' | 'standard' | 'fractured';

export type BillMagnitude = 'minor' | 'major';

export type BillStatus =
  | 'available'
  | 'proposed'
  /** Sent to committee: delayed a month, returns stronger. */
  | 'in_committee'
  | 'passed'
  | 'failed';

export type BillCategory =
  | 'fiscal'
  | 'health'
  | 'education'
  | 'infrastructure'
  | 'environment'
  | 'labour'
  | 'civic'
  | 'security';

export type EventCategory =
  | 'economic_shock'
  | 'natural_disaster'
  | 'scandal'
  | 'diplomatic'
  | 'social_unrest'
  | 'opportunity'
  | 'routine';

/**
 * Position in the turn state machine, plus the three out-of-turn states the
 * run can rest in. Persisted verbatim to `games.phase`.
 */
export type Phase =
  | 'briefing'
  | 'events'
  | 'agenda'
  | 'budget'
  | 'legislature'
  | 'resolution'
  | 'report'
  | 'election_night'
  | 'coalition'
  | 'career_summary';

/** The seven in-turn phases, in canonical order. */
export const TURN_PHASES: readonly Phase[] = [
  'briefing',
  'events',
  'agenda',
  'budget',
  'legislature',
  'resolution',
  'report',
] as const;

/** Phases during which the player may act. */
export const PLAYER_PHASES: readonly Phase[] = ['events', 'agenda', 'budget'] as const;

/* ------------------------------------------------------------------ *
 * Effects
 * ------------------------------------------------------------------ */

/** A bundle of mechanical consequences, applied atomically and itemised. */
export interface Effects {
  /** One-off nudges to sector health, in points. */
  sectorDeltas?: Partial<Record<SectorKey, number>>;
  /** Permanent changes to per-turn sector funding, in ₡bn. */
  fundingDeltas?: Partial<Record<SectorKey, number>>;
  /** One-off approval change, in points. */
  approval?: number;
  /** One-off treasury change, in ₡bn. Negative spends. */
  treasury?: number;
  /** One-off debt change, in ₡bn. */
  debt?: number;
  /** One-off political capital change. */
  politicalCapital?: number;
  /** One-off mood change applied to every coalition partner. */
  coalitionMood?: number;
  /** Recurring per-turn revenue modifier, in ₡bn. */
  revenueDelta?: number;

  /**
   * A macroeconomic shock to apply, or soften.
   *
   * This is what lets a choice at the desk be a decision about the ECONOMY
   * rather than about the treasury balance. A bank rescue does not mainly
   * cost money — it costs money and prevents six months of contraction, and
   * the second half is the part worth arguing about.
   */
  economicShock?: {
    id: string;
    label: string;
    kind: ShockKind;
    growthImpulse: number;
    inflationImpulse: number;
    confidenceImpulse: number;
    turns: number;
  };
  /** Multiplier applied to any shock this event would otherwise deliver. */
  shockRelief?: number;
  /** One-off nudges to named industries, in points of health. */
  industryDeltas?: Partial<Record<import('./content/industries.ts').IndustryKey, number>>;
  /** One-off nudges to named infrastructure assets, in points of condition. */
  assetDamage?: Partial<
    Record<import('./content/infrastructure.ts').InfrastructureKey, number>
  >;
}

/* ------------------------------------------------------------------ *
 * Parties and coalition
 * ------------------------------------------------------------------ */

export type RedLineKind = 'ideology_axis' | 'sector_floor' | 'bill_category';

/**
 * A condition a coalition partner will not tolerate. Crossing it does not
 * block the government — it costs mood, heavily, and the partner's seats
 * defect on the offending vote.
 */
export interface RedLine {
  id: string;
  kind: RedLineKind;
  description: string;
  /** ideology_axis: the axis policed, and which sign is unacceptable. */
  axis?: IdeologyAxis;
  direction?: 'positive' | 'negative';
  /** ideology_axis: magnitude past which the bill offends. */
  magnitude?: number;
  /** sector_floor: funding for this sector may not drop below `threshold`. */
  sector?: SectorKey;
  threshold?: number;
  /** bill_category: any bill in this category offends. */
  category?: BillCategory;
}

export interface Party {
  id: string;
  name: string;
  shortName: string;
  color: string;
  /** A non-colour identifier, so nothing is conveyed by colour alone. */
  glyph: string;
  isPlayer: boolean;
  inCoalition: boolean;
  ideology: Ideology;
  seats: number;
  /** 0–100 for coalition partners; null for everyone else. */
  coalitionMood: number | null;
  redLines: RedLine[];
  /** Baseline electoral mass, before approval and campaigning. */
  baseStrength: number;
  /** Cabinet posts this partner holds. */
  cabinetPosts: number;
  /** Cabinet posts this partner demanded when the government formed. */
  cabinetDemand: number;
  leaderTitle: string;
  /**
   * What this party fights for at the budget table, and what it asks.
   *
   * Carried on the party rather than looked up in a content table, because
   * the party in a run is not always the party in the content table: the
   * chamber of a real country is generated from that country's own profile
   * and only borrows the bench slots. A lookup by id used to find the
   * invented country's party of the same name and hand back its demands,
   * which in a small country was a demand three times the entire budget.
   */
  prioritySector: SectorKey;
  /** Annual funding demanded for that sector, ₡bn, at this country's size. */
  sectorFloor: number;
  /** What it may table as a red line when a government is being formed. */
  redLinePool: RedLine[];
  /**
   * Where this party's support actually is, as a multiplier per region.
   *
   * Real party support is geographically concentrated: an agrarian party
   * gets a third of the vote in the countryside and two per cent in the
   * capital, and a regionalist one gets forty per cent in one region and
   * nothing anywhere else. Without that, support is a smooth function of
   * ideology and every district in a country elects the same party —
   * which is why every majoritarian chamber in this engine used to seat
   * exactly three parties, however many stood.
   *
   * Absent, or 1, means no concentration. The invented country's parties
   * have none, so nothing about that run changes.
   */
  regionStrength?: Record<string, number>;
}

/* ------------------------------------------------------------------ *
 * Sectors, bills, events
 * ------------------------------------------------------------------ */

export interface Sector {
  key: SectorKey;
  health: number;
  funding: number;
}

export interface Bill {
  id: string;
  templateKey: string;
  title: string;
  summary: string;
  /** The argument against. Every bill has one — no bill is a free win. */
  tradeoff: string;
  category: BillCategory;
  magnitude: BillMagnitude;
  ideology: Ideology;
  effects: Effects;
  status: BillStatus;
  passChance: number | null;
  pcSpent: number;
  whipSteps: number;
  turnProposed: number | null;
  turnResolved: number | null;
  /** Amendments made to buy votes. Each moderates the bill and dilutes it. */
  amendments: number;
  /** Bonus to the pass chance earned by committee scrutiny. */
  committeeBonus: number;
  /** Turn the bill is due back from committee. */
  committeeReturnsOn: number | null;
  /** Crossbench deals struck for the second chamber. */
  crossbenchDeals: number;
  /** Set when the bill cleared the lower house but died in the Senate. */
  blockedBySenate?: boolean;
  /** Carries a sunset clause: lapses unless renewed. */
  sunset?: boolean;
  /** Turn on which this law lapses, once passed with a sunset clause. */
  lapsesOn?: number | null;
  /** Turn on which a passed bill's effects actually land. */
  takesEffectOn?: number | null;
  /** True once the delayed effects have been applied. */
  inEffect?: boolean;

  /**
   * Written by the player rather than chosen from the order paper.
   *
   * Marked permanently, because a bill somebody drafted at the desk is a
   * different object from one the game supplied, and the journal, the
   * chamber and the record should all say so.
   */
  drafted?: boolean;
  /** What the player asked for, in their own words. */
  draftPrompt?: string;
  /**
   * Everything the engine changed on the way in — clamps, drops, and the
   * cut applied to a bill that asked for more than it gave up.
   *
   * Shown to the player rather than applied quietly. A drafting feature
   * that silently rewrote what somebody typed would be worse than one that
   * refused.
   */
  draftNotes?: string[];
}

/** A commitment made in a manifesto, and whether it was honoured. */
export interface ManifestoPromise {
  id: string;
  billKey: string;
  title: string;
  termMade: number;
  status: 'outstanding' | 'kept' | 'broken';
}

export interface EventChoice {
  label: string;
  /** Plain-language statement of what this choice costs and buys. */
  tradeoff: string;
  pcCost: number;
  effects: Effects;
}

export interface GameEvent {
  id: string;
  templateKey: string;
  category: EventCategory;
  title: string;
  /** Fallback prose by default; replaced by ai-narrator output when available. */
  narrative: string;
  severity: number;
  turnNumber: number;
  choices: EventChoice[];
  chosenIndex: number | null;
  resolved: boolean;
}

/* ------------------------------------------------------------------ *
 * Regions, elections, news
 * ------------------------------------------------------------------ */

export interface Region {
  id: string;
  name: string;
  /**
   * What kind of place it is — capital, agrarian, coastal and so on.
   *
   * Decides how much of it lives in a town, which a national urbanisation
   * rate conceals entirely: a country that is 71% urban is a capital that
   * is nearly all of it and farmland that is largely none.
   */
  kind: import('./content/world/politics.ts').RegionKind;
  /** One line of character, shown on the campaign map. */
  character: string;
  seats: number;
  /**
   * Summary position of the electorate here. Kept for display; the
   * authoritative model is `composition`.
   */
  lean: Ideology;
  /**
   * Who lives here, as relative weights per voter segment. Segments overlap,
   * so these are weights on a shared electorate rather than exclusive shares.
   */
  composition: Partial<Record<SegmentKey, number>>;
  campaignInvestment: number;
}

export interface RegionResult {
  regionId: string;
  regionName: string;
  seats: number;
  /** partyId → seats won here. */
  seatsByParty: Record<string, number>;
  /** partyId → vote share 0..1 here. */
  voteShareByParty: Record<string, number>;
}

export interface ElectionResult {
  termNumber: number;
  turnout: number;
  /** The rules this election was counted under. */
  system?: ElectoralSystem;
  /**
   * Gallagher index: how far the result departed from the votes cast.
   * 0 is perfectly proportional; above ~5 the system is visibly reshaping it.
   */
  disproportionality?: number;
  /** Per-district outcomes, for district-based systems. */
  districtOutcomes?: {
    districtId: string;
    regionId: string;
    districtName: string;
    winner: string;
    shares: Record<string, number>;
  }[];
  /** Top-up seats awarded from the national list under mixed-member. */
  listSeats?: Record<string, number>;
  /**
   * Published before a single ballot is counted. Taken from real voters, so
   * tighter than a campaign poll — and still a sample.
   */
  exitPoll?: { shares: Record<string, number>; marginOfError: number };
  /** Districts close enough that the result could turn on a recount. */
  recounts?: { districtId: string; districtName: string; margin: number }[];
  /** Movement since the last election, in percentage points. */
  swing?: Record<string, number>;
  /** partyId → total seats. */
  seatsByParty: Record<string, number>;
  /** partyId → national vote share 0..1. */
  voteShareByParty: Record<string, number>;
  regions: RegionResult[];
  playerSeatsBefore: number;
  playerSeatsAfter: number;
}

export interface NewsItem {
  id: string;
  turnNumber: number;
  outlet: string;
  headline: string;
  body: string;
  /** −1..1. Used only to tint the UI; never feeds back into mechanics. */
  sentiment: number;
}

/* ------------------------------------------------------------------ *
 * Turn log — the transparency pillar
 * ------------------------------------------------------------------ */

export type LogKind =
  | 'approval'
  | 'political_capital'
  | 'treasury'
  | 'debt'
  | 'sector'
  | 'economy'
  | 'coalition'
  | 'legislature'
  | 'event'
  | 'election'
  | 'note';

/**
 * One line of the End of Turn Report. Every number the player sees change is
 * expected to have a matching entry naming the cause.
 */
export interface LogEntry {
  kind: LogKind;
  label: string;
  /** Signed magnitude of the change, or null for narrative-only lines. */
  delta: number | null;
  /** Why it happened, in plain language. */
  cause: string;
  /** Optional unit hint for formatting ('pts', '₡bn', 'seats'). */
  unit?: string;
  /**
   * True for lines that explain a figure rather than being a change to it —
   * gross revenue, gross spending, interest charged, a change to a per-turn
   * rate. They are shown in the report but excluded from net totals, so the
   * summary at the top of the report cannot disagree with the top bar.
   */
  informational?: boolean;
}

export interface TurnLog {
  /** The week within the term, which is what the player is shown. */
  turnNumber: number;
  /**
   * Weeks since the run began, which is what identifies it.
   *
   * The turn number resets at every election, so two different weeks in two
   * different terms share one — and a log keyed on that would have had the
   * second term's first week appending to the first term's, compounding
   * every term for the whole run.
   */
  week: number;
  entries: LogEntry[];
}

/* ------------------------------------------------------------------ *
 * Coalition negotiation
 * ------------------------------------------------------------------ */

export interface CoalitionDemand {
  partyId: string;
  cabinetPosts: number;
  redLines: RedLine[];
  /** Minimum per-turn funding demanded for the partner's priority sector. */
  sectorFloor: { sector: SectorKey; amount: number };
  /** Partner's line at the negotiating table. AI-replaceable prose. */
  dialogue: string;
  /** How much relief the player has already negotiated (0..1). */
  concessionsWon: number;
}

export interface NegotiationState {
  /** Parties, ranked by ideological distance, that could be approached. */
  candidates: CoalitionDemand[];
  /** Party ids the player has provisionally accepted this attempt. */
  accepted: string[];
  attempt: number;
  /** Set once the player fails `COALITION_MAX_ATTEMPTS` times. */
  failed: boolean;
  /**
   * True when this negotiation follows a mid-term walkout rather than an
   * election. It decides which way the run ends if no government can be
   * formed: a government that falls has collapsed, a party that cannot form
   * one after an election has been defeated.
   */
  crisis: boolean;
}

/* ------------------------------------------------------------------ *
 * Campaign
 * ------------------------------------------------------------------ */

export interface DebateExchange {
  id: string;
  opponentPartyId: string;
  /** Opponent's attack. Fallback prose by default, AI-replaceable. */
  attack: string;
  responses: { label: string; style: IdeologyAxis | 'neutral'; quality: number }[];
  chosenIndex: number | null;
  /** Net national swing this exchange produced, once answered. */
  swing: number | null;
}

export interface CampaignState {
  stopsMade: number;
  adBuys: number;
  debates: DebateExchange[];
  /** Cumulative national support swing from debate performance. */
  debateSwing: number;
  /** Accumulated exposure per voter segment, from the channels bought. */
  reach: Partial<Record<SegmentKey, number>>;
  /** Pushes bought on each channel, for the campaign summary. */
  channelPushes: Partial<Record<ChannelKey, number>>;
  /** Door-knocking pushes spent. Limited by party membership. */
  volunteerPushesUsed: number;
  /** Polls commissioned this campaign, most recent last. */
  polls: {
    turnNumber: number;
    quality: 'small' | 'standard' | 'large';
    shares: Record<string, number>;
    marginOfError: number;
  }[];
  rallies: number;
  townHalls: number;
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

export interface CareerRecord {
  termsServed: number;
  electionsWon: number;
  billsPassed: number;
  billsFailed: number;
  eventsResolved: number;
  peakApproval: number;
  lowestApproval: number;
}

export type RunStatus =
  | 'active'
  /** Lost an election. */
  | 'defeated'
  /** Government fell and could not be reformed. */
  | 'collapsed'
  /** Player stepped down voluntarily. */
  | 'retired';

/* ------------------------------------------------------------------ *
 * Engine 2A — the macroeconomy
 * ------------------------------------------------------------------ */

/** Where the economy is in its cycle. Classified, never set directly. */
export type CyclePhase =
  | 'expansion'
  | 'peak'
  | 'slowdown'
  | 'recession'
  | 'recovery';

export type ShockKind =
  | 'demand'
  | 'supply'
  | 'financial'
  | 'external'
  | 'confidence';

/**
 * Something that happened to the economy rather than something the
 * government did.
 *
 * A shock is a decaying impulse, not a permanent setting: it lands with its
 * full weight and fades over `months`, so the recovery from it is something
 * the player lives through rather than something they toggle off.
 */
export interface EconomicShock {
  id: string;
  label: string;
  kind: ShockKind;
  /** Annualised growth added per month while active. Usually negative. */
  growthImpulse: number;
  /** Annualised inflation added per month while active. */
  inflationImpulse: number;
  /** Points added to both confidence measures. */
  confidenceImpulse: number;
  /** Months remaining. Decays to zero and is then removed. */
  remaining: number;
  /** Months it started with, so the decay curve can be computed. */
  duration: number;
  /** The turn it arrived, for the record. */
  startedTurn: number;
}

/** One month of the macro record. */
export interface EconomyPoint {
  turn: number;
  gdp: number;
  growth: number;
  inflation: number;
  unemployment: number;
  policyRate: number;
  outputGap: number;
}

/**
 * The macroeconomy.
 *
 * Rates are annualised percentages, the way a briefing states them. Levels
 * are ₡bn a year. The player sets none of this directly — it is what their
 * budget, their taxes and the world do to them, which is the point.
 */
export interface Economy {
  /** Real output, ₡bn a year. */
  gdp: number;
  /** What output would be with the economy at full capacity. */
  potentialGdp: number;
  /** Annualised real growth, %. */
  growth: number;
  /** Trend growth, %. Set by productivity and the workforce. */
  potentialGrowth: number;
  /** (gdp − potentialGdp) / potentialGdp, as a percentage. */
  outputGap: number;
  /** Output per worker, index, 100 = the baseline decade. */
  productivity: number;

  /** Annual CPI change, %. Negative is deflation. */
  inflation: number;
  /** What people expect inflation to be, which is what makes it sticky. */
  inflationExpectation: number;
  /** Per cent of the workforce out of work. */
  unemployment: number;
  /** Per cent of the workforce in work. */
  employment: number;
  /** Annual nominal wage growth, %. */
  wageGrowth: number;
  /** The central bank's policy rate, %. Not the government's to set. */
  policyRate: number;

  consumerConfidence: number;
  businessConfidence: number;

  /** Household consumption, ₡bn a year. */
  householdSpending: number;
  /** Share of household income saved, %. */
  householdSavingsRate: number;
  /** Business investment, ₡bn a year. */
  investment: number;

  phase: CyclePhase;
  /**
   * The cycle the country is in, carried month to month.
   *
   * An AR(1) on the monthly economic weather: positive is a run of good
   * months compounding into an upswing, negative the reverse. Held in state
   * rather than redrawn, because a downturn is a season and not a series of
   * unrelated bad days.
   */
  cycleMomentum: number;
  /** The same, for the supply side — what keeps an inflation episode going. */
  priceMomentum: number;
  /** Consecutive months of contraction. Three is a recession. */
  contractionRun: number;
  /** Consecutive months above the boom threshold. */
  expansionRun: number;

  shocks: EconomicShock[];
  history: EconomyPoint[];
}

/**
 * A projection of where the economy goes if nothing new happens.
 *
 * Produced by running the same monthly step the resolution phase runs, so it
 * cannot disagree with what actually occurs — it can only be wrong about the
 * world, which is what forecasts are wrong about.
 */
export interface EconomyForecast {
  months: EconomyPoint[];
  /** Annualised growth over the horizon. */
  averageGrowth: number;
  averageInflation: number;
  /** Unemployment at the end of the horizon. */
  endUnemployment: number;
  /** True if any month in the horizon contracts. */
  recessionInHorizon: boolean;
}

/* ------------------------------------------------------------------ *
 * Engine 2B — government finance
 * ------------------------------------------------------------------ */

/** One tranche of borrowing, with a date it has to be paid back. */
export interface Bond {
  id: string;
  /** Face value, ₡bn. */
  principal: number;
  /** Annual coupon, %, fixed at issue. This is why timing matters. */
  coupon: number;
  /** Original tenor in months. */
  tenor: number;
  /** Months until it matures and the principal falls due. */
  remaining: number;
  issuedTurn: number;
}

export type CreditGrade = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';

export interface CreditRating {
  grade: CreditGrade;
  /** What the grade adds to the government's borrowing cost, in points. */
  spread: number;
  /**
   * The grade the numbers currently justify. Agencies take time to act, so
   * this can sit below `grade` for months — which is the warning a player
   * gets, and the one they are free to ignore.
   */
  pending: CreditGrade;
  /** Months the pending grade has been worse than the actual one. */
  reviewTurns: number;
  /** Plain-language reasons, shown verbatim. Never a hidden judgement. */
  reasons: string[];
}

export type FiscalRuleKind =
  | 'deficit_cap'
  | 'debt_ceiling'
  | 'spending_cap'
  | 'balanced_budget';

/**
 * A constraint the government wrote for itself.
 *
 * Adopting one costs political capital and buys credibility with lenders.
 * Breaching one costs approval every month it lasts, and costs it with the
 * partners who made it a condition. Repealing one is cheaper than adopting
 * it, which is the trap: the cheap way out of a rule is to abolish it, and
 * the market has been watching.
 */
export interface FiscalRule {
  kind: FiscalRuleKind;
  /** Meaning depends on the kind: a ratio for caps, ₡bn for a ceiling. */
  threshold: number;
  adoptedTurn: number;
  /** Consecutive months in breach. Zero when compliant. */
  breachTurns: number;
  /** Consecutive months compliant. Credibility is earned slowly. */
  complianceTurns: number;
}

/** A region's own accounts, which the centre funds and the region spends. */
export interface RegionalBudget {
  regionId: string;
  /** Transferred from the centre this month, ₡bn. */
  grant: number;
  /** Raised locally, ₡bn. */
  ownRevenue: number;
  /** Spent on regional services, ₡bn. */
  spending: number;
  /** 0–100. What people in this region actually experience. */
  serviceQuality: number;
  /** Region-level accumulated deficit, ₡bn. */
  debt: number;
}

/**
 * The public finances, beyond the single treasury and debt figures.
 *
 * The point of this structure is that a debt total tells a player nothing
 * they can act on. What they can act on is: how much falls due and when,
 * who is willing to lend and at what price, what the government has promised
 * about it, and what has been set aside.
 */
export interface PublicFinance {
  bonds: Bond[];
  rating: CreditRating;
  /** Points over the policy rate the market currently charges. */
  spread: number;
  rules: FiscalRule[];
  /** Cash that may only be released against a declared emergency, ₡bn. */
  emergencyFund: number;
  /** The sovereign fund. Compounds, and belongs to whoever governs next. */
  reserveFund: number;
  /** Standing monthly contribution to the reserve fund, ₡bn. */
  reserveContribution: number;
  regional: RegionalBudget[];
  /**
   * Whether anybody will lend to this country at all.
   *
   * The one fiscal consequence that is not a matter of degree. Below it the
   * government borrows expensively; at it the government does not borrow,
   * and the deficit has to be closed this week rather than over a
   * parliament — which is what a sovereign debt crisis actually is.
   */
  marketAccess: boolean;
  /** Weeks without it. Long enough and the government does not survive. */
  weeksShutOut: number;
  /** Rolling record of the headline fiscal ratios. */
  history: FiscalPoint[];
}

export interface FiscalPoint {
  turn: number;
  /** Debt as a share of annual GDP. */
  debtRatio: number;
  /** Deficit as a share of annual GDP. Positive is a deficit. */
  deficitRatio: number;
  /** All-in cost of new borrowing, %. */
  borrowingCost: number;
  grade: CreditGrade;
}

/** The whole fiscal picture, projected forward. */
export interface FiscalForecast {
  months: FiscalPoint[];
  /** Debt-to-GDP at the end of the horizon. */
  endDebtRatio: number;
  /** True if any rule currently held would be breached inside the horizon. */
  breachInHorizon: FiscalRuleKind[];
  /** True if the rating would fall inside the horizon. */
  downgradeInHorizon: boolean;
}

/* ------------------------------------------------------------------ *
 * Engine 2C — the tax code
 * ------------------------------------------------------------------ */

/**
 * Every rate the government sets, plus the three dials that decide who the
 * income tax falls on.
 *
 * `recentChanges` exists so the political cost of a rise can decay while the
 * revenue does not. Voters stop being angry about a rate long before the
 * treasury stops collecting it.
 */
export interface TaxCode {
  rates: Record<import('./content/taxes.ts').TaxKey, number>;
  /** 0 flat, 1 steeply progressive. Moves who pays, not how much. */
  progressivity: number;
  /** 0–1. Narrows the income tax base; worth most to whoever has most to deduct. */
  deductions: number;
  /** 0–1. Paid straight back out, mostly to people with the least. */
  credits: number;
  recentChanges: {
    key: import('./content/taxes.ts').TaxKey;
    from: number;
    to: number;
    turn: number;
  }[];
}


/* ------------------------------------------------------------------ *
 * Engine 2D — industries
 * ------------------------------------------------------------------ */

/**
 * One industry, as it currently stands.
 *
 * `health` is an index where 100 means "performing exactly as its share of
 * the economy implies". The two shares move with it, and they move at
 * different speeds: firms cut hours and hoard skilled staff long before they
 * cut headcount, and rehire later than they recover.
 */
export interface IndustryState {
  key: import('./content/industries.ts').IndustryKey;
  health: number;
  outputShare: number;
  employmentShare: number;
}

/* ------------------------------------------------------------------ *
 * Engine 2E — population
 * ------------------------------------------------------------------ */

/** One region's share of the people, and how it is changing. */
export interface RegionalPopulation {
  regionId: string;
  /** People, in millions. */
  population: number;
  /** Net arrivals this month, in thousands. Negative is a region emptying. */
  netFlow: number;
  /** Share of this region's people living in towns and cities. */
  urban: number;
}

/** One month of the demographic record. */
export interface DemographyPoint {
  turn: number;
  population: number;
  workforce: number;
  retiredShare: number;
  netMigration: number;
  lifeExpectancy: number;
}

/**
 * The people.
 *
 * The slowest system in the game and the one with the longest reach. Nothing
 * here moves fast enough for a government to see the result of its own
 * decisions about it, which is the point: this is the part of governing that
 * is genuinely somebody else's problem, and the game lets a player choose
 * whether to care.
 */
export interface Demography {
  /** Total population, in millions. */
  population: number;
  /** Births and deaths per thousand people per year. */
  birthRate: number;
  deathRate: number;
  lifeExpectancy: number;

  /** The three age bands. They sum to one. */
  youthShare: number;
  workingShare: number;
  retiredShare: number;

  /** Net migration per thousand people per year. Negative is net departure. */
  netMigration: number;
  /** Arrivals and departures separately, because they are argued about separately. */
  immigration: number;
  emigration: number;

  /** Share of the country living in towns and cities. */
  urbanisation: number;
  /** People per square unit. A presentation figure, derived from the above. */
  density: number;
  /** People per household. Falls slowly as the country ages. */
  householdSize: number;

  /** Share of working-age people in or seeking work. */
  participation: number;
  /** Working-age people actually in the labour force, in millions. */
  workforce: number;
  /**
   * Share of the working-age population with the training the economy is
   * asking for. Moved by education spending and by nothing else that is fast.
   */
  skills: number;

  regional: RegionalPopulation[];
  history: DemographyPoint[];
  /** The turn the seats were last redistributed between regions. */
  lastApportionment: number;
}

/** Where the population goes if nothing changes. */
export interface DemographyForecast {
  months: DemographyPoint[];
  /** Population at the end of the horizon, in millions. */
  endPopulation: number;
  /** Retired share at the end. The number that decides the pension bill. */
  endRetiredShare: number;
  /** Working-age people per retired person at the end. */
  endDependencyRatio: number;
}

/* ------------------------------------------------------------------ *
 * Engine 2F — infrastructure
 * ------------------------------------------------------------------ */

/** One asset, as it currently stands. */
export interface InfrastructureAsset {
  key: import('./content/infrastructure.ts').InfrastructureKey;
  /** 0–100. Falls without maintenance, and takes years to recover. */
  condition: number;
  /** Units of capacity currently in service. */
  capacity: number;
  /**
   * Deferred maintenance, in ₡bn of work owed.
   *
   * Compounds at more than it was avoided for, because catching up is
   * dearer than keeping up: a resurfacing deferred becomes a reconstruction.
   */
  backlog: number;
}

/** Something being built. Most of these outlast the government that starts them. */
export interface InfrastructureProject {
  id: string;
  key: import('./content/infrastructure.ts').InfrastructureKey;
  /** Units of capacity it will add when it opens. */
  units: number;
  /** ₡bn still to be paid. */
  remainingCost: number;
  /** Months until it opens. */
  remainingTurns: number;
  /** The turn it was commissioned, and by which term. */
  startedTurn: number;
  startedTerm: number;
}

/** Everything the country is built out of. */
export interface Infrastructure {
  assets: InfrastructureAsset[];
  projects: InfrastructureProject[];
  /**
   * Maintenance spending as a multiple of full upkeep.
   *
   * The single most consequential dial in the game that nobody will ever
   * thank a government for setting correctly.
   */
  maintenanceLevel: number;
}

/* ------------------------------------------------------------------ *
 * Engine 2G — government services
 * ------------------------------------------------------------------ */

/** One service, as it currently stands. */
export interface ServiceState {
  key: import('./content/services.ts').ServiceKey;
  /** ₡bn a month it would take to meet demand in full. */
  demand: number;
  /** ₡bn a month it is actually getting. */
  funding: number;
  /** 0–100. What people experience. */
  quality: number;
  /** Relative to what meeting demand would need. 1 is fully staffed. */
  staffing: number;
  /** Months people wait, for the services where the failure is a queue. */
  waitMonths: number;
}


/* ------------------------------------------------------------------ *
 * Engine 3 — the world
 * ------------------------------------------------------------------ */

export type TreatyKind =
  | 'bilateral'
  | 'multilateral'
  | 'trade'
  | 'defence'
  | 'peace'
  | 'non_aggression'
  | 'mutual_defence'
  | 'partnership';

/**
 * An agreement in force.
 *
 * A treaty is a commitment rather than a bonus. Each one constrains what the
 * government can do next — a defence pact means somebody else's war is
 * potentially yours — and withdrawing costs relations with everybody
 * watching, not just with the other signatory.
 */
export interface Treaty {
  id: string;
  kind: TreatyKind;
  /** The other signatories. More than one for a multilateral treaty. */
  parties: import('./content/nations.ts').NationKey[];
  signedTurn: number;
  signedTerm: number;
  /** One line stating what it actually obliges. */
  obligation: string;
  /** Relations gained per month it holds, as a standing dividend. */
  dividend: number;
}

/** The state of the relationship with one country. */
export interface NationState {
  key: import('./content/nations.ts').NationKey;
  /** −100 hostile to +100 allied. */
  relations: number;
  /** Is there a mission in their capital? */
  embassy: boolean;
  /** Is there an ambassador in it, and how long have they been there? */
  ambassadorMonths: number | null;
  /** Do we recognise them as a state at all? */
  recognised: boolean;
  /** Turn of the last summit attended together. */
  lastSummitTurn: number | null;
  /** Are they under our sanctions? */
  sanctioned: boolean;
  /** How much of their trade is with us, 0–1. Leverage runs both ways. */
  tradeDependence: number;
  /** How much of OUR trade is with them. The other half of the leverage. */
  ourDependence: number;
  /**
   * Their weight in the world, live.
   *
   * Seeded from the template and then drifting, because a country's
   * standing is not a constant — which means the trade gravity, the
   * balance of force in a crisis and the arithmetic of every international
   * vote all look different in term four than they did in term one.
   */
  power: number;
  /**
   * How they behave, live.
   *
   * Also not a constant. A government removed overnight is a different
   * country by the following week, and every relationship it is in moves
   * with it.
   */
  posture: import('./content/nations.ts').Posture;
  /**
   * Do we share a land border with them?
   *
   * The next four fields are relational rather than absolute: they are only
   * true from one capital. Which country the player governs is a choice, so
   * they cannot live on the country table — they are computed for the chosen
   * country when the world is built, and stored here.
   */
  neighbour: boolean;
  /** Their output as a multiple of ours. What trade gravity reads. */
  economy: number;
  /** What they buy from us: our exports they need. */
  buys: import('./content/industries.ts').IndustryKey[];
  /** What they sell us: their exports we import. */
  sells: import('./content/industries.ts').IndustryKey[];
}

/** One month of the world record. */
export interface WorldPoint {
  turn: number;
  /** Average relations across every recognised state. */
  standing: number;
  /** How much attention the world pays us, 0–100. */
  influence: number;
  /** How dangerous the world is, 0–100. */
  tension: number;
}

/** Everything outside the borders. */
/* ------------------------------------------------------------------ *
 * The forces
 * ------------------------------------------------------------------ */

/** One arm, and the three numbers that mean different things. */
export interface ArmState {
  key: import('./content/forces.ts').ArmKey;
  /** How much of it there is. Bought over years, lost in weeks. */
  strength: number;
  /** Whether it could go tomorrow. The first thing cut. */
  readiness: number;
  /** How old the kit is. Falls every week whatever anybody does. */
  equipment: number;
  /** People in uniform, in thousands. */
  personnel: number;
}

/** Something that takes years, costs more than anybody said, arrives late. */
export interface Programme {
  id: string;
  key: string;
  startedTurn: number;
  /** The turn it was announced for. */
  dueTurn: number;
  /** The turn it is now expected. These are never the same. */
  slippedTo: number;
  spent: number;
  /** The current estimate, which is not the original one. */
  cost: number;
  cancelled: boolean;
  delivered: boolean;
}

/** Forces committed somewhere that is not here. */
export interface Deployment {
  id: string;
  nation: import('./content/nations.ts').NationKey;
  kind: 'peacekeeping' | 'alliance' | 'combat' | 'training';
  /** Share of the total force tied up by it. */
  commitment: number;
  /** ₡bn a year. */
  cost: number;
  startedTurn: number;
  /** Why the country is there, in its own words. */
  mandate: string;
}

export interface MilitaryPoint {
  turn: number;
  power: number;
  readiness: number;
  committed: number;
}

export interface Military {
  arms: ArmState[];
  doctrine: import('./content/forces.ts').DoctrineKey;
  programmes: Programme[];
  deployments: Deployment[];
  /**
   * The decision that cannot be taken back.
   *
   * 'none' is where almost every country is and stays. 'pursuing' is a
   * decade of expense and a permanent argument with everybody. 'held'
   * changes what the country is, in the eyes of every other government,
   * for good.
   */
  deterrent: 'none' | 'pursuing' | 'held';
  /** Thousands. A constituency rather than a statistic, and they remember. */
  veterans: number;
  history: MilitaryPoint[];
}

/* ------------------------------------------------------------------ *
 * The world, running on its own
 * ------------------------------------------------------------------ */

/** What two OTHER countries think of each other. */
export interface NationPair {
  a: import('./content/nations.ts').NationKey;
  b: import('./content/nations.ts').NationKey;
  /** −100 hostile to +100 allied. Drifts on its own. */
  standing: number;
}

/** A war between two countries, neither of which is this one. */
export interface ForeignWar {
  a: import('./content/nations.ts').NationKey;
  b: import('./content/nations.ts').NationKey;
  since: number;
  /** How long it is expected to last. Everybody is wrong about this. */
  expected: number;
  ended: boolean;
  endedTurn: number | null;
}

/** Something that happened somewhere else and arrived here anyway. */
export interface GlobalEvent {
  key: string;
  startedTurn: number;
  ended: boolean;
  /** The turn a government did something about it, if one did. */
  respondedTurn: number | null;
}

/* ------------------------------------------------------------------ *
 * Intelligence
 * ------------------------------------------------------------------ */

/**
 * What the agencies say, and what is actually true.
 *
 * Both are stored, and only one of them is ever shown. The gap between
 * them is the entire subject: the paper says high confidence, the paper is
 * wrong, and asking for a better paper does not help.
 */
export interface Assessment {
  id: string;
  nation: import('./content/nations.ts').NationKey;
  subject: import('./content/intelligence.ts').AssessmentSubject;
  turn: number;
  /** The number on the paper. */
  estimate: number;
  /** The number that is true. Never shown to the player. */
  truth: number;
  confidence: 'low' | 'moderate' | 'high';
  /** Marked once enough time has passed that the answer is visible. */
  verdict: 'unknown' | 'sound' | 'wrong';
}

/** Something done quietly, which is deniable until it is not. */
export interface Operation {
  id: string;
  kind: import('./content/intelligence.ts').OperationKey;
  nation: import('./content/nations.ts').NationKey;
  startedTurn: number;
  dueTurn: number;
  /** The chance of surfacing, fixed at launch under that week's conditions. */
  exposure: number;
  status: 'running' | 'succeeded' | 'failed' | 'exposed';
}

export interface Intelligence {
  /** Where the collection budget goes. The three sum to one. */
  posture: { human: number; signals: number; analysis: number };
  /** How good collection actually is, 0–100. People, not equipment. */
  capability: number;
  /** How much of what this country does is known to others. */
  penetration: number;
  /** Which rung of the surveillance ladder is in force. */
  powers: number;
  /** How closely the agencies are watched, 0–100. */
  oversight: number;
  assessments: Assessment[];
  operations: Operation[];
}

/* ------------------------------------------------------------------ *
 * Conflict
 * ------------------------------------------------------------------ */

export type CrisisStage = 'incident' | 'standoff' | 'crisis' | 'war' | 'settled';

/**
 * A quarrel with somebody, and where it has got to.
 *
 * Crises arrive rather than being started, because the decision a
 * government actually faces is never whether to have one.
 */
export interface Crisis {
  id: string;
  nation: import('./content/nations.ts').NationKey;
  /** What happened, in one line. */
  cause: string;
  stage: CrisisStage;
  startedTurn: number;
  stageSince: number;
  /** 0–100. Climbs on provocation, falls when nobody feeds it. */
  escalation: number;
  /** Points of annual approval the flag is currently worth. Decays. */
  rally: number;
  casualties: number;
  /** How long each side will keep going. Not the same as who is winning. */
  ourResolve: number;
  theirResolve: number;
  /** Who else is in it. */
  allies: import('./content/nations.ts').NationKey[];
  settlement: 'favourable' | 'even' | 'unfavourable' | null;
}

/* ------------------------------------------------------------------ *
 * Trade
 * ------------------------------------------------------------------ */

/** What the country sells one partner, what it buys, and on what terms. */
export interface TradeFlow {
  nation: import('./content/nations.ts').NationKey;
  /** ₡bn a year sold to them. */
  exports: number;
  /** ₡bn a year bought from them. */
  imports: number;
  /**
   * Points of tariff this government has laid on their goods, over and
   * above the national rate. A government's own doing, and the thing the
   * other side answers.
   */
  surcharge: number;
  /** Points of tariff they charge ours. */
  theirTariff: number;
  /**
   * Weeks until they answer a tariff rise.
   *
   * The gap between the announcement and the bill is the entire political
   * economy of protection, so it is modelled rather than assumed away.
   */
  retaliationDue: number | null;
  /** A formal objection, lodged by us or against us. */
  dispute: 'none' | 'ours' | 'theirs';
}

export interface TradePoint {
  turn: number;
  exports: number;
  imports: number;
}

export interface Trade {
  flows: TradeFlow[];
  history: TradePoint[];
}

/** Membership of one international body. */
export interface OrganisationState {
  key: import('./content/organisations.ts').OrganisationKey;
  member: boolean;
  /** The turn this government joined, or 0 for one it inherited. */
  joinedTurn: number | null;
  /** Rights suspended: the obligations continue, the benefits do not. */
  suspended: boolean;
  /** How the other members regard this one, 0–100. */
  standing: number;
}

/** A resolution that was put, and what the room did with it. */
export interface Resolution {
  id: string;
  kind: import('./content/organisations.ts').ResolutionKind;
  organisation: import('./content/organisations.ts').OrganisationKey;
  title: string;
  /** The state it is about, where it is about one. */
  target: import('./content/nations.ts').NationKey | null;
  turn: number;
  for: number;
  against: number;
  abstain: number;
  passed: boolean;
  vetoedBy: import('./content/nations.ts').NationKey | null;
  /** The bar this room set, kept so the record can be read without it. */
  threshold: number;
  quorum: number;
  /** How each member voted and why, kept so a loss can be read back. */
  votes: {
    nation: import('./content/nations.ts').NationKey;
    vote: 'for' | 'against' | 'abstain';
    why: string;
    veto: boolean;
  }[];
}

export interface World {
  nations: NationState[];
  treaties: Treaty[];
  /**
   * What other countries think of EACH OTHER, and what they are doing
   * about it. The half of the world that is not about this one.
   */
  pairs: NationPair[];
  wars: ForeignWar[];
  /** Things that happened somewhere else and arrived here anyway. */
  globalEvents: GlobalEvent[];
  /** Every body the country belongs to, or has chosen not to. */
  organisations: OrganisationState[];
  /** Everything put to a vote, and what the room did with it. */
  resolutions: Resolution[];
  /**
   * Reputation: what other governments expect of this one.
   *
   * Earned by keeping agreements and lost by breaking them, and it is read
   * by every country, not just the one that was let down. This is why
   * withdrawing from a treaty is expensive in a way the other signatory
   * never has to enforce.
   */
  reputation: number;
  /** Diplomatic weight, 0–100. What the country can get done in a room. */
  influence: number;
  /** How dangerous the world currently is, 0–100. */
  tension: number;
  history: WorldPoint[];
}

/* ------------------------------------------------------------------ *
 * The budget
 * ------------------------------------------------------------------ */

/** One line of the budget: what a single service is funded at. */
export interface BudgetLine {
  service: import('./content/services.ts').ServiceKey;
  /** ₡bn a year currently in force. What is actually being spent. */
  enacted: number;
  /** ₡bn a year the government is proposing for next year. */
  proposed: number;
  /** Share of the line that is capital rather than running costs. */
  capitalShare: number;
  /**
   * Years this line is contractually committed for.
   *
   * Capital spending is contracted, so a successor who wants the money back
   * has to break a contract. This is why so much of any government's budget
   * was decided by somebody else.
   */
  committedYears: number;
}

/** A department, and the party that holds it. */
export interface MinistryState {
  key: import('./content/ministries.ts').MinistryKey;
  /** The party whose minister runs it, or null for the governing party. */
  heldBy: string | null;
  /**
   * What this minister is asking for, as a multiple of what they have.
   *
   * Always more than one. Every minister believes their department is
   * underfunded, and most of them are right.
   */
  demand: number;
}

export type BudgetStage = 'drafting' | 'presented' | 'enacted' | 'rejected';

/**
 * The budget, as a document rather than a set of sliders.
 *
 * It has a stage, because a budget is a process: drafted by the treasury,
 * fought over in cabinet, put to the chamber, and either enacted or lost. It
 * is the most important vote a government takes — the only one it cannot
 * avoid, cannot delay past the year, and cannot lose without the whole thing
 * coming down.
 */
export interface Budget {
  /** The financial year it covers. */
  year: number;
  stage: BudgetStage;
  lines: BudgetLine[];
  ministries: MinistryState[];
  /** The division, once it has been held. */
  division: { for: number; against: number; abstain: number } | null;
  /** Budgets lost in a row. Two is a government in serious trouble. */
  defeats: number;
  /**
   * Opposition parties that have agreed to abstain on this budget.
   *
   * Confidence and supply: the only way a minority government ever passes
   * one, and the reason being in a minority is a hard position rather than
   * a lost one. The agreement lasts a year.
   */
  supply: string[];
  /** The turn the current budget was enacted. */
  enactedTurn: number;
}

export interface GameState {
  id: string;
  ownerId: string | null;
  countryName: string;
  /** Which country is being governed. Every real one plus the invented one. */
  country: import('./content/world/countries.ts').CountryKey;
  difficulty: Difficulty;

  /**
   * How large this country is, against the scale the engine is calibrated at.
   *
   * The whole domestic engine is ratio-driven — a sector's health is a
   * function of funding over baseline, a spread is a function of debt over
   * output — so it runs unchanged at any size provided the absolutes move
   * together. These two factors are what move them: `moneyScale` multiplies
   * every figure in currency, `peopleScale` multiplies every physical
   * capacity.
   *
   * A cost per head is money over people, so it carries BOTH — which is how
   * a country with a third of the income per head ends up with services that
   * cost a third as much per head, rather than with a permanently
   * unaffordable health service. That is not a fudge; it is what income per
   * head means.
   *
   * Both are exactly 1 for the invented country, so every measurement taken
   * of the balance before this existed still means what it meant.
   */
  moneyScale: number;
  peopleScale: number;
  /**
   * How much debt this country's creditors will carry, as a multiple of the
   * baseline. A fact about who holds the paper, not a difficulty setting.
   */
  debtTolerance: number;

  turnNumber: number;
  termNumber: number;
  phase: Phase;

  politicalCapital: number;
  approval: number;
  treasury: number;
  debt: number;
  /** Recurring revenue modifier accumulated from passed bills. */
  revenueModifier: number;

  /**
   * The people, all of whom are invented.
   *
   * Built once from the run's own seed and carried for sixteen years, so
   * the leader who called something a betrayal in term one is the same
   * person in term four and can be reminded of it.
   */
  cast: import('./systems/personas.ts').Cast;

  /** The macroeconomy: output, prices, jobs, rates and the cycle. */
  economy: Economy;

  /** The public finances: what the debt is made of, and who is lending. */
  finance: PublicFinance;

  /** Every rate the government sets, and who each one falls on. */
  taxes: TaxCode;

  /** What the economy is made of, and where each part of it is. */
  industries: IndustryState[];

  /** The people: how many, how old, where, and how many of them work. */
  demography: Demography;

  /**
   * Who the country's money belongs to, and what it buys them.
   *
   * The join between the budget and the electorate: every decision about a
   * tax rate or a service is a decision about particular households, and
   * this is where that lands before it reaches the polling.
   */
  society: Society;

  /**
   * What it is like to live here: what households can actually reach, and
   * how they feel about the direction of travel.
   */
  living: Living;

  /**
   * What the country is, as distinct from what it has: a shared story,
   * the institutions that tell it, and the norms nothing enforces.
   */
  culture: Culture;

  /**
   * What the country thinks of the arrangements it is governed under.
   *
   * Underneath approval and far more consequential: institutional trust
   * decides how much of what is owed is actually collected, and the
   * belief that participating works decides whether frustration becomes
   * a march or an absence.
   */
  opinion: Opinion;

  /**
   * The sixteen things going wrong, and how fast.
   *
   * Every one derived from conditions the player set, every one
   * compounding with the others, and every one slower to reverse than it
   * was to cause.
   */
  problems: Problems;

  /**
   * The electorate replacing itself underneath the government.
   *
   * Nobody changes their mind: the oldest cohort leaves and the youngest
   * arrives, and the country's centre of gravity moves with them.
   */
  generations: Generations;

  /**
   * What anybody is organised about, and what the government did about it.
   *
   * A movement needs a grievance, a constituency and the belief that
   * acting works. The four answers to one are the decision this engine
   * exists for, and none of them is free.
   */
  movements: Movements;

  /** What the country is built out of, and what is being built. */
  infrastructure: Infrastructure;

  /** The twenty things the state actually does, and how well. */
  services: ServiceState[];

  /** Everything outside the borders. */
  world: World;

  /**
   * What the country sells, what it buys, and on what terms.
   *
   * Kept beside the world rather than inside it because trade is the half
   * of foreign policy with a domestic constituency: every decision here
   * reaches the economy, the industries and a region's employment before it
   * reaches an embassy.
   */
  trade: Trade;

  /**
   * What the country could actually do, as distinct from what it owns.
   *
   * Every decision here is slow and every consequence is late, which is
   * the honest shape of defence policy: a government that cuts readiness
   * changes nothing anybody can see, and changes what is possible under a
   * government that will not be this one.
   */
  military: Military;

  /**
   * The distance between the population and an army.
   *
   * A country can have two million people of military age and no army:
   * between them sits a training pipeline measured in months that cannot
   * be bought, and a government that discovers this in week one of a war
   * has discovered it too late.
   */
  manpower: Manpower;

  /**
   * The army as a structure, and the people who run it.
   *
   * Two things live here that live nowhere else: how long an order takes
   * to reach the people who carry it out, and whether the officers who
   * would carry it out can be relied on to.
   */
  orbat: Orbat;

  /**
   * The people round the table, and why each of them is there.
   *
   * Almost none of them for what they can do. The appointment is a
   * payment, which is why removing one is a withdrawal rather than a
   * personnel decision.
   */
  cabinet: Cabinet;

  /**
   * The building, which outlasts every government in it and knows it.
   *
   * A government that fights it wins on the day and loses over the term.
   * One that replaces it gets compliance immediately and loses the
   * capability with the people who left. There is no correct setting,
   * which is why it is on the desk.
   */
  civilService: CivilService;

  /**
   * The bench, and the force that feeds it cases.
   *
   * Anchored on the one finding that survives every replication:
   * certainty of being caught deters far more than severity of
   * punishment does, which is why the popular lever — sentencing — is
   * the weaker one, and the unglamorous lever — clearance — is the
   * lever that actually moves the crime figures.
   */
  justice: Justice;

  /**
   * What the country remembers, which outlives every government in it.
   *
   * The point of modelling a war in a political game is what the country
   * is like afterwards, and this is where afterwards is kept: a record a
   * player can read back fifty or a hundred years later and find that
   * the reason a region votes the way it does is a war nobody in the
   * government was alive for.
   */
  timeline: Timeline;

  /**
   * What the country thinks the other side has, and whether it can stop.
   *
   * One per war. Opened the day the war starts rather than the day talks
   * do, because the trap is set on the first day: what a government says
   * in week one about what it will never accept is what will not let it
   * sign in week a hundred.
   */
  negotiations: Negotiation[];

  /**
   * What the army believes about how wars are won, and what it is
   * buying for a decade nobody can see.
   *
   * Both run on clocks longer than a term, which is why they are the
   * two military decisions a government makes that it will never see the
   * result of.
   */
  doctrine: Doctrine;

  /**
   * The depots, and the arithmetic nobody does.
   *
   * Weeks of ammunition, weeks of fuel, and how many people are behind
   * the front for every one at it. All of it computable on the first
   * afternoon and none of it briefed.
   */
  logistics: Logistics;

  /**
   * Turning the country over to it, and paying for it.
   *
   * Nothing arrives for eighteen months, it arrives under a successor,
   * and it does not unwind.
   */
  warEconomy: WarEconomy;

  /**
   * The fleet: built in decades, lost in an afternoon, and about a third
   * of it ever at sea.
   */
  navy: Navy;

  /**
   * The air force: a consumable that looks like an asset, and the place
   * the most politically attractive option in the game lives.
   */
  airForce: AirForce;

  /**
   * The ground, where there is any.
   *
   * One per war being fought on land. Empty almost always, which is the
   * correct shape: the map is not a screen a government visits, it is a
   * thing that appears when something has gone badly wrong and does not
   * go away when the government would like it to.
   */
  theatres: Theatre[];

  /** Quarrels with other states, and how far up the ladder each one is. */
  crises: Crisis[];

  /**
   * What the agencies say, what they have done, and who is inside.
   *
   * The only system in the game whose output the player cannot trust,
   * which is the most accurate thing about it.
   */
  intelligence: Intelligence;

  /** The budget: line items, ministries, and where it is in the process. */
  budget: Budget;

  /**
   * The player's own party: factions, discipline, members, and money that is
   * the party's rather than the state's.
   */
  partyInternals: PartyInternals;

  parties: Party[];
  sectors: Sector[];
  regions: Region[];
  /**
   * How votes become seats. Chosen at setup and fixed for the run — changing
   * the rules mid-game is a constitutional act, not a settings toggle.
   */
  electoralSystem: ElectoralSystem;
  /**
   * The second chamber. Renewed by halves, so half of it always reflects a
   * previous electorate.
   */
  senate: Senate;
  /**
   * Single-member seats. Empty under pure proportional counting, which needs
   * only regions.
   */
  districts: District[];

  /** Bills available to table this term, plus everything already resolved. */
  bills: Bill[];
  /** Events belonging to the current turn. */
  events: GameEvent[];

  news: NewsItem[];
  logs: TurnLog[];
  elections: ElectionResult[];
  /** One point per resolved turn, for the standing trend chart. */
  approvalHistory: ApprovalPoint[];

  negotiation: NegotiationState | null;
  campaign: CampaignState | null;

  career: CareerRecord;
  status: RunStatus;

  /** Deterministic RNG state. Persisted so the server can reproduce a turn. */
  rngState: number;
  /** Public addresses made this term, for diminishing returns. */
  addressesThisTerm: number;
  /** Manifesto commitments made at the last election. */
  promises: ManifestoPromise[];
  /** Executive orders issued this term. Each one costs more than the last. */
  executiveOrdersThisTerm: number;
  /** Referendums held, most recent last. */
  referendums: {
    termNumber: number;
    question: string;
    yesShare: number;
    turnout: number;
    passed: boolean;
  }[];
  /** True once an emergency budget has unlocked the budget on a non-budget turn. */
  budgetUnlocked: boolean;
  /**
   * Set when a partner walked out and took the majority with it. Distinguishes
   * a real confidence crisis from a minority government the player chose.
   */
  confidenceCrisis: boolean;

  createdAt: string;
  updatedAt: string;
}

/** Approval history point, derived for the trend chart. */
export interface ApprovalPoint {
  turn: number;
  approval: number;
}

/* ------------------------------------------------------------------ *
 * Engine 4 — Society
 * ------------------------------------------------------------------ */

/** One band of the distribution, as households rather than as a statistic. */
export interface ClassBand {
  key: import('./content/classes.ts').ClassKey;
  /** Share of households in the band, 0–1. Fixed; people move between bands
      only over generations, which is what social mobility measures. */
  households: number;
  /** Share of national income, 0–1. */
  incomeShare: number;
  /** Share of national net worth, 0–1. */
  wealthShare: number;
  /** Owned outright, mortgaged, renting. Sums to 1. */
  tenure: { owned: number; mortgaged: number; renting: number };
  /** Household debt as a multiple of annual income. */
  debtToIncome: number;
  /** Share of income saved, %. Negative is running savings down. */
  savingsRate: number;
  /**
   * Income after tax, housing and energy, indexed to 100 at the start of
   * the run. The number a household actually experiences, and the one that
   * can fall while gross income rises.
   */
  disposableIndex: number;
}

export interface SocietyPoint {
  turn: number;
  incomeGini: number;
  wealthGini: number;
  povertyRate: number;
  costOfLiving: number;
  lowerDisposable: number;
  medianDisposable: number;
}

export interface Society {
  bands: ClassBand[];
  /**
   * How concentrated this country's distribution is, relative to the
   * engine's reference country. Carried on the state because every target
   * in the weekly step is measured against where THIS country started —
   * otherwise an unequal country would spend a run being pulled toward an
   * average it has never been at.
   */
  inequality: number;
  /** Households with net worth above the top threshold, per thousand. */
  highNetWorthPerThousand: number;
  incomeGini: number;
  wealthGini: number;
  /** Below 60% of median disposable income, %. */
  povertyRate: number;
  /** Chance a household from the bottom band reaches the top two, %. */
  socialMobility: number;
  /** Share of net worth that was inherited rather than earned, %. */
  inheritedWealthShare: number;
  /** Indexed to 100 at the start of the run. */
  costOfLiving: number;
  /**
   * The general price level alone, indexed to 100.
   *
   * Kept apart from `costOfLiving` because the two are different kinds of
   * thing: this compounds, because inflation is a rate, while housing and
   * energy shift the level and then hold it there.
   */
  basePrices: number;
  /**
   * Real output per household, indexed to 100 at the start.
   *
   * The only thing that makes a country better off in aggregate, and the
   * base each band's disposable income is measured against — so a band can
   * lose ground while this rises, which is the distinction the whole
   * distribution exists to make.
   */
  realIncomeIndex: number;
  /** What housing takes from a typical household, % of income. */
  housingCostBurden: number;
  /** Household debt as a share of annual output, %. */
  householdDebt: number;
  /** Household saving, % of disposable income. */
  householdSavings: number;
  history: SocietyPoint[];
}

/** One of the twelve things a household needs to be able to get. */
export interface AccessState {
  key: import('./content/access.ts').AccessKey;
  /** How reliably a typical household can actually get it, 0–100. */
  level: number;
  /**
   * How many points worse it is at the bottom of the distribution than at
   * the top. Wide where price does the rationing, narrow where a queue does.
   */
  gradient: number;
}

export interface LivingPoint {
  turn: number;
  standardOfLiving: number;
  qualityOfLife: number;
  lifeSatisfaction: number;
  happiness: number;
}

export interface Living {
  access: AccessState[];
  /** Access to the twelve domains, weighted by need. 0–100. */
  standardOfLiving: number;
  /** That, plus the parts of a life that are not consumption. 0–100. */
  qualityOfLife: number;
  /** Tracks the LEVEL, slowly and without decaying. 0–100. */
  lifeSatisfaction: number;
  /**
   * Tracks the CHANGE, quickly, and decays to neutral.
   *
   * The hedonic treadmill: a country held steady at an excellent standard
   * produces no happiness at all. This is why a competent government can
   * be unpopular on its own record.
   */
  happiness: number;
  /** Best region's standard less the worst's, points. */
  regionalInequality: number;
  /** How far cities sit above everywhere else, points. */
  urbanAdvantage: number;
  /** How far the countryside sits below the national standard, points. */
  ruralGap: number;
  regional: { regionId: string; standard: number }[];
  history: LivingPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 4 — Culture
 * ------------------------------------------------------------------ */

/**
 * One community, as a position in a distribution.
 *
 * Sizes and standing only. This engine never records who a community is:
 * no real ethnic group, religion, language or minority is named anywhere
 * in the game, because the mechanic worth having is structural and the
 * alternative would require asserting things about real people.
 */
export interface CulturalCommunity {
  id: string;
  /** An ordinal position — "the second community" — never an identity. */
  label: string;
  share: number;
  /** How far the state conducts itself in a way that includes them, 0–100. */
  recognition: number;
  /** How far they feel part of the country, 0–100. */
  belonging: number;
}

export interface CulturalInstitution {
  key: import('./content/culture.ts').CulturalInstitutionKey;
  /** ₡bn a year reaching it. */
  funding: number;
  /** Share of the country it touches, 0–100. */
  reach: number;
  /**
   * Whether it is actually working, 0–100.
   *
   * Falls faster than it rises: a disbanded ensemble is not re-formed by
   * restoring its grant.
   */
  vitality: number;
}

export interface CulturePoint {
  turn: number;
  nationalIdentity: number;
  politicalCulture: number;
  nationalPride: number;
  patriotism: number;
  culturalReach: number;
}

export interface Culture {
  /** How strong a shared story the country has, 0–100. */
  nationalIdentity: number;
  /** And how strong the local one is, which fills the space if it is thin. */
  regionalIdentity: number;
  communities: CulturalCommunity[];
  /** How far the state supports languages other than the default, 0–100. */
  languagePolicy: number;
  traditionStrength: number;
  /** Share for whom faith is central, %. */
  religiosity: number;
  /** Points of religiosity lost per year. A generational trend, not a policy. */
  secularisation: number;
  /** Public occasions a year that actually land. */
  festivals: number;
  institutions: CulturalInstitution[];
  /** How far the under-thirties sit from everybody else, 0–100. */
  youthDivergence: number;
  /**
   * The things everyone does because they are done rather than enforced:
   * conceding, resigning, obeying a court. Has to be gone before a
   * constitutional crisis is possible.
   */
  politicalCulture: number;
  /** Attachment to the place. Barely moves. */
  patriotism: number;
  /** Satisfaction with how it is doing. Moves constantly. */
  nationalPride: number;
  history: CulturePoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 4 — Public opinion
 * ------------------------------------------------------------------ */

export interface TrustState {
  key: import('./content/trust.ts').TrustKey;
  level: number;
}

export interface OpinionPoint {
  turn: number;
  institutionalTrust: number;
  efficacy: number;
  frustration: number;
  confidence: number;
  protestParticipation: number;
}

export interface Opinion {
  trust: TrustState[];
  /**
   * Whether people believe acting changes anything, 0–100.
   *
   * The hinge: the same frustration produces a country that marches or a
   * country that has gone quiet, depending entirely on this.
   */
  efficacy: number;
  /** Angry. Marches, when it believes marching works. */
  frustration: number;
  /** Hopeful. Spends and invests. */
  optimism: number;
  /** Afraid. Votes for security and against outsiders. */
  fear: number;
  /** Assured. Complies, pays, and gives a government room. */
  confidence: number;
  engagement: number;
  /** Share who have been out in the last year, %. */
  protestParticipation: number;
  petitionParticipation: number;
  /** Share organised and sustained about something, %. */
  activism: number;
  history: OpinionPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 4 — Social problems
 * ------------------------------------------------------------------ */

export interface ProblemState {
  key: import('./content/problems.ts').ProblemKey;
  /** In the problem's own unit — per 10,000, per cent, years, or an index. */
  level: number;
}

export interface ProblemsPoint {
  turn: number;
  unrest: number;
  exclusion: number;
  crime: number;
  stability: number;
}

export interface Problems {
  problems: ProblemState[];
  /**
   * The country's capacity to absorb all of it without anything breaking.
   *
   * Not the inverse of unrest: a country can be angry and stable, and a
   * quiet one with hollow institutions can be neither.
   */
  stability: number;
  history: ProblemsPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 4 — Generations
 * ------------------------------------------------------------------ */

export interface Cohort {
  id: string;
  label: string;
  /** Share of the electorate, 0–1. Moves; the lean does not. */
  share: number;
  /**
   * Position relative to the country's own centre, fixed at formation.
   *
   * People do not become their parents. They become older versions of
   * themselves, which is why the centre moves by replacement rather than
   * by persuasion.
   */
  lean: Ideology;
  /** How reliably this cohort votes, as a multiplier on baseline turnout. */
  turnout: number;
  formedAtTurn: number;
}

export interface GenerationsPoint {
  turn: number;
  centre: Ideology;
  gap: number;
}

export interface Generations {
  cohorts: Cohort[];
  /** The electorate's centre of gravity, weighted by share and turnout. */
  centre: Ideology;
  /**
   * Where it was on week one.
   *
   * Kept on the state so drift is measured over a whole career rather
   * than over whatever the capped history buffer still holds.
   */
  opening: Ideology;
  /** When the cohort currently being formed started being formed. */
  formingSince: number;
  /** And what the country is making of it so far. */
  forming: Ideology;
  history: GenerationsPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 4 — Social movements
 * ------------------------------------------------------------------ */

/** What a government can do about a movement. None of them is free. */
export type MovementResponse = 'concede' | 'negotiate' | 'ignore' | 'suppress';

export interface Movement {
  key: import('./content/movements.ts').MovementKey;
  startedTurn: number;
  /** Share of the country behind it, 0–100. */
  support: number;
  /** What it has left in it. Decays weekly; replenished by the grievance. */
  intensity: number;
  peakSupport: number;
  tactic: import('./content/movements.ts').Tactic;
  /** Weeks since anybody answered. Escalation runs off this. */
  weeksIgnored: number;
  /** What the government did this week, consumed at the next step. */
  lastResponse: MovementResponse | null;
  outcome: 'won' | 'absorbed' | 'exhausted' | 'suppressed' | null;
  endedTurn: number;
}

export interface MovementsPoint {
  turn: number;
  count: number;
  support: number;
  disruption: number;
}

export interface Movements {
  active: Movement[];
  resolved: Movement[];
  /**
   * What this government's answers have done to the belief that acting
   * works.
   *
   * Conceding raises it, which means more movements later; suppressing
   * lowers it, which means fewer and a country that has stopped asking.
   * The most consequential number in the engine and the slowest to show.
   */
  efficacyPressure: number;
  history: MovementsPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — War
 * ------------------------------------------------------------------ */

/** One side's capacity to keep going, which is what a war is a race between. */
export interface WarSide {
  /**
   * How close this side is to being unable to continue, 0–100.
   *
   * Political rather than material. Wars are not ended by running out of
   * soldiers; they end when a government can no longer carry its own
   * population, and this is that number.
   */
  exhaustion: number;
  /** Cumulative, in thousands. */
  casualties: number;
  /** Equipment written off, as an index. */
  materiel: number;
  /** Willingness to go on, which falls as exhaustion rises. */
  resolve: number;
  /** Share of available force committed, 0–1. */
  committed: number;
}

export interface WarPoint {
  turn: number;
  score: number;
  ourExhaustion: number;
  theirExhaustion: number;
  intensity: number;
}

export interface War {
  id: string;
  kind: import('./content/war.ts').WarKind;
  /** Who it is against. A civil war names the country itself. */
  against: string;
  aim: import('./content/war.ts').WarAim;
  /** Who started it. A government that did not is judged differently. */
  initiator: 'us' | 'them';
  allies: string[];
  theirAllies: string[];
  startedTurn: number;
  /** Standing granted on the day it started, and spent from that day. */
  rally: number;
  /** How it is actually going, -100 to 100. */
  score: number;
  /**
   * How it is going according to the despatches.
   *
   * Late, partial, and written by people with an interest in them. Good
   * intelligence narrows the gap with `score`; it never closes it.
   */
  reportedScore: number;
  /** How much of a war it is, 0–100. */
  intensity: number;
  us: WarSide;
  them: WarSide;
  ended: boolean;
  endedTurn: number | null;
  outcome: import('./content/war.ts').WarOutcome | null;
  /** The stated reason, written when it began rather than afterwards. */
  casus: string;
  events: string[];
  history: WarPoint[];
}

/**
 * A finished war, kept for the rest of the run.
 *
 * The point of modelling a war in a political game is what the country is
 * like afterwards, so this outlives the government that fought it and is
 * read back by the timeline fifty years later.
 */
export interface WarRecord {
  id: string;
  /** What it ended up being called. */
  name: string;
  kind: import('./content/war.ts').WarKind;
  against: string;
  aim: import('./content/war.ts').WarAim;
  outcome: import('./content/war.ts').WarOutcome;
  startedTurn: number;
  endedTurn: number;
  casualties: number;
  peakIntensity: number;
  casus: string;
  /** What it did to the country, for the timeline entry. */
  governmentsFallen: number;
  peakDebt: number;
  deepestRecession: number;
  territoryChanged: number;
  alliesInvolved: number;
}

/* ------------------------------------------------------------------ *
 * Engine 7 — Manpower
 * ------------------------------------------------------------------ */

export interface ManpowerPoint {
  turn: number;
  underArms: number;
  strength: number;
  morale: number;
  quality: number;
}

export interface Manpower {
  model: import('./content/manpower.ts').ManpowerModel;
  /** Everybody who could in principle be called. Not a force. */
  pool: number;
  /** In training. Not yet soldiers, and worth about a third of one. */
  recruits: number;
  trained: number;
  /** Made only by fighting, and worth half again as much as a trained one. */
  veterans: number;
  reserves: number;
  /**
   * How many the country can train at once.
   *
   * The binding constraint in almost every war, and the one no amount of
   * urgency shortens.
   */
  trainingCapacity: number;
  morale: number;
  /** What they are worth as soldiers, 0–100. Falls as the numbers rise. */
  quality: number;
  /** Leaving, this week. The quiet way an army stops existing. */
  desertion: number;
  /** How much of the country is looking for a way out of being called. */
  resistance: number;
  /** When the current arrangement began. The ratchet is measured from it. */
  mobilisedSince: number;
  peopleScale: number;
  history: ManpowerPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — Order of battle
 * ------------------------------------------------------------------ */

/**
 * An officer.
 *
 * `competence` and `loyalty` are drawn independently and stay
 * independent, because that is the whole point of the object. A
 * government that wants both has to be lucky; one that insists on
 * loyalty gets an army that does what it is told badly, and one that
 * insists on competence gets an army whose obedience is conditional.
 */
export interface Commander {
  id: string;
  name: string;
  echelon: import('./content/orbat.ts').EchelonKey;
  traits: import('./content/orbat.ts').CommanderTrait[];
  competence: number;
  loyalty: number;
  /** Made by commanding things, not by being promoted. */
  experience: number;
  /** How they are regarded, which follows results they did not cause. */
  standing: number;
  battlesFought: number;
  appointedTurn: number;
  dismissed: boolean;
}

/** A body of troops with a kind, a condition, and somebody in charge. */
export interface Formation {
  id: string;
  kind: import('./content/orbat.ts').FormationKind;
  echelon: import('./content/orbat.ts').EchelonKey;
  /** The commander it answers to. */
  parentId: string;
  /** How much of it is still there, 0–100. */
  strength: number;
  /** What it has learnt. Made by fighting; training barely moves it. */
  experience: number;
  equipment: number;
  /** Fed or not. Below about 30 a formation stops being one. */
  supply: number;
  personnel: number;
  /** In the fight, as opposed to in barracks. */
  committed: boolean;
  /** Where it is, once there is a map. Undefined in peacetime. */
  location?: string;
}

/**
 * An order that has been given and has not yet arrived.
 *
 * The engine's only honest answer to the question of why a government
 * cannot simply do the obvious thing: it can, and the obvious thing will
 * be done three weeks from now against a situation that no longer holds.
 */
export interface PendingOrder {
  id: string;
  kind: 'commit' | 'withdraw' | 'reinforce' | 'hold' | 'advance' | 'redeploy';
  formationId: string;
  /** Where it is being sent, when there is somewhere to send it. */
  target?: string;
  issuedTurn: number;
  weeksRemaining: number;
}

export interface OrbatPoint {
  turn: number;
  strength: number;
  committed: number;
  lag: number;
}

export interface Orbat {
  /** The highest echelon the country actually fields. */
  topLevel: import('./content/orbat.ts').EchelonKey;
  commanders: Commander[];
  formations: Formation[];
  orders: PendingOrder[];
  /**
   * How many echelons sit between the desk and the rifle company.
   *
   * The single number behind order lag. Shortening it is worth as much
   * as an equipment programme and is resisted by everybody whose job is
   * one of the echelons.
   */
  chainDepth: number;
  history: OrbatPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — The theatre
 * ------------------------------------------------------------------ */

/**
 * What the government believes about a sector.
 *
 * Kept separate from the sector itself, deliberately and permanently. A
 * government does not see a war; it reads about one, several days late,
 * from people who were not everywhere and would rather not say so. Every
 * panel in the game reads THIS, and the engine resolves the other one.
 */
export interface SectorBelief {
  /** Who we think holds it. */
  control: number;
  /** What we think is in front of us. */
  enemyStrength: number;
  /** How well we think it is being supplied. */
  supply: number;
  /** The turn any of this was last confirmed by somebody who was there. */
  lastSeen: number;
  /** Whether anybody has ever looked. */
  everSeen: boolean;
}

export interface FrontSector {
  id: string;
  name: string;
  terrain: import('./content/theatre.ts').TerrainKey;
  /**
   * Who holds it, 0–100, ours at 100.
   *
   * Continuous rather than a flag, because ground does not change hands
   * in an afternoon and the weeks in between are where wars are decided.
   */
  control: number;
  fortification: import('./content/theatre.ts').FortificationLevel;
  /** Weeks of work put into the next level. Time, not money. */
  works: number;
  /**
   * How well supplied the sector is, 0–100.
   *
   * Falls with distance from where the supply comes from, which is the
   * whole of the culminating point: an offensive that succeeds lengthens
   * its own supply line and shortens the enemy's, so the further it goes
   * the weaker it gets and the stronger they get.
   */
  supply: number;
  /** Distance from our own base of supply, in sectors. */
  depth: number;
  /** Formation ids fighting here. */
  garrison: string[];
  /** What they are up against, as a combat value. */
  enemyStrength: number;
  posture: import('./content/theatre.ts').SectorPosture;
  /** True while it is cut off. The worst thing that can happen to one. */
  encircled: boolean;
  /** Civilians, in thousands. A sector is a place people live. */
  population: number;
  /** How much of it is rubble. Never recovers inside a run. */
  devastation: number;
  belief: SectorBelief;
}

export interface TheatrePoint {
  turn: number;
  /** Average control across the theatre. The front line, as one number. */
  line: number;
  /** How far belief was from the truth, averaged. The fog, measured. */
  fog: number;
  supply: number;
}

export interface Theatre {
  /** The war this map belongs to. */
  warId: string;
  name: string;
  sectors: FrontSector[];
  /**
   * Which sector our supply comes from. Everything is measured from it.
   */
  baseSector: string;
  /** Reconnaissance effort, 0–1. What the government is spending to see. */
  reconnaissance: number;
  /** Weeks since the front last moved anywhere. */
  stagnantWeeks: number;
  history: TheatrePoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — The fleet and the air force
 * ------------------------------------------------------------------ */

/** A ship, or a small number of identical ones. */
export interface Ship {
  id: string;
  name: string;
  shipClass: import('./content/naval.ts').ShipClass;
  /** 0–100. Damage, not age. */
  condition: number;
  /** Where it is being asked to be. Presence is the whole currency. */
  station: import('./content/naval.ts').SeaZone | null;
  /** Weeks at sea without going home. Nothing lasts indefinitely. */
  weeksDeployed: number;
  /** Crew experience, 0–100. */
  crew: number;
  commissionedTurn: number;
  /** Gone. Kept in the list because a navy remembers its losses. */
  lost: boolean;
  lostTurn: number | null;
}

/** Something ordered that a successor will commission. */
export interface ShipOrder {
  id: string;
  shipClass: import('./content/naval.ts').ShipClass;
  orderedTurn: number;
  dueTurn: number;
  /** Already paid. Cancelling does not recover it. */
  spent: number;
}

export interface NavyPoint {
  turn: number;
  hulls: number;
  presence: number;
  /** Share of the trade routes actually being kept open. */
  lanes: number;
}

export interface Navy {
  ships: Ship[];
  building: ShipOrder[];
  /** Where the government has said it will be present. */
  stations: Partial<Record<import('./content/naval.ts').SeaZone, number>>;
  /** Losses, cumulative, because they are not replaced. */
  hullsLost: number;
  /** And what those losses did to the government, cumulatively. */
  prestigeLost: number;
  history: NavyPoint[];
}

/** A squadron. Aircraft are counted by squadron because governments do. */
export interface Squadron {
  id: string;
  name: string;
  kind: import('./content/air.ts').AircraftKind;
  /** Airframes, as a share of establishment, 0–100. */
  strength: number;
  /** Serviceable share of those, 0–100. The number nobody briefs. */
  serviceable: number;
  /** Aircrew quality, 0–100. Two years to make and not replaceable. */
  aircrew: number;
  sortiesFlown: number;
  commissionedTurn: number;
}

export interface AirForcePoint {
  turn: number;
  squadrons: number;
  serviceable: number;
  aircrew: number;
  superiority: number;
}

export interface AirForce {
  squadrons: Squadron[];
  building: {
    id: string;
    kind: import('./content/air.ts').AircraftKind;
    orderedTurn: number;
    dueTurn: number;
    spent: number;
  }[];
  /**
   * Who owns the sky, -100 to 100.
   *
   * A precondition rather than a victory. It lets the country do things;
   * it does not do them, and nothing it achieves appears in any figure
   * the public sees.
   */
  superiority: number;
  /** Where the effort is going. Shares, and they sum to one. */
  effort: Partial<Record<import('./content/air.ts').AirCampaign, number>>;
  /** Aircrew in training. Two years each, and the line cut first. */
  trainees: number;
  /** Cumulative airframes lost, and aircrew, counted separately. */
  airframesLost: number;
  aircrewLost: number;
  /**
   * What the bombing has done to their willingness to go on.
   *
   * Negative. It hardens them, and the harder it is pressed the more it
   * hardens them, which is the finding every government is told and none
   * has yet acted on.
   */
  bombingResolve: number;
  /** And what it has destroyed, which is real and is not the same thing. */
  bombingDamage: number;
  history: AirForcePoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — Logistics and the war economy
 * ------------------------------------------------------------------ */

/** One class of supply: what there is, and what is arriving. */
export interface Stockpile {
  key: import('./content/logistics.ts').SupplyClass;
  /**
   * Weeks of ordinary consumption held.
   *
   * The number that decides the shape of a war and is never briefed. It
   * can be worked out on the first afternoon by anybody who wants to.
   */
  weeks: number;
  /** Arriving per week, as a share of ordinary consumption. */
  production: number;
  /** And consumed per week, same units. Throughput, not stock. */
  consumption: number;
  /** How far production has been raised toward what was ordered, 0–1. */
  conversion: number;
  history: { turn: number; weeks: number }[];
}

export interface LogisticsPoint {
  turn: number;
  /** The shortest stock in the inventory, in weeks. The binding one. */
  shortest: number;
  /** What actually reaches the front, 0–1. */
  throughput: number;
  tail: number;
}

export interface Logistics {
  stock: Stockpile[];
  /**
   * People behind the front for every one at it.
   *
   * The reason an army of a hundred thousand is not a hundred thousand
   * rifles, and the reason that past some point adding troops reduces
   * what the country can bring to bear.
   */
  tail: number;
  /** How much of what is needed actually arrives, 0–1. */
  throughput: number;
  history: LogisticsPoint[];
}

export interface WarEconomyPoint {
  turn: number;
  output: number;
  civilianCost: number;
  converted: number;
}

export interface WarEconomy {
  footing: import('./content/logistics.ts').WarFooting;
  /**
   * How far the conversion has actually got, 0–1.
   *
   * A government that orders a war footing gets nothing for eighteen
   * months. This is the number that says how much of the nothing is
   * left, and it is the one that makes the decision a decision.
   */
  converted: number;
  /** The turn the current footing was ordered. The unwind runs from it. */
  orderedTurn: number;
  /** How it is being paid for, which decides who pays. */
  finance: import('./content/logistics.ts').WarFinance;
  /** Cumulative, in ₡bn. The bill, whoever ends up holding it. */
  spent: number;
  /**
   * What has been taken out of the civilian economy, cumulatively.
   *
   * Guns and butter is a lie, and so is guns instead of butter: cutting
   * civilian production shrinks the tax base that pays for the guns.
   */
  civilianForegone: number;
  history: WarEconomyPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — Doctrine and research
 * ------------------------------------------------------------------ */

/** Something started that will be collected by somebody else. */
export interface ResearchProgramme {
  id: string;
  field: import('./content/doctrine.ts').ResearchField;
  startedTurn: number;
  dueTurn: number;
  /**
   * The doctrine it was specified against.
   *
   * Recorded at the start, because the thing being bought is an answer
   * to a question asked today and it will be delivered into a decade
   * that may be asking a different one.
   */
  specifiedFor: import('./content/doctrine.ts').WarDoctrine;
  spent: number;
  delivered: boolean;
  /** What it was worth on arrival, after the decade had its say. */
  realised: number | null;
}

export interface DoctrinePoint {
  turn: number;
  adoption: number;
  effectiveness: number;
}

export interface Doctrine {
  /** What the army actually does. */
  current: import('./content/doctrine.ts').WarDoctrine;
  /**
   * What the government has ordered, if that is something else.
   *
   * A government can order a change and the army will not make one,
   * because the people who would have to make it are the people who
   * believe the old one and were promoted for believing it.
   */
  ordered: import('./content/doctrine.ts').WarDoctrine | null;
  orderedTurn: number;
  /**
   * How far the officer corps has actually taken it up, 0–1.
   *
   * Moves at the speed of officer turnover, which is years. Halfway
   * through, the army is worse at both than it was at either.
   */
  adoption: number;
  /**
   * The doctrine the last war appeared to vindicate.
   *
   * The one with evidence behind it, which is why every army prepares
   * for the last war and why doing so is rational rather than stupid.
   */
  lastWarLesson: import('./content/doctrine.ts').WarDoctrine | null;
  /** Research under way, and research that arrived. */
  programmes: ResearchProgramme[];
  /** Cumulative capability delivered, as an index. */
  capability: number;
  history: DoctrinePoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — Intelligence, negotiation and peace
 * ------------------------------------------------------------------ */

/**
 * What the country thinks the other side has.
 *
 * Not the truth, and not the truth plus noise. The truth times a bias
 * whose direction is set by what the organisation producing the estimate
 * needs to be true — and nobody in the chain is lying, because the
 * evidence is genuinely ambiguous and everybody is reading it in the
 * direction they were already facing.
 */
export interface EnemyEstimate {
  /** What they actually have. The engine knows; the government does not. */
  actual: number;
  /** What the papers say they have. This is what gets acted on. */
  estimated: number;
  bias: import('./content/peace.ts').EstimateBias;
  /** How much of the estimate rests on something somebody saw, 0–1. */
  confidence: number;
  lastRevised: number;
  /** Their willingness to keep going, estimated the same way. */
  estimatedResolve: number;
  actualResolve: number;
}

/** A settlement on the table, and what it would cost to sign. */
export interface PeaceOffer {
  id: string;
  /** Who put it there. */
  from: 'us' | 'them';
  /** What we give up. */
  weConcede: import('./content/peace.ts').PeaceTerm[];
  /** And what they do. */
  theyConcede: import('./content/peace.ts').PeaceTerm[];
  mediator: import('./content/peace.ts').Mediator;
  offeredTurn: number;
  /** How long it stays on the table. Terms get worse, not better. */
  expiresTurn: number;
  /** What accepting costs at home, all in. */
  domesticCost: number;
  /** Whether it can be signed at all, given what was said in week one. */
  blockedByAim: boolean;
}

export interface NegotiationPoint {
  turn: number;
  /** What is on the table, as a score. Falls while a war is being lost. */
  onOffer: number;
  ourWillingness: number;
  theirWillingness: number;
}

export interface Negotiation {
  warId: string;
  /**
   * What the government said it was fighting for, in public, in week one.
   *
   * Said on the strength of a rally, before anybody knew whether it was
   * achievable, and it is now a condition of the government's survival.
   */
  declaredAim: string;
  /** How firmly it was said. The firmer, the tighter the trap. */
  declaredFirmness: number;
  estimate: EnemyEstimate;
  offers: PeaceOffer[];
  /** Offers refused, which stay on the record. */
  refused: PeaceOffer[];
  /** Whether talks are happening at all. */
  talking: boolean;
  mediator: import('./content/peace.ts').Mediator;
  /** What has been conceded, once anything has. */
  settled: PeaceOffer | null;
  history: NegotiationPoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 7 — What the country remembers
 * ------------------------------------------------------------------ */

/**
 * Something that happened, kept for the rest of the run.
 *
 * The point of modelling a war in a political game is what the country
 * is like afterwards. These outlive the governments that made them and
 * are read back fifty and a hundred years later, which is the difference
 * between a strategy game and an alternate history somebody is living
 * in.
 */
export type TimelineKind =
  | 'war'
  | 'government'
  | 'election'
  | 'treaty'
  | 'economy'
  | 'constitutional'
  | 'disaster';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** The in-game year it started, and ended if it has. */
  startYear: number;
  endYear: number | null;
  /** What it is called. Written once, in the words of the time. */
  title: string;
  /** One line, in the register a history would use rather than a report. */
  summary: string;
  /** The lines under it: what it did, each one a fact. */
  consequences: string[];
  /** How much of the country's later life it explains, 0–100. */
  weight: number;
  /** The war it belongs to, where it belongs to one. */
  warId?: string;
}

export interface Timeline {
  entries: TimelineEntry[];
  /** Wars, kept in full, because they are read back in most detail. */
  wars: WarRecord[];
  /** The year the run began, so everything else can be dated from it. */
  firstYear: number;
}

/* ------------------------------------------------------------------ *
 * Engine 5 — The cabinet and the machine
 * ------------------------------------------------------------------ */

/**
 * Somebody at the table.
 *
 * `competence`, `loyalty` and `ambition` are drawn independently, and
 * the third is the one that makes a cabinet different from an order of
 * battle: the dangerous minister is not the incompetent one or the
 * disloyal one, it is the able, ambitious one who is loyal right up
 * until the arithmetic changes.
 */
export interface Minister {
  id: string;
  name: string;
  ministry: import('./content/ministries.ts').MinistryKey;
  basis: import('./content/cabinet.ts').AppointmentBasis;
  traits: import('./content/cabinet.ts').MinisterTrait[];
  competence: number;
  loyalty: number;
  ambition: number;
  /** How the public rates them, which follows the department's results. */
  standing: number;
  /**
   * How far they have gone native, 0–1.
   *
   * They arrive to change the department and end up arguing its case in
   * cabinet. About eighteen months, every time, and every government
   * finds it surprising.
   */
  capture: number;
  appointedTurn: number;
  /** The faction or partner whose payment this appointment is. */
  owes: string | null;
  resigned: boolean;
}

export interface CabinetPoint {
  turn: number;
  cohesion: number;
  delivery: number;
  /** How many are counting rather than serving. */
  plotting: number;
}

export interface Cabinet {
  ministers: Minister[];
  /**
   * How far the table holds together, 0–100.
   *
   * Not loyalty to the leader. Whether collective responsibility is
   * actually collective, which is a different and more fragile thing.
   */
  cohesion: number;
  /** Reshuffles so far. Each is cheaper than the last and works less. */
  reshuffles: number;
  /** Resignations, which are remembered. */
  resignations: number;
  history: CabinetPoint[];
}

export interface CivilServicePoint {
  turn: number;
  capability: number;
  compliance: number;
  morale: number;
}

export interface CivilService {
  posture: import('./content/cabinet.ts').MachinePosture;
  /**
   * What the machine can actually do, 0–100.
   *
   * Built over decades and lost in a term, which is the asymmetry that
   * makes it worth protecting and the reason nobody does.
   */
  capability: number;
  /** How much of a decision actually happens, 0–1. */
  compliance: number;
  /** What the officials think of this government. Slow, and it matters. */
  morale: number;
  /**
   * Institutional memory, 0–100.
   *
   * What the building knows that nobody wrote down: which things have
   * been tried, why they failed, and who to ring. Lost with the people,
   * and not recoverable by hiring more people.
   */
  memory: number;
  /** Officials who have left rather than do it. Cumulative. */
  departures: number;
  history: CivilServicePoint[];
}

/* ------------------------------------------------------------------ *
 * Engine 5C/5D — Courts and policing
 * ------------------------------------------------------------------ */

export interface JusticePoint {
  turn: number;
  independence: number;
  clearanceRate: number;
  crimeDeterrence: number;
}

export interface Courts {
  sentencing: import('./content/justice.ts').SentencingPolicy;
  stance: import('./content/justice.ts').JudicialStance;
  /**
   * How free the bench is of the government's wishes, 0–100.
   *
   * Spent, not held: leaning on the courts buys a favourable ruling now
   * and a slow, choppy erosion for years, on a floor much harder to
   * climb back from than the fall down to it.
   */
  independence: number;
  /** Cases waiting, as a multiple of what a well-run system carries. */
  backlog: number;
  /** Share of cases actually reaching a verdict each week. */
  clearanceRate: number;
  /** How often the verdict is the right one — trades against clearance speed. */
  accuracy: number;
  /** People in custody, driven by sentencing policy and clearance together. */
  prisonPopulation: number;
}

export interface Policing {
  posture: import('./content/justice.ts').EnforcementPosture;
  /** What the force can actually do, funding and staffing together, 0–100. */
  capability: number;
  /**
   * How willing people are to report a crime and cooperate with its
   * investigation. The real lever behind the clearance rate, and the
   * one enforcement theatre destroys fastest.
   */
  cooperation: number;
  /**
   * Embedded, slow to move in either direction. High corruption is a
   * standing supply of the scandal that finally moves it.
   */
  corruption: number;
  /** Investigations actually closed, feeding the courts' clearance rate. */
  investigativeClearance: number;
}

export interface Justice {
  courts: Courts;
  policing: Policing;
  history: JusticePoint[];
}
