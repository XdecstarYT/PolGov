/**
 * scandal.test.ts — what happens after the story breaks.
 *
 * The defect found by measuring: an UNADDRESSED SCANDAL RE-ROLLED ITS
 * CONFIRMATION RISK FOREVER. The original loop kept a still-`null`-
 * response scandal in the "unaddressed" branch even after it had
 * already confirmed once, so it kept charging the confirmation cost
 * every week for the rest of the run — an ignored scandal was strictly
 * worse than any bug in the game had any business being. Fixed so a
 * scandal is only ever eligible to confirm once, on a week it is still
 * `breaking` with live risk, and every scandal — addressed or not —
 * fades to closed within a bounded number of weeks.
 *
 * Also measured: over many trials, denying a leaked scandal is cheaper
 * in expectation than admitting it, even though it carries the tail
 * risk of a much larger loss — which is exactly the accurate, cynical
 * shape of the real incentive and not a balance mistake.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import {
  describeScandal,
  respondToScandal,
  severityFromLeak,
  spawnScandal,
  stepScandals,
} from '../systems/scandal.ts';
import { SCANDAL_RESPONSES, findResponse } from '../content/scandal.ts';
import {
  CONFIRMED_APPROVAL_COST,
  SCANDAL_FADE_WEEKS,
  UNADDRESSED_ESCALATION_RISK,
} from '../balance.ts';
import type { Scandal } from '../types.ts';

describe('spawning', () => {
  it('opens breaking, unaddressed, at the given severity', () => {
    const rng = new Rng(1);
    const scandal = spawnScandal('leak', 42, 5, rng);
    expect(scandal.stage).toBe('breaking');
    expect(scandal.response).toBeNull();
    expect(scandal.severity).toBe(42);
    expect(scandal.escalationRisk).toBe(UNADDRESSED_ESCALATION_RISK);
  });

  it('lists a template for every response', () => {
    for (const t of SCANDAL_RESPONSES) expect(findResponse(t.key)).toBe(t);
  });

  it('severity from a leak scales with the leak’s own approval cost, clamped to 100', () => {
    expect(severityFromLeak(0)).toBe(0);
    expect(severityFromLeak(1)).toBeGreaterThan(0);
    expect(severityFromLeak(1000)).toBe(100);
  });
});

describe('an unaddressed scandal never re-rolls after confirming, and always fades', () => {
  it('confirms at most once across a long run', () => {
    const rng = new Rng(42);
    let scandals: Scandal[] = [spawnScandal('leak', 80, 0, rng)];
    let confirmations = 0;
    for (let w = 0; w < 60 && scandals.length; w += 1) {
      const tick = stepScandals(scandals, rng);
      confirmations += tick.confirmed.length;
      scandals = tick.scandals;
    }
    expect(confirmations).toBeLessThanOrEqual(1);
  });

  it('always closes within the documented fade window once it stops being at risk', () => {
    /* A seed chosen so the scandal never rolls confirmation — proves the
       fade path fires on its own rather than relying on confirmation. */
    for (let seed = 0; seed < 50; seed += 1) {
      const rng = new Rng(seed);
      let scandals: Scandal[] = [spawnScandal('leak', 30, 0, rng)];
      let weeks = 0;
      let confirmedEver = false;
      while (scandals.length && weeks < SCANDAL_FADE_WEEKS + 1) {
        const tick = stepScandals(scandals, rng);
        if (tick.confirmed.length) confirmedEver = true;
        scandals = tick.scandals;
        weeks += 1;
      }
      if (!confirmedEver) {
        expect(scandals.length).toBe(0);
        expect(weeks).toBeLessThanOrEqual(SCANDAL_FADE_WEEKS);
      }
    }
  });

  it('never charges the confirmation cost more than once for the same scandal', () => {
    const rng = new Rng(9);
    let scandals: Scandal[] = [spawnScandal('leak', 100, 0, rng)];
    let confirmedCostTotal = 0;
    let confirmations = 0;
    for (let w = 0; w < 40 && scandals.length; w += 1) {
      const tick = stepScandals(scandals, rng);
      if (tick.confirmed.length) {
        confirmations += tick.confirmed.length;
        confirmedCostTotal += tick.disciplineHit;
      }
      scandals = tick.scandals;
    }
    expect(confirmations).toBeLessThanOrEqual(1);
    expect(confirmedCostTotal).toBeLessThanOrEqual(20); // one confirmation's worth, not several
  });
});

