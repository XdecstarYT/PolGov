/**
 * diplomacyWeb.ts — an alliance is never just with one country.
 *
 * Every other system in this engine reads relations between this
 * country and one other. `world.pairs` (built in Engine 3A/3G) already
 * tracks what every OTHER pair of countries thinks of each other — the
 * half of the world that is not about this one — and until now nothing
 * connected the two. A defence pact with a country is, whether anybody
 * here said so or not, also a signal to that country's own rivals: the
 * balance-of-power reflex that decides most of what a government's
 * neighbours actually do about a new alliance, read directly off data
 * the world simulation was already keeping.
 */

import { RIVAL_HOSTILITY_THRESHOLD, RIVAL_RIPPLE_WEIGHT } from '../balance.ts';
import { pairKey } from './worldSim.ts';
import type { NationKey } from '../content/nations.ts';
import type { NationPair } from '../types.ts';

/** How hostile the given nation is toward `ally`, from the third-party web — 0 if the pair is not tracked. */
export function hostilityToward(pairs: readonly NationPair[], nation: NationKey, ally: NationKey): number {
  const pair = pairs.find((p) => pairKey(p.a, p.b) === pairKey(nation, ally));
  if (!pair) return 0;
  return Math.max(0, -pair.standing);
}

export interface RippleTarget {
  nation: NationKey;
  /** Points of relations this rival's view of us worsens by. */
  relationsCost: number;
}

/**
 * Who reads a new alliance as aimed at them, and by how much.
 *
 * Only nations genuinely hostile to the new ally count as rivals at
 * all — a merely cool relationship is not a rivalry — and the ripple
 * scales with exactly how hostile, because the sharper that rivalry
 * already is, the more pointed a defence pact with their enemy reads.
 */
export function allianceRippleTargets(
  pairs: readonly NationPair[],
  ally: NationKey,
  candidates: readonly NationKey[],
): RippleTarget[] {
  return candidates
    .filter((nation) => nation !== ally)
    .map((nation) => ({
      nation,
      hostility: hostilityToward(pairs, nation, ally),
    }))
    .filter((t) => t.hostility >= RIVAL_HOSTILITY_THRESHOLD)
    .map((t) => ({ nation: t.nation, relationsCost: t.hostility * RIVAL_RIPPLE_WEIGHT }));
}
