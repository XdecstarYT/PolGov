import { describe, expect, it } from 'vitest';
import { applyIntent, applyIntents, beginTurn, isBudgetTurn, isCampaignTurn, resolveTurn } from '../turn.ts';
import { createStandardGame } from '../setup.ts';
import { PC_COSTS, TURNS_PER_TERM } from '../balance.ts';
import type { GameState, Intent } from '../index.ts';

/** A game that has taken office, so tests start at a normal briefing. */
function governing(): GameState {
  let state = createStandardGame('turn-test');
  if (state.phase === 'coalition') {
    const negotiation = state.negotiation!;
    for (const candidate of negotiation.candidates) {
      const result = applyIntent(state, { type: 'negotiation_accept', partyId: candidate.partyId });
      state = result.state;
    }
    state = applyIntent(state, { type: 'negotiation_form_government' }).state;
  }
  return state;
}

const run = (state: GameState, intents: Intent[]) => applyIntents(state, intents);

describe('turn state machine', () => {
  it('walks the canonical phase order', () => {
    let state = governing();
    expect(state.phase).toBe('briefing');

    state = applyIntent(state, { type: 'advance_phase' }).state;
    expect(state.phase).toBe('events');

    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    expect(state.phase).toBe('agenda');

    state = applyIntent(state, { type: 'advance_phase' }).state;
    expect(state.phase).toBe('budget');

    state = applyIntent(state, { type: 'advance_phase' }).state;
    expect(state.phase).toBe('report');

    const before = state.turnNumber;
    state = applyIntent(state, { type: 'advance_phase' }).state;
    expect(state.phase).toBe('briefing');
    expect(state.turnNumber).toBe(before + 1);
  });

  it('refuses to leave the events phase with an event unresolved', () => {
    let state = governing();
    state = applyIntent(state, { type: 'advance_phase' }).state;
    if (state.events.length === 0) return; // nothing to assert this seed
    const result = applyIntent(state, { type: 'advance_phase' });
    expect(result.error).toBeTruthy();
    expect(result.state.phase).toBe('events');
  });

  it('rejects out-of-phase actions', () => {
    const state = governing(); // briefing
    const bill = state.bills.find((b) => b.status === 'available')!;
    const result = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 0 });
    expect(result.error).toBeTruthy();
  });

  it('identifies budget turns every third turn, starting at turn 1', () => {
    expect(isBudgetTurn(1)).toBe(true);
    expect(isBudgetTurn(2)).toBe(false);
    expect(isBudgetTurn(3)).toBe(false);
    expect(isBudgetTurn(4)).toBe(true);
  });

  it('identifies the campaign run-up as the last two turns of a term', () => {
    expect(isCampaignTurn(10)).toBe(false);
    expect(isCampaignTurn(11)).toBe(true);
    expect(isCampaignTurn(TURNS_PER_TERM)).toBe(true);
  });
});

describe('political capital is a hard constraint', () => {
  it('refuses a bill the player cannot afford', () => {
    let state = governing();
    state = applyIntent(state, { type: 'advance_phase' }).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;

    state = { ...state, politicalCapital: 2 };
    const bill = state.bills.find((b) => b.status === 'available')!;
    const result = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 0 });
    expect(result.error).toBeTruthy();
    expect(result.state.politicalCapital).toBe(2);
  });

  it('debits exactly the advertised cost, including whipping', () => {
    let state = governing();
    state = run(state, [{ type: 'advance_phase' }]).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;

    const before = state.politicalCapital;
    const minor = state.bills.find((b) => b.status === 'available' && b.magnitude === 'minor')!;
    state = applyIntent(state, { type: 'propose_bill', billId: minor.id, whipSteps: 2 }).state;
    expect(before - state.politicalCapital).toBe(
      PC_COSTS.proposeMinorBill + 2 * PC_COSTS.whipStep,
    );
  });

  it('never lets political capital go negative', () => {
    let state = governing();
    state = run(state, [{ type: 'advance_phase' }]).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    for (let i = 0; i < 40; i += 1) {
      state = applyIntent(state, { type: 'public_address' }).state;
    }
    expect(state.politicalCapital).toBeGreaterThanOrEqual(0);
  });

  it('applies diminishing returns to repeated public addresses', () => {
    let state = governing();
    state = run(state, [{ type: 'advance_phase' }]).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    state = { ...state, politicalCapital: 100 };

    const a0 = state.approval;
    state = applyIntent(state, { type: 'public_address' }).state;
    const first = state.approval - a0;

    const a1 = state.approval;
    state = applyIntent(state, { type: 'public_address' }).state;
    const second = state.approval - a1;

    expect(second).toBeLessThan(first);
  });
});

