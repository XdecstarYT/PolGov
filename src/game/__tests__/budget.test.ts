import { describe, expect, it } from 'vitest';
import {
  averageSectorHealth,
  driftSectorHealth,
  computeDebtService,
  computeRevenue,
  resolveFiscalTurn,
  sectorEquilibrium,
} from '../systems/budget.ts';
import { SECTOR_BASELINE_FUNDING, SECTOR_KEYS } from '../balance.ts';
import type { Sector } from '../types.ts';

const sectors = (overrides: Partial<Record<string, Partial<Sector>>> = {}): Sector[] =>
  SECTOR_KEYS.map((key) => ({
    key,
    health: 60,
    funding: SECTOR_BASELINE_FUNDING[key],
    ...(overrides[key] ?? {}),
  }));

describe('sector equilibrium', () => {
  it('sits at exactly 60 when funded at the sector baseline', () => {
    for (const key of SECTOR_KEYS) {
      expect(sectorEquilibrium(key, SECTOR_BASELINE_FUNDING[key])).toBeCloseTo(60, 6);
    }
  });

  it('collapses to zero with no funding', () => {
    for (const key of SECTOR_KEYS) {
      expect(sectorEquilibrium(key, 0)).toBe(0);
    }
  });

  it('diminishes returns — doubling spend never doubles outcome', () => {
    for (const key of SECTOR_KEYS) {
      const base = SECTOR_BASELINE_FUNDING[key];
      const single = sectorEquilibrium(key, base);
      const double = sectorEquilibrium(key, base * 2);
      expect(double).toBeGreaterThan(single);
      expect(double).toBeLessThan(single * 2);
      // Specifically: the documented 60 -> 75 curve.
      expect(double).toBeCloseTo(75, 6);
    }
  });

  it('is monotonic in funding and never exceeds 100', () => {
    let previous = -1;
    for (let f = 0; f <= 400; f += 5) {
      const value = sectorEquilibrium('health', f);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThan(100);
      previous = value;
    }
  });
});

describe('sector drift', () => {
  it('moves health toward equilibrium without overshooting it', () => {
    const next = driftSectorHealth('health', 20, SECTOR_BASELINE_FUNDING.health, 'standard');
    expect(next).toBeGreaterThan(20);
    expect(next).toBeLessThanOrEqual(60);
  });

  it('decays an unfunded sector toward zero, and never below it', () => {
    let health = 80;
    for (let turn = 0; turn < 200; turn += 1) {
      health = driftSectorHealth('education', health, 0, 'standard');
    }
    expect(health).toBeLessThan(1);
    expect(health).toBeGreaterThanOrEqual(0);
  });

  it('decays faster on harder difficulties', () => {
    const stable = driftSectorHealth('health', 80, 0, 'stable');
    const standard = driftSectorHealth('health', 80, 0, 'standard');
    const fractured = driftSectorHealth('health', 80, 0, 'fractured');
    expect(fractured).toBeLessThan(standard);
    expect(standard).toBeLessThan(stable);
  });

  it('does not apply the decay multiplier when a sector is improving', () => {
    const stable = driftSectorHealth('health', 20, 60, 'stable');
    const fractured = driftSectorHealth('health', 20, 60, 'fractured');
    expect(fractured).toBeCloseTo(stable, 10);
  });
});

describe('public finances', () => {
  it('scales revenue with the health of the economy', () => {
    expect(computeRevenue(60, 0)).toBeGreaterThan(computeRevenue(40, 0));
  });

  it('charges interest in proportion to debt, and nothing on zero', () => {
    expect(computeDebtService(0)).toBe(0);
    expect(computeDebtService(400)).toBeCloseTo(computeDebtService(200) * 2, 6);
  });

  it('finances a deficit entirely with new debt', () => {
    const tick = resolveFiscalTurn(sectors({ economy: { funding: 80 } }), 40, 0, 200);
    expect(tick.balance).toBeLessThan(0);
    expect(tick.debtDelta).toBeCloseTo(-tick.balance, 6);
    expect(tick.treasuryDelta).toBe(0);
  });

  it('applies a surplus to debt first, then banks the remainder', () => {
    const tick = resolveFiscalTurn(sectors({ health: { funding: 5 } }), 90, 0, 500);
    expect(tick.balance).toBeGreaterThan(0);
    expect(tick.debtDelta).toBeLessThan(0);
    expect(tick.treasuryDelta).toBeGreaterThan(0);
    expect(tick.treasuryDelta + -tick.debtDelta).toBeCloseTo(tick.balance, 6);
  });

  it('never pays down more debt than exists', () => {
    const tick = resolveFiscalTurn(sectors({ health: { funding: 0 } }), 100, 0, 3);
    expect(-tick.debtDelta).toBeLessThanOrEqual(3);
  });
});

describe('averageSectorHealth', () => {
  it('averages across all five sectors', () => {
    expect(averageSectorHealth(sectors())).toBeCloseTo(60, 6);
    expect(averageSectorHealth(sectors({ health: { health: 100 } }))).toBeCloseTo(68, 6);
  });
});
