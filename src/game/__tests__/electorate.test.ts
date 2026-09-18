import { describe, expect, it } from 'vitest';
import {
  computeIssueScores,
  nationalShares,
  regionBreakdown,
  segmentSatisfaction,
  segmentTurnout,
  segmentVoteShares,
  topIssues,
  type SupportContext,
} from '../systems/electorate.ts';
import {
  ISSUE_KEYS,
  SEGMENT_TEMPLATES,
  segmentTemplate,
  type SegmentTemplate,
} from '../content/segments.ts';
import { SECTOR_BASELINE_FUNDING, SECTOR_KEYS, TURNOUT_BASELINE } from '../balance.ts';
import { buildRegions } from '../setup.ts';
import { makeIdeology } from '../ideology.ts';
import type { Economy, Party, Sector } from '../types.ts';
import { buildEconomy } from '../systems/economy.ts';

const sectorsAt = (health: number, overrides: Partial<Record<string, number>> = {}): Sector[] =>
  SECTOR_KEYS.map((key) => ({
    key,
    health: overrides[key] ?? health,
    funding: SECTOR_BASELINE_FUNDING[key],
  }));

const makeParty = (id: string, ideology = makeIdeology(0, 0, 0), isPlayer = false): Party => ({
  id,
  name: id,
  shortName: id,
  color: '#000',
  glyph: '●',
  isPlayer,
  inCoalition: isPlayer,
  ideology,
  seats: 20,
  coalitionMood: null,
  redLines: [],
  baseStrength: 1,
  cabinetPosts: 0,
  cabinetDemand: 0,
  leaderTitle: 'Leader',
});

/**
 * An economy at rest. The economy and cost-of-living issues are read off the
 * macroeconomy now, not off a funding dial, so a test that wants to move them
 * moves the economy.
 */
const econ = (overrides: Partial<Economy> = {}): Economy => ({ ...buildEconomy(), ...overrides });

const ctx = (sectors: Sector[], debt = 0, revenue = 0): SupportContext => ({
  scores: computeIssueScores(sectors, debt, revenue, econ()),
  incumbentId: 'player',
});

