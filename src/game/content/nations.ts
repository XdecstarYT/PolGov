/**
 * nations.ts — the twelve countries that are not yours.
 *
 * Every one is invented, as Verdana is. None of them is a stand-in for a
 * real state, and none of the arrangements between them maps onto a real
 * alliance, dispute or war. That is not squeamishness: a game that let a
 * player rehearse a real conflict with real names would be making an
 * argument about that conflict whether it meant to or not, and this game
 * makes no arguments. What it models is the SHAPE of international
 * relations — that power is unevenly distributed, that trade and security
 * pull in different directions, that a neighbour's domestic politics is
 * your problem — and those shapes are general.
 *
 * Each nation carries the handful of attributes everything else reads:
 *
 *   power      relative weight in the world. A large neighbour's opinion
 *              costs more to ignore than a small one's, and the whole
 *              asymmetry of diplomacy falls out of this one number.
 *   ideology   the same three axes the domestic parties use, so a
 *              government's own position makes some partners natural and
 *              others expensive.
 *   posture    how it behaves — what it wants and how it pursues it.
 *   trade      what it buys and what it sells, wired to the industries of
 *              Engine 2D, so a trade decision is an industrial one.
 *
 * The starting relations are a world already in progress. The player
 * inherits alliances they did not make and quarrels they did not start,
 * because every government does.
 */

import type { Ideology } from '../types.ts';
import { makeIdeology } from '../ideology.ts';
import type { IndustryKey } from './industries.ts';

export type NationKey =
  | 'astrun'
  | 'belhaven'
  | 'corvane'
  | 'dunmarch'
  | 'ehlas'
  | 'fenwick'
  | 'garda'
  | 'holm'
  | 'iskerry'
  | 'jorvik'
  | 'kestran'
  | 'lorne';

/**
 * How a nation conducts itself.
 *
 * Descriptive rather than evaluative: an assertive state is not a villain
 * and a mercantile one is not a friend. Each posture simply changes which
 * approaches work and what the state will ask for in return.
 */
export type Posture =
  | 'assertive'
  | 'mercantile'
  | 'institutional'
  | 'guarded'
  | 'aligned'
  | 'volatile';

export type NationBloc = 'northern' | 'meridian' | 'southern' | 'unaligned';

export interface NationTemplate {
  key: NationKey;
  name: string;
  /** Adjective form, for prose. */
  demonym: string;
  blurb: string;
  bloc: NationBloc;
  posture: Posture;
  /** Relative weight in the world, roughly 0.2 to 3. Verdana is 1. */
  power: number;
  /** Economy size relative to Verdana's. */
  economy: number;
  /** Where it sits on the same three axes the domestic parties use. */
  ideology: Ideology;
  /** Whether the two countries share a border. Neighbours are unavoidable. */
  neighbour: boolean;
  /** Industries it buys from Verdana. */
  buys: IndustryKey[];
  /** Industries it sells to Verdana, and which it therefore competes with. */
  sells: IndustryKey[];
  /** Relations as inherited, −100 hostile to +100 allied. */
  startingRelations: number;
  /** True if the two countries already hold a treaty of some kind. */
  inheritedTreaty?: 'trade' | 'defence' | 'non_aggression' | 'partnership';
}

