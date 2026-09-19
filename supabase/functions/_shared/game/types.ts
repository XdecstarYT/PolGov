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

  /** Every rate the government sets, and who each one falls on. */
  taxes: TaxCode;

  /** What the economy is made of, and where each part of it is. */
  industries: IndustryState[];

  /** The people: how many, how old, where, and how many of them work. */
  demography: Demography;

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
