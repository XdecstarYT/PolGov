/**
 * access.ts — the twelve things a household needs to be able to get.
 *
 * QUALITY and ACCESS are different questions and the distinction is the
 * whole reason this file exists. A health service can be excellent and
 * unreachable: well staffed, well regarded, and eighteen months' wait for
 * the appointment. A school system can be good on average and closed to
 * the bottom fifth. Quality is what the service is like for the people
 * who get it; access is whether you are one of them.
 *
 * Governments are judged on access and report on quality, which is not
 * dishonesty so much as the natural consequence of quality being the
 * easier thing to measure. The engine models both and lets them come
 * apart.
 *
 * Every domain therefore has three things: what it is derived from, how
 * steeply it is rationed by income when it is short, and how much it
 * counts toward a standard of living. The gradient is the important one —
 * a shortage of hospital beds is rationed by waiting, which falls on
 * everybody, while a shortage of housing is rationed by price, which does
 * not.
 */

export type AccessKey =
  | 'healthcare'
  | 'education'
  | 'housing'
  | 'transport'
  | 'internet'
  | 'food'
  | 'energy'
  | 'water'
  | 'safety'
  | 'environment'
  | 'work'
  | 'recreation';

export const ACCESS_KEYS: AccessKey[] = [
  'healthcare',
  'education',
  'housing',
  'transport',
  'internet',
  'food',
  'energy',
  'water',
  'safety',
  'environment',
  'work',
  'recreation',
];

export interface AccessTemplate {
  key: AccessKey;
  label: string;
  /** What it means to have it. Plain, and about the household. */
  blurb: string;
  /**
   * How much this counts toward a standard of living, relative to the
   * others. Food, water and housing are weighted hardest because their
   * absence is not an inconvenience.
   */
  weight: number;
  /**
   * How steeply the shortage is rationed by money, 0–1.
   *
   * High means price does the rationing, so the bottom loses access long
   * before the top notices anything is short — housing and energy. Low
   * means it is rationed by queue or by geography, which falls on
   * everybody roughly alike — hospital waits, clean air.
   */
  gradient: number;
  /**
   * How much of this domain is about somewhere rather than someone.
   *
   * High means where you live decides it — transport, internet, work.
   * These are the domains that produce regional politics, because a
   * national average conceals them completely.
   */
  geography: number;
}

export const ACCESS_TEMPLATES: AccessTemplate[] = [
  {
    key: 'healthcare',
    label: 'Healthcare',
    blurb: 'Being seen, and being seen in time for it to matter.',
    weight: 1.35,
    gradient: 0.3,
    geography: 0.45,
  },
  {
    key: 'education',
    label: 'Education',
    blurb: 'A school place worth having, and somewhere to go after it.',
    weight: 1.15,
    gradient: 0.45,
    geography: 0.5,
  },
  {
    key: 'housing',
    label: 'Housing',
    blurb: 'Somewhere secure to live, at a price that leaves something over.',
    weight: 1.5,
    gradient: 0.85,
    geography: 0.6,
  },
  {
    key: 'transport',
    label: 'Transport',
    blurb: 'Being able to reach work, family and a hospital without owning a car.',
    weight: 0.95,
    gradient: 0.4,
    geography: 0.85,
  },
  {
    key: 'internet',
    label: 'Connection',
    blurb: 'A connection good enough to work, learn and deal with the state over.',
    weight: 0.8,
    gradient: 0.5,
    geography: 0.75,
  },
  {
    key: 'food',
    label: 'Food',
    blurb: 'Enough of it, reliably, without deciding between it and the heating.',
    weight: 1.45,
    gradient: 0.8,
    geography: 0.25,
  },
  {
    key: 'energy',
    label: 'Energy',
    blurb: 'A house warm enough to live in at a price that can be paid.',
    weight: 1.3,
    gradient: 0.8,
    geography: 0.3,
  },
  {
    key: 'water',
    label: 'Water',
    blurb: 'Clean, and out of the tap, which is invisible until it is not.',
    weight: 1.25,
    gradient: 0.15,
    geography: 0.5,
  },
  {
    key: 'safety',
    label: 'Safety',
    blurb: 'Being able to walk home, and being believed if something happens.',
    weight: 1.2,
    gradient: 0.55,
    geography: 0.7,
  },
  {
    key: 'environment',
    label: 'Environment',
    blurb: 'Air worth breathing and somewhere green within reach of it.',
    weight: 0.85,
    gradient: 0.5,
    geography: 0.8,
  },
  {
    key: 'work',
    label: 'Work',
    blurb: 'A job that exists where you live and pays enough to live on.',
    weight: 1.4,
    gradient: 0.35,
    geography: 0.9,
  },
  {
    key: 'recreation',
    label: 'Somewhere to go',
    blurb: 'Libraries, pitches, pools and parks — the things cut first and missed longest.',
    weight: 0.6,
    gradient: 0.45,
    geography: 0.65,
  },
];

export function findAccess(key: AccessKey): AccessTemplate {
  const found = ACCESS_TEMPLATES.find((a) => a.key === key);
  if (!found) throw new Error(`access: unknown domain ${key}`);
  return found;
}
