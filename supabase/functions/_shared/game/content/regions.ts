/**
 * regions.ts — the eight electoral regions of Verdana.
 *
 * Seat counts total TOTAL_SEATS. Each region's `lean` is the baseline position
 * of its electorate; parties do well where they sit close to it. The character
 * lines exist to make the campaign map read as a place rather than a table.
 */

import type { Ideology } from '../types.ts';
import { makeIdeology } from '../ideology.ts';

export interface RegionTemplate {
  id: string;
  name: string;
  character: string;
  seats: number;
  lean: Ideology;
}

export const REGION_TEMPLATES: RegionTemplate[] = [
  {
    id: 'halloway',
    name: 'Halloway Basin',
    character: 'Heavy industry along the river. Dense, unionised, and used to being courted.',
    seats: 30,
    lean: makeIdeology(-0.45, 0.1, -0.1),
  },
  {
    id: 'ashmere',
    name: 'Ashmere Coast',
    character: 'Port cities and universities. Young, mobile, and quick to punish complacency.',
    seats: 24,
    lean: makeIdeology(-0.05, 0.55, 0.35),
  },
  {
    id: 'callow',
    name: 'Callow Downs',
    character: 'Arable country and market towns. Turnout is high and loyalty runs in families.',
    seats: 22,
    lean: makeIdeology(0.3, -0.5, 0.1),
  },
  {
    id: 'ternhill',
    name: 'Ternhill',
    character: 'The capital and its commuter belt. Professional, well-informed, and marginal.',
    seats: 26,
    lean: makeIdeology(0.35, 0.25, 0.05),
  },
  {
    id: 'estmoor',
    name: 'Estmoor',
    character: 'Mill towns past their peak. Long memories, thin patience, decisive when it moves.',
    seats: 20,
    lean: makeIdeology(-0.5, -0.3, -0.15),
  },
  {
    id: 'karrow',
    name: 'Karrow Highlands',
    character: 'Sparse uplands and protected watershed. Few seats, but they move as a bloc.',
    seats: 16,
    lean: makeIdeology(-0.15, 0.05, 0.6),
  },
  {
    id: 'sable',
    name: 'Sable Reach',
    character: 'Energy fields and refineries. One industry, one argument, and it never changes.',
    seats: 22,
    lean: makeIdeology(0.55, -0.25, -0.6),
  },
  {
    id: 'vell',
    name: 'Vell Archipelago',
    character: 'Fishing harbours and summer trade. Small electorates, outsized swings.',
    seats: 20,
    lean: makeIdeology(0.05, 0.2, 0.45),
  },
];
