/**
 * politics.ts — what a real country's politics is shaped like.
 *
 * This is the second half of making the world playable. `countries.ts` says
 * how big a country is and what it sells; this says how it is governed —
 * how votes become seats, what the chamber and the head of government are
 * called, which parts of the country vote differently from each other, and
 * how many parties a government has to negotiate with.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT
 *
 * The electoral system is real: Germany elects a Bundestag by mixed-member
 * proportional representation and Australia elects its House by preferential
 * ballot, and a game that had them both electing by the same method would be
 * modelling neither. The chamber's name is real. The head of government's
 * TITLE is real — Chancellor, Taoiseach, President of the Council — because
 * a title is an office and offices outlast the people in them. The regions
 * are real first-level divisions with roughly real population shares.
 *
 * The PARTIES are not real and never will be. A country's party system has
 * a shape — how fragmented it is, which political families have a real
 * presence, how far apart they sit — and that shape is what the game
 * inherits. The parties that fill it are invented, and so are the people in
 * them. Putting a real party's name on a set of invented positions, and
 * then having invented politicians say invented things under it, would be a
 * different and much worse project than this one.
 *
 * WHY ONLY SOME COUNTRIES
 *
 * The engine models a chamber, a government drawn from that chamber, and a
 * head of government who falls when the chamber withdraws confidence. That
 * is parliamentary government. It is not how a presidential republic works,
 * and a version of the United States where the President could be brought
 * down by a bad week in Congress would be teaching something false. So the
 * playable list is the parliamentary democracies, and the presidential ones
 * are in the world without being in the chair.
 */

import type { Ideology } from '../../types.ts';
import { makeIdeology } from '../../ideology.ts';
import type { SegmentKey } from '../segments.ts';
import type { ElectoralSystem } from '../../systems/electoralSystems.ts';
import type { CountryKey } from './countries.ts';

/* ------------------------------------------------------------------ *
 * The kinds of place a country is made of
 * ------------------------------------------------------------------ */

/**
 * Nine kinds of electorate.
 *
 * Writing a segment mix by hand for every region of every country would be
 * a hundred and thirty tables nobody could keep consistent. These are the
 * recurring kinds of place instead: a port city votes like a port city in
 * any country, and what differs between two of them is the lean the profile
 * gives each one, which is where the national character actually lives.
 */
export type RegionKind =
  | 'capital'
  | 'metropolitan'
  | 'industrial'
  | 'post_industrial'
  | 'coastal'
  | 'agrarian'
  | 'suburban'
  | 'resource'
  | 'university';

export const REGION_KIND_LABELS: Record<RegionKind, string> = {
  capital: 'Capital region',
  metropolitan: 'Metropolitan',
  industrial: 'Industrial',
  post_industrial: 'Post-industrial',
  coastal: 'Coastal',
  agrarian: 'Agricultural',
  suburban: 'Suburban',
  resource: 'Resource',
  university: 'University towns',
};

export const REGION_KIND_CHARACTER: Record<RegionKind, string> = {
  capital:
    'Government, and everybody who sells to it. Graduate, well paid, and convinced it understands the rest of the country.',
  metropolitan:
    'Dense, young and mobile. Quick to punish complacency and quicker to move on.',
  industrial:
    'Heavy industry and the unions that came with it. Used to being courted, and counting.',
  post_industrial:
    'The works closed a generation ago and nothing replaced it. Every government since has promised something.',
  coastal:
    'Ports, fishing, tourism and retirement. Three economies that want different things from the same coastline.',
  agrarian:
    'Farms, small towns and long distances. Sceptical of anything decided somewhere else.',
  suburban:
    'Mortgages, schools and commuting. The seats that decide elections because they are the ones that move.',
  resource:
    'Extraction, and the wages that come with it. Prosperous, exposed, and not interested in a transition it did not ask for.',
  university:
    'Campuses and the towns that grew around them. Young, transient, and heavily over-polled.',
};

/**
 * Who lives in each kind of place, as relative weights.
 *
 * The segments overlap on purpose — a graduate may also be a young renter —
 * so these are weights on a shared electorate rather than exclusive shares
 * of it. A region's politics is emergent from the mix.
 */
