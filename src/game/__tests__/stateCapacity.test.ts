/**
 * stateCapacity.test.ts — how far the state actually reaches, and what
 * it costs to reach further than usual.
 *
 * Measured over long runs before these were written: legitimacy debt
 * climbs from single digits to well over a hundred across three years
 * of a held state of emergency, and the cost of standing it down climbs
 * with it — proportionally, not in one jump, which is what "easy to
 * declare, hard to stand down" has to mean mechanically rather than as
 * a description.
 */

import { describe, expect, it } from 'vitest';
import {
  buildStateCapacity,
  declareEmergency,
  describeStateCapacity,
  investReadiness,
  responseCapability,
  standDown,
  standDownCost,
  stepStateCapacity,
  type StateCapacityInputs,
} from '../systems/stateCapacity.ts';
import { EMERGENCY_LEVELS, findEmergencyLevel } from '../content/emergency.ts';
import {
  DISASTER_READINESS_START,
  STAND_DOWN_BASE_COST,
  STAND_DOWN_MAX_COST,
  STATE_REACH_START,
} from '../balance.ts';
import type { StateCapacity } from '../types.ts';

const week = (turn: number, over: Partial<StateCapacityInputs> = {}): StateCapacityInputs => ({
  civilServiceCapability: 66,
  infrastructureHealth: 60,
  regulatoryQuality: 70,
  turn,
  ...over,
});

const runFor = (
  capacity: StateCapacity,
  weeks: number,
  over: Partial<StateCapacityInputs> = {},
): StateCapacity => {
  let c = capacity;
  for (let t = 0; t < weeks; t += 1) {
    c = stepStateCapacity(c, week(t, over)).capacity;
  }
  return c;
};

describe('opening state', () => {
  it('starts under ordinary rule at the ordinary reach figure', () => {
    const capacity = buildStateCapacity();
    expect(capacity.level).toBe('normal');
    expect(capacity.reach).toBe(STATE_REACH_START);
    expect(capacity.legitimacyDebt).toBe(0);
    expect(capacity.disasterReadiness).toBe(DISASTER_READINESS_START);
  });

  it('lists a template for every emergency level', () => {
    for (const t of EMERGENCY_LEVELS) expect(findEmergencyLevel(t.key)).toBe(t);
  });
});

describe('reach is reach, not will', () => {
  it('rises toward what capability, infrastructure and regulatory quality actually support', () => {
    const base = buildStateCapacity();
    const capable = runFor(base, 200, {
      civilServiceCapability: 90,
      infrastructureHealth: 85,
      regulatoryQuality: 90,
    });
    const weak = runFor(base, 200, {
      civilServiceCapability: 30,
      infrastructureHealth: 25,
      regulatoryQuality: 30,
    });
    expect(capable.reach).toBeGreaterThan(weak.reach);
  });

  it('moves slowly — a single week does not jump it far', () => {
    const base = buildStateCapacity();
    const oneWeek = stepStateCapacity(base, week(0, { civilServiceCapability: 100, infrastructureHealth: 100, regulatoryQuality: 100 })).capacity;
    expect(oneWeek.reach - base.reach).toBeLessThan(3);
  });
});

