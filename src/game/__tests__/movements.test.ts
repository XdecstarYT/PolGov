/**
 * movements.test.ts — three conditions, and four answers with no right one.
 *
 * A movement needs a grievance, a constituency and the belief that acting
 * works. They MULTIPLY, so removing any one produces silence: a country
 * with a severe housing crisis and no faith that anything can be changed
 * organises nothing at all, which is the same trap the opinion engine
 * describes and is checked here on the other side of it.
 *
 * The four answers are the decision this engine exists for. Conceding
 * raises the belief that organising works, which produces the next
 * movement; suppressing lowers it and produces a country that has stopped
 * asking. Both are tested, in both directions, because a player will want
 * one of them to be the correct one and neither is.
 */

import { describe, expect, it } from 'vitest';
import {
  buildMovements,
  concessionCost,
  disruption,
  loudest,
  responseEffects,
  stepMovements,
  type MovementInputs,
} from '../systems/movements.ts';
import {
  MOVEMENT_KEYS,
  TACTIC_DISRUPTION,
  findMovement,
  type MovementKey,
} from '../content/movements.ts';
import type { Movements, MovementResponse } from '../types.ts';

const inputs = (over: Partial<MovementInputs> = {}): MovementInputs => ({
  severity: () => 0,
  mobilisation: 0.1,
  frustration: 40,
  efficacy: 54,
  norms: 72,
  excludedShare: 0.03,
  institutionalTrust: 52,
  turn: 1,
  ...over,
});

/** A grievance map read as a severity function. */
const sev = (map: Partial<Record<string, number>>) => (k: string) => map[k] ?? 0;

function run(
  weeks: number,
  over: Partial<MovementInputs> = {},
  policy?: MovementResponse,
) {
  let movements = buildMovements();
  const formed: MovementKey[] = [];
  const ended: { key: MovementKey; outcome: string }[] = [];
  const escalations: MovementKey[] = [];
  for (let t = 1; t <= weeks; t += 1) {
    if (policy) {
      movements = {
        ...movements,
        active: movements.active.map((m) => ({ ...m, lastResponse: policy })),
      };
    }
    const tick = stepMovements(movements, { ...inputs(over), turn: t });
    movements = tick.movements;
    formed.push(...tick.formed);
    escalations.push(...tick.escalated.map((e) => e.key));
    ended.push(
      ...tick.ended.map((e) => ({ key: e.key, outcome: String(e.outcome) })),
    );
  }
  return { movements, formed, ended, escalations };
}

const YEARS = (n: number) => n * 52;

describe('what has to be true before anybody organises', () => {
  it('needs all three, and produces nothing without any one of them', () => {
    /* No grievance, however mobilised. */
    const content = run(YEARS(4), { mobilisation: 0.4, frustration: 30 });
    expect(content.formed).toHaveLength(0);

    /* A severe grievance in a country that has given up. This is the
       trap: frustration is HIGHER here than in the case below. */
    const givenUp = run(YEARS(8), {
      severity: sev({ housing_stress: 0.9, homelessness: 0.85 }),
      mobilisation: 0,
      frustration: 72,
      efficacy: 18,
    });
    expect(givenUp.formed).toHaveLength(0);
    expect(givenUp.movements.active).toHaveLength(0);

    /* The same grievance in a country that still believes acting works. */
    const organised = run(YEARS(4), {
      severity: sev({ housing_stress: 0.9, homelessness: 0.85 }),
      mobilisation: 0.3,
      frustration: 62,
    });
    expect(organised.formed.length).toBeGreaterThan(0);
    expect(organised.formed).toContain('housing');
  });

  it('forms the movement the country actually has a grievance about', () => {
    const rural = run(YEARS(4), {
      severity: sev({ regional_decline: 0.9, community_decline: 0.8 }),
      mobilisation: 0.3,
    });
    expect(rural.formed).toContain('regional');
    expect(rural.formed).not.toContain('student');

    const campus = run(YEARS(4), {
      severity: sev({ education_gap: 0.9, youth_unemployment: 0.85 }),
      mobilisation: 0.3,
    });
    expect(campus.formed).toContain('student');
  });
});

