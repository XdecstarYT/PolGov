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
  /** One line of fictional character, shown on the campaign map. */
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
  turnNumber: number;
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
  reviewMonths: number;
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
  breachMonths: number;
  /** Consecutive months compliant. Credibility is earned slowly. */
  complianceMonths: number;
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

export interface GameState {
  id: string;
  ownerId: string | null;
  countryName: string;
  difficulty: Difficulty;

  turnNumber: number;
  termNumber: number;
  phase: Phase;

  politicalCapital: number;
  approval: number;
  treasury: number;
  debt: number;
  /** Recurring revenue modifier accumulated from passed bills. */
  revenueModifier: number;

  /** The macroeconomy: output, prices, jobs, rates and the cycle. */
  economy: Economy;

  /** The public finances: what the debt is made of, and who is lending. */
  finance: PublicFinance;

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