describe('easy to declare, hard to stand down', () => {
  it('legitimacy debt accumulates faster the longer an emergency runs', () => {
    const declared = declareEmergency(buildStateCapacity(), 'state_of_emergency');
    const early = runFor(declared, 10);
    const debtPerWeekEarly = early.legitimacyDebt / 10;

    const late = runFor(declared, 200);
    const debtGainedInLastTenWeeks = late.legitimacyDebt - runFor(declared, 190).legitimacyDebt;
    const debtPerWeekLate = debtGainedInLastTenWeeks / 10;

    expect(debtPerWeekLate).toBeGreaterThan(debtPerWeekEarly);
  });

  it('costs nothing to stand down an emergency that was never declared', () => {
    expect(standDownCost(buildStateCapacity())).toBe(0);
  });

  it('the cost of standing down rises with duration and is capped', () => {
    const declared = declareEmergency(buildStateCapacity(), 'state_of_emergency');
    const early = runFor(declared, 5);
    const late = runFor(declared, 300);

    expect(standDownCost(early)).toBeGreaterThanOrEqual(STAND_DOWN_BASE_COST);
    expect(standDownCost(late)).toBeGreaterThan(standDownCost(early));
    expect(standDownCost(late)).toBeLessThanOrEqual(STAND_DOWN_MAX_COST);
  });

  it('standing down resets duration and debt, and returns to ordinary rule', () => {
    const declared = declareEmergency(buildStateCapacity(), 'state_of_emergency');
    const held = runFor(declared, 80);
    const stoodDown = standDown(held);
    expect(stoodDown.level).toBe('normal');
    expect(stoodDown.weeksInEmergency).toBe(0);
    expect(stoodDown.legitimacyDebt).toBe(0);
  });

  it('declaring draws down disaster readiness immediately', () => {
    const base = buildStateCapacity();
    const declared = declareEmergency(base, 'martial_law');
    expect(declared.disasterReadiness).toBeLessThan(base.disasterReadiness);
  });

  it('reports normalisation the week an emergency first passes a year', () => {
    let capacity = declareEmergency(buildStateCapacity(), 'state_of_emergency');
    let sawNormalised = false;
    for (let t = 0; t < 60 && !sawNormalised; t += 1) {
      const tick = stepStateCapacity(capacity, week(t));
      capacity = tick.capacity;
      if (tick.normalised) sawNormalised = true;
    }
    expect(sawNormalised).toBe(true);
  });

  it('never reports normalisation while under ordinary rule', () => {
    const base = buildStateCapacity();
    for (let t = 0; t < 200; t += 1) {
      const tick = stepStateCapacity(base, week(t));
      expect(tick.normalised).toBe(false);
    }
  });
});

describe('response capability', () => {
  it('is higher under martial law than under a state of emergency at equal reach', () => {
    const base = buildStateCapacity();
    const soe = declareEmergency(base, 'state_of_emergency');
    const martial = declareEmergency(base, 'martial_law');
    expect(responseCapability(martial)).toBeGreaterThan(responseCapability(soe));
    expect(responseCapability(soe)).toBeGreaterThan(responseCapability(base));
  });
});

describe('disaster readiness', () => {
  it('rebuilds slowly toward the ordinary figure after being drawn down', () => {
    const drained: StateCapacity = { ...buildStateCapacity(), disasterReadiness: 10 };
    const rebuilt = runFor(drained, 100);
    expect(rebuilt.disasterReadiness).toBeGreaterThan(drained.disasterReadiness);
    expect(rebuilt.disasterReadiness).toBeLessThanOrEqual(DISASTER_READINESS_START);
  });

  it('investment raises it immediately, capped at 100', () => {
    const base = buildStateCapacity();
    const invested = investReadiness(base);
    expect(invested.disasterReadiness).toBeGreaterThan(base.disasterReadiness);
    const maxed: StateCapacity = { ...base, disasterReadiness: 95 };
    expect(investReadiness(maxed).disasterReadiness).toBeLessThanOrEqual(100);
  });
});

describe('reading it', () => {
  it('describes a normalised emergency once it has run past a year', () => {
    const normalised: StateCapacity = {
      ...declareEmergency(buildStateCapacity(), 'state_of_emergency'),
      weeksInEmergency: 60,
    };
    expect(describeStateCapacity(normalised)).toMatch(/almost nobody/i);
  });

  it('describes a fresh, visible emergency while still young', () => {
    const fresh: StateCapacity = {
      ...declareEmergency(buildStateCapacity(), 'state_of_emergency'),
      weeksInEmergency: 3,
    };
    expect(describeStateCapacity(fresh)).toMatch(/cheap time to stand/);
  });

  it('describes weak reach under ordinary rule', () => {
    const weak: StateCapacity = { ...buildStateCapacity(), reach: 20 };
    expect(describeStateCapacity(weak)).toMatch(/not ambition/);
  });
});

describe('a long run stays bounded', () => {
  it('keeps every figure finite and sane after five years of held martial law', () => {
    let capacity = declareEmergency(buildStateCapacity(), 'martial_law');
    capacity = runFor(capacity, 260, { civilServiceCapability: 20, infrastructureHealth: 20, regulatoryQuality: 20 });

    for (const v of [capacity.reach, capacity.legitimacyDebt, capacity.disasterReadiness]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(capacity.reach).toBeGreaterThanOrEqual(0);
    expect(capacity.reach).toBeLessThanOrEqual(100);
    expect(capacity.disasterReadiness).toBeGreaterThanOrEqual(0);
    expect(capacity.disasterReadiness).toBeLessThanOrEqual(100);
    expect(standDownCost(capacity)).toBeLessThanOrEqual(STAND_DOWN_MAX_COST);
  });
});
