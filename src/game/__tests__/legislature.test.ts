import { describe, expect, it } from 'vitest';
import {
  billPcCost,
  billViolatesRedLine,
  computePassChance,
  findRedLineBreaches,
  resolveBillVote,
} from '../systems/legislature.ts';
import {
  PASS_CHANCE_MAX,
  PASS_CHANCE_MIN,
  PC_COSTS,
  SECTOR_BASELINE_FUNDING,
  SECTOR_KEYS,
  WHIP_STEP_BONUS,
} from '../balance.ts';
import { Rng } from '../rng.ts';
import { makeIdeology } from '../ideology.ts';
import type { Bill, Party, RedLine, Sector } from '../types.ts';

const sectors: Sector[] = SECTOR_KEYS.map((key) => ({
  key,
  health: 60,
  funding: SECTOR_BASELINE_FUNDING[key],
}));

const makeBill = (overrides: Partial<Bill> = {}): Bill => ({
  id: 'bill-x',
  templateKey: 'x',
  title: 'Test Measure',
  summary: '',
  tradeoff: '',
  category: 'fiscal',
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

const makeParty = (overrides: Partial<Party> = {}): Party => ({
  id: 'p',
  name: 'Party',
  shortName: 'P',
  color: '#000',
  glyph: '●',
  isPlayer: false,
  inCoalition: false,
  ideology: makeIdeology(0, 0, 0),
  seats: 0,
  coalitionMood: null,
  redLines: [],
  baseStrength: 1,
  cabinetPosts: 0,
  cabinetDemand: 0,
  leaderTitle: 'Leader',
  prioritySector: 'economy' as const,
  sectorFloor: 240,
  redLinePool: [],
  ...overrides,
});

describe('pass chance', () => {
  it('rises with the share of seats behind the bill', () => {
    const small = computePassChance(
      makeBill(),
      [makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 40 }), makeParty({ id: 'opp', seats: 140 })],
      sectors,
      0,
    );
    const large = computePassChance(
      makeBill(),
      [makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 140 }), makeParty({ id: 'opp', seats: 40 })],
      sectors,
      0,
    );
    expect(large.chance).toBeGreaterThan(small.chance);
  });

  it('adds exactly WHIP_STEP_BONUS per whip step, before clamping', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 60 }),
      makeParty({ id: 'opp', seats: 120 }),
    ];
    const none = computePassChance(makeBill(), parties, sectors, 0).chance;
    const two = computePassChance(makeBill(), parties, sectors, 2).chance;
    expect(two - none).toBeCloseTo(WHIP_STEP_BONUS * 2, 6);
  });

  it('penalises major bills relative to minor ones', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 90 }),
      makeParty({ id: 'opp', seats: 90 }),
    ];
    const minor = computePassChance(makeBill({ magnitude: 'minor' }), parties, sectors, 0).chance;
    const major = computePassChance(makeBill({ magnitude: 'major' }), parties, sectors, 0).chance;
    expect(major).toBeLessThan(minor);
  });

  it('clamps into the 0.05..0.95 band', () => {
    const hopeless = computePassChance(
      makeBill({ magnitude: 'major' }),
      [makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 1 }), makeParty({ id: 'opp', seats: 179 })],
      sectors,
      0,
    );
    const certain = computePassChance(
      makeBill(),
      [makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 179 }), makeParty({ id: 'opp', seats: 1 })],
      sectors,
      5,
    );
    expect(hopeless.chance).toBe(PASS_CHANCE_MIN);
    expect(certain.chance).toBe(PASS_CHANCE_MAX);
  });

  it('reports terms that reconstruct the unclamped figure', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 70 }),
      makeParty({
        id: 'ally',
        inCoalition: true,
        seats: 30,
        coalitionMood: 70,
        ideology: makeIdeology(0.2, 0, 0),
      }),
      makeParty({ id: 'opp', seats: 80 }),
    ];
    const result = computePassChance(makeBill(), parties, sectors, 1);
    const sum = result.terms.reduce((total, t) => total + t.value, 0);
    expect(sum).toBeCloseTo(result.chance, 6);
  });

  it('rises with coalition mood', () => {
    const build = (mood: number) => [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 60 }),
      makeParty({ id: 'ally', inCoalition: true, seats: 40, coalitionMood: mood }),
      makeParty({ id: 'opp', seats: 80 }),
    ];
    const sour = computePassChance(makeBill(), build(10), sectors, 0).chance;
    const happy = computePassChance(makeBill(), build(90), sectors, 0).chance;
    expect(happy).toBeGreaterThan(sour);
  });
});