describe('what happens when nobody answers', () => {
  it('escalates through the repertoire and gets much more disruptive', () => {
    const answered = run(
      YEARS(6),
      { severity: () => 0.85, mobilisation: 0.35, frustration: 70 },
      'negotiate',
    );
    const ignored = run(
      YEARS(6),
      { severity: () => 0.85, mobilisation: 0.35, frustration: 70 },
      'ignore',
    );

    expect(ignored.escalations.length).toBeGreaterThan(answered.escalations.length);
    expect(disruption(ignored.movements)).toBeGreaterThan(
      disruption(answered.movements) * 3,
    );

    /* And somebody has reached the end of what they are prepared to do. */
    const hardest = ignored.movements.active.map((m) => TACTIC_DISRUPTION[m.tactic]);
    expect(Math.max(...hardest)).toBeGreaterThan(0.6);
  });

  it('starts everybody at the thing people try first', () => {
    const { movements } = run(YEARS(1), {
      severity: () => 0.9,
      mobilisation: 0.35,
    });
    for (const movement of movements.active) {
      expect(movement.tactic).toBe(findMovement(movement.key).repertoire[0]);
    }
  });
});

describe('the four answers', () => {
  it('teaches a country that organising works, and pays for that later', () => {
    const pressure = { severity: () => 0.85, mobilisation: 0.35, frustration: 70 };
    const conceding = run(YEARS(6), pressure, 'concede');
    const suppressing = run(YEARS(6), { ...pressure, norms: 35 }, 'suppress');

    /* Conceding raises the belief that acting works. */
    expect(conceding.movements.efficacyPressure).toBeGreaterThan(2);
    /* Suppressing destroys it. */
    expect(suppressing.movements.efficacyPressure).toBeLessThan(0);
  });

  it('makes suppression work now and cost later', () => {
    const pressure = { severity: () => 0.85, mobilisation: 0.35, frustration: 70 };
    const suppressing = run(YEARS(8), { ...pressure, norms: 35 }, 'suppress');
    const ignoring = run(YEARS(8), pressure, 'ignore');

    /* The streets are quiet. */
    expect(disruption(suppressing.movements)).toBeLessThan(
      disruption(ignoring.movements) / 4,
    );
    /* And they keep forming, and keep being cleared out — which is not
       the same as the grievance having been addressed. */
    expect(suppressing.formed.length).toBeGreaterThan(ignoring.formed.length * 3);
    expect(suppressing.ended.some((e) => e.outcome === 'suppressed')).toBe(true);
  });

  it('prices every answer, and none of them at zero in the long run', () => {
    const movement = run(YEARS(2), { severity: () => 0.9, mobilisation: 0.35 })
      .movements.active[0]!;
    const gdp = 3680;

    const concede = responseEffects(movement, 'concede', gdp);
    const negotiate = responseEffects(movement, 'negotiate', gdp);
    const ignore = responseEffects(movement, 'ignore', gdp);
    const suppress = responseEffects(movement, 'suppress', gdp);

    /* Conceding costs the most money and calms them the most. */
    expect(concede.money).toBeGreaterThan(negotiate.money);
    expect(concede.frustration).toBeLessThan(0);
    /* Ignoring is free this week, and only this week. */
    expect(ignore.money).toBe(0);
    expect(ignore.politicalCapital).toBe(0);
    expect(ignore.frustration).toBeGreaterThan(0);
    /* Suppressing is the only one that costs the norms and the police. */
    expect(suppress.norms).toBeLessThan(0);
    expect(suppress.policeTrust).toBeLessThan(0);
    expect(suppress.frustration).toBeGreaterThan(0);
    /* And every one of them says what it is. */
    for (const effect of [concede, negotiate, ignore, suppress]) {
      expect(effect.summary.length).toBeGreaterThan(40);
    }
  });

  it('scales a concession with how big the movement got', () => {
    const small = run(YEARS(1), { severity: () => 0.5, mobilisation: 0.2 }).movements
      .active[0];
    const large = run(YEARS(6), { severity: () => 0.95, mobilisation: 0.4, excludedShare: 0.3 })
      .movements.active[0];
    if (small && large) {
      expect(concessionCost(large, 3680)).toBeGreaterThan(concessionCost(small, 3680));
    }
  });
});

