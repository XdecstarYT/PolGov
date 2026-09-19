/**
 * countries.ts — the world as it is, rather than as it was invented.
 *
 * Every state here is real, and everything recorded about it is a public
 * figure: output, population, debt, what it sells, who it borders, which
 * institutions it belongs to. The numbers are approximate and they are
 * DATED — they are roughly the mid-2020s, from a snapshot rather than a
 * feed — and the file says so rather than implying a precision it does not
 * have. Anyone keeping this current should edit `countries.ts` and nothing
 * else; every system downstream derives what it needs.
 *
 * What is deliberately NOT here:
 *
 *   NAMED LIVING POLITICIANS. Offices, not people. The president of France
 *   is "the President"; the persona attached to that office is generated,
 *   and given a name that is not a real person's. This is partly because
 *   putting invented words in a real, named, living person's mouth is a
 *   different thing from modelling a country, and partly for a plainer
 *   reason: a run lasts sixteen years, real incumbents last four, and a
 *   game pinned to whoever held office the week it was written is wrong by
 *   its second year.
 *
 *   A VIEW. Alignment is recorded because it predicts behaviour — who votes
 *   with whom is the single most useful fact in international relations —
 *   and posture is descriptive. Neither is a score. An assertive state is
 *   not a villain and an aligned one is not a friend.
 *
 * The relational facts a game needs — who is a neighbour, who trades with
 * whom, who starts warm — are DERIVED from this table rather than stored
 * against one country, because the player picks which country they are and
 * every relationship has to be readable from either end.
 */

import type { Ideology } from '../../types.ts';
import { makeIdeology } from '../../ideology.ts';
import type { IndustryKey } from '../industries.ts';

export type CountryKey =
  /* North America */
  | 'united_states'
  | 'canada'
  | 'mexico'
  /* South America */
  | 'brazil'
  | 'argentina'
  | 'colombia'
  | 'chile'
  /* Western Europe */
  | 'united_kingdom'
  | 'france'
  | 'germany'
  | 'italy'
  | 'spain'
  | 'netherlands'
  | 'sweden'
  | 'ireland'
  /* Central and eastern Europe */
  | 'poland'
  | 'ukraine'
  | 'turkey'
  | 'russia'
  /* Middle East and north Africa */
  | 'saudi_arabia'
  | 'israel'
  | 'egypt'
  | 'iran'
  /* Sub-Saharan Africa */
  | 'nigeria'
  | 'south_africa'
  | 'kenya'
  | 'ethiopia'
  /* South and east Asia */
  | 'india'
  | 'pakistan'
  | 'china'
  | 'japan'
  | 'south_korea'
  | 'indonesia'
  | 'vietnam'
  /* Oceania */
  | 'australia'
  | 'new_zealand'
  /* And the invented one, kept because it is the only country in the game
     with no real people in it — useful for teaching the systems, and for
     anybody who would rather not play a real government at all. */
  | 'verdana';

export type WorldRegion =
  | 'north_america'
  | 'south_america'
  | 'western_europe'
  | 'eastern_europe'
  | 'middle_east'
  | 'north_africa'
  | 'sub_saharan_africa'
  | 'south_asia'
  | 'east_asia'
  | 'southeast_asia'
  | 'oceania'
  | 'nowhere';

/**
 * Who a country tends to line up with.
 *
 * Recorded because it predicts behaviour — who votes with whom is the most
 * useful single fact in international relations — and for no other reason.
 * It is not a score and none of the three is the good one.
 */
export type Alignment = 'western' | 'eastern' | 'non_aligned';

/**
 * How a state conducts itself.
 *
 * Descriptive rather than evaluative. An assertive state is not a villain
 * and an aligned one is not a friend; each posture simply changes which
 * approaches work and what the state asks for in return.
 */
export type Posture =
  | 'assertive'
  | 'mercantile'
  | 'institutional'
  | 'guarded'
  | 'aligned'
  | 'volatile';

/** Real institutions, named as they are. */
export type InstitutionKey =
  | 'un'
  | 'security_council'
  | 'nato'
  | 'eu'
  | 'wto'
  | 'imf'
  | 'world_bank'
  | 'g7'
  | 'g20'
  | 'brics'
  | 'opec'
  | 'african_union'
  | 'asean'
  | 'icc';

export interface CountryTemplate {
  key: CountryKey;
  name: string;
  /** Adjective form, for prose. */
  demonym: string;
  /** What the country is, in one line, without an opinion about it. */
  blurb: string;
  region: WorldRegion;
  alignment: Alignment;
  posture: Posture;

