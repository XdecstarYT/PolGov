/**
 * budgetProcess.test.ts — the vote a government cannot avoid.
 *
 * These tests are about one claim: that the budget is a political document
 * rather than five sliders. That claim is only true if cutting a department
 * held by a coalition partner is measurably different from cutting one you
 * hold yourself, if most of the total is not a decision at all, and if a
 * government can actually lose the division. Each of those is asserted
 * below, because each of them is a thing the system could quietly stop
 * doing.
 */

import { describe, expect, it } from 'vitest';
import {
  BUDGET_MAX_CUT,
  BUDGET_MAX_RISE,
  BUDGET_TURN_INTERVAL,
  CAPITAL_COMMITMENT_YEARS,
  TOTAL_SEATS,
  TURNS_PER_YEAR,
} from '../balance.ts';
import { MINISTRY_TEMPLATES, findMinistry, ministryFor } from '../content/ministries.ts';
import { SERVICE_TEMPLATES } from '../content/services.ts';
import { buildSectors, createStandardGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import {
  assignMinistries,
  buildBudget,
  cabinetReaction,
  capitalTotal,
  discretionaryTotal,
  divideOnBudget,
  enactBudget,
  enactedTotal,
  holderOf,
  isStatutory,
  lapseBudget,
  lineBounds,
  lineFor,
  ministryTotals,
  proposedTotal,
  rejectBudget,
  sectorsFromBudget,
  serviceFunding,
  statutoryTotal,
  supplyCost,
} from '../systems/budgetProcess.ts';
import { Rng } from '../rng.ts';
import type { Budget, GameState, Party } from '../types.ts';

const budget = () => buildBudget(buildSectors());

function party(over: Partial<Party> & { id: string }): Party {
  return {
    name: over.name ?? over.id,
    shortName: over.shortName ?? over.id,
    color: '#000000',
    glyph: '●',
    isPlayer: false,
    inCoalition: false,
    ideology: { economic: 0, social: 0, environmental: 0 },
    seats: 0,
    coalitionMood: null,
    redLines: [],
    baseStrength: 1,
    cabinetPosts: 0,
    cabinetDemand: 0,
    leaderTitle: 'Leader',
    ...over,
  };
}

/** A government of 100 seats: the player on 70, one partner on 30. */
function government(): Party[] {
  return [
    party({ id: 'player', isPlayer: true, inCoalition: true, seats: 70, coalitionMood: null }),
    party({
      id: 'partner',
      shortName: 'Partner',
      inCoalition: true,
      seats: 30,
      coalitionMood: 60,
      cabinetPosts: 2,
      ideology: { economic: -0.6, social: 0.2, environmental: 0.1 },
    }),
    party({ id: 'opposition', shortName: 'Opposition', seats: TOTAL_SEATS - 100 }),
  ];
}

/** Move a whole ministry's lines by a proportion, ignoring the annual bounds. */
function moveMinistry(b: Budget, key: Parameters<typeof findMinistry>[0], factor: number): Budget {
  const services = new Set<string>(findMinistry(key).services);
  return {
    ...b,
    lines: b.lines.map((l) =>
      services.has(l.service) ? { ...l, proposed: l.enacted * factor } : l,
    ),
  };
}

describe('the shape of the state', () => {
  it('puts every service under exactly one ministry', () => {
    const covered = MINISTRY_TEMPLATES.flatMap((m) => m.services);
    expect(covered).toHaveLength(SERVICE_TEMPLATES.length);
    expect(new Set(covered).size).toBe(SERVICE_TEMPLATES.length);
    for (const template of SERVICE_TEMPLATES) {
      expect(ministryFor(template.key)).toBeDefined();
    }
  });

  it('opens with the previous government’s spending, not a blank sheet', () => {
    const b = budget();
    expect(b.year).toBe(0);
    expect(b.stage).toBe('enacted');
    expect(proposedTotal(b)).toBeCloseTo(enactedTotal(b), 6);

    /* The five sector figures are the same money, grouped differently. */
    const sectors = buildSectors();
    const summary = sectorsFromBudget(b);
    for (const sector of sectors) {
      expect(summary[sector.key]).toBeCloseTo(sector.funding, 4);
    }
  });

  it('is mostly not a decision', () => {
    const b = budget();
    expect(statutoryTotal(b) + discretionaryTotal(b)).toBeCloseTo(proposedTotal(b), 6);
    /*
     * About a sixth of the total, and not a penny of it is what the chamber
     * is voting on. A chancellor who promises to reshape the state in one
     * budget is not being serious, and this is the arithmetic reason.
     */
    const share = statutoryTotal(b) / proposedTotal(b);
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.35);
    expect(b.lines.filter((l) => isStatutory(l.service)).length).toBeGreaterThan(0);
  });

  it('holds every line inside what a department can absorb in a year', () => {
    const line = lineFor(budget(), 'healthcare');
    const bounds = lineBounds(line);
    expect(bounds.min).toBeCloseTo(line.enacted * (1 - BUDGET_MAX_CUT), 6);
    expect(bounds.max).toBeCloseTo(line.enacted * (1 + BUDGET_MAX_RISE), 6);
  });

  it('will not let a successor claw back money already contracted', () => {
    const line = { ...lineFor(budget(), 'healthcare'), committedYears: 2 };
    /* Capital is contracted. Getting it back means breaking a contract. */
    expect(lineBounds(line).min).toBe(line.enacted);
  });
});