describe('red lines', () => {
  const axisLine: RedLine = {
    id: 'rl-axis',
    kind: 'ideology_axis',
    axis: 'economic',
    direction: 'negative',
    magnitude: 0.5,
    description: 'No sharp move toward collective provision.',
  };

  it('detects an ideology axis breach only past the stated magnitude', () => {
    expect(billViolatesRedLine(makeBill({ ideology: makeIdeology(-0.7, 0, 0) }), axisLine, sectors)).toBe(true);
    expect(billViolatesRedLine(makeBill({ ideology: makeIdeology(-0.3, 0, 0) }), axisLine, sectors)).toBe(false);
    // The opposite direction is not this partner's concern.
    expect(billViolatesRedLine(makeBill({ ideology: makeIdeology(0.9, 0, 0) }), axisLine, sectors)).toBe(false);
  });

  it('detects a sector floor breach only when funding would actually fall below it', () => {
    const floor: RedLine = {
      id: 'rl-floor',
      kind: 'sector_floor',
      sector: 'health',
      threshold: 336,
      description: 'Health stays at or above ₡336bn a year.',
    };
    // Baseline health funding is ₡360bn a year; a ₡12bn cut stays above it.
    expect(billViolatesRedLine(makeBill({ effects: { fundingDeltas: { health: -12 } } }), floor, sectors)).toBe(false);
    expect(billViolatesRedLine(makeBill({ effects: { fundingDeltas: { health: -60 } } }), floor, sectors)).toBe(true);
    // An increase never breaches a floor.
    expect(billViolatesRedLine(makeBill({ effects: { fundingDeltas: { health: 120 } } }), floor, sectors)).toBe(false);
  });

  it('detects a category breach', () => {
    const cat: RedLine = {
      id: 'rl-cat',
      kind: 'bill_category',
      category: 'security',
      description: 'No expansion of emergency powers.',
    };
    expect(billViolatesRedLine(makeBill({ category: 'security' }), cat, sectors)).toBe(true);
    expect(billViolatesRedLine(makeBill({ category: 'health' }), cat, sectors)).toBe(false);
  });

  it('withholds the offended partner’s seats rather than blocking the bill', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 100 }),
      makeParty({ id: 'ally', inCoalition: true, seats: 30, coalitionMood: 60, redLines: [axisLine] }),
      makeParty({ id: 'opp', seats: 50 }),
    ];
    const offending = makeBill({ ideology: makeIdeology(-0.9, 0, 0) });
    const result = computePassChance(offending, parties, sectors, 0);

    expect(result.breaches).toHaveLength(1);
    expect(result.defectingSeats).toBe(30);
    expect(result.supportingSeats).toBe(100);
    // Still passable on the player's own seats — it simply costs the partner.
    expect(result.chance).toBeGreaterThan(PASS_CHANCE_MIN);
  });

  it('ignores red lines held by parties outside the coalition', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 100 }),
      makeParty({ id: 'opp', seats: 80, redLines: [axisLine] }),
    ];
    expect(findRedLineBreaches(makeBill({ ideology: makeIdeology(-0.9, 0, 0) }), parties, sectors)).toHaveLength(0);
  });
});

describe('costs and the division', () => {
  it('prices bills by magnitude plus whipping', () => {
    expect(billPcCost(makeBill({ magnitude: 'minor' }), 0)).toBe(PC_COSTS.proposeMinorBill);
    expect(billPcCost(makeBill({ magnitude: 'major' }), 0)).toBe(PC_COSTS.proposeMajorBill);
    expect(billPcCost(makeBill({ magnitude: 'minor' }), 3)).toBe(
      PC_COSTS.proposeMinorBill + 3 * PC_COSTS.whipStep,
    );
  });

  it('resolves votes at approximately the stated probability', () => {
    const rng = new Rng(12345);
    let passes = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i += 1) {
      if (resolveBillVote(rng, 0.7)) passes += 1;
    }
    expect(passes / trials).toBeGreaterThan(0.68);
    expect(passes / trials).toBeLessThan(0.72);
  });

  it('is deterministic for a given seed', () => {
    const a = new Rng(999);
    const b = new Rng(999);
    const seqA = Array.from({ length: 50 }, () => resolveBillVote(a, 0.5));
    const seqB = Array.from({ length: 50 }, () => resolveBillVote(b, 0.5));
    expect(seqA).toEqual(seqB);
  });
});
