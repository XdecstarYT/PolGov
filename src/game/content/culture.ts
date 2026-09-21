/**
 * culture.ts — the things a country has that no government bought.
 *
 * A deliberate limit first, because it governs the whole file.
 *
 * This engine models the STRUCTURE of a plural society and never its
 * membership. It knows how many distinct communities a country has, how
 * concentrated they are, how far the state recognises them and how much
 * they feel part of the place. It does not know, and will never be told,
 * who any of them are. No real ethnic group, religion, language or
 * national minority is named anywhere in this game, and none is given
 * attributes.
 *
 * That is not squeamishness. It is that the mechanic worth having is
 * structural — a state that recognises its communities holds together
 * better than one that does not, and that is true independent of who the
 * communities are — while the alternative would require the game to
 * assert things about real people, which it has no business doing and no
 * way of getting right.
 *
 * So communities here are positions in a distribution, exactly as the
 * income bands are: "the largest language community", "a second
 * community", "smaller communities". A player governing a real country
 * gets the right number of them at the right sizes, and everything else
 * is theirs to imagine.
 *
 * The institutions are the other half. Museums, orchestras, film,
 * publishing, sport, heritage: cheap, slow, invisible when they work, and
 * the first line cut in every budget in history. They are modelled
 * because a country that stops funding them does not notice for a decade
 * and then cannot get them back.
 */

export type CulturalInstitutionKey =
  | 'museums'
  | 'arts'
  | 'music'
  | 'film'
  | 'literature'
  | 'sport'
  | 'heritage'
  | 'libraries';

export const CULTURAL_INSTITUTION_KEYS: CulturalInstitutionKey[] = [
  'museums',
  'arts',
  'music',
  'film',
  'literature',
  'sport',
  'heritage',
  'libraries',
];

export interface CulturalInstitutionTemplate {
  key: CulturalInstitutionKey;
  label: string;
  blurb: string;
  /** Share of the cultural line it takes at the opening settlement, 0–1. */
  share: number;
  /**
   * How much of the country it touches when properly funded, 0–1.
   *
   * Sport reaches nearly everybody and opera reaches very few, which is
   * the entire argument about arts funding and is stated here as a number
   * rather than settled.
   */
  reach: number;
  /**
   * How fast it decays when the money stops, per year.
   *
   * Buildings hold on; companies, orchestras and craft skills do not. A
   * disbanded ensemble is not re-formed by restoring its grant, which is
   * why this is slow in one direction and slower in the other.
   */
  fragility: number;
  /** How much it does for a shared national story when it is working. */
  identity: number;
  /** And how much it does for how the country is seen from outside. */
  standing: number;
}

export const CULTURAL_INSTITUTION_TEMPLATES: CulturalInstitutionTemplate[] = [
  {
    key: 'museums',
    label: 'Museums and galleries',
    blurb: 'Free at the door, mostly empty on a Tuesday, and the first thing every visitor sees.',
    share: 0.16,
    reach: 0.38,
    fragility: 0.05,
    identity: 0.9,
    standing: 1.1,
  },
  {
    key: 'arts',
    label: 'Theatre and the arts',
    blurb: 'Companies, venues and the people who trained for a decade to work in them.',
    share: 0.15,
    reach: 0.22,
    fragility: 0.16,
    identity: 0.7,
    standing: 1.0,
  },
  {
    key: 'music',
    label: 'Music',
    blurb: 'Orchestras, venues, and the teaching that decides whether there are any in twenty years.',
    share: 0.12,
    reach: 0.45,
    fragility: 0.15,
    identity: 0.8,
    standing: 1.2,
  },
  {
    key: 'film',
    label: 'Film and television',
    blurb: 'The most expensive way a country explains itself to anybody, and the most watched.',
    share: 0.14,
    reach: 0.72,
    fragility: 0.12,
    identity: 1.2,
    standing: 1.5,
  },
  {
    key: 'literature',
    label: 'Writing and publishing',
    blurb: 'Almost free to support and almost impossible to point at the result of.',
    share: 0.07,
    reach: 0.3,
    fragility: 0.09,
    identity: 1.0,
    standing: 1.1,
  },
  {
    key: 'sport',
    label: 'Sport',
    blurb: 'Pitches, pools and clubs. The cultural institution most people actually use.',
    share: 0.18,
    reach: 0.78,
    fragility: 0.11,
    identity: 1.4,
    standing: 1.0,
  },
  {
    key: 'heritage',
    label: 'Heritage',
    blurb: 'Buildings, sites and archives, which survive neglect for a long time and then do not.',
    share: 0.1,
    reach: 0.34,
    fragility: 0.04,
    identity: 1.1,
    standing: 0.9,
  },
  {
    key: 'libraries',
    label: 'Libraries',
    blurb: 'The cheapest thing on this list and the one whose closure is noticed in a specific street.',
    share: 0.08,
    reach: 0.52,
    fragility: 0.13,
    identity: 0.8,
    standing: 0.4,
  },
];

export function findCulturalInstitution(key: CulturalInstitutionKey): CulturalInstitutionTemplate {
  const found = CULTURAL_INSTITUTION_TEMPLATES.find((i) => i.key === key);
  if (!found) throw new Error(`culture: unknown institution ${key}`);
  return found;
}

/**
 * The shape of a country's cultural composition.
 *
 * Sizes only. How many communities there are and how large each is —
 * never who they are. A country with one community at 92% is a different
 * place to govern from one with a largest community at 38%, and that
 * difference is available to the engine without naming anybody.
 */
export interface CompositionProfile {
  /** Shares of the population, largest first. Normalised at build. */
  shares: number[];
  /**
   * How far the largest community's language and customs are the
   * default in public life, 0–1. High is a country where one community's
   * arrangements simply are the national arrangements.
   */
  majorityDefault: number;
}

/** Ordinal labels. Structural positions, deliberately not identities. */
export const COMMUNITY_LABELS = [
  'The largest community',
  'The second community',
  'The third community',
  'Smaller communities',
  'Everyone else',
];
