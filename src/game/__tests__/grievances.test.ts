/**
 * grievances.test.ts — what a country remembers after relations recover.
 *
 * The check that matters: grievance decays far more slowly than
 * relations themselves do, so a country can be back to neutral
 * relations while still carrying most of the grievance a sanction or
 * an expulsion left behind.
 */

import { describe, expect, it } from 'vitest';
import {
  addGrievance,
  decayGrievance,
  describeGrievance,
  grievanceSigningPenalty,
} from '../systems/grievances.ts';
import { GRIEVANCE_CAUSES, findGrievanceCause } from '../content/grievances.ts';
import { GRIEVANCE_DECAY_RATE, RELATIONS_DRIFT_RATE } from '../balance.ts';

describe('adding a grievance', () => {
  it('adds the cause’s own weight, clamped to 100', () => {
    const after = addGrievance(0, 'sanctioned');
    expect(after).toBe(findGrievanceCause('sanctioned').weight);
    expect(addGrievance(95, 'treaty_withdrawn')).toBe(100);
  });

  it('lists a template for every cause', () => {
    for (const t of GRIEVANCE_CAUSES) expect(findGrievanceCause(t.key)).toBe(t);
  });
});

describe('grievance outlives the relations figure it came from', () => {
  it('decays far more slowly per week than relations do', () => {
    expect(GRIEVANCE_DECAY_RATE).toBeLessThan(RELATIONS_DRIFT_RATE / 2);
  });

  it('stays substantially live after enough weeks to fully settle a relationship', () => {
    let grievance = 100;
    for (let w = 0; w < 104; w += 1) grievance = decayGrievance(grievance);
    /* Two years — long enough for most relationships to have recovered —
       and the grievance is still more than half what it started at. */
    expect(grievance).toBeGreaterThan(50);
  });

  it('never goes negative and eventually approaches zero over a long enough run', () => {
    let grievance = 100;
    for (let w = 0; w < 5000; w += 1) grievance = decayGrievance(grievance);
    expect(grievance).toBeGreaterThanOrEqual(0);
    expect(grievance).toBeLessThan(1);
  });
});

describe('signing penalty', () => {
  it('rises with grievance and is zero at zero grievance', () => {
    expect(grievanceSigningPenalty(0)).toBe(0);
    expect(grievanceSigningPenalty(80)).toBeGreaterThan(grievanceSigningPenalty(20));
  });
});

describe('reading it', () => {
  it('describes real live memory once grievance is high', () => {
    expect(describeGrievance(80)).toMatch(/not forgotten/);
  });

  it('describes nothing extra once grievance is low', () => {
    expect(describeGrievance(5)).toMatch(/relations figure does not already show/);
  });
});