  /**
   * Nominal output, USD bn. Mid-2020s, approximate, and a snapshot rather
   * than a feed — which is stated here because a figure with four digits
   * implies a precision this does not have.
   */
  gdp: number;
  /** Population, millions. Same caveat. */
  population: number;
  /** General government gross debt as a share of output. */
  debtRatio: number;
  /** Defence spending as a share of output. */
  defenceShare: number;

  /** Where the country's politics sit, on the same axes the parties use. */
  ideology: Ideology;

  /** Land borders, by key. Both directions are asserted by a test. */
  borders: CountryKey[];
  /** What it mainly sells, in the industry vocabulary Engine 2D uses. */
  exports: IndustryKey[];
  /** And what it mainly buys. */
  imports: IndustryKey[];

  institutions: InstitutionKey[];
  /** Holds a permanent seat, and therefore a veto. */
  veto?: boolean;
  /** Holds nuclear weapons. */
  deterrent?: boolean;
  /** Can the player govern here? */
  playable?: boolean;
}

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

const UN_BASE: InstitutionKey[] = ['un', 'wto', 'imf', 'world_bank'];

export const COUNTRY_TEMPLATES: CountryTemplate[] = [
  /* ---------------------------------------------------------------- *
   * North America
   * ---------------------------------------------------------------- */
  {
    key: 'united_states',
    name: 'United States',
    demonym: 'American',
    blurb:
      'The largest economy, the reserve currency and the security guarantee most of the western alliance is built on. Its domestic politics are everybody else’s foreign policy.',
    region: 'north_america',
    alignment: 'western',
    posture: 'assertive',
    gdp: 27700,
    population: 335,
    debtRatio: 1.23,
    defenceShare: 0.034,
    ideology: makeIdeology(0.45, 0.1, -0.15),
    borders: ['canada', 'mexico'],
    exports: ['technology', 'finance', 'defence', 'energy', 'entertainment'],
    imports: ['manufacturing', 'agriculture', 'retail'],
    institutions: [...UN_BASE, 'security_council', 'nato', 'g7', 'g20'],
    veto: true,
    deterrent: true,
    playable: true,
  },
  {
    key: 'canada',
    name: 'Canada',
    demonym: 'Canadian',
    blurb:
      'Resource-rich, thinly populated and wired to one enormous neighbour. Most of its choices are about how much distance to keep.',
    region: 'north_america',
    alignment: 'western',
    posture: 'institutional',
    gdp: 2140,
    population: 40,
    debtRatio: 1.06,
    defenceShare: 0.013,
    ideology: makeIdeology(-0.1, 0.45, 0.3),
    borders: ['united_states'],
    exports: ['energy', 'mining', 'agriculture', 'forestry'],
    imports: ['manufacturing', 'technology', 'retail'],
    institutions: [...UN_BASE, 'icc', 'nato', 'g7', 'g20'],
    playable: true,
  },
  {
    key: 'mexico',
    name: 'Mexico',
    demonym: 'Mexican',
    blurb:
      'A manufacturing economy joined at the hip to the American market, with a politics shaped by that dependence and by what crosses the border in both directions.',
    region: 'north_america',
    alignment: 'non_aligned',
    posture: 'mercantile',
    gdp: 1790,
    population: 129,
    debtRatio: 0.53,
    defenceShare: 0.006,
    ideology: makeIdeology(-0.2, 0.05, 0.05),
    borders: ['united_states'],
    exports: ['manufacturing', 'agriculture', 'energy'],
    imports: ['technology', 'finance', 'retail'],
    institutions: [...UN_BASE, 'icc', 'g20'],
    playable: true,
  },

  /* ---------------------------------------------------------------- *
   * South America
   * ---------------------------------------------------------------- */
  {
    key: 'brazil',
    name: 'Brazil',
    demonym: 'Brazilian',
    blurb:
      'The largest economy and population in the hemisphere south of the United States, with a fragmented congress in which no president has ever had a majority of their own.',
    region: 'south_america',
    alignment: 'non_aligned',
    posture: 'institutional',
    gdp: 2170,
    population: 216,
    debtRatio: 0.85,
    defenceShare: 0.012,
    ideology: makeIdeology(-0.15, 0.1, 0.2),
    borders: ['argentina', 'colombia'],
    exports: ['agriculture', 'mining', 'energy'],
    imports: ['manufacturing', 'technology', 'defence'],
    institutions: [...UN_BASE, 'icc', 'g20', 'brics'],
    playable: true,
  },
  {
    key: 'argentina',
    name: 'Argentina',
    demonym: 'Argentine',
    blurb:
      'A wealthy country by resources and an unstable one by history, with an inflation record that shapes every economic argument it has.',
    region: 'south_america',
    alignment: 'non_aligned',
    posture: 'volatile',
    gdp: 640,
    population: 46,
    debtRatio: 1.55,
    defenceShare: 0.007,
    ideology: makeIdeology(-0.1, 0.2, 0.05),
    borders: ['brazil', 'chile'],
    exports: ['agriculture', 'energy', 'mining'],
    imports: ['manufacturing', 'technology', 'energy'],
    institutions: [...UN_BASE, 'icc', 'g20'],
    playable: true,
  },
  {
    key: 'colombia',
    name: 'Colombia',
    demonym: 'Colombian',
    blurb:
      'Two coastlines, a long internal conflict formally ended and informally continuing, and an economy that runs on what comes out of the ground.',
    region: 'south_america',
    alignment: 'non_aligned',
    posture: 'guarded',
    gdp: 364,
    population: 52,
    debtRatio: 0.55,
    defenceShare: 0.031,
    ideology: makeIdeology(0.1, -0.05, 0.1),
    borders: ['brazil'],
    exports: ['energy', 'agriculture', 'mining'],
    imports: ['manufacturing', 'technology', 'agriculture'],
    institutions: [...UN_BASE, 'icc'],
  },
  {
    key: 'chile',
    name: 'Chile',
    demonym: 'Chilean',
    blurb:
      'A long thin country holding a large share of the world’s copper and lithium, with institutions unusually stable for the region and an argument about their constitution that will not end.',
    region: 'south_america',
    alignment: 'non_aligned',
    posture: 'mercantile',
    gdp: 335,
    population: 20,
    debtRatio: 0.4,
    defenceShare: 0.019,
    ideology: makeIdeology(0.15, 0.2, 0.2),
    borders: ['argentina'],
    exports: ['mining', 'agriculture', 'fisheries'],
    imports: ['manufacturing', 'energy', 'technology'],
    institutions: [...UN_BASE, 'icc'],
  },

  /* ---------------------------------------------------------------- *
   * Western Europe
   * ---------------------------------------------------------------- */
  {
    key: 'united_kingdom',
    name: 'United Kingdom',
    demonym: 'British',
    blurb:
      'A services economy with a financial centre out of proportion to its size, a first-past-the-post parliament that manufactures majorities, and four nations that do not all want the same things.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'institutional',
    gdp: 3340,
    population: 68,
    debtRatio: 1.0,
    defenceShare: 0.023,
    ideology: makeIdeology(0.2, 0.2, 0.15),
    borders: ['ireland'],
    exports: ['finance', 'technology', 'defence', 'entertainment', 'research'],
    imports: ['manufacturing', 'energy', 'agriculture'],
    institutions: [...UN_BASE, 'icc', 'security_council', 'nato', 'g7', 'g20'],
    veto: true,
    deterrent: true,
    playable: true,
  },
  {
    key: 'france',
    name: 'France',
    demonym: 'French',
    blurb:
      'A centralised state with a large public sector, an independent deterrent and a habit of treating the European project as an instrument of its own foreign policy.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'assertive',
    gdp: 3050,
    population: 68,
    debtRatio: 1.11,
    defenceShare: 0.019,
    ideology: makeIdeology(-0.25, 0.25, 0.3),
    borders: ['germany', 'italy', 'spain'],
    exports: ['manufacturing', 'agriculture', 'energy', 'tourism', 'defence'],
    imports: ['energy', 'technology', 'manufacturing'],
    institutions: [...UN_BASE, 'icc', 'security_council', 'nato', 'eu', 'g7', 'g20'],
    veto: true,
    deterrent: true,
    playable: true,
  },
  {
    key: 'germany',
    name: 'Germany',
    demonym: 'German',
    blurb:
      'Europe’s manufacturing centre and its fiscal conscience, governed by coalitions almost without exception and structurally dependent on exporting to everybody else.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'mercantile',
    gdp: 4460,
    population: 84,
    debtRatio: 0.64,
    defenceShare: 0.015,
    ideology: makeIdeology(-0.1, 0.3, 0.4),
    borders: ['france', 'poland', 'netherlands'],
    exports: ['manufacturing', 'technology', 'research'],
    imports: ['energy', 'agriculture', 'technology'],
    institutions: [...UN_BASE, 'icc', 'nato', 'eu', 'g7', 'g20'],
    playable: true,
  },
  {
    key: 'italy',
    name: 'Italy',
    demonym: 'Italian',
    blurb:
      'A large manufacturing economy carrying one of the heaviest debt loads in the developed world, and a parliament that has produced a new government roughly every eighteen months since the war.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'institutional',
    gdp: 2190,
    population: 59,
    debtRatio: 1.37,
    defenceShare: 0.015,
    ideology: makeIdeology(0.0, 0.05, 0.2),
    borders: ['france'],
    exports: ['manufacturing', 'tourism', 'agriculture'],
    imports: ['energy', 'technology', 'manufacturing'],
    institutions: [...UN_BASE, 'icc', 'nato', 'eu', 'g7', 'g20'],
    playable: true,
  },
  {
    key: 'spain',
    name: 'Spain',
    demonym: 'Spanish',
    blurb:
      'A regionalised state where national majorities are assembled out of parties that want more autonomy, and an economy that runs on services, tourism and increasingly on sun.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'institutional',
    gdp: 1620,
    population: 48,
    debtRatio: 1.07,
    defenceShare: 0.013,
    ideology: makeIdeology(-0.2, 0.3, 0.3),
    borders: ['france'],
    exports: ['tourism', 'agriculture', 'energy', 'manufacturing'],
    imports: ['energy', 'technology', 'manufacturing'],
    institutions: [...UN_BASE, 'icc', 'nato', 'eu', 'g20'],
    playable: true,
  },
  {
    key: 'netherlands',
    name: 'Netherlands',
    demonym: 'Dutch',
    blurb:
      'A trading state with one of the world’s largest ports, a pure proportional parliament that regularly seats fifteen parties, and coalition talks measured in months.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'mercantile',
    gdp: 1120,
    population: 18,
    debtRatio: 0.46,
    defenceShare: 0.016,
    ideology: makeIdeology(0.15, 0.4, 0.35),
    borders: ['germany'],
    exports: ['logistics', 'agriculture', 'technology', 'finance'],
    imports: ['energy', 'manufacturing', 'agriculture'],
    institutions: [...UN_BASE, 'icc', 'nato', 'eu', 'g20'],
    playable: true,
  },
  {
    key: 'sweden',
    name: 'Sweden',
    demonym: 'Swedish',
    blurb:
      'A high-tax, high-service economy with an unusually open export sector, and two centuries of non-alignment recently abandoned.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'institutional',
    gdp: 590,
    population: 11,
    debtRatio: 0.32,
    defenceShare: 0.02,
    ideology: makeIdeology(-0.3, 0.45, 0.5),
    borders: [],
    exports: ['manufacturing', 'technology', 'forestry', 'defence'],
    imports: ['energy', 'manufacturing', 'agriculture'],
    institutions: [...UN_BASE, 'icc', 'nato', 'eu'],
    playable: true,
  },
  {
    key: 'ireland',
    name: 'Ireland',
    demonym: 'Irish',
    blurb:
      'A small open economy whose headline output is distorted by where multinationals book their profits, and whose politics is finally not organised around a civil war.',
    region: 'western_europe',
    alignment: 'western',
    posture: 'mercantile',
    gdp: 545,
    population: 5.3,
    debtRatio: 0.43,
    defenceShare: 0.003,
    ideology: makeIdeology(0.15, 0.35, 0.25),
    borders: ['united_kingdom'],
    exports: ['technology', 'finance', 'healthcare', 'agriculture'],
    imports: ['energy', 'manufacturing', 'retail'],
    institutions: [...UN_BASE, 'icc', 'eu'],
  },

  /* ---------------------------------------------------------------- *
   * Central and eastern Europe
   * ---------------------------------------------------------------- */
  {
    key: 'poland',
    name: 'Poland',
    demonym: 'Polish',
    blurb:
      'The largest economy in central Europe, spending heavily on defence for reasons its geography makes obvious, with a politics organised around what the state should be for.',
    region: 'eastern_europe',
    alignment: 'western',
    posture: 'guarded',
    gdp: 810,
    population: 37,
    debtRatio: 0.5,
    defenceShare: 0.039,
    ideology: makeIdeology(0.05, -0.25, 0.0),
    borders: ['germany', 'ukraine'],
    exports: ['manufacturing', 'agriculture', 'logistics'],
    imports: ['energy', 'technology', 'manufacturing'],
    institutions: [...UN_BASE, 'icc', 'nato', 'eu', 'g20'],
    playable: true,
  },
  {
    key: 'ukraine',
    name: 'Ukraine',
    demonym: 'Ukrainian',
    blurb:
      'A large agricultural and industrial economy whose every political question for a decade has been downstream of a war on its own territory.',
    region: 'eastern_europe',
    alignment: 'western',
    posture: 'guarded',
    gdp: 180,
    population: 37,
    debtRatio: 0.85,
    defenceShare: 0.37,
    ideology: makeIdeology(0.05, 0.1, 0.05),
    borders: ['poland', 'russia'],
    exports: ['agriculture', 'mining', 'manufacturing'],
    imports: ['energy', 'defence', 'manufacturing'],
    institutions: [...UN_BASE, 'icc'],
  },
  {
    key: 'turkey',
    name: 'Türkiye',
    demonym: 'Turkish',
    blurb:
      'A large economy straddling two continents and two alliances, with a persistent inflation problem and a foreign policy that keeps its options open with everybody.',
    region: 'middle_east',
    alignment: 'non_aligned',
    posture: 'assertive',
    gdp: 1120,
    population: 85,
    debtRatio: 0.3,
    defenceShare: 0.015,
    ideology: makeIdeology(0.1, -0.3, 0.0),
    borders: ['iran'],
    exports: ['manufacturing', 'agriculture', 'tourism', 'construction'],
    imports: ['energy', 'technology', 'manufacturing'],
    institutions: [...UN_BASE, 'nato', 'g20'],
    playable: true,
  },
  {
    key: 'russia',
    name: 'Russia',
    demonym: 'Russian',
    blurb:
      'A resource economy with the largest nuclear arsenal and a permanent seat, reoriented east by sanctions and organised around the state.',
    region: 'eastern_europe',
    alignment: 'eastern',
    posture: 'assertive',
    gdp: 2020,
    population: 144,
    debtRatio: 0.2,
    defenceShare: 0.06,
    ideology: makeIdeology(0.1, -0.55, -0.35),
    borders: ['ukraine', 'china'],
    exports: ['energy', 'mining', 'defence', 'agriculture'],
    imports: ['manufacturing', 'technology', 'retail'],
    institutions: [...UN_BASE, 'security_council', 'g20', 'brics'],
    veto: true,
    deterrent: true,
  },

  /* ---------------------------------------------------------------- *
   * Middle East and north Africa
   * ---------------------------------------------------------------- */
  {
    key: 'saudi_arabia',
    name: 'Saudi Arabia',
    demonym: 'Saudi',
    blurb:
      'The world’s swing producer of oil, spending its way toward an economy that is not about oil, on a timetable nobody outside believes.',
    region: 'middle_east',
    alignment: 'non_aligned',
    posture: 'mercantile',
    gdp: 1070,
    population: 33,
    debtRatio: 0.26,
    defenceShare: 0.073,
    ideology: makeIdeology(0.4, -0.6, -0.3),
    borders: [],
    exports: ['energy', 'mining'],
    imports: ['manufacturing', 'technology', 'agriculture', 'defence'],
    institutions: [...UN_BASE, 'g20', 'opec'],
  },
  {
    key: 'israel',
    name: 'Israel',
    demonym: 'Israeli',
    blurb:
      'A small, wealthy technology economy with compulsory service, a proportional parliament that has never produced a single-party majority, and a security position that shapes everything else.',
    region: 'middle_east',
    alignment: 'western',
    posture: 'guarded',
    gdp: 510,
    population: 9.8,
    debtRatio: 0.62,
    defenceShare: 0.052,
    ideology: makeIdeology(0.25, -0.1, 0.05),
    borders: ['egypt'],
    exports: ['technology', 'defence', 'research'],
    imports: ['energy', 'manufacturing', 'agriculture'],
    institutions: [...UN_BASE],
    deterrent: true,
  },
  {
    key: 'egypt',
    name: 'Egypt',
    demonym: 'Egyptian',
    blurb:
      'The most populous Arab state, holding the canal a tenth of world trade passes through, and carrying a debt burden that decides most of its policy.',
    region: 'north_africa',
    alignment: 'non_aligned',
    posture: 'guarded',
    gdp: 395,
    population: 112,
    debtRatio: 0.9,
    defenceShare: 0.012,
    ideology: makeIdeology(0.0, -0.45, -0.1),
    borders: ['israel'],
    exports: ['energy', 'agriculture', 'logistics', 'tourism'],
    imports: ['agriculture', 'manufacturing', 'technology'],
    institutions: [...UN_BASE, 'african_union', 'brics'],
  },
  {
    key: 'iran',
    name: 'Iran',
    demonym: 'Iranian',
    blurb:
      'A large, young, sanctioned economy sitting on enormous reserves it cannot freely sell, with a political system that answers to two authorities at once.',
    region: 'middle_east',
    alignment: 'eastern',
    posture: 'volatile',
    gdp: 405,
    population: 89,
    debtRatio: 0.34,
    defenceShare: 0.023,
    ideology: makeIdeology(-0.05, -0.7, -0.2),
    borders: ['turkey', 'pakistan'],
    exports: ['energy', 'mining', 'agriculture'],
    imports: ['manufacturing', 'technology', 'agriculture'],
    institutions: [...UN_BASE, 'opec', 'brics'],
  },

  /* ---------------------------------------------------------------- *
   * Sub-Saharan Africa
   * ---------------------------------------------------------------- */
  {
    key: 'nigeria',
    name: 'Nigeria',
    demonym: 'Nigerian',
    blurb:
      'Africa’s largest population and one of its largest economies, with an oil sector that funds the state and a young population growing faster than the jobs.',
    region: 'sub_saharan_africa',
    alignment: 'non_aligned',
    posture: 'mercantile',
    gdp: 375,
    population: 224,
    debtRatio: 0.46,
    defenceShare: 0.007,
    ideology: makeIdeology(0.15, -0.2, -0.05),
    borders: [],
    exports: ['energy', 'agriculture'],
    imports: ['manufacturing', 'technology', 'agriculture', 'retail'],
    institutions: [...UN_BASE, 'icc', 'african_union', 'opec'],
    playable: true,
  },
  {
    key: 'south_africa',
    name: 'South Africa',
    demonym: 'South African',
    blurb:
      'The continent’s most industrialised economy, with a proportional parliament, a mining sector that built everything and an electricity supply that does not meet demand.',
    region: 'sub_saharan_africa',
    alignment: 'non_aligned',
    posture: 'institutional',
    gdp: 380,
    population: 60,
    debtRatio: 0.74,
    defenceShare: 0.007,
    ideology: makeIdeology(-0.3, 0.2, 0.15),
    borders: [],
    exports: ['mining', 'agriculture', 'manufacturing'],
    imports: ['energy', 'technology', 'manufacturing'],
    institutions: [...UN_BASE, 'icc', 'g20', 'brics', 'african_union'],
    playable: true,
  },
  {
    key: 'kenya',
    name: 'Kenya',
    demonym: 'Kenyan',
    blurb:
      'East Africa’s commercial hub, with a services sector unusually large for its income and a debt bill that consumes most of what it collects.',
    region: 'sub_saharan_africa',
    alignment: 'non_aligned',
    posture: 'mercantile',
    gdp: 115,
    population: 55,
    debtRatio: 0.7,
    defenceShare: 0.011,
    ideology: makeIdeology(0.15, -0.05, 0.1),
    borders: ['ethiopia'],
    exports: ['agriculture', 'tourism', 'telecoms'],
    imports: ['manufacturing', 'energy', 'technology'],
    institutions: [...UN_BASE, 'icc', 'african_union'],
  },
  {
    key: 'ethiopia',
    name: 'Ethiopia',
    demonym: 'Ethiopian',
    blurb:
      'One of the continent’s largest populations and fastest-growing economies, with a federal structure organised along ethnic lines that has been tested by war.',
    region: 'sub_saharan_africa',
    alignment: 'non_aligned',
    posture: 'guarded',
    gdp: 160,
    population: 126,
    debtRatio: 0.38,
    defenceShare: 0.008,
    ideology: makeIdeology(-0.2, -0.3, 0.05),
    borders: ['kenya'],
    exports: ['agriculture', 'energy'],
    imports: ['manufacturing', 'technology', 'energy'],
    institutions: [...UN_BASE, 'african_union', 'brics'],
  },

  /* ---------------------------------------------------------------- *
   * South and east Asia
   * ---------------------------------------------------------------- */
  {
    key: 'india',
    name: 'India',
    demonym: 'Indian',
    blurb:
      'The world’s most populous country and its largest democracy, federal, first-past-the-post, and growing faster than anywhere else of its size.',
    region: 'south_asia',
    alignment: 'non_aligned',
    posture: 'assertive',
    gdp: 3730,
    population: 1430,
    debtRatio: 0.83,
    defenceShare: 0.024,
    ideology: makeIdeology(0.15, -0.2, 0.05),
    borders: ['pakistan', 'china'],
    exports: ['technology', 'research', 'agriculture', 'manufacturing'],
    imports: ['energy', 'manufacturing', 'defence'],
    institutions: [...UN_BASE, 'g20', 'brics'],
    deterrent: true,
    playable: true,
  },
  {
    key: 'pakistan',
    name: 'Pakistan',
    demonym: 'Pakistani',
    blurb:
      'A large, young, nuclear-armed state with a recurring balance-of-payments problem and an army that has never been out of politics for long.',
    region: 'south_asia',
    alignment: 'non_aligned',
    posture: 'volatile',
    gdp: 340,
    population: 240,
    debtRatio: 0.75,
    defenceShare: 0.029,
    ideology: makeIdeology(0.0, -0.45, -0.1),
    borders: ['india', 'iran', 'china'],
    exports: ['agriculture', 'manufacturing'],
    imports: ['energy', 'manufacturing', 'technology'],
    institutions: [...UN_BASE],
    deterrent: true,
  },
  {
    key: 'china',
    name: 'China',
    demonym: 'Chinese',
    blurb:
      'The world’s manufacturing centre and its second-largest economy, a permanent member, and the state most other countries’ trade policy is actually about.',
    region: 'east_asia',
    alignment: 'eastern',
    posture: 'assertive',
    gdp: 17800,
    population: 1410,
    debtRatio: 0.83,
    defenceShare: 0.017,
    ideology: makeIdeology(-0.35, -0.7, -0.05),
    borders: ['india', 'russia', 'vietnam', 'pakistan'],
    exports: ['manufacturing', 'technology', 'construction', 'telecoms'],
    imports: ['energy', 'mining', 'agriculture'],
    institutions: [...UN_BASE, 'security_council', 'g20', 'brics'],
    veto: true,
    deterrent: true,
  },
  {
    key: 'japan',
    name: 'Japan',
    demonym: 'Japanese',
    blurb:
      'A wealthy, ageing, export-oriented economy carrying the developed world’s heaviest public debt, governed by one party for most of its post-war history.',
    region: 'east_asia',
    alignment: 'western',
    posture: 'institutional',
    gdp: 4210,
    population: 124,
    debtRatio: 2.55,
    defenceShare: 0.011,
    ideology: makeIdeology(0.2, -0.05, 0.15),
    borders: [],
    exports: ['manufacturing', 'technology', 'research'],
    imports: ['energy', 'agriculture', 'mining'],
    institutions: [...UN_BASE, 'icc', 'g7', 'g20'],
    playable: true,
  },
  {
    key: 'south_korea',
    name: 'South Korea',
    demonym: 'South Korean',
    blurb:
      'A technology and shipbuilding economy that went from poor to wealthy inside one lifetime, with the developed world’s lowest birth rate and a security problem on its border.',
    region: 'east_asia',
    alignment: 'western',
    posture: 'guarded',
    gdp: 1710,
    population: 52,
    debtRatio: 0.55,
    defenceShare: 0.027,
    ideology: makeIdeology(0.2, 0.0, 0.1),
    borders: [],
    exports: ['technology', 'manufacturing', 'entertainment'],
    imports: ['energy', 'agriculture', 'mining'],
    institutions: [...UN_BASE, 'icc', 'g20'],
    playable: true,
  },
  {
    key: 'indonesia',
    name: 'Indonesia',
    demonym: 'Indonesian',
    blurb:
      'The fourth most populous country, spread across thousands of islands, with a resource economy moving into processing and a presidency that dominates its politics.',
    region: 'southeast_asia',
    alignment: 'non_aligned',
    posture: 'mercantile',
    gdp: 1370,
    population: 278,
    debtRatio: 0.39,
    defenceShare: 0.008,
    ideology: makeIdeology(0.05, -0.2, 0.0),
    borders: [],
    exports: ['mining', 'energy', 'agriculture', 'manufacturing'],
    imports: ['manufacturing', 'technology', 'energy'],
    institutions: [...UN_BASE, 'g20', 'asean'],
    playable: true,
  },
  {
    key: 'vietnam',
    name: 'Vietnam',
    demonym: 'Vietnamese',
    blurb:
      'A one-party state running an increasingly open economy, and the main beneficiary of manufacturers looking for somewhere that is not China.',
    region: 'southeast_asia',
    alignment: 'non_aligned',
    posture: 'mercantile',
    gdp: 430,
    population: 99,
    debtRatio: 0.35,
    defenceShare: 0.023,
    ideology: makeIdeology(-0.25, -0.6, 0.0),
    borders: ['china'],
    exports: ['manufacturing', 'technology', 'agriculture'],
    imports: ['manufacturing', 'energy', 'technology'],
    institutions: [...UN_BASE, 'asean'],
  },

  /* ---------------------------------------------------------------- *
   * Oceania
   * ---------------------------------------------------------------- */
  {
    key: 'australia',
    name: 'Australia',
    demonym: 'Australian',
    blurb:
      'A resource exporter with a services economy and a preferential ballot, whose trade runs to Asia and whose security arrangements run the other way.',
    region: 'oceania',
    alignment: 'western',
    posture: 'aligned',
    gdp: 1720,
    population: 27,
    debtRatio: 0.5,
    defenceShare: 0.019,
    ideology: makeIdeology(0.2, 0.25, 0.2),
    borders: [],
    exports: ['mining', 'energy', 'agriculture', 'education'],
    imports: ['manufacturing', 'technology', 'retail'],
    institutions: [...UN_BASE, 'icc', 'g20'],
    playable: true,
  },
  {
    key: 'new_zealand',
    name: 'New Zealand',
    demonym: 'New Zealand',
    blurb:
      'Small, distant, agricultural and mixed-member proportional, with a foreign policy that has been comfortable disagreeing with its allies.',
    region: 'oceania',
    alignment: 'western',
    posture: 'institutional',
    gdp: 253,
    population: 5.2,
    debtRatio: 0.46,
    defenceShare: 0.01,
    ideology: makeIdeology(0.0, 0.4, 0.4),
    borders: [],
    exports: ['agriculture', 'tourism', 'forestry'],
    imports: ['manufacturing', 'energy', 'technology'],
    institutions: [...UN_BASE, 'icc'],
    playable: true,
  },

  /* ---------------------------------------------------------------- *
   * And the invented one
   * ---------------------------------------------------------------- */
  {
    key: 'verdana',
    name: 'Verdana',
    demonym: 'Verdanan',
    blurb:
      'A mid-sized parliamentary democracy that does not exist, wedged into western Europe between France, Spain and Germany. It is the one country in the game with nothing real to get wrong, which makes it the one to learn the machinery in.',
    /* 'nowhere' keeps an invented state out of every real country's list of
       foreign powers. It does not keep it out of the world: Verdana has an
       alignment, neighbours and memberships like anybody else, because a
       country with no position has no diplomacy to play. */
    region: 'nowhere',
    alignment: 'western',
    posture: 'institutional',
    gdp: 3680,
    population: 42.6,
    debtRatio: 0.55,
    defenceShare: 0.024,
    ideology: makeIdeology(0, 0.1, 0.1),
    borders: ['france', 'spain', 'germany'],
    exports: ['manufacturing', 'finance', 'technology', 'agriculture'],
    imports: ['energy', 'manufacturing', 'technology'],
    institutions: ['un', 'icc', 'wto', 'world_bank'],
    playable: true,
  },
];

