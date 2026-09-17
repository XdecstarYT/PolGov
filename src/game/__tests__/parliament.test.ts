import { describe, expect, it } from 'vitest';
import {
  buildSenate,
  committeeFor,
  committeeReport,
  filibusterRisk,
  isMoneyBill,
  renewSenate,
  senateVerdict,
  senateVote,
} from '../systems/parliament.ts';
import { SENATE_SIZE } from '../balance.ts';
import { Rng } from '../rng.ts';
import { makeIdeology } from '../ideology.ts';
import { createStandardGame } from '../setup.ts';
import { applyIntent, resolveTurn } from '../turn.ts';
import type { Bill, Party } from '../index.ts';

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
  status: 'proposed',
  passChance: null,
  pcSpent: 0,
  whipSteps: 0,
  turnProposed: 1,
  turnResolved: null,
  amendments: 0,
  committeeBonus: 0,
  committeeReturnsOn: null,
  crossbenchDeals: 0,
  ...overrides,
});

const makeParty = (id: string, seats: number, isPlayer = false, inCoalition = false, ideology = makeIdeology(0, 0, 0)): Party => ({
  id,
  name: id,
  shortName: id,
  color: '#000',
  glyph: '●',
  isPlayer,
  inCoalition: isPlayer || inCoalition,
  ideology,
  seats,
  coalitionMood: null,
  redLines: [],
  baseStrength: 1,
  cabinetPosts: 0,
  cabinetDemand: 0,
  leaderTitle: 'Leader',
});

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('the Senate', () => {
  it('seats exactly SENATE_SIZE members', () => {
    expect(sum(buildSenate({ a: 0.5, b: 0.3, c: 0.2 }).seatsByParty)).toBe(SENATE_SIZE);
  });

  it('renews by halves, so half of it still reflects the last electorate', () => {
    /* A chamber entirely held by A, then an election A loses completely. */
    const senate = buildSenate({ a: 1 });
    expect(senate.seatsByParty.a).toBe(SENATE_SIZE);

    const renewed = renewSenate(senate, { b: 1 });
    expect(sum(renewed.seatsByParty)).toBe(SENATE_SIZE);
    /* A keeps roughly the retained half despite winning nothing. */
    expect(renewed.seatsByParty.a).toBeGreaterThan(SENATE_SIZE * 0.4);
    expect(renewed.seatsByParty.b).toBeGreaterThan(0);
  });

  it('converges on the new electorate over repeated elections', () => {
    let senate = buildSenate({ a: 1 });
    for (let i = 0; i < 5; i += 1) senate = renewSenate(senate, { b: 1 });
    expect(senate.seatsByParty.b!).toBeGreaterThan(senate.seatsByParty.a ?? 0);
  });

  it('counts renewals', () => {
    expect(renewSenate(buildSenate({ a: 1 }), { a: 1 }).renewals).toBe(1);
  });
});

describe('money bills bypass the upper house', () => {
  it('identifies a money bill', () => {
    expect(isMoneyBill(makeBill({ category: 'fiscal' }))).toBe(true);
    expect(isMoneyBill(makeBill({ category: 'health' }))).toBe(false);
  });

  it('waves a money bill through regardless of the arithmetic', () => {
    const senate = buildSenate({ opp: 1 });
    const parties = [makeParty('player', 100, true), makeParty('opp', 80)];
    const verdict = senateVerdict(makeBill({ category: 'fiscal' }), senate, parties);

    expect(verdict.bypassed).toBe(true);
    expect(verdict.chance).toBe(1);
    expect(senateVote(new Rng(1), verdict)).toBe(true);
  });
});