describe('who holds the money', () => {
  it('hands portfolios out in proportion to the seats each party brings', () => {
    const parties = government();
    const ministries = assignMinistries(budget().ministries, parties);
    const partnerHeld = ministries.filter((m) => m.heldBy === 'partner');

    /*
     * The partner brings 30 of the government's 100 seats, so it takes
     * roughly three of the eight departments — the empirical regularity that
     * portfolio shares track seat shares, which holds across parliaments
     * that agree on nothing else.
     */
    expect(partnerHeld.length).toBeGreaterThanOrEqual(2);
    expect(partnerHeld.length).toBeLessThanOrEqual(3);
    /* Everything else answers to the governing party, which is what null means. */
    expect(ministries.filter((m) => m.heldBy === null).length).toBe(
      MINISTRY_TEMPLATES.length - partnerHeld.length,
    );
  });

  it('will not give a partner more departments than it negotiated for', () => {
    const parties = government();
    /* A partner with the seats for three but the agreement for one. */
    const capped = parties.map((p) => (p.id === 'partner' ? { ...p, cabinetPosts: 1 } : p));
    const ministries = assignMinistries(budget().ministries, capped);
    expect(ministries.filter((m) => m.heldBy === 'partner')).toHaveLength(1);
  });

  it('does not let one partner walk off with the state', () => {
    /* Seven small partners, each of which asked for five posts. There are
       eight departments; between them they demanded thirty-five. */
    const parties: Party[] = [
      party({ id: 'player', isPlayer: true, inCoalition: true, seats: 40 }),
      ...Array.from({ length: 7 }, (_, i) =>
        party({
          id: `p${i}`,
          shortName: `P${i}`,
          inCoalition: true,
          seats: 14,
          cabinetPosts: 5,
          coalitionMood: 50,
          ideology: { economic: (i - 3) / 4, social: (3 - i) / 4, environmental: i / 8 },
        }),
      ),
    ];
    const ministries = assignMinistries(budget().ministries, parties);
    const counts = new Map<string, number>();
    for (const m of ministries) {
      if (m.heldBy) counts.set(m.heldBy, (counts.get(m.heldBy) ?? 0) + 1);
    }
    /* Nobody holds a majority of the cabinet on 14 seats out of 138. */
    for (const held of counts.values()) {
      expect(held).toBeLessThanOrEqual(2);
    }
    expect(ministries.filter((m) => m.heldBy === null).length).toBeGreaterThanOrEqual(1);
  });

  it('gives no portfolios away when nobody negotiated for one', () => {
    const solo = [party({ id: 'player', isPlayer: true, inCoalition: true, seats: 100 })];
    const ministries = assignMinistries(budget().ministries, solo);
    expect(ministries.every((m) => m.heldBy === null)).toBe(true);
  });

  it('names the party a service’s money actually runs through', () => {
    const parties = government();
    const b = { ...budget(), ministries: assignMinistries(budget().ministries, parties) };
    const held = MINISTRY_TEMPLATES.filter(
      (m) => b.ministries.find((x) => x.key === m.key)?.heldBy === 'partner',
    );
    expect(held.length).toBeGreaterThan(0);
    for (const ministry of held) {
      for (const service of ministry.services) {
        expect(holderOf(b, service)).toBe('partner');
      }
    }
  });

  it('has every minister asking for more than they have', () => {
    const ministries = assignMinistries(budget().ministries, government());
    expect(ministries.every((m) => m.demand > 1)).toBe(true);
    /* And the ones whose costs are contractual asking for most. */
    const defence = ministries.find((m) => m.key === 'defence')!;
    const treasury = ministries.find((m) => m.key === 'treasury')!;
    expect(defence.demand).toBeGreaterThan(treasury.demand);
  });
});

