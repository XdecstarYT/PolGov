import { describe, expect, it } from 'vitest';
import {
  applyChannelPush,
  availableVolunteerPushes,
  computeSwing,
  conductPoll,
  decayReach,
  exitPoll,
  persuasionBySegment,
  projectSeats,
  recountCandidates,
  turnoutBySegment,
} from '../systems/media.ts';
import { allocateLargestRemainder } from '../systems/electoralSystems.ts';
import { CHANNEL_TEMPLATES, channelTemplate } from '../content/channels.ts';
import { POLL_SAMPLE_LARGE, POLL_SAMPLE_SMALL, VOLUNTEERS_PER_MEMBER } from '../balance.ts';
import { Rng } from '../rng.ts';

const truth = { player: 0.38, rival: 0.34, third: 0.18, minor: 0.1 };

describe('channels reach different people', () => {
  it('gives every channel a cost, a reach and a persuasion profile', () => {
    for (const channel of CHANNEL_TEMPLATES) {
      expect(channel.cost).toBeGreaterThan(0);
      expect(Object.keys(channel.reach).length).toBeGreaterThan(3);
      expect(channel.persuasion).toBeGreaterThan(0);
      expect(channel.blurb.length).toBeGreaterThan(30);
    }
  });

  it('reaches older voters on television and younger ones on social platforms', () => {
    const tv = channelTemplate('television').reach;
    const social = channelTemplate('social').reach;
    expect(tv.retirees!).toBeGreaterThan(tv.students ?? 0);
    expect(social.students!).toBeGreaterThan(social.retirees ?? 0);
  });

  it('accumulates reach where a channel lands and nowhere else', () => {
    let reach = applyChannelPush({}, 'television');
    reach = applyChannelPush(reach, 'television');
    expect(reach.retirees!).toBeCloseTo(channelTemplate('television').reach.retirees! * 2, 6);
    /* Television has no entry for farmers, so they stay untouched. */
    expect(reach.farmers).toBeUndefined();
  });

  it('diminishes: the tenth advertisement is worth far less than the first', () => {
    let reach: ReturnType<typeof applyChannelPush> = {};
    const gains: number[] = [];
    let previous = 0;
    for (let i = 0; i < 6; i += 1) {
      reach = applyChannelPush(reach, 'television');
      const value = persuasionBySegment(reach).retirees ?? 0;
      gains.push(value - previous);
      previous = value;
    }
    expect(gains[0]!).toBeGreaterThan(gains[5]!);
  });

  it('fades between turns', () => {
    const reach = applyChannelPush({}, 'radio');
    const faded = decayReach(reach);
    expect(faded.farmers!).toBeLessThan(reach.farmers!);
  });

  it('drops to nothing eventually rather than lingering forever', () => {
    let reach = applyChannelPush({}, 'radio');
    /* Three years of weeks. Attention fades at the same real-time speed it
       always did; there are simply more turns for it to fade across. */
    for (let i = 0; i < 160; i += 1) reach = decayReach(reach);
    expect(Object.keys(reach)).toHaveLength(0);
  });

  it('turns reach into both persuasion and turnout', () => {
    const reach = applyChannelPush({}, 'social');
    expect(persuasionBySegment(reach).students!).toBeGreaterThan(0);
    expect(turnoutBySegment(reach).students!).toBeGreaterThan(0);
  });

  it('limits door knocking by the membership you actually have', () => {
    expect(availableVolunteerPushes(200, 0)).toBe(Math.floor(200 * VOLUNTEERS_PER_MEMBER));
    expect(availableVolunteerPushes(200, 999)).toBe(0);
    expect(availableVolunteerPushes(0, 0)).toBe(0);
  });
});

