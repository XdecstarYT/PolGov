/**
 * industries.ts — the twenty industries the country is made of.
 *
 * GDP is one number, and one number cannot tell a player why a rate rise
 * ruins Sable Reach and barely touches Ternhill. Splitting output into
 * industries, and putting each industry somewhere on the map, is what turns
 * a national economic decision into a regional political one — which is the
 * form almost every real economic argument actually takes.
 *
 * Each industry carries:
 *
 *   share        of output and of employment, which differ: mining is a
 *                large share of output and a small share of jobs, and that
 *                gap is why resource regions are rich and politically angry
 *   regions      where the jobs are, as weights — this is the whole point
 *   sensitivity  to interest rates, to the carbon price, to tariffs, and to
 *                the cycle, so that a single decision lands unevenly
 *   supports     which public sector's health it depends on, so that
 *                underfunding education is a technology problem in eight
 *                years rather than an abstraction
 *
 * The industries are invented in the sense that the country is, but their
 * relative sizes and sensitivities are ordinary: a finance sector that is a
 * tenth of output, a farm sector that is a fortieth, and a mining sector
 * that employs a fifth of the people its output would suggest.
 */

import type { SectorKey } from '../types.ts';

export type IndustryKey =
  | 'agriculture'
  | 'mining'
  | 'manufacturing'
  | 'construction'
  | 'retail'
  | 'tourism'
  | 'technology'
  | 'finance'
  | 'energy'
  | 'transport'
  | 'healthcare'
  | 'education'
  | 'defence'
  | 'entertainment'
  | 'telecoms'
  | 'real_estate'
  | 'logistics'
  | 'fisheries'
  | 'forestry'
  | 'research';