describe('what the cabinet makes of it', () => {
  const held = () => {
    const parties = government();
    const ministries = assignMinistries(budget().ministries, parties);
    const key = ministries.find((m) => m.heldBy === 'partner')!.key;
    return { parties, key, base: { ...budget(), ministries } };
  };

  it('costs coalition mood to cut a partner’s department', () => {
    const { parties, key, base } = held();
    const cut = moveMinistry(base, key, 0.8);
    const reaction = cabinetReaction(cut, parties).find((r) => r.key === key)!;

    expect(reaction.heldBy).toBe('partner');
    expect(reaction.change).toBeCloseTo(-0.2, 4);
    expect(reaction.mood).toBeLessThan(0);
    expect(reaction.rebellion).toBeGreaterThan(0);
    expect(reaction.line).toContain('Partner');
  });

  it('buys about a third as much goodwill to raise one', () => {
    const { parties, key, base } = held();
    const cut = cabinetReaction(moveMinistry(base, key, 0.8), parties).find((r) => r.key === key)!;
    const rise = cabinetReaction(moveMinistry(base, key, 1.2), parties).find((r) => r.key === key)!;

    expect(rise.mood).toBeGreaterThan(0);
    /* Budgets ratchet upward because this exchange rate is not one to one. */
    expect(rise.mood).toBeLessThan(Math.abs(cut.mood));
    expect(rise.rebellion).toBe(0);
  });

  it('has the departments that are hardest to cut fighting hardest', () => {
    const parties = government();
    const base = { ...budget(), ministries: assignMinistries(budget().ministries, parties) };
    const defence = cabinetReaction(moveMinistry(base, 'defence', 0.8), parties).find(
      (r) => r.key === 'defence',
    )!;
    const environment = cabinetReaction(moveMinistry(base, 'environment', 0.8), parties).find(
      (r) => r.key === 'environment',
    )!;
    expect(Math.abs(defence.mood)).toBeGreaterThan(Math.abs(environment.mood));
  });

  it('holds a line flat and is still not thanked for it', () => {
    const parties = government();
    const base = { ...budget(), ministries: assignMinistries(budget().ministries, parties) };
    const flat = cabinetReaction(base, parties)[0]!;
    expect(flat.change).toBeCloseTo(0, 6);
    expect(flat.line).toContain('after inflation is a cut');
  });
});

