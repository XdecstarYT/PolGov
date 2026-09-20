/**
 * migrate.ts — saves outlive the shape they were written in.
 *
 * A run is stored as the whole state object, so every time the engine grows
 * a subsystem, every save written before it becomes a state with a hole in
 * it. Reading one crashes on the first access, and what the player sees is a
 * white screen rather than a message.
 *
 * So the load path goes through here. Anything missing is filled from what a
 * fresh game would have — which is the right default in every case, because
 * a subsystem that did not exist when the save was written has no history to
 * preserve. Anything structurally impossible is refused, so a corrupt save is
 * a refusal rather than a crash three screens later.
 *
 * This is deliberately forgiving in one direction only. It adds what is
 * missing; it never edits what is there, because a migration that quietly
 * corrects a value is a migration that can quietly break a run.
 */

import { createStandardGame } from './setup.ts';
import { buildIntelligence } from './systems/intelligence.ts';
import { buildMilitary } from './systems/military.ts';
import { buildSociety } from './systems/society.ts';
import { buildTrade } from './systems/trade.ts';
import { buildPairs } from './systems/worldSim.ts';
import { buildOrganisations } from './systems/organisations.ts';
import type { GameState } from './types.ts';

/** The fields without which a save is not a run at all. */
const ESSENTIAL = ['id', 'parties', 'sectors', 'turnNumber', 'termNumber', 'phase'] as const;

/**
 * Bring a stored state up to the shape the engine expects.
 *
 * Returns null when the save is not recoverable, which the caller should
 * treat as "this run cannot be opened" rather than as an empty game.
 */
export function migrateState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const state = raw as Partial<GameState> & Record<string, unknown>;

  for (const field of ESSENTIAL) {
    if (state[field] === undefined || state[field] === null) return null;
  }
  if (!Array.isArray(state.parties) || state.parties.length === 0) return null;
  if (!Array.isArray(state.sectors) || state.sectors.length === 0) return null;

  /* A fresh game is the source of every default. Built once. */
  const fresh = createStandardGame('migration-reference');

  const next = { ...state } as GameState;

  /*
   * A save written before the world became real has no country and no
   * scales. It was the invented one, at the scale the engine is calibrated
   * at, which is exactly what these defaults say.
   */
  /* A save written before the distribution existed was a country sitting
     at the opening one, which is exactly what buildSociety describes. */
  if (!next.society) next.society = buildSociety();
  if (typeof next.society.inequality !== 'number' || !(next.society.inequality > 0)) {
    next.society.inequality = 1;
  }
  if (!next.country) next.country = 'verdana';
  if (typeof next.moneyScale !== 'number' || !(next.moneyScale > 0)) next.moneyScale = 1;
  if (typeof next.peopleScale !== 'number' || !(next.peopleScale > 0)) next.peopleScale = 1;
  if (typeof next.debtTolerance !== 'number' || !(next.debtTolerance > 0)) {
    next.debtTolerance = 1;
  }

  /* Parties written before they carried their own demands were looked up
     in the invented country's table, which is where those demands came
     from. Same values, now on the party. */
  next.parties = next.parties.map((party) => {
    const reference = fresh.parties.find((p) => p.id === party.id);
    return {
      ...party,
      prioritySector: party.prioritySector ?? reference?.prioritySector ?? 'economy',
      sectorFloor:
        typeof party.sectorFloor === 'number'
          ? party.sectorFloor
          : (reference?.sectorFloor ?? 0),
      redLinePool: Array.isArray(party.redLinePool)
        ? party.redLinePool
        : (reference?.redLinePool ?? []),
    };
  });

  /* A save written before the cast existed has no people in it. They are
     built fresh, which loses the memory of a run that never had one. */
  if (!next.cast || !Array.isArray(next.cast.leaders)) next.cast = fresh.cast;

  /* Subsystems that may not have existed when the save was written. */
  if (!next.world) next.world = fresh.world;
  if (!Array.isArray(next.world.organisations)) {
    next.world = { ...next.world, organisations: buildOrganisations() };
  }
  if (!Array.isArray(next.world.resolutions)) {
    next.world = { ...next.world, resolutions: [] };
  }
  if (!Array.isArray(next.world.pairs)) {
    next.world = { ...next.world, pairs: buildPairs() };
  }
  if (!Array.isArray(next.world.wars)) next.world = { ...next.world, wars: [] };
  if (!Array.isArray(next.world.globalEvents)) {
    next.world = { ...next.world, globalEvents: [] };
  }
  /* Live power and posture arrived after the nations themselves did. */
  next.world = {
    ...next.world,
    nations: (next.world.nations ?? fresh.world.nations).map((nation) => {
      const reference = fresh.world.nations.find((n) => n.key === nation.key);
      return {
        ...nation,
        power: nation.power ?? reference?.power ?? 1,
        posture: nation.posture ?? reference?.posture ?? 'guarded',
      };
    }),
  };

  if (!next.budget) next.budget = fresh.budget;
  if (!Array.isArray(next.budget.supply)) next.budget = { ...next.budget, supply: [] };
  if (!next.military) next.military = buildMilitary();
  if (!next.intelligence) next.intelligence = buildIntelligence();
  if (!Array.isArray(next.crises)) next.crises = [];
  if (!next.trade) {
    next.trade = buildTrade(next.economy?.gdp ?? fresh.economy.gdp, next.world);
  }
  if (!next.finance) next.finance = fresh.finance;
  if (typeof next.finance.marketAccess !== 'boolean') {
    next.finance = { ...next.finance, marketAccess: true, weeksShutOut: 0 };
  }

  /* The journal gained an absolute week after the fact. Anything without one
     is dated from its turn number, which is the best available answer and is
     only ever used to find the most recent page. */
  if (Array.isArray(next.logs)) {
    next.logs = next.logs.map((entry) => ({
      ...entry,
      week: entry.week ?? entry.turnNumber,
    }));
  } else {
    next.logs = [];
  }

  for (const [field, fallback] of [
    ['news', []],
    ['elections', []],
    ['approvalHistory', []],
    ['promises', []],
    ['referendums', []],
    ['events', []],
    ['bills', fresh.bills],
    ['regions', fresh.regions],
    ['districts', []],
  ] as const) {
    if (!Array.isArray(next[field as keyof GameState])) {
      (next as unknown as Record<string, unknown>)[field] = fallback;
    }
  }

  return next;
}
