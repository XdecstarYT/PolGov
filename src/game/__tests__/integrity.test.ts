/**
 * integrity.test.ts — the body of law, and what keeps power honest.
 *
 * Measured over long runs before these were written: a closed regime
 * with no anti-corruption body drifts corruption upward for as long as
 * it runs, slowly and without a ceiling of its own; an open regime with
 * an independent commission and repeated audits drives it toward zero
 * over the same span. Neither happens in a week — both are multi-year
 * drifts, which is the honest shape of "spent, not held" applied to a
 * whole government rather than just the bench.
 */

import { describe, expect, it } from 'vitest';
import {
  auditValue,
  buildIntegrity,
  describeIntegrity,
  launchAudit,
  regulatoryQuality,
  setAnticorruption,
  setTransparency,
  simplifyLaw,
  stepIntegrity,
  type IntegrityInputs,
} from '../systems/integrity.ts';
import {
  ANTICORRUPTION_POSTURES,
  TRANSPARENCY_REGIMES,
  findAnticorruption,
  findTransparency,
} from '../content/integrity.ts';
import {
  AUDIT_DECAY,
  AUDIT_EFFECT,
  CORRUPTION_INDEX_START,
  REGULATORY_STOCK_START,
} from '../balance.ts';
import type { Integrity } from '../types.ts';

const week = (turn: number, over: Partial<IntegrityInputs> = {}): IntegrityInputs => ({
  patronageShare: 0.3,
  judicialIndependence: 66,
  policingCorruption: 15,
  billsPassed: 0,
  turn,
  ...over,
});

const runFor = (
  integrity: Integrity,
  weeks: number,
  over: Partial<IntegrityInputs> = {},
): Integrity => {
  let i = integrity;
  for (let t = 0; t < weeks; t += 1) {
    i = stepIntegrity(i, week(t, over)).integrity;
  }
  return i;
};

describe('opening state', () => {
  it('starts at an ordinary, unwatched government', () => {
    const integrity = buildIntegrity();
    expect(integrity.transparency).toBe('limited');
    expect(integrity.anticorruption).toBe('nominal');
    expect(integrity.corruptionIndex).toBe(CORRUPTION_INDEX_START);
    expect(integrity.regulatoryStock).toBe(REGULATORY_STOCK_START);
  });

  it('lists a template for every regime and posture', () => {
    for (const t of TRANSPARENCY_REGIMES) expect(findTransparency(t.key)).toBe(t);
    for (const t of ANTICORRUPTION_POSTURES) expect(findAnticorruption(t.key)).toBe(t);
  });
});

describe('one well, many taps', () => {
  it('a closed regime with no watchdog drifts corruption upward over a long run', () => {
    const base = buildIntegrity();
    const closed = setAnticorruption(setTransparency(base, 'closed'), 'none');
    const stepped = runFor(closed, 300);
    expect(stepped.corruptionIndex).toBeGreaterThan(base.corruptionIndex);
  });

  it('open disclosure with an independent commission drives corruption down over a long run', () => {
    const base = buildIntegrity();
    const dirty: Integrity = { ...base, corruptionIndex: 55 };
    const watched = setAnticorruption(setTransparency(dirty, 'open'), 'independent');
    const stepped = runFor(watched, 300);
    expect(stepped.corruptionIndex).toBeLessThan(dirty.corruptionIndex - 30);
  });

  it('a week of political pressure moves corruption only a little, not all at once', () => {
    const base = buildIntegrity();
    const oneWeek = stepIntegrity(setTransparency(base, 'closed'), week(0)).integrity;
    expect(Math.abs(oneWeek.corruptionIndex - base.corruptionIndex)).toBeLessThan(3);
  });

  it('a higher share of patronage appointments pushes corruption up relative to a clean cabinet', () => {
    const base = buildIntegrity();
    const patronageHeavy = runFor(base, 150, { patronageShare: 0.9 });
    const clean = runFor(base, 150, { patronageShare: 0 });
    expect(patronageHeavy.corruptionIndex).toBeGreaterThan(clean.corruptionIndex);
  });

  it('lower judicial independence lets corruption run higher, holding everything else equal', () => {
    const base = buildIntegrity();
    const uncheckedCourts = runFor(base, 150, { judicialIndependence: 20 });
    const insulatedCourts = runFor(base, 150, { judicialIndependence: 90 });
    expect(uncheckedCourts.corruptionIndex).toBeGreaterThan(insulatedCourts.corruptionIndex);
  });

  it('reports the index turning endemic the week it first crosses above 60', () => {
    let integrity = setAnticorruption(setTransparency(buildIntegrity(), 'closed'), 'none');
    let sawEndemic = false;
    for (let t = 0; t < 2000 && !sawEndemic; t += 1) {
      const tick = stepIntegrity(integrity, week(t, { patronageShare: 1, judicialIndependence: 0 }));
      integrity = tick.integrity;
      if (tick.endemic) sawEndemic = true;
    }
    expect(sawEndemic).toBe(true);
  });
});