describe('polls are samples, not the truth', () => {
  it('returns shares summing to 1', () => {
    const poll = conductPoll(truth, 'standard', new Rng(1));
    expect(Object.values(poll.shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
  });

  it('is usually wrong, and by more on a small sample', () => {
    const errorFor = (quality: 'small' | 'large') => {
      let total = 0;
      for (let seed = 0; seed < 60; seed += 1) {
        const poll = conductPoll(truth, quality, new Rng(seed));
        total += Math.abs((poll.shares.player ?? 0) - truth.player);
      }
      return total / 60;
    };
    const small = errorFor('small');
    const large = errorFor('large');
    expect(small).toBeGreaterThan(0);
    expect(small).toBeGreaterThan(large);
  });

  it('quotes a wider margin of error on a smaller sample', () => {
    expect(conductPoll(truth, 'small', new Rng(1)).marginOfError).toBeGreaterThan(
      conductPoll(truth, 'large', new Rng(1)).marginOfError,
    );
    expect(conductPoll(truth, 'small', new Rng(1)).sampleSize).toBe(POLL_SAMPLE_SMALL);
    expect(conductPoll(truth, 'large', new Rng(1)).sampleSize).toBe(POLL_SAMPLE_LARGE);
  });

  it('is unbiased — the average of many polls converges on the truth', () => {
    let total = 0;
    const runs = 300;
    for (let seed = 0; seed < runs; seed += 1) {
      total += conductPoll(truth, 'standard', new Rng(seed)).shares.player ?? 0;
    }
    expect(total / runs).toBeCloseTo(truth.player, 2);
  });

  it('lets two polls the same week disagree', () => {
    const a = conductPoll(truth, 'small', new Rng(11)).shares.player!;
    const b = conductPoll(truth, 'small', new Rng(12)).shares.player!;
    expect(a).not.toBeCloseTo(b, 4);
  });

  it('is deterministic for a seed', () => {
    expect(conductPoll(truth, 'standard', new Rng(7)).shares).toEqual(
      conductPoll(truth, 'standard', new Rng(7)).shares,
    );
  });

  it('never returns a negative or non-finite share', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const poll = conductPoll({ a: 0.02, b: 0.98 }, 'small', new Rng(seed));
      for (const value of Object.values(poll.shares)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

describe('seat projections carry their uncertainty', () => {
  const poll = conductPoll(truth, 'standard', new Rng(3));

  it('projects a full chamber', () => {
    const projection = projectSeats(poll, 180, allocateLargestRemainder);
    expect(Object.values(projection.seats).reduce((a, b) => a + b, 0)).toBe(180);
  });

  it('brackets the central projection with a band', () => {
    const projection = projectSeats(poll, 180, allocateLargestRemainder);
    /* The leading party's band must actually be a band. */
    expect(projection.high.player!).toBeGreaterThan(projection.low.player!);
    expect(projection.seats.player!).toBeGreaterThanOrEqual(projection.low.player!);
    expect(projection.seats.player!).toBeLessThanOrEqual(projection.high.player!);
  });

  it('keeps the central estimate a complete chamber', () => {
    const projection = projectSeats(poll, 180, allocateLargestRemainder);
    expect(Object.values(projection.seats).reduce((a, b) => a + b, 0)).toBe(180);
  });

  it('gives bands that do not sum to the chamber, because they are per party', () => {
    /*
     * Every party cannot simultaneously be at the top of its range. A band
     * that summed to 180 would be arithmetic, not uncertainty.
     */
    const projection = projectSeats(poll, 180, allocateLargestRemainder);
    expect(Object.values(projection.high).reduce((a, b) => a + b, 0)).toBeGreaterThan(180);
    expect(Object.values(projection.low).reduce((a, b) => a + b, 0)).toBeLessThan(180);
  });
});

describe('election night', () => {
  it('takes a tighter exit poll than a campaign poll', () => {
    expect(exitPoll(truth, new Rng(2)).marginOfError).toBeLessThan(
      conductPoll(truth, 'standard', new Rng(2)).marginOfError,
    );
  });

  it('flags only genuinely close districts for a recount', () => {
    const outcomes = [
      { districtId: 'a', districtName: 'A', shares: { x: 0.501, y: 0.499 } },
      { districtId: 'b', districtName: 'B', shares: { x: 0.7, y: 0.3 } },
      { districtId: 'c', districtName: 'C', shares: { x: 0.503, y: 0.497 } },
    ];
    const close = recountCandidates(outcomes);
    expect(close.map((c) => c.districtId)).toEqual(['a', 'c']);
    expect(close[0]!.margin).toBeLessThan(close[1]!.margin);
  });

  it('returns nothing when every seat is comfortable', () => {
    expect(
      recountCandidates([{ districtId: 'a', districtName: 'A', shares: { x: 0.8, y: 0.2 } }]),
    ).toHaveLength(0);
  });

  it('computes swing between two results in percentage points', () => {
    const swing = computeSwing({ a: 0.4, b: 0.6 }, { a: 0.45, b: 0.55 });
    expect(swing.a).toBeCloseTo(5, 6);
    expect(swing.b).toBeCloseTo(-5, 6);
  });

  it('treats a party that did not stand last time as an entirely new arrival', () => {
    const swing = computeSwing({ a: 1 }, { a: 0.8, newcomer: 0.2 });
    expect(swing.newcomer).toBeCloseTo(20, 6);
  });
});
