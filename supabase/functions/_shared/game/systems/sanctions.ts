/**
 * sanctions.ts — most effective in the first year, and eroding after.
 *
 * A SANCTION IS A RACE BETWEEN THE DAMAGE AND THE WORKAROUND. The trade
 * multiplier a fresh sanction applies is severe; every week that
 * follows, the target finds a little more of it — an intermediary, a
 * reflagged cargo, a market that will not ask where the goods came
 * from — and the multiplier eases toward `SANCTION_EROSION_FLOOR`
 * rather than staying where it started. It never gets all the way
 * back to normal: rerouting is never free, and some of the damage is
 * permanent for as long as the sanction holds. That is also why a
 * sanction is a decision with a shelf life rather than a switch a
 * government can leave on indefinitely and expect the same effect
 * from.
 */

import { SANCTION_EROSION_FLOOR, SANCTION_EROSION_RATE, SANCTION_TRADE_MULTIPLIER } from '../balance.ts';

/**
 * The trade multiplier a sanction currently applies, given how many
 * weeks it has held. Closed-form rather than iterative, so it can be
 * read directly from `sanctionedSince` without replaying every week
 * in between.
 */
export function sanctionMultiplier(weeksSanctioned: number): number {
  const decay = (1 - SANCTION_EROSION_RATE) ** Math.max(0, weeksSanctioned);
  return SANCTION_EROSION_FLOOR + (SANCTION_TRADE_MULTIPLIER - SANCTION_EROSION_FLOOR) * decay;
}

export function describeSanctionErosion(weeksSanctioned: number): string {
  const multiplier = sanctionMultiplier(weeksSanctioned);
  /* How much of the possible erosion (start to floor) has actually
     happened, as a fraction — comparable across any choice of constants,
     unlike a fixed absolute margin against the floor would be. */
  const erodedFraction =
    (multiplier - SANCTION_TRADE_MULTIPLIER) / (SANCTION_EROSION_FLOOR - SANCTION_TRADE_MULTIPLIER);
  if (weeksSanctioned < 12) {
    return 'Fresh enough that almost none of it has found a way round yet.';
  }
  if (erodedFraction > 0.85) {
    return 'Mostly evaded by now. What is left is the part that cannot be rerouted, and it holds.';
  }
  return 'Working, but a growing share of the trade it was meant to stop has found another way through.';
}