describe('senate verdicts', () => {
  const parties = [
    makeParty('player', 100, true, false, makeIdeology(-0.3, 0.2, 0.2)),
    makeParty('opp', 80, false, false, makeIdeology(0.6, -0.2, -0.3)),
  ];

  it('is near-certain when the government holds the chamber', () => {
    const verdict = senateVerdict(makeBill(), buildSenate({ player: 1 }), parties);
    expect(verdict.chance).toBeGreaterThan(0.9);
    expect(verdict.supportingSeats).toBe(SENATE_SIZE);
  });

  it('is hostile when the opposition holds it', () => {
    const verdict = senateVerdict(makeBill(), buildSenate({ opp: 1 }), parties);
    expect(verdict.chance).toBeLessThan(0.5);
    expect(verdict.supportingSeats).toBe(0);
  });

  it('lets a chamber it does not control be persuaded by a bill it agrees with', () => {
    const senate = buildSenate({ opp: 1 });
    const hostile = senateVerdict(makeBill({ ideology: makeIdeology(-0.9, 0.9, 0.9) }), senate, parties);
    const agreeable = senateVerdict(makeBill({ ideology: makeIdeology(0.6, -0.2, -0.3) }), senate, parties);
    expect(agreeable.chance).toBeGreaterThan(hostile.chance);
  });

  it('counts coalition partners as government', () => {
    const withPartner = [...parties, makeParty('ally', 30, false, true)];
    const verdict = senateVerdict(makeBill(), buildSenate({ player: 0.5, ally: 0.5 }), withPartner);
    expect(verdict.supportingSeats).toBe(SENATE_SIZE);
  });

  it('shows its arithmetic', () => {
    const verdict = senateVerdict(makeBill(), buildSenate({ player: 0.6, opp: 0.4 }), parties);
    expect(verdict.terms.length).toBeGreaterThan(1);
    for (const term of verdict.terms) expect(term.detail.length).toBeGreaterThan(0);
  });

  it('stays inside its clamps at both extremes', () => {
    const allGov = senateVerdict(makeBill(), buildSenate({ player: 1 }), parties);
    const noneGov = senateVerdict(
      makeBill({ ideology: makeIdeology(-1, 1, 1) }),
      buildSenate({ opp: 1 }),
      parties,
    );
    expect(allGov.chance).toBeLessThanOrEqual(0.97);
    expect(noneGov.chance).toBeGreaterThanOrEqual(0.08);
  });

  it('is deterministic for a seed', () => {
    const verdict = senateVerdict(makeBill(), buildSenate({ player: 0.5, opp: 0.5 }), parties);
    expect(senateVote(new Rng(9), verdict)).toBe(senateVote(new Rng(9), verdict));
  });
});

describe('committees', () => {
  it('routes each bill to the right committee', () => {
    expect(committeeFor(makeBill({ category: 'fiscal' }))).toBe('finance');
    expect(committeeFor(makeBill({ category: 'health' }))).toBe('services');
    expect(committeeFor(makeBill({ category: 'education' }))).toBe('services');
    expect(committeeFor(makeBill({ category: 'environment' }))).toBe('environment');
    expect(committeeFor(makeBill({ category: 'civic' }))).toBe('standards');
  });

  it('always improves the bill and always moderates it', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const report = committeeReport(makeBill(), new Rng(seed));
      expect(report.chanceBonus).toBeGreaterThan(0);
      expect(report.moderation).toBeGreaterThan(0);
      expect(report.moderation).toBeLessThan(1);
      expect(report.findings.length).toBeGreaterThan(10);
    }
  });

  it('is deterministic for a seed', () => {
    expect(committeeReport(makeBill(), new Rng(4))).toEqual(
      committeeReport(makeBill(), new Rng(4)),
    );
  });
});

describe('filibusters', () => {
  const parties = [
    makeParty('player', 90, true, false, makeIdeology(-0.4, 0.3, 0.2)),
    makeParty('opp', 90, false, false, makeIdeology(0.7, -0.3, -0.3)),
  ];

  it('is likelier against a bill the opposition hates', () => {
    const agreeable = filibusterRisk(makeBill({ ideology: makeIdeology(0.7, -0.3, -0.3) }), parties, 0.5);
    const hated = filibusterRisk(makeBill({ ideology: makeIdeology(-0.9, 0.9, 0.9) }), parties, 0.5);
    expect(hated).toBeGreaterThan(agreeable);
  });

  it('is pointless against a government that controls the floor', () => {
    const bill = makeBill({ ideology: makeIdeology(-0.9, 0.9, 0.9) });
    expect(filibusterRisk(bill, parties, 0.9)).toBeLessThan(filibusterRisk(bill, parties, 0.4));
  });

  it('is zero with no opposition at all', () => {
    expect(filibusterRisk(makeBill(), [makeParty('player', 180, true)], 1)).toBe(0);
  });

  it('never exceeds its cap', () => {
    const risk = filibusterRisk(makeBill({ ideology: makeIdeology(-1, 1, 1) }), parties, 0);
    expect(risk).toBeLessThanOrEqual(0.65);
  });
});

