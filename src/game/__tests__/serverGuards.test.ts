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
    /*
     * The count is the tripwire. It has no meaning of its own — its whole
     * job is to fail when someone adds an action, so that opening it to
     * clients is a decision rather than a side effect. If this failed and
     * you are reading it: check the new intent validates its own inputs and
     * rejects the phases it does not belong in, then update the number.
     */
    expect(ALLOWED_INTENT_TYPES.size).toBe(105);
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
    /*
     * Anchored at both ends, because the resources are exactly these five
     * names. `set_capital_share` is not one of them: it moves a budget line
     * between running costs and investment, which is a field of a document
     * the chamber then votes on, not a number the client hands itself.
     */
    for (const type of ALLOWED_INTENT_TYPES) {
      expect(type).not.toMatch(/^set_(approval|capital|treasury|debt|seats)$/);
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

describe('the snapshot guards everything, not only the first three numbers', () => {
  /*
   * These systems were added after the validator was written, and a
   * validator that stopped where it used to would have let a tampered
   * client hand itself a fully ready army, a perfect intelligence service
   * or a budget it had not passed — none of which is reachable through any
   * intent, which is precisely why the snapshot is where it would be done.
   */
  const base = () => governing();

  it('accepts a state the engine itself produced', () => {
    expect(validateSnapshot(base())).toBeNull();
  });

  it('refuses a force that was not paid for', () => {
    const state = base();
    const tampered: GameState = {
      ...state,
      military: {
        ...state.military,
        arms: state.military.arms.map((a) => ({ ...a, readiness: 400 })),
      },
    };
    expect(validateSnapshot(tampered)).toContain('readiness out of range');
  });

  it('refuses an intelligence service that sees everything', () => {
    const state = base();
    const tampered: GameState = {
      ...state,
      intelligence: { ...state.intelligence, capability: 1000 },
    };
    expect(validateSnapshot(tampered)).toContain('capability out of range');
  });

  it('refuses a collection posture that is more than one budget', () => {
    const state = base();
    const tampered: GameState = {
      ...state,
      intelligence: {
        ...state.intelligence,
        posture: { human: 1, signals: 1, analysis: 1 },
      },
    };
    expect(validateSnapshot(tampered)).toContain('does not add up');
  });

  it('refuses a budget line that was never voted', () => {
    const state = base();
    const tampered: GameState = {
      ...state,
      budget: {
        ...state.budget,
        lines: state.budget.lines.map((l) => ({ ...l, enacted: -5 })),
      },
    };
    expect(validateSnapshot(tampered)).toContain('budget line invalid');
  });

  it('refuses trade that runs backwards', () => {
    const state = base();
    const tampered: GameState = {
      ...state,
      trade: {
        ...state.trade,
        flows: state.trade.flows.map((f) => ({ ...f, exports: -100 })),
      },
    };
    expect(validateSnapshot(tampered)).toContain('trade flow invalid');
  });

  it('refuses a world where everybody has been made an ally', () => {
    const state = base();
    const tampered: GameState = {
      ...state,
      world: {
        ...state.world,
        nations: state.world.nations.map((n) => ({ ...n, relations: 500 })),
      },
    };
    expect(validateSnapshot(tampered)).toContain('out of range');
  });

  it('refuses a country with no economy', () => {
    const state = base();
    const tampered: GameState = { ...state, economy: { ...state.economy, gdp: 0 } };
    expect(validateSnapshot(tampered)).toContain('output invalid');
  });

  it('refuses a force that is deployed more than once over', () => {
    const state = base();
    const tampered: GameState = {
      ...state,
      military: {
        ...state.military,
        deployments: [
          {
            id: 'x',
            nation: 'new_zealand',
            kind: 'combat',
            commitment: 0.9,
            cost: 10,
            startedTurn: 1,
            mandate: 'x',
          },
          {
            id: 'y',
            nation: 'spain',
            kind: 'combat',
            commitment: 0.9,
            cost: 10,
            startedTurn: 1,
            mandate: 'y',
          },
        ],
      },
    };
    expect(validateSnapshot(tampered)).toContain('commitment invalid');
  });
});
