/**
 * softPower.ts — moving everyone a little, instead of anyone a lot.
 *
 * `softPowerBoost` is added to the target every relationship in the
 * world drifts toward, not to any one relationship's drift rate — the
 * mechanical difference between this and an embassy, which only slows
 * how fast a single relationship gets worse. Soft power raises where
 * every relationship settles, uniformly, which is the honest shape of
 * what culture, broadcasting and scholarships actually buy: goodwill
 * nobody can point to a specific week of, spread everywhere at once.
 */

import { SOFT_POWER_BOOST_WEIGHT, SOFT_POWER_DECAY_RATE, SOFT_POWER_INVEST_EFFECT } from '../balance.ts';

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/** How much every relationship's target relations figure rises, from the current soft power stock. */
export function softPowerBoost(softPower: number): number {
  return softPower * SOFT_POWER_BOOST_WEIGHT;
}

/** One week's fade. Slower than a sweetened offer, faster than grievance — a standing programme, not a durable institution. */
export function decaySoftPower(softPower: number): number {
  return clamp100(softPower * (1 - SOFT_POWER_DECAY_RATE));
}

export function investSoftPower(softPower: number): number {
  return clamp100(softPower + SOFT_POWER_INVEST_EFFECT);
}
