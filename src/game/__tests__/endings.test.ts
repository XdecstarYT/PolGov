import { describe, expect, it } from 'vitest';
import { applyIntent, runElection } from '../turn.ts';
import { buildNegotiation, playerIsLargestParty } from '../systems/coalition.ts';
import { computeLegacy } from '../systems/legacy.ts';
import { createStandardGame } from '../setup.ts';
import type { GameState } from '../index.ts';

/** A game sitting at the negotiating table, with seats set explicitly. */
function atTable(playerSeats: number, crisis = false): GameState {
  const base = createStandardGame('endings-test');
  const others = base.parties.filter((p) => !p.isPlayer);

  /* Distribute the remaining seats so the totals stay honest. */
  const remaining = 180 - playerSeats;
  const per = Math.floor(remaining / others.length);
  const parties = base.parties.map((p) => {
    if (p.isPlayer) return { ...p, seats: playerSeats, inCoalition: true };
    return { ...p, seats: per, inCoalition: false, coalitionMood: null };
  });
  /* Give the leftovers to the first opposition party. */
  const assigned = playerSeats + per * others.length;
  const firstOther = parties.findIndex((p) => !p.isPlayer);
  parties[firstOther] = { ...parties[firstOther]!, seats: per + (180 - assigned) };

  const state: GameState = { ...base, parties, phase: 'coalition', status: 'active' };
  return { ...state, negotiation: buildNegotiation(state.parties, 1, crisis) };
}

describe('a run can actually be lost', () => {
  it('lets the largest party carry on in a minority', () => {
    const state = atTable(100);
    expect(playerIsLargestParty(state.parties)).toBe(true);

    const result = applyIntent(state, { type: 'negotiation_abandon' });
    expect(result.error).toBeUndefined();
    expect(result.state.status).toBe('active');
    expect(result.state.phase).toBe('briefing');
  });

  it('turns out a party that is neither largest nor able to form a majority', () => {
    const state = atTable(10);
    expect(playerIsLargestParty(state.parties)).toBe(false);

    const result = applyIntent(state, { type: 'negotiation_abandon' });
    expect(result.state.status).toBe('defeated');
    expect(result.state.phase).toBe('career_summary');
    expect(result.state.negotiation).toBeNull();
  });

  it('records a collapse, not a defeat, when a government falls mid-term', () => {
    const state = atTable(10, true);
    const result = applyIntent(state, { type: 'negotiation_abandon' });
    expect(result.state.status).toBe('collapsed');
    expect(result.state.phase).toBe('career_summary');
  });

  it('explains in the log why the run ended', () => {
    const state = atTable(10);
    const result = applyIntent(state, { type: 'negotiation_abandon' });
    const entries = result.state.logs.flatMap((l) => l.entries);
    const note = entries.find((e) => e.label === 'Out of office');
    expect(note).toBeDefined();
    expect(note!.cause).toMatch(/commands more seats/);
  });

  it('ends the run when the player stands down', () => {
    const result = applyIntent(createStandardGame('retire-test'), { type: 'retire' });
    expect(result.state.status).toBe('retired');
    expect(result.state.phase).toBe('career_summary');
  });

  it('refuses further actions once a run has ended', () => {
    const ended = applyIntent(createStandardGame('ended-test'), { type: 'retire' }).state;
    const result = applyIntent(ended, { type: 'public_address' });
    expect(result.error).toBe('This run has ended.');
  });

  it('reaches every terminal status the type allows', () => {
    /* 'collapsed' was previously unreachable dead state. */
    const statuses = new Set([
      applyIntent(atTable(10), { type: 'negotiation_abandon' }).state.status,
      applyIntent(atTable(10, true), { type: 'negotiation_abandon' }).state.status,
      applyIntent(createStandardGame('r'), { type: 'retire' }).state.status,
    ]);
    expect(statuses).toEqual(new Set(['defeated', 'collapsed', 'retired']));
  });
});

describe('legacy scoring at the end of a run', () => {
  it('scores every run and reads out a verdict', () => {
    for (const status of ['defeated', 'collapsed', 'retired'] as const) {
      const state: GameState = { ...createStandardGame(`legacy-${status}`), status };
      const legacy = computeLegacy(state);
      expect(Number.isFinite(legacy.total)).toBe(true);
      expect(legacy.lines.length).toBeGreaterThan(0);
      expect(legacy.verdict.length).toBeGreaterThan(0);
      /* The line points must sum to the reported total. */
      const sum = legacy.lines.reduce((t, l) => t + l.points, 0);
      expect(Math.round(sum)).toBe(legacy.total);
    }
  });

  it('rewards a longer, more productive tenure over a short one', () => {
    const base = createStandardGame('legacy-compare');
    const modest = computeLegacy({
      ...base,
      career: { ...base.career, termsServed: 1, billsPassed: 2, electionsWon: 0 },
    });
    const substantial = computeLegacy({
      ...base,
      career: { ...base.career, termsServed: 4, billsPassed: 30, electionsWon: 3 },
    });
    expect(substantial.total).toBeGreaterThan(modest.total);
  });

  it('penalises debt left behind', () => {
    const base = createStandardGame('legacy-debt');
    const prudent = computeLegacy({ ...base, debt: 50 });
    const profligate = computeLegacy({ ...base, debt: 900 });
    expect(prudent.total).toBeGreaterThan(profligate.total);
  });
});

