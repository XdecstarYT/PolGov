/**
 * negotiation.ts — sweetening an offer, and what that costs later.
 *
 * A SWEETENER USED TOO OFTEN STOPS BEING A SWEETENER AND BECOMES THE
 * EXPECTED PRICE. The first concession this run is worth its full
 * value; each one after that is worth less, on the same decaying curve
 * a reshuffle is (`cabinet.ts`) — because a country that has been
 * sweetened three times has learned something about how this
 * government negotiates, and stops treating the fourth as generous.
 *
 * GOODWILL IS A LOAN, NOT A GIFT. It fades fast — faster than
 * relations themselves move — so an offer has to be used soon after
 * it is sweetened or the concession is simply spent for nothing.
 */

import {
  GOODWILL_DECAY_RATE,
  GOODWILL_SIGNING_WEIGHT,
  SWEETEN_OFFER_BASE_EFFECT,
  SWEETEN_OFFER_DECAY,
} from '../balance.ts';

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/** What one more sweetening is worth this run — less each time it is used. */
export function sweetenValue(sweetenedThisRun: number): number {
  return SWEETEN_OFFER_BASE_EFFECT * SWEETEN_OFFER_DECAY ** sweetenedThisRun;
}

export function sweetenOffer(
  goodwill: number,
  sweetenedThisRun: number,
): { goodwill: number; sweetenedThisRun: number } {
  return {
    goodwill: clamp100(goodwill + sweetenValue(sweetenedThisRun)),
    sweetenedThisRun: sweetenedThisRun + 1,
  };
}

/** One week's fade. Fast, deliberately — an offer left unused is spent for nothing. */
export function decayGoodwill(goodwill: number): number {
  return clamp100(goodwill * (1 - GOODWILL_DECAY_RATE));
}

/** How much extra room current goodwill buys against a treaty's signing threshold. */
export function goodwillSigningRelief(goodwill: number): number {
  return goodwill * GOODWILL_SIGNING_WEIGHT;
}
