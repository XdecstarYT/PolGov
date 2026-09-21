/**
 * services.ts — the twenty things the state actually does.
 *
 * The mechanic this exists for: demand is not something a government sets.
 *
 * Every service here is driven by a population figure — the retired, the
 * young, the unemployed, the workforce, the whole country — and those
 * figures move on their own. As the country ages, the demand on healthcare
 * and pensions rises every single month whether or not anybody decides
 * anything. Holding a budget flat is therefore a cut, automatically, in
 * real terms, invisibly, and it is the single most common way a real public
 * service is degraded.
 *
 * That pairs with the maintenance backlog and with the demographic engine to
 * make the same point three different ways: the expensive decisions in
 * government are mostly the ones nobody takes.
 *
 * Each service carries a demand driver, a cost per unit of that demand, and
 * a sector it reports into — so the five sector budgets the player already
 * sets are distributed across twenty services that each have their own
 * pressure. Nothing here says what a service is worth.
 */

import type { SectorKey } from '../types.ts';

export type ServiceKey =
  | 'healthcare'
  | 'education'
  | 'police'
  | 'fire'
  | 'emergency'
  | 'courts'
  | 'prisons'
  | 'defence'
  | 'welfare'
  | 'pensions'
  | 'disability'
  | 'childcare'
  | 'housing_assistance'
  | 'administration'
  | 'border'
  | 'environmental_protection'
  | 'consumer_protection'
  | 'workplace_regulation'
  | 'broadcasting'
  | 'agencies';

/**
 * What a service's demand is proportional to.
 *
 * The point of naming these rather than using population for everything: a
 * government that succeeds at health policy gets a larger pension bill, and
 * one that presides over a recession gets a larger welfare bill, and neither
 * of those is something anyone chose.
 */
export type DemandDriver =
  | 'population'
  | 'retired'
  | 'youth'
  | 'workforce'
  | 'unemployed'
  | 'urban';