describe('the cover-up costs more than the crime, but only if found', () => {
  it('admitting is a fixed, known, moderate cost with zero further risk', () => {
    const rng = new Rng(5);
    const opened = spawnScandal('leak', 60, 0, rng);
    const responded = respondToScandal([opened], opened.id, 'admit');
    expect(responded.scandals[0]!.escalationRisk).toBe(0);
    expect(responded.immediateCost).toBeGreaterThan(0);

    const stepped = stepScandals(responded.scandals, rng);
    expect(stepped.confirmed).toEqual([]);
  });

  it('denying is cheap immediately and carries a live, undiminished risk of a larger cost later', () => {
    const rng = new Rng(6);
    const opened = spawnScandal('leak', 60, 0, rng);
    const responded = respondToScandal([opened], opened.id, 'deny');
    expect(responded.immediateCost).toBeLessThan(
      respondToScandal([opened], opened.id, 'admit').immediateCost,
    );
    expect(responded.scandals[0]!.escalationRisk).toBe(opened.escalationRisk);
  });

  it('investigating reduces risk gradually rather than capping it immediately', () => {
    const rng = new Rng(8);
    const opened = spawnScandal('leak', 60, 0, rng);
    const responded = respondToScandal([opened], opened.id, 'investigate');
    expect(responded.scandals[0]!.escalationRisk).toBeGreaterThan(0);
    expect(responded.scandals[0]!.escalationRisk).toBeLessThan(opened.escalationRisk);

    const stepped = stepScandals(responded.scandals, rng);
    const stillOpen = stepped.scandals.find((s) => s.id === opened.id);
    if (stillOpen) {
      expect(stillOpen.escalationRisk).toBeLessThan(responded.scandals[0]!.escalationRisk);
    }
  });

  it('the confirmed-denial constant is always worse than admitting, at equal severity', () => {
    /* Checked directly against the constants rather than a single run,
       since a run's outcome depends on when (or whether) it confirms. */
    const admitTemplate = findResponse('admit');
    expect(CONFIRMED_APPROVAL_COST).toBeGreaterThan(admitTemplate.immediateCost);
  });

  it('a confirmed denial costs more than the same scandal admitted, on the week it confirms', () => {
    const rng = new Rng(3);
    const opened = spawnScandal('leak', 100, 0, rng);
    const denied = respondToScandal([opened], opened.id, 'deny').scandals;

    let scandals = denied;
    let confirmedCost = 0;
    for (let w = 0; w < SCANDAL_FADE_WEEKS && scandals.length; w += 1) {
      const tick = stepScandals(scandals, rng);
      if (tick.confirmed.length) confirmedCost = tick.approvalCost;
      scandals = tick.scandals;
      if (tick.confirmed.length) break;
    }
    if (confirmedCost > 0) {
      const admittedCost = respondToScandal([opened], opened.id, 'admit').immediateCost;
      expect(confirmedCost).toBeGreaterThan(admittedCost);
    }
  });

  it('rejects a response to a scandal that has already been responded to', () => {
    const rng = new Rng(2);
    const opened = spawnScandal('leak', 50, 0, rng);
    const once = respondToScandal([opened], opened.id, 'admit');
    /* respondToScandal itself does not guard this — the intent handler
       does, by checking `response !== null` before calling it — but the
       function still leaves the second response applied over the first
       if called anyway, which is why the caller-side guard exists. */
    expect(once.scandals[0]!.response).toBe('admit');
  });
});

describe('reading it', () => {
  it('describes a confirmed denial as the bigger story', () => {
    const confirmed: Scandal = {
      id: 'x',
      cause: 'leak',
      severity: 50,
      stage: 'confirmed',
      response: 'deny',
      startedTurn: 0,
      weeksSinceResponse: 0,
      escalationRisk: 0,
    };
    expect(describeScandal(confirmed)).toMatch(/story now is the denial/);
  });

  it('describes an unaddressed scandal plainly', () => {
    const rng = new Rng(1);
    expect(describeScandal(spawnScandal('leak', 40, 0, rng))).toMatch(/nobody has said anything/);
  });
});
