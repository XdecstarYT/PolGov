/**
 * diplomats.test.ts — the mission, and who is sent to run it.
 *
 * A named ambassador's dividend is checked as a second, independent
 * figure on top of the flat settled dividend `diplomacy.ts` already
 * pays — never a replacement for it, which is the whole design.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import { buildAmbassador, ambassadorDividend, tierStabiliserMultiplier } from '../systems/diplomats.ts';
import {
  DIPLOMAT_TRAITS,
  EMBASSY_TIERS,
  findDiplomatTrait,
  findEmbassyTier,
  type DiplomatTrait,
} from '../content/diplomats.ts';
import { AMBASSADOR_SKILL_DIVIDEND } from '../balance.ts';

describe('sending an ambassador', () => {
  it('draws a named, skilled appointee with one or two traits', () => {
    const rng = new Rng(1);
    const ambassador = buildAmbassador('verdana', rng, new Set(), 10);
    expect(ambassador.name.length).toBeGreaterThan(0);
    expect(ambassador.skill).toBeGreaterThanOrEqual(0);
    expect(ambassador.skill).toBeLessThanOrEqual(100);
    expect(ambassador.traits.length).toBeGreaterThanOrEqual(1);
    expect(ambassador.traits.length).toBeLessThanOrEqual(2);
    expect(new Set(ambassador.traits).size).toBe(ambassador.traits.length);
  });

  it('avoids a name already in use', () => {
    const rng = new Rng(2);
    const first = buildAmbassador('verdana', rng, new Set(), 0);
    const second = buildAmbassador('verdana', rng, new Set([first.name]), 0);
    expect(second.name).not.toBe(first.name);
  });

  it('lists a template for every trait and tier', () => {
    for (const t of DIPLOMAT_TRAITS) expect(findDiplomatTrait(t.key)).toBe(t);
    for (const t of EMBASSY_TIERS) expect(findEmbassyTier(t.key)).toBe(t);
  });
});

describe('the dividend is a second figure, not a replacement', () => {
  it('scales with skill', () => {
    const low = { id: 'a', name: 'A', skill: 10, traits: [], postedTurn: 0 };
    const high = { id: 'b', name: 'B', skill: 90, traits: [], postedTurn: 0 };
    expect(ambassadorDividend(high)).toBeGreaterThan(ambassadorDividend(low));
    expect(ambassadorDividend(high) - ambassadorDividend(low)).toBeCloseTo(
      (90 - 10) * AMBASSADOR_SKILL_DIVIDEND,
      6,
    );
  });

  it('adds every trait bonus on top of the skill figure', () => {
    const base = { id: 'a', name: 'A', skill: 50, traits: [] as DiplomatTrait[], postedTurn: 0 };
    const charming = { ...base, traits: ['charming' as const] };
    expect(ambassadorDividend(charming)).toBeCloseTo(
      ambassadorDividend(base) + findDiplomatTrait('charming').dividendBonus,
      6,
    );
  });

  it('a blunt trait can make the dividend worse than an untraited appointee of equal skill', () => {
    const plain = { id: 'a', name: 'A', skill: 50, traits: [] as DiplomatTrait[], postedTurn: 0 };
    const blunt = { ...plain, traits: ['blunt' as const] };
    expect(ambassadorDividend(blunt)).toBeLessThan(ambassadorDividend(plain));
  });
});

describe('embassy tier', () => {
  it('a high commission slows drift far more than a consulate does', () => {
    expect(tierStabiliserMultiplier('high_commission')).toBeGreaterThan(
      tierStabiliserMultiplier('standard'),
    );
    expect(tierStabiliserMultiplier('standard')).toBeGreaterThan(tierStabiliserMultiplier('consulate'));
  });

  it('the standard tier is the untouched baseline — a multiplier of exactly 1', () => {
    expect(tierStabiliserMultiplier('standard')).toBe(1);
  });
});
