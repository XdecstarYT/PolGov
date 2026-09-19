/**
 * migrate.test.ts — saves outlive the shape they were written in.
 *
 * Every time the engine grows a subsystem, every save written before it
 * becomes a state with a hole in it. Reading one crashes on the first
 * access, and what the player sees is a white screen rather than a message.
 *
 * So these tests take a current save, remove things that did not exist at
 * various points in the engine's history, and check that the result is a
 * run that can be played rather than a crash — and that a save which is not
 * a run at all is refused rather than half-repaired.
 */

import { describe, expect, it } from 'vitest';
import { migrateState } from '../migrate.ts';
import { createStandardGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import { validateSnapshot } from '../serverGuards.ts';
import type { GameState } from '../types.ts';

/** A save with some fields deleted, the way an older build would have left it. */
function without(state: GameState, ...paths: string[]): unknown {
  const copy = structuredClone(state) as unknown as Record<string, unknown>;
  for (const path of paths) {
    const parts = path.split('.');
    let node: Record<string, unknown> = copy;
    for (const part of parts.slice(0, -1)) {
      node = node[part] as Record<string, unknown>;
      if (!node) break;
    }
    if (node) delete node[parts[parts.length - 1]!];
  }
  return copy;
}

const current = () => createStandardGame('migrate-test');

describe('what it refuses', () => {
  it('refuses anything that is not an object', () => {
    expect(migrateState(null)).toBeNull();
    expect(migrateState(undefined)).toBeNull();
    expect(migrateState('a save')).toBeNull();
    expect(migrateState(42)).toBeNull();
  });

  it('refuses a save that is not a run', () => {
    /* A refusal the caller can report, rather than a crash three screens
       later with nothing to say about it. */
    expect(migrateState({})).toBeNull();
    expect(migrateState(without(current(), 'parties'))).toBeNull();
    expect(migrateState(without(current(), 'sectors'))).toBeNull();
    expect(migrateState({ ...current(), parties: [] })).toBeNull();
  });
});

describe('what it repairs', () => {
  it('passes a current save through unchanged in substance', () => {
    const state = current();
    const migrated = migrateState(structuredClone(state))!;
    expect(migrated).not.toBeNull();
    expect(migrated.turnNumber).toBe(state.turnNumber);
    expect(migrated.parties.length).toBe(state.parties.length);
    expect(validateSnapshot(migrated)).toBeNull();
  });

  it('fills in every subsystem that arrived after the save was written', () => {
    const old = without(
      current(),
      'military',
      'intelligence',
      'trade',
      'crises',
      'world.pairs',
      'world.wars',
      'world.globalEvents',
      'world.organisations',
      'world.resolutions',
      'budget.supply',
    );

    const migrated = migrateState(old)!;
    expect(migrated).not.toBeNull();
    expect(migrated.military.arms.length).toBeGreaterThan(0);
    expect(migrated.intelligence.capability).toBeGreaterThan(0);
    expect(migrated.trade.flows.length).toBeGreaterThan(0);
    expect(migrated.crises).toEqual([]);
    expect(migrated.world.pairs.length).toBeGreaterThan(0);
    expect(migrated.world.wars).toEqual([]);
    expect(migrated.world.globalEvents).toEqual([]);
    expect(migrated.world.organisations.length).toBeGreaterThan(0);
    expect(migrated.budget.supply).toEqual([]);
  });

  it('gives the nations back the live figures they did not used to have', () => {
    const state = current();
    const old = structuredClone(state) as unknown as GameState;
    for (const nation of old.world.nations) {
      delete (nation as unknown as Record<string, unknown>).power;
      delete (nation as unknown as Record<string, unknown>).posture;
    }

    const migrated = migrateState(old)!;
    for (const nation of migrated.world.nations) {
      expect(Number.isFinite(nation.power)).toBe(true);
      expect(nation.posture).toBeTruthy();
    }
  });

  it('dates an undated journal from what it does have', () => {
    const state = current();
    const old = structuredClone(state) as unknown as GameState;
    old.logs = [{ turnNumber: 7, entries: [] } as never];

    const migrated = migrateState(old)!;
    expect(migrated.logs[0]!.week).toBe(7);
  });

  it('produces a run that can actually be played', () => {
    /* The test that matters. A migration that type-checks and then throws on
       the first turn has repaired nothing. */
    const old = without(
      current(),
      'military',
      'intelligence',
      'trade',
      'crises',
      'world.pairs',
      'world.wars',
      'world.globalEvents',
    );

    let state = migrateState(old)!;
    if (state.phase === 'coalition' && state.negotiation) {
      for (const candidate of state.negotiation.candidates) {
        state = applyIntent(state, {
          type: 'negotiation_accept',
          partyId: candidate.partyId,
        }).state;
      }
      state = applyIntent(state, { type: 'negotiation_form_government' }).state;
    }

    for (let i = 0; i < 12; i += 1) {
      for (const event of state.events.filter((e) => !e.resolved)) {
        state = applyIntent(state, {
          type: 'resolve_event',
          eventId: event.id,
          choiceIndex: 0,
        }).state;
      }
      state = applyIntent(state, { type: 'advance_phase' }).state;
    }

    expect(state.status).toBe('active');
    expect(Number.isFinite(state.approval)).toBe(true);
    expect(Number.isFinite(state.economy.gdp)).toBe(true);
    expect(validateSnapshot(state)).toBeNull();
  });

  it('adds what is missing and never edits what is there', () => {
    /* A migration that quietly corrects a value is a migration that can
       quietly break a run. */
    const state = current();
    const tweaked = structuredClone(state);
    tweaked.approval = 17.5;
    tweaked.debt = 4242;
    tweaked.intelligence.capability = 3;

    const migrated = migrateState(tweaked)!;
    expect(migrated.approval).toBe(17.5);
    expect(migrated.debt).toBe(4242);
    expect(migrated.intelligence.capability).toBe(3);
  });
});