describe('the budget is only open on budget turns', () => {
  it('refuses funding changes on a locked turn, and an emergency budget reopens it', () => {
    let state = governing();
    // Advance to turn 2, which is not a budget turn.
    state = applyIntent(state, { type: 'advance_phase' }).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    state = applyIntent(state, { type: 'advance_phase' }).state;
    state = applyIntent(state, { type: 'advance_phase' }).state; // -> report
    state = applyIntent(state, { type: 'advance_phase' }).state; // -> turn 2 briefing
    expect(state.turnNumber).toBe(2);

    state = { ...state, politicalCapital: 100, phase: 'budget' };
    const blocked = applyIntent(state, { type: 'set_funding', sector: 'health', amount: 40 });
    expect(blocked.error).toBeTruthy();

    state = applyIntent(state, { type: 'emergency_budget' }).state;
    const allowed = applyIntent(state, { type: 'set_funding', sector: 'health', amount: 40 });
    expect(allowed.error).toBeUndefined();
    expect(allowed.state.sectors.find((s) => s.key === 'health')!.funding).toBe(40);
  });

  it('rejects funding outside the permitted range', () => {
    let state = governing();
    state = { ...state, phase: 'budget' };
    expect(applyIntent(state, { type: 'set_funding', sector: 'health', amount: -5 }).error).toBeTruthy();
    expect(applyIntent(state, { type: 'set_funding', sector: 'health', amount: 5000 }).error).toBeTruthy();
    expect(applyIntent(state, { type: 'set_funding', sector: 'health', amount: NaN }).error).toBeTruthy();
  });
});

describe('determinism', () => {
  it('produces identical state from identical seeds and intents', () => {
    const intents: Intent[] = [{ type: 'advance_phase' }];
    const a = applyIntents(governing(), intents).state;
    const b = applyIntents(governing(), intents).state;
    expect(a.rngState).toBe(b.rngState);
    expect(a.events.map((e) => e.templateKey)).toEqual(b.events.map((e) => e.templateKey));
  });

  it('resolves a turn identically when replayed from the same state', () => {
    const base = governing();
    const first = resolveTurn(base);
    const second = resolveTurn(base);
    expect(first.approval).toBe(second.approval);
    expect(first.debt).toBe(second.debt);
    expect(first.rngState).toBe(second.rngState);
  });
});

describe('the turn log accounts for what changed', () => {
  it('records a cause for every entry', () => {
    let state = governing();
    state = applyIntent(state, { type: 'advance_phase' }).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    state = applyIntent(state, { type: 'advance_phase' }).state;
    state = applyIntent(state, { type: 'advance_phase' }).state;

    const entries = state.logs.find((l) => l.turnNumber === state.turnNumber)!.entries;
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.cause.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it('carries a negative treasury into debt rather than leaving it as free credit', () => {
    const base = governing();
    const indebted: GameState = { ...base, treasury: -50, debt: 100 };
    const resolved = resolveTurn(indebted);
    expect(resolved.treasury).toBeGreaterThanOrEqual(0);
    expect(resolved.debt).toBeGreaterThan(100);
  });
});

describe('beginTurn', () => {
  it('banks political capital scaled by approval', () => {
    const base = governing();
    const low = beginTurn({ ...base, approval: 10, politicalCapital: 0 });
    const high = beginTurn({ ...base, approval: 90, politicalCapital: 0 });
    expect(high.politicalCapital).toBeGreaterThan(low.politicalCapital);
  });

  it('draws at most two events per turn', () => {
    let state = governing();
    for (let i = 0; i < 30; i += 1) {
      state = beginTurn(state);
      expect(state.events.length).toBeLessThanOrEqual(2);
    }
  });

  it('relocks the budget each turn', () => {
    const state = beginTurn({ ...governing(), budgetUnlocked: true });
    expect(state.budgetUnlocked).toBe(false);
  });
});
