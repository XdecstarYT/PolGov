/**
 * diplomats.ts — the mission, and who is sent to run it.
 *
 * A NAMED AMBASSADOR IS A SECOND DIVIDEND, NOT A REPLACEMENT. The flat
 * per-month figure a settled ambassador earns in `diplomacy.ts` stays
 * untouched; this file only adds what a specific, skilled appointee is
 * worth on top of it, and what tier of mission that appointee has to
 * work with.
 */

import { AMBASSADOR_SKILL_DIVIDEND } from '../balance.ts';
import {
  findDiplomatTrait,
  findEmbassyTier,
  type DiplomatTrait,
  type EmbassyTier,
} from '../content/diplomats.ts';
import { makeName } from './personas.ts';
import type { Rng } from '../rng.ts';
import type { CountryKey } from '../content/world/countries.ts';
import type { Ambassador } from '../types.ts';

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/** Sends a named appointee, drawn against the host country's own naming bank. */
export function buildAmbassador(
  hostCountry: CountryKey,
  rng: Rng,
  used: Set<string>,
  turn: number,
): Ambassador {
  const traits: DiplomatTrait[] = [];
  for (let attempt = 0; attempt < 10 && traits.length < 2; attempt += 1) {
    const pick = DIPLOMAT_TRAIT_KEYS[rng.int(0, DIPLOMAT_TRAIT_KEYS.length - 1)]!;
    if (!traits.includes(pick)) traits.push(pick);
  }
  return {
    id: `amb-${turn}-${Math.round(rng.range(1000, 9999))}`,
    name: makeName(rng, hostCountry, used),
    skill: clamp100(40 + rng.range(0, 40)),
    traits,
    postedTurn: turn,
  };
}

const DIPLOMAT_TRAIT_KEYS: DiplomatTrait[] = ['connected', 'blunt', 'meticulous', 'charming'];

/** What a named ambassador is worth this month, on top of the flat settled dividend. */
export function ambassadorDividend(ambassador: Ambassador): number {
  const traitBonus = ambassador.traits.reduce(
    (sum, t) => sum + findDiplomatTrait(t).dividendBonus,
    0,
  );
  return ambassador.skill * AMBASSADOR_SKILL_DIVIDEND + traitBonus;
}

/** How much the tier multiplies the embassy's own stabilising effect. */
export function tierStabiliserMultiplier(tier: EmbassyTier): number {
  return findEmbassyTier(tier).stabiliserMultiplier;
}
