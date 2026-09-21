/**
 * diplomacyWeb.test.ts — an alliance is never just with one country.
 *
 * Read directly off the third-party web (`world.pairs`, built in
 * Engine 3A/3G) rather than asserted: a country's rivals are exactly
 * the ones whose standing toward it is already hostile, and how much
 * the ripple costs scales with exactly how hostile.
 */

import { describe, expect, it } from 'vitest';
import { allianceRippleTargets, hostilityToward } from '../systems/diplomacyWeb.ts';
import { RIVAL_HOSTILITY_THRESHOLD, RIVAL_RIPPLE_WEIGHT } from '../balance.ts';
import type { NationPair } from '../types.ts';

const pair = (a: string, b: string, standing: number): NationPair =>
  ({ a: a as never, b: b as never, standing });

describe('hostility toward', () => {
  it('reads standing from either order of the pair, as a positive hostility figure', () => {
    const pairs = [pair('russia', 'united_states', -60)];
    expect(hostilityToward(pairs, 'russia' as never, 'united_states' as never)).toBe(60);
    expect(hostilityToward(pairs, 'united_states' as never, 'russia' as never)).toBe(60);
  });

  it('is zero for a friendly or neutral pair', () => {
    const pairs = [pair('russia', 'united_states', 40)];
    expect(hostilityToward(pairs, 'russia' as never, 'united_states' as never)).toBe(0);
  });

  it('is zero when the pair is not tracked at all', () => {
    expect(hostilityToward([], 'russia' as never, 'united_states' as never)).toBe(0);
  });
});

describe('alliance ripple targets', () => {
  it('only counts a nation as a rival once hostility crosses the threshold', () => {
    const pairs = [
      pair('china', 'united_states', -(RIVAL_HOSTILITY_THRESHOLD - 5)),
      pair('russia', 'united_states', -(RIVAL_HOSTILITY_THRESHOLD + 5)),
    ];
    const targets = allianceRippleTargets(pairs, 'united_states' as never, [
      'china' as never,
      'russia' as never,
      'united_states' as never,
    ]);
    expect(targets.map((t) => t.nation)).toEqual(['russia']);
  });

  it('never includes the ally itself, however hostile it is toward its own template implies', () => {
    const pairs: NationPair[] = [];
    const targets = allianceRippleTargets(pairs, 'united_states' as never, ['united_states' as never]);
    expect(targets).toEqual([]);
  });

  it('scales the relations cost directly with how hostile the rival already is', () => {
    const pairs = [
      pair('china', 'united_states', -50),
      pair('russia', 'united_states', -80),
    ];
    const targets = allianceRippleTargets(pairs, 'united_states' as never, [
      'china' as never,
      'russia' as never,
    ]);
    const china = targets.find((t) => t.nation === 'china')!;
    const russia = targets.find((t) => t.nation === 'russia')!;
    expect(russia.relationsCost).toBeGreaterThan(china.relationsCost);
    expect(china.relationsCost).toBeCloseTo(50 * RIVAL_RIPPLE_WEIGHT, 6);
  });

  it('returns nothing when nobody in the world is hostile enough to the new ally', () => {
    const pairs = [pair('china', 'united_states', 20)];
    expect(
      allianceRippleTargets(pairs, 'united_states' as never, ['china' as never]),
    ).toEqual([]);
  });
});
