/**
 * nations.ts — the world, seen from wherever the player happens to be.
 *
 * This used to be twelve invented countries with their relationships to one
 * fixed capital written into the table. It is now an adapter over
 * `world/countries.ts`, which holds real modern states, and
 * `world/derive.ts`, which works out the relational half from whichever
 * country the player is governing.
 *
 * The split matters. What is true about a country regardless of who is
 * asking — its output, its people, what it sells, who it borders, which
 * institutions it belongs to — lives in the table and is read the same way
 * by everybody. What is only true from somewhere — who is a neighbour, who
 * trades with whom, who starts warm — is computed per run and stored in the
 * game state, because the player picks which capital they are sitting in
 * and every relationship has to read correctly from either end.
 *
 * On what is deliberately absent: there are no named living politicians
 * anywhere in this file or downstream of it. Offices, not people. That is
 * partly because putting invented words in a real, named, living person's
 * mouth is a different thing from modelling a country, and partly for a
 * plainer reason — a run lasts sixteen years, incumbents last four, and a
 * game pinned to whoever held office the week it was written is wrong by
 * its second year.
 */

import {
  ALIGNMENT_LABELS,
  COUNTRY_TEMPLATES,
  INSTITUTION_LABELS,
  POSTURE_LABELS,
  REGION_LABELS,
  findCountry,
  playableCountries,
  type Alignment,
  type CountryKey,
  type CountryTemplate,
  type InstitutionKey,
  type Posture,
  type WorldRegion,
} from './world/countries.ts';
import {
  betweenThem,
  buysFrom,
  economyOf,
  inheritedTreaty,
  powerOf,
  sameRegion,
  sellsTo,
  shareBorder,
  startingRelations,
  worldFrom,
  type ForeignCountry,
} from './world/derive.ts';
import type { IndustryKey } from './industries.ts';
import type { Ideology } from '../types.ts';

export type NationKey = CountryKey;
export type NationBloc = Alignment;
export type { Posture };

/**
 * What every system reads about a country.
 *
 * Everything here is absolute — true of the country whoever is looking at
 * it. The relational figures a previous version kept alongside these have
 * moved into `NationState`, where they belong, because they depend on which
 * capital the question is being asked from.
 */
export interface NationTemplate {
  key: NationKey;
  name: string;
  demonym: string;
  blurb: string;
  region: WorldRegion;
  bloc: NationBloc;
  posture: Posture;
  /** Weight in the world, on an absolute scale. Roughly 0.4 to 6. */
  power: number;
  /** Nominal output, USD bn, mid-2020s and approximate. */
  gdp: number;
  /** Population, millions. */
  population: number;
  ideology: Ideology;
  /** What it mainly sells and buys, in the industry vocabulary. */
  exports: IndustryKey[];
  imports: IndustryKey[];
  institutions: InstitutionKey[];
  veto: boolean;
  deterrent: boolean;
}

function adapt(country: CountryTemplate): NationTemplate {
  return {
    key: country.key,
    name: country.name,
    demonym: country.demonym,
    blurb: country.blurb,
    region: country.region,
    bloc: country.alignment,
    posture: country.posture,
    power: powerOf(country),
    gdp: country.gdp,
    population: country.population,
    ideology: country.ideology,
    exports: country.exports,
    imports: country.imports,
    institutions: country.institutions,
    veto: Boolean(country.veto),
    deterrent: Boolean(country.deterrent),
  };
}

/**
 * Every state in the world, the invented one included.
 *
 * Read by anything that needs a name, a weight or a disposition. Anything
 * that needs a RELATIONSHIP reads the game state instead, because a
 * relationship has two ends and this list has none.
 */
export const NATION_TEMPLATES: NationTemplate[] = COUNTRY_TEMPLATES.map(adapt);

export function findNation(key: NationKey): NationTemplate {
  const found = NATION_TEMPLATES.find((n) => n.key === key);
  if (!found) throw new Error(`nations: unknown country ${key}`);
  return found;
}

/** Everybody except the country being governed. */
export function foreignNations(player: NationKey): NationTemplate[] {
  return NATION_TEMPLATES.filter((n) => n.key !== player && n.region !== 'nowhere');
}

/**
 * The alignment labels under the name the rest of the engine knows them by.
 *
 * "Bloc" is what this game has always called the question of who a country
 * lines up with, and the real-world table calls it alignment. Same thing,
 * one alias, rather than a rename that would touch every panel.
 */
export const BLOC_LABELS = ALIGNMENT_LABELS;

export {
  ALIGNMENT_LABELS,
  POSTURE_LABELS,
  COUNTRY_TEMPLATES,
  INSTITUTION_LABELS,
  REGION_LABELS,
  betweenThem,
  buysFrom,
  economyOf,
  findCountry,
  inheritedTreaty,
  playableCountries,
  powerOf,
  sameRegion,
  sellsTo,
  shareBorder,
  startingRelations,
  worldFrom,
};
export type { CountryKey, CountryTemplate, ForeignCountry, InstitutionKey, WorldRegion };