describe('how they end', () => {
  it('mostly runs out of people, having changed nothing', () => {
    /* A grievance that goes away on its own. */
    let movements: Movements = buildMovements();
    for (let t = 1; t <= YEARS(3); t += 1) {
      movements = stepMovements(movements, {
        ...inputs({ severity: () => 0.9, mobilisation: 0.35 }),
        turn: t,
      }).movements;
    }
    expect(movements.active.length).toBeGreaterThan(0);

    const ended: string[] = [];
    for (let t = YEARS(3); t <= YEARS(9); t += 1) {
      const tick = stepMovements(movements, { ...inputs(), turn: t });
      movements = tick.movements;
      ended.push(...tick.ended.map((e) => String(e.outcome)));
    }
    expect(ended.length).toBeGreaterThan(0);
    expect(ended.every((o) => o === 'absorbed' || o === 'exhausted')).toBe(true);
  });
});

describe('the range a real run actually produces', () => {
  it('organises in a country that is going wrong, and not in one that is not', () => {
    /*
     * The calibration test, and the reason it exists: the thresholds were
     * first set against synthetic pressure — mobilisation around 0.3 —
     * when real runs produce between 0.02 and 0.15. Nothing organised in
     * any actual country in the game, in any run, and every engine test
     * passed. A threshold has to be set against the range the rest of the
     * simulation emits, not against the range that was convenient to type.
     */
    const ordinary = run(YEARS(8), {
      severity: sev({ unrest: 0.06, crime: 0.04 }),
      mobilisation: 0.03,
      frustration: 34,
      efficacy: 49,
    });
    expect(ordinary.formed, 'a well-run country organised anyway').toHaveLength(0);

    const struggling = run(YEARS(8), {
      severity: sev({
        unrest: 0.5,
        housing_stress: 0.55,
        youth_unemployment: 0.5,
        social_exclusion: 0.45,
      }),
      mobilisation: 0.1,
      frustration: 42,
      efficacy: 60,
    });
    expect(struggling.formed.length, 'a struggling country organised nothing').toBeGreaterThan(
      0,
    );
  });
});

describe('eight years of anything', () => {
  it('never produces a movement that could not exist', () => {
    const cases: [string, Partial<MovementInputs>, MovementResponse | undefined][] = [
      ['nothing', {}, undefined],
      ['everything, ignored', { severity: () => 1.2, mobilisation: 0.5, excludedShare: 0.4 }, 'ignore'],
      ['everything, conceded', { severity: () => 1.2, mobilisation: 0.5 }, 'concede'],
      ['everything, crushed', { severity: () => 1.2, mobilisation: 0.5, norms: 5 }, 'suppress'],
      ['a country that gave up', { severity: () => 1.2, mobilisation: -0.4, efficacy: 5 }, undefined],
    ];

    for (const [label, over, policy] of cases) {
      const { movements } = run(YEARS(8), over, policy);
      const where = `after eight years of ${label}`;

      expect(movements.active.length, where).toBeLessThanOrEqual(MOVEMENT_KEYS.length);
      for (const movement of movements.active) {
        expect(movement.support, `${movement.key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(movement.support, `${movement.key} ${where}`).toBeLessThanOrEqual(100);
        expect(movement.intensity, `${movement.key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(movement.intensity, `${movement.key} ${where}`).toBeLessThanOrEqual(100);
        expect(
          findMovement(movement.key).repertoire,
          `${movement.key} ${where}`,
        ).toContain(movement.tactic);
      }
      /* One of each at a time, never two of the same. */
      const keys = movements.active.map((m) => m.key);
      expect(new Set(keys).size, where).toBe(keys.length);
      /* The record is kept but bounded. */
      expect(movements.resolved.length, where).toBeLessThanOrEqual(60);
      expect(movements.history.length, where).toBeLessThanOrEqual(208);
      expect(Math.abs(movements.efficacyPressure), where).toBeLessThanOrEqual(20);
      expect(disruption(movements), where).toBeGreaterThanOrEqual(0);
    }
  });

  it('points at the one a government most needs to answer', () => {
    const { movements } = run(
      YEARS(6),
      { severity: () => 0.9, mobilisation: 0.4 },
      'ignore',
    );
    const loud = loudest(movements);
    expect(loud).not.toBeNull();
    for (const other of movements.active) {
      expect(
        TACTIC_DISRUPTION[loud!.tactic] * loud!.support,
      ).toBeGreaterThanOrEqual(TACTIC_DISRUPTION[other.tactic] * other.support);
    }
  });
});
