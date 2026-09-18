/**
 * bench.ts — which ink a party is printed in.
 *
 * Colour lives in CSS (`--color-bench-*` in `index.css`) rather than in the
 * component, because the chamber is re-stepped for dark mode rather than
 * inverted: the same seven hues, different lightness, chosen against the dark
 * surface. Returning a `var()` means a theme flip repaints every seat, every
 * meter and every legend swatch without a single re-render.
 *
 * `party.color` stays the serialised light-mode value and is the fallback, so
 * anything that needs a literal hex — a canvas, an export, an email — still
 * gets one.
 */

/** Parties that own a reserved slot in the seating order. */
const SEATED = new Set([
  'concord',
  'verdant',
  'civic',
  'meridian',
  'landward',
  'heritage',
  'enterprise',
]);

/**
 * The colour to paint a party's marks in.
 *
 * The player is always ink — see the note on `PLAYER_EMBLEMS`. Any party
 * outside the seven falls back to its stored hex, which keeps a save from a
 * future ruleset rendering as nothing at all.
 */
export function benchInk(party: { id: string; color: string; isPlayer?: boolean }): string {
  if (party.isPlayer) return 'var(--color-bench-you)';
  if (SEATED.has(party.id)) return `var(--color-bench-${party.id}, ${party.color})`;
  return party.color;
}

/**
 * Where a party sits, left to right, by its economic position. The seating
 * order is what makes the palette's adjacency guarantee mean anything: only
 * neighbours in this order ever touch in the hemicycle.
 */
export function seatOrder(party: { ideology: { economic: number } }): number {
  return party.ideology.economic;
}