export const REGION_KIND_COMPOSITION: Record<RegionKind, Partial<Record<SegmentKey, number>>> = {
  capital: {
    graduates: 24,
    professionals: 22,
    public_sector: 20,
    young_renters: 16,
    newcomers: 14,
    high_income: 12,
    students: 10,
    homeowners: 8,
    low_income: 8,
    retirees: 6,
  },
  metropolitan: {
    young_renters: 22,
    graduates: 20,
    newcomers: 18,
    professionals: 15,
    students: 14,
    low_income: 13,
    small_traders: 10,
    public_sector: 9,
    non_graduates: 9,
    homeowners: 6,
  },
  industrial: {
    industrial_workers: 26,
    union_members: 21,
    non_graduates: 19,
    low_income: 16,
    suburban_families: 12,
    public_sector: 9,
    homeowners: 8,
    retirees: 9,
    young_renters: 7,
    newcomers: 6,
  },
  post_industrial: {
    non_graduates: 24,
    low_income: 20,
    retirees: 18,
    industrial_workers: 15,
    union_members: 11,
    homeowners: 10,
    suburban_families: 9,
    faith_communities: 8,
    small_traders: 7,
    young_renters: 5,
  },
  coastal: {
    coastal_trades: 22,
    retirees: 19,
    small_traders: 16,
    non_graduates: 15,
    homeowners: 12,
    low_income: 11,
    rural_households: 9,
    suburban_families: 8,
    faith_communities: 6,
    students: 5,
  },
  agrarian: {
    farmers: 24,
    rural_households: 22,
    non_graduates: 17,
    faith_communities: 15,
    homeowners: 13,
    retirees: 12,
    small_traders: 10,
    business_owners: 7,
    low_income: 7,
    suburban_families: 6,
  },
  suburban: {
    suburban_families: 24,
    homeowners: 21,
    professionals: 15,
    retirees: 13,
    graduates: 12,
    non_graduates: 11,
    high_income: 10,
    small_traders: 8,
    public_sector: 7,
    young_renters: 6,
  },
  resource: {
    industrial_workers: 21,
    business_owners: 16,
    rural_households: 15,
    high_income: 13,
    non_graduates: 13,
    homeowners: 11,
    union_members: 10,
    newcomers: 8,
    low_income: 7,
    farmers: 6,
  },
  university: {
    students: 24,
    graduates: 20,
    young_renters: 18,
    public_sector: 13,
    professionals: 11,
    low_income: 10,
    newcomers: 9,
    non_graduates: 8,
    small_traders: 7,
    homeowners: 6,
  },
};

/* ------------------------------------------------------------------ *
 * A region of a real country
 * ------------------------------------------------------------------ */

export interface RegionProfile {
  id: string;
  /** A real first-level division, or a real grouping of them. */
  name: string;
  kind: RegionKind;
  /** Share of the country's population, roughly. Normalised at build time. */
  share: number;
  /**
   * How this part of the country votes relative to the national centre.
   *
   * Offsets rather than absolutes, so that a country's own centre of
   * gravity moves all of its regions together and the internal spread —
   * which is what the campaign map is actually about — survives.
   */
  lean: Ideology;
}

/* ------------------------------------------------------------------ *
 * The political families
 * ------------------------------------------------------------------ */

/**
 * The recurring kinds of party.
 *
 * Not a list of real parties: a list of the positions that parties in
 * parliamentary democracies tend to occupy. A country profile says which of
 * these have a real presence and how large each one is, and the generator
 * fills them with invented parties whose positions are offset from the
 * country's own centre.
 */
export type PartyFamily =
  | 'social_democratic'
  | 'conservative'
  | 'liberal'
  | 'green'
  | 'left'
  | 'nationalist'
  | 'christian_democratic'
  | 'agrarian'
  | 'regionalist'
  | 'centrist';

export const PARTY_FAMILY_LABELS: Record<PartyFamily, string> = {
  social_democratic: 'Social democratic',
  conservative: 'Conservative',
  liberal: 'Liberal',
  green: 'Green',
  left: 'Left',
  nationalist: 'National',
  christian_democratic: 'Christian democratic',
  agrarian: 'Agrarian',
  regionalist: 'Regionalist',
  centrist: 'Centrist',
};

/* ------------------------------------------------------------------ *
 * The profile
 * ------------------------------------------------------------------ */

export interface PoliticsProfile {
  key: CountryKey;
  /** What the chamber the government answers to is actually called. */
  chamber: string;
  /** The office, never the person. Titles outlast incumbents; people do not. */
  headOfGovernment: string;
  /** How votes become seats, as this country actually does it. */
  electoralSystem: ElectoralSystem;
  /**
   * Where the country's politics sits, as a whole.
   *
   * Every party's position is this plus the family's offset, which is why
   * a conservative party in Sweden and a conservative party in Poland are
   * both conservative and are not in the same place.
   */
  centre: Ideology;
  /**
   * How far apart the parties sit, as a multiplier on the family offsets.
   *
   * A country where politics is fought over a narrow range and a country
   * where it is not are different games: the first is about competence and
   * the second is about whether a coalition can exist at all.
   */
  polarisation: number;
  /** Which families have a real presence, largest first, with their weight. */
  families: { family: PartyFamily; weight: number }[];
  regions: RegionProfile[];
  /** One line on what governing here is like. */
  blurb: string;
}

const lean = makeIdeology;

