/**
 * eventEngine.ts — which crises fire, and how hard.
 *
 * Selection is weighted by the state of the country, so neglect produces its
 * own emergencies: starved sectors invite their related disasters, heavy debt
 * invites market trouble, low approval invites unrest. Capped at two per turn
 * so a bad month never becomes unplayable.
 */

import {
  DIFFICULTY,
  EVENT_BASE_CHANCE,
  EVENT_SECOND_CHANCE,
  MAX_EVENTS_PER_TURN,
  SECTOR_KEYS,
} from '../balance.ts';
import { EVENT_TEMPLATES, type EventTemplate, type EventWeightContext } from '../content/events.ts';
import { ECONOMIC_EVENT_TEMPLATES } from '../content/economicEvents.ts';
import type {
  Demography,
  Difficulty,
  Economy,
  GameEvent,
  IndustryState,
  Infrastructure,
  Party,
  Sector,
  SectorKey,
} from '../types.ts';
import type { Rng } from '../rng.ts';

/**
 * Everything that can happen: the original pool plus the ten economic
 * crises, which weight themselves off the state Engine 2 tracks.
 */
const ALL_TEMPLATES: EventTemplate[] = [...EVENT_TEMPLATES, ...ECONOMIC_EVENT_TEMPLATES];

export function buildWeightContext(
  sectors: readonly Sector[],
  approval: number,
  debt: number,
  treasury: number,
  turnNumber: number,
  parties: readonly Party[],
  /**
   * The state of the country as Engine 2 models it.
   *
   * Optional so the handful of tests that build a context by hand keep
   * working, but the real game always supplies it — and without it a
   * banking crisis is a die roll rather than something the government spent
   * four years making more likely.
   */
  world?: {
    economy: Economy;
    industries: readonly IndustryState[];
    infrastructure: Infrastructure;
    demography: Demography;
  },
): EventWeightContext {
  const sectorHealth = {} as Record<SectorKey, number>;
  for (const key of SECTOR_KEYS) {
    sectorHealth[key] = sectors.find((s) => s.key === key)?.health ?? 50;
  }
  const partners = parties.filter((p) => p.inCoalition && !p.isPlayer);
  const averageMood =
    partners.length > 0
      ? partners.reduce((sum, p) => sum + (p.coalitionMood ?? 50), 0) / partners.length
      : 100;

  const base = { sectorHealth, approval, debt, treasury, turnNumber, averageMood };
  if (!world) return base;

  const { economy, industries, infrastructure, demography } = world;
  return {
    ...base,
    debtRatio: economy.gdp > 0 ? debt / economy.gdp : 0,
    policyRate: economy.policyRate,
    growth: economy.growth,
    outputGap: economy.outputGap,
    inflation: economy.inflation,
    unemployment: economy.unemployment,
    inRecession: economy.phase === 'recession',
    industryHealth: Object.fromEntries(industries.map((i) => [i.key, i.health])),
    worstAssetCondition: infrastructure.assets.reduce(
      (worst, a) => Math.min(worst, a.condition),
      100,
    ),
    maintenanceBacklog: infrastructure.assets.reduce((sum, a) => sum + a.backlog, 0),
    retiredShare: demography.retiredShare,
  };
}

/** Categories that read as bad news, for difficulty weighting. */
const NEGATIVE_CATEGORIES = new Set([
  'economic_shock',
  'natural_disaster',
  'scandal',
  'social_unrest',
]);

function weightFor(
  template: EventTemplate,
  ctx: EventWeightContext,
  difficulty: Difficulty,
): number {
  const base = Math.max(0, template.weight(ctx));
  const profile = DIFFICULTY[difficulty];
  return NEGATIVE_CATEGORIES.has(template.category) ? base * profile.eventSeverity : base;
}

/**
 * Draw this turn's events. Returns 0–2 fully-formed events with their choices
 * and mechanical consequences already fixed.
 */
export function drawEvents(
  rng: Rng,
  ctx: EventWeightContext,
  difficulty: Difficulty,
  turnNumber: number,
  recentTemplateKeys: readonly string[],
): GameEvent[] {
  if (!rng.chance(EVENT_BASE_CHANCE)) return [];

  const count = rng.chance(EVENT_SECOND_CHANCE) ? MAX_EVENTS_PER_TURN : 1;
  const chosen: GameEvent[] = [];
  const used = new Set<string>(recentTemplateKeys);

  for (let i = 0; i < count; i += 1) {
    const pool = ALL_TEMPLATES.filter((t) => !used.has(t.key));
    if (pool.length === 0) break;

    const template = rng.pickWeighted(pool, (t) => weightFor(t, ctx, difficulty));
    used.add(template.key);

    const profile = DIFFICULTY[difficulty];
    const rolled = rng.int(template.minSeverity, template.maxSeverity);
    const severity = Math.max(
      1,
      Math.min(3, Math.round(rolled * profile.eventSeverity)),
    );

    chosen.push({
      id: `event-${turnNumber}-${i}-${template.key}`,
      templateKey: template.key,
      category: template.category,
      title: template.title,
      narrative: template.narrative,
      severity,
      turnNumber,
      choices: template.choices(severity),
      chosenIndex: null,
      resolved: false,
    });
  }

  return chosen;
}

export function findEventTemplate(key: string): EventTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.key === key);
}