describe('elections change the balance of power', () => {
  it('can leave the player no longer the largest party', () => {
    /*
     * A whole governing record, not an edited approval figure.
     *
     * An earlier version of this test dropped approval to three and
     * expected a wipeout, and got a dead heat. That was the test being
     * wrong rather than the engine: approval's DIRECT effect is damped on
     * purpose, because the things that drive it — the services, the debt,
     * the economy — are already in front of the voter, and counting them
     * twice would double the only feedback loop in the game.
     *
     * Measured properly, across six seeds, the range is four to one: a
     * government that has succeeded at everything holds about 48 seats of
     * 180, and one that has failed at everything holds about 12.
     */
    const collapse = (state: GameState): GameState => ({
      ...state,
      approval: 5,
      debt: 9000,
      sectors: state.sectors.map((sector) => ({ ...sector, health: 22 })),
      economy: {
        ...state.economy,
        growth: -3.5,
        unemployment: 14,
        inflation: 11,
        phase: 'recession',
      },
    });

    const seeds = ['overtaken', 'overtaken-b', 'overtaken-c', 'overtaken-d'];
    for (const seed of seeds) {
      const base = createStandardGame(seed);
      const held = base.parties.find((p) => p.isPlayer)!.seats;

      const afterElection = runElection(collapse(base));
      const seats = afterElection.elections[afterElection.elections.length - 1]!.seatsByParty;
      const playerSeats = seats.player ?? 0;
      const best = Math.max(...Object.values(seats));

      /* Turned out, every time, and by a long way. */
      expect(playerSeats).toBeLessThan(best);
      expect(playerSeats).toBeLessThan(held * 0.6);
    }
  });

  it('ends the run cleanly when the country turns the player out', () => {
    /*
     * The whole path, because each step of it looked fine on its own and
     * a sweep showed runs sitting at zero seats and still "active" — the
     * harness had simply stopped at election night. Worth asserting end to
     * end so that if it ever DOES stall there, something says so.
     */
    const base = createStandardGame('turned-out');
    const ruined: GameState = {
      ...base,
      approval: 4,
      debt: 20000,
      sectors: base.sectors.map((sector) => ({ ...sector, health: 18 })),
      economy: {
        ...base.economy,
        growth: -4,
        unemployment: 15,
        inflation: 12,
        phase: 'recession',
      },
    };

    let state = runElection(ruined);
    expect(state.phase).toBe('election_night');
    expect(state.status).toBe('active');

    state = applyIntent(state, { type: 'acknowledge_election' }).state;
    expect(state.phase).toBe('coalition');

    /* No majority to be had and not the largest party: the country has
       invited somebody else, and the run is over. */
    const after = applyIntent(state, { type: 'negotiation_abandon' });
    expect(after.error).toBeUndefined();
    expect(after.state.status).toBe('defeated');
    expect(after.state.phase).toBe('career_summary');
  });

  it('rewards a record as steeply as it punishes one', () => {
    /*
     * The other end, because a game that only punishes is not a loop. The
     * same four seeds, governed well, return about four times the seats a
     * collapse does.
     */
    const triumph = (state: GameState): GameState => ({
      ...state,
      approval: 72,
      debt: 900,
      sectors: state.sectors.map((sector) => ({ ...sector, health: 82 })),
      economy: {
        ...state.economy,
        growth: 3.2,
        unemployment: 3.6,
        inflation: 2,
        phase: 'expansion',
      },
    });
    const ruin = (state: GameState): GameState => ({
      ...state,
      approval: 5,
      debt: 9000,
      sectors: state.sectors.map((sector) => ({ ...sector, health: 22 })),
      economy: {
        ...state.economy,
        growth: -3.5,
        unemployment: 14,
        inflation: 11,
        phase: 'recession',
      },
    });

    const seatsAfter = (seed: string, shape: (s: GameState) => GameState): number => {
      const after = runElection(shape(createStandardGame(seed)));
      return after.elections[after.elections.length - 1]!.seatsByParty.player ?? 0;
    };

    for (const seed of ['record-a', 'record-b', 'record-c', 'record-d']) {
      const won = seatsAfter(seed, triumph);
      const lost = seatsAfter(seed, ruin);
      expect(won).toBeGreaterThan(lost * 3);
      expect(won).toBeGreaterThan(40);
    }
  });
});
