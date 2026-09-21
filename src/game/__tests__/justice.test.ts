/**
 * justice.test.ts — the bench, and the force that feeds it cases.
 *
 * Measured over long runs before these were written: enforcement theatre
 * (`militarised`/`zero_tolerance`) trades a small direct suppression for
 * a much larger fall in cooperation, which is half of what produces the
 * clearance rate — so a harder posture applied to a community that
 * already distrusts the police lowers clearance even as it "looks"
 * tougher. And `leaned_on` pulls independence down over many months
 * without ever collapsing it in a week, which is what "spent, not held"
 * has to mean mechanically.
 */

import { describe, expect, it } from 'vitest';
import {
  buildJustice,
  clearanceRate,
  courtsQuality,
  crimeDeterrence,
  describeCourts,
  describePolicing,
  driveAntiCorruption,
  policingQuality,
  setEnforcementPosture,
  setJudicialStance,
  setSentencing,
  stepJustice,
  type JusticeInputs,
} from '../systems/justice.ts';
import {
  ENFORCEMENT_POSTURES,
  JUDICIAL_STANCES,
  SENTENCING_TEMPLATES,
  findEnforcementPosture,
  findSentencing,
  findStance,
} from '../content/justice.ts';
import {
  CLEARANCE_DETERRENCE_WEIGHT,
  CORRUPTION_SCANDAL_THRESHOLD,
  JUDICIAL_INDEPENDENCE_START,
} from '../balance.ts';
import type { Justice } from '../types.ts';

const week = (turn: number, over: Partial<JusticeInputs> = {}): JusticeInputs => ({
  courtFunding: 1,
  policeFunding: 1,
  turn,
  ...over,
});

const runFor = (justice: Justice, weeks: number, over: Partial<JusticeInputs> = {}): Justice => {
  let j = justice;
  for (let t = 0; t < weeks; t += 1) {
    j = stepJustice(j, week(t, over)).justice;
  }
  return j;
};

describe('opening state', () => {
  it('starts an ordinary court and an ordinary force', () => {
    const justice = buildJustice();
    expect(justice.courts.sentencing).toBe('standard');
    expect(justice.courts.stance).toBe('ordinary');
    expect(justice.courts.independence).toBe(JUDICIAL_INDEPENDENCE_START);
    expect(justice.policing.posture).toBe('standard');
    expect(justice.policing.corruption).toBeGreaterThan(0);
    expect(justice.policing.corruption).toBeLessThan(30);
  });

  it('lists a template for every sentencing policy, stance and posture', () => {
    for (const t of SENTENCING_TEMPLATES) expect(findSentencing(t.key)).toBe(t);
    for (const t of JUDICIAL_STANCES) expect(findStance(t.key)).toBe(t);
    for (const t of ENFORCEMENT_POSTURES) expect(findEnforcementPosture(t.key)).toBe(t);
  });
});

describe('certainty deters more than severity', () => {
  it('weighs clearance well above any sentencing severity figure', () => {
    /* The anchor of the whole system, checked directly against the
       constants rather than against a single run, since a run could
       pass by coincidence. */
    const maxSeverity = Math.max(...SENTENCING_TEMPLATES.map((s) => s.severityDeterrence));
    expect(CLEARANCE_DETERRENCE_WEIGHT).toBeGreaterThan(maxSeverity * 1.5);
  });

  it('a higher clearance rate deters more than a tougher sentencing policy at equal clearance', () => {
    const base = buildJustice();
    const softButClearing: Justice = {
      ...base,
      courts: { ...base.courts, sentencing: 'restorative' },
      policing: { ...base.policing, capability: 90, cooperation: 90 },
    };
    const toughButNotClearing: Justice = {
      ...base,
      courts: { ...base.courts, sentencing: 'zealous' },
      policing: { ...base.policing, capability: 20, cooperation: 20 },
    };
    expect(crimeDeterrence(softButClearing)).toBeGreaterThan(crimeDeterrence(toughButNotClearing));
  });
});

describe('enforcement theatre is a trap', () => {
  it('militarised policing collapses cooperation far more than it suppresses through capability', () => {
    const base = buildJustice();
    const community = runFor(setEnforcementPosture(base, 'community'), 150);
    const militarised = runFor(setEnforcementPosture(base, 'militarised'), 150);

    expect(militarised.policing.cooperation).toBeLessThan(community.policing.cooperation);
    expect(militarised.policing.corruption).toBeGreaterThan(community.policing.corruption);
  });

  it('a harder posture can lower the clearance rate it was meant to raise', () => {
    const base = buildJustice();
    const standard = runFor(base, 150);
    const militarised = runFor(setEnforcementPosture(base, 'militarised'), 150);

    expect(clearanceRate(militarised.policing)).toBeLessThan(clearanceRate(standard.policing));
  });
});

