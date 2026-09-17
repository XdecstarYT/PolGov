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
