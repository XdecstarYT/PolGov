import { describe, expect, it } from 'vitest';
import { allocateSeats, approvalMultiplier, regionalAffinity, simulateElection } from '../systems/election.ts';
import { TOTAL_SEATS } from '../balance.ts';
import { makeIdeology } from '../ideology.ts';
import { Rng } from '../rng.ts';
import { buildRegions } from '../setup.ts';
import type { Party } from '../types.ts';

const makeParty = (id: string, ideology = makeIdeology(0, 0, 0), isPlayer = false): Party => ({
  id,
  name: id,
  shortName: id,
  color: '#000',
  glyph: '●',
  isPlayer,
  inCoalition: isPlayer,
  ideology,
  seats: 0,
  coalitionMood: null,
  redLines: [],
  baseStrength: 1,
  cabinetPosts: 0,
  cabinetDemand: 0,
  leaderTitle: 'Leader',
});

describe('seat allocation', () => {
  it('allocates exactly the seats available', () => {
    const result = allocateSeats({ a: 0.5, b: 0.3, c: 0.2 }, 30);
    expect(Object.values(result).reduce((x, y) => x + y, 0)).toBe(30);
  });

  it('allocates proportionally when shares divide evenly', () => {
    expect(allocateSeats({ a: 0.5, b: 0.5 }, 20)).toEqual({ a: 10, b: 10 });
  });

  it('assigns leftover seats by largest remainder', () => {
    // Quotas: a 3.4, b 3.4, c 3.2 -> bases 3/3/3, one seat left to a (tie broken by id).
    const result = allocateSeats({ a: 0.34, b: 0.34, c: 0.32 }, 10);
    expect(result).toEqual({ a: 4, b: 3, c: 3 });
    expect(result.a + result.b + result.c).toBe(10);
  });

  it('never returns a negative allocation', () => {
    const result = allocateSeats({ a: 1, b: 0 }, 7);
    expect(result.b).toBe(0);
    expect(result.a).toBe(7);
  });

  it('is deterministic under ties', () => {
    const first = allocateSeats({ zeta: 1 / 3, alpha: 1 / 3, mid: 1 / 3 }, 10);
    const second = allocateSeats({ zeta: 1 / 3, alpha: 1 / 3, mid: 1 / 3 }, 10);
    expect(first).toEqual(second);
  });

  it('handles more seats than parties and vice versa', () => {
    expect(Object.values(allocateSeats({ a: 1 }, 30)).reduce((x, y) => x + y, 0)).toBe(30);
    const many = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`p${i}`, 1 / 12]),
    );
    expect(Object.values(allocateSeats(many, 3)).reduce((x, y) => x + y, 0)).toBe(3);
  });
});

describe('regional affinity', () => {
  it('peaks when a party sits exactly on a region’s lean', () => {
    const lean = makeIdeology(0.3, -0.2, 0.1);
    expect(regionalAffinity(lean, lean)).toBeCloseTo(1, 6);
  });

  it('falls monotonically with distance', () => {
    const lean = makeIdeology(0, 0, 0);
    const near = regionalAffinity(makeIdeology(0.2, 0, 0), lean);
    const far = regionalAffinity(makeIdeology(0.9, 0, 0), lean);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

describe('simulateElection', () => {
  const parties = [
    makeParty('player', makeIdeology(-0.1, 0.2, 0.2), true),
    makeParty('a', makeIdeology(0.6, -0.1, -0.3)),
    makeParty('b', makeIdeology(-0.6, 0.3, 0.2)),
    makeParty('c', makeIdeology(0.2, -0.6, 0)),
  ];

  it('returns exactly the national seat total', () => {
    const result = simulateElection(parties, buildRegions(), 50, null, 1, new Rng(1));
    const total = Object.values(result.seatsByParty).reduce((x, y) => x + y, 0);
    expect(total).toBe(TOTAL_SEATS);
  });

  it('returns a seat total per region matching that region’s entitlement', () => {
    const result = simulateElection(parties, buildRegions(), 50, null, 1, new Rng(7));
    for (const region of result.regions) {
      const total = Object.values(region.seatsByParty).reduce((x, y) => x + y, 0);
      expect(total).toBe(region.seats);
    }
  });

  it('produces vote shares that sum to 1', () => {
    const result = simulateElection(parties, buildRegions(), 50, null, 1, new Rng(3));
    const total = Object.values(result.voteShareByParty).reduce((x, y) => x + y, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('is deterministic for a given seed', () => {
    const a = simulateElection(parties, buildRegions(), 50, null, 1, new Rng(42));
    const b = simulateElection(parties, buildRegions(), 50, null, 1, new Rng(42));
    expect(a.seatsByParty).toEqual(b.seatsByParty);
  });

  it('rewards a popular incumbent with more seats than an unpopular one', () => {
    const low = simulateElection(parties, buildRegions(), 20, null, 1, new Rng(11));
    const high = simulateElection(parties, buildRegions(), 85, null, 1, new Rng(11));
    expect(high.seatsByParty.player).toBeGreaterThan(low.seatsByParty.player);
  });

  it('rewards campaign investment in the region it was spent', () => {
    const plain = buildRegions();
    const invested = buildRegions().map((r) =>
      r.id === 'halloway' ? { ...r, campaignInvestment: 8 } : r,
    );
    const without = simulateElection(parties, plain, 50, null, 1, new Rng(5));
    const withStops = simulateElection(parties, invested, 50, null, 1, new Rng(5));

    const seatsIn = (result: typeof without) =>
      result.regions.find((r) => r.regionId === 'halloway')!.seatsByParty.player ?? 0;
    expect(seatsIn(withStops)).toBeGreaterThanOrEqual(seatsIn(without));
    expect(withStops.seatsByParty.player).toBeGreaterThan(without.seatsByParty.player);
  });

  it('reports turnout inside a plausible band', () => {
    for (const approval of [0, 25, 50, 75, 100]) {
      const result = simulateElection(parties, buildRegions(), approval, null, 1, new Rng(approval + 1));
      expect(result.turnout).toBeGreaterThanOrEqual(0.35);
      expect(result.turnout).toBeLessThanOrEqual(0.92);
    }
  });
});

describe('approvalMultiplier', () => {
  it('increases monotonically with approval', () => {
    expect(approvalMultiplier(80)).toBeGreaterThan(approvalMultiplier(50));
    expect(approvalMultiplier(50)).toBeGreaterThan(approvalMultiplier(20));
  });

  it('stays positive even at zero approval', () => {
    expect(approvalMultiplier(0)).toBeGreaterThan(0);
  });
});
