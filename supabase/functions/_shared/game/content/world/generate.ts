/**
 * generate.ts — a country's chamber, built from its profile.
 *
 * `politics.ts` says what a country's politics is SHAPED like: how votes
 * become seats, which political families have a real presence, how far
 * apart they sit, and which parts of the country vote differently from each
 * other. This turns that shape into the regions and parties the engine
 * actually runs on.
 *
 * The parties are invented, and that is a decision rather than a shortcut.
 * A real party's name carries its real record, its real arguments and its
 * real supporters, and putting that name on a set of positions this file
 * made up — and then having an invented leader say invented things under it
 * — would be a worse project than this one and a less interesting game.
 * What is inherited is the shape: a country with two large parties plays
 * nothing like a country with seven, and that is the part that matters at
 * the desk.
 *
 * Verdana is not generated. It keeps the hand-written parties and regions
 * it has always had, so every existing measurement of the balance still
 * means what it meant.
 */

import { makeIdeology } from '../../ideology.ts';
import type { Ideology, RedLine, SectorKey } from '../../types.ts';
import { TOTAL_SEATS } from '../../balance.ts';
import type { PartyTemplate } from '../parties.ts';
import { PARTY_TEMPLATES } from '../parties.ts';
import type { RegionTemplate } from '../regions.ts';
import { REGION_TEMPLATES } from '../regions.ts';
import { findCountry, type CountryKey } from './countries.ts';
import {
  REGION_KIND_CHARACTER,
  REGION_KIND_COMPOSITION,
  findPolitics,
  type PartyFamily,
  type PoliticsProfile,
  type RegionKind,
} from './politics.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * The benches
 * ------------------------------------------------------------------ */

/**
 * Seven bench colours, allocated in order.
 *
 * These ids are not party identities — they are seats in the chamber's
 * palette, and the stylesheet steps each one separately for light and dark
 * so the hemicycle stays legible in both. A country's parties take the
 * first N of them, which means a new country needs no new colour work and
 * cannot accidentally introduce a pair nobody can tell apart.
 */
const BENCHES: { id: string; color: string; glyph: string }[] = [
  { id: 'concord', color: '#a62f2a', glyph: '●' },
  { id: 'meridian', color: '#0089a3', glyph: '◆' },
  { id: 'enterprise', color: '#2d5ea8', glyph: '▲' },
  { id: 'heritage', color: '#932f63', glyph: '■' },
  { id: 'verdant', color: '#57964a', glyph: '✦' },
  { id: 'civic', color: '#6d4fa2', glyph: '◇' },
  { id: 'landward', color: '#8f6a16', glyph: '⬟' },
];

export const MAX_GENERATED_PARTIES = BENCHES.length;

/* ------------------------------------------------------------------ *
 * The families
 * ------------------------------------------------------------------ */

/**
 * Where each political family's support actually is.
 *
 * `kinds` are the sorts of place it is strong in and `strength` is how
 * much stronger; `elsewhere` is what it gets everywhere else. A party with
 * no entry here is strong everywhere equally, which is a fair description
 * of a large catch-all party and a terrible one of anybody else.
 *
 * This is what makes a majoritarian chamber contain more than three
 * parties. Without it, support is a smooth function of ideology, every
 * district in a country elects whichever party fits the national mood
 * best, and a party with a tenth of the vote wins nothing anywhere —
 * which is not what a tenth of the vote does when it is all in one place.
 */
interface Geography {
  kinds: RegionKind[];
  strength: number;
  elsewhere: number;
}

interface FamilySpec {
  /** Names to pick from, so two countries do not field the same chamber. */
  names: { name: string; shortName: string }[];
  leaderTitle: string;
  /** Position relative to the country's own centre. */
  offset: Ideology;
  prioritySector: SectorKey;
  /** Annual funding demanded for the priority sector, as a share of the
      sector's baseline. Turned into money once the country's size is known. */
  floorShare: number;
  cabinetDemand: number;
  blurb: string;
  /** The line this family will not cross, beyond its own sector floor. */
  redLine: (id: string) => RedLine;
  /** Where its vote is, when it is anywhere in particular. */
  geography?: Geography;
}

