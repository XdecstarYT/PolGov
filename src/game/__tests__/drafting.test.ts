/**
 * drafting.test.ts — the model authors, the engine adjudicates.
 *
 * Everything here is a test of the second half of that sentence. The draft
 * arrives from a client, which means it arrives from somewhere a determined
 * player controls entirely, and the only thing standing between a text box
 * and infinite approval is this code. So the tests are written the way a
 * person trying to break it would write them: absurd numbers, unknown keys,
 * wrong types, missing fields, and a bill that is all upside.
 */

import { describe, expect, it } from 'vitest';
import {
  BENEFIT_ALLOWANCE,
  BILL_CATEGORIES,
  FREE_ALLOWANCE,
  ENVELOPE,
  describeDraft,
  draftingVocabulary,
  readDraft,
  weigh,
  type RawDraft,
} from '../systems/drafting.ts';
import { DRAFT_BILL_LIMIT, DRAFT_BILL_PC_COST, SECTOR_KEYS } from '../balance.ts';
import { BILL_TEMPLATES } from '../content/bills.ts';
import { createStandardGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import { ALLOWED_INTENT_TYPES } from '../serverGuards.ts';
import type { GameState } from '../types.ts';

const draft = (raw: RawDraft, description = 'A bill about schools and teacher pay') =>
  readDraft(raw, 'test-1', description);

const atAgenda = (id = 'draft'): GameState => ({
  ...createStandardGame(id),
  phase: 'agenda',
  negotiation: null,
  politicalCapital: 100,
});

describe('reading a draft', () => {
  it('never throws, whatever arrives', () => {
    const rubbish: RawDraft[] = [
      {},
      { title: 42, summary: null, effects: 'yes' },
      { category: 'interdimensional', magnitude: 'enormous' },
      { effects: { approval: 'lots', treasury: [1, 2, 3] } },
      { ideology: 'left' } as RawDraft,
      { effects: null },
    ];
    for (const raw of rubbish) {
      expect(() => draft(raw)).not.toThrow();
      const { bill } = draft(raw);
      expect(bill.title.length).toBeGreaterThan(0);
      expect(bill.summary.length).toBeGreaterThan(0);
      expect(BILL_CATEGORIES).toContain(bill.category);
      expect(['minor', 'major']).toContain(bill.magnitude);
    }
  });

  it('clamps every figure to what a bill of that size may do', () => {
    /* The obvious attack: ask for a thousand of everything. */
    const { bill, notes } = draft({
      magnitude: 'major',
      effects: {
        approval: 900,
        treasury: 100000,
        debt: -100000,
        revenueDelta: 9999,
        coalitionMood: 500,
        sectorDeltas: { health: 80, education: 80 },
        fundingDeltas: { health: 5000 },
        industryDeltas: { technology: 99 },
      },
    });

    const limit = ENVELOPE.major;
    expect(Math.abs(bill.effects.approval ?? 0)).toBeLessThanOrEqual(limit.approval);
    expect(Math.abs(bill.effects.treasury ?? 0)).toBeLessThanOrEqual(limit.treasury);
    expect(Math.abs(bill.effects.debt ?? 0)).toBeLessThanOrEqual(limit.debt);
    expect(Math.abs(bill.effects.revenueDelta ?? 0)).toBeLessThanOrEqual(limit.revenueDelta);
    for (const value of Object.values(bill.effects.sectorDeltas ?? {})) {
      expect(Math.abs(value ?? 0)).toBeLessThanOrEqual(limit.sectorDelta);
    }
    /* And it said so, rather than quietly rewriting what somebody typed. */
    expect(notes.length).toBeGreaterThan(0);
    expect(bill.draftNotes).toEqual(notes);
  });

  it('holds a minor bill to a smaller envelope than a major one', () => {
    const effects = { approval: 100, treasury: -100, sectorDeltas: { health: 100 } };
    const small = draft({ magnitude: 'minor', effects }).bill;
    const large = draft({ magnitude: 'major', effects }).bill;
    expect(Math.abs(small.effects.treasury ?? 0)).toBeLessThan(
      Math.abs(large.effects.treasury ?? 0),
    );
    expect(small.effects.sectorDeltas!.health).toBeLessThan(
      large.effects.sectorDeltas!.health!,
    );
  });

  it('drops keys the engine has never heard of', () => {
    const { bill, notes } = draft({
      effects: {
        sectorDeltas: { health: 3, morale: 40, vibes: 99 },
        industryDeltas: { technology: 4, unicorns: 50 },
        /* And a whole field that is not in the vocabulary at all. */
        approvalRating: 500,
        politicalCapital: 500,
      },
    });
    expect(Object.keys(bill.effects.sectorDeltas ?? {})).toEqual(['health']);
    expect(Object.keys(bill.effects.industryDeltas ?? {})).toEqual(['technology']);
    expect((bill.effects as Record<string, unknown>).approvalRating).toBeUndefined();
    /* Political capital is not in the drafting vocabulary: a bill that
       paid for itself in the currency used to table it would be free. */
    expect(bill.effects.politicalCapital).toBeUndefined();
    expect(notes.some((n) => n.includes('unrecognised'))).toBe(true);
  });

  it('will not let one bill pull every lever in the game', () => {
    const { bill } = draft({
      magnitude: 'minor',
      effects: {
        approval: 2,
        treasury: -10,
        debt: 5,
        revenueDelta: 10,
        coalitionMood: 2,
        sectorDeltas: Object.fromEntries(SECTOR_KEYS.map((k) => [k, 2])),
        fundingDeltas: Object.fromEntries(SECTOR_KEYS.map((k) => [k, 5])),
      },
    });
    const levers =
      ['approval', 'treasury', 'debt', 'revenueDelta', 'coalitionMood'].filter(
        (k) => (bill.effects as Record<string, number | undefined>)[k],
      ).length +
      Object.keys(bill.effects.sectorDeltas ?? {}).length +
      Object.keys(bill.effects.fundingDeltas ?? {}).length +
      Object.keys(bill.effects.industryDeltas ?? {}).length;
    expect(levers).toBeLessThanOrEqual(ENVELOPE.minor.levers);
  });
});

describe('a bill has to cost something', () => {
  it('cuts a bill that is all upside', () => {
    /* Every benefit, no cost — which is what a model asked to write a good
       law will produce, every time, with a summary explaining why. */
    const wish = draft({
      magnitude: 'major',
      effects: {
        approval: 6,
        sectorDeltas: { health: 7, education: 7 },
        revenueDelta: 120,
      },
    });

    const { benefit, cost } = weigh(wish.bill.effects);
    expect(benefit).toBeLessThanOrEqual(
      Math.max(cost * BENEFIT_ALLOWANCE, FREE_ALLOWANCE) + 0.5,
    );
    expect(wish.notes.some((n) => n.includes('Scaled back'))).toBe(true);

    /* And what survived is a fraction of what was asked for. */
    expect(wish.bill.effects.revenueDelta ?? 0).toBeLessThan(120);
    expect(wish.bill.effects.sectorDeltas!.health).toBeLessThan(7);
  });

  it('leaves an honest bill alone', () => {
    const honest = draft({
      magnitude: 'major',
      effects: {
        approval: -3,
        sectorDeltas: { health: 5 },
        treasury: -55,
      },
    });
    expect(honest.notes.some((n) => n.includes('Scaled back'))).toBe(false);
    expect(honest.bill.effects.sectorDeltas!.health).toBe(5);
  });

  it('allows a bill that is all cost, because governments pass those too', () => {
    const austerity = draft({
      magnitude: 'major',
      effects: { approval: -6, sectorDeltas: { health: -6 }, revenueDelta: 100 },
    });
    expect(austerity.bill.effects.approval).toBe(-6);
    expect(austerity.bill.effects.sectorDeltas!.health).toBe(-6);
  });

  it('reads the balance back in a sentence', () => {
    expect(describeDraft(draft({ effects: {} }).bill)).toMatch(/changes nothing/);
    expect(
      describeDraft(draft({ magnitude: 'major', effects: { approval: 5 } }).bill).length,
    ).toBeGreaterThan(10);
  });
});

describe('filing', () => {
  it('guesses a category from what the player asked for', () => {
    expect(draft({}, 'Build more hospitals and hire nurses').bill.category).toBe('health');
    expect(draft({}, 'Tighten emissions limits on heavy industry').bill.category).toBe('environment');
    expect(draft({}, 'Raise the top rate of income tax').bill.category).toBe('fiscal');
    expect(draft({}, 'Something about nothing in particular').bill.category).toBe('civic');
  });

  it('keeps what the player actually typed', () => {
    const asked = 'Free bus travel for everybody under twenty-five, paid for by a fuel duty';
    const { bill } = draft({ title: 'Young Persons’ Travel Bill' }, asked);
    expect(bill.draftPrompt).toBe(asked);
    expect(bill.drafted).toBe(true);
    expect(bill.status).toBe('available');
  });
});

describe('through the turn engine', () => {
  it('is on the allow-list, because the engine re-reads every field', () => {
    expect(ALLOWED_INTENT_TYPES.has('draft_bill')).toBe(true);
  });

  it('puts a bill on the paper and charges for it', () => {
    const state = atAgenda('draft-one');
    const before = state.politicalCapital;
    const result = applyIntent(state, {
      type: 'draft_bill',
      description: 'A schools bill raising teacher pay, paid for out of borrowing',
      draft: {
        title: 'Teachers’ Pay Bill',
        magnitude: 'major',
        effects: { sectorDeltas: { education: 5 }, debt: 60, approval: 2 },
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.state.politicalCapital).toBe(before - DRAFT_BILL_PC_COST);
    const bill = result.state.bills.find((b) => b.drafted);
    expect(bill).toBeDefined();
    expect(bill!.title).toBe('Teachers’ Pay Bill');
    expect(bill!.status).toBe('available');
  });

  it('refuses a description nobody could draft from', () => {
    const state = atAgenda('draft-empty');
    expect(applyIntent(state, { type: 'draft_bill', description: 'x', draft: {} }).error)
      .toBeTruthy();
  });

  it('will not let a government paper the chamber with its own bills', () => {
    let state = atAgenda('draft-limit');
    for (let i = 0; i < DRAFT_BILL_LIMIT; i += 1) {
      const result = applyIntent(state, {
        type: 'draft_bill',
        description: `A perfectly ordinary bill number ${i + 1} about public services`,
        draft: { title: `Bill ${i + 1}`, effects: { approval: -1 } },
      });
      expect(result.error).toBeUndefined();
      state = { ...result.state, politicalCapital: 100 };
    }
    const overflow = applyIntent(state, {
      type: 'draft_bill',
      description: 'One more bill about public services, just to see',
      draft: {},
    });
    expect(overflow.error).toBeTruthy();
  });

  it('goes through the chamber like any other bill', () => {
    const state = atAgenda('draft-table');
    const drafted = applyIntent(state, {
      type: 'draft_bill',
      description: 'A bill widening the carbon levy and spending the proceeds on rail',
      draft: {
        title: 'Carbon and Rail Bill',
        magnitude: 'major',
        effects: { sectorDeltas: { environment: 4 }, approval: -3, revenueDelta: 40 },
      },
    }).state;

    const bill = drafted.bills.find((b) => b.drafted)!;
    const tabled = applyIntent(
      { ...drafted, politicalCapital: 100 },
      { type: 'propose_bill', billId: bill.id, whipSteps: 1 },
    );

    expect(tabled.error).toBeUndefined();
    const after = tabled.state.bills.find((b) => b.id === bill.id)!;
    expect(after.status).toBe('proposed');
    /* The chamber has an opinion about it, computed the same way it
       computes an opinion about every other bill. */
    expect(after.passChance).toBeGreaterThan(0);
    expect(after.passChance).toBeLessThan(100);
  });
});

describe('the envelope is measured off the designed bills', () => {
  it('lets a drafted bill be as good a deal as the best one somebody wrote', () => {
    /*
     * The rule, and the reason it is computed rather than chosen. An
     * earlier version used 1.15, picked by intuition, and held drafted
     * bills to a standard NONE of the forty-eight designed bills met —
     * their median is around two and a half. An honest tax-and-spend
     * draft came back cut to a third while the hand-written bill next to
     * it on the order paper did the same thing untouched.
     */
    let best = 0;
    let freest = 0;
    for (const template of BILL_TEMPLATES) {
      const { benefit, cost } = weigh(template.effects);
      if (benefit <= 0) continue;
      if (cost > 0) best = Math.max(best, benefit / cost);
      else freest = Math.max(freest, benefit);
    }

    expect(BENEFIT_ALLOWANCE).toBeCloseTo(best, 6);
    expect(FREE_ALLOWANCE).toBeCloseTo(freest, 6);
    /* And the designed bills really are more generous than intuition
       suggests, which is the whole finding. */
    expect(BENEFIT_ALLOWANCE).toBeGreaterThan(3);
  });

  it('passes an honest tax-and-spend bill through untouched', () => {
    const honest = draft(
      {
        category: 'education',
        magnitude: 'major',
        effects: {
          sectorDeltas: { education: 5 },
          fundingDeltas: { education: 42 },
          revenueDelta: 38,
          approval: -2.5,
        },
      },
      'Free school meals for every primary pupil, paid for by ending a tax break',
    );

    expect(honest.notes).toEqual([]);
    expect(honest.bill.effects.revenueDelta).toBe(38);
    expect(honest.bill.effects.sectorDeltas!.education).toBe(5);
    expect(honest.bill.effects.fundingDeltas!.education).toBe(42);
    expect(honest.bill.effects.approval).toBe(-2.5);
  });

  it('still guts a bill that asks for everything and offers nothing', () => {
    const wish = draft({
      magnitude: 'major',
      effects: {
        approval: 40,
        treasury: 5000,
        revenueDelta: 900,
        sectorDeltas: { economy: 60, health: 60, education: 60 },
      },
    });
    expect(wish.notes.some((n) => n.includes('Scaled back'))).toBe(true);
    expect(wish.bill.effects.approval!).toBeLessThan(2);
    expect(wish.bill.effects.revenueDelta!).toBeLessThan(30);
  });
});

describe('what the model is told', () => {
  it('is the engine’s own vocabulary, not a copy of it', () => {
    const vocabulary = draftingVocabulary('major');
    expect(vocabulary.categories).toEqual(BILL_CATEGORIES);
    expect(vocabulary.sectors).toEqual(SECTOR_KEYS);
    expect(vocabulary.limits).toEqual(ENVELOPE.major);
    /* Adding an industry to the game teaches the drafter about it without
       anybody editing a prompt in a different repository. */
    expect(vocabulary.industries.length).toBeGreaterThan(8);
  });
});