export interface IndustryTemplate {
  key: IndustryKey;
  name: string;
  blurb: string;
  /** Share of national output. The twenty sum to one. */
  outputShare: number;
  /** Share of national employment. Deliberately not the same number. */
  employmentShare: number;
  /** Where the jobs are, as weights across regions. */
  regions: Record<string, number>;
  /** How hard a point of real interest rate hits its output, in points. */
  rateSensitivity: number;
  /** How hard a point of carbon price hits it. Negative industries benefit. */
  carbonSensitivity: number;
  /** How a point of import tariff moves it. Positive means sheltered. */
  tariffSensitivity: number;
  /** How much it amplifies the cycle. 1 is average; utilities are below it. */
  cyclicality: number;
  /** The public sector whose health this industry depends on. */
  supports?: SectorKey;
  /** True for industries the state itself largely employs. */
  publiclyFunded?: boolean;
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    key: 'agriculture',
    name: 'Agriculture',
    blurb: 'Arable and livestock. Exposed to weather, fuel and whoever sets the export rules.',
    outputShare: 0.026,
    employmentShare: 0.031,
    regions: { callow: 3.2, karrow: 1.1, estmoor: 0.5, halloway: 0.3 },
    rateSensitivity: 0.5,
    carbonSensitivity: 0.7,
    tariffSensitivity: 0.6,
    cyclicality: 0.5,
  },
  {
    key: 'mining',
    name: 'Mining',
    blurb: 'Extraction and processing. A large share of output from a small share of the workforce.',
    outputShare: 0.062,
    employmentShare: 0.016,
    regions: { sable: 3.0, karrow: 1.6, estmoor: 0.4 },
    rateSensitivity: 0.7,
    carbonSensitivity: 1.6,
    tariffSensitivity: -0.4,
    cyclicality: 1.8,
  },
  {
    key: 'manufacturing',
    name: 'Manufacturing',
    blurb: 'Fabrication and assembly. The industry tariffs are argued about on behalf of.',
    outputShare: 0.094,
    employmentShare: 0.098,
    regions: { halloway: 3.0, estmoor: 2.2, ashmere: 0.8, callow: 0.5 },
    rateSensitivity: 1.1,
    carbonSensitivity: 1.0,
    tariffSensitivity: 1.4,
    cyclicality: 1.5,
    supports: 'infrastructure',
  },
  {
    key: 'construction',
    name: 'Construction',
    blurb: 'Housing and public works. The first industry a rate rise stops.',
    outputShare: 0.073,
    employmentShare: 0.085,
    regions: { ternhill: 1.6, halloway: 1.2, ashmere: 1.2, estmoor: 0.9, callow: 0.7 },
    rateSensitivity: 2.4,
    carbonSensitivity: 0.4,
    tariffSensitivity: 0.2,
    cyclicality: 2.1,
    supports: 'infrastructure',
  },
  {
    key: 'retail',
    name: 'Retail',
    blurb: 'Shops and hospitality. Employs far more people than its output suggests.',
    outputShare: 0.058,
    employmentShare: 0.112,
    regions: { ternhill: 1.6, ashmere: 1.3, halloway: 1.2, estmoor: 1.0, callow: 0.8, vell: 0.4 },
    rateSensitivity: 0.9,
    carbonSensitivity: 0.2,
    tariffSensitivity: -0.5,
    cyclicality: 1.2,
  },
  {
    key: 'tourism',
    name: 'Tourism',
    blurb: 'Visitors and the trade that lives on them. Seasonal, and the first thing cancelled.',
    outputShare: 0.031,
    employmentShare: 0.048,
    regions: { vell: 2.6, ashmere: 1.4, karrow: 1.0, ternhill: 0.6 },
    rateSensitivity: 0.8,
    carbonSensitivity: 0.3,
    tariffSensitivity: -0.2,
    cyclicality: 2.0,
  },
  {
    key: 'technology',
    name: 'Technology',
    blurb: 'Software and instruments. Grows on graduates, and cannot be conjured from nothing.',
    outputShare: 0.071,
    employmentShare: 0.044,
    regions: { ternhill: 2.4, ashmere: 2.0, halloway: 0.4 },
    rateSensitivity: 1.3,
    carbonSensitivity: -0.1,
    tariffSensitivity: -0.3,
    cyclicality: 1.3,
    supports: 'education',
  },
  {
    key: 'finance',
    name: 'Finance',
    blurb: 'Banking and insurance. A tenth of output, concentrated in one city.',
    outputShare: 0.096,
    employmentShare: 0.038,
    regions: { ternhill: 3.4, ashmere: 0.7 },
    rateSensitivity: -0.6,
    carbonSensitivity: 0,
    tariffSensitivity: -0.2,
    cyclicality: 1.6,
  },
  {
    key: 'energy',
    name: 'Energy',
    blurb: 'Generation and refining. One region, one argument, and it never changes.',
    outputShare: 0.058,
    employmentShare: 0.021,
    regions: { sable: 3.4, karrow: 1.2, halloway: 0.6 },
    rateSensitivity: 0.6,
    carbonSensitivity: 1.9,
    tariffSensitivity: -0.3,
    cyclicality: 0.7,
  },
  {
    key: 'transport',
    name: 'Transport',
    blurb: 'Moving people. Depends entirely on what has been built for it to move them on.',
    outputShare: 0.042,
    employmentShare: 0.052,
    regions: { ternhill: 1.5, halloway: 1.2, ashmere: 1.1, estmoor: 0.8, callow: 0.6 },
    rateSensitivity: 0.9,
    carbonSensitivity: 1.1,
    tariffSensitivity: 0,
    cyclicality: 1.1,
    supports: 'infrastructure',
  },
  {
    key: 'healthcare',
    name: 'Healthcare',
    blurb: 'Hospitals and care. Barely cyclical, because people are ill in a downturn too.',
    outputShare: 0.082,
    employmentShare: 0.118,
    regions: { ternhill: 1.4, halloway: 1.2, ashmere: 1.1, estmoor: 1.1, callow: 0.9, karrow: 0.5 },
    rateSensitivity: 0.1,
    carbonSensitivity: 0.1,
    tariffSensitivity: 0,
    cyclicality: 0.15,
    supports: 'health',
    publiclyFunded: true,
  },
  {
    key: 'education',
    name: 'Education',
    blurb: 'Schools and universities. Its output arrives fifteen years after it is paid for.',
    outputShare: 0.061,
    employmentShare: 0.094,
    regions: { ternhill: 1.3, ashmere: 1.6, halloway: 1.0, estmoor: 0.9, callow: 0.8 },
    rateSensitivity: 0.05,
    carbonSensitivity: 0,
    tariffSensitivity: 0,
    cyclicality: 0.1,
    supports: 'education',
    publiclyFunded: true,
  },
  {
    key: 'defence',
    name: 'Defence industry',
    blurb: 'Yards and workshops on state orders. Immune to the cycle, exposed to the budget.',
    outputShare: 0.023,
    employmentShare: 0.019,
    regions: { halloway: 1.8, vell: 1.0, sable: 0.6, estmoor: 0.8 },
    rateSensitivity: 0.1,
    carbonSensitivity: 0.3,
    tariffSensitivity: 0.4,
    cyclicality: 0.1,
    publiclyFunded: true,
  },
  {
    key: 'entertainment',
    name: 'Entertainment',
    blurb: 'Broadcast, sport and performance. Small, loud, and disproportionately noticed.',
    outputShare: 0.022,
    employmentShare: 0.026,
    regions: { ternhill: 2.2, ashmere: 1.2, vell: 0.4 },
    rateSensitivity: 0.7,
    carbonSensitivity: 0.1,
    tariffSensitivity: -0.2,
    cyclicality: 1.5,
  },
  {
    key: 'telecoms',
    name: 'Telecommunications',
    blurb: 'Networks and spectrum. Enormous fixed costs, so rates matter more than demand.',
    outputShare: 0.036,
    employmentShare: 0.017,
    regions: { ternhill: 2.0, ashmere: 1.0, halloway: 0.6, estmoor: 0.4 },
    rateSensitivity: 1.5,
    carbonSensitivity: 0.1,
    tariffSensitivity: -0.2,
    cyclicality: 0.5,
    supports: 'infrastructure',
  },
  {
    key: 'real_estate',
    name: 'Real estate',
    blurb: 'Development and letting. Moves before construction does, and further.',
    outputShare: 0.087,
    employmentShare: 0.026,
    regions: { ternhill: 2.6, ashmere: 1.3, halloway: 0.7, estmoor: 0.5 },
    rateSensitivity: 2.8,
    carbonSensitivity: 0.2,
    tariffSensitivity: 0,
    cyclicality: 2.2,
  },
  {
    key: 'logistics',
    name: 'Logistics',
    blurb: 'Freight, warehousing and ports. The first place a trade decision is felt.',
    outputShare: 0.041,
    employmentShare: 0.048,
    regions: { ashmere: 2.2, halloway: 1.4, vell: 0.8, ternhill: 0.8 },
    rateSensitivity: 0.8,
    carbonSensitivity: 1.2,
    tariffSensitivity: -1.3,
    cyclicality: 1.4,
    supports: 'infrastructure',
  },
  {
    key: 'fisheries',
    name: 'Fisheries',
    blurb: 'Harbours and processing. Tiny nationally; the entire argument in two archipelagos.',
    outputShare: 0.012,
    employmentShare: 0.015,
    regions: { vell: 3.6, ashmere: 0.8, sable: 0.3 },
    rateSensitivity: 0.4,
    carbonSensitivity: 0.6,
    tariffSensitivity: 0.7,
    cyclicality: 0.8,
    supports: 'environment',
  },
  {
    key: 'forestry',
    name: 'Forestry',
    blurb: 'Timber and pulp. Slow, regional, and always in the way of something protected.',
    outputShare: 0.015,
    employmentShare: 0.016,
    regions: { karrow: 2.8, callow: 1.0, estmoor: 0.5 },
    rateSensitivity: 0.6,
    carbonSensitivity: -0.4,
    tariffSensitivity: 0.5,
    cyclicality: 0.9,
    supports: 'environment',
  },
  {
    key: 'research',
    name: 'Research',
    blurb: 'Public and private laboratories. The only industry that raises the speed limit.',
    outputShare: 0.01,
    employmentShare: 0.011,
    regions: { ashmere: 2.4, ternhill: 1.6, halloway: 0.3 },
    rateSensitivity: 0.4,
    carbonSensitivity: -0.2,
    tariffSensitivity: 0,
    cyclicality: 0.4,
    supports: 'education',
    publiclyFunded: true,
  },
];

export function findIndustry(key: IndustryKey): IndustryTemplate {
  const found = INDUSTRY_TEMPLATES.find((i) => i.key === key);
  if (!found) throw new Error(`industries: unknown industry ${key}`);
  return found;
}