const FAMILIES: Record<PartyFamily, FamilySpec> = {
  social_democratic: {
    names: [
      { name: 'Labour and Social Union', shortName: 'Social Union' },
      { name: 'Workers’ and Citizens’ Alliance', shortName: 'Workers’ Alliance' },
      { name: 'Solidarity Union', shortName: 'Solidarity' },
    ],
    leaderTitle: 'General Secretary',
    offset: makeIdeology(-0.5, 0.15, 0.1),
    prioritySector: 'health',
    floorShare: 1.02,
    cabinetDemand: 4,
    blurb:
      'Built out of the unions and never entirely at ease with the people it now needs to win. Will trade almost anything for the health budget.',
    redLine: (id) => ({
      id: `${id}-labour`,
      kind: 'bill_category',
      category: 'labour',
      description: 'No bill that weakens collective bargaining, whatever it is called.',
    }),
    geography: { kinds: ['industrial', 'post_industrial', 'metropolitan'], strength: 1.9, elsewhere: 0.62 },
  },
  conservative: {
    names: [
      { name: 'National Conservative Union', shortName: 'Conservatives' },
      { name: 'Order and Enterprise Party', shortName: 'Order' },
      { name: 'Heritage Assembly', shortName: 'Heritage' },
    ],
    leaderTitle: 'Chair',
    offset: makeIdeology(0.45, -0.3, -0.15),
    prioritySector: 'infrastructure',
    floorShare: 0.98,
    cabinetDemand: 4,
    blurb:
      'Property, the armed forces and the idea that the country was recently better. Reliable on the budget and immovable on everything it calls tradition.',
    redLine: (id) => ({
      id: `${id}-social`,
      kind: 'ideology_axis',
      axis: 'social',
      direction: 'positive',
      magnitude: 0.6,
      description: 'No bill that moves social policy sharply toward permissiveness.',
    }),
    geography: { kinds: ['suburban', 'agrarian', 'coastal'], strength: 1.7, elsewhere: 0.66 },
  },
  liberal: {
    names: [
      { name: 'Free Enterprise League', shortName: 'Enterprise' },
      { name: 'Liberal Reform Party', shortName: 'Reform' },
      { name: 'Open Market Alliance', shortName: 'Open Market' },
    ],
    leaderTitle: 'Chair',
    offset: makeIdeology(0.4, 0.45, 0.0),
    prioritySector: 'economy',
    floorShare: 1.15,
    cabinetDemand: 3,
    blurb:
      'Low taxes and few rules, applied to markets and to private life alike. The most consistent party in the chamber and the least popular in a recession.',
    redLine: (id) => ({
      id: `${id}-tax`,
      kind: 'ideology_axis',
      axis: 'economic',
      direction: 'negative',
      magnitude: 0.5,
      description: 'No bill that raises the burden on business past what was agreed.',
    }),
    geography: { kinds: ['capital', 'metropolitan', 'suburban'], strength: 1.8, elsewhere: 0.55 },
  },
  green: {
    names: [
      { name: 'Verdant Compact', shortName: 'Verdant' },
      { name: 'Ecology and Future Alliance', shortName: 'Ecology' },
      { name: 'Green Convention', shortName: 'Greens' },
    ],
    leaderTitle: 'Convenor',
    offset: makeIdeology(-0.3, 0.45, 0.75),
    prioritySector: 'environment',
    floorShare: 1.0,
    cabinetDemand: 2,
    blurb:
      'Joined a government to change one thing and will leave over it. Everything else is negotiable and nothing about the environment is.',
    redLine: (id) => ({
      id: `${id}-extraction`,
      kind: 'bill_category',
      category: 'environment',
      description: 'No bill that expands extraction, however it is framed.',
    }),
    geography: { kinds: ['university', 'capital', 'metropolitan'], strength: 2.6, elsewhere: 0.33 },
  },
  left: {
    names: [
      { name: 'People’s Front', shortName: 'The Front' },
      { name: 'Democratic Left Coalition', shortName: 'Democratic Left' },
      { name: 'Common Wealth Movement', shortName: 'Common Wealth' },
    ],
    leaderTitle: 'Spokesperson',
    offset: makeIdeology(-0.75, 0.4, 0.35),
    prioritySector: 'health',
    floorShare: 1.1,
    cabinetDemand: 2,
    blurb:
      'Would rather be right in opposition than compromised in office, and says so at every meeting of the coalition it is in.',
    redLine: (id) => ({
      id: `${id}-austerity`,
      kind: 'ideology_axis',
      axis: 'economic',
      direction: 'positive',
      magnitude: 0.35,
      description: 'No bill that cuts what people are already receiving.',
    }),
    geography: { kinds: ['industrial', 'metropolitan', 'university'], strength: 2.5, elsewhere: 0.35 },
  },
  nationalist: {
    names: [
      { name: 'National Renewal Movement', shortName: 'Renewal' },
      { name: 'Sovereignty Party', shortName: 'Sovereignty' },
      { name: 'Patriotic Front', shortName: 'Patriotic Front' },
    ],
    leaderTitle: 'Leader',
    offset: makeIdeology(0.1, -0.75, -0.35),
    prioritySector: 'infrastructure',
    floorShare: 0.95,
    cabinetDemand: 3,
    blurb:
      'Borders, order and a grievance the other parties spent a decade declining to discuss. Difficult to govern with and increasingly difficult to govern without.',
    redLine: (id) => ({
      id: `${id}-borders`,
      kind: 'ideology_axis',
      axis: 'social',
      direction: 'positive',
      magnitude: 0.4,
      description: 'No bill that loosens the rules on who may come and stay.',
    }),
    geography: { kinds: ['post_industrial', 'coastal', 'agrarian'], strength: 2.3, elsewhere: 0.42 },
  },
  christian_democratic: {
    names: [
      { name: 'Christian Democratic Union', shortName: 'Christian Democrats' },
      { name: 'Faith and Family Alliance', shortName: 'Faith and Family' },
      { name: 'Communal Democratic Party', shortName: 'Communal Democrats' },
    ],
    leaderTitle: 'Chair',
    offset: makeIdeology(0.15, -0.45, 0.1),
    prioritySector: 'education',
    floorShare: 1.05,
    cabinetDemand: 3,
    blurb:
      'Socially cautious and economically generous, which makes it a natural partner for almost anybody and a comfortable one for nobody.',
    redLine: (id) => ({
      id: `${id}-family`,
      kind: 'bill_category',
      category: 'civic',
      description: 'No bill that redefines the family, whatever the drafting says.',
    }),
    geography: { kinds: ['agrarian', 'suburban'], strength: 2.4, elsewhere: 0.4 },
  },
  agrarian: {
    names: [
      { name: 'Landward Party', shortName: 'Landward' },
      { name: 'Country and Producers’ Union', shortName: 'Country Union' },
      { name: 'Rural Alliance', shortName: 'Rural Alliance' },
    ],
    leaderTitle: 'Warden',
    offset: makeIdeology(0.2, -0.35, -0.2),
    prioritySector: 'infrastructure',
    floorShare: 1.0,
    cabinetDemand: 2,
    blurb:
      'Speaks for land, distance and the price of diesel. Cheap to buy and expensive to cross, because the seats it holds are the ones nobody else can reach.',
    redLine: (id) => ({
      id: `${id}-rural`,
      kind: 'bill_category',
      category: 'environment',
      description: 'No bill that puts a new cost on farming without a matching payment.',
    }),
    geography: { kinds: ['agrarian', 'resource'], strength: 4.2, elsewhere: 0.16 },
  },
  regionalist: {
    names: [
      { name: 'Regional Assembly Group', shortName: 'The Regions' },
      { name: 'Autonomy Alliance', shortName: 'Autonomy' },
      { name: 'Union of the Provinces', shortName: 'The Provinces' },
    ],
    leaderTitle: 'Convenor',
    offset: makeIdeology(-0.2, 0.25, 0.15),
    prioritySector: 'education',
    floorShare: 1.0,
    cabinetDemand: 2,
    blurb:
      'Has one question and will support any government that answers it. The answer is never quite given, and the support is renewed annually.',
    redLine: (id) => ({
      id: `${id}-devolution`,
      kind: 'bill_category',
      category: 'civic',
      description: 'No bill that takes a power back from the regions.',
    }),
    geography: { kinds: [], strength: 0, elsewhere: 0 },
  },
  centrist: {
    names: [
      { name: 'Meridian Alliance', shortName: 'Meridian' },
      { name: 'Civic Forum', shortName: 'Civic Forum' },
      { name: 'Progress Union', shortName: 'Progress' },
    ],
    leaderTitle: 'Convenor',
    offset: makeIdeology(0.05, 0.2, 0.05),
    prioritySector: 'economy',
    floorShare: 1.0,
    cabinetDemand: 3,
    blurb:
      'Splits differences by instinct. Reliable in a coalition, hard to excite, and quick to leave a government that looks unserious.',
    redLine: (id) => ({
      id: `${id}-competence`,
      kind: 'ideology_axis',
      axis: 'economic',
      direction: 'negative',
      magnitude: 0.7,
      description: 'No bill that pushes economic policy sharply toward collective provision.',
    }),
    geography: { kinds: ['capital', 'suburban'], strength: 1.35, elsewhere: 0.85 },
  },
};

