/**
 * derive.ts — the relational half of the world.
 *
 * `countries.ts` holds what is true about a country regardless of who is
 * reading: its output, its people, what it sells, who it borders. This file
 * holds everything that is only true from somewhere — who counts as a
 * neighbour, who trades with whom, who starts out warm — because the player
 * picks which country they govern and every relationship has to be readable
 * from either end.
 *
 * That is the whole reason the world is a table rather than a list of
 * twelve foreigners. A game where the relational facts were stored against
 * each country would have had to pick a vantage point when it was written,
 * and then only one country could ever be played from.
 */

import {
  COUNTRY_TEMPLATES,
  findCountry,
  type CountryKey,
  type CountryTemplate,
  type InstitutionKey,
} from './countries.ts';
import type { IndustryKey } from '../industries.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Weight
 * ------------------------------------------------------------------ */

/**
 * How much a country's opinion costs to ignore.
 *
 * Output first, because everything else follows from it, but not output
 * alone: a large poor country has weight its income does not explain, and a
 * small country that spends heavily on defence has weight its size does
 * not. A permanent seat and a deterrent are each worth a great deal on
 * their own, which is exactly why both are so hard to give up.
 *
 * The scale is absolute rather than relative to the player, so that two
 * foreign countries can be compared without reference to a third.
 */
export function powerOf(country: CountryTemplate): number {
  const output = Math.sqrt(country.gdp / 3000) * 0.9;
  const people = Math.sqrt(country.population / 70) * 0.35;
  const forces = Math.sqrt((country.gdp * country.defenceShare) / 60) * 0.5;
  const seat = country.veto ? 0.4 : 0;
  const bomb = country.deterrent ? 0.3 : 0;
  return Math.round((output + people + forces + seat + bomb) * 100) / 100;
}

/**
 * Output relative to the player's, which is what trade gravity reads.
 *
 * Kept to four places and floored above zero. Two decimals rounded the
 * smallest economies to nothing when read from the largest capital, and a
 * country with a gravity weight of zero does not trade at all — it simply
 * disappears from half the engine, silently, and only from some capitals.
 */
export function economyOf(country: CountryTemplate, player: CountryTemplate): number {
  const ratio = country.gdp / Math.max(1, player.gdp);
  return Math.max(0.001, Math.round(ratio * 10000) / 10000);
}

/* ------------------------------------------------------------------ *
 * Distance
 * ------------------------------------------------------------------ */

/** Do these two share a land border? Asserted in both directions by a test. */
export function shareBorder(a: CountryKey, b: CountryKey): boolean {
  return findCountry(a).borders.includes(b) || findCountry(b).borders.includes(a);
}

/** Same part of the world, which is most of what "near" means for trade. */
export function sameRegion(a: CountryKey, b: CountryKey): boolean {
  return findCountry(a).region === findCountry(b).region;
}

/* ------------------------------------------------------------------ *
 * Trade
 * ------------------------------------------------------------------ */

/**
 * What they buy from us: what we sell that they need.
 *
 * Derived from the two industry lists rather than stored, so that adding a
 * country to the table wires it into the trade engine without anybody
 * writing a pairing by hand — and so that the answer is the same whichever
 * of the two the player happens to be.
 */
export function buysFrom(them: CountryTemplate, us: CountryTemplate): IndustryKey[] {
  const wanted = them.imports.filter((i) => us.exports.includes(i));
  /* A country with no overlap still trades. It trades less, and in whatever
     the other one is best at, which is the honest fallback. */
  return wanted.length > 0 ? wanted : us.exports.slice(0, 2);
}

/** And what they sell us, which is what our own industries compete with. */
export function sellsTo(them: CountryTemplate, us: CountryTemplate): IndustryKey[] {
  const offered = them.exports.filter((e) => us.imports.includes(e));
  return offered.length > 0 ? offered : them.exports.slice(0, 2);
}

/* ------------------------------------------------------------------ *
 * Disposition
 * ------------------------------------------------------------------ */

/** Institutions both belong to. The strongest predictor of anything. */
export function sharedInstitutions(
  a: CountryTemplate,
  b: CountryTemplate,
): InstitutionKey[] {
  return a.institutions.filter((i) => b.institutions.includes(i));
}

/**
 * Where the relationship starts.
 *
 * Alignment first, because who a country lines up with predicts more than
 * anything else about how it votes and what it signs. Then the institutions
 * both belong to — a shared defence alliance is a different order of thing
 * from a shared trade body, and the table knows which is which. Then
 * geography, which cuts both ways: neighbours trade most and quarrel most.
 * Then how far apart the two countries' politics actually are.
 *
 * Nothing here encodes a view about any real dispute. It encodes that
 * countries in the same alliance start friendly, which is a description of
 * how alliances work rather than a claim about who is right.
 */
