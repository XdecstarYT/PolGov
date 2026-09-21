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
  GDP_START,
  POPULATION_START,
  SECTOR_KEYS,
  SECTOR_START_HEALTH,
  TURNS_PER_YEAR,
} from './balance.ts';
import { BILL_TEMPLATES } from './content/bills.ts';
import { Rng, seedFromString } from './rng.ts';
import { buildDistricts } from './systems/districts.ts';
import { buildEconomy } from './systems/economy.ts';
import { buildPublicFinance } from './systems/publicFinance.ts';
import { buildTaxCode, turnReceipts } from './systems/taxation.ts';
import { buildIndustries } from './systems/industry.ts';
import { buildDemography } from './systems/demography.ts';
import { buildInfrastructure } from './systems/infrastructure.ts';
import { buildServices } from './systems/services.ts';
import { buildWorld } from './systems/diplomacy.ts';
import { buildTrade } from './systems/trade.ts';
import { buildMilitary } from './systems/military.ts';
import { buildSociety } from './systems/society.ts';
import { buildLiving } from './systems/living.ts';
import { buildCulture } from './systems/culture.ts';
import { buildOpinion } from './systems/opinion.ts';
import { buildIntelligence } from './systems/intelligence.ts';
import { assignMinistries, buildBudget } from './systems/budgetProcess.ts';
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
  SectorKey,
} from './types.ts';
import type { District } from './systems/districts.ts';
import type { NationKey } from './content/nations.ts';
import { findCountry, type CountryKey } from './content/world/countries.ts';
import { buildCast } from './systems/personas.ts';
import { findPolitics, hasPolitics } from './content/world/politics.ts';
import {
  financesFor,
  partiesFor,
  playerGeographyFor,
  regionsFor,
} from './content/world/generate.ts';

export interface NewGameOptions {
  gameId: string;
  ownerId?: string | null;
  /**
   * Which country to govern.
   *
   * Every parliamentary democracy in the world table, plus the invented
   * one. It decides the chamber, the electoral system, the regions, the
   * parties, the public finances and the view of the rest of the world —
   * which is nearly everything except the party the player leads.
   */
  country?: CountryKey;
  /** Overrides the country's own name. Mostly for the invented one. */
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

/**
 * Electoral mass for the player's party — enough to usually lead, never to
 * coast.
 *
 * Relative to the field rather than absolute, because the field is not the
 * same everywhere. A party with this mass leads comfortably in a chamber of
 * seven and finishes third in a chamber of two, and under first past the
 * post third means a tenth of the seats and no government to form. The
 * player's party is always a little ahead of the largest party it faces;
 * the game is about what happens next, not about whether it starts.
 */
const PLAYER_BASE_STRENGTH = 1.15;
/* Chosen so the invented country's player party lands on exactly
   PLAYER_BASE_STRENGTH, which is where every measurement of the balance
   was taken. An absolute floor instead of a ratio used to hand the player
   a sweeping majority in any fragmented field under a majoritarian system,
   because there a tenth of a point of vote share is most of the chamber. */
const PLAYER_LEAD_OVER_FIELD = 1.095;

/**
 * And less than that where the system amplifies.
 *
 * Under first past the post, preferential or two-round counting, a tenth of
 * a point of national vote share is most of the chamber: a party that leads
 * everywhere wins everywhere. Starting the player a nose AHEAD there
 * produced coronations of a hundred and fifty seats out of a hundred and
 * eighty. Starting them a nose behind produces a contest, which is what
 * those systems are actually like for the party that is not incumbent.
 */
const PLAYER_LEAD_MAJORITARIAN = 0.98;

function playerStrength(
  others: readonly { baseStrength: number }[],
  system: ElectoralSystem,
): number {
  const largest = others.reduce((max, p) => Math.max(max, p.baseStrength), 0);
  if (largest <= 0) return PLAYER_BASE_STRENGTH;
  const amplifying = system === 'fptp' || system === 'preferential' || system === 'two_round';
  return largest * (amplifying ? PLAYER_LEAD_MAJORITARIAN : PLAYER_LEAD_OVER_FIELD);
}

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

export function buildSectors(moneyScale = 1): Sector[] {
  return SECTOR_KEYS.map((key) => ({
    key,
    health: SECTOR_START_HEALTH[key],
    funding: Math.round(SECTOR_BASELINE_FUNDING[key] * moneyScale),
  }));
}

/** The sector baselines at this country's size, which is what floors mean. */
export function baselineFundingFor(moneyScale: number): Record<SectorKey, number> {
  return Object.fromEntries(
    SECTOR_KEYS.map((key) => [key, Math.round(SECTOR_BASELINE_FUNDING[key] * moneyScale)]),
  ) as Record<SectorKey, number>;
}

export function buildRegions(country: CountryKey = 'verdana'): Region[] {
  return regionsFor(country).map((template) => ({
    id: template.id,
    name: template.name,
    kind: template.kind,
    character: template.character,
    seats: template.seats,
    lean: template.lean,
    composition: template.composition,
    campaignInvestment: 0,
  }));
}

function buildParties(
  options: NewGameOptions,
  moneyScale: number,
  system: ElectoralSystem,
): Party[] {
  const others: Party[] = partiesFor(
    options.country ?? 'verdana',
    baselineFundingFor(moneyScale),
  ).map((template) => ({
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
    prioritySector: template.prioritySector,
    sectorFloor: template.sectorFloor,
    redLinePool: template.redLinePool,
    regionStrength: template.regionStrength,
  }));

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
    baseStrength: playerStrength(others, system),
    cabinetPosts: 0,
    cabinetDemand: 0,
    leaderTitle: 'Leader',
    /* The party in office asks nothing of itself. */
    prioritySector: 'economy',
    sectorFloor: 0,
    redLinePool: [],
    /* And its vote is where a platform like this one's vote is. */
    regionStrength: playerGeographyFor(options.country ?? 'verdana', options.playerIdeology),
  };

