/**
 * demography.test.ts — the people.
 *
 * Most of what matters here is invisible in any single month and obvious
 * across twenty years, so most of these tests run decades. That is not
 * thoroughness for its own sake: the first version of this model added every
 * birth to the youth cohort and never aged anyone out of it, and across
 * twenty years the youth share went from 20% to 38% while the workforce
 * shrank 1.7% a year in a country with steady births and net immigration.
 * Every individual month of that looked completely fine.
 */

import { describe, expect, it } from 'vitest';
import {
  apportionSeats,
  buildDemography,
  dependencyRatio,
  forecastDemography,
  isApportionmentDue,
  skillsDrag,
  skillsShortage,
  stepDemography,
  workforceGrowth,
  type DemographyInputs,
} from '../systems/demography.ts';
import { buildRegions } from '../setup.ts';
import {
  APPORTIONMENT_INTERVAL,
  MIN_REGION_SEATS,
  NATURAL_UNEMPLOYMENT,
  POPULATION_START,
} from '../balance.ts';
import type { Demography } from '../types.ts';

const regions = buildRegions();
const start = () => buildDemography(regions);

const inputs = (overrides: Partial<DemographyInputs> = {}): DemographyInputs => ({
  unemployment: NATURAL_UNEMPLOYMENT,
  healthQuality: 60,
  educationQuality: 60,
  serviceQuality: 60,
  regionalJobs: {},
  turn: 1,
  ...overrides,
});

function run(months: number, overrides: Partial<DemographyInputs> = {}, from = start()) {
  let d = from;
  for (let t = 1; t <= months; t += 1) d = stepDemography(d, inputs({ ...overrides, turn: t }));
  return d;
}

const YEARS = (n: number) => n * 12;

describe('the cohorts', () => {
  it('always sum to the whole population', () => {
    for (const months of [1, 12, 120, 480]) {
      const d = run(months);
      expect(d.youthShare + d.workingShare + d.retiredShare).toBeCloseTo(1, 8);
    }
  });

  it('ages children into the workforce instead of accumulating them', () => {
    /* The bug this file exists to prevent. Over forty years the youth share
       must stay in a plausible band rather than climbing without limit. */
    const d = run(YEARS(40));
    expect(d.youthShare).toBeGreaterThan(0.15);
    expect(d.youthShare).toBeLessThan(0.26);
  });

  it('holds the workforce roughly flat when nothing is wrong', () => {
    const d = run(YEARS(20));
    const growth = (d.workforce - start().workforce) / start().workforce;
    /* A percent or two either way across two decades. Not the 1.7% a YEAR
       of decline the share-based version produced. */
    expect(Math.abs(growth)).toBeLessThan(0.08);
  });

  it('ages the country, which is what an ageing country does', () => {
    const d = run(YEARS(30));
    expect(d.retiredShare).toBeGreaterThan(start().retiredShare);
    expect(dependencyRatio(d)).toBeLessThan(dependencyRatio(start()));
    /* Slowly. Nobody in office sees this happen. */
    expect(d.retiredShare - start().retiredShare).toBeLessThan(0.1);
  });

  it('derives the death rate from the age structure rather than declaring it', () => {
    const young = run(1);
    const old = run(YEARS(40));
    /* An older population buries more of its people. This used to be a
       constant that drifted independently of the cohorts it described. */
    expect(old.deathRate).toBeGreaterThan(young.deathRate);
  });

  it('keeps every figure finite and sane across a century', () => {
    const d = run(YEARS(100));
    for (const [key, value] of Object.entries(d)) {
      if (typeof value !== 'number') continue;
      expect(Number.isFinite(value), `${key} is ${value}`).toBe(true);
    }
    expect(d.population).toBeGreaterThan(1);
    expect(d.population).toBeLessThan(POPULATION_START * 6);
  });
});

describe('what a government can actually move', () => {
  it('buys life expectancy with a health service, over decades', () => {
    const neglected = run(YEARS(25), { healthQuality: 25 });
    const funded = run(YEARS(25), { healthQuality: 95 });
    expect(funded.lifeExpectancy).toBeGreaterThan(neglected.lifeExpectancy);
  });

  it('is punished for succeeding at health policy', () => {
    /*
     * The loop worth having: longer retirements mean more retired people
     * mean a larger pension and health bill. The reward for a good health
     * service is a harder health budget.
     */
    const neglected = run(YEARS(30), { healthQuality: 25 });
    const funded = run(YEARS(30), { healthQuality: 95 });
    expect(funded.retiredShare).toBeGreaterThan(neglected.retiredShare);
    expect(dependencyRatio(funded)).toBeLessThan(dependencyRatio(neglected));
  });

  it('moves skills only through schools, and only slowly', () => {
    const oneTerm = run(YEARS(4), { educationQuality: 95 });
    const oneGeneration = run(YEARS(25), { educationQuality: 95 });
    expect(oneGeneration.skills).toBeGreaterThan(oneTerm.skills);
    /* A full term of excellent schools barely registers. */
    expect(oneTerm.skills - start().skills).toBeLessThan(0.05);
  });

  it('turns a neglected school system into a skills shortage that drags', () => {
    const starved = run(YEARS(20), { educationQuality: 15 });
    expect(skillsShortage(starved)).toBeGreaterThan(0);
    expect(skillsDrag(starved)).toBeLessThan(0);
    expect(skillsDrag(start())).toBe(0);
  });

  it('draws people to work and services, and drives them away from neither', () => {
    const thriving = run(YEARS(10), { unemployment: 2.5, serviceQuality: 90 });
    const failing = run(YEARS(10), { unemployment: 12, serviceQuality: 25 });
    expect(thriving.netMigration).toBeGreaterThan(failing.netMigration);
    expect(thriving.population).toBeGreaterThan(failing.population);
  });

  it('separates arrivals from departures, because they are argued about separately', () => {
    const d = run(YEARS(5));
    expect(d.immigration).toBeGreaterThan(0);
    expect(d.emigration).toBeGreaterThan(0);
    expect(d.immigration - d.emigration).toBeCloseTo(d.netMigration, 6);
  });

  it('brings participation back when the work comes back, but slowly', () => {
    const slump = run(YEARS(6), { unemployment: 12 });
    const recovered = run(YEARS(2), { unemployment: 2.5 }, slump);
    expect(recovered.participation).toBeGreaterThan(slump.participation);
    /* Not all the way back inside two years. People who left are slow to
       return even once there is something to return to. */
    expect(recovered.participation).toBeLessThan(start().participation + 0.02);
  });
});