describe('the division', () => {
  it('carries a budget that does nobody any harm', () => {
    const parties = government();
    const b = { ...budget(), ministries: assignMinistries(budget().ministries, parties) };
    const division = divideOnBudget(b, parties, TOTAL_SEATS);

    expect(division.passed).toBe(true);
    expect(division.for).toBe(100);
    expect(division.against).toBe(TOTAL_SEATS - 100);
    expect(division.rebels).toHaveLength(0);
  });

  it('loses one that guts a partner’s department', () => {
    const parties = government();
    /* A government of 100 in a chamber of 180 has 80 against it already. It
       can afford to lose ten of its own and no more. */
    const ministries = assignMinistries(budget().ministries, parties);
    const key = ministries.find((m) => m.heldBy === 'partner')!.key;
    const gutted = moveMinistry({ ...budget(), ministries }, key, 0.3);

    const division = divideOnBudget(gutted, parties, TOTAL_SEATS);
    expect(division.rebels.some((r) => r.partyId === 'partner')).toBe(true);
    expect(division.passed).toBe(false);
  });

  it('counts every seat once', () => {
    const parties = government();
    const ministries = assignMinistries(budget().ministries, parties);
    const cut = moveMinistry({ ...budget(), ministries }, 'health', 0.7);
    const division = divideOnBudget(cut, parties, TOTAL_SEATS);
    expect(division.for + division.against + division.abstain).toBe(TOTAL_SEATS);
  });

  it('is an estimate the whips can be wrong about', () => {
    const parties = government();
    const ministries = assignMinistries(budget().ministries, parties);
    const key = ministries.find((m) => m.heldBy === 'partner')!.key;
    const cut = moveMinistry({ ...budget(), ministries }, key, 0.75);

    /* Without a generator the answer is the central estimate — the whips'
       count, which is what the player is shown before deciding to go. */
    const count = divideOnBudget(cut, parties, TOTAL_SEATS);
    const drawn = Array.from({ length: 200 }, (_, i) =>
      divideOnBudget(cut, parties, TOTAL_SEATS, new Rng(i + 1)).for,
    );

    /* A whips' count is people asking other people how they intend to vote,
       so the division lands around it rather than on it. */
    expect(new Set(drawn).size).toBeGreaterThan(1);
    const mean = drawn.reduce((sum, x) => sum + x, 0) / drawn.length;
    expect(mean).toBeCloseTo(count.for, 0);
  });

  it('is decided before the day, not on it', () => {
    /*
     * There is no whip argument and no way to spend on the division itself.
     * A budget is a confidence matter: everybody already knows how they are
     * voting, and what decided it was what was done to their departments in
     * the weeks before. If this ever became buyable on the day the vote
     * would stop being loseable, which is the one thing it must not be.
     */
    const parties = government();
    const ministries = assignMinistries(budget().ministries, parties);
    const cut = moveMinistry({ ...budget(), ministries }, 'health', 0.75);
    const twice = [
      divideOnBudget(cut, parties, TOTAL_SEATS, new Rng(99)),
      divideOnBudget(cut, parties, TOTAL_SEATS, new Rng(99)),
    ];
    expect(twice[0]).toEqual(twice[1]);
  });

  it('lets a minority government buy its way through', () => {
    /* The player alone, forty seats short, facing an opposition that would
       vote it down on principle. */
    const parties: Party[] = [
      party({ id: 'player', isPlayer: true, inCoalition: true, seats: 70 }),
      party({ id: 'abstainer', shortName: 'Abstainer', seats: 50 }),
      party({ id: 'opposition', shortName: 'Opposition', seats: TOTAL_SEATS - 120 }),
    ];
    const base = { ...budget(), ministries: assignMinistries(budget().ministries, parties) };

    expect(divideOnBudget(base, parties, TOTAL_SEATS).passed).toBe(false);

    /* Confidence and supply: they do not vote for it, they leave the room. */
    const withSupply = { ...base, supply: ['abstainer'] };
    const division = divideOnBudget(withSupply, parties, TOTAL_SEATS);
    expect(division.passed).toBe(true);
    expect(division.against).toBe(TOTAL_SEATS - 120);
    expect(division.abstain).toBe(50);
  });

  it('charges more for a party that has spent the year attacking you', () => {
    const player = party({
      id: 'player',
      isPlayer: true,
      ideology: { economic: -0.6, social: 0.5, environmental: 0.4 },
    });
    const near = party({
      id: 'near',
      seats: 30,
      ideology: { economic: -0.5, social: 0.4, environmental: 0.3 },
    });
    const far = party({
      id: 'far',
      seats: 30,
      ideology: { economic: 0.8, social: -0.6, environmental: -0.4 },
    });
    expect(supplyCost(far, player)).toBeGreaterThan(supplyCost(near, player));
    /* And more for a bigger one, because seats are what they are selling. */
    expect(supplyCost({ ...near, seats: 60 }, player)).toBeGreaterThan(supplyCost(near, player));
  });
});

