import { describe, expect, it } from 'vitest';
import {
  billAppealToSegment,
  decreeEffects,
  executiveOrderCost,
  implementationDelay,
  judgePromises,
  policyOpinion,
  reverseEffects,
  runReferendum,
  sunsetTurn,
} from '../systems/policy.ts';
import { computeIssueScores } from '../systems/electorate.ts';
import { REFERENDUM_TEMPLATES } from '../content/referendums.ts';
import { buildRegions, createStandardGame } from '../setup.ts';
import { applyIntent, resolveTurn } from '../turn.ts';
import {
  IMPLEMENTATION_DELAY_MAJOR,
  IMPLEMENTATION_DELAY_MINOR,
  PROMISE_BROKEN_APPROVAL,
  PROMISE_KEPT_APPROVAL,
  SECTOR_BASELINE_FUNDING,
  SECTOR_KEYS,
} from '../balance.ts';
import { makeIdeology } from '../ideology.ts';
import type { Bill, GameState, ManifestoPromise, Sector } from '../index.ts';

const sectors: Sector[] = SECTOR_KEYS.map((key) => ({
  key,
  health: 55,
  funding: SECTOR_BASELINE_FUNDING[key],
}));
const scores = computeIssueScores(sectors, 200, 0);

const makeBill = (overrides: Partial<Bill> = {}): Bill => ({
  id: 'b',
  templateKey: 'b',
  title: 'Test Measure',
  summary: '',
  tradeoff: '',
  category: 'health',
  magnitude: 'minor',
  ideology: makeIdeology(0, 0, 0),
  effects: {},
  status: 'available',
  passChance: null,
  pcSpent: 0,
  whipSteps: 0,
  turnProposed: null,
  turnResolved: null,
  amendments: 0,
  committeeBonus: 0,
  committeeReturnsOn: null,
  crossbenchDeals: 0,
  ...overrides,
});

describe('policy popularity is computed, not written down', () => {
  it('pleases the segments whose priorities it serves', () => {
    const healthBill = makeBill({ effects: { sectorDeltas: { health: 8 } } });
    const retirees = billAppealToSegment(healthBill, 'retirees', scores);
    const owners = billAppealToSegment(healthBill, 'business_owners', scores);
    expect(retirees).toBeGreaterThan(owners);
  });

  it('reads a rise in recurring revenue as a tax rise', () => {
    const taxRise = makeBill({ effects: { revenueDelta: 9 } });
    expect(billAppealToSegment(taxRise, 'business_owners', scores)).toBeLessThan(0);
  });

  it('rewards rescuing a failing service more than polishing a good one', () => {
    const failing = computeIssueScores(
      SECTOR_KEYS.map((key) => ({ key, health: key === 'health' ? 10 : 55, funding: 20 })),
      0,
      0,
    );
    const excellent = computeIssueScores(
      SECTOR_KEYS.map((key) => ({ key, health: key === 'health' ? 95 : 55, funding: 20 })),
      0,
      0,
    );
    const bill = makeBill({ effects: { sectorDeltas: { health: 8 } } });
    expect(billAppealToSegment(bill, 'retirees', failing)).toBeGreaterThan(
      billAppealToSegment(bill, 'retirees', excellent),
    );
  });

  it('stays inside −1..1 for absurd inputs', () => {
    const extreme = makeBill({
      effects: { sectorDeltas: { health: 900 }, revenueDelta: -900, debt: -9000 },
      ideology: makeIdeology(1, 1, 1),
    });
    for (const key of ['retirees', 'students', 'business_owners'] as const) {
      const appeal = billAppealToSegment(extreme, key, scores);
      expect(appeal).toBeGreaterThanOrEqual(-1);
      expect(appeal).toBeLessThanOrEqual(1);
    }
  });

  it('reports who is for and who is against', () => {
    const opinion = policyOpinion(
      makeBill({ effects: { sectorDeltas: { health: 9 }, revenueDelta: 6 } }),
      buildRegions(),
      scores,
    );
    expect(opinion.supporters.length).toBeGreaterThan(0);
    expect(opinion.opponents.length).toBeGreaterThan(0);
    expect(opinion.net).toBeGreaterThanOrEqual(-1);
    expect(opinion.net).toBeLessThanOrEqual(1);
  });

  it('scores a divisive bill as more controversial than a bland one', () => {
    const bland = policyOpinion(makeBill({ effects: { sectorDeltas: { health: 1 } } }), buildRegions(), scores);
    const divisive = policyOpinion(
      makeBill({
        effects: { sectorDeltas: { environment: 9, economy: -8 }, revenueDelta: 8 },
        ideology: makeIdeology(-0.8, 0.7, 0.9),
      }),
      buildRegions(),
      scores,
    );
    expect(divisive.controversy).toBeGreaterThan(bland.controversy);
  });
});

