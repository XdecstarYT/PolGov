/**
 * palette.test.ts — the bench palette is a computed result, not a taste.
 *
 * The seven party colours were chosen by running the six data-visualisation
 * checks and moving steps until every one passed, in both themes, against the
 * real surfaces the chamber is drawn on. Nothing about that survives someone
 * later nudging a hex because it "looked nicer" — so the checks run here.
 *
 * What is asserted:
 *   · The seating order. The CVD and normal-vision checks are adjacent-pair
 *     checks, so they only mean something in the order the parties actually
 *     sit in the hemicycle. Reorder the parties and the guarantee is void.
 *   · Both themes, against paper AND panel. A colour that clears the page can
 *     still fail on a card, and cards are where the charts live.
 *   · The player's ink against all seven, not just its neighbours — the player
 *     seats by their own ideology and can land anywhere in the arc.
 *   · That the CSS tokens and the serialised hexes in parties.ts agree.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validate, type ValidationRow } from '../../../scripts/validate_palette.js';
import { PARTY_TEMPLATES, PLAYER_INK } from '../../game/content/parties.ts';

/** Left to right by economic position — the order the chamber is seated in. */
const SEATING = ['concord', 'verdant', 'civic', 'meridian', 'landward', 'heritage', 'enterprise'];

/** Pull the bench tokens out of a `@theme` / `:root.dark` block. */
function benchTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, id, hex] of block.matchAll(/--color-bench-([a-z]+):\s*(#[0-9a-f]{6});/g)) {
    out[id!] = hex!;
  }
  return out;
}

/* Read the stylesheet itself: `?raw` comes back empty under Vitest, because
   the CSS plugin claims the file before the raw loader sees it. */
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

const darkAt = css.indexOf(':root.dark');
const light = benchTokens(css.slice(0, darkAt));
const dark = benchTokens(css.slice(darkAt));

const inSeatingOrder = (tokens: Record<string, string>) => SEATING.map((id) => tokens[id]!);

/* The surfaces a mark is actually drawn on: the page, and the cards on it. */
const SURFACES = {
  light: { paper: '#f2efe7', panel: '#fbf9f4' },
  dark: { paper: '#100f0d', panel: '#1a1815' },
};

const rowsOf = (palette: string[], mode: 'light' | 'dark', surface: string): ValidationRow[] =>
  validate(palette, { mode, surface }).report;
const find = (rows: ValidationRow[], name: string) => rows.find((r) => r[0].startsWith(name))!;

describe('the bench palette', () => {
  it('defines all seven benches plus the player, in both themes', () => {
    for (const tokens of [light, dark]) {
      for (const id of SEATING) expect(tokens[id], `missing --color-bench-${id}`).toBeTruthy();
      expect(tokens.you).toBeTruthy();
    }
  });

  it('matches the hexes serialised into the party content', () => {
    for (const template of PARTY_TEMPLATES) {
      expect(template.color, `${template.id} colour drifted from its CSS token`).toBe(
        light[template.id],
      );
    }
    expect(PLAYER_INK).toBe(light.you);
  });

  for (const mode of ['light', 'dark'] as const) {
    for (const [where, surface] of Object.entries(SURFACES[mode])) {
      describe(`${mode} mode on ${where}`, () => {
        const palette = inSeatingOrder(mode === 'light' ? light : dark);
        const rows = rowsOf(palette, mode, surface);

        it('keeps every bench inside the lightness band', () => {
          expect(find(rows, 'Lightness band')[2]).toMatch(/^all 7 inside/);
        });

        it('keeps every bench above the chroma floor', () => {
          expect(find(rows, 'Chroma floor')[2]).toMatch(/^all 7 >=/);
        });

        it('separates adjacent benches for protanopes and deuteranopes', () => {
          const row = find(rows, 'CVD separation');
          /* "floor" (ΔE 6–8) would be legal with secondary encoding, which the
             chamber has — but it was solved outright, so hold the higher bar. */
          expect(row[1], row[2]).toBe('pass');
        });

        it('separates adjacent benches under ordinary vision', () => {
          expect(find(rows, 'Normal-vision floor')[1], find(rows, 'Normal-vision floor')[2]).toBe(
            'pass',
          );
        });

        it('holds 3:1 against the surface', () => {
          expect(find(rows, 'Contrast vs surface')[1], find(rows, 'Contrast vs surface')[2]).toBe(
            'pass',
          );
        });
      });
    }
  }

  /*
   * The player is not one of the seven. They seat by their own ideology, so
   * their mark can land beside ANY bench — which is why ink, and not an eighth
   * hue, is the only thing that works: no eighth hue clears this bar in the
   * dark band at all.
   */
  for (const mode of ['light', 'dark'] as const) {
    it(`separates the player's ink from all seven benches in ${mode} mode`, () => {
      const tokens = mode === 'light' ? light : dark;
      const surface = SURFACES[mode].paper;
      for (const id of SEATING) {
        const rows = rowsOf([tokens.you!, tokens[id]!], mode, surface);
        const normal = Number(/ΔE ([\d.]+)/.exec(String(find(rows, 'Normal-vision')[2]))![1]);
        const cvd = Number(/ΔE ([\d.]+)/.exec(String(find(rows, 'CVD separation')[2]))![1]);
        expect(normal, `player ink vs ${id} under ordinary vision`).toBeGreaterThanOrEqual(15);
        expect(cvd, `player ink vs ${id} under simulated CVD`).toBeGreaterThanOrEqual(8);
      }
    });
  }
});
