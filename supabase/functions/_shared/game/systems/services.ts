/**
 * services.ts — the twenty things the state actually does.
 *
 * The mechanic: demand is not something a government sets.
 *
 * Every service is driven by a population figure — the retired, the young,
 * the unemployed, the workforce, the whole country — and those figures move
 * on their own. As the country ages, the demand on healthcare and pensions
 * rises every month whether or not anybody decides anything. Holding a
 * budget flat is therefore a cut: automatically, in real terms, invisibly,
 * and it is the single most common way a real public service is degraded.
 *
 * A government that changes nothing starts with every service adequately
 * funded and ends a decade later with none of them adequately funded, having
 * taken no decision it could be criticised for. That is the point, and it is
 * the same point the maintenance backlog and the demographic engine make
 * from two other directions: the expensive decisions in government are
 * mostly the ones nobody takes.
 *
 * What underfunding produces depends on the service. Some of them queue —
 * healthcare, schools, courts, housing — and a queue is visible and
 * measurable and the thing people complain about. Others simply get worse
 * without anyone being able to point at where.
 */

import {
  SERVICE_QUALITY_DRIFT,
  SERVICE_QUALITY_START,
  SERVICE_STAFFING_DRIFT,
  SERVICE_TO_SECTOR,
  WAIT_AT_FULL_FUNDING,
  WAIT_CEILING,
  WAIT_PER_SHORTFALL,
} from '../balance.ts';
import {
  SERVICE_TEMPLATES,
  findService,
  servicesInSector,
  type DemandDriver,
  type ServiceKey,
  type ServiceTemplate,
} from '../content/services.ts';
import type { Demography, Economy, SectorKey, Sector, ServiceState } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Demand
 * ------------------------------------------------------------------ */

/** How many millions of people a service's demand is measured against. */
export function driverSize(
  driver: DemandDriver,
  demography: Demography,
  economy: Economy,
): number {
  switch (driver) {
    case 'population':
      return demography.population;
    case 'retired':
      return demography.population * demography.retiredShare;
    case 'youth':
      return demography.population * demography.youthShare;
    case 'workforce':
      return demography.workforce;
    case 'unemployed':
      return demography.workforce * (economy.unemployment / 100);
    case 'urban':
      return demography.population * demography.urbanisation;
  }
}

/**
 * What it would cost to meet a service's demand in full, ₡bn a year.
 *
 * Nobody decides this. It is what the country is asking for.
 */
export function serviceDemand(
  template: ServiceTemplate,
  demography: Demography,
  economy: Economy,
): number {
  return template.costPerMillion * driverSize(template.driver, demography, economy);
}

/**
 * Distribute a sector's budget across the services inside it.
 *
 * By fixed weight rather than by need, deliberately: a health minister does
 * not reallocate between hospitals and disability services every month, and
 * the point of the mechanic is that the money does NOT follow the demand
 * unless somebody makes it.
 */
export function allocateToServices(sector: SectorKey, funding: number): Record<string, number> {
  const services = servicesInSector(sector);
  const totalWeight = services.reduce((sum, s) => sum + s.budgetWeight, 0) || 1;
  return Object.fromEntries(
    services.map((s) => [s.key, (funding * s.budgetWeight) / totalWeight]),
  );
}

/* ------------------------------------------------------------------ *
 * Starting state
 * ------------------------------------------------------------------ */

export function buildServices(
  sectors: readonly Sector[],
  demography: Demography,
  economy: Economy,
): ServiceState[] {
  const allocations: Record<string, number> = {};
  for (const sector of sectors) {
    Object.assign(allocations, allocateToServices(sector.key, sector.funding));
  }

  return SERVICE_TEMPLATES.map((template) => {
    const demand = serviceDemand(template, demography, economy);
    const funding = allocations[template.key] ?? 0;
    return {
      key: template.key,
      demand,
      funding,
      quality: SERVICE_QUALITY_START,
      staffing: demand > 0 ? clamp(funding / demand, 0, 2) : 1,
      waitMonths: template.queues ? WAIT_AT_FULL_FUNDING : 0,
    };
  });
}

/* ------------------------------------------------------------------ *
 * The month
 * ------------------------------------------------------------------ */

/** How well funded a service is, where 1 is exactly meeting demand. */
export function coverage(service: ServiceState): number {
  return service.demand > 0 ? service.funding / service.demand : 1;
}

/**
 * How long people wait.
 *
 * Not zero at full funding — every real service has a queue, and what a
 * player is deciding is how long is acceptable rather than whether one
 * exists. Shortfalls lengthen it steeply, because a service at 80% of what
 * it needs does not deliver 80% of the service: it delivers a waiting list.
 */
export function waitFor(template: ServiceTemplate, cover: number): number {
  if (!template.queues) return 0;
  const shortfall = Math.max(0, 1 - cover);
  return clamp(
    WAIT_AT_FULL_FUNDING + shortfall * shortfall * WAIT_PER_SHORTFALL * template.strain,
    0,
    WAIT_CEILING,
  );
}

