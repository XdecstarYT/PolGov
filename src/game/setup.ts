/**
 * setup.ts — starting a run.
 *
 * The opening parliament is produced by running the real election model, so a
 * new game begins from a coherent result rather than a hand-placed seat chart,
 * and the player usually starts as the largest party without a majority — which
 * puts coalition formation in front of them immediately.
 */

import {
  APPROVAL_START,
  AUTHORITY_START,
  COHESION_START,
  DIFFICULTY,
  MEMBERS_START,
  PARTY_FUNDS_START,
  PC_START,
  SECTOR_BASELINE_FUNDING,
  SECTOR_KEYS,
  SECTOR_START_HEALTH,
} from './balance.ts';
import { BILL_TEMPLATES } from './content/bills.ts';
import { PARTY_TEMPLATES } from './content/parties.ts';
import { REGION_TEMPLATES } from './content/regions.ts';
import { Rng, seedFromString } from './rng.ts';
import { buildDistricts } from './systems/districts.ts';
import { buildEconomy } from './systems/economy.ts';
import { buildPublicFinance } from './systems/publicFinance.ts';
import { buildTaxCode, monthlyReceipts } from './systems/taxation.ts';
import { buildIndustries } from './systems/industry.ts';
import { buildPartyInternals } from './systems/partyInternals.ts';
import { buildSenate } from './systems/parliament.ts';
import { MMP_DISTRICT_SHARE } from './balance.ts';
import type { ElectoralSystem } from './systems/electoralSystems.ts';
import { buildNegotiation, hasMajority } from './systems/coalition.ts';
import { simulateElection } from './systems/election.ts';
import type {
  Bill,
  Difficulty,
  GameState,
  Ideology,
  Party,
  Region,
  Sector,
} from './types.ts';
import type { District } from './systems/districts.ts';

export interface NewGameOptions {
  gameId: string;
  ownerId?: string | null;
  countryName?: string;
  difficulty: Difficulty;
  playerPartyName: string;
  playerColor: string;
  playerGlyph: string;
  playerIdeology: Ideology;
  /** How votes become seats. Defaults to proportional. */
  electoralSystem?: ElectoralSystem;
  /** Optional explicit seed; defaults to one derived from the game id. */
  seed?: number;
}

/**
 * Lay out the single-member seats for a run.
 *
 * Pure proportional counting needs no districts at all. Mixed-member needs
 * fewer, larger ones, because the remainder of the chamber is filled from a
 * national list.
 */
export function buildDistrictsFor(
  regions: Region[],
  system: ElectoralSystem,
  rng: Rng,
): District[] {
  if (system === 'proportional') return [];

  return regions.flatMap((region) => {
    const count =
      system === 'mixed_member'
        ? Math.max(1, Math.round(region.seats * MMP_DISTRICT_SHARE))
        : region.seats;
    return buildDistricts(region, rng, count);
  });
}

/** Electoral mass for the player's party — enough to usually lead, never to coast. */
const PLAYER_BASE_STRENGTH = 1.15;

export function buildBills(): Bill[] {
  return BILL_TEMPLATES.map((template) => ({
    id: `bill-${template.key}`,
    templateKey: template.key,
    title: template.title,
    summary: template.summary,
    tradeoff: template.tradeoff,
    category: template.category,
    magnitude: template.magnitude,
    ideology: template.ideology,
    effects: template.effects,
    status: 'available' as const,
    passChance: null,
    pcSpent: 0,
    whipSteps: 0,
    turnProposed: null,
    turnResolved: null,
    amendments: 0,
    committeeBonus: 0,
    committeeReturnsOn: null,
    crossbenchDeals: 0,
  }));
}

export function buildSectors(): Sector[] {
  return SECTOR_KEYS.map((key) => ({
    key,
    health: SECTOR_START_HEALTH[key],
    funding: SECTOR_BASELINE_FUNDING[key],
  }));
}

export function buildRegions(): Region[] {
  return REGION_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    character: template.character,
    seats: template.seats,
    lean: template.lean,
    composition: template.composition,
    campaignInvestment: 0,
  }));
}

