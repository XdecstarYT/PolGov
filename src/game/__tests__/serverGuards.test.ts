import { describe, expect, it } from 'vitest';
import {
  ALLOWED_INTENT_TYPES,
  MAX_INTENTS_PER_REQUEST,
  validateIntents,
  validateSnapshot,
} from '../serverGuards.ts';
import { applyIntent, applyIntents } from '../turn.ts';
import { createStandardGame } from '../setup.ts';
import { PC_MAX, TOTAL_SEATS } from '../balance.ts';
import type { GameState, Intent } from '../index.ts';

function governing(): GameState {
  let state = createStandardGame('guards-test');
  if (state.phase === 'coalition') {
    for (const candidate of state.negotiation!.candidates) {
      state = applyIntent(state, { type: 'negotiation_accept', partyId: candidate.partyId }).state;
    }
    state = applyIntent(state, { type: 'negotiation_form_government' }).state;
  }
  return state;
}

describe('snapshot validation', () => {
  it('accepts a genuine game', () => {
    expect(validateSnapshot(governing())).toBeNull();
  });

  it('rejects a missing snapshot', () => {
    expect(validateSnapshot(null)).toBe('snapshot missing');
    expect(validateSnapshot(undefined)).toBe('snapshot missing');
  });

  it('rejects an approval rating the client has inflated', () => {
    const tampered = { ...governing(), approval: 100000 };
    expect(validateSnapshot(tampered)).toBe('approval out of range');
  });

  it('rejects negative approval', () => {
    expect(validateSnapshot({ ...governing(), approval: -1 })).toBe('approval out of range');
  });

  it('rejects political capital beyond the cap', () => {
    const tampered = { ...governing(), politicalCapital: PC_MAX + 1 };
    expect(validateSnapshot(tampered)).toBe('political capital out of range');
  });

  it('rejects a parliament that has been given extra seats', () => {
    const state = governing();
    const parties = state.parties.map((p, i) => (i === 0 ? { ...p, seats: p.seats + 40 } : p));
    const problem = validateSnapshot({ ...state, parties });
    expect(problem).toBe(`seats total ${TOTAL_SEATS + 40}, expected ${TOTAL_SEATS}`);
  });

  it('rejects a state claiming more than one player party', () => {
    const state = governing();
    const parties = state.parties.map((p) => ({ ...p, isPlayer: true }));
    expect(validateSnapshot({ ...state, parties })).toBe('player party not unique');
  });

  it('rejects sector health outside 0..100', () => {
    const state = governing();
    const sectors = state.sectors.map((s, i) => (i === 0 ? { ...s, health: 900 } : s));
    expect(validateSnapshot({ ...state, sectors })).toContain('health out of range');
  });

  it('rejects an incomplete sector set', () => {
    const state = governing();
    expect(validateSnapshot({ ...state, sectors: state.sectors.slice(0, 2) })).toBe(
      'sector set incomplete',
    );
  });

  it('rejects negative debt and non-finite money', () => {
    expect(validateSnapshot({ ...governing(), debt: -500 })).toBe('debt invalid');
    expect(validateSnapshot({ ...governing(), treasury: NaN })).toBe('treasury invalid');
  });

  it('rejects nonsensical turn and term numbers', () => {
    expect(validateSnapshot({ ...governing(), turnNumber: 0 })).toBe('turn number invalid');
    expect(validateSnapshot({ ...governing(), termNumber: -3 })).toBe('term number invalid');
  });
});

describe('intent validation', () => {
  it('accepts a normal journal', () => {
    const journal: Intent[] = [
      { type: 'advance_phase' },
      { type: 'public_address' },
      { type: 'set_funding', sector: 'health', amount: 30 },
    ];
    expect(validateIntents(journal)).toBeNull();
  });

  it('rejects anything that is not a list', () => {
    expect(validateIntents('advance_phase')).toBe('intents must be a list');
    expect(validateIntents({ type: 'advance_phase' })).toBe('intents must be a list');
  });

  it('rejects an oversized journal', () => {
    const journal = Array.from({ length: MAX_INTENTS_PER_REQUEST + 1 }, () => ({
      type: 'advance_phase' as const,
    }));
    expect(validateIntents(journal)).toContain('at most');
  });

  it('rejects an action type the engine does not implement', () => {
    expect(validateIntents([{ type: 'set_approval', value: 99 }])).toBe(
      'unrecognised action: set_approval',
    );
  });

  it('rejects malformed entries', () => {
    expect(validateIntents([null])).toBe('malformed action');
    expect(validateIntents(['advance_phase'])).toBe('malformed action');
  });

  it('allows exactly the intents the engine handles, and nothing else', () => {
    /*
     * A new intent added to the engine must be consciously allowed here.
     * Without this, adding an action would silently open it to clients.
     */
    expect(ALLOWED_INTENT_TYPES.has('advance_phase')).toBe(true);
    expect(ALLOWED_INTENT_TYPES.has('propose_bill')).toBe(true);
    expect(ALLOWED_INTENT_TYPES.size).toBe(21);
  });
});

describe('the client cannot set its own approval', () => {
  /**
   * The security property the brief asks to be confirmed. There is no intent
   * that writes approval, capital, treasury or seats directly, so a client
   * replaying a journal through the engine can only ever reach states the
   * rules allow.
   */
  it('offers no intent that assigns a resource directly', () => {
    for (const type of ALLOWED_INTENT_TYPES) {
      expect(type).not.toMatch(/^set_(approval|capital|treasury|debt|seats)/);
    }
  });

  it('refuses an action the player cannot afford, leaving state untouched', () => {
    let state = governing();
    state = applyIntent(state, { type: 'advance_phase' }).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;

    const broke: GameState = { ...state, politicalCapital: 0 };
    const bill = broke.bills.find((b) => b.status === 'available')!;
    const result = applyIntent(broke, { type: 'propose_bill', billId: bill.id, whipSteps: 5 });

    expect(result.error).toBeTruthy();
    expect(result.state.politicalCapital).toBe(0);
    expect(result.state.bills.find((b) => b.id === bill.id)!.status).toBe('available');
  });

  it('replaying a journal reaches the same state the client would have reached', () => {
    /* This is what makes the server able to reject a client that lies. */
    const start = governing();
    const journal: Intent[] = [{ type: 'advance_phase' }];

    const clientSide = applyIntents(start, journal).state;
    const serverSide = applyIntents(start, journal).state;

    expect(serverSide.approval).toBe(clientSide.approval);
    expect(serverSide.politicalCapital).toBe(clientSide.politicalCapital);
    expect(serverSide.rngState).toBe(clientSide.rngState);
    expect(serverSide.events.map((e) => e.templateKey)).toEqual(
      clientSide.events.map((e) => e.templateKey),
    );
  });
});
