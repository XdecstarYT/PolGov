/**
 * channels.ts — where a campaign can actually be heard.
 *
 * The whole point of modelling twenty kinds of voter is that they do not all
 * consume the same media. Radio reaches the people driving to work; social
 * platforms reach people who will not see a broadcast advertisement at all;
 * newspapers reach the ones who already vote reliably.
 *
 * `reach` is a multiplier per segment: 0 means that group never sees it, 1
 * means it lands squarely. Nothing reaches everybody, and the cheapest
 * channels reach the people least likely to turn out.
 */

import type { SegmentKey } from './segments.ts';

export type ChannelKey =
  | 'television'
  | 'radio'
  | 'newspapers'
  | 'social'
  | 'podcasts'
  | 'doorstep';

export interface ChannelTemplate {
  key: ChannelKey;
  label: string;
  blurb: string;
  /** Party funds spent per push, in ₡m. */
  cost: number;
  /** Political capital per push. */
  pcCost: number;
  /** How much of this push changes minds. */
  persuasion: number;
  /** How much of it drags non-voters to the polls. */
  mobilisation: number;
  /** Segments this channel actually reaches, 0–1. */
  reach: Partial<Record<SegmentKey, number>>;
  /** Requires party members on the ground rather than money. */
  requiresVolunteers?: boolean;
}

export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
  {
    key: 'television',
    label: 'Television',
    blurb:
      'The broadest reach available and the most expensive. Lands hardest with the people who watch scheduled broadcasts, which is not the young.',
    cost: 9,
    pcCost: 3,
    persuasion: 1,
    mobilisation: 0.5,
    reach: {
      retirees: 1,
      suburban_families: 0.9,
      non_graduates: 0.85,
      homeowners: 0.8,
      rural_households: 0.75,
      faith_communities: 0.7,
      industrial_workers: 0.7,
      low_income: 0.6,
      professionals: 0.5,
      graduates: 0.45,
      young_renters: 0.2,
      students: 0.15,
    },
  },
  {
    key: 'radio',
    label: 'Radio',
    blurb:
      'Cheap, regional, and disproportionately effective with people who spend time driving. The channel that still reaches the districts furthest from the capital.',
    cost: 3.5,
    pcCost: 2,
    persuasion: 0.75,
    mobilisation: 0.6,
    reach: {
      farmers: 1,
      rural_households: 0.95,
      coastal_trades: 0.9,
      industrial_workers: 0.8,
      small_traders: 0.75,
      retirees: 0.7,
      non_graduates: 0.65,
      union_members: 0.6,
      suburban_families: 0.5,
      professionals: 0.4,
    },
  },
  {
    key: 'newspapers',
    label: 'Newspapers',
    blurb:
      'A shrinking audience that votes with near-total reliability. Expensive per head and worth it, because almost everyone it reaches turns out.',
    cost: 5,
    pcCost: 2,
    persuasion: 0.95,
    mobilisation: 0.2,
    reach: {
      graduates: 0.9,
      professionals: 0.9,
      high_income: 0.85,
      homeowners: 0.8,
      retirees: 0.8,
      business_owners: 0.75,
      public_sector: 0.6,
      faith_communities: 0.5,
      students: 0.25,
    },
  },
  {
    key: 'social',
    label: 'Social platforms',
    blurb:
      'Cheap, fast, and aimed squarely at people no broadcast will ever reach. Persuades less than it mobilises, and travels further than intended.',
    cost: 2,
    pcCost: 2,
    persuasion: 0.5,
    mobilisation: 1,
    reach: {
      students: 1,
      young_renters: 0.95,
      newcomers: 0.8,
      graduates: 0.7,
      professionals: 0.6,
      suburban_families: 0.5,
      low_income: 0.5,
      non_graduates: 0.4,
      retirees: 0.15,
    },
  },
  {
    key: 'podcasts',
    label: 'Podcasts and long-form',
    blurb:
      'A small audience that listens for an hour at a time. The only channel where an argument can be made at length, and it changes minds accordingly.',
    cost: 2.5,
    pcCost: 3,
    persuasion: 1.15,
    mobilisation: 0.35,
    reach: {
      graduates: 0.85,
      professionals: 0.8,
      students: 0.7,
      young_renters: 0.65,
      public_sector: 0.5,
      business_owners: 0.4,
    },
  },
  {
    key: 'doorstep',
    label: 'Door knocking',
    blurb:
      'The most effective persuasion there is, and the hardest to scale — it costs volunteers rather than money, so it is limited by how many members you actually have.',
    cost: 0.4,
    pcCost: 4,
    persuasion: 1.3,
    mobilisation: 1.2,
    requiresVolunteers: true,
    reach: {
      low_income: 0.9,
      young_renters: 0.85,
      industrial_workers: 0.85,
      suburban_families: 0.8,
      newcomers: 0.8,
      non_graduates: 0.8,
      rural_households: 0.6,
      students: 0.6,
      retirees: 0.7,
      faith_communities: 0.7,
    },
  },
];

export function channelTemplate(key: ChannelKey): ChannelTemplate {
  const found = CHANNEL_TEMPLATES.find((c) => c.key === key);
  if (!found) throw new Error(`channels: unknown channel ${key}`);
  return found;
}