describe('the two-chamber flow, end to end', () => {
  const build = buildSenate;

  function governing() {
    let state = createStandardGame('senate-flow');
    if (state.phase === 'coalition') {
      for (const candidate of state.negotiation!.candidates) {
        state = applyIntent(state, { type: 'negotiation_accept', partyId: candidate.partyId }).state;
      }
      state = applyIntent(state, { type: 'negotiation_form_government' }).state;
    }
    state = applyIntent(state, { type: 'advance_phase' }).state;
    for (const event of state.events.filter((e) => !e.resolved)) {
      state = applyIntent(state, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
    }
    return applyIntent(state, { type: 'advance_phase' }).state; // agenda
  }

  it('can stop a bill that already carried in the lower house', () => {
    let state = governing();
    const bill = state.bills.find((b) => b.status === 'available' && b.category !== 'fiscal')!;
    state = { ...state, politicalCapital: 100 };
    state = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 5 }).state;

    /* Put one party into opposition and hand it the whole upper house. */
    const opposition = state.parties.find((p) => !p.isPlayer)!;
    state = {
      ...state,
      parties: state.parties.map((p) =>
        p.id === opposition.id ? { ...p, inCoalition: false, coalitionMood: null } : p,
      ),
      senate: build({ [opposition.id]: 1 }),
      phase: 'budget',
    };

    const resolved = resolveTurn(state);
    const after = resolved.bills.find((b) => b.id === bill.id)!;

    expect(after.status).toBe('failed');
    expect(after.blockedBySenate).toBe(true);
    const entries = resolved.logs.find((l) => l.turnNumber === resolved.turnNumber)!.entries;
    expect(entries.some((e) => e.label.includes('blocked by the Senate'))).toBe(true);
  });

  it('lets a money bill through the same hostile Senate', () => {
    let state = governing();
    const money = state.bills.find((b) => b.status === 'available' && b.category === 'fiscal')!;
    state = { ...state, politicalCapital: 100 };
    state = applyIntent(state, { type: 'propose_bill', billId: money.id, whipSteps: 5 }).state;

    const opposition = state.parties.find((p) => !p.isPlayer)!;
    state = {
      ...state,
      parties: state.parties.map((p) =>
        p.id === opposition.id ? { ...p, inCoalition: false, coalitionMood: null } : p,
      ),
      senate: build({ [opposition.id]: 1 }),
      phase: 'budget',
    };

    const after = resolveTurn(state).bills.find((b) => b.id === money.id)!;
    expect(after.blockedBySenate).toBeUndefined();
  });

  it('holds a referred bill out of this month’s division and returns it next month', () => {
    let state = governing();
    const bill = state.bills.find((b) => b.status === 'available')!;
    state = { ...state, politicalCapital: 100 };
    state = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 0 }).state;
    state = applyIntent(state, { type: 'send_to_committee', billId: bill.id }).state;

    expect(state.bills.find((b) => b.id === bill.id)!.status).toBe('in_committee');

    /* It should not be resolved this month. */
    const thisMonth = resolveTurn({ ...state, phase: 'budget' });
    expect(thisMonth.bills.find((b) => b.id === bill.id)!.status).toBe('in_committee');

    /* Next month it returns, improved and moderated. */
    const nextMonth = resolveTurn({ ...thisMonth, phase: 'budget', turnNumber: state.turnNumber + 1 });
    const returned = nextMonth.bills.find((b) => b.id === bill.id)!;
    expect(['passed', 'failed']).toContain(returned.status);
  });

  it('waters a bill down each time it is amended', () => {
    let state = governing();
    const bill = state.bills.find(
      (b) => b.status === 'available' && (b.effects.approval ?? 0) !== 0,
    )!;
    const originalApproval = bill.effects.approval!;

    state = { ...state, politicalCapital: 100 };
    state = applyIntent(state, { type: 'propose_bill', billId: bill.id, whipSteps: 0 }).state;
    state = applyIntent(state, {
      type: 'amend_bill',
      billId: bill.id,
      towardFactionId: state.partyInternals.factions[0]!.id,
    }).state;

    const amended = state.bills.find((b) => b.id === bill.id)!;
    expect(amended.amendments).toBe(1);
    expect(Math.abs(amended.effects.approval!)).toBeLessThan(Math.abs(originalApproval));
  });
});