export function findCountry(key: CountryKey): CountryTemplate {
  const found = COUNTRY_TEMPLATES.find((c) => c.key === key);
  if (!found) throw new Error(`countries: unknown country ${key}`);
  return found;
}

/** Everywhere the player may govern. */
export function playableCountries(): CountryTemplate[] {
  return COUNTRY_TEMPLATES.filter((c) => c.playable);
}

export const REGION_LABELS: Record<WorldRegion, string> = {
  north_america: 'North America',
  south_america: 'South America',
  western_europe: 'Western Europe',
  eastern_europe: 'Central and eastern Europe',
  middle_east: 'Middle East',
  north_africa: 'North Africa',
  sub_saharan_africa: 'Sub-Saharan Africa',
  south_asia: 'South Asia',
  east_asia: 'East Asia',
  southeast_asia: 'Southeast Asia',
  oceania: 'Oceania',
  nowhere: 'Nowhere in particular',
};

export const POSTURE_LABELS: Record<Posture, string> = {
  assertive: 'Assertive',
  mercantile: 'Mercantile',
  institutional: 'Institutional',
  guarded: 'Guarded',
  aligned: 'Aligned',
  volatile: 'Volatile',
};

export const ALIGNMENT_LABELS: Record<Alignment, string> = {
  western: 'Lines up with the western bloc',
  eastern: 'Lines up against it',
  non_aligned: 'Keeps its options open',
};

export const INSTITUTION_LABELS: Record<InstitutionKey, string> = {
  un: 'United Nations',
  security_council: 'UN Security Council (permanent seat)',
  nato: 'NATO',
  eu: 'European Union',
  wto: 'World Trade Organization',
  imf: 'International Monetary Fund',
  world_bank: 'World Bank',
  g7: 'G7',
  g20: 'G20',
  brics: 'BRICS',
  opec: 'OPEC',
  african_union: 'African Union',
  asean: 'ASEAN',
  icc: 'International Criminal Court',
};
