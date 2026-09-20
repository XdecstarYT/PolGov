/**
 * infrastructure.ts — what the country is built out of.
 *
 * One mechanic carries this module, and it is the most politically honest
 * thing in the game: the maintenance backlog.
 *
 * Maintaining a road costs money now and produces nothing anyone notices.
 * NOT maintaining it costs nothing now and produces nothing anyone notices
 * either — for about four years. Deferred maintenance is therefore free money
 * for exactly one electoral cycle, and the bill lands on whoever is unlucky
 * enough to be in office when the bridge closes. Almost every real government
 * does this, and most of them are re-elected for it.
 *
 * The backlog compounds at more than it was avoided for, because catching up
 * is dearer than keeping up: a resurfacing deferred becomes a reconstruction.
 * That is what makes it a trap rather than a loan, and it is the only reason
 * the decision is interesting. A government that cuts maintenance to fund
 * something visible has made a real and defensible choice; it has just also
 * made the next government's choice harder, and the one after that's harder
 * still.
 *
 * Capacity is the other half. Population grows into the roads and hospitals
 * that exist, so doing nothing is not neutral — utilisation climbs on its own
 * and congestion is what people actually experience. Building is expensive,
 * slow, and usually opens under a government that did not commission it.
 */

import {
  BACKLOG_COMPOUNDING,
  BACKLOG_REPAYMENT_RATE,
  CAPACITY_TO_INDUSTRY,
  CONDITION_CRITICAL,
  CONDITION_FAILING,
  CONDITION_START,
  CONDITION_TO_SECTOR,
  CONGESTION_THRESHOLD,
  MAINTENANCE_LEVEL_MAX,
  MAINTENANCE_LEVEL_START,
  MAX_ACTIVE_PROJECTS,
  TURNS_PER_TERM,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  FULL_MAINTENANCE_COST,
  INFRASTRUCTURE_TEMPLATES,
  findInfrastructure,
  type InfrastructureKey,
  type InfrastructureTemplate,
} from '../content/infrastructure.ts';
import type { IndustryKey } from '../content/industries.ts';
import type {
  Infrastructure,
  InfrastructureAsset,
  InfrastructureProject,
  SectorKey,
} from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Starting state
 * ------------------------------------------------------------------ */

/**
 * The country as inherited: everything at capacity, nothing quite new, and
 * no backlog yet.
 *
 * Starting with zero backlog is deliberate. The trap only reads as a trap if
 * the player is the one who walks into it — an inherited backlog would be an
 * unfair hand rather than a decision, and the whole point is that deferring
 * maintenance looks completely reasonable at the moment you do it.
 */