function buildParties(options: NewGameOptions): Party[] {
  const player: Party = {
    id: 'player',
    name: options.playerPartyName,
    shortName: options.playerPartyName.split(' ')[0] ?? options.playerPartyName,
    color: options.playerColor,
    glyph: options.playerGlyph,
    isPlayer: true,
    inCoalition: true,
    ideology: options.playerIdeology,
    seats: 0,
    coalitionMood: null,
    redLines: [],
    baseStrength: PLAYER_BASE_STRENGTH,
    cabinetPosts: 0,
    cabinetDemand: 0,
    leaderTitle: 'Leader',
  };

  const others: Party[] = PARTY_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    shortName: template.shortName,
    color: template.color,
    glyph: template.glyph,
    isPlayer: false,
    inCoalition: false,
    ideology: template.ideology,
    seats: 0,
    coalitionMood: null,
    /* Red lines are demanded at the negotiating table, not held in advance. */
    redLines: [],
    baseStrength: template.baseStrength,
    cabinetPosts: 0,
    cabinetDemand: template.cabinetDemand,
    leaderTitle: template.leaderTitle,
  }));

  return [player, ...others];
}

export function createGame(options: NewGameOptions): GameState {
  const seed = options.seed ?? seedFromString(options.gameId);
  const rng = new Rng(seed);
  const difficulty = options.difficulty;
  const profile = DIFFICULTY[difficulty];

  const parties = buildParties(options);
  const regions = buildRegions();
  const sectors = buildSectors();
  const electoralSystem = options.electoralSystem ?? 'proportional';
  const districts = buildDistrictsFor(regions, electoralSystem, rng);

  /* Seat the opening parliament with the real election model. */
  const opening = simulateElection({
    parties,
    regions,
    districts,
    system: electoralSystem,
    approval: APPROVAL_START,
    campaign: null,
    termNumber: 0,
    rng,
  });
  for (const party of parties) {
    party.seats = opening.seatsByParty[party.id] ?? 0;
  }

  const now = new Date().toISOString();

  const state: GameState = {
    id: options.gameId,
    ownerId: options.ownerId ?? null,
    countryName: options.countryName?.trim() || 'Verdana',
    difficulty,

    turnNumber: 1,
    termNumber: 1,
    phase: 'coalition',

    politicalCapital: PC_START,
    approval: APPROVAL_START,
    treasury: 0,
    debt: profile.startingDebt,
    revenueModifier: 0,

    /* On trend, on target, at the natural rate. Whatever goes wrong first
       should be legible as something that happened, not as the starting
       conditions catching up with the player. */
    economy: buildEconomy(),

    /* The rates the previous government left behind. */
    taxes: buildTaxCode(),

    /* Every industry at its baseline. Whatever goes wrong first should be
       something that happened, not something inherited. */
    industries: buildIndustries(),

    /* The debt is issued as a real book with staggered maturities, so the
       refinancing problem exists from turn one and was left by somebody
       else — which is the position a new government is actually in. */
    finance: buildPublicFinance(
      profile.startingDebt,
      buildEconomy().gdp,
      buildEconomy().policyRate,
      regions,
      monthlyReceipts(buildTaxCode(), buildEconomy().gdp),
    ),

    partyInternals: {
      ...buildPartyInternals(options.playerIdeology),
      members: MEMBERS_START,
      funds: PARTY_FUNDS_START,
      cohesion: COHESION_START,
      authority: AUTHORITY_START,
    },

    parties,
    sectors,
    regions,
    electoralSystem,
    senate: buildSenate(opening.voteShareByParty),
    districts,
    bills: buildBills(),
    events: [],

    news: [],
    logs: [],
    elections: [],
    approvalHistory: [{ turn: 0, approval: APPROVAL_START }],

    negotiation: null,
    campaign: null,

    career: {
      termsServed: 0,
      electionsWon: 0,
      billsPassed: 0,
      billsFailed: 0,
      eventsResolved: 0,
      peakApproval: APPROVAL_START,
      lowestApproval: APPROVAL_START,
    },
    status: 'active',

    rngState: rng.state,
    addressesThisTerm: 0,
    promises: [],
    executiveOrdersThisTerm: 0,
    referendums: [],
    budgetUnlocked: false,
    confidenceCrisis: false,

    createdAt: now,
    updatedAt: now,
  };

  /*
   * A party that wins an outright majority at the opening election governs
   * alone and skips straight to the first briefing.
   */
  if (hasMajority(state.parties)) {
    state.phase = 'briefing';
  } else {
    state.negotiation = buildNegotiation(state.parties, 1);
  }

  return state;
}

/** Convenience for tests and for the client's "quick start". */
export function createStandardGame(gameId = 'test-game'): GameState {
  return createGame({
    gameId,
    difficulty: 'standard',
    playerPartyName: 'Reform Coalition',
    playerColor: '#8c2f27',
    playerGlyph: '★',
    playerIdeology: { economic: -0.1, social: 0.2, environmental: 0.2 },
  });
}