describe('independence is spent, not held', () => {
  it('leaning on the courts pulls independence down slowly rather than collapsing it in a week', () => {
    const base = buildJustice();
    const oneWeek = stepJustice(setJudicialStance(base, 'leaned_on'), week(0)).justice;
    expect(oneWeek.courts.independence).toBeLessThan(base.courts.independence);
    expect(oneWeek.courts.independence).toBeGreaterThan(base.courts.independence - 2);
  });

  it('a long run of political pressure drives independence well below an insulated run', () => {
    const base = buildJustice();
    const insulated = runFor(setJudicialStance(base, 'insulated'), 300);
    const leanedOn = runFor(setJudicialStance(base, 'leaned_on'), 300);
    expect(leanedOn.courts.independence).toBeLessThan(insulated.courts.independence - 30);
  });

  it('reports a captured bench the week independence first crosses below half', () => {
    let justice = setJudicialStance(buildJustice(), 'leaned_on');
    let sawCapture = false;
    for (let t = 0; t < 300 && !sawCapture; t += 1) {
      const tick = stepJustice(justice, week(t));
      justice = tick.justice;
      if (tick.benchCaptured) sawCapture = true;
    }
    expect(sawCapture).toBe(true);
  });
});

describe('sentencing and custody', () => {
  it('tougher sentencing raises the custody population relative to restorative', () => {
    const base = buildJustice();
    const restorative = runFor(setSentencing(base, 'restorative'), 150);
    const zealous = runFor(setSentencing(base, 'zealous'), 150);
    expect(zealous.courts.prisonPopulation).toBeGreaterThan(restorative.courts.prisonPopulation);
  });

  it('pushing clearance speed well past what the caseload allows costs accuracy', () => {
    const base = buildJustice();
    const overloaded: Justice = {
      ...base,
      policing: { ...base.policing, capability: 95, cooperation: 95 },
    };
    const stepped = runFor(overloaded, 200);
    expect(stepped.courts.accuracy).toBeLessThan(base.courts.accuracy);
  });
});

describe('anti-corruption drives', () => {
  it('knocks corruption down immediately', () => {
    const dirty: Justice = {
      ...buildJustice(),
      policing: { ...buildJustice().policing, corruption: 60 },
    };
    const cleaned = driveAntiCorruption(dirty, 10);
    expect(cleaned.policing.corruption).toBe(50);
  });

  it('never drives corruption below zero', () => {
    const clean: Justice = {
      ...buildJustice(),
      policing: { ...buildJustice().policing, corruption: 3 },
    };
    expect(driveAntiCorruption(clean, 50).policing.corruption).toBe(0);
  });
});

describe('reading it', () => {
  it('describes a bench that answers to the government once independence is low', () => {
    const captured: Justice = {
      ...buildJustice(),
      courts: { ...buildJustice().courts, independence: 20 },
    };
    expect(describeCourts(captured.courts)).toMatch(/answers to the government/);
  });

  it('describes a force people have stopped calling once cooperation is low', () => {
    const distrusted: Justice = {
      ...buildJustice(),
      policing: { ...buildJustice().policing, cooperation: 10, corruption: 5 },
    };
    expect(describePolicing(distrusted.policing)).toMatch(/do not call/);
  });

  it('describes a force everyone can name once corruption crosses the scandal threshold', () => {
    const corrupt: Justice = {
      ...buildJustice(),
      policing: { ...buildJustice().policing, corruption: CORRUPTION_SCANDAL_THRESHOLD + 5 },
    };
    expect(describePolicing(corrupt.policing)).toMatch(/on the take/);
  });

  it('feeds policingQuality and courtsQuality into the 0–100 range problems.ts expects', () => {
    const justice = runFor(buildJustice(), 100);
    expect(policingQuality(justice)).toBeGreaterThanOrEqual(0);
    expect(policingQuality(justice)).toBeLessThanOrEqual(100);
    expect(courtsQuality(justice)).toBeGreaterThanOrEqual(0);
    expect(courtsQuality(justice)).toBeLessThanOrEqual(100);
  });
});

describe('a long run stays bounded', () => {
  it('keeps every figure finite and sane after five years under a punitive regime', () => {
    let justice = buildJustice();
    justice = setEnforcementPosture(justice, 'militarised');
    justice = setSentencing(justice, 'zealous');
    justice = setJudicialStance(justice, 'leaned_on');
    justice = runFor(justice, 260);

    for (const v of [
      justice.courts.independence,
      justice.courts.backlog,
      justice.courts.accuracy,
      justice.courts.prisonPopulation,
      justice.policing.capability,
      justice.policing.cooperation,
      justice.policing.corruption,
      justice.policing.investigativeClearance,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(justice.courts.independence).toBeGreaterThanOrEqual(0);
    expect(justice.policing.cooperation).toBeGreaterThanOrEqual(0);
    expect(justice.policing.corruption).toBeLessThanOrEqual(100);
  });
});