export const POLITICS_PROFILES: PoliticsProfile[] = [
  {
    key: 'united_kingdom',
    chamber: 'House of Commons',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'fptp',
    centre: lean(0.05, 0.05, 0.05),
    polarisation: 0.9,
    families: [
      { family: 'social_democratic', weight: 1.25 },
      { family: 'conservative', weight: 1.2 },
      { family: 'liberal', weight: 0.55 },
      { family: 'nationalist', weight: 0.45 },
      { family: 'regionalist', weight: 0.4 },
      { family: 'green', weight: 0.3 },
    ],
    regions: [
      { id: 'london', name: 'London', kind: 'capital', share: 13, lean: lean(-0.2, 0.4, 0.2) },
      { id: 'south_east', name: 'South East', kind: 'suburban', share: 14, lean: lean(0.3, -0.05, 0.05) },
      { id: 'north_west', name: 'North West', kind: 'industrial', share: 11, lean: lean(-0.3, 0.1, 0) },
      { id: 'yorkshire', name: 'Yorkshire and the Humber', kind: 'post_industrial', share: 8, lean: lean(-0.15, -0.15, -0.05) },
      { id: 'midlands', name: 'The Midlands', kind: 'industrial', share: 17, lean: lean(-0.05, -0.1, -0.05) },
      { id: 'south_west', name: 'South West', kind: 'coastal', share: 9, lean: lean(0.15, -0.05, 0.15) },
      { id: 'scotland', name: 'Scotland', kind: 'metropolitan', share: 8, lean: lean(-0.3, 0.25, 0.15) },
      { id: 'wales_ni', name: 'Wales and Northern Ireland', kind: 'post_industrial', share: 8, lean: lean(-0.25, 0, 0) },
      { id: 'east', name: 'East of England', kind: 'agrarian', share: 12, lean: lean(0.25, -0.2, -0.05) },
    ],
    blurb:
      'A single-member system that turns a plurality into a majority. Governments here are rarely coalitions and are frequently hostages to forty of their own backbenchers.',
  },
  {
    key: 'germany',
    chamber: 'Bundestag',
    headOfGovernment: 'Chancellor',
    electoralSystem: 'mixed_member',
    centre: lean(-0.05, 0.1, 0.25),
    polarisation: 0.85,
    families: [
      { family: 'christian_democratic', weight: 1.15 },
      { family: 'social_democratic', weight: 1.0 },
      { family: 'green', weight: 0.8 },
      { family: 'nationalist', weight: 0.7 },
      { family: 'liberal', weight: 0.5 },
      { family: 'left', weight: 0.4 },
    ],
    regions: [
      { id: 'nrw', name: 'North Rhine-Westphalia', kind: 'industrial', share: 21, lean: lean(-0.2, 0.05, 0) },
      { id: 'bayern', name: 'Bavaria', kind: 'suburban', share: 16, lean: lean(0.25, -0.25, 0.05) },
      { id: 'bw', name: 'Baden-Württemberg', kind: 'industrial', share: 13, lean: lean(0.1, 0.05, 0.2) },
      { id: 'niedersachsen', name: 'Lower Saxony', kind: 'agrarian', share: 10, lean: lean(-0.05, -0.05, 0.05) },
      { id: 'berlin', name: 'Berlin', kind: 'capital', share: 5, lean: lean(-0.35, 0.45, 0.3) },
      { id: 'ost', name: 'The eastern states', kind: 'post_industrial', share: 16, lean: lean(-0.1, -0.35, -0.1) },
      { id: 'hessen', name: 'Hesse', kind: 'metropolitan', share: 8, lean: lean(0.05, 0.15, 0.1) },
      { id: 'nord', name: 'The northern coast', kind: 'coastal', share: 11, lean: lean(-0.1, 0.1, 0.2) },
    ],
    blurb:
      'Half the chamber elected in seats and half from lists, with a threshold that keeps the very small out. Every government is a coalition and every coalition is a written agreement.',
  },
  {
    key: 'france',
    chamber: 'National Assembly',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'two_round',
    centre: lean(-0.1, 0.05, 0.15),
    polarisation: 1.15,
    families: [
      { family: 'centrist', weight: 1.0 },
      { family: 'nationalist', weight: 1.0 },
      { family: 'left', weight: 0.85 },
      { family: 'conservative', weight: 0.7 },
      { family: 'social_democratic', weight: 0.55 },
      { family: 'green', weight: 0.4 },
    ],
    regions: [
      { id: 'idf', name: 'Île-de-France', kind: 'capital', share: 19, lean: lean(-0.15, 0.3, 0.2) },
      { id: 'aura', name: 'Auvergne-Rhône-Alpes', kind: 'industrial', share: 12, lean: lean(0.1, -0.05, 0.1) },
      { id: 'hdf', name: 'Hauts-de-France', kind: 'post_industrial', share: 9, lean: lean(-0.2, -0.3, -0.1) },
      { id: 'na', name: 'Nouvelle-Aquitaine', kind: 'agrarian', share: 9, lean: lean(-0.05, 0, 0.2) },
      { id: 'occitanie', name: 'Occitanie', kind: 'coastal', share: 9, lean: lean(-0.15, 0.05, 0.15) },
      { id: 'paca', name: "Provence-Alpes-Côte d'Azur", kind: 'coastal', share: 8, lean: lean(0.15, -0.35, 0) },
      { id: 'grand_est', name: 'Grand Est', kind: 'industrial', share: 8, lean: lean(0, -0.2, 0) },
      { id: 'ouest', name: 'Brittany and the Pays de la Loire', kind: 'coastal', share: 12, lean: lean(-0.05, 0.15, 0.2) },
      { id: 'reste', name: 'Normandy, Centre and Burgundy', kind: 'agrarian', share: 14, lean: lean(0, -0.1, 0.05) },
    ],
    blurb:
      'Two rounds a week apart, so the first is a survey of opinion and the second is a referendum on whoever is left. Governments are appointed and can be censured, which makes the arithmetic of the chamber everything.',
  },
  {
    key: 'italy',
    chamber: 'Chamber of Deputies',
    headOfGovernment: 'President of the Council',
    electoralSystem: 'mixed_member',
    centre: lean(0, -0.05, 0.1),
    polarisation: 1.1,
    families: [
      { family: 'conservative', weight: 1.0 },
      { family: 'social_democratic', weight: 0.95 },
      { family: 'nationalist', weight: 0.8 },
      { family: 'centrist', weight: 0.6 },
      { family: 'left', weight: 0.5 },
      { family: 'regionalist', weight: 0.45 },
    ],
    regions: [
      { id: 'lombardia', name: 'Lombardy', kind: 'industrial', share: 17, lean: lean(0.25, -0.05, 0.05) },
      { id: 'lazio', name: 'Lazio', kind: 'capital', share: 10, lean: lean(-0.15, 0.2, 0.1) },
      { id: 'campania', name: 'Campania', kind: 'metropolitan', share: 10, lean: lean(-0.25, -0.05, -0.05) },
      { id: 'veneto', name: 'Veneto', kind: 'industrial', share: 8, lean: lean(0.3, -0.25, 0) },
      { id: 'sicilia', name: 'Sicily', kind: 'coastal', share: 8, lean: lean(-0.15, -0.15, -0.05) },
      { id: 'emilia', name: 'Emilia-Romagna', kind: 'agrarian', share: 8, lean: lean(-0.3, 0.2, 0.2) },
      { id: 'piemonte', name: 'Piedmont', kind: 'post_industrial', share: 7, lean: lean(0.05, -0.05, 0.05) },
      { id: 'sud', name: 'Puglia, Calabria and the south', kind: 'agrarian', share: 15, lean: lean(-0.2, -0.15, -0.05) },
      { id: 'centro', name: 'Tuscany and the centre', kind: 'university', share: 17, lean: lean(-0.2, 0.2, 0.2) },
    ],
    blurb:
      'A chamber that has produced a great many governments and comparatively few changes of direction. Coalitions form before the vote and come apart after it.',
  },
  {
    key: 'spain',
    chamber: 'Congress of Deputies',
    headOfGovernment: 'President of the Government',
    electoralSystem: 'proportional',
    centre: lean(-0.1, 0.15, 0.15),
    polarisation: 1.05,
    families: [
      { family: 'social_democratic', weight: 1.15 },
      { family: 'conservative', weight: 1.1 },
      { family: 'nationalist', weight: 0.6 },
      { family: 'left', weight: 0.55 },
      { family: 'regionalist', weight: 0.6 },
      { family: 'liberal', weight: 0.3 },
    ],
    regions: [
      { id: 'andalucia', name: 'Andalusia', kind: 'agrarian', share: 18, lean: lean(-0.25, 0.05, 0.05) },
      { id: 'madrid', name: 'Madrid', kind: 'capital', share: 14, lean: lean(0.15, 0.15, 0.1) },
      { id: 'cataluna', name: 'Catalonia', kind: 'metropolitan', share: 16, lean: lean(-0.15, 0.3, 0.15) },
      { id: 'valencia', name: 'Valencia', kind: 'coastal', share: 11, lean: lean(-0.05, 0.05, 0.1) },
      { id: 'galicia', name: 'Galicia', kind: 'coastal', share: 6, lean: lean(0.05, -0.1, 0.1) },
      { id: 'euskadi', name: 'The Basque Country and Navarre', kind: 'industrial', share: 6, lean: lean(-0.2, 0.25, 0.15) },
      { id: 'castilla', name: 'Castile and León', kind: 'agrarian', share: 11, lean: lean(0.15, -0.2, 0) },
      { id: 'norte', name: 'Aragon, Asturias and the north', kind: 'post_industrial', share: 18, lean: lean(-0.1, 0, 0.05) },
    ],
    blurb:
      'Proportional by province, which over-represents the emptiest ones. Regional parties hold the balance often enough that a national majority is worth less than it looks.',
  },
  {
    key: 'netherlands',
    chamber: 'House of Representatives',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'proportional',
    centre: lean(0.05, 0.25, 0.2),
    polarisation: 1.0,
    families: [
      { family: 'liberal', weight: 0.9 },
      { family: 'nationalist', weight: 0.85 },
      { family: 'social_democratic', weight: 0.7 },
      { family: 'green', weight: 0.65 },
      { family: 'christian_democratic', weight: 0.6 },
      { family: 'centrist', weight: 0.55 },
      { family: 'agrarian', weight: 0.45 },
    ],
    regions: [
      { id: 'randstad_n', name: 'North Holland', kind: 'metropolitan', share: 17, lean: lean(0, 0.35, 0.2) },
      { id: 'randstad_s', name: 'South Holland', kind: 'capital', share: 22, lean: lean(0.05, 0.2, 0.15) },
      { id: 'utrecht', name: 'Utrecht', kind: 'university', share: 8, lean: lean(0, 0.3, 0.3) },
      { id: 'brabant', name: 'North Brabant', kind: 'industrial', share: 15, lean: lean(0.1, -0.1, 0.05) },
      { id: 'gelderland', name: 'Gelderland and Overijssel', kind: 'agrarian', share: 20, lean: lean(0.1, -0.15, -0.05) },
      { id: 'limburg', name: 'Limburg', kind: 'post_industrial', share: 7, lean: lean(0, -0.25, -0.05) },
      { id: 'noord', name: 'Groningen, Friesland and Drenthe', kind: 'coastal', share: 11, lean: lean(-0.15, 0.05, 0.1) },
    ],
    blurb:
      'A single national district with almost no threshold, so a chamber of fifteen parties is normal and a government of four is a good outcome. Forming one takes months.',
  },
  {
    key: 'sweden',
    chamber: 'Riksdag',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'proportional',
    centre: lean(-0.2, 0.35, 0.4),
    polarisation: 0.85,
    families: [
      { family: 'social_democratic', weight: 1.3 },
      { family: 'nationalist', weight: 0.85 },
      { family: 'conservative', weight: 0.8 },
      { family: 'centrist', weight: 0.5 },
      { family: 'left', weight: 0.45 },
      { family: 'green', weight: 0.4 },
      { family: 'liberal', weight: 0.35 },
    ],
    regions: [
      { id: 'stockholm', name: 'Stockholm County', kind: 'capital', share: 24, lean: lean(0.15, 0.25, 0.15) },
      { id: 'vastra', name: 'Västra Götaland', kind: 'industrial', share: 17, lean: lean(-0.05, 0.05, 0.1) },
      { id: 'skane', name: 'Skåne', kind: 'coastal', share: 14, lean: lean(0, -0.15, 0.05) },
      { id: 'ostergotland', name: 'Östergötland and the east', kind: 'suburban', share: 15, lean: lean(-0.05, 0, 0.05) },
      { id: 'uppsala', name: 'Uppsala', kind: 'university', share: 4, lean: lean(-0.05, 0.25, 0.25) },
      { id: 'norrland', name: 'Norrland', kind: 'resource', share: 12, lean: lean(-0.2, -0.1, -0.1) },
      { id: 'smaland', name: 'Småland and the south', kind: 'agrarian', share: 14, lean: lean(0.05, -0.2, 0) },
    ],
    blurb:
      'A four per cent threshold and two blocs that have stopped adding up. Minority governments are the norm and pass a budget by arrangement rather than by majority.',
  },
  {
    key: 'ireland',
    chamber: 'Dáil Éireann',
    headOfGovernment: 'Taoiseach',
    electoralSystem: 'preferential',
    centre: lean(0, 0.25, 0.2),
    polarisation: 0.8,
    families: [
      { family: 'centrist', weight: 1.0 },
      { family: 'conservative', weight: 0.9 },
      { family: 'left', weight: 0.85 },
      { family: 'social_democratic', weight: 0.5 },
      { family: 'green', weight: 0.4 },
      { family: 'agrarian', weight: 0.35 },
    ],
    regions: [
      { id: 'dublin', name: 'Dublin', kind: 'capital', share: 28, lean: lean(-0.05, 0.35, 0.15) },
      { id: 'leinster', name: 'The rest of Leinster', kind: 'suburban', share: 26, lean: lean(0.05, 0.1, 0.1) },
      { id: 'munster_c', name: 'Cork and Limerick', kind: 'metropolitan', share: 18, lean: lean(0, 0.15, 0.1) },
      { id: 'munster_r', name: 'The rest of Munster', kind: 'agrarian', share: 11, lean: lean(0.05, -0.1, 0.05) },
      { id: 'connacht', name: 'Connacht', kind: 'agrarian', share: 10, lean: lean(0, -0.1, 0.05) },
      { id: 'ulster', name: 'The border counties', kind: 'agrarian', share: 7, lean: lean(-0.15, -0.05, 0) },
    ],
    blurb:
      'Multi-seat constituencies counted by single transferable vote, so candidates of the same party run against each other and a transfer-friendly party outperforms its first preferences.',
  },
  {
    key: 'poland',
    chamber: 'Sejm',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'proportional',
    centre: lean(0.05, -0.2, -0.05),
    polarisation: 1.2,
    families: [
      { family: 'conservative', weight: 1.2 },
      { family: 'liberal', weight: 1.1 },
      { family: 'nationalist', weight: 0.6 },
      { family: 'social_democratic', weight: 0.5 },
      { family: 'agrarian', weight: 0.45 },
      { family: 'christian_democratic', weight: 0.4 },
    ],
    regions: [
      { id: 'mazowieckie', name: 'Masovia', kind: 'capital', share: 14, lean: lean(0.1, 0.25, 0.1) },
      { id: 'slaskie', name: 'Silesia', kind: 'industrial', share: 12, lean: lean(-0.1, 0, 0) },
      { id: 'wielkopolskie', name: 'Greater Poland', kind: 'agrarian', share: 9, lean: lean(0.05, 0.1, 0.05) },
      { id: 'malopolskie', name: 'Lesser Poland', kind: 'suburban', share: 9, lean: lean(0.05, -0.3, -0.05) },
      { id: 'dolnoslaskie', name: 'Lower Silesia', kind: 'post_industrial', share: 8, lean: lean(0, 0.15, 0.05) },
      { id: 'lodzkie', name: 'Łódź', kind: 'post_industrial', share: 6, lean: lean(-0.05, 0.05, 0) },
      { id: 'wschod', name: 'The eastern voivodeships', kind: 'agrarian', share: 24, lean: lean(0, -0.35, -0.1) },
      { id: 'polnoc', name: 'Pomerania and the north', kind: 'coastal', share: 18, lean: lean(0, 0.15, 0.1) },
    ],
    blurb:
      'Proportional with a five per cent threshold and a president who can veto. A government with a majority in the chamber and a hostile presidency governs in half measures.',
  },
  {
    key: 'canada',
    chamber: 'House of Commons',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'fptp',
    centre: lean(-0.05, 0.3, 0.2),
    polarisation: 0.85,
    families: [
      { family: 'centrist', weight: 1.2 },
      { family: 'conservative', weight: 1.15 },
      { family: 'social_democratic', weight: 0.6 },
      { family: 'regionalist', weight: 0.45 },
      { family: 'green', weight: 0.25 },
    ],
    regions: [
      { id: 'toronto', name: 'Greater Toronto', kind: 'metropolitan', share: 19, lean: lean(-0.1, 0.3, 0.15) },
      { id: 'ontario', name: 'The rest of Ontario', kind: 'suburban', share: 20, lean: lean(0.1, 0, 0.05) },
      { id: 'quebec', name: 'Quebec', kind: 'metropolitan', share: 22, lean: lean(-0.2, 0.25, 0.2) },
      { id: 'bc', name: 'British Columbia', kind: 'coastal', share: 14, lean: lean(-0.1, 0.3, 0.3) },
      { id: 'alberta', name: 'Alberta', kind: 'resource', share: 12, lean: lean(0.4, -0.2, -0.3) },
      { id: 'prairies', name: 'Saskatchewan and Manitoba', kind: 'agrarian', share: 7, lean: lean(0.25, -0.15, -0.15) },
      { id: 'atlantic', name: 'Atlantic Canada', kind: 'coastal', share: 6, lean: lean(-0.15, 0.05, 0.1) },
    ],
    blurb:
      'Single-member seats across a country with four distinct regional politics, so a party can win a province outright and finish third nationally.',
  },
  {
    key: 'australia',
    chamber: 'House of Representatives',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'preferential',
    centre: lean(0.1, 0.15, 0.05),
    polarisation: 0.85,
    families: [
      { family: 'social_democratic', weight: 1.2 },
      { family: 'conservative', weight: 1.15 },
      { family: 'agrarian', weight: 0.4 },
      { family: 'green', weight: 0.45 },
      { family: 'centrist', weight: 0.35 },
    ],
    regions: [
      { id: 'nsw', name: 'New South Wales', kind: 'metropolitan', share: 31, lean: lean(0.05, 0.1, 0.05) },
      { id: 'vic', name: 'Victoria', kind: 'suburban', share: 26, lean: lean(-0.1, 0.25, 0.15) },
      { id: 'qld', name: 'Queensland', kind: 'resource', share: 20, lean: lean(0.25, -0.15, -0.2) },
      { id: 'wa', name: 'Western Australia', kind: 'resource', share: 11, lean: lean(0.2, -0.05, -0.15) },
      { id: 'sa', name: 'South Australia', kind: 'industrial', share: 7, lean: lean(-0.05, 0.1, 0.1) },
      { id: 'tas_act', name: 'Tasmania and the territories', kind: 'university', share: 5, lean: lean(-0.15, 0.25, 0.3) },
    ],
    blurb:
      'Compulsory preferential voting, which means every ballot ends up with one of the two largest parties and a minor party wins by being everybody’s second choice.',
  },
  {
    key: 'new_zealand',
    chamber: 'House of Representatives',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'mixed_member',
    centre: lean(-0.05, 0.3, 0.25),
    polarisation: 0.8,
    families: [
      { family: 'social_democratic', weight: 1.1 },
      { family: 'conservative', weight: 1.15 },
      { family: 'liberal', weight: 0.5 },
      { family: 'green', weight: 0.5 },
      { family: 'regionalist', weight: 0.35 },
      { family: 'centrist', weight: 0.35 },
    ],
    regions: [
      { id: 'auckland', name: 'Auckland', kind: 'metropolitan', share: 34, lean: lean(0, 0.25, 0.15) },
      { id: 'wellington', name: 'Wellington', kind: 'capital', share: 11, lean: lean(-0.2, 0.35, 0.3) },
      { id: 'waikato', name: 'Waikato and the Bay of Plenty', kind: 'agrarian', share: 17, lean: lean(0.1, -0.1, -0.05) },
      { id: 'canterbury', name: 'Canterbury', kind: 'suburban', share: 13, lean: lean(0.1, 0.05, 0.05) },
      { id: 'otago', name: 'Otago and Southland', kind: 'resource', share: 8, lean: lean(0.05, 0.05, 0.05) },
      { id: 'rest', name: 'The rest of the country', kind: 'coastal', share: 17, lean: lean(-0.05, 0, 0.05) },
    ],
    blurb:
      'Mixed-member proportional in a chamber small enough that two seats decide a government. Coalition agreements are published and read closely.',
  },
  {
    key: 'japan',
    chamber: 'House of Representatives',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'mixed_member',
    centre: lean(0.15, -0.15, 0.1),
    polarisation: 0.7,
    families: [
      { family: 'conservative', weight: 1.6 },
      { family: 'centrist', weight: 0.75 },
      { family: 'social_democratic', weight: 0.5 },
      { family: 'liberal', weight: 0.45 },
      { family: 'left', weight: 0.35 },
      { family: 'regionalist', weight: 0.35 },
    ],
    regions: [
      { id: 'kanto', name: 'Kantō', kind: 'capital', share: 34, lean: lean(0.05, 0.1, 0.1) },
      { id: 'kansai', name: 'Kansai', kind: 'metropolitan', share: 17, lean: lean(0.05, 0, 0.05) },
      { id: 'chubu', name: 'Chūbu', kind: 'industrial', share: 17, lean: lean(0.15, -0.15, 0.05) },
      { id: 'kyushu', name: 'Kyūshū and Okinawa', kind: 'coastal', share: 12, lean: lean(0.05, -0.2, 0) },
      { id: 'tohoku', name: 'Tōhoku', kind: 'agrarian', share: 9, lean: lean(-0.05, -0.2, -0.05) },
      { id: 'chugoku', name: 'Chūgoku and Shikoku', kind: 'post_industrial', share: 8, lean: lean(0.15, -0.25, -0.05) },
      { id: 'hokkaido', name: 'Hokkaidō', kind: 'resource', share: 4, lean: lean(-0.1, -0.05, 0.1) },
    ],
    blurb:
      'A dominant party, a fragmented opposition, and factions inside the government that behave like parties. The real contest is usually internal.',
  },
  {
    key: 'india',
    chamber: 'Lok Sabha',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'fptp',
    centre: lean(0, -0.2, 0),
    polarisation: 1.1,
    families: [
      { family: 'nationalist', weight: 1.5 },
      { family: 'centrist', weight: 1.0 },
      { family: 'regionalist', weight: 1.1 },
      { family: 'social_democratic', weight: 0.5 },
      { family: 'left', weight: 0.4 },
      { family: 'agrarian', weight: 0.4 },
    ],
    regions: [
      { id: 'up_bihar', name: 'Uttar Pradesh and Bihar', kind: 'agrarian', share: 25, lean: lean(-0.1, -0.35, -0.1) },
      { id: 'maharashtra', name: 'Maharashtra', kind: 'metropolitan', share: 9, lean: lean(0.1, -0.05, 0.05) },
      { id: 'south', name: 'Tamil Nadu and Kerala', kind: 'coastal', share: 10, lean: lean(-0.25, 0.25, 0.15) },
      { id: 'karnataka_ap', name: 'Karnataka and Andhra Pradesh', kind: 'university', share: 12, lean: lean(0.05, 0.05, 0.05) },
      { id: 'west_bengal', name: 'West Bengal and the east', kind: 'industrial', share: 13, lean: lean(-0.25, 0, -0.05) },
      { id: 'gujarat_rajasthan', name: 'Gujarat and Rajasthan', kind: 'resource', share: 13, lean: lean(0.25, -0.3, -0.1) },
      { id: 'delhi_punjab', name: 'Delhi, Punjab and Haryana', kind: 'capital', share: 10, lean: lean(0, -0.05, 0) },
      { id: 'mp', name: 'Madhya Pradesh and the centre', kind: 'agrarian', share: 8, lean: lean(-0.05, -0.3, -0.1) },
    ],
    blurb:
      'Single-member seats across a country of regional party systems. A national majority is assembled out of states that share almost nothing.',
  },
  {
    key: 'south_africa',
    chamber: 'National Assembly',
    headOfGovernment: 'President',
    electoralSystem: 'proportional',
    centre: lean(-0.3, 0.2, 0.1),
    polarisation: 1.15,
    families: [
      { family: 'social_democratic', weight: 1.4 },
      { family: 'liberal', weight: 0.9 },
      { family: 'left', weight: 0.7 },
      { family: 'nationalist', weight: 0.5 },
      { family: 'regionalist', weight: 0.5 },
      { family: 'centrist', weight: 0.35 },
    ],
    regions: [
      { id: 'gauteng', name: 'Gauteng', kind: 'capital', share: 26, lean: lean(-0.15, 0.25, 0.1) },
      { id: 'kzn', name: 'KwaZulu-Natal', kind: 'coastal', share: 19, lean: lean(-0.25, -0.1, 0) },
      { id: 'western_cape', name: 'Western Cape', kind: 'metropolitan', share: 12, lean: lean(0.15, 0.3, 0.2) },
      { id: 'eastern_cape', name: 'Eastern Cape', kind: 'agrarian', share: 11, lean: lean(-0.4, 0.1, 0.05) },
      { id: 'limpopo', name: 'Limpopo and Mpumalanga', kind: 'resource', share: 17, lean: lean(-0.35, -0.1, -0.15) },
      { id: 'noord', name: 'North West, Free State and Northern Cape', kind: 'agrarian', share: 15, lean: lean(-0.25, -0.05, -0.05) },
    ],
    blurb:
      'Closed national lists, so the party decides who sits and the member answers to the party rather than to a constituency. A head of government elected by the chamber and removable by it.',
  },
  {
    key: 'israel',
    chamber: 'Knesset',
    headOfGovernment: 'Prime Minister',
    electoralSystem: 'proportional',
    centre: lean(0.1, -0.1, 0),
    polarisation: 1.25,
    families: [
      { family: 'conservative', weight: 1.1 },
      { family: 'nationalist', weight: 0.9 },
      { family: 'centrist', weight: 0.9 },
      { family: 'christian_democratic', weight: 0.6 },
      { family: 'social_democratic', weight: 0.5 },
      { family: 'regionalist', weight: 0.55 },
      { family: 'left', weight: 0.35 },
    ],
    regions: [
      { id: 'tel_aviv', name: 'Tel Aviv District', kind: 'metropolitan', share: 18, lean: lean(0.1, 0.3, 0.15) },
      { id: 'central', name: 'Central District', kind: 'suburban', share: 26, lean: lean(0.1, 0.05, 0.05) },
      { id: 'jerusalem', name: 'Jerusalem District', kind: 'capital', share: 14, lean: lean(-0.05, -0.4, -0.05) },
      { id: 'haifa', name: 'Haifa District', kind: 'industrial', share: 13, lean: lean(-0.05, 0.15, 0.1) },
      { id: 'north', name: 'Northern District', kind: 'agrarian', share: 17, lean: lean(-0.15, 0, 0.05) },
      { id: 'south', name: 'Southern District', kind: 'resource', share: 12, lean: lean(0, -0.15, -0.05) },
    ],
    blurb:
      'One national district and a low threshold, so a party of four seats can decide who governs. Coalitions are wide, written and short.',
  },
  {
    key: 'verdana',
    chamber: 'National Assembly',
    headOfGovernment: 'First Minister',
    electoralSystem: 'proportional',
    centre: lean(0, 0.1, 0.1),
    polarisation: 1.0,
    families: [
      { family: 'centrist', weight: 1.0 },
      { family: 'social_democratic', weight: 1.0 },
      { family: 'liberal', weight: 0.85 },
      { family: 'conservative', weight: 0.8 },
      { family: 'green', weight: 0.7 },
      { family: 'christian_democratic', weight: 0.6 },
      { family: 'agrarian', weight: 0.55 },
    ],
    regions: [],
    blurb:
      'The invented one. Eight regions, seven parties, proportional counting, and nothing real to get wrong — which makes it the place to learn what every control does.',
  },
];

export function findPolitics(key: CountryKey): PoliticsProfile {
  const found = POLITICS_PROFILES.find((p) => p.key === key);
  if (!found) throw new Error(`politics: no profile for ${key}`);
  return found;
}

export function hasPolitics(key: CountryKey): boolean {
  return POLITICS_PROFILES.some((p) => p.key === key);
}
