/**
 * personas.test.ts — a cast that persists, and remembers.
 *
 * The two properties worth testing are the two the feature exists for:
 * these people are the SAME people for sixteen years, and what they think
 * moves on what the government actually did rather than on anything a
 * model said. Everything else is prose.
 */

import { describe, expect, it } from 'vitest';
import {
  REMARK_MEMORY,
  findPersona,
  judgement,
  leaderOf,
  outletOf,
  remember,
  standingOf,
  stepCast,
  voiceContext,
  type Cast,
  type WeekOnTheRecord,
} from '../systems/personas.ts';
import {
  BACKGROUNDS,
  DISPOSITION_LABELS,
  TEMPERAMENT_LABELS,
} from '../content/personas.ts';
import { createGame, createStandardGame } from '../setup.ts';
import { applyIntent, resolveTurn } from '../turn.ts';
import { playableCountries } from '../content/world/countries.ts';
import type { GameState } from '../types.ts';

const game = createStandardGame('cast');

const week = (over: Partial<WeekOnTheRecord> = {}): WeekOnTheRecord => ({
  approvalDelta: 0,
  billsPassed: 0,
  billsFailed: 0,
  sectorHealth: 55,
  debtRatio: 0.55,
  recession: false,
  ...over,
});

describe('the cast', () => {
  it('gives every party a leader and every paper a columnist', () => {
    const { cast } = game;
    expect(cast.leaders).toHaveLength(game.parties.length);
    expect(cast.outlets.length).toBeGreaterThan(3);
    expect(cast.columnists).toHaveLength(cast.outlets.length);

    for (const persona of [...cast.leaders, ...cast.columnists]) {
      expect(persona.name.split(' ').length).toBeGreaterThanOrEqual(2);
      expect(TEMPERAMENT_LABELS[persona.temperament]).toBeTruthy();
      expect(BACKGROUNDS).toContain(persona.background);
      expect(persona.remarks).toEqual([]);
    }
    for (const outlet of cast.outlets) {
      expect(DISPOSITION_LABELS[outlet.disposition]).toBeTruthy();
      expect(outlet.reach).toBeGreaterThan(0);
    }
  });

  it('gives no two people the same name', () => {
    const names = [...game.cast.leaders, ...game.cast.columnists].map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    const mastheads = game.cast.outlets.map((o) => o.name);
    expect(new Set(mastheads).size).toBe(mastheads.length);
  });

  it('is the same cast every time a run is built', () => {
    /* A save reopened, or a turn re-resolved on a server, must not change
       anybody's name. */
    const again = createStandardGame('cast');
    expect(again.cast.leaders.map((p) => p.name)).toEqual(
      game.cast.leaders.map((p) => p.name),
    );
    expect(again.cast.outlets.map((o) => o.name)).toEqual(
      game.cast.outlets.map((o) => o.name),
    );
  });

  it('is a different cast in a different run', () => {
    const other = createStandardGame('cast-elsewhere');
    expect(other.cast.leaders.map((p) => p.name)).not.toEqual(
      game.cast.leaders.map((p) => p.name),
    );
  });

  it('names people the way the country would', () => {
    /* Not a claim about any real name — a claim that a chamber in one part
       of the world does not read like a chamber in another. */
    const banks = playableCountries()
      .slice(0, 8)
      .map((country) => {
        const state = createGame({
          gameId: `cast-${country.key}`,
          country: country.key,
          difficulty: 'standard',
          playerPartyName: 'Reform Coalition',
          playerColor: '#8c2f27',
          playerGlyph: '★',
          playerIdeology: { economic: 0, social: 0, environmental: 0 },
        });
        return state.cast.leaders.map((p) => p.name).join('|');
      });
    expect(new Set(banks).size).toBe(banks.length);
  });
});

