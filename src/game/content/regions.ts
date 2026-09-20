/**
 * regions.ts — the eight electoral regions of Verdana.
 *
 * Seat counts total TOTAL_SEATS. Each region's `lean` is the baseline position
 * of its electorate; parties do well where they sit close to it. The character
 * lines exist to make the campaign map read as a place rather than a table.
 */

import type { Ideology } from '../types.ts';
import type { RegionKind } from './world/politics.ts';
import { makeIdeology } from '../ideology.ts';
import type { SegmentKey } from './segments.ts';

export interface RegionTemplate {
  id: string;
  name: string;
  character: string;
  seats: number;
  /**
   * What kind of place it is, which is what decides how much of it lives
   * in a town. A national urbanisation rate conceals this completely.
   */
  kind: RegionKind;
  /**
   * Summary position of the electorate here, kept for display and for the
   * campaign map. The authoritative model is `composition` below — this is
   * the shorthand, not the source of truth.
   */
  lean: Ideology;
  /**
   * Who actually lives here, as relative weights per voter segment. Segments
   * overlap deliberately — a graduate may also be a young renter — so these
   * are weights on a shared electorate, not exclusive shares of it. A region's
   * politics is emergent from this mix.
   */
  composition: Partial<Record<SegmentKey, number>>;
}

export const REGION_TEMPLATES: RegionTemplate[] = [
  {
    id: 'halloway',
    kind: 'industrial',
    name: 'Halloway Basin',
    character: 'Heavy industry along the river. Dense, unionised, and used to being courted.',
    seats: 30,
    lean: makeIdeology(-0.45, 0.1, -0.1),
    composition: {
      industrial_workers: 26,
      union_members: 20,
      low_income: 16,
      non_graduates: 18,
      suburban_families: 12,
      public_sector: 9,
      homeowners: 8,
      retirees: 9,
      young_renters: 8,
      newcomers: 7,
    },
  },
  {
    id: 'ashmere',
    kind: 'university',
    name: 'Ashmere Coast',
    character: 'Port cities and universities. Young, mobile, and quick to punish complacency.',
    seats: 24,
    lean: makeIdeology(-0.05, 0.55, 0.35),
    composition: {
      students: 20,
      graduates: 22,
      young_renters: 20,
      professionals: 16,
      newcomers: 12,
      coastal_trades: 10,
      public_sector: 10,
      suburban_families: 9,
      low_income: 8,
      retirees: 6,
    },
  },
  {
    id: 'callow',
    kind: 'agrarian',
    name: 'Callow Downs',
    character: 'Arable country and market towns. Turnout is high and loyalty runs in families.',
    seats: 22,
    lean: makeIdeology(0.3, -0.5, 0.1),
    composition: {
      farmers: 24,
      rural_households: 22,
      homeowners: 16,
      faith_communities: 14,
      retirees: 14,
      small_traders: 12,
      non_graduates: 12,
      suburban_families: 8,
    },
  },
  {
    id: 'ternhill',
    kind: 'capital',
    name: 'Ternhill',
    character: 'The capital and its commuter belt. Professional, well-informed, and marginal.',
    seats: 26,
    lean: makeIdeology(0.35, 0.25, 0.05),
    composition: {
      professionals: 26,
      graduates: 20,
      homeowners: 18,
      high_income: 15,
      suburban_families: 16,
      young_renters: 12,
      business_owners: 11,
      public_sector: 9,
      newcomers: 8,
    },
  },
  {
    id: 'estmoor',
    kind: 'post_industrial',
    name: 'Estmoor',
    character: 'Mill towns past their peak. Long memories, thin patience, decisive when it moves.',
    seats: 20,
    lean: makeIdeology(-0.5, -0.3, -0.15),
    composition: {
      industrial_workers: 20,
      non_graduates: 22,
      low_income: 20,
      retirees: 16,
      union_members: 12,
      faith_communities: 10,
      small_traders: 9,
      rural_households: 8,
    },
  },
  {
    id: 'karrow',
    kind: 'agrarian',
    name: 'Karrow Highlands',
    character: 'Sparse uplands and protected watershed. Few seats, but they move as a bloc.',
    seats: 16,
    lean: makeIdeology(-0.15, 0.05, 0.6),
    composition: {
      rural_households: 24,
      farmers: 16,
      graduates: 12,
      retirees: 14,
      homeowners: 12,
      low_income: 10,
      coastal_trades: 6,
      public_sector: 8,
    },
  },
  {
    id: 'sable',
    kind: 'resource',
    name: 'Sable Reach',
    character: 'Energy fields and refineries. One industry, one argument, and it never changes.',
    seats: 22,
    lean: makeIdeology(0.55, -0.25, -0.6),
    composition: {
      industrial_workers: 24,
      business_owners: 14,
      non_graduates: 20,
      homeowners: 14,
      union_members: 12,
      small_traders: 10,
      rural_households: 10,
      high_income: 7,
    },
  },
  {
    id: 'vell',
    kind: 'coastal',
    name: 'Vell Archipelago',
    character: 'Fishing harbours and summer trade. Small electorates, outsized swings.',
    seats: 20,
    lean: makeIdeology(0.05, 0.2, 0.45),
    composition: {
      coastal_trades: 26,
      small_traders: 16,
      retirees: 16,
      rural_households: 14,
      homeowners: 12,
      low_income: 10,
      young_renters: 8,
      newcomers: 6,
    },
  },
];
