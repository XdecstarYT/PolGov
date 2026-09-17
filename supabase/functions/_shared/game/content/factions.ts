/**
 * factions.ts — the party is not one thing.
 *
 * A leader's own benches are the first parliament they have to win. Each
 * faction holds a share of the party's MPs and sits at an offset from the
 * leader's position; when a bill strays too far from where a faction stands,
 * its members stop voting for it.
 *
 * Factions are generated relative to whatever platform the player chose at
 * setup, so a market-liberal party and a collectivist one both have a wing
 * that thinks the leadership has drifted — they just disagree about which way.
 */

import type { Ideology, IdeologyAxis } from '../types.ts';
import { clampIdeology } from '../ideology.ts';

export interface FactionTemplate {
  id: string;
  name: string;
  blurb: string;
  /** Share of the party's MPs. Shares across all factions sum to 1. */
  share: number;
  /** Loyalty to the leadership at the start of a run, 0–100. */
  loyalty: number;
  /**
   * How this faction sits relative to the leader's platform.
   * `pull` is applied per axis: positive pushes that axis up, negative down,
   * and `toCentre` drags the whole position toward zero.
   */
  pull: Partial<Record<IdeologyAxis, number>>;
  toCentre: number;
}

export const FACTION_TEMPLATES: FactionTemplate[] = [
  {
    id: 'base',
    name: 'The membership wing',
    blurb:
      'The people who joined because of what the party said it believed. Reads every compromise as a betrayal, and controls the volunteer base.',
    share: 0.3,
    loyalty: 62,
    /* Pushes the leader's own platform further in the direction it already leans. */
    pull: {},
    toCentre: -0.45,
  },
  {
    id: 'modernisers',
    name: 'The modernisers',
    blurb:
      'Convinced the party only wins from the centre. Well-connected, media-friendly, and quietly contemptuous of the membership.',
    share: 0.26,
    loyalty: 70,
    pull: {},
    toCentre: 0.55,
  },
  {
    id: 'economic',
    name: 'The Treasury group',
    blurb:
      'Organised entirely around the public finances. Will vote with anyone who holds the line on borrowing and against anyone who does not.',
    share: 0.22,
    loyalty: 66,
    pull: { economic: 0.5 },
    toCentre: 0.15,
  },
  {
    id: 'social',
    name: 'The civil liberties group',
    blurb:
      'Small, disciplined, and single-issue about the reach of the state. Rebels loudly and without apology.',
    share: 0.22,
    loyalty: 58,
    pull: { social: 0.5 },
    toCentre: 0.1,
  },
];

/**
 * Where a faction actually stands, given the leader's platform.
 *
 * `toCentre` is the important one: a negative value means the faction sits
 * further out than the leader on the party's own axis (the membership wing
 * that thinks the leadership has sold out), and a positive value means it
 * sits closer to the middle (the modernisers who think the leadership is
 * unelectable).
 */
export function factionPosition(
  template: FactionTemplate,
  leaderIdeology: Ideology,
): Ideology {
  const axes: IdeologyAxis[] = ['economic', 'social', 'environmental'];
  const out = { economic: 0, social: 0, environmental: 0 } as Ideology;

  for (const axis of axes) {
    const base = leaderIdeology[axis];
    /* Scale toward or away from the centre, then apply any directional pull. */
    const scaled = base * (1 - template.toCentre);
    out[axis] = clampIdeology(scaled + (template.pull[axis] ?? 0));
  }

  return out;
}