export function buildInfrastructure(peopleScale = 1): Infrastructure {
  return {
    assets: INFRASTRUCTURE_TEMPLATES.map((template) => ({
      key: template.key,
      condition: CONDITION_START,
      /* Capacity is physical — lane-kilometres, beds, megawatts — and is
         compared against a demand that scales with the population. A
         country of a hundred million inherits a hundred million people's
         worth of it, in the same state of repair. */
      capacity: Math.round(template.capacity * peopleScale * 100) / 100,
      backlog: 0,
    })),
    projects: [],
    maintenanceLevel: MAINTENANCE_LEVEL_START,
  };
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/** What maintenance costs, ₡bn a year. */
export function maintenanceSpend(infrastructure: Infrastructure, moneyScale = 1): number {
  return (
    FULL_MAINTENANCE_COST *
    moneyScale *
    clamp(infrastructure.maintenanceLevel, 0, MAINTENANCE_LEVEL_MAX)
  );
}

/**
 * What commissioning this much of an asset costs, ₡bn.
 *
 * The template price is written at Verdana's scale; a country builds at
 * its own. The quote the player is shown and the sum committed to the
 * project both come through here, so they cannot drift apart.
 */
export function buildCostOf(
  template: InfrastructureTemplate,
  units: number,
  moneyScale = 1,
): number {
  return template.buildCost * units * moneyScale;
}

/** What the projects under construction cost, ₡bn a year. */
export function projectSpend(infrastructure: Infrastructure): number {
  return infrastructure.projects.reduce(
    (sum, project) =>
      sum +
      (project.remainingTurns > 0
        ? (project.remainingCost / project.remainingTurns) * TURNS_PER_YEAR
        : 0),
    0,
  );
}

/** Everything infrastructure costs, ₡bn a year. */
export function infrastructureSpend(infrastructure: Infrastructure, moneyScale = 1): number {
  return maintenanceSpend(infrastructure, moneyScale) + projectSpend(infrastructure);
}

/** The total work owed across every asset, ₡bn. */
export function totalBacklog(infrastructure: Infrastructure): number {
  return infrastructure.assets.reduce((sum, a) => sum + a.backlog, 0);
}

/* ------------------------------------------------------------------ *
 * Capacity and congestion
 * ------------------------------------------------------------------ */

/** How hard an asset is being used. Above one is congestion. */
export function utilisation(asset: InfrastructureAsset, population: number): number {
  const template = findInfrastructure(asset.key);
  const demand = template.demandPerMillion * population;
  return asset.capacity > 0 ? demand / asset.capacity : Infinity;
}

/** Assets people are actually queuing for. */
export function congested(
  infrastructure: Infrastructure,
  population: number,
): InfrastructureAsset[] {
  return infrastructure.assets.filter(
    (a) => utilisation(a, population) > CONGESTION_THRESHOLD + 0.08,
  );
}

/** Assets that are visibly falling apart. */
export function failing(infrastructure: Infrastructure): InfrastructureAsset[] {
  return infrastructure.assets.filter((a) => a.condition < CONDITION_FAILING);
}

/** Assets that are a scandal. */
export function critical(infrastructure: Infrastructure): InfrastructureAsset[] {
  return infrastructure.assets.filter((a) => a.condition < CONDITION_CRITICAL);
}

/* ------------------------------------------------------------------ *
 * What infrastructure does to everything else
 * ------------------------------------------------------------------ */

/**
 * Points added to each public sector's health by the state of the assets
 * that serve it.
 *
 * Hospitals in poor condition are a health service in poor condition, whether
 * or not the health budget went up. This is how a decade of deferred
 * maintenance eventually shows up in the one number voters actually read.
 */
export function sectorEffects(
  infrastructure: Infrastructure,
  population: number,
): Partial<Record<SectorKey, number>> {
  const totals: Partial<Record<SectorKey, number>> = {};
  const counts: Partial<Record<SectorKey, number>> = {};
  let environment = 0;

  for (const asset of infrastructure.assets) {
    const template = findInfrastructure(asset.key);

    if (template.serves) {
      const fromCondition = (asset.condition - 60) * CONDITION_TO_SECTOR;
      /* Congestion is felt as a failing service even when the buildings are
         in perfect repair — a hospital at 130% of capacity is a waiting list. */
      const over = Math.max(0, utilisation(asset, population) - CONGESTION_THRESHOLD);
      const fromCrowding = -over * 22;
      totals[template.serves] = (totals[template.serves] ?? 0) + fromCondition + fromCrowding;
      counts[template.serves] = (counts[template.serves] ?? 0) + 1;
    }

    if (template.environmental) {
      /* Relative to the capacity the country started with, so building more
         of something dirty is what pollutes rather than merely having it. */
      const relative = asset.capacity / template.capacity;
      environment += template.environmental * relative * 10 * (asset.condition / CONDITION_START);
    }
  }

  /*
   * AVERAGED across the assets serving a sector, not summed.
   *
   * Eight assets serve the infrastructure sector. Summing their condition
   * terms handed it +25 points before anybody had spent a credit, which made
   * the whole sector budget irrelevant — average service health jumped from
   * 62 to 69 the moment this module was wired in.
   */
  const out: Partial<Record<SectorKey, number>> = {};
  for (const [sector, total] of Object.entries(totals)) {
    const key = sector as SectorKey;
    out[key] = total / Math.max(1, counts[key] ?? 1);
  }
  /* The environment term is a level, not an average of anything: a country
     with more power stations has a worse environment, full stop. */
  out.environment = (out.environment ?? 0) + environment;

  return out;
}

/**
 * Points added to each industry's health by the assets it depends on.
 *
 * An industry cannot run on infrastructure that is not there. This is how
 * closing a railway becomes a logistics problem and then a manufacturing one.
 */
export function industryEffects(
  infrastructure: Infrastructure,
  population: number,
): Partial<Record<IndustryKey, number>> {
  const out: Partial<Record<IndustryKey, number>> = {};

  for (const asset of infrastructure.assets) {
    const template = findInfrastructure(asset.key);
    const use = utilisation(asset, population);
    const shortfall = Math.max(0, use - CONGESTION_THRESHOLD) + Math.max(0, (60 - asset.condition) / 40);
    if (shortfall <= 0) continue;
    for (const industry of template.enables) {
      out[industry] = (out[industry] ?? 0) - shortfall * CAPACITY_TO_INDUSTRY * 10;
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * The month
 * ------------------------------------------------------------------ */

export interface InfrastructureTick {
  infrastructure: Infrastructure;
  /** Projects that opened this month. */
  opened: InfrastructureProject[];
  /** Assets that crossed into failing this month. */
  newlyFailing: InfrastructureKey[];
  /** ₡bn of work added to the backlog this month. */
  backlogAdded: number;
  /** ₡bn of backlog worked off this month. */
  backlogCleared: number;
}

/**
 * Advance the infrastructure by one month.
 *
 * Condition decays toward nothing at the asset's own rate, offset by whatever
 * share of full maintenance is being paid. Anything unpaid becomes backlog,
 * compounded — and the backlog itself drags on condition, so a government
 * that lets it build is fighting a worsening problem with the same money.
 */
export function stepInfrastructure(infrastructure: Infrastructure): InfrastructureTick {
  const level = clamp(infrastructure.maintenanceLevel, 0, MAINTENANCE_LEVEL_MAX);
  const wasFailing = new Set(failing(infrastructure).map((a) => a.key));

  let backlogAdded = 0;
  let backlogCleared = 0;

  const assets = infrastructure.assets.map((asset) => {
    const template = findInfrastructure(asset.key);

    /*
     * Condition. At full maintenance it holds; at half it falls at half the
     * decay rate; above full it recovers, but slowly — you cannot buy back a
     * decade of neglect in a term, however much you spend.
     */
    const shortfall = Math.max(0, 1 - level);
    const surplus = Math.max(0, level - 1);
    const backlogDrag = (asset.backlog / Math.max(1, template.maintenanceCost * 2)) * 0.5;
    const change =
      -template.decayRate * (shortfall + backlogDrag) + surplus * template.decayRate * 1.4;
    const condition = clamp(asset.condition + change, 0, 100);

    /* Backlog. Work not done this month is owed, at more than it was avoided
       for, because catching up is dearer than keeping up. */
    /* A year's upkeep is owed over a year, so the weekly slice is the
       annual cost divided by the number of turns in one. */
    const deferred =
      (template.maintenanceCost / TURNS_PER_YEAR) * shortfall * BACKLOG_COMPOUNDING;
    /*
     * Nothing is repaid while upkeep is being skipped. An earlier version
     * cleared 3.5% of the backlog every month regardless of what was being
     * spent, which meant four years of paying nothing left less work owed
     * than the money it had saved — deferring maintenance was a free loan
     * rather than a trap, and the entire decision collapsed.
     */
    const repaid =
      level >= 1
        ? Math.min(asset.backlog, asset.backlog * BACKLOG_REPAYMENT_RATE * (1 + surplus * 6))
        : 0;
    backlogAdded += deferred;
    backlogCleared += repaid;

    return {
      key: asset.key,
      condition,
      capacity: asset.capacity,
      backlog: Math.max(0, asset.backlog + deferred - repaid),
    };
  });

  /* Projects. They take years, and most open under somebody else. */
  const opened: InfrastructureProject[] = [];
  const projects: InfrastructureProject[] = [];
  for (const project of infrastructure.projects) {
    const thisTurn =
      project.remainingTurns > 0 ? project.remainingCost / project.remainingTurns : 0;
    const next = {
      ...project,
      remainingTurns: project.remainingTurns - 1,
      remainingCost: Math.max(0, project.remainingCost - thisTurn),
    };
    if (next.remainingTurns <= 0) {
      opened.push(next);
      const asset = assets.find((a) => a.key === next.key);
      if (asset) asset.capacity += next.units;
    } else {
      projects.push(next);
    }
  }

  const result: Infrastructure = { assets, projects, maintenanceLevel: infrastructure.maintenanceLevel };
  const newlyFailing = failing(result)
    .map((a) => a.key)
    .filter((key) => !wasFailing.has(key));

  return { infrastructure: result, opened, newlyFailing, backlogAdded, backlogCleared };
}

/* ------------------------------------------------------------------ *
 * Commissioning
 * ------------------------------------------------------------------ */

export function canStartProject(infrastructure: Infrastructure): boolean {
  return infrastructure.projects.length < MAX_ACTIVE_PROJECTS;
}

/**
 * Commission something.
 *
 * The units, cost and duration all come from the template, so a player
 * choosing to build knows exactly what they are committing to — and exactly
 * how many elections away it opens.
 */
export function commission(
  template: InfrastructureTemplate,
  units: number,
  turn: number,
  term: number,
  moneyScale = 1,
): InfrastructureProject {
  return {
    id: `${template.key}-${turn}`,
    key: template.key,
    units,
    remainingCost: buildCostOf(template, units, moneyScale),
    remainingTurns: template.buildTurns,
    startedTurn: turn,
    startedTerm: term,
  };
}

/** How many elections away a project opens. */
export function termsAway(project: InfrastructureProject): number {
  return Math.ceil(project.remainingTurns / TURNS_PER_TERM);
}

export { INFRASTRUCTURE_TEMPLATES, FULL_MAINTENANCE_COST, findInfrastructure };
export type { InfrastructureKey, InfrastructureTemplate };
