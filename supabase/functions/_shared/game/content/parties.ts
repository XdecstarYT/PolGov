/**
 * parties.ts — the parliament of Verdana.
 *
 * Every party here is invented. The position vectors exist to make coalition
 * arithmetic interesting, not to argue for anything: each party is written as
 * a coherent set of priorities with real costs attached, and the game never
 * indicates which set is correct.
 */

import type { Ideology, RedLine, SectorKey } from '../types.ts';
import { makeIdeology } from '../ideology.ts';

export interface PartyTemplate {
  id: string;
  name: string;
  shortName: string;
  /**
   * The party's bench colour, light mode. This is the serialised value; the
   * UI reads `--color-bench-<id>` instead so the chamber re-steps for dark
   * mode rather than inverting. Keep the two in step.
   */
  color: string;
  /** Non-colour identifier — the UI always pairs colour with this. */
  glyph: string;
  ideology: Ideology;
  /** Electoral mass before approval and campaigning are applied. */
  baseStrength: number;
  leaderTitle: string;
  /** Sector this party fights for at the budget table. */
  prioritySector: SectorKey;
  /** Annual funding this party demands for its priority sector, ₡bn. */
  sectorFloor: number;
  cabinetDemand: number;
  redLinePool: RedLine[];
  /** One line of character, shown on party cards. */
  blurb: string;
  /**
   * Where the party's vote is, by region id.
   *
   * Absent for the invented country, whose seven parties are national.
   * The generated chambers of real countries use it, because a party with
   * a tenth of the vote all in one place wins seats and one with a tenth
   * spread evenly wins none — and a model without that seats three
   * parties in every majoritarian country however many stand.
   */
  regionStrength?: Record<string, number>;
}