/* ------------------------------------------------------------------ *
 * Building the chamber
 * ------------------------------------------------------------------ */

/** A small deterministic hash, so a country always fields the same chamber. */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const axis = (v: number) => clamp(Math.round(v * 100) / 100, -1, 1);

function positionOf(profile: PoliticsProfile, family: PartyFamily): Ideology {
  const spec = FAMILIES[family];
  const spread = profile.polarisation;
  return makeIdeology(
    axis(profile.centre.economic + spec.offset.economic * spread),
    axis(profile.centre.social + spec.offset.social * spread),
    axis(profile.centre.environmental + spec.offset.environmental * spread),
  );
}

/**
 * Where one party's vote is, by region.
 *
 * Everybody but the regionalists gets their family's geography applied to
 * whatever kinds of place this country actually has. A regionalist party
 * is different in kind: it is strong in one or two NAMED regions and has
 * essentially no organisation anywhere else, which is what makes it a
 * regionalist party rather than a small national one.
 */
function geographyOf(
  family: PartyFamily,
  regions: readonly RegionTemplate[],
  profile: PoliticsProfile,
  seed: number,
): Record<string, number> | undefined {
  const spec = FAMILIES[family].geography;
  if (!spec) return undefined;

  if (family === 'regionalist') {
    /* Two regions, chosen deterministically, and nothing anywhere else.
       The biggest are skipped: a party of the capital is not regionalist. */
    const candidates = [...regions]
      .sort((a, b) => a.seats - b.seats)
      .filter((r) => r.seats >= 4)
      .slice(0, Math.max(2, Math.floor(regions.length / 2)));
    if (candidates.length === 0) return undefined;

    const home: Record<string, number> = {};
    for (const region of regions) home[region.id] = 0.04;
    const first = candidates[seed % candidates.length]!;
    const second = candidates[(seed + 3) % candidates.length]!;
    home[first.id] = 7.5;
    home[second.id] = second.id === first.id ? 7.5 : 4;
    return home;
  }

  const kinds = new Set(spec.kinds);
  const byKind = new Map(profile.regions.map((r) => [r.id, r.kind]));
  const out: Record<string, number> = {};
  for (const region of regions) {
    const kind = byKind.get(region.id);
    out[region.id] = kind && kinds.has(kind) ? spec.strength : spec.elsewhere;
  }
  return out;
}

