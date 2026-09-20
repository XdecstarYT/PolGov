/**
 * transfer.ts — taking a run with you.
 *
 * A save lives in browser storage, or in an account when one is signed in.
 * Both are somewhere a player cannot reach: clearing site data removes the
 * first and an outage hides the second, and a sixteen-year run is hours of
 * somebody's attention either way.
 *
 * So a run can be written out as a file and read back in. It is the whole
 * state, uncompressed and indented, because a save you can open in a text
 * editor is a save you can reason about — and because a bug report with a
 * run attached is worth twenty without one.
 *
 * Coming back in, the file goes through `migrateState` exactly as a stored
 * save does. That is the important part: a run exported from an older
 * build opens in a newer one, and a file that is not a run at all is
 * rejected rather than half-loaded.
 */

import type { GameState } from '../game/index.ts';

/**
 * How a run is brought up to date.
 *
 * Passed in rather than imported, so this module carries no dependency on
 * the engine and the title screen does not download forty thousand lines
 * of rules to render a list of saves. The caller supplies the real
 * `migrateState`; a test can supply itself.
 */
export type Migrate = (raw: unknown) => GameState | null;

/** What a run is called on disk. Legible, sortable, and not a UUID. */
export function fileNameFor(state: GameState): string {
  const country = state.countryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const party = (state.parties.find((p) => p.isPlayer)?.shortName ?? 'run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return `statecraft-${country}-${party}-t${state.termNumber}w${state.turnNumber}.json`;
}

/** Serialise a run. Indented on purpose: a save should be readable. */
export function serialiseRun(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Hand the player a file.
 *
 * Returns false rather than throwing when the browser will not allow it —
 * a failed download must not take the interface with it.
 */
export function downloadRun(state: GameState): boolean {
  try {
    const blob = new Blob([serialiseRun(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameFor(state);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export type ImportResult =
  | { ok: true; state: GameState; renamed: boolean }
  | { ok: false; reason: string };

/**
 * Read a run back.
 *
 * Every failure is named in the player's own terms rather than returned as
 * a boolean, because "that file is not a Statecraft run" and "that run is
 * from a build this one cannot open" need different things done about them.
 *
 * A run that is already on this device is given a fresh id, so importing a
 * copy of a run you are playing gives you a second run rather than
 * overwriting the first. Nobody expects a restore to destroy the thing it
 * was restoring.
 */
export function readRun(
  text: string,
  existingIds: readonly string[],
  migrateState: Migrate,
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not readable as JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'That file does not contain a run.' };
  }

  const migrated = migrateState(parsed);
  if (!migrated) {
    return {
      ok: false,
      reason:
        'That file is JSON, but it is not a Statecraft run — or it is missing too much to open.',
    };
  }

  if (existingIds.includes(migrated.id)) {
    return {
      ok: true,
      renamed: true,
      state: { ...migrated, id: freshId(migrated.id) },
    };
  }

  return { ok: true, state: migrated, renamed: false };
}

/**
 * A new id for an imported copy.
 *
 * Derived rather than random so that importing the same file twice in one
 * session is idempotent in the way a player would expect: the second
 * import lands on the same copy rather than making a third.
 */
function freshId(id: string): string {
  return `${id}-imported`;
}