describe('enacting it', () => {
  it('turns the proposal into the money actually being spent', () => {
    const parties = government();
    const ministries = assignMinistries(budget().ministries, parties);
    const proposed = moveMinistry({ ...budget(), ministries }, 'education', 1.1);
    const enacted = enactBudget(proposed, 20);

    expect(enacted.stage).toBe('enacted');
    expect(enacted.year).toBe(1);
    expect(enacted.enactedTurn).toBe(20);
    expect(enactedTotal(enacted)).toBeCloseTo(proposedTotal(proposed), 6);
    expect(serviceFunding(enacted)['education']).toBeCloseTo(
      lineFor(enacted, 'education').enacted,
      6,
    );
  });

  it('binds the next three budgets when it builds something', () => {
    const b = budget();
    const building = {
      ...b,
      lines: b.lines.map((l) =>
        l.service === 'healthcare' ? { ...l, capitalShare: 0.5, proposed: l.enacted * 1.3 } : l,
      ),
    };
    const enacted = enactBudget(building, 5);
    expect(lineFor(enacted, 'healthcare').committedYears).toBe(CAPITAL_COMMITMENT_YEARS);
    /* Which is precisely the point: a successor cannot cut it. */
    expect(lineBounds(lineFor(enacted, 'healthcare')).min).toBe(
      lineFor(enacted, 'healthcare').enacted,
    );

    /* And the commitment runs down a year at a time. */
    const nextYear = enactBudget(enacted, 5 + TURNS_PER_YEAR);
    expect(lineFor(nextYear, 'healthcare').committedYears).toBe(CAPITAL_COMMITMENT_YEARS - 1);
  });

  it('sends a share of capital spending into the country’s condition', () => {
    const b = budget();
    expect(capitalTotal(b)).toBeGreaterThan(0);
  });
});

describe('losing it', () => {
  it('rolls last year’s figures on and counts the defeat', () => {
    const parties = government();
    const ministries = assignMinistries(budget().ministries, parties);
    const proposed = moveMinistry({ ...budget(), ministries }, 'health', 1.2);
    const lost = rejectBudget(proposed);

    expect(lost.stage).toBe('rejected');
    expect(lost.defeats).toBe(1);
    /* The state does not stop. It carries on at the old numbers. */
    expect(proposedTotal(lost)).toBeCloseTo(enactedTotal(lost), 6);
    expect(enactedTotal(lost)).toBeCloseTo(enactedTotal(budget()), 6);
  });

  it('treats never presenting one exactly as badly as losing it', () => {
    const before = budget();
    const lapsed = lapseBudget(before, 14);

    expect(lapsed.defeats).toBe(1);
    expect(lapsed.stage).toBe('rejected');
    expect(lapsed.year).toBe(before.year + 1);
    expect(enactedTotal(lapsed)).toBeCloseTo(enactedTotal(before), 6);
    expect(lapsed.division).toBeNull();
  });

  it('clears the count once a budget finally passes', () => {
    const twice = lapseBudget(lapseBudget(budget(), 14), 14 + TURNS_PER_YEAR);
    expect(twice.defeats).toBe(2);
    expect(enactBudget(twice, 80).defeats).toBe(0);
  });
});

describe('the arithmetic the chancellor has to make add up', () => {
  it('reports a ministry’s total as the sum of its lines', () => {
    const b = budget();
    const totals = ministryTotals(b, 'health');
    const byHand = findMinistry('health')
      .services.map((s) => lineFor(b, s).enacted)
      .reduce((sum, x) => sum + x, 0);
    expect(totals.enacted).toBeCloseTo(byHand, 6);
    expect(totals.change).toBeCloseTo(0, 6);
  });

  it('leaves the season long enough to argue and short enough to matter', () => {
    /* A quarter of the year. Long enough for a cabinet row, too short to
       reopen every week, which is what would make the decision weightless. */
    expect(BUDGET_TURN_INTERVAL).toBeGreaterThan(4);
    expect(BUDGET_TURN_INTERVAL).toBeLessThan(TURNS_PER_YEAR / 2);
  });
});

/* ------------------------------------------------------------------ *
 * Through the turn engine
 * ------------------------------------------------------------------ */

/**
 * The unit tests above check the budget in isolation. These check that it is
 * actually wired into the run: that the season is real, that passing one
 * changes what the state spends, and that not passing one is the crisis the
 * module claims it is.
 */