/**
 * Where the player's own vote is.
 *
 * A party's support is concentrated where people who think like it live,
 * and the player's party is not an exception — it is simply the one whose
 * platform is chosen rather than assigned. So the geography is read off
 * that platform: whichever political family the player is standing
 * closest to, its vote is in the same kinds of place.
 *
 * This is what keeps WHERE YOU STAND deciding an election under a
 * majoritarian system. Leaving the player as the one party with no
 * geography made them uniformly competitive everywhere, which flattened
 * the difference between a platform that fits a country and one that does
 * not — and that difference is most of what a first-past-the-post country
 * is for.
 */
export function playerGeographyFor(
  key: CountryKey,
  ideology: Ideology,
): Record<string, number> | undefined {
  if (key === 'verdana') return undefined;

  const profile = findPolitics(key);
  const regions = regionsFor(key);

  /* The family the platform is nearest to, by distance on the three axes
     from that family's position in THIS country. */
  let nearest: PartyFamily = 'centrist';
  let best = Infinity;
  for (const family of Object.keys(FAMILIES) as PartyFamily[]) {
    if (family === 'regionalist') continue;
    const position = positionOf(profile, family);
    const distance =
      Math.abs(position.economic - ideology.economic) +
      Math.abs(position.social - ideology.social) +
      Math.abs(position.environmental - ideology.environmental);
    if (distance < best) {
      best = distance;
      nearest = family;
    }
  }

  const spec = FAMILIES[nearest].geography;
  if (!spec) return undefined;

  /*
   * Softened toward one. A player's party is a new entrant rather than a
   * hundred-year-old machine: it has a natural base, and it is not yet
   * absent from everywhere else.
   */
  const soften = (value: number) => Math.round((1 + (value - 1) * 0.6) * 100) / 100;
  const kinds = new Set(spec.kinds);
  const byKind = new Map(profile.regions.map((r) => [r.id, r.kind]));

  const out: Record<string, number> = {};
  for (const region of regions) {
    const kind = byKind.get(region.id);
    out[region.id] = soften(kind && kinds.has(kind) ? spec.strength : spec.elsewhere);
  }
  return out;
}