describe('implementation and sunset', () => {
  it('delays major programmes longer than minor ones', () => {
    expect(implementationDelay(makeBill({ magnitude: 'minor' }))).toBe(IMPLEMENTATION_DELAY_MINOR);
    expect(implementationDelay(makeBill({ magnitude: 'major' }))).toBe(IMPLEMENTATION_DELAY_MAJOR);
  });

  it('sets a lapse date only for bills carrying a sunset clause', () => {
    expect(sunsetTurn(makeBill(), 4)).toBeNull();
    expect(sunsetTurn(makeBill({ sunset: true }), 4)).toBeGreaterThan(4);
  });

  it('unwinds standing arrangements but not money already spent', () => {
    const reversed = reverseEffects({
      fundingDeltas: { health: 6 },
      revenueDelta: 4,
      treasury: -20,
      sectorDeltas: { health: 9 },
    });
    expect(reversed.fundingDeltas!.health).toBe(-6);
    expect(reversed.revenueDelta).toBe(-4);
    /* The cash is gone and the improvement happened; neither comes back. */
    expect(reversed.treasury).toBeUndefined();
    expect(reversed.sectorDeltas).toBeUndefined();
  });
});

describe('executive orders', () => {
  it('costs more with each order issued in a term', () => {
    expect(executiveOrderCost(2)).toBeLessThan(executiveOrderCost(0));
    expect(executiveOrderCost(0)).toBeLessThan(0);
  });

  it('cannot appropriate money', () => {
    const decree = decreeEffects({
      treasury: -30,
      debt: 40,
      fundingDeltas: { health: 5 },
      sectorDeltas: { health: 8 },
      approval: 2,
    });
    expect(decree.treasury).toBeUndefined();
    expect(decree.debt).toBeUndefined();
    expect(decree.fundingDeltas).toBeUndefined();
    /* It can direct, weakly. */
    expect(decree.sectorDeltas!.health).toBeCloseTo(4, 6);
    expect(decree.approval).toBe(2);
  });
});

describe('referendums', () => {
  it('returns a share, a turnout and a verdict for every question', () => {
    for (const question of REFERENDUM_TEMPLATES) {
      const result = runReferendum(question, buildRegions(), scores);
      expect(result.yesShare).toBeGreaterThan(0);
      expect(result.yesShare).toBeLessThan(1);
      expect(result.turnout).toBeGreaterThan(0.2);
      expect(result.turnout).toBeLessThan(0.9);
      expect(result.passed).toBe(result.yesShare > 0.5);
      expect(result.breakdown.length).toBeGreaterThan(5);
    }
  });

  it('draws a smaller crowd than a general election', () => {
    const result = runReferendum(REFERENDUM_TEMPLATES[0]!, buildRegions(), scores);
    expect(result.turnout).toBeLessThan(0.75);
  });

  it('is decided by the country, not the government', () => {
    /* The same question under two different national conditions. */
    const carbon = REFERENDUM_TEMPLATES.find((q) => q.id === 'carbon-mandate')!;
    const strongEconomy = computeIssueScores(
      SECTOR_KEYS.map((key) => ({ key, health: key === 'economy' ? 90 : 55, funding: 20 })),
      0,
      0,
    );
    const weakEconomy = computeIssueScores(
      SECTOR_KEYS.map((key) => ({ key, health: key === 'economy' ? 15 : 55, funding: 20 })),
      0,
      0,
    );
    const a = runReferendum(carbon, buildRegions(), strongEconomy).yesShare;
    const b = runReferendum(carbon, buildRegions(), weakEconomy).yesShare;
    expect(a).not.toBeCloseTo(b, 3);
  });

  it('is deterministic — the same country gives the same answer', () => {
    const q = REFERENDUM_TEMPLATES[1]!;
    expect(runReferendum(q, buildRegions(), scores).yesShare).toBe(
      runReferendum(q, buildRegions(), scores).yesShare,
    );
  });
});

