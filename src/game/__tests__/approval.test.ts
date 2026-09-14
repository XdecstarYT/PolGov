import { describe, expect, it } from 'vitest';
import {
  clampApproval,
  clampPc,
  computeApprovalTarget,
  computePcRegen,
  driftApproval,
  turnsServed,
} from '../systems/approval.ts';
import {
  APPROVAL_DEBT_MAX_PENALTY,
  APPROVAL_FATIGUE_CAP,
  PC_MAX,
  SECTOR_BASELINE_FUNDING,
  SECTOR_KEYS,
} from '../balance.ts';
import type { Sector } from '../types.ts';

const sectorsAt = (health: number): Sector[] =>
  SECTOR_KEYS.map((key) => ({ key, health, funding: SECTOR_BASELINE_FUNDING[key] }));

describe('approval target', () => {
  it('rises with the condition of public services', () => {
    const poor = computeApprovalTarget(sectorsAt(30), 0, 0, 'standard').target;
    const good = computeApprovalTarget(sectorsAt(80), 0, 0, 'standard').target;
    expect(good).toBeGreaterThan(poor);
  });

  it('weights the economy on top of the sector average', () => {
    const evenly = sectorsAt(60);
    const economyStrong = sectorsAt(60).map((s) =>
      s.key === 'economy' ? { ...s, health: 90 } : s,
    );
    const economyWeak = sectorsAt(60).map((s) =>
      s.key === 'economy' ? { ...s, health: 30 } : s,
    );
    const base = computeApprovalTarget(evenly, 0, 0, 'standard').target;
    expect(computeApprovalTarget(economyStrong, 0, 0, 'standard').target).toBeGreaterThan(base);
    expect(computeApprovalTarget(economyWeak, 0, 0, 'standard').target).toBeLessThan(base);
  });

  it('ignores debt below the free allowance, then penalises it', () => {
    const none = computeApprovalTarget(sectorsAt(60), 0, 0, 'standard');
    const allowance = computeApprovalTarget(sectorsAt(60), 150, 0, 'standard');
    const heavy = computeApprovalTarget(sectorsAt(60), 400, 0, 'standard');
    expect(allowance.target).toBeCloseTo(none.target, 6);
    expect(heavy.target).toBeLessThan(none.target);
  });

  it('caps the debt penalty so debt alone cannot zero out approval', () => {
    const penalty = computeApprovalTarget(sectorsAt(60), 100_000, 0, 'standard').components.find(
      (c) => c.label === 'Debt burden',
    );
    expect(penalty?.value).toBe(-APPROVAL_DEBT_MAX_PENALTY);
  });

  it('caps time-in-office fatigue', () => {
    const fatigue = computeApprovalTarget(sectorsAt(60), 0, 10_000, 'standard').components.find(
      (c) => c.label === 'Time in office',
    );
    expect(fatigue?.value).toBe(-APPROVAL_FATIGUE_CAP);
  });

  it('orders the difficulty bias stable > standard > fractured', () => {
    const stable = computeApprovalTarget(sectorsAt(60), 0, 0, 'stable').target;
    const standard = computeApprovalTarget(sectorsAt(60), 0, 0, 'standard').target;
    const fractured = computeApprovalTarget(sectorsAt(60), 0, 0, 'fractured').target;
    expect(stable).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(fractured);
  });

  it('components sum to the target, so the report can show the whole derivation', () => {
    const result = computeApprovalTarget(sectorsAt(72), 220, 14, 'standard');
    const sum = result.components.reduce((total, c) => total + c.value, 0);
    expect(sum).toBeCloseTo(result.target, 6);
  });

  it('never leaves the 0..100 range', () => {
    expect(computeApprovalTarget(sectorsAt(0), 50_000, 10_000, 'fractured').target).toBe(0);
    expect(computeApprovalTarget(sectorsAt(100), 0, 0, 'stable').target).toBeLessThanOrEqual(100);
  });
});

describe('approval drift', () => {
  it('moves toward the target without overshooting', () => {
    expect(driftApproval(40, 60)).toBeGreaterThan(40);
    expect(driftApproval(40, 60)).toBeLessThan(60);
    expect(driftApproval(60, 40)).toBeLessThan(60);
    expect(driftApproval(60, 40)).toBeGreaterThan(40);
  });

  it('converges on the target and then stays there', () => {
    let approval = 20;
    for (let i = 0; i < 200; i += 1) approval = driftApproval(approval, 65);
    expect(approval).toBeCloseTo(65, 4);
  });

  it('is a fixed point when already at target', () => {
    expect(driftApproval(50, 50)).toBeCloseTo(50, 10);
  });
});

describe('political capital', () => {
  it('regenerates faster at higher approval', () => {
    expect(computePcRegen(100)).toBeGreaterThan(computePcRegen(0));
  });

  it('regenerates roughly 15/turn at middling approval, per the brief', () => {
    expect(computePcRegen(50)).toBeGreaterThan(13);
    expect(computePcRegen(50)).toBeLessThan(19);
  });

  it('clamps to the 0..PC_MAX band', () => {
    expect(clampPc(-40)).toBe(0);
    expect(clampPc(500)).toBe(PC_MAX);
  });
});

describe('clamps and tenure', () => {
  it('clamps approval to 0..100', () => {
    expect(clampApproval(-12)).toBe(0);
    expect(clampApproval(140)).toBe(100);
  });

  it('counts turns served across terms', () => {
    expect(turnsServed(1, 1)).toBe(0);
    expect(turnsServed(1, 12)).toBe(11);
    expect(turnsServed(2, 1)).toBe(12);
    expect(turnsServed(3, 5)).toBe(28);
  });
});