describe('what they make of it', () => {
  it('warms to a government that is doing well', () => {
    const good = week({ approvalDelta: 1.5, billsPassed: 2, sectorHealth: 72 });
    let cast = game.cast;
    const before = cast.columnists.map((c) => c.standing);
    for (let i = 0; i < 40; i += 1) cast = stepCast(cast, good);
    cast.columnists.forEach((c, i) => expect(c.standing).toBeGreaterThan(before[i]!));
  });

  it('turns on a government that is not', () => {
    const bad = week({
      approvalDelta: -1.5,
      billsFailed: 2,
      sectorHealth: 38,
      debtRatio: 1.4,
      recession: true,
    });
    let cast = game.cast;
    const before = cast.leaders.map((l) => l.standing);
    for (let i = 0; i < 40; i += 1) cast = stepCast(cast, bad);
    cast.leaders.forEach((l, i) => expect(l.standing).toBeLessThan(before[i]!));
  });

  it('moves a theatrical opponent faster than a dogged one', () => {
    const bad = week({ approvalDelta: -2, sectorHealth: 30, recession: true });
    let cast: Cast = {
      ...game.cast,
      leaders: game.cast.leaders.map((l, i) => ({
        ...l,
        partyId: `p${i}`,
        standing: 0,
        temperament: i === 0 ? ('theatrical' as const) : ('dogged' as const),
      })),
    };
    for (let i = 0; i < 12; i += 1) cast = stepCast(cast, bad);
    expect(cast.leaders[0]!.standing).toBeLessThan(cast.leaders[1]!.standing);
  });

  it('never lets a hostile paper become an admirer', () => {
    const outlet = { ...game.cast.outlets[0]!, disposition: 'hostile' as const };
    let cast: Cast = {
      ...game.cast,
      outlets: [outlet],
      columnists: [{ ...game.cast.columnists[0]!, outletId: outlet.id, standing: 0 }],
    };
    const wonderful = week({ approvalDelta: 3, billsPassed: 3, sectorHealth: 95 });
    for (let i = 0; i < 200; i += 1) cast = stepCast(cast, wonderful);
    /* It concedes. It does not convert. */
    expect(cast.columnists[0]!.standing).toBeGreaterThan(0);
    expect(cast.columnists[0]!.standing).toBeLessThanOrEqual(15);
  });

  it('scores the week on the record and nothing else', () => {
    expect(judgement(week({ billsPassed: 3 }))).toBeGreaterThan(judgement(week()));
    expect(judgement(week({ billsFailed: 3 }))).toBeLessThan(judgement(week()));
    expect(judgement(week({ recession: true }))).toBeLessThan(judgement(week()));
    expect(judgement(week({ debtRatio: 2 }))).toBeLessThan(judgement(week({ debtRatio: 0.4 })));
    /* Bounded, so no single catastrophic week can pin everybody forever. */
    expect(judgement(week({ approvalDelta: -100, sectorHealth: 0 }))).toBeGreaterThanOrEqual(-100);
  });

  it('reads a standing back in a word', () => {
    expect(standingOf({ ...game.cast.leaders[0]!, standing: 80 })).toBe('supportive');
    expect(standingOf({ ...game.cast.leaders[0]!, standing: 0 })).toBe('non-committal');
    expect(standingOf({ ...game.cast.leaders[0]!, standing: -80 })).toBe('implacable');
  });
});