describe('workforce growth', () => {
  it('is what the economy reads as its speed limit', () => {
    const before = start();
    const after = stepDemography(before, inputs());
    const growth = workforceGrowth(before, after);
    expect(Number.isFinite(growth)).toBe(true);
    /* Annualised, and small. A country's workforce does not move fast. */
    expect(Math.abs(growth)).toBeLessThan(3);
  });

  it('does not divide by a country with no workers', () => {
    const empty = { ...start(), workforce: 0 } as Demography;
    expect(workforceGrowth(empty, start())).toBe(0);
  });
});

describe('where the people are', () => {
  it('starts distributed as the seats are', () => {
    const d = start();
    const total = d.regional.reduce((s, r) => s + r.population, 0);
    expect(total).toBeCloseTo(POPULATION_START, 6);
    const biggest = [...regions].sort((a, b) => b.seats - a.seats)[0]!;
    const smallest = [...regions].sort((a, b) => a.seats - b.seats)[0]!;
    const popOf = (id: string) => d.regional.find((r) => r.regionId === id)!.population;
    expect(popOf(biggest.id)).toBeGreaterThan(popOf(smallest.id));
  });

  it('empties the regions without work into the regions with some', () => {
    const jobs = { estmoor: -14, ternhill: 6 };
    const after = run(YEARS(8), { regionalJobs: jobs });
    const popOf = (d: Demography, id: string) =>
      d.regional.find((r) => r.regionId === id)!.population;
    expect(popOf(after, 'estmoor')).toBeLessThan(popOf(start(), 'estmoor'));
    expect(popOf(after, 'ternhill')).toBeGreaterThan(popOf(start(), 'ternhill'));
  });

  it('conserves people — everyone who leaves arrives somewhere', () => {
    const after = run(YEARS(8), { regionalJobs: { estmoor: -14, ternhill: 6 } });
    const total = after.regional.reduce((s, r) => s + r.population, 0);
    /* Within the national total, which migration adds to on top. */
    expect(total).toBeGreaterThan(after.population * 0.9);
    expect(total).toBeLessThan(after.population * 1.1);
  });
});

describe('apportionment', () => {
  it('comes due once a term and not before', () => {
    const d = start();
    expect(isApportionmentDue(d, APPORTIONMENT_INTERVAL - 1)).toBe(false);
    expect(isApportionmentDue(d, APPORTIONMENT_INTERVAL)).toBe(true);
  });

  it('conserves the chamber exactly', () => {
    const before = regions.reduce((s, r) => s + r.seats, 0);
    const moved = run(YEARS(20), { regionalJobs: { estmoor: -18, ternhill: 9 } });
    const after = apportionSeats(regions, moved.regional).reduce((s, a) => s + a.after, 0);
    expect(after).toBe(before);
  });

  it('follows the people — a region that empties loses seats to where they went', () => {
    const moved = run(YEARS(20), { regionalJobs: { estmoor: -18, ternhill: 9 } });
    const moves = apportionSeats(regions, moved.regional);
    const estmoor = moves.find((m) => m.regionId === 'estmoor')!;
    const ternhill = moves.find((m) => m.regionId === 'ternhill')!;
    expect(estmoor.after).toBeLessThanOrEqual(estmoor.before);
    expect(ternhill.after).toBeGreaterThanOrEqual(ternhill.before);
  });

  it('never writes a region out of the chamber entirely', () => {
    const collapsed = start().regional.map((r) =>
      r.regionId === 'vell' ? { ...r, population: 0.001 } : r,
    );
    for (const move of apportionSeats(regions, collapsed)) {
      expect(move.after).toBeGreaterThanOrEqual(MIN_REGION_SEATS);
    }
  });

  it('changes nothing when nobody has moved', () => {
    for (const move of apportionSeats(regions, start().regional)) {
      expect(Math.abs(move.after - move.before)).toBeLessThanOrEqual(1);
    }
  });
});

describe('forecasting', () => {
  it('runs the same step the turn runs', () => {
    const forecast = forecastDemography(start(), inputs({ turn: 0 }), 24);
    const actual = run(24);
    const last = forecast.months[forecast.months.length - 1]!;
    expect(last.population).toBeCloseTo(actual.population, 6);
    expect(last.retiredShare).toBeCloseTo(actual.retiredShare, 6);
  });

  it('is the only way to see what a schools decision did', () => {
    /* Twenty years out, which is past any career. The forecast exists
       because otherwise a player could never learn whether they were right. */
    const good = forecastDemography(start(), inputs({ healthQuality: 95 }), 240);
    const bad = forecastDemography(start(), inputs({ healthQuality: 25 }), 240);
    expect(good.endRetiredShare).toBeGreaterThan(bad.endRetiredShare);
    expect(good.endDependencyRatio).toBeLessThan(bad.endDependencyRatio);
  });

  it('is deterministic — there is no randomness in a population', () => {
    expect(run(60)).toEqual(run(60));
  });
});