describe('manifesto promises', () => {
  const promise = (billKey: string, termMade = 1): ManifestoPromise => ({
    id: `p-${billKey}`,
    billKey,
    title: billKey,
    termMade,
    status: 'outstanding',
  });

  it('marks a promise kept when the bill passed', () => {
    const bills = [makeBill({ templateKey: 'x', status: 'passed' })];
    const result = judgePromises([promise('x')], bills, 1);
    expect(result.kept).toBe(1);
    expect(result.updated[0]!.status).toBe('kept');
    expect(result.approvalDelta).toBeCloseTo(PROMISE_KEPT_APPROVAL, 6);
  });

  it('marks a promise broken when it did not', () => {
    const bills = [makeBill({ templateKey: 'x', status: 'available' })];
    const result = judgePromises([promise('x')], bills, 1);
    expect(result.broken).toBe(1);
    expect(result.approvalDelta).toBeCloseTo(PROMISE_BROKEN_APPROVAL, 6);
  });

  it('punishes a broken promise harder than it rewards a kept one', () => {
    expect(Math.abs(PROMISE_BROKEN_APPROVAL)).toBeGreaterThan(PROMISE_KEPT_APPROVAL);
  });

  it('makes promising less a defensible strategy', () => {
    const bills = [makeBill({ templateKey: 'a', status: 'passed' })];
    const modest = judgePromises([promise('a')], bills, 1).approvalDelta;
    const overreaching = judgePromises(
      [promise('a'), promise('b'), promise('c')],
      bills,
      1,
    ).approvalDelta;
    expect(modest).toBeGreaterThan(overreaching);
  });

  it('ignores promises from other terms', () => {
    const result = judgePromises([promise('x', 2)], [], 1);
    expect(result.kept + result.broken).toBe(0);
    expect(result.updated[0]!.status).toBe('outstanding');
  });
});

describe('the lifecycle, end to end', () => {
  function atAgenda(): GameState {
    let state = createStandardGame('policy-flow');
    if (state.phase === 'coalition') {
      for (const c of state.negotiation!.candidates) {
        state = applyIntent(state, { type: 'negotiation_accept', partyId: c.partyId }).state;
      }
      state = applyIntent(state, { type: 'negotiation_form_government' }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    for (const e of state.events.filter((x) => !x.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: e.id, choiceIndex: 0 }).state;
    }
    return { ...applyIntent(state, { type: 'advance_phase' }).state, politicalCapital: 100 };
  }

  it('does not apply a law’s effects the month it passes', () => {
    let state = atAgenda();
    const bill = state.bills.find((b) => b.status === 'available' && b.effects.sectorDeltas)!;
    state = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 5 }).state;

    const resolved = resolveTurn({ ...state, phase: 'budget' });
    const after = resolved.bills.find((b) => b.id === bill.id)!;

    if (after.status === 'passed') {
      expect(after.inEffect).toBe(false);
      expect(after.takesEffectOn).toBeGreaterThan(resolved.turnNumber);
    }
  });

  it('applies them once the delay has run', () => {
    let state = atAgenda();
    const bill = state.bills.find(
      (b) => b.status === 'available' && b.magnitude === 'minor' && b.effects.sectorDeltas,
    )!;
    state = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 5 }).state;

    let resolved = resolveTurn({ ...state, phase: 'budget' });
    if (resolved.bills.find((b) => b.id === bill.id)!.status !== 'passed') return;

    resolved = resolveTurn({ ...resolved, phase: 'budget', turnNumber: resolved.turnNumber + 2 });
    expect(resolved.bills.find((b) => b.id === bill.id)!.inEffect).toBe(true);
  });

  it('records a referendum result and charges for losing one you called', () => {
    const state = atAgenda();
    const before = state.approval;
    const result = applyIntent(state, { type: 'call_referendum', questionId: 'voting-age' });

    expect(result.error).toBeUndefined();
    expect(result.state.referendums).toHaveLength(1);
    const outcome = result.state.referendums[0]!;
    expect(outcome.passed ? result.state.approval > before - 1 : result.state.approval < before).toBe(true);
  });

  it('refuses to put the same question twice', () => {
    let state = atAgenda();
    state = applyIntent(state, { type: 'call_referendum', questionId: 'devolution' }).state;
    state = { ...state, politicalCapital: 100 };
    const again = applyIntent(state, { type: 'call_referendum', questionId: 'devolution' });
    expect(again.error).toMatch(/already been put/i);
  });

  it('publishes a manifesto and refuses a second one the same term', () => {
    let state = atAgenda();
    const keys = state.bills.slice(0, 2).map((b) => b.templateKey);
    state = applyIntent(state, { type: 'set_manifesto', billKeys: keys }).state;
    expect(state.promises).toHaveLength(2);

    const again = applyIntent(state, { type: 'set_manifesto', billKeys: keys });
    expect(again.error).toMatch(/already published/i);
  });
});
