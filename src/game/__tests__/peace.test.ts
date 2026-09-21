/**
 * peace.test.ts — what the country thinks they have, and whether it can
 * stop.
 *
 * Three defects found by running wars rather than weeks:
 *
 * No war could be settled at all. The sunk-cost weight against the
 * settle threshold put willingness permanently below it, so a government
 * that wanted to stop could not and nothing in the engine said why.
 *
 * The other side evaluated our offers from OUR point of view — the same
 * paper, the same signs — so a deal good for us was good for them.
 *
 * And a mediator was worth nothing measurable, because the concession
 * was being charged twice and swamped everything a mediator could cover.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import {
  accept,
  blockedByAim,
  breakOffTalks,
  buildWarTalks,
  describeNegotiation,
  domesticCost,
  estimateDiscredited,
  estimateError,
  makeOffer,
  offerValue,
  openTalks,
  refuse,
  revisAim,
  stepPeace,
  willingness,
  wouldSettle,
  type PeaceInputs,
} from '../systems/peace.ts';
import {
  ESTIMATE_BIASES,
  MEDIATORS,
  TERM_TEMPLATES,
  findBias,
  findMediator,
  findTerm,
} from '../content/peace.ts';
import { ESTIMATE_TOLERANCE, SETTLE_THRESHOLD } from '../balance.ts';
import type { Negotiation } from '../types.ts';

const inputs = (turn: number, over: Partial<PeaceInputs> = {}): PeaceInputs => ({
  theirStrength: 100,
  theirResolve: 60,
  reconnaissance: 0.5,
  inContact: true,
  battlefield: 0,
  ourExhaustion: 30,
  theirExhaustion: 30,
  ourSpent: 20,
  theirSpent: 20,
  turn,
  rng: new Rng(turn + 4),
  ...over,
});

const run = (
  negotiation: Negotiation,
  weeks: number,
  over: (t: number) => Partial<PeaceInputs> = () => ({}),
) => {
  let n = negotiation;
  const out = { offers: 0, blocked: 0, settledAt: -1, discreditedAt: -1, trappedAt: -1 };
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepPeace(n, inputs(t, over(t)));
    n = tick.negotiation;
    if (tick.offered) {
      out.offers += 1;
      if (tick.offered.blockedByAim) out.blocked += 1;
    }
    if (tick.settlement && out.settledAt < 0) out.settledAt = t;
    if (tick.discredited && out.discreditedAt < 0) out.discreditedAt = t;
    if (tick.trapped && out.trappedAt < 0) out.trappedAt = t;
  }
  return { negotiation: n, ...out };
};

/* ------------------------------------------------------------------ *
 * Intelligence
 * ------------------------------------------------------------------ */