export const NATION_TEMPLATES: NationTemplate[] = [
  {
    key: 'astrun',
    name: 'Astrun',
    demonym: 'Astrunic',
    blurb:
      'The largest economy on the continent and the one that sets the terms. Polite about it, and immovable.',
    bloc: 'northern',
    posture: 'assertive',
    power: 2.8,
    economy: 3.1,
    ideology: makeIdeology(0.55, -0.1, -0.2),
    neighbour: false,
    buys: ['mining', 'agriculture', 'energy'],
    sells: ['manufacturing', 'technology', 'finance'],
    startingRelations: 25,
    inheritedTreaty: 'trade',
  },
  {
    key: 'belhaven',
    name: 'Belhaven',
    demonym: 'Belhavener',
    blurb:
      'Across the strait, and on the telephone about something most weeks. Half the trade and all of the friction.',
    bloc: 'northern',
    posture: 'mercantile',
    power: 1.4,
    economy: 1.6,
    ideology: makeIdeology(0.4, 0.3, 0.1),
    neighbour: true,
    buys: ['manufacturing', 'finance', 'tourism', 'fisheries'],
    sells: ['technology', 'entertainment', 'logistics'],
    startingRelations: 48,
    inheritedTreaty: 'trade',
  },
  {
    key: 'corvane',
    name: 'Corvane',
    demonym: 'Corvanish',
    blurb:
      'Shares the northern land border and most of the watershed. Every argument about water is really about something else.',
    bloc: 'unaligned',
    posture: 'guarded',
    power: 0.9,
    economy: 0.7,
    ideology: makeIdeology(-0.35, -0.4, 0.15),
    neighbour: true,
    buys: ['agriculture', 'transport', 'healthcare'],
    sells: ['mining', 'forestry', 'energy'],
    startingRelations: -12,
  },
  {
    key: 'dunmarch',
    name: 'Dunmarch',
    demonym: 'Dunmarcher',
    blurb:
      'Small, wealthy, institutional, and on every committee that matters. Punches far above its weight in rooms.',
    bloc: 'northern',
    posture: 'institutional',
    power: 0.6,
    economy: 0.9,
    ideology: makeIdeology(0.1, 0.65, 0.6),
    neighbour: false,
    buys: ['technology', 'research', 'finance'],
    sells: ['finance', 'research', 'healthcare'],
    startingRelations: 55,
    inheritedTreaty: 'partnership',
  },
  {
    key: 'ehlas',
    name: 'Ehlas',
    demonym: 'Ehlan',
    blurb:
      'The old rival to the south. Two centuries of quarrels, none of them currently active, all of them remembered.',
    bloc: 'southern',
    posture: 'assertive',
    power: 1.9,
    economy: 1.7,
    ideology: makeIdeology(-0.2, -0.55, -0.3),
    neighbour: true,
    buys: ['energy', 'defence'],
    sells: ['agriculture', 'manufacturing', 'mining'],
    startingRelations: -34,
  },
  {
    key: 'fenwick',
    name: 'Fenwick',
    demonym: 'Fenwick',
    blurb:
      'A federation of islands with a merchant fleet out of all proportion to its population.',
    bloc: 'unaligned',
    posture: 'mercantile',
    power: 0.5,
    economy: 0.6,
    ideology: makeIdeology(0.6, 0.35, 0.05),
    neighbour: false,
    buys: ['fisheries', 'logistics', 'tourism'],
    sells: ['logistics', 'transport'],
    startingRelations: 18,
  },
  {
    key: 'garda',
    name: 'Garda',
    demonym: 'Gardan',
    blurb:
      'Resource-rich, institutionally thin, and courted by everyone for the same reason.',
    bloc: 'southern',
    posture: 'volatile',
    power: 0.8,
    economy: 0.5,
    ideology: makeIdeology(-0.5, -0.2, -0.45),
    neighbour: false,
    buys: ['healthcare', 'education', 'construction'],
    sells: ['mining', 'energy', 'agriculture'],
    startingRelations: 4,
  },
  {
    key: 'holm',
    name: 'Holm',
    demonym: 'Holmish',
    blurb:
      'Cold, small, and entirely dependent on the shipping lanes it sits beside. Aligned by geography rather than by choice.',
    bloc: 'northern',
    posture: 'aligned',
    power: 0.4,
    economy: 0.4,
    ideology: makeIdeology(0.15, 0.4, 0.5),
    neighbour: false,
    buys: ['manufacturing', 'energy', 'healthcare'],
    sells: ['fisheries', 'renewables' as IndustryKey],
    startingRelations: 62,
    inheritedTreaty: 'defence',
  },
  {
    key: 'iskerry',
    name: 'Iskerry',
    demonym: 'Iskerran',
    blurb:
      'Newly independent, loudly unaligned, and determined to be taken seriously by people who do not.',
    bloc: 'unaligned',
    posture: 'volatile',
    power: 0.35,
    economy: 0.3,
    ideology: makeIdeology(-0.6, 0.2, 0.3),
    neighbour: false,
    buys: ['education', 'construction', 'telecoms'],
    sells: ['agriculture', 'tourism'],
    startingRelations: -6,
  },
  {
    key: 'jorvik',
    name: 'Jorvik',
    demonym: 'Jorvish',
    blurb:
      'A parliamentary republic with an unusually long memory and an unusually short patience for lectures.',
    bloc: 'meridian',
    posture: 'institutional',
    power: 1.1,
    economy: 1.2,
    ideology: makeIdeology(-0.15, 0.5, 0.45),
    neighbour: false,
    buys: ['technology', 'research', 'manufacturing'],
    sells: ['manufacturing', 'education', 'entertainment'],
    startingRelations: 33,
  },
  {
    key: 'kestran',
    name: 'Kestran',
    demonym: 'Kestrani',
    blurb:
      'The southern bloc’s industrial centre. Sells to everyone, trusts nobody, and is rarely wrong to.',
    bloc: 'southern',
    posture: 'mercantile',
    power: 1.6,
    economy: 1.9,
    ideology: makeIdeology(0.7, -0.3, -0.5),
    neighbour: false,
    buys: ['mining', 'energy', 'agriculture'],
    sells: ['manufacturing', 'logistics', 'construction'],
    startingRelations: -8,
  },
  {
    key: 'lorne',
    name: 'Lorne',
    demonym: 'Lornish',
    blurb:
      'The near neighbour nobody worries about, which is exactly why the border commission has met forty times.',
    bloc: 'meridian',
    posture: 'guarded',
    power: 0.55,
    economy: 0.45,
    ideology: makeIdeology(-0.25, -0.15, 0.2),
    neighbour: true,
    buys: ['transport', 'retail', 'construction'],
    sells: ['agriculture', 'forestry', 'fisheries'],
    startingRelations: 21,
    inheritedTreaty: 'non_aggression',
  },
];

export function findNation(key: NationKey): NationTemplate {
  const found = NATION_TEMPLATES.find((n) => n.key === key);
  if (!found) throw new Error(`nations: unknown nation ${key}`);
  return found;
}

export const BLOC_LABELS: Record<NationBloc, string> = {
  northern: 'Northern bloc',
  meridian: 'Meridian group',
  southern: 'Southern bloc',
  unaligned: 'Unaligned',
};

export const POSTURE_LABELS: Record<Posture, string> = {
  assertive: 'Assertive',
  mercantile: 'Mercantile',
  institutional: 'Institutional',
  guarded: 'Guarded',
  aligned: 'Aligned',
  volatile: 'Volatile',
};
