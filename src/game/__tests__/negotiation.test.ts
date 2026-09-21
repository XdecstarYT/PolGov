/**
 * negotiation.test.ts — sweetening an offer, and what that costs later.
 *
 * The check that matters: goodwill fades far faster than relations or
 * grievance move, and each further sweetening this run is worth less
 * than the last — a concession that never gets cheaper stops being a
 * concession and becomes the price.
 */

import { describe, expect, it } from 'vitest';
import {
  decayGoodwill,
  goodwillSigningRelief,
  sweetenOffer,
  sweetenValue,
} from '../systems/negotiation.ts';
import {
  GOODWILL_DECAY_RATE,
  GRIEVANCE_DECAY_RATE,
  SWEETEN_OFFER_BASE_EFFECT,
  SWEETEN_OFFER_DECAY,
} from '../balance.ts';

describe('sweetening', () => {
  it('the first sweetening this run is worth the full base amount', () => {
    expect(sweetenValue(0)).toBe(SWEETEN_OFFER_BASE_EFFECT);
  });

  it('each further sweetening is worth less, on the documented decay', () => {
    expect(sweetenValue(1)).toBeCloseTo(SWEETEN_OFFER_BASE_EFFECT * SWEETEN_OFFER_DECAY, 6);
    expect(sweetenValue(2)).toBeLessThan(sweetenValue(1));
    expect(sweetenValue(5)).toBeLessThan(sweetenValue(1));
  });

  it('adds goodwill and increments the count, clamped to 100', () => {
    const result = sweetenOffer(0, 0);
    expect(result.goodwill).toBe(SWEETEN_OFFER_BASE_EFFECT);
    expect(result.sweetenedThisRun).toBe(1);

    const maxed = sweetenOffer(95, 0);
    expect(maxed.goodwill).toBeLessThanOrEqual(100);
  });
});

describe('goodwill is a loan, not a gift', () => {
  it('fades far faster per week than grievance does', () => {
    expect(GOODWILL_DECAY_RATE).toBeGreaterThan(GRIEVANCE_DECAY_RATE * 10);
  });

  it('is mostly gone within a handful of weeks if not used', () => {
    let goodwill = 100;
    for (let w = 0; w < 8; w += 1) goodwill = decayGoodwill(goodwill);
    expect(goodwill).toBeLessThan(35);
  });

  it('never goes negative', () => {
    let goodwill = 100;
    for (let w = 0; w < 500; w += 1) goodwill = decayGoodwill(goodwill);
    expect(goodwill).toBeGreaterThanOrEqual(0);
  });
});

describe('signing relief', () => {
  it('rises with goodwill and is zero at zero goodwill', () => {
    expect(goodwillSigningRelief(0)).toBe(0);
    expect(goodwillSigningRelief(50)).toBeGreaterThan(goodwillSigningRelief(10));
  });
});