describe('issue scores', () => {
  it('reads the four service issues straight off sector health', () => {
    const scores = computeIssueScores(sectorsAt(70), 0, 0, econ());
    for (const key of ['health', 'education', 'infrastructure', 'environment'] as const) {
      expect(scores[key]).toBe(70);
    }
  });

  it('scores the economy off the macroeconomy, not off what it is funded at', () => {
    const rest = sectorsAt(60);
    /* Same budget in both. The only thing that differs is what the country
       is actually doing, which is the whole point of the coupling. */
    const good = computeIssueScores(rest, 0, 0, econ()).economy;
    const bad = computeIssueScores(rest, 0, 0, econ({ unemployment: 11, growth: -2.5 })).economy;
    expect(bad).toBeLessThan(good);

    /* And pouring money into the economy line does not move the score. */
    const funded = computeIssueScores(sectorsAt(60, { economy: 95 }), 0, 0, econ()).economy;
    expect(funded).toBeCloseTo(good, 10);
  });

  it('scores debt worse as borrowing climbs, and floors at zero', () => {
    expect(computeIssueScores(sectorsAt(60), 0, 0, econ()).debt).toBe(100);
    expect(computeIssueScores(sectorsAt(60), 300, 0, econ()).debt).toBeLessThan(60);
    expect(computeIssueScores(sectorsAt(60), 100_000, 0, econ()).debt).toBe(0);
  });

  it('scores tax worse as recurring revenue is raised', () => {
    const light = computeIssueScores(sectorsAt(60), 0, 0, econ()).tax;
    const heavy = computeIssueScores(sectorsAt(60), 0, 12, econ()).tax;
    expect(heavy).toBeLessThan(light);
  });

  it('ties cost of living to real wages and the tax burden, not to the CPI alone', () => {
    const base = sectorsAt(60);
    const comfortable = computeIssueScores(base, 0, 0, econ()).cost_of_living;
    const squeezed = computeIssueScores(
      base,
      0,
      0,
      econ({ inflation: 7, wageGrowth: 1.5 }),
    ).cost_of_living;
    /* High inflation that wages are keeping up with is NOT a squeeze. This is
       the distinction the old economy-health proxy could not make, and it is
       the one voters actually make. */
    const keepingUp = computeIssueScores(
      base,
      0,
      0,
      econ({ inflation: 7, wageGrowth: 9 }),
    ).cost_of_living;
    const taxed = computeIssueScores(base, 0, 15, econ()).cost_of_living;

    expect(squeezed).toBeLessThan(comfortable);
    expect(keepingUp).toBeGreaterThan(squeezed);
    expect(taxed).toBeLessThan(comfortable);
  });

  it('keeps every score inside 0..100', () => {
    for (const scores of [
      computeIssueScores(sectorsAt(0), 100_000, 200, econ({ unemployment: 30, inflation: 40, wageGrowth: -12, growth: -25 })),
      computeIssueScores(sectorsAt(100), 0, -200, econ({ unemployment: 0.5, inflation: -9, wageGrowth: 30, growth: 14 })),
    ]) {
      for (const key of ISSUE_KEYS) {
        expect(scores[key]).toBeGreaterThanOrEqual(0);
        expect(scores[key]).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('segment satisfaction', () => {
  const retirees = segmentTemplate('retirees');

  it('rises when the issues a segment cares about improve', () => {
    const poor = segmentSatisfaction(retirees, computeIssueScores(sectorsAt(60, { health: 20 }), 0, 0, econ()));
    const good = segmentSatisfaction(retirees, computeIssueScores(sectorsAt(60, { health: 95 }), 0, 0, econ()));
    expect(good).toBeGreaterThan(poor);
  });

  it('ignores issues a segment does not weight', () => {
    const highIncome = segmentTemplate('high_income');
    /* They weight tax and debt, not the environment. */
    const a = segmentSatisfaction(highIncome, computeIssueScores(sectorsAt(60, { environment: 5 }), 0, 0, econ()));
    const b = segmentSatisfaction(highIncome, computeIssueScores(sectorsAt(60, { environment: 95 }), 0, 0, econ()));
    expect(a).toBeCloseTo(b, 10);
  });

  it('treats a negatively-weighted issue as a mark against the government', () => {
    const workers = segmentTemplate('industrial_workers');
    expect(workers.issueWeights.environment).toBeLessThan(0);
    const low = segmentSatisfaction(workers, computeIssueScores(sectorsAt(60, { environment: 10 }), 0, 0, econ()));
    const high = segmentSatisfaction(workers, computeIssueScores(sectorsAt(60, { environment: 95 }), 0, 0, econ()));
    expect(high).toBeLessThan(low);
  });

  it('stays within 0..1 for every segment at both extremes', () => {
    for (const segment of SEGMENT_TEMPLATES) {
      for (const scores of [
        computeIssueScores(sectorsAt(0), 9000, 90, econ({ unemployment: 28, inflation: 33, wageGrowth: -9 })),
        computeIssueScores(sectorsAt(100), 0, 0, econ({ unemployment: 1, wageGrowth: 12 })),
      ]) {
        const value = segmentSatisfaction(segment, scores);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reports a segment’s priorities in order', () => {
    const issues = topIssues(retirees, 2);
    expect(issues[0]).toBe('health');
    expect(issues).toHaveLength(2);
  });
});

describe('vote shares within a segment', () => {
  const parties = [
    makeParty('player', makeIdeology(-0.1, 0.2, 0.2), true),
    makeParty('market', makeIdeology(0.75, -0.1, -0.35)),
    makeParty('green', makeIdeology(-0.3, 0.45, 0.85)),
  ];

  it('sums to 1', () => {
    for (const segment of SEGMENT_TEMPLATES) {
      const shares = segmentVoteShares(segment, parties, ctx(sectorsAt(60)));
      const total = Object.values(shares).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 8);
    }
  });

  it('favours the party closest to the segment’s own position', () => {
    const owners = segmentTemplate('business_owners');
    const shares = segmentVoteShares(owners, parties, ctx(sectorsAt(60)));
    expect(shares.market).toBeGreaterThan(shares.green!);
  });

  it('moves support to the incumbent when their record improves', () => {
    const segment = segmentTemplate('suburban_families');
    const bad = segmentVoteShares(segment, parties, ctx(sectorsAt(25), 500, 10));
    const good = segmentVoteShares(segment, parties, ctx(sectorsAt(90), 0, 0));
    expect(good.player).toBeGreaterThan(bad.player!);
  });

  it('swings a volatile segment harder than a loyal one on the same record', () => {
    const loyal = segmentTemplate('retirees'); // volatility 0.6
    const volatile = segmentTemplate('young_renters'); // volatility 1.5
    expect(volatile.volatility).toBeGreaterThan(loyal.volatility);

    const swingOf = (segment: SegmentTemplate) => {
      const bad = segmentVoteShares(segment, parties, ctx(sectorsAt(20), 600, 12)).player ?? 0;
      const good = segmentVoteShares(segment, parties, ctx(sectorsAt(95), 0, 0)).player ?? 0;
      return good - bad;
    };
    expect(swingOf(volatile)).toBeGreaterThan(swingOf(loyal));
  });

  it('never returns a negative or non-finite share', () => {
    const shares = segmentVoteShares(
      segmentTemplate('students'),
      parties,
      ctx(sectorsAt(0), 100_000, 400),
    );
    for (const value of Object.values(shares)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('turnout', () => {
  it('follows each segment’s habit', () => {
    expect(segmentTurnout(segmentTemplate('retirees'))).toBeGreaterThan(
      segmentTurnout(segmentTemplate('students')),
    );
  });

  it('is the baseline times the segment’s habit with no campaigning', () => {
    const segment = segmentTemplate('suburban_families');
    expect(segmentTurnout(segment)).toBeCloseTo(TURNOUT_BASELINE * segment.turnout, 8);
  });

  it('is lifted by campaigning, most where there is most headroom', () => {
    const low = segmentTemplate('students');
    const high = segmentTemplate('retirees');
    const liftOf = (s: SegmentTemplate) => segmentTurnout(s, 6) - segmentTurnout(s, 0);
    expect(liftOf(low)).toBeGreaterThan(liftOf(high));
  });

  it('never exceeds 98% or falls below 5%', () => {
    for (const segment of SEGMENT_TEMPLATES) {
      expect(segmentTurnout(segment, 1000)).toBeLessThanOrEqual(0.98);
      expect(segmentTurnout(segment, 0)).toBeGreaterThanOrEqual(0.05);
    }
  });
});

describe('aggregation', () => {
  const parties = [
    makeParty('player', makeIdeology(-0.1, 0.2, 0.2), true),
    makeParty('market', makeIdeology(0.75, -0.1, -0.35)),
    makeParty('labourish', makeIdeology(-0.65, 0.3, 0.2)),
  ];

  it('produces regional shares that sum to 1', () => {
    for (const region of buildRegions()) {
      const breakdown = regionBreakdown(region, parties, ctx(sectorsAt(60)));
      const total = Object.values(breakdown.shares).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 8);
    }
  });

  it('gives every region a segment breakdown', () => {
    for (const region of buildRegions()) {
      const breakdown = regionBreakdown(region, parties, ctx(sectorsAt(60)));
      expect(breakdown.segments.length).toBeGreaterThan(3);
      expect(breakdown.turnout).toBeGreaterThan(0.3);
      expect(breakdown.turnout).toBeLessThan(0.95);
    }
  });

  it('produces national shares that sum to 1', () => {
    const result = nationalShares(buildRegions(), parties, ctx(sectorsAt(60)));
    const total = Object.values(result.shares).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 8);
  });

  it('gives different regions different politics from the same parties', () => {
    const regions = buildRegions();
    const halloway = regionBreakdown(regions.find((r) => r.id === 'halloway')!, parties, ctx(sectorsAt(60)));
    const ternhill = regionBreakdown(regions.find((r) => r.id === 'ternhill')!, parties, ctx(sectorsAt(60)));
    /* Industrial Halloway and professional Ternhill should not agree. */
    expect(Math.abs((halloway.shares.market ?? 0) - (ternhill.shares.market ?? 0))).toBeGreaterThan(0.02);
  });
});

describe('the model produces the right behaviour without being told to', () => {
  /**
   * These are the tests that justify the whole segment model. Nothing anywhere
   * says "retirees like health spending" — it falls out of their issue weights
   * meeting the actual state of the health service.
   */
  const parties = [
    makeParty('player', makeIdeology(-0.1, 0.2, 0.2), true),
    makeParty('rival', makeIdeology(0.4, -0.2, -0.1)),
  ];

  it('wins retirees by funding health, and loses them by starving it', () => {
    const retirees = segmentTemplate('retirees');
    const funded = segmentVoteShares(retirees, parties, ctx(sectorsAt(60, { health: 95 }))).player ?? 0;
    const starved = segmentVoteShares(retirees, parties, ctx(sectorsAt(60, { health: 15 }))).player ?? 0;
    expect(funded).toBeGreaterThan(starved);
  });

  it('loses business owners by raising the tax burden', () => {
    const owners = segmentTemplate('business_owners');
    const light = segmentVoteShares(owners, parties, ctx(sectorsAt(60), 0, 0)).player ?? 0;
    const heavy = segmentVoteShares(owners, parties, ctx(sectorsAt(60), 0, 18)).player ?? 0;
    expect(heavy).toBeLessThan(light);
  });

  it('makes students matter less than retirees at equal size, because they vote less', () => {
    const students = segmentTurnout(segmentTemplate('students'));
    const retirees = segmentTurnout(segmentTemplate('retirees'));
    expect(retirees / students).toBeGreaterThan(1.8);
  });

  it('lets a government be popular with the country and still lose the vote', () => {
    /*
     * Satisfy the low-turnout segments and neglect the high-turnout ones: more
     * people approve, fewer of the people who actually vote do.
     */
    const scores = computeIssueScores(sectorsAt(60, { health: 20, education: 90 }), 0, 0, econ());
    const retirees = segmentSatisfaction(segmentTemplate('retirees'), scores);
    const students = segmentSatisfaction(segmentTemplate('students'), scores);
    expect(students).toBeGreaterThan(retirees);
    expect(segmentTurnout(segmentTemplate('retirees'))).toBeGreaterThan(
      segmentTurnout(segmentTemplate('students')),
    );
  });
});
