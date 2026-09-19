import { describe, expect, it } from 'vitest';
import { applyIntent, applyIntents, beginTurn, isBudgetTurn, isCampaignTurn, resolveTurn } from '../turn.ts';
import { createStandardGame } from '../setup.ts';
import { sectorsFromBudget } from '../systems/budgetProcess.ts';
import {
  BUDGET_TURN_INTERVAL,
  CAMPAIGN_START_TURN,
  CAMPAIGN_WEEKS,
  PC_COSTS,
  TURNS_PER_TERM,
} from '../balance.ts';
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

  it('identifies budget turns quarterly, starting at turn 1', () => {
    expect(isBudgetTurn(1)).toBe(true);
    expect(isBudgetTurn(2)).toBe(false);
    expect(isBudgetTurn(13)).toBe(false);
    /* Thirteen weeks on: the start of the next quarter. A government that
       could rewrite its spending every week would never have to live with
       a decision. */
    expect(isBudgetTurn(1 + BUDGET_TURN_INTERVAL)).toBe(true);
  });

  it('identifies the campaign run-up as the last eight weeks of a term', () => {
    expect(isCampaignTurn(CAMPAIGN_START_TURN - 1)).toBe(false);
    expect(isCampaignTurn(CAMPAIGN_START_TURN)).toBe(true);
    expect(isCampaignTurn(TURNS_PER_TERM)).toBe(true);
    /* Eight weeks of it, which is a real campaign rather than the two
       months the monthly turn could offer. */
    expect(TURNS_PER_TERM - CAMPAIGN_START_TURN + 1).toBe(CAMPAIGN_WEEKS);
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
  it('refuses funding changes once the season closes, and an emergency budget reopens it', () => {
    let state = governing();
    /* Out past the deadline, when the estimates are settled for the year. */
    while (state.turnNumber <= BUDGET_TURN_INTERVAL && state.status === 'active') {
      const from = state.turnNumber;
      let guard = 0;
      while (state.turnNumber === from && guard < 12) {
        guard += 1;
        for (const event of state.events.filter((e) => !e.resolved)) {
          state = applyIntent(state, {
            type: 'resolve_event',
            eventId: event.id,
            choiceIndex: 0,
          }).state;
        }
        state = applyIntent(state, { type: 'advance_phase' }).state;
      }
    }
    expect(state.turnNumber).toBeGreaterThan(BUDGET_TURN_INTERVAL);

    state = { ...state, politicalCapital: 100, phase: 'budget' };
    const blocked = applyIntent(state, { type: 'set_funding', sector: 'health', amount: 40 });
    expect(blocked.error).toBeTruthy();

    state = applyIntent(state, { type: 'emergency_budget' }).state;
    const before = state.sectors.find((s) => s.key === 'health')!.funding;
    const allowed = applyIntent(state, { type: 'set_funding', sector: 'health', amount: 40 });
    expect(allowed.error).toBeUndefined();

    /*
     * It moves, but not to forty. Most of the health sector is disability
     * payments, which are set in law rather than appropriated, so a
     * chancellor who says "health goes to forty" finds out that the floor is
     * whatever the statute already owes. The sector is still a summary of
     * the lines, so the figure that comes back is the one the lines add to.
     */
    const after = allowed.state.sectors.find((s) => s.key === 'health')!.funding;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(40);
    expect(after).toBeCloseTo(sectorsFromBudget(allowed.state.budget).health, 6);
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

describe('report totals reconcile with actual state changes', () => {
  /**
   * The End of Turn Report sums the log to show what moved. If that sum ever
   * disagrees with the real change, the transparency pillar is broken — the
   * player traces a number and finds the wrong answer.
   */
  const netOf = (state: GameState, kind: string) =>
    (state.logs.find((l) => l.turnNumber === state.turnNumber)?.entries ?? [])
      .filter((e) => e.kind === kind && e.delta !== null && !e.informational)
      .reduce((total, e) => total + (e.delta ?? 0), 0);

  it('treasury and debt totals match the change the turn actually made', () => {
    const before = governing();
    const after = resolveTurn(before);

    expect(netOf(after, 'treasury')).toBeCloseTo(after.treasury - before.treasury, 4);
    expect(netOf(after, 'debt')).toBeCloseTo(after.debt - before.debt, 4);
  });

  it('approval total matches the change the turn actually made', () => {
    const before = governing();
    const after = resolveTurn(before);
    expect(netOf(after, 'approval')).toBeCloseTo(after.approval - before.approval, 4);
  });

  it('excludes gross flows and rate changes from the net figures', () => {
    const after = resolveTurn(governing());
    const entries = after.logs.find((l) => l.turnNumber === after.turnNumber)!.entries;

    const revenue = entries.find((e) => e.label === 'Revenue');
    const spending = entries.find((e) => e.label === 'Programme spending');
    const interest = entries.find((e) => e.label === 'Debt service');

    expect(revenue?.informational).toBe(true);
    expect(spending?.informational).toBe(true);
    expect(interest?.informational).toBe(true);
  });

  it('holds across a run where bills and events have moved money', () => {
    let state = governing();
    for (let turn = 0; turn < 6; turn += 1) {
      const before = state;
      state = applyIntent(state, { type: 'advance_phase' }).state;
      for (const event of state.events.filter((e) => !e.resolved)) {
        state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
      }
      state = applyIntent(state, { type: 'advance_phase' }).state;
      const bill = state.bills.find((b) => b.status === 'available');
      if (bill) {
        const attempt = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 0 });
        if (!attempt.error) state = attempt.state;
      }
      state = applyIntent(state, { type: 'advance_phase' }).state;
      const resolved = applyIntent(state, { type: 'advance_phase' }).state;

      expect(netOf(resolved, 'treasury')).toBeCloseTo(resolved.treasury - before.treasury, 3);
      expect(netOf(resolved, 'approval')).toBeCloseTo(resolved.approval - before.approval, 3);

      state = applyIntent(resolved, { type: 'advance_phase' }).state;
      if (state.phase !== 'briefing') break;
    }
  });
});