export function startingRelations(them: CountryTemplate, us: CountryTemplate): number {
  let relations = 0;

  if (them.alignment === us.alignment && them.alignment !== 'non_aligned') relations += 34;
  else if (
    them.alignment !== 'non_aligned' &&
    us.alignment !== 'non_aligned' &&
    them.alignment !== us.alignment
  ) {
    relations -= 30;
  }

  const shared = sharedInstitutions(them, us);
  if (shared.includes('nato')) relations += 26;
  if (shared.includes('eu')) relations += 22;
  if (shared.includes('g7')) relations += 10;
  if (shared.includes('g20')) relations += 6;
  if (shared.includes('brics')) relations += 14;
  if (shared.includes('asean') || shared.includes('african_union')) relations += 12;
  if (shared.includes('wto')) relations += 4;

  /*
   * Two states with no bloc to answer to have one fewer thing to fall out
   * over. Without this the entire non-aligned world reads as flat — every
   * relationship within a few points of neutral — and a government in
   * Brasília or Delhi has no diplomacy to play, which is the opposite of
   * what those governments actually spend their time on.
   */
  if (them.alignment === 'non_aligned' && us.alignment === 'non_aligned') relations += 14;

  /* Neighbours trade most and quarrel most. Both are true, and the second
     is what makes a border a fact about a relationship rather than a map.
     A region without a border is the good half on its own. */
  if (shareBorder(them.key, us.key)) relations -= 6;
  else if (sameRegion(them.key, us.key)) relations += 14;

  /*
   * What the two economies do for each other.
   *
   * Countries whose industries fit start warmer than countries whose
   * industries compete, and they stay warmer through quarrels that would
   * otherwise end a relationship. It is most of why an energy exporter and
   * a manufacturing importer get on across every other difference there is.
   */
  const complementary =
    them.imports.filter((i) => us.exports.includes(i)).length +
    them.exports.filter((e) => us.imports.includes(e)).length;
  relations += Math.min(3, complementary) * 3;

  const distance =
    Math.abs(them.ideology.economic - us.ideology.economic) +
    Math.abs(them.ideology.social - us.ideology.social);
  relations -= distance * 16;

  /* A state that keeps its options open is warm with nobody and cold with
     nobody, which is the whole strategy. */
  if (them.posture === 'volatile') relations -= 8;
  if (them.posture === 'aligned' && us.alignment === 'western') relations += 10;

  return Math.round(clamp(relations, -85, 80));
}

/**
 * What the two countries already have in writing.
 *
 * Inherited, every time. A new government arrives holding agreements it did
 * not negotiate, which is the position every new government is in.
 */
export function inheritedTreaty(
  them: CountryTemplate,
  us: CountryTemplate,
): 'trade' | 'defence' | 'non_aggression' | 'partnership' | undefined {
  const shared = sharedInstitutions(them, us);
  if (shared.includes('nato')) return 'defence';
  if (shared.includes('eu')) return 'partnership';
  if (shared.includes('g7') || shared.includes('brics')) return 'partnership';
  if (shared.includes('asean') || shared.includes('african_union')) return 'trade';
  if (startingRelations(them, us) > 46) return 'trade';
  if (shareBorder(them.key, us.key)) return 'non_aggression';
  return undefined;
}

/* ------------------------------------------------------------------ *
 * The view from one capital
 * ------------------------------------------------------------------ */

/**
 * Everything a given country needs to know about everybody else.
 *
 * This is the function that makes the world playable from any of its
 * capitals: it takes one country and produces the table the rest of the
 * engine reads, with every relational figure computed from that vantage
 * point rather than from a vantage point chosen when the file was written.
 */
export interface ForeignCountry {
  key: CountryKey;
  power: number;
  economy: number;
  neighbour: boolean;
  buys: IndustryKey[];
  sells: IndustryKey[];
  startingRelations: number;
  inheritedTreaty?: 'trade' | 'defence' | 'non_aggression' | 'partnership';
}

export function worldFrom(player: CountryKey): ForeignCountry[] {
  const us = findCountry(player);

  return COUNTRY_TEMPLATES.filter((c) => c.key !== player && c.region !== 'nowhere').map(
    (them) => ({
      key: them.key,
      power: powerOf(them),
      economy: economyOf(them, us),
      neighbour: shareBorder(them.key, player),
      buys: buysFrom(them, us),
      sells: sellsTo(them, us),
      startingRelations: startingRelations(them, us),
      inheritedTreaty: inheritedTreaty(them, us),
    }),
  );
}

/**
 * How far apart two countries the player is not are.
 *
 * Used by the world simulation, which has to decide what Brazil thinks of
 * Japan without either of them being the player. Same machinery, no vantage
 * point at all.
 */
export function betweenThem(a: CountryKey, b: CountryKey): number {
  return startingRelations(findCountry(a), findCountry(b));
}
