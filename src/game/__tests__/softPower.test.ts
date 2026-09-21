/**
 * softPower.test.ts — moving everyone a little, instead of anyone a
 * lot.
 *
 * The property that matters: `softPowerBoost` is a single figure
 * applied uniformly, not aimed at one country — unlike every other
 * instrument in the diplomacy engine (embassy, ambassador, sweetened
 * offer, sanction), all of which are bilateral by construction.
 */

import { describe, expect, it } from 'vitest';
import { decaySoftPower, investSoftPower, softPowerBoost } from '../systems/softPower.ts';
import { SOFT_POWER_INVEST_EFFECT } from '../balance.ts';

describe('soft power', () => {
  it('investing raises the stock by the documented effect, clamped to 100', () => {
    expect(investSoftPower(0)).toBeCloseTo(SOFT_POWER_INVEST_EFFECT, 6);
    expect(investSoftPower(97)).toBeLessThanOrEqual(100);
  });

  it('the boost rises with the stock and is zero at zero stock', () => {
    expect(softPowerBoost(0)).toBe(0);
    expect(softPowerBoost(50)).toBeGreaterThan(softPowerBoost(10));
  });

  it('decays slowly rather than resetting between weeks', () => {
    const after = decaySoftPower(50);
    expect(after).toBeLessThan(50);
    expect(after).toBeGreaterThan(45);
  });

  it('never goes negative over a very long run without reinvestment', () => {
    let stock = 100;
    for (let w = 0; w < 5000; w += 1) stock = decaySoftPower(stock);
    expect(stock).toBeGreaterThanOrEqual(0);
  });
});
