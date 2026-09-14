/**
 * ideology.ts — the position-vector maths.
 *
 * Ideology here is purely mechanical: it decides who will work with whom and
 * which electorates warm to which party. No axis or direction is privileged.
 */

import type { Ideology, IdeologyAxis } from './types.ts';

export const AXES: IdeologyAxis[] = ['economic', 'social', 'environmental'];

/** Longest possible distance in the 3-axis cube, used to normalise. */
export const MAX_DISTANCE = Math.sqrt(3 * 2 * 2);

export function clampIdeology(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function makeIdeology(
  economic: number,
  social: number,
  environmental: number,
): Ideology {
  return {
    economic: clampIdeology(economic),
    social: clampIdeology(social),
    environmental: clampIdeology(environmental),
  };
}

/** Euclidean distance between two positions. 0 = identical. */
export function distance(a: Ideology, b: Ideology): number {
  let sum = 0;
  for (const axis of AXES) {
    const d = a[axis] - b[axis];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Distance normalised to 0..1, where 1 is maximally opposed. */
export function normalisedDistance(a: Ideology, b: Ideology): number {
  return Math.min(1, distance(a, b) / MAX_DISTANCE);
}

/**
 * Affinity in −1..1. +1 means identical positions, −1 means diametrically
 * opposed. This is the number coalition compatibility and bill alignment
 * are built on.
 */
export function affinity(a: Ideology, b: Ideology): number {
  return 1 - 2 * normalisedDistance(a, b);
}

/** Human-readable gloss of how two positions relate. Never evaluative. */
export function affinityLabel(value: number): string {
  if (value >= 0.6) return 'Close alignment';
  if (value >= 0.25) return 'Workable overlap';
  if (value >= -0.1) return 'Distant but reachable';
  if (value >= -0.45) return 'Serious differences';
  return 'Fundamentally opposed';
}

/** Describe one axis position without implying a correct end. */
export function axisLabel(axis: IdeologyAxis, value: number): string {
  const bands: Record<IdeologyAxis, [string, string]> = {
    economic: ['collective provision', 'market provision'],
    social: ['traditional order', 'individual latitude'],
    environmental: ['industrial priority', 'ecological priority'],
  };
  const [low, high] = bands[axis];
  const magnitude = Math.abs(value);
  const side = value < 0 ? low : high;
  if (magnitude < 0.15) return 'balanced';
  if (magnitude < 0.5) return `leans ${side}`;
  if (magnitude < 0.8) return `firmly ${side}`;
  return `strongly ${side}`;
}

/** Mean position of a set of parties, weighted by seats. */
export function weightedCentroid(
  entries: readonly { ideology: Ideology; weight: number }[],
): Ideology {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return makeIdeology(0, 0, 0);
  const out = { economic: 0, social: 0, environmental: 0 };
  for (const entry of entries) {
    for (const axis of AXES) {
      out[axis] += entry.ideology[axis] * entry.weight;
    }
  }
  for (const axis of AXES) out[axis] /= totalWeight;
  return out;
}