export interface ServiceTemplate {
  key: ServiceKey;
  name: string;
  blurb: string;
  sector: SectorKey;
  driver: DemandDriver;
  /**
   * ₡bn A YEAR per million people of the driving group, at full service.
   *
   * Calibrated so that each sector's twenty-service demand, at the starting
   * population, sums to exactly that sector's baseline funding. A country
   * that changes nothing therefore starts with every service adequately
   * funded and NOT ONE of them adequately funded a decade later, because
   * the drivers move and the budget does not.
   */
  costPerMillion: number;
  /**
   * How much of the sector's budget this service takes. Within a sector
   * these are relative weights, not shares.
   *
   * Set to the demand each service is making at the starting population, so
   * a new government inherits every service funded to exactly what is being
   * asked of it. The weights are then FIXED while the demand moves, which is
   * the entire mechanic: money does not follow need unless somebody makes
   * it, and a health minister does not reallocate between hospitals and
   * disability services every month.
   */
  budgetWeight: number;
  /** How sharply quality falls when funding lags demand. */
  strain: number;
  /** True for services where the visible failure is a queue rather than a gap. */
  queues?: boolean;
}

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    key: 'healthcare',
    name: 'Healthcare',
    blurb: 'Hospitals, clinics and ambulances. Demand rises every year the country ages.',
    sector: 'health',
    driver: 'population',
    costPerMillion: 6.0192,
    budgetWeight: 256.416,
    strain: 1.3,
    queues: true,
  },
  {
    key: 'pensions',
    name: 'Pensions',
    blurb: 'The state pension. Owed to everyone who reaches the age, at whatever cost.',
    sector: 'economy',
    driver: 'retired',
    costPerMillion: 14.0052,
    budgetWeight: 104.412,
    strain: 2.2,
  },
  {
    key: 'education',
    name: 'Schools',
    blurb: 'Primary and secondary. Falls with the birth rate, twenty years late.',
    sector: 'education',
    driver: 'youth',
    costPerMillion: 19.4940,
    budgetWeight: 168.576,
    strain: 1.1,
    queues: true,
  },
  {
    key: 'welfare',
    name: 'Welfare',
    blurb: 'Unemployment support. Costs most in exactly the month revenue falls.',
    sector: 'economy',
    driver: 'unemployed',
    costPerMillion: 22.1484,
    budgetWeight: 18.216,
    strain: 1.6,
  },
  {
    key: 'disability',
    name: 'Disability services',
    blurb: 'Support and care. Demand grows with the population and with its age.',
    sector: 'health',
    driver: 'population',
    costPerMillion: 2.4312,
    budgetWeight: 103.572,
    strain: 1.4,
    queues: true,
  },
  {
    key: 'childcare',
    name: 'Childcare',
    blurb: 'Early years places. What decides whether both parents can work.',
    sector: 'education',
    driver: 'youth',
    costPerMillion: 5.2944,
    budgetWeight: 45.780,
    strain: 1.2,
    queues: true,
  },
  {
    key: 'police',
    name: 'Police',
    blurb: 'Constables and detectives. Judged on response times nobody publishes honestly.',
    sector: 'infrastructure',
    driver: 'population',
    costPerMillion: 1.2252,
    budgetWeight: 52.188,
    strain: 1.2,
    queues: true,
  },
  {
    key: 'fire',
    name: 'Fire services',
    blurb: 'Stations and crews. Almost never needed, and catastrophic when thin.',
    sector: 'infrastructure',
    driver: 'population',
    costPerMillion: 0.4284,
    budgetWeight: 18.252,
    strain: 1.5,
  },
  {
    key: 'emergency',
    name: 'Emergency services',
    blurb: 'Coordination, rescue and civil response. Invisible until a very bad week.',
    sector: 'infrastructure',
    driver: 'population',
    costPerMillion: 0.3672,
    budgetWeight: 15.648,
    strain: 1.7,
  },
  {
    key: 'courts',
    name: 'Courts',
    blurb: 'Judges, listings and legal aid. Underfunding shows up as a two-year wait.',
    sector: 'infrastructure',
    driver: 'population',
    costPerMillion: 0.4896,
    budgetWeight: 20.856,
    strain: 1.3,
    queues: true,
  },
  {
    key: 'prisons',
    name: 'Prisons',
    blurb: 'Custody and probation. The one service whose demand policy directly sets.',
    sector: 'infrastructure',
    driver: 'population',
    costPerMillion: 0.6732,
    budgetWeight: 28.680,
    strain: 1.5,
    queues: true,
  },
  {
    key: 'defence',
    name: 'Defence',
    blurb: 'Forces and procurement. Costs the same whether or not anything happens.',
    sector: 'infrastructure',
    driver: 'population',
    costPerMillion: 2.0820,
    budgetWeight: 88.692,
    strain: 0.8,
  },
  {
    key: 'housing_assistance',
    name: 'Housing assistance',
    blurb: 'Rent support and homelessness services. Rises with rents, not with decisions.',
    sector: 'economy',
    driver: 'urban',
    costPerMillion: 1.8240,
    budgetWeight: 55.188,
    strain: 1.5,
    queues: true,
  },
  {
    key: 'administration',
    name: 'Public administration',
    blurb: 'The machinery that runs everything else. The first thing promised as a saving.',
    sector: 'economy',
    driver: 'population',
    costPerMillion: 1.1076,
    budgetWeight: 47.160,
    strain: 1.0,
  },
  {
    key: 'border',
    name: 'Border services',
    blurb: 'Entry, customs and enforcement. Demand set by trade and by arrivals.',
    sector: 'infrastructure',
    driver: 'population',
    costPerMillion: 0.3672,
    budgetWeight: 15.648,
    strain: 1.2,
    queues: true,
  },
  {
    key: 'environmental_protection',
    name: 'Environmental protection',
    blurb: 'Monitoring, enforcement and remediation. Cheap, and the first cut every time.',
    sector: 'environment',
    driver: 'population',
    costPerMillion: 2.3304,
    budgetWeight: 99.276,
    strain: 1.4,
  },
  {
    key: 'consumer_protection',
    name: 'Consumer protection',
    blurb: 'Standards and redress. Nobody misses it until they need it once.',
    sector: 'economy',
    driver: 'population',
    costPerMillion: 0.1944,
    budgetWeight: 8.316,
    strain: 1.1,
  },
  {
    key: 'workplace_regulation',
    name: 'Workplace regulation',
    blurb: 'Inspection and safety. Measured in accidents that did not happen.',
    sector: 'economy',
    driver: 'workforce',
    costPerMillion: 0.3912,
    budgetWeight: 6.708,
    strain: 1.3,
  },
  {
    key: 'broadcasting',
    name: 'Broadcasting and culture',
    blurb:
      'The broadcaster, the museums, the orchestras and the libraries. The cheapest line in the budget and the one argued about most.',
    sector: 'education',
    driver: 'population',
    costPerMillion: 0.6012,
    budgetWeight: 25.608,
    strain: 0.9,
  },
  {
    key: 'agencies',
    name: 'Government agencies',
    blurb: 'Regulators, statistics and inspectorates. Invisible, and load-bearing.',
    sector: 'environment',
    driver: 'population',
    costPerMillion: 1.6128,
    budgetWeight: 68.700,
    strain: 1.1,
  },
];

export function findService(key: ServiceKey): ServiceTemplate {
  const found = SERVICE_TEMPLATES.find((s) => s.key === key);
  if (!found) throw new Error(`services: unknown service ${key}`);
  return found;
}

/** The services a sector's budget is distributed across. */
export function servicesInSector(sector: SectorKey): ServiceTemplate[] {
  return SERVICE_TEMPLATES.filter((s) => s.sector === sector);
}
