/**
 * ministries.ts — who actually holds the money.
 *
 * A budget is not a set of sliders. It is a negotiation between people who
 * each run part of the state and each believe their part is underfunded,
 * conducted by a chancellor who has to make the total add up and a prime
 * minister who needs all of them to stay in the room.
 *
 * So the twenty services are grouped into eight ministries, and a ministry
 * is HELD by a party. A coalition partner with the health portfolio is not
 * an abstract cabinet seat any more: they are the person whose budget you
 * are about to cut, and they will take it personally in a way that shows up
 * in coalition mood and, eventually, in whether the government has a
 * majority.
 *
 * That connects the cabinet arithmetic Engine 1 already models to the money
 * Engine 2 already models, and it is the join that makes both of them mean
 * more than they did apart.
 */

import type { ServiceKey } from './services.ts';

export type MinistryKey =
  | 'treasury'
  | 'health'
  | 'education'
  | 'interior'
  | 'justice'
  | 'defence'
  | 'work_pensions'
  | 'environment';

export interface MinistryTemplate {
  key: MinistryKey;
  name: string;
  /** The person, not the department. Ministers are argued with. */
  title: string;
  blurb: string;
  services: ServiceKey[];
  /**
   * How hard this ministry fights a cut, as a multiplier on the coalition
   * mood cost. Defence and health fight hardest; the treasury, which is
   * making the cuts, does not fight itself.
   */
  resistance: number;
  /**
   * How much of this ministry's spending is naturally capital rather than
   * running costs. Hospitals and roads are built; pensions are paid.
   */
  capitalShare: number;
  /** Which party would most like to hold it, by the axis they care about. */
  prize: 'economic' | 'social' | 'environmental';
}

export const MINISTRY_TEMPLATES: MinistryTemplate[] = [
  {
    key: 'treasury',
    name: 'Treasury',
    title: 'Chancellor',
    blurb:
      'Writes the budget and takes the blame for it. The only ministry whose success looks like nothing happening.',
    services: ['administration', 'consumer_protection'],
    resistance: 0.4,
    capitalShare: 0.05,
    prize: 'economic',
  },
  {
    key: 'health',
    name: 'Health',
    title: 'Health Secretary',
    blurb:
      'The largest budget and the shortest fuse. Every cut here is a photograph of somebody on a trolley.',
    services: ['healthcare', 'disability'],
    resistance: 1.6,
    capitalShare: 0.18,
    prize: 'social',
  },
  {
    key: 'education',
    name: 'Education',
    title: 'Education Secretary',
    blurb:
      'Spends now for a result fifteen years out. Nobody who funds it is in office when it arrives.',
    services: ['education', 'childcare', 'broadcasting'],
    resistance: 1.2,
    capitalShare: 0.22,
    prize: 'social',
  },
  {
    key: 'interior',
    name: 'Interior',
    title: 'Home Secretary',
    blurb:
      'Police, fire, borders and everything that becomes a crisis at four in the morning.',
    services: ['police', 'fire', 'emergency', 'border'],
    resistance: 1.4,
    capitalShare: 0.14,
    prize: 'social',
  },
  {
    key: 'justice',
    name: 'Justice',
    title: 'Justice Secretary',
    blurb:
      'Courts and prisons. Underfunding is invisible for years and then it is a two-year listing delay.',
    services: ['courts', 'prisons'],
    resistance: 0.9,
    capitalShare: 0.2,
    prize: 'social',
  },
  {
    key: 'defence',
    name: 'Defence',
    title: 'Defence Secretary',
    blurb:
      'Costs the same whether or not anything happens, which is the argument for and against it.',
    services: ['defence'],
    resistance: 1.5,
    capitalShare: 0.35,
    prize: 'economic',
  },
  {
    key: 'work_pensions',
    name: 'Work and Pensions',
    title: 'Work and Pensions Secretary',
    blurb:
      'The biggest cheque the state writes, to the people most certain to vote.',
    services: ['pensions', 'welfare', 'housing_assistance', 'workplace_regulation'],
    resistance: 1.7,
    capitalShare: 0.03,
    prize: 'economic',
  },
  {
    key: 'environment',
    name: 'Environment',
    title: 'Environment Secretary',
    blurb:
      'Cheap, always first to be cut, and the only ministry whose failures are permanent.',
    services: ['environmental_protection', 'agencies'],
    resistance: 1.1,
    capitalShare: 0.16,
    prize: 'environmental',
  },
];

export function findMinistry(key: MinistryKey): MinistryTemplate {
  const found = MINISTRY_TEMPLATES.find((m) => m.key === key);
  if (!found) throw new Error(`ministries: unknown ministry ${key}`);
  return found;
}

/** Which ministry runs a given service. */
export function ministryFor(service: ServiceKey): MinistryTemplate {
  const found = MINISTRY_TEMPLATES.find((m) => m.services.includes(service));
  if (!found) throw new Error(`ministries: ${service} belongs to no ministry`);
  return found;
}