export interface ServicesTick {
  services: ServiceState[];
  /** Services that fell below adequate this month, for the report. */
  newlyStrained: ServiceKey[];
  /** Points to add to each sector's health from the state of its services. */
  sectorEffects: Partial<Record<SectorKey, number>>;
}

/**
 * Advance every service by a week.
 *
 * Demand is recomputed from the population every month — that is the whole
 * mechanic. Funding follows the sector budgets, which the player set and
 * probably has not changed.
 */
export function stepServices(
  services: readonly ServiceState[],
  sectors: readonly Sector[],
  demography: Demography,
  economy: Economy,
  /**
   * What each line is actually funded at, from the budget.
   *
   * Passed in rather than derived, because the budget is the authority on
   * this now — the player sets twenty lines and the five sector figures are
   * a summary of them. Without it, the old fixed-weight split stands in,
   * which a couple of tests still rely on.
   */
  funding?: Record<string, number>,
): ServicesTick {
  const allocations: Record<string, number> = {};
  if (funding) {
    Object.assign(allocations, funding);
  } else {
    for (const sector of sectors) {
      Object.assign(allocations, allocateToServices(sector.key, sector.funding));
    }
  }

  const wasStrained = new Set(
    services.filter((s) => coverage(s) < 0.9).map((s) => s.key),
  );

  const next = services.map((service) => {
    const template = findService(service.key);
    const demand = serviceDemand(template, demography, economy);
    const funding = allocations[service.key] ?? 0;
    const cover = demand > 0 ? funding / demand : 1;

    /* Quality follows coverage, punished more than proportionally for a
       shortfall: a service at 80% of what it needs does not deliver 80%. */
    const target = clamp(
      cover >= 1
        ? SERVICE_QUALITY_START + Math.min(30, (cover - 1) * 55)
        : SERVICE_QUALITY_START - (1 - cover) * (1 - cover) * 190 * template.strain,
      0,
      100,
    );
    const quality = service.quality + (target - service.quality) * SERVICE_QUALITY_DRIFT;
    const staffing =
      service.staffing + (clamp(cover, 0, 2) - service.staffing) * SERVICE_STAFFING_DRIFT;

    return {
      key: service.key,
      demand,
      funding,
      quality,
      staffing,
      waitMonths: waitFor(template, cover),
    };
  });

  const newlyStrained = next
    .filter((s) => coverage(s) < 0.9 && !wasStrained.has(s.key))
    .map((s) => s.key);

  return { services: next, newlyStrained, sectorEffects: sectorHealthEffects(next) };
}

/**
 * What the state of the services does to the sector health voters read.
 *
 * Weighted by how much of the sector's budget each service takes, so a
 * failing healthcare service moves the health sector far more than a failing
 * consumer protection service moves the economy one — which is correct, and
 * which also means the cheap services are the ones it is safe to let go.
 * That is not an oversight; it is why they are always the first cut.
 */
export function sectorHealthEffects(
  services: readonly ServiceState[],
): Partial<Record<SectorKey, number>> {
  const totals: Partial<Record<SectorKey, number>> = {};
  const weights: Partial<Record<SectorKey, number>> = {};

  for (const service of services) {
    const template = findService(service.key);
    const weight = template.budgetWeight;
    totals[template.sector] =
      (totals[template.sector] ?? 0) + (service.quality - SERVICE_QUALITY_START) * weight;
    weights[template.sector] = (weights[template.sector] ?? 0) + weight;
  }

  const out: Partial<Record<SectorKey, number>> = {};
  for (const [sector, total] of Object.entries(totals)) {
    const key = sector as SectorKey;
    out[key] = (total / Math.max(1, weights[key] ?? 1)) * SERVICE_TO_SECTOR;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

/** Services not being funded to their demand, worst first. */
export function strained(services: readonly ServiceState[]): ServiceState[] {
  return [...services].filter((s) => coverage(s) < 0.95).sort((a, b) => coverage(a) - coverage(b));
}

/** The longest queues in the country. */
export function longestWaits(services: readonly ServiceState[], count = 4): ServiceState[] {
  return [...services]
    .filter((s) => s.waitMonths > WAIT_AT_FULL_FUNDING + 0.3)
    .sort((a, b) => b.waitMonths - a.waitMonths)
    .slice(0, count);
}

/** Total demand across every service, ₡bn a year. */
export function totalDemand(services: readonly ServiceState[]): number {
  return services.reduce((sum, s) => sum + s.demand, 0);
}

/** Total funding across every service, ₡bn a year. */
export function totalServiceFunding(services: readonly ServiceState[]): number {
  return services.reduce((sum, s) => sum + s.funding, 0);
}

export { SERVICE_TEMPLATES, findService, servicesInSector };
export type { ServiceKey, ServiceTemplate };
