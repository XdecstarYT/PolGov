/**
 * Types for the vendored palette validator.
 *
 * The script itself is plain JavaScript on purpose — it is meant to be run
 * straight from a shell (`node scripts/validate_palette.js "#…,#…" --mode
 * light`) with no build step in the way. This declaration is only so the
 * regression test in src/ui/__tests__/palette.test.ts can import it under the
 * same strictness as the rest of the app.
 */

/** One check: its name, its state, and the human-readable detail. */
export type ValidationRow = [
  name: string,
  state: boolean | 'pass' | 'floor' | 'fail' | 'relief',
  detail: string,
];

export interface ValidationResult {
  report: ValidationRow[];
  /** False if any check hard-failed. WARN bands do not clear this flag. */
  ok: boolean;
}

export function validate(
  palette: readonly string[],
  options?: {
    mode?: 'light' | 'dark';
    /** The colour the marks are drawn on. Defaults per mode. */
    surface?: string;
    /** `adjacent` for stacks, bars and lines; `all` for scatter and maps. */
    pairs?: 'adjacent' | 'all';
  },
): ValidationResult;

export function validateOrdinal(
  palette: readonly string[],
  options?: { mode?: 'light' | 'dark'; surface?: string },
): ValidationResult;

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number;