export const PARTY_TEMPLATES: PartyTemplate[] = [
  {
    id: 'meridian',
    name: 'Meridian Alliance',
    shortName: 'Meridian',
    color: '#0089a3',
    glyph: '◆',
    ideology: makeIdeology(0.15, 0.1, 0.0),
    baseStrength: 1.0,
    leaderTitle: 'Convenor',
    prioritySector: 'economy',
    sectorFloor: 228,
    cabinetDemand: 3,
    blurb:
      'Splits differences by instinct. Reliable in a coalition, hard to excite, and quick to leave a government that looks unserious.',
    redLinePool: [
      {
        id: 'meridian-fiscal',
        kind: 'ideology_axis',
        axis: 'economic',
        direction: 'negative',
        magnitude: 0.65,
        description: 'No bill that pushes economic policy sharply toward collective provision.',
      },
      {
        id: 'meridian-econ-floor',
        kind: 'sector_floor',
        sector: 'economy',
        threshold: 204,
        description: 'Economic programme funding stays at or above ₡204bn a year.',
      },
    ],
  },
  {
    id: 'concord',
    name: 'Concord Union',
    shortName: 'Concord',
    color: '#a62f2a',
    glyph: '●',
    ideology: makeIdeology(-0.65, 0.3, 0.2),
    baseStrength: 1.05,
    leaderTitle: 'General Secretary',
    prioritySector: 'health',
    sectorFloor: 372,
    cabinetDemand: 4,
    blurb:
      'Built on workplace federations. Will trade almost anything for service funding, and almost nothing for cuts to it.',
    redLinePool: [
      {
        id: 'concord-health-floor',
        kind: 'sector_floor',
        sector: 'health',
        threshold: 336,
        description: 'Health funding stays at or above ₡336bn a year.',
      },
      {
        id: 'concord-labour',
        kind: 'ideology_axis',
        axis: 'economic',
        direction: 'positive',
        magnitude: 0.6,
        description: 'No bill that pushes economic policy sharply toward market provision.',
      },
    ],
  },
  {
    id: 'enterprise',
    name: 'Free Enterprise League',
    shortName: 'Enterprise',
    color: '#2d5ea8',
    glyph: '▲',
    ideology: makeIdeology(0.75, -0.1, -0.35),
    baseStrength: 0.95,
    leaderTitle: 'Chair',
    prioritySector: 'economy',
    sectorFloor: 264,
    cabinetDemand: 3,
    blurb:
      'Treats the budget line as the only honest sentence in a manifesto. Tolerant on most things, immovable on the deficit.',
    redLinePool: [
      {
        id: 'enterprise-tax',
        kind: 'ideology_axis',
        axis: 'economic',
        direction: 'negative',
        magnitude: 0.5,
        description: 'No bill that raises the broad tax burden.',
      },
      {
        id: 'enterprise-econ-floor',
        kind: 'sector_floor',
        sector: 'economy',
        threshold: 240,
        description: 'Economic programme funding stays at or above ₡240bn a year.',
      },
    ],
  },
  {
    id: 'heritage',
    name: 'Heritage Assembly',
    shortName: 'Heritage',
    color: '#932f63',
    glyph: '■',
    ideology: makeIdeology(0.3, -0.7, -0.2),
    baseStrength: 0.9,
    leaderTitle: 'Speaker',
    prioritySector: 'infrastructure',
    sectorFloor: 252,
    cabinetDemand: 3,
    blurb:
      'Organised around continuity and locality. Suspicious of rapid change in either direction, and unusually loyal once committed.',
    redLinePool: [
      {
        id: 'heritage-social',
        kind: 'ideology_axis',
        axis: 'social',
        direction: 'positive',
        magnitude: 0.6,
        description: 'No bill that rapidly loosens established social arrangements.',
      },
      {
        id: 'heritage-infra-floor',
        kind: 'sector_floor',
        sector: 'infrastructure',
        threshold: 216,
        description: 'Infrastructure funding stays at or above ₡216bn a year.',
      },
    ],
  },
  {
    id: 'verdant',
    name: 'Verdant Compact',
    shortName: 'Verdant',
    color: '#57964a',
    glyph: '✦',
    ideology: makeIdeology(-0.3, 0.45, 0.85),
    baseStrength: 0.72,
    leaderTitle: 'Convenor',
    prioritySector: 'environment',
    sectorFloor: 216,
    cabinetDemand: 2,
    blurb:
      'Single-minded about the long horizon, and candid that the bill falls due now. Small, disciplined, and willing to collapse a government.',
    redLinePool: [
      {
        id: 'verdant-env-floor',
        kind: 'sector_floor',
        sector: 'environment',
        threshold: 192,
        description: 'Environment funding stays at or above ₡192bn a year.',
      },
      {
        id: 'verdant-extraction',
        kind: 'ideology_axis',
        axis: 'environmental',
        direction: 'negative',
        magnitude: 0.45,
        description: 'No bill that expands extraction or weakens environmental standards.',
      },
    ],
  },
  {
    id: 'civic',
    name: 'Civic Forum',
    shortName: 'Civic',
    color: '#6d4fa2',
    glyph: '◇',
    ideology: makeIdeology(-0.1, 0.75, 0.35),
    baseStrength: 0.8,
    leaderTitle: 'Spokesperson',
    prioritySector: 'education',
    sectorFloor: 264,
    cabinetDemand: 2,
    blurb:
      'Process-minded and reform-minded in equal measure. Cheap to keep happy on money, expensive to keep happy on procedure.',
    redLinePool: [
      {
        id: 'civic-education-floor',
        kind: 'sector_floor',
        sector: 'education',
        threshold: 228,
        description: 'Education funding stays at or above ₡228bn a year.',
      },
      {
        id: 'civic-security',
        kind: 'bill_category',
        category: 'security',
        description: 'No expansion of surveillance or emergency powers.',
      },
    ],
  },
  {
    id: 'landward',
    name: 'Landward Party',
    shortName: 'Landward',
    color: '#8f6a16',
    glyph: '▼',
    ideology: makeIdeology(0.25, -0.35, 0.15),
    baseStrength: 0.68,
    leaderTitle: 'Warden',
    prioritySector: 'infrastructure',
    sectorFloor: 240,
    cabinetDemand: 2,
    blurb:
      'Speaks for the districts that feel governed rather than represented. Transactional, and open about it.',
    redLinePool: [
      {
        id: 'landward-infra-floor',
        kind: 'sector_floor',
        sector: 'infrastructure',
        threshold: 228,
        description: 'Infrastructure funding stays at or above ₡228bn a year.',
      },
      {
        id: 'landward-centralisation',
        kind: 'ideology_axis',
        axis: 'social',
        direction: 'positive',
        magnitude: 0.7,
        description: 'No bill that concentrates authority away from the districts.',
      },
    ],
  },
];

/**
 * Emblems offered to the player at party setup.
 *
 * The colour is not a choice. Seven printed colours are spoken for by the
 * seven other parties, and an eighth hue that stays distinguishable from all
 * seven — in both modes, for protanopes and deuteranopes as well as everyone
 * else — does not exist inside the lightness band the chamber is drawn in.
 * So your party is printed in ink, the colour of the page's own type: the
 * highest-separation mark available, and the one nobody else can be given.
 * What you pick is the emblem beside it, which is the identifier that
 * survives being photocopied, projected, or read by someone who sees no
 * colour at all.
 */
export const PLAYER_EMBLEMS = [
  { glyph: '★', name: 'Star' },
  { glyph: '❖', name: 'Lozenge' },
  { glyph: '✥', name: 'Cross' },
  { glyph: '⬟', name: 'Pentagon' },
  { glyph: '❂', name: 'Sunburst' },
  { glyph: '⬢', name: 'Hexagon' },
] as const;

/** The reserved ink your party is printed in. See `--color-bench-you`. */
export const PLAYER_INK = '#25231d';
