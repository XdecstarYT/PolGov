/**
 * transfer.test.ts — a run you can take with you.
 *
 * The tests here are about the two ways this goes wrong in practice: a
 * file that is not a run, and a run that is already here. Both have to do
 * something a player would expect, and the second has to not destroy the
 * thing it was restoring.
 */

import { describe, expect, it } from 'vitest';
import { createStandardGame } from '../../game/setup.ts';
import { resolveTurn } from '../../game/turn.ts';
import { fileNameFor, readRun, serialiseRun } from '../transfer.ts';
import type { GameState } from '../../game/types.ts';

const run = createStandardGame('transfer');

describe('writing a run out', () => {
  it('names the file after the run rather than its id', () => {
    const name = fileNameFor(run);
    expect(name).toMatch(/^statecraft-verdana-/);
    expect(name).toContain('t1w1');
    expect(name.endsWith('.json')).toBe(true);
    /* No uuid, no spaces, nothing a filesystem will argue about. */
    expect(name).toMatch(/^[a-z0-9.-]+$/);
  });

  it('writes the whole run, indented, so a save can be read', () => {
    const text = serialiseRun(run);
    expect(text).toContain('\n  ');
    expect(JSON.parse(text).parties.length).toBe(run.parties.length);
  });
});

describe('reading one back', () => {
  it('round-trips a run that has been played', () => {
    let played: GameState = { ...run, phase: 'agenda', negotiation: null };
    for (let i = 0; i < 6; i += 1) played = resolveTurn(played);

    const result = readRun(serialiseRun(played), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.id).toBe(played.id);
    expect(result.state.turnNumber).toBe(played.turnNumber);
    expect(result.state.approval).toBeCloseTo(played.approval, 6);
    expect(result.state.cast.leaders.map((p) => p.name)).toEqual(
      played.cast.leaders.map((p) => p.name),
    );
    expect(result.renamed).toBe(false);
  });

  it('gives an imported copy its own id rather than overwriting the original', () => {
    /* Nobody expects a restore to destroy the thing it was restoring. */
    const result = readRun(serialiseRun(run), [run.id]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.renamed).toBe(true);
    expect(result.state.id).not.toBe(run.id);
  });

  it('is idempotent: the same file twice lands on the same copy', () => {
    const once = readRun(serialiseRun(run), [run.id]);
    const twice = readRun(serialiseRun(run), [run.id]);
    expect(once.ok && twice.ok && once.state.id === twice.state.id).toBe(true);
  });

  it('says why, in the player’s terms, when a file is not a run', () => {
    expect(readRun('not json at all', [])).toEqual({
      ok: false,
      reason: 'That file is not readable as JSON.',
    });
    expect(readRun('[1, 2, 3]', []).ok).toBe(false);
    expect(readRun('null', [])).toEqual({
      ok: false,
      reason: 'That file does not contain a run.',
    });

    const notARun = readRun(JSON.stringify({ hello: 'world' }), []);
    expect(notARun.ok).toBe(false);
    if (!notARun.ok) expect(notARun.reason).toMatch(/not a Statecraft run/);
  });

  it('opens a run exported from a build that had fewer systems in it', () => {
    /*
     * The reason imports go through `migrateState` at all. A save written
     * before the cast, the scales or the country existed is still a run,
     * and has to open rather than be rejected as malformed.
     */
    const older = JSON.parse(serialiseRun(run)) as Record<string, unknown>;
    delete older.cast;
    delete older.country;
    delete older.moneyScale;
    delete older.peopleScale;
    delete older.debtTolerance;

    const result = readRun(JSON.stringify(older), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.country).toBe('verdana');
    expect(result.state.moneyScale).toBe(1);
    expect(result.state.cast.leaders.length).toBeGreaterThan(1);
  });
});