describe('rule of law is a composite, not a dial', () => {
  it('moves with judicial independence even though nothing sets it directly', () => {
    const base = buildIntegrity();
    const independentCourts = runFor(base, 150, { judicialIndependence: 90 });
    const capturedCourts = runFor(base, 150, { judicialIndependence: 10 });
    expect(independentCourts.ruleOfLaw).toBeGreaterThan(capturedCourts.ruleOfLaw);
  });

  it('falls as the corruption index that feeds it rises', () => {
    const base = buildIntegrity();
    const corrupt = runFor(base, 150, { patronageShare: 1, judicialIndependence: 10 });
    const clean = runFor(base, 150, { patronageShare: 0, judicialIndependence: 90 });
    expect(corrupt.ruleOfLaw).toBeLessThan(clean.ruleOfLaw);
  });
});

describe('the statute book only ever grows on its own', () => {
  it('regulatory stock rises with bills passed and does not fall by itself', () => {
    const base = buildIntegrity();
    const busy = runFor(base, 150, { billsPassed: 200 });
    expect(busy.regulatoryStock).toBeGreaterThan(base.regulatoryStock);

    const staysHigh = runFor(busy, 150, { billsPassed: 200 });
    expect(staysHigh.regulatoryStock).toBeGreaterThanOrEqual(busy.regulatoryStock - 0.01);
  });

  it('only simplifyLaw brings it back down, and it cannot go below the floor', () => {
    const swollen: Integrity = { ...buildIntegrity(), regulatoryStock: 2 };
    const simplified = simplifyLaw(swollen, 0.5);
    expect(simplified.regulatoryStock).toBeCloseTo(1.5, 5);
    expect(simplifyLaw(simplified, 100).regulatoryStock).toBeGreaterThanOrEqual(
      REGULATORY_STOCK_START * 0.4,
    );
  });

  it('feeds a 0–100 regulatory-quality figure that falls as stock grows', () => {
    const base = buildIntegrity();
    const swollen: Integrity = { ...base, regulatoryStock: 2.5 };
    expect(regulatoryQuality(swollen)).toBeLessThan(regulatoryQuality(base));
    expect(regulatoryQuality(swollen)).toBeGreaterThanOrEqual(0);
    expect(regulatoryQuality(base)).toBeLessThanOrEqual(100);
  });
});

describe('audits', () => {
  it('are worth less each time, on the documented decay', () => {
    const base = buildIntegrity();
    expect(auditValue(base)).toBeCloseTo(AUDIT_EFFECT, 5);
    const afterOne = launchAudit(base);
    expect(auditValue(afterOne)).toBeCloseTo(AUDIT_EFFECT * AUDIT_DECAY, 5);
  });

  it('knock the corruption index down immediately and never below zero', () => {
    const dirty: Integrity = { ...buildIntegrity(), corruptionIndex: 3 };
    const audited = launchAudit(dirty);
    expect(audited.corruptionIndex).toBeGreaterThanOrEqual(0);
    expect(audited.corruptionIndex).toBeLessThan(dirty.corruptionIndex);
  });
});

describe('reading it', () => {
  it('describes a government everyone budgets for once corruption is high', () => {
    const corrupt: Integrity = { ...buildIntegrity(), corruptionIndex: 70 };
    expect(describeIntegrity(corrupt)).toMatch(/budgets for it/);
  });

  it('describes uneven rules once rule of law is low but corruption is not yet extreme', () => {
    const uneven: Integrity = { ...buildIntegrity(), corruptionIndex: 30, ruleOfLaw: 20 };
    expect(describeIntegrity(uneven)).toMatch(/depends on who you are/);
  });

  it('describes an unreadable rulebook once regulatory stock is high', () => {
    const swollen: Integrity = {
      ...buildIntegrity(),
      corruptionIndex: 30,
      ruleOfLaw: 60,
      regulatoryStock: 2,
    };
    expect(describeIntegrity(swollen)).toMatch(/explain the whole rulebook/);
  });
});

describe('a long run stays bounded', () => {
  it('keeps every figure finite and sane after five years under sustained pressure', () => {
    let integrity = buildIntegrity();
    integrity = setTransparency(integrity, 'closed');
    integrity = setAnticorruption(integrity, 'none');
    integrity = runFor(integrity, 260, { patronageShare: 0.8, judicialIndependence: 25, billsPassed: 400 });

    for (const v of [integrity.corruptionIndex, integrity.ruleOfLaw, integrity.regulatoryStock]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(integrity.corruptionIndex).toBeGreaterThanOrEqual(0);
    expect(integrity.corruptionIndex).toBeLessThanOrEqual(100);
    expect(integrity.ruleOfLaw).toBeGreaterThanOrEqual(0);
    expect(integrity.ruleOfLaw).toBeLessThanOrEqual(100);
  });
});