describe('being held to it', () => {
  it('keeps the last few things somebody said', () => {
    let cast = game.cast;
    const who = cast.leaders[1]!.id;
    for (let i = 1; i <= REMARK_MEMORY + 4; i += 1) {
      cast = remember(cast, who, { week: i, about: 'the budget', text: `Remark ${i}` });
    }
    const persona = findPersona(cast, who)!;
    expect(persona.remarks).toHaveLength(REMARK_MEMORY);
    /* The oldest go, the newest stay — so a leader is held to what they
       said recently rather than to the first thing they ever said. */
    expect(persona.remarks[persona.remarks.length - 1]!.text).toBe(
      `Remark ${REMARK_MEMORY + 4}`,
    );
    expect(persona.remarks.some((r) => r.text === 'Remark 1')).toBe(false);
  });

  it('hands the model the person and their record, and nothing else', () => {
    const leader = leaderOf(game.cast, game.parties[1]!.id)!;
    const context = voiceContext(leader, undefined, 'the health settlement', { approval: 41 });

    expect(context.who.name).toBe(leader.name);
    expect(context.who.standing).toBe(standingOf(leader));
    expect(context.saidBefore).toEqual([]);
    expect(context.facts).toEqual({ approval: 41 });
    /* No state, no seed, no instruction about what to think. */
    expect(JSON.stringify(context)).not.toContain('rngState');
  });

  it('finds people by party and papers by id', () => {
    expect(leaderOf(game.cast, 'player')).toBeDefined();
    expect(leaderOf(game.cast, 'nobody')).toBeUndefined();
    expect(outletOf(game.cast, game.cast.outlets[0]!.id)).toBeDefined();
  });
});

describe('the record_remark intent', () => {
  it('stores prose and changes nothing anybody can measure', () => {
    const state = { ...game, phase: 'agenda' as const, negotiation: null };
    const who = state.cast.leaders[1]!;
    const before = who.standing;

    const result = applyIntent(state, {
      type: 'record_remark',
      personaId: who.id,
      about: 'the health settlement',
      text: 'It was announced three times and funded once.',
    });

    expect(result.error).toBeUndefined();
    const after = findPersona(result.state.cast, who.id)!;
    expect(after.remarks).toHaveLength(1);
    expect(after.remarks[0]!.text).toBe('It was announced three times and funded once.');
    /* What they THINK is standing, and a model never touches it. */
    expect(after.standing).toBe(before);
    expect(result.state.politicalCapital).toBe(state.politicalCapital);
  });

  it('caps and cleans what arrives, because it arrives from a client', () => {
    const state = { ...game, phase: 'agenda' as const, negotiation: null };
    const who = state.cast.leaders[1]!;
    const result = applyIntent(state, {
      type: 'record_remark',
      personaId: who.id,
      about: 'x'.repeat(400),
      text: `line one\u0000\nline two ${'y'.repeat(2000)}`,
    });

    const after = findPersona(result.state.cast, who.id)!;
    expect(after.remarks[0]!.text.length).toBeLessThanOrEqual(400);
    expect(after.remarks[0]!.text).not.toContain('\u0000');
    expect(after.remarks[0]!.about.length).toBeLessThanOrEqual(80);
  });

  it('refuses an empty remark and an unknown person', () => {
    const state = { ...game, phase: 'agenda' as const, negotiation: null };
    expect(
      applyIntent(state, { type: 'record_remark', personaId: state.cast.leaders[0]!.id, about: 'x', text: 'hi' })
        .error,
    ).toBeTruthy();
    expect(
      applyIntent(state, { type: 'record_remark', personaId: 'nobody', about: 'x', text: 'a real sentence here' })
        .error,
    ).toBeTruthy();
  });
});

describe('through the turn engine', () => {
  it('moves with the run, and stays the same people', () => {
    let state: GameState = { ...game, phase: 'agenda', negotiation: null };
    const namesBefore = state.cast.leaders.map((p) => p.name);
    const standingBefore = state.cast.leaders.map((p) => p.standing);

    for (let i = 0; i < 12; i += 1) state = resolveTurn(state);

    expect(state.cast.leaders.map((p) => p.name)).toEqual(namesBefore);
    /* And somebody's view of the government has moved. */
    expect(state.cast.leaders.map((p) => p.standing)).not.toEqual(standingBefore);
  });

  it('survives a term boundary', () => {
    let state = createStandardGame('cast-term');
    const names = state.cast.leaders.map((p) => p.name);
    let guard = 0;
    while (state.phase === 'coalition' && guard++ < 10) {
      state = applyIntent(state, { type: 'negotiation_abandon' }).state;
    }
    for (let i = 0; i < 30; i += 1) state = resolveTurn(state);
    expect(state.cast.leaders.map((p) => p.name)).toEqual(names);
  });
});