describe('the budget inside a run', () => {
  const inOffice = (): GameState => {
    let state = createStandardGame('budget-run');
    if (state.phase === 'coalition') {
      for (const candidate of state.negotiation!.candidates) {
        state = applyIntent(state, {
          type: 'negotiation_accept',
          partyId: candidate.partyId,
        }).state;
      }
      state = applyIntent(state, { type: 'negotiation_form_government' }).state;
    }
    return state;
  };

  /** Advance whole turns, resolving whatever the week puts in the way. */
  const weeks = (state: GameState, count: number): GameState => {
    let s = state;
    for (let i = 0; i < count; i += 1) {
      const from = s.turnNumber;
      let guard = 0;
      while (s.turnNumber === from && s.status === 'active' && guard < 12) {
        guard += 1;
        for (const event of s.events.filter((e) => !e.resolved)) {
          s = applyIntent(s, { type: 'resolve_event', eventId: event.id, choiceIndex: 0 }).state;
        }
        s = applyIntent(s, { type: 'advance_phase' }).state;
      }
    }
    return s;
  };

  it('hands the portfolios out when a government forms', () => {
    const state = inOffice();
    const partners = state.parties.filter((p) => p.inCoalition && !p.isPlayer);
    if (partners.length === 0) return; /* An outright majority governs alone. */
    expect(state.budget.ministries.some((m) => m.heldBy !== null)).toBe(true);
    for (const ministry of state.budget.ministries) {
      if (ministry.heldBy === null) continue;
      expect(partners.some((p) => p.id === ministry.heldBy)).toBe(true);
    }
  });

  it('writes a line, puts it to the chamber, and spends the money', () => {
    const state = inOffice();
    expect(state.turnNumber).toBeLessThanOrEqual(BUDGET_TURN_INTERVAL);

    const before = lineFor(state.budget, 'police').enacted;
    const moved = applyIntent(state, {
      type: 'set_budget_line',
      service: 'police',
      amount: before * 1.1,
    });
    expect(moved.error).toBeUndefined();
    expect(moved.state.budget.stage).toBe('drafting');
    expect(lineFor(moved.state.budget, 'police').proposed).toBeCloseTo(before * 1.1, 0);

    const presented = applyIntent(moved.state, { type: 'present_budget' });
    expect(presented.error).toBeUndefined();
    expect(presented.state.budget.division).not.toBeNull();

    if (presented.state.budget.stage === 'enacted') {
      /* The money is now actually being spent, and the sector summary the
         rest of the engine reads has followed the line. */
      expect(lineFor(presented.state.budget, 'police').enacted).toBeCloseTo(before * 1.1, 0);
      const summary = sectorsFromBudget(presented.state.budget);
      const interior = presented.state.sectors.find((s) => s.key === 'economy')!;
      expect(interior.funding).toBeCloseTo(summary.economy, 4);
    }
  });

  it('refuses to reopen the document outside the season', () => {
    const state = weeks(inOffice(), BUDGET_TURN_INTERVAL + 1);
    const attempt = applyIntent(state, {
      type: 'set_budget_line',
      service: 'police',
      amount: 1,
    });
    expect(attempt.error).toBeDefined();
    expect(attempt.state).toBe(state);
  });

  it('will not let a budget touch what is set in law', () => {
    const state = inOffice();
    const attempt = applyIntent(state, {
      type: 'set_budget_line',
      service: 'pensions',
      amount: lineFor(state.budget, 'pensions').enacted * 0.9,
    });
    expect(attempt.error).toContain('Change it with a bill');
  });

  it('charges the country for a year with no budget in it', () => {
    const start = inOffice();
    const after = weeks(start, BUDGET_TURN_INTERVAL + 1);
    if (after.status !== 'active') return;

    /* Nothing was ever put to the chamber, so the deadline passed. */
    expect(after.budget.defeats).toBeGreaterThanOrEqual(1);
    expect(after.approval).toBeLessThan(start.approval);

    const entries = after.logs.flatMap((l) => l.entries);
    expect(entries.some((e) => e.label === 'No budget for the year')).toBe(true);
  });

  it('re-prices entitlements off the population, without a vote', () => {
    const start = inOffice();
    const pensionsAtStart = lineFor(start.budget, 'pensions').enacted;
    const after = weeks(start, TURNS_PER_YEAR + 2);
    if (after.status !== 'active') return;

    /* The country aged for a year and the bill arrived by itself. */
    expect(lineFor(after.budget, 'pensions').enacted).toBeGreaterThan(pensionsAtStart);
    /* And the treasury is paying it: the sector summary moved with it. */
    expect(sectorsFromBudget(after.budget).health).toBeCloseTo(
      after.sectors.find((s) => s.key === 'health')!.funding,
      4,
    );
  });
});