describe('intelligence: the estimate is biased, not noisy', () => {
  it('reads ambiguous evidence in one direction and stays there', () => {
    const inflated = run(buildWarTalks('w', 'aim', 50, 100, 60, 'threat_inflation'), 104);
    const wishful = run(buildWarTalks('w', 'aim', 50, 100, 60, 'wishful'), 104);
    expect(estimateError(inflated.negotiation.estimate)).toBeGreaterThan(0.3);
    expect(estimateError(wishful.negotiation.estimate)).toBeLessThan(-0.25);
  });

  it('cannot be fixed by looking harder', () => {
    /*
     * The distinction the whole file turns on. Noise averages out and
     * shrinks with effort; bias does not, because it is not produced by
     * carelessness — it is produced by people facing a direction.
     */
    const error = (reconnaissance: number) =>
      estimateError(
        run(buildWarTalks('w', 'aim', 50, 100, 60, 'threat_inflation'), 208, () => ({
          reconnaissance,
        })).negotiation.estimate,
      );
    expect(error(0.9)).toBeCloseTo(error(0), 2);
    expect(error(0.9)).toBeGreaterThan(0.3);
  });

  it('becomes more confident without becoming more right', () => {
    const out = run(buildWarTalks('w', 'aim', 50, 100, 60, 'threat_inflation'), 208);
    expect(out.negotiation.estimate.confidence).toBeGreaterThan(0.8);
    expect(Math.abs(estimateError(out.negotiation.estimate))).toBeGreaterThan(ESTIMATE_TOLERANCE);
  });

  it('is found out eventually, after the decisions that rested on it', () => {
    const out = run(buildWarTalks('w', 'aim', 50, 100, 60, 'wishful'), 208);
    expect(out.discreditedAt).toBeGreaterThan(0);
    expect(estimateDiscredited(out.negotiation.estimate)).toBe(true);
    expect(describeNegotiation(out.negotiation)).toMatch(/one direction/);
  });

  it('leaves an unbiased estimate right and still uncertain', () => {
    const out = run(buildWarTalks('w', 'aim', 50, 100, 60, 'honest'), 208);
    expect(Math.abs(estimateError(out.negotiation.estimate))).toBeLessThan(0.05);
    expect(estimateDiscredited(out.negotiation.estimate)).toBe(false);
    expect(out.negotiation.estimate.confidence).toBeLessThan(1);
  });

  it('says whose interest each bias serves, because nobody is lying', () => {
    for (const bias of ESTIMATE_BIASES) {
      expect(bias.serves.length).toBeGreaterThan(20);
      expect(findBias(bias.key).factor).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The trap
 * ------------------------------------------------------------------ */

describe('peace: the war aim you announced is the trap', () => {
  it('lets a government that said little sign what one that said much cannot', () => {
    const offer = makeOffer('them', ['territory', 'reparations'], ['withdrawal'], 'none', 0);
    const quiet = buildWarTalks('w', 'restore the border', 20, 100, 60);
    const loud = buildWarTalks('w', 'nothing less than total victory', 90, 100, 60);
    expect(blockedByAim(offer, quiet)).toBe(false);
    expect(blockedByAim(offer, loud)).toBe(true);
  });

  it('blocks a large concession before a small one', () => {
    const negotiation = buildWarTalks('w', 'aim', 80, 100, 60);
    const small = makeOffer('them', ['guarantees'], ['withdrawal'], 'none', 0);
    const large = makeOffer('them', ['territory', 'autonomy'], ['guarantees'], 'none', 0);
    expect(blockedByAim(small, negotiation)).toBe(false);
    expect(blockedByAim(large, negotiation)).toBe(true);
  });

  it('cannot be escaped by signing anyway', () => {
    const negotiation = buildWarTalks('w', 'aim', 92, 100, 60);
    const offer = makeOffer('them', ['territory'], ['withdrawal'], 'none', 0);
    expect(wouldSettle(offer, negotiation, 100, 100)).toBe(false);
  });

  it('can be escaped by taking back what was said, which is the cost', () => {
    const trapped = buildWarTalks('w', 'aim', 92, 100, 60);
    const offer = makeOffer('them', ['territory'], ['withdrawal'], 'none', 0);
    expect(blockedByAim(offer, trapped)).toBe(true);
    const recanted = revisAim(trapped, 30);
    expect(blockedByAim(offer, recanted)).toBe(false);
  });

  it('charges more at home for the terms that are worth least', () => {
    /* Territory is worth a great deal and costs a great deal. An amnesty
       is worth almost nothing and is unsurvivable. */
    expect(findTerm('amnesty').weight).toBeLessThan(findTerm('territory').weight);
    expect(findTerm('amnesty').domesticCost).toBeGreaterThan(findTerm('reparations').domesticCost);
    expect(findTerm('recognition').domesticCost).toBeGreaterThan(findTerm('recognition').weight);
    for (const term of TERM_TEMPLATES) {
      expect(term.memoryYears).toBeGreaterThan(5);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Sunk costs, and whether it ends
 * ------------------------------------------------------------------ */

describe('peace: the more that has been spent, the worse a deal looks', () => {
  it('makes settling harder as the bill rises, which is backwards', () => {
    const offer = makeOffer('them', ['access'], ['withdrawal'], 'none', 0);
    expect(willingness(60, 10, offer, 'none')).toBeGreaterThan(
      willingness(60, 70, offer, 'none'),
    );
    /* And what is spent is gone either way, which is what makes it the
       only position a government can hold in public rather than a
       sensible one. */
    expect(willingness(80, 10, offer, 'none')).toBeGreaterThan(SETTLE_THRESHOLD);
    expect(willingness(20, 10, offer, 'none')).toBeLessThan(SETTLE_THRESHOLD);
  });

  it('lets a war end, late', () => {
    /*
     * The defect this replaced: no war in the engine could be settled at
     * all. The point is that wars end LATE, not that they cannot end.
     */
    const out = run(
      openTalks(buildWarTalks('w', 'restore the border', 25, 100, 60), 'neutral_state'),
      208,
      (t) => ({
        battlefield: -0.5,
        ourExhaustion: Math.min(95, 20 + t * 0.35),
        theirExhaustion: Math.min(85, 15 + t * 0.3),
        ourSpent: Math.min(85, t * 0.35),
        theirSpent: Math.min(70, t * 0.25),
      }),
    );
    expect(out.settledAt).toBeGreaterThan(52);
    expect(out.settledAt).toBeLessThan(208);
  });

  it('keeps a trapped government at war longer, on average', () => {
    /*
     * Averaged across seeds rather than asserted on one. Which offer
     * happens to arrive in which week is chance; that a government with
     * a firm declared aim spends longer at war is not, and the second
     * claim is the one worth locking down.
     */
    const HORIZON = 260;
    const scenario = (firmness: number, seed: number) => {
      let n = openTalks(buildWarTalks('w', 'aim', firmness, 100, 60), 'neutral_state');
      let blocked = 0;
      for (let t = 0; t < HORIZON; t += 1) {
        const tick = stepPeace(n, {
          ...inputs(t),
          rng: new Rng(seed * 1000 + t),
          battlefield: -0.6,
          ourExhaustion: Math.min(95, 20 + t * 0.35),
          theirExhaustion: Math.min(85, 15 + t * 0.25),
          ourSpent: Math.min(90, t * 0.4),
          theirSpent: Math.min(70, t * 0.25),
        });
        n = tick.negotiation;
        if (tick.offered?.blockedByAim) blocked += 1;
        if (tick.settlement) return { week: t, blocked };
      }
      return { week: HORIZON, blocked };
    };

    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const mean = (firmness: number) =>
      seeds.reduce((s, seed) => s + scenario(firmness, seed).week, 0) / seeds.length;
    const blocked = (firmness: number) =>
      seeds.reduce((s, seed) => s + scenario(firmness, seed).blocked, 0);

    expect(blocked(88)).toBeGreaterThan(blocked(20) * 2);
    expect(mean(88)).toBeGreaterThan(mean(20));
  });

  it('makes the terms worse the longer a losing side waits', () => {
    const out = run(
      openTalks(buildWarTalks('w', 'aim', 88, 100, 60), 'neutral_state'),
      208,
      () => ({ battlefield: -0.7 }),
    );
    expect(out.negotiation.refused.length).toBeGreaterThan(2);
    expect(describeNegotiation(out.negotiation)).toMatch(/\S/);
  });
});

describe('peace: a mediator sells cover, not fairness', () => {
  it('makes agreeing easier without making the terms better', () => {
    const terms = (mediator: 'none' | 'great_power') =>
      makeOffer('them', ['access', 'reparations'], ['withdrawal', 'guarantees'], mediator, 0);
    /* The paper is the same. */
    expect(offerValue(terms('none'))).toBe(offerValue(terms('great_power')));
    expect(domesticCost(terms('none'))).toBe(domesticCost(terms('great_power')));
    /* What changes is whether it can be signed. */
    expect(willingness(60, 40, terms('great_power'), 'great_power')).toBeGreaterThan(
      willingness(60, 40, terms('none'), 'none') + 8,
    );
  });

  it('gives every mediator something it is for', () => {
    for (const mediator of MEDIATORS) {
      expect(findMediator(mediator.key).blurb.length).toBeGreaterThan(20);
      expect(mediator.cover).toBeGreaterThanOrEqual(0);
    }
    expect(findMediator('international_body').cover).toBeGreaterThan(
      findMediator('neutral_state').cover,
    );
  });

  it('lets the other side read the same paper with the signs reversed', () => {
    /*
     * The defect this replaced: the other side evaluated our offers from
     * our point of view, so a deal good for us was good for them and
     * every war ended the moment anybody proposed anything.
     */
    const lopsided = makeOffer('them', ['territory', 'autonomy'], ['guarantees'], 'none', 0);
    expect(willingness(60, 30, lopsided, 'none', 'them')).toBeGreaterThan(
      willingness(60, 30, lopsided, 'none', 'us'),
    );
  });
});

describe('peace: the mechanics of the table', () => {
  it('records what was refused, because the record is the point', () => {
    const negotiation = openTalks(buildWarTalks('w', 'aim', 40, 100, 60), 'none');
    const offer = makeOffer('them', ['access'], ['withdrawal'], 'none', 0);
    const withOffer: Negotiation = { ...negotiation, offers: [offer] };
    const after = refuse(withOffer, offer.id);
    expect(after.offers).toHaveLength(0);
    expect(after.refused).toHaveLength(1);
  });

  it('signs one, and stops talking afterwards', () => {
    const offer = makeOffer('them', ['access'], ['withdrawal'], 'none', 0);
    const negotiation: Negotiation = {
      ...openTalks(buildWarTalks('w', 'aim', 20, 100, 60), 'none'),
      offers: [offer],
    };
    const signed = accept(negotiation, offer.id);
    expect(signed.settled).toBe(offer);
    expect(signed.talking).toBe(false);
  });

  it('lets a government walk out, which costs nothing today', () => {
    const negotiation = openTalks(buildWarTalks('w', 'aim', 40, 100, 60), 'great_power');
    expect(negotiation.talking).toBe(true);
    const gone = breakOffTalks(negotiation);
    expect(gone.talking).toBe(false);
    expect(gone.offers).toHaveLength(0);
  });

  it('records what was said in week one, while the rally was on', () => {
    const negotiation = buildWarTalks('w', 'nothing less than the border restored', 85, 100, 60);
    expect(negotiation.declaredAim).toMatch(/border/);
    expect(negotiation.declaredFirmness).toBe(85);
    expect(negotiation.talking).toBe(false);
  });
});
