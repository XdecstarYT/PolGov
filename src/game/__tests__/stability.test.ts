/**
 * stability.test.ts — a whole run, played to the end, checked for nonsense.
 *
 * Every other test in this suite asserts something about one system. This
 * one asserts the only thing that matters about all of them together: that
 * a game played from the first week to the last produces numbers rather
 * than NaN, and stays inside the bands the engine claims for itself.
 *
 * It is deliberately a *bad* player — it resolves every event with the
 * first option, never passes a budget, never touches a tax rate. That is
 * the worst case for the engine, because every stabiliser the player would
 * normally reach for is left untouched, and anything that runs away will
 * run away here first.
 *
 * Three seeds and one term, so it runs in seconds. The full version — a
 * dozen seeds and four terms each — is the one worth running by hand after
 * any change to the economy, the budget or the world, and it is what found
 * the tension ratchet, the unbounded journal and the debt with no ending.
 */

import { describe, expect, it } from 'vitest';
import { TURNS_PER_TERM } from '../balance.ts';
import { createGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import { validateSnapshot } from '../serverGuards.ts';
import type { GameState } from '../types.ts';

/** Play until the run ends or the turn budget is spent. */
function play(seed: number, maxTurns: number): { state: GameState; turns: number } {
  let state = createGame({
    gameId: `stability-${seed}`,
    difficulty: seed % 3 === 0 ? 'fractured' : seed % 3 === 1 ? 'standard' : 'stable',
    playerPartyName: 'Reform Coalition',
    playerColor: '#8c2f27',
    playerGlyph: '★',
    playerIdeology: { economic: -0.1 + (seed % 5) * 0.08, social: 0.2, environmental: 0.2 },
    seed,
  });

  let turns = 0;
  let guard = 0;

  while (state.status === 'active' && turns < maxTurns && guard < maxTurns * 20) {
    guard += 1;
    const before = state.turnNumber;

    if (state.phase === 'coalition' && state.negotiation) {
      for (const candidate of state.negotiation.candidates) {
        state = applyIntent(state, {
          type: 'negotiation_accept',
          partyId: candidate.partyId,
        }).state;
      }
      const formed = applyIntent(state, { type: 'negotiation_form_government' });
      state = formed.error
        ? applyIntent(state, { type: 'negotiation_abandon' }).state
        : formed.state;
      continue;
    }
    if (String(state.phase) === 'election') {
      state = applyIntent(state, { type: 'acknowledge_election' }).state;
      continue;
    }

    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, {
        type: 'resolve_event',
        eventId: event.id,
        choiceIndex: 0,
      }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    if (state.turnNumber !== before) turns += 1;
  }

  expect(guard).toBeLessThan(maxTurns * 20);
  return { state, turns };
}

/** Everything that should be a number, and the bands it should be inside. */
function nonsense(state: GameState): string[] {
  const bad: string[] = [];
  const finite = (label: string, value: number) => {
    if (!Number.isFinite(value)) bad.push(`${label} is ${value}`);
  };

  finite('approval', state.approval);
  finite('political capital', state.politicalCapital);
  finite('treasury', state.treasury);
  finite('debt', state.debt);
  finite('output', state.economy.gdp);
  finite('growth', state.economy.growth);
  finite('inflation', state.economy.inflation);
  finite('unemployment', state.economy.unemployment);
  for (const sector of state.sectors) finite(`${sector.key} health`, sector.health);
  for (const arm of state.military.arms) {
    finite(`${arm.key} readiness`, arm.readiness);
    finite(`${arm.key} strength`, arm.strength);
  }
  for (const flow of state.trade.flows) {
    finite(`exports to ${flow.nation}`, flow.exports);
    finite(`imports from ${flow.nation}`, flow.imports);
  }
  for (const pair of state.world.pairs) finite(`${pair.a}/${pair.b}`, pair.standing);
  finite('tension', state.world.tension);
  finite('reputation', state.world.reputation);
  finite('collection', state.intelligence.capability);

  if (state.approval < -0.01 || state.approval > 100.01) {
    bad.push(`approval outside its band: ${state.approval}`);
  }
  if (state.economy.gdp <= 0) bad.push(`output at or below zero: ${state.economy.gdp}`);
  if (state.world.tension < -0.01 || state.world.tension > 100.01) {
    bad.push(`tension outside its band: ${state.world.tension}`);
  }
  return bad;
}

describe('a whole run', () => {
  for (const seed of [1, 2, 3]) {
    it(`produces numbers rather than nonsense, from seed ${seed}`, () => {
      const { state, turns } = play(seed, TURNS_PER_TERM);
      expect(turns).toBeGreaterThan(0);
      expect(nonsense(state)).toEqual([]);
      /* And a state the server would still accept, which is the same
         question asked by the other half of the system. */
      if (state.status === 'active') expect(validateSnapshot(state)).toBeNull();
    }, 120000);
  }

  it('does not let the journal grow with the run', () => {
    /*
     * Every intent deep-clones the whole state, so a journal that grew with
     * the run would make the game slower the longer it is played. This is
     * the guard on that, and it is a real one: it was not true.
     */
    const { state } = play(4, TURNS_PER_TERM);
    expect(state.logs.length).toBeLessThanOrEqual(12);
  }, 120000);

  it('keeps the world from pinning itself to the rails', () => {
    /*
     * Tension was a one-way ratchet and every run sat at a hundred by the
     * second term, which made the whole world engine constant. It has to
     * come back down when nothing is feeding it.
     */
    const { state } = play(5, TURNS_PER_TERM);
    expect(state.world.tension).toBeLessThan(85);
  }, 120000);
});