/**
 * The parties of a real country's chamber.
 *
 * One per political family the profile lists, in order, taking the bench
 * slots in order. Sector floors are a share of the same baseline the rest
 * of the budget engine works from, so a party's demand means the same
 * thing here as it does in Verdana.
 */
export function partiesFor(
  key: CountryKey,
  baselineFunding: Record<SectorKey, number>,
): PartyTemplate[] {
  if (key === 'verdana') return PARTY_TEMPLATES;

  const profile = findPolitics(key);
  const seed = hashOf(key);
  const regions = regionsFor(key);

  return profile.families.slice(0, BENCHES.length).map((entry, i) => {
    const spec = FAMILIES[entry.family];
    const bench = BENCHES[i]!;
    /* Deterministic, and different per country, so two chambers built from
       the same families do not read as the same chamber. */
    const chosen = spec.names[(seed + i * 7) % spec.names.length]!;
    const floor = Math.round(baselineFunding[spec.prioritySector] * spec.floorShare);

    return {
      id: bench.id,
      name: chosen.name,
      shortName: chosen.shortName,
      color: bench.color,
      glyph: bench.glyph,
      ideology: positionOf(profile, entry.family),
      baseStrength: Math.round(entry.weight * 100) / 100,
      leaderTitle: spec.leaderTitle,
      prioritySector: spec.prioritySector,
      sectorFloor: floor,
      cabinetDemand: spec.cabinetDemand,
      blurb: spec.blurb,
      regionStrength: geographyOf(entry.family, regions, profile, seed + i),
      redLinePool: [
        spec.redLine(bench.id),
        {
          id: `${bench.id}-${spec.prioritySector}-floor`,
          kind: 'sector_floor',
          sector: spec.prioritySector,
          threshold: Math.round(floor * 0.9),
          description:
            `${chosen.shortName} will not sit in a government that funds ` +
            `${spec.prioritySector} below ₡${Math.round(floor * 0.9)}bn a year.`,
        },
      ],
    };
  });
}

/**
 * The electoral regions of a real country.
 *
 * Real first-level divisions with roughly real population shares, turned
 * into seat counts by apportionment. The composition comes from the kind of
 * place each one is; the lean is the country's own centre plus the region's
 * offset, which is why the same kind of place votes differently in two
 * countries and the internal spread survives either way.
 */
export function regionsFor(key: CountryKey): RegionTemplate[] {
  if (key === 'verdana') return REGION_TEMPLATES;

  const profile = findPolitics(key);
  const total = profile.regions.reduce((sum, r) => sum + r.share, 0);

  /* Apportion by share, then give the remainder to the largest regions —
     the same problem every real apportionment has, solved the same way. */
  const exact = profile.regions.map((r) => (r.share / total) * TOTAL_SEATS);
  const seats = exact.map((n) => Math.max(2, Math.floor(n)));
  let spare = TOTAL_SEATS - seats.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((n, i) => ({ i, remainder: n - Math.floor(n) }))
    .sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (spare > 0) {
    seats[order[cursor % order.length]!.i] += 1;
    spare -= 1;
    cursor += 1;
  }
  while (spare < 0) {
    const biggest = seats.indexOf(Math.max(...seats));
    seats[biggest] -= 1;
    spare += 1;
  }

  return profile.regions.map((region, i) => ({
    id: region.id,
    name: region.name,
    character: REGION_KIND_CHARACTER[region.kind],
    seats: seats[i]!,
    lean: makeIdeology(
      axis(profile.centre.economic + region.lean.economic),
      axis(profile.centre.social + region.lean.social),
      axis(profile.centre.environmental + region.lean.environmental),
    ),
    composition: REGION_KIND_COMPOSITION[region.kind],
  }));
}

/* ------------------------------------------------------------------ *
 * The books
 * ------------------------------------------------------------------ */

export interface CountryFinances {
  /** Output at the start of the run, in the game's own units. */
  gdp: number;
  /** Population, millions. */
  population: number;
  /** Inherited debt, from the country's real debt ratio. */
  debt: number;
}

/**
 * What the previous government left behind.
 *
 * Output, people and debt, taken from the country table rather than from a
 * difficulty setting — which means the hardest thing about governing Italy
 * is the thing that is actually hard about governing Italy, and it is not
 * an option the player chose on the setup screen.
 */
export function financesFor(key: CountryKey): CountryFinances {
  const country = findCountry(key);
  return {
    gdp: country.gdp,
    population: country.population,
    debt: Math.round(country.gdp * country.debtRatio),
  };
}
