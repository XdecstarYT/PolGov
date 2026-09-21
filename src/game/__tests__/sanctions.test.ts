/**
 * sanctions.test.ts — most effective in the first year, and eroding
 * after.
 *
 * A sanction is a race between the damage and the workaround: fresh
 * sanctions apply the full trade multiplier, and every week that
 * follows eases it toward a floor that is never as bad as the fresh
 * sanction and never as good as no sanction at all — rerouting is
 * never free.
 */

import { describe, expect, it } from 'vitest';
import { describeSanctionErosion, sanctionMultiplier } from '../systems/sanctions.ts';
import { SANCTION_EROSION_FLOOR, SANCTION_TRADE_MULTIPLIER } from '../balance.ts';

describe('a fresh sanction', () => {
  it('applies the full documented multiplier at week zero', () => {
    expect(sanctionMultiplier(0)).toBeCloseTo(SANCTION_TRADE_MULTIPLIER, 6);
  });
});

describe('erosion', () => {
  it('eases the multiplier upward as the sanction ages', () => {
    expect(sanctionMultiplier(52)).toBeGreaterThan(sanctionMultiplier(4));
    expect(sanctionMultiplier(200)).toBeGreaterThan(sanctionMultiplier(52));
  });

  it('never fully returns to no sanction at all', () => {
    expect(sanctionMultiplier(10000)).toBeLessThan(1);
  });

  it('never eases past the documented floor', () => {
    expect(sanctionMultiplier(10000)).toBeLessThanOrEqual(SANCTION_EROSION_FLOOR + 1e-6);
  });

  it('the floor is genuinely worse than no sanction and genuinely better than a fresh one', () => {
    expect(SANCTION_EROSION_FLOOR).toBeGreaterThan(SANCTION_TRADE_MULTIPLIER);
    expect(SANCTION_EROSION_FLOOR).toBeLessThan(1);
  });
});

describe('reading it', () => {
  it('describes a fresh sanction as not yet evaded', () => {
    expect(describeSanctionErosion(2)).toMatch(/none of it has found a way round/);
  });

  it('describes a long-held sanction near the floor as mostly evaded', () => {
    expect(describeSanctionErosion(500)).toMatch(/Mostly evaded/);
  });

  it('describes a mid-life sanction as actively eroding', () => {
    expect(describeSanctionErosion(30)).toMatch(/found another way through/);
  });
});
