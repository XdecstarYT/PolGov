/**
 * infrastructure.ts — the twenty things the country is built out of.
 *
 * The mechanic this content exists to serve is the maintenance backlog, and
 * it is the most politically honest thing in the game.
 *
 * Maintaining a road costs money now and produces nothing anyone notices.
 * Not maintaining it costs nothing now and produces nothing anyone notices
 * either — for about four years. Deferred maintenance is therefore free
 * money for exactly one electoral cycle, and the bill lands on whoever is
 * unlucky enough to be in office when the bridge closes. Almost every real
 * government does this, and most of them are re-elected for it.
 *
 * So each asset carries a condition that decays, a capacity that population
 * grows into, and a backlog that compounds. Building new capacity is
 * expensive, slow and visible; keeping what exists is cheap, immediate and
 * invisible. The game never says which is correct.
 */

import { months, perMonth } from '../balance.ts';
import type { SectorKey } from '../types.ts';
import type { IndustryKey } from './industries.ts';

export type InfrastructureKey =
  | 'roads'
  | 'highways'
  | 'railways'
  | 'high_speed_rail'
  | 'airports'
  | 'ports'
  | 'hospitals'
  | 'schools'
  | 'universities'
  | 'housing'
  | 'public_housing'
  | 'water'
  | 'grid'
  | 'power_plants'
  | 'renewables'
  | 'nuclear'
  | 'gas'
  | 'telecoms'
  | 'internet'
  | 'public_transport';

export interface InfrastructureTemplate {
  key: InfrastructureKey;
  name: string;
  blurb: string;
  /** Capacity the country starts with, in arbitrary units matched to demand. */
  capacity: number;
  /**
   * Demand per million people. Capacity below this is congestion, and
   * congestion is what people actually experience.
   */
  demandPerMillion: number;
  /**
   * Condition lost per month with no maintenance at all, in points.
   *
   * Calibrated so that total neglect takes about nine years to push an asset
   * past the point where people notice. That is the political rhythm the
   * whole mechanic depends on: the first term is genuinely free, the second
   * starts to hurt, and the third is a crisis somebody else is answering
   * for. At the first cut of these numbers it was four years, which made
   * deferring maintenance a visibly bad idea rather than a tempting one.
   */
  decayRate: number;
  /** ₡bn A YEAR to hold the condition steady. */
  maintenanceCost: number;
  /** ₡bn to add one unit of capacity. */
  buildCost: number;
  /** Turns to build. Most of these outlast the government that starts them. */
  buildTurns: number;
  /** The public sector this asset serves. */
  serves?: SectorKey;
  /** The industries that depend on it. */
  enables: IndustryKey[];
  /** Where it is, as weights. Empty means it is everywhere. */
  regions?: Record<string, number>;
  /** Points of environment health per unit of capacity. Negative pollutes. */
  environmental?: number;
}

