/**
 * grievances.ts — what a country remembers after relations recover.
 *
 * `GRIEVANCE_DECAY_RATE` is set well below `RELATIONS_DRIFT_RATE`, on
 * purpose: relations can be back to neutral within a couple of years of
 * a sanction being lifted, while the grievance from having been
 * sanctioned at all is still live a decade later — which is exactly
 * the asymmetry that makes "on good terms" and "trusted" different
 * claims.
 */

import { GRIEVANCE_DECAY_RATE, GRIEVANCE_SIGNING_WEIGHT } from '../balance.ts';
import { findGrievanceCause, type GrievanceCause } from '../content/grievances.ts';

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/** Adds a grievance in one go, from a specific, namable cause. */
export function addGrievance(current: number, cause: GrievanceCause): number {
  return clamp100(current + findGrievanceCause(cause).weight);
}

/** One week's fade. Slow, deliberately, relative to how fast relations themselves move. */
export function decayGrievance(current: number): number {
  return clamp100(current * (1 - GRIEVANCE_DECAY_RATE));
}

/** How much extra relations a new treaty needs, on top of its ordinary threshold, from grievance alone. */
export function grievanceSigningPenalty(grievance: number): number {
  return grievance * GRIEVANCE_SIGNING_WEIGHT;
}

export function describeGrievance(grievance: number): string {
  if (grievance > 60) {
    return 'They have not forgotten, and relations recovering will not be the same as being forgiven.';
  }
  if (grievance > 25) {
    return 'A real memory sits under the relations number, quietly making everything a little harder than it looks.';
  }
  return 'Nothing standing in the way that the relations figure does not already show.';
}