  return [player, ...others];
}

export function createGame(options: NewGameOptions): GameState {
  const seed = options.seed ?? seedFromString(options.gameId);
  const rng = new Rng(seed);
  const difficulty = options.difficulty;
  const profile = DIFFICULTY[difficulty];

  /*
   * Which country, and therefore how large. Both scales are exactly 1 for
   * the invented country, so nothing about that run changes.
   */
  const country = options.country ?? 'verdana';
  if (!hasPolitics(country)) {
    throw new Error(
      `setup: ${country} has no political profile. The playable list is the ` +
        'parliamentary democracies; a presidential republic is in the world ' +
        'without being in the chair.',
    );
  }
  const politics = findPolitics(country);
  const finances = financesFor(country);
  const moneyScale = finances.gdp / GDP_START;
  const peopleScale = finances.population / POPULATION_START;

  const electoralSystem = options.electoralSystem ?? politics.electoralSystem;
  const parties = buildParties(options, moneyScale, electoralSystem);
  const regions = buildRegions(country);
  const sectors = buildSectors(moneyScale);
  const districts = buildDistrictsFor(regions, electoralSystem, rng);

  /*
   * Seat the opening parliament with the real election model.
   *
   * Then, if the model did not put the player first, swap their total with
   * whoever it did.
   *
   * THIS IS THE PREMISE, NOT A THUMB ON THE SCALE. The game begins the
   * morning after an election the player won; every election from here is
   * a real contest they can and will lose. A country where the opening
   * count left them third — which under first past the post is most of
   * them, on most platforms — would end the run before the first week,
   * because the largest party in a government leads it and a third party
   * cannot form one. "Pick the United Kingdom, press start, lose" is not a
   * game.
   *
   * A swap rather than a top-up, so the SHAPE of the chamber is exactly
   * what the model produced: the same distribution of seats, the same
   * fragmentation, the same coalition arithmetic. Only the label on the
   * largest pile moves.
   */
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

  {
    const player = parties.find((p) => p.isPlayer)!;
    const largest = parties.reduce((max, p) => (p.seats > max.seats ? p : max), parties[0]!);
    if (largest.id !== player.id) {
      const won = largest.seats;
      largest.seats = player.seats;
      player.seats = won;
    }
  }

  const now = new Date().toISOString();

  const state: GameState = {
    id: options.gameId,
    ownerId: options.ownerId ?? null,
    countryName: options.countryName?.trim() || findCountry(country).name,
    country,
    difficulty,

    moneyScale,
    peopleScale,
    debtTolerance: findCountry(country).debtTolerance ?? 1,

    turnNumber: 1,
    termNumber: 1,
    phase: 'coalition',

    politicalCapital: PC_START,
    approval: APPROVAL_START,
    treasury: 0,
    /* What the last government left. A real debt ratio against a real
       output, scaled by how hard this run is meant to be — so governing a
       heavily indebted country is hard for the reason it is actually hard. */
    debt: Math.round(finances.debt * (profile.startingDebt / (GDP_START * 0.55))),
    revenueModifier: 0,

    /* Named people, invented, and the same ones for the whole run. */
    cast: buildCast(parties, country, rng),

    /* On trend, on target, at the natural rate. Whatever goes wrong first
       should be legible as something that happened, not as the starting
       conditions catching up with the player. */
    economy: buildEconomy(finances.gdp),

    /* The rates the previous government left behind. */
    taxes: buildTaxCode(),

    /* Every industry at its baseline. Whatever goes wrong first should be
       something that happened, not something inherited. */
    industries: buildIndustries(),

    /* People are distributed as the seats are, because the seats were drawn
       to match them. Apportionment is what keeps that true. */
    demography: buildDemography(regions, finances.population),

    /* Everything at capacity, nothing quite new, and no backlog yet. The
       trap only reads as one if the player is the one who walks into it. */
    /* The distribution the government inherited. Nobody in the run chose
       it, and it is what every budget decision is measured against. */
    society: buildSociety(politics.inequality),

    /* And what that distribution is like to live inside. */
    living: buildLiving(),

    /* What the country makes of its own institutions, before this
       government has done anything to them. */
    opinion: buildOpinion(),

    /* Everything the country has that no government bought. */
    culture: buildCulture(
      politics.composition,
      SECTOR_BASELINE_FUNDING.education * 0.05 * moneyScale,
    ),

    infrastructure: buildInfrastructure(peopleScale),

    /* Every service funded to exactly the demand the country is making of
       it today. None of them will be, a decade from now, unless somebody
       decides otherwise — which is the entire mechanic. */
    services: buildServices(
      sectors,
      buildDemography(regions, finances.population),
      buildEconomy(finances.gdp),
      moneyScale / Math.max(0.0001, peopleScale),
    ),

    /* Alliances this government did not make and quarrels it did not start,
       because every government inherits both. */
    world: buildWorld(country),

    /* And a trade book built by decades of geography and somebody else's
       agreements. The first thing worth noticing about it is how little of
       it is the new government's to decide. */
    trade: buildTrade(finances.gdp, buildWorld(country), inheritedTradeAgreements(country)),

    /* Adequate, ageing, and nobody's achievement. The gap between what the
       forces are said to be and what they could do tomorrow was left by
       somebody else, and it is the player's to find. */
    military: buildMilitary(peopleScale),

    /* No quarrels yet. They arrive, which is the correct shape: the
       decision a government faces is never whether to have a crisis. */
    crises: [],

    /* Somebody is already inside. They always are, and a country that
       believed otherwise would be the only one in history. */
    intelligence: buildIntelligence(),

    /* Somebody else's budget. Nobody arrives with a blank sheet; they arrive
       with the last government's spending and a manifesto that contradicts
       it. The portfolios are handed out once a coalition exists. */
    budget: assignBudgetMinistries(buildBudget(sectors), parties),

    /* The debt is issued as a real book with staggered maturities, so the
       refinancing problem exists from turn one and was left by somebody
       else — which is the position a new government is actually in. */
    finance: buildPublicFinance(
      Math.round(finances.debt * (profile.startingDebt / (GDP_START * 0.55))),
      finances.gdp,
      buildEconomy(finances.gdp).policyRate,
      regions,
      turnReceipts(buildTaxCode(), finances.gdp) * TURNS_PER_YEAR,
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

/**
 * The trade agreements the country already has.
 *
 * Built from the inherited treaties, because a new government's trade
 * schedule was written by somebody else and it matters from week one.
 */
function inheritedTradeAgreements(country: CountryKey): Set<NationKey> {
  const keys = new Set<NationKey>();
  for (const treaty of buildWorld(country).treaties) {
    if (treaty.kind !== 'trade' && treaty.kind !== 'partnership') continue;
    for (const party of treaty.parties) keys.add(party);
  }
  return keys;
}

/** Hand the portfolios to whoever will be holding them. */
function assignBudgetMinistries(
  budget: ReturnType<typeof buildBudget>,
  parties: readonly Party[],
): ReturnType<typeof buildBudget> {
  return { ...budget, ministries: assignMinistries(budget.ministries, parties) };
}