export const INFRASTRUCTURE_TEMPLATES: InfrastructureTemplate[] = [
  {
    key: 'roads',
    name: 'Roads',
    blurb: 'Local streets and rural routes. Nobody thanks you for resurfacing one.',
    capacity: 100,
    demandPerMillion: 2.25,
    decayRate: perMonth(0.25),
    maintenanceCost: 18.6,
    buildCost: 1.10,
    buildTurns: months(14),
    serves: 'infrastructure',
    enables: ['transport', 'logistics', 'retail', 'agriculture'],
    environmental: -0.02,
  },
  {
    key: 'highways',
    name: 'Highways',
    blurb: 'The trunk network. Expensive to build, ruinous to let go.',
    capacity: 62,
    demandPerMillion: 1.42,
    decayRate: perMonth(0.22),
    maintenanceCost: 13.8,
    buildCost: 2.40,
    buildTurns: months(26),
    serves: 'infrastructure',
    enables: ['logistics', 'transport', 'manufacturing'],
    environmental: -0.04,
  },
  {
    key: 'railways',
    name: 'Railways',
    blurb: 'Conventional rail. Cheap per passenger and impossible to restore once closed.',
    capacity: 44,
    demandPerMillion: 1.02,
    decayRate: perMonth(0.19),
    maintenanceCost: 12.5,
    buildCost: 3.10,
    buildTurns: months(34),
    serves: 'infrastructure',
    enables: ['transport', 'logistics'],
    environmental: 0.05,
  },
  {
    key: 'high_speed_rail',
    name: 'High-speed rail',
    blurb: 'Fast intercity line. A decade to build and an argument for every year of it.',
    capacity: 9,
    demandPerMillion: 0.26,
    decayRate: perMonth(0.14),
    maintenanceCost: 6.2,
    buildCost: 12.50,
    buildTurns: months(88),
    serves: 'infrastructure',
    enables: ['transport', 'finance', 'technology'],
    regions: { ternhill: 2.2, ashmere: 1.6, halloway: 1.0 },
    environmental: 0.08,
  },
  {
    key: 'airports',
    name: 'Airports',
    blurb: 'Runways and terminals. Loud, essential, and never welcome nearby.',
    capacity: 12,
    demandPerMillion: 0.3,
    decayRate: perMonth(0.16),
    maintenanceCost: 5.3,
    buildCost: 5.40,
    buildTurns: months(48),
    enables: ['tourism', 'logistics', 'finance'],
    regions: { ternhill: 1.8, ashmere: 1.4, vell: 0.8 },
    environmental: -0.09,
  },
  {
    key: 'ports',
    name: 'Ports',
    blurb: 'Docks and container terminals. Where every trade decision arrives first.',
    capacity: 16,
    demandPerMillion: 0.38,
    decayRate: perMonth(0.17),
    maintenanceCost: 6.6,
    buildCost: 4.20,
    buildTurns: months(40),
    enables: ['logistics', 'fisheries', 'manufacturing', 'mining'],
    regions: { ashmere: 2.4, vell: 1.6, sable: 0.8 },
    environmental: -0.03,
  },
  {
    key: 'hospitals',
    name: 'Hospitals',
    blurb: 'Beds and theatres. Demand rises every year the country ages.',
    capacity: 38,
    demandPerMillion: 0.88,
    decayRate: perMonth(0.23),
    maintenanceCost: 15.1,
    buildCost: 3.80,
    buildTurns: months(44),
    serves: 'health',
    enables: ['healthcare'],
  },
  {
    key: 'schools',
    name: 'Schools',
    blurb: 'Classrooms. The one asset whose output arrives fifteen years late.',
    capacity: 48,
    demandPerMillion: 1.06,
    decayRate: perMonth(0.21),
    maintenanceCost: 12.8,
    buildCost: 1.90,
    buildTurns: months(26),
    serves: 'education',
    enables: ['education'],
  },
  {
    key: 'universities',
    name: 'Universities',
    blurb: 'Faculties and laboratories. Where the skills shortage is either solved or not.',
    capacity: 14,
    demandPerMillion: 0.31,
    decayRate: perMonth(0.15),
    maintenanceCost: 8.0,
    buildCost: 4.60,
    buildTurns: months(52),
    serves: 'education',
    enables: ['research', 'technology', 'healthcare'],
    regions: { ashmere: 2.2, ternhill: 1.6 },
  },
  {
    key: 'housing',
    name: 'Housing',
    blurb: 'Private homes. The shortage nobody can build their way out of in one term.',
    capacity: 165,
    demandPerMillion: 4.05,
    decayRate: perMonth(0.13),
    maintenanceCost: 4.9,
    buildCost: 0.90,
    buildTurns: months(20),
    enables: ['construction', 'real_estate'],
  },
  {
    key: 'public_housing',
    name: 'Public housing',
    blurb: 'State-owned homes. Cheap to build, and sold off faster than it is replaced.',
    capacity: 26,
    demandPerMillion: 0.72,
    decayRate: perMonth(0.28),
    maintenanceCost: 7.1,
    buildCost: 1.00,
    buildTurns: months(22),
    enables: ['construction'],
  },
  {
    key: 'water',
    name: 'Water and sewerage',
    blurb: 'Mains, treatment and outfalls. Entirely invisible until it is in the river.',
    capacity: 52,
    demandPerMillion: 1.18,
    decayRate: perMonth(0.26),
    maintenanceCost: 13.3,
    buildCost: 2.10,
    buildTurns: months(30),
    serves: 'environment',
    enables: ['agriculture', 'manufacturing'],
    environmental: 0.11,
  },
  {
    key: 'grid',
    name: 'Electricity grid',
    blurb: 'Transmission and distribution. Every generator is useless without it.',
    capacity: 58,
    demandPerMillion: 1.34,
    decayRate: perMonth(0.23),
    maintenanceCost: 12.0,
    buildCost: 2.20,
    buildTurns: months(28),
    serves: 'infrastructure',
    enables: ['energy', 'manufacturing', 'technology', 'telecoms'],
  },
  {
    key: 'power_plants',
    name: 'Thermal power',
    blurb: 'Coal and gas generation. Reliable, dirty, and politically load-bearing in Sable Reach.',
    capacity: 34,
    demandPerMillion: 0.62,
    decayRate: perMonth(0.21),
    maintenanceCost: 9.7,
    buildCost: 2.80,
    buildTurns: months(36),
    enables: ['energy', 'manufacturing'],
    regions: { sable: 3.0, halloway: 1.2 },
    environmental: -0.26,
  },
  {
    key: 'renewables',
    name: 'Renewable generation',
    blurb: 'Wind, solar and hydro. Cheap to run, and it does not generate on demand.',
    capacity: 18,
    demandPerMillion: 0.34,
    decayRate: perMonth(0.14),
    maintenanceCost: 4.0,
    buildCost: 2.30,
    buildTurns: months(24),
    enables: ['energy'],
    regions: { karrow: 2.4, callow: 1.2, vell: 1.0 },
    environmental: 0.31,
  },
  {
    key: 'nuclear',
    name: 'Nuclear power',
    blurb: 'Enormous, clean, and a decade late by tradition.',
    capacity: 7,
    demandPerMillion: 0.16,
    decayRate: perMonth(0.10),
    maintenanceCost: 7.1,
    buildCost: 14.00,
    buildTurns: months(108),
    enables: ['energy'],
    regions: { sable: 1.6, halloway: 1.0, vell: 0.8 },
    environmental: 0.24,
  },
  {
    key: 'gas',
    name: 'Gas infrastructure',
    blurb: 'Pipelines, storage and terminals. Quietly essential every winter.',
    capacity: 24,
    demandPerMillion: 0.52,
    decayRate: perMonth(0.20),
    maintenanceCost: 7.6,
    buildCost: 2.00,
    buildTurns: months(30),
    enables: ['energy', 'manufacturing'],
    regions: { sable: 2.6, halloway: 1.0 },
    environmental: -0.14,
  },
  {
    key: 'telecoms',
    name: 'Telecommunications',
    blurb: 'Masts, exchanges and spectrum. Replaced wholesale every fifteen years.',
    capacity: 40,
    demandPerMillion: 0.94,
    decayRate: perMonth(0.31),
    maintenanceCost: 8.4,
    buildCost: 1.50,
    buildTurns: months(18),
    serves: 'infrastructure',
    enables: ['telecoms', 'technology', 'finance'],
  },
  {
    key: 'internet',
    name: 'Internet infrastructure',
    blurb: 'Fibre and exchanges. The one asset where rural coverage is a political identity.',
    capacity: 36,
    demandPerMillion: 0.9,
    decayRate: perMonth(0.32),
    maintenanceCost: 7.6,
    buildCost: 1.30,
    buildTurns: months(16),
    serves: 'infrastructure',
    enables: ['technology', 'finance', 'entertainment', 'research'],
  },
  {
    key: 'public_transport',
    name: 'Public transport',
    blurb: 'Buses, trams and metro. Used by the people least able to complain effectively.',
    capacity: 30,
    demandPerMillion: 0.76,
    decayRate: perMonth(0.29),
    maintenanceCost: 11.5,
    buildCost: 1.80,
    buildTurns: months(24),
    serves: 'infrastructure',
    enables: ['transport', 'retail'],
    regions: { ternhill: 2.4, ashmere: 1.4, halloway: 1.2 },
    environmental: 0.13,
  },
];

export function findInfrastructure(key: InfrastructureKey): InfrastructureTemplate {
  const found = INFRASTRUCTURE_TEMPLATES.find((i) => i.key === key);
  if (!found) throw new Error(`infrastructure: unknown asset ${key}`);
  return found;
}

/**
 * Total monthly cost of holding every asset's condition steady — about ₡16bn,
 * against government receipts of ₡105bn.
 *
 * Sized to fit the fiscal envelope the rest of the game is balanced against
 * rather than derived from anything. Full maintenance is affordable and
 * boring; it is roughly a sixth of programme spending and buys the player
 * nothing they can point at. That is the trap working as intended.
 */
/** Total cost of holding every asset's condition steady, ₡bn a year. */
export const FULL_MAINTENANCE_COST = INFRASTRUCTURE_TEMPLATES.reduce(
  (sum, t) => sum + t.maintenanceCost,
  0,
);
