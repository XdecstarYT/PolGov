/**
 * trust.ts — the seven institutions a country has an opinion about.
 *
 * Each is judged on its own performance rather than on the government's,
 * which is the point of separating them: a competent government can
 * preside over a collapse in trust in the courts and be surprised by it,
 * and a country can loathe its government and still believe in its civil
 * service. Those are different situations and they have different exits.
 *
 * Volatility is how fast each one moves. Trust in a government turns on a
 * week; trust in the courts takes a decade to build and most of one to
 * lose. Weight is how much each matters to whether the country works at
 * all — which is not the same as how much anybody talks about it.
 */

export type TrustKey =
  | 'government'
  | 'parliament'
  | 'courts'
  | 'police'
  | 'media'
  | 'business'
  | 'civil_service';

export const TRUST_KEYS: TrustKey[] = [
  'government',
  'parliament',
  'courts',
  'police',
  'media',
  'business',
  'civil_service',
];

export interface TrustTemplate {
  key: TrustKey;
  label: string;
  blurb: string;
  /** Where an ordinary country sits, 0–100. */
  opening: number;
  /** How fast it moves, as a multiplier on the base rate. */
  volatility: number;
  /** How much it matters to whether the country functions. */
  weight: number;
}

export const TRUST_TEMPLATES: TrustTemplate[] = [
  {
    key: 'government',
    label: 'The government',
    blurb: 'Whether the people in charge are competent and even-handed. Turns on a week.',
    opening: 48,
    volatility: 2.4,
    weight: 1.1,
  },
  {
    key: 'parliament',
    label: 'Parliament',
    blurb: 'Whether the chamber is a functioning one, which is not the same as agreeing with it.',
    opening: 44,
    volatility: 1.2,
    weight: 1.2,
  },
  {
    key: 'courts',
    label: 'The courts',
    blurb: 'A decade to build and most of one to lose. Nothing else replaces it.',
    opening: 62,
    volatility: 0.55,
    weight: 1.5,
  },
  {
    key: 'police',
    label: 'The police',
    blurb: 'Whether you would call them, and whether you would be believed.',
    opening: 58,
    volatility: 0.9,
    weight: 1.2,
  },
  {
    key: 'media',
    label: 'The press',
    blurb: 'Whether what circulates is true. Distrusted at speed and restored very slowly.',
    opening: 42,
    volatility: 1.1,
    weight: 1.0,
  },
  {
    key: 'business',
    label: 'Business',
    blurb: 'Whether the people doing well are doing well fairly.',
    opening: 46,
    volatility: 1.0,
    weight: 0.8,
  },
  {
    key: 'civil_service',
    label: 'The civil service',
    blurb: 'Whether the machinery works whoever is in charge of it. Quietly the load-bearing one.',
    opening: 56,
    volatility: 0.7,
    weight: 1.3,
  },
];

export function findTrust(key: TrustKey): TrustTemplate {
  const found = TRUST_TEMPLATES.find((t) => t.key === key);
  if (!found) throw new Error(`trust: unknown institution ${key}`);
  return found;
}
