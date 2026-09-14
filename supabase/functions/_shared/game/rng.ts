/**
 * rng.ts — deterministic pseudo-randomness.
 *
 * The whole simulation is reproducible from (initial seed, sequence of player
 * intents). The generator state lives in GameState.rngState, so the server can
 * replay a turn and reach the same outcome the client predicted — which is
 * what makes server authority checkable rather than merely asserted.
 */

/** mulberry32: small, fast, good enough distribution for game events. */
export function nextRandom(state: number): { value: number; state: number } {
  let s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/**
 * A cursor over the deterministic stream. Callers thread one of these through
 * a resolution step and write `cursor.state` back into the game state.
 */
export class Rng {
  state: number;

  constructor(state: number) {
    this.state = state | 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    const { value, state } = nextRandom(this.state);
    this.state = state;
    return value;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty list');
    return items[this.int(0, items.length - 1)]!;
  }

  /** Weighted pick. Weights must be non-negative and not all zero. */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    if (items.length === 0) throw new Error('Rng.pickWeighted: empty list');
    const weights = items.map((item) => Math.max(0, weightOf(item)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i]!;
      if (roll <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  /** Fisher–Yates, non-mutating. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }
}

/** Derive a stable numeric seed from any string (e.g. a game id). */
export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
