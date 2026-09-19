/**
 * services.test.ts — demand that nobody sets.
 *
 * The property these tests protect: a government that changes nothing must
 * end up with worse services than it started with. If holding a budget flat
 * holds a service steady, the mechanic does not exist and the twenty
 * services are decoration on the five sector sliders.
 */

import { describe, expect, it } from 'vitest';
import {
  SERVICE_TEMPLATES,
  allocateToServices,
  buildServices,
  coverage,
  driverSize,
  findService,
  longestWaits,
  sectorHealthEffects,
  serviceDemand,
  servicesInSector,
  stepServices,
  strained,
  totalDemand,
  totalServiceFunding,
  waitFor,
} from '../systems/services.ts';
import { buildDemography } from '../systems/demography.ts';
import { buildEconomy } from '../systems/economy.ts';
import { buildRegions } from '../setup.ts';
import {
  SECTOR_BASELINE_FUNDING,
  SECTOR_KEYS,
  SERVICE_QUALITY_START,
  WAIT_AT_FULL_FUNDING,
  WAIT_CEILING,
} from '../balance.ts';
import type { Demography, Economy, Sector, ServiceState } from '../types.ts';

const sectors = (scale = 1): Sector[] =>
  SECTOR_KEYS.map((key) => ({
    key,
    health: 60,
    funding: SECTOR_BASELINE_FUNDING[key] * scale,
  }));

const demography = (overrides: Partial<Demography> = {}): Demography => ({
  ...buildDemography(buildRegions()),
  ...overrides,
});
const economy = (overrides: Partial<Economy> = {}): Economy => ({
  ...buildEconomy(),
  ...overrides,
});

const start = () => buildServices(sectors(), demography(), economy());

function run(
  months: number,
  s = sectors(),
  d = demography(),
  e = economy(),
  from = start(),
): ServiceState[] {
  let services = from;
  for (let i = 0; i < months; i += 1) services = stepServices(services, s, d, e).services;
  return services;
}

const find = (services: readonly ServiceState[], key: string) =>
  services.find((s) => s.key === key)!;

describe('the country as inherited', () => {
  it('funds every service to exactly what is being asked of it', () => {
    for (const service of start()) {
      expect(coverage(service)).toBeGreaterThan(0.9);
      expect(coverage(service)).toBeLessThan(1.15);
    }
  });

  it('adds up to the sector budgets and nothing more', () => {
    const services = start();
    const budget = SECTOR_KEYS.reduce((sum, key) => sum + SECTOR_BASELINE_FUNDING[key], 0);
    expect(totalServiceFunding(services)).toBeCloseTo(budget, 6);
    expect(totalDemand(services)).toBeCloseTo(budget, 0);
  });

  it('starts with a queue, because every real service has one', () => {
    for (const service of start()) {
      const template = findService(service.key);
      if (template.queues) expect(service.waitMonths).toBeGreaterThan(0);
      else expect(service.waitMonths).toBe(0);
    }
  });

  it('distributes a sector budget by weight, exhausting it exactly', () => {
    for (const key of SECTOR_KEYS) {
      const allocation = allocateToServices(key, 100);
      const total = Object.values(allocation).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(100, 6);
      expect(Object.keys(allocation)).toHaveLength(servicesInSector(key).length);
    }
  });
});

describe('demand nobody sets', () => {
  it('rises as the country ages, with no decision taken', () => {
    const young = demography({ retiredShare: 0.14, workingShare: 0.65, youthShare: 0.21 });
    const old = demography({ retiredShare: 0.28, workingShare: 0.55, youthShare: 0.17 });
    const pensions = findService('pensions');
    expect(serviceDemand(pensions, old, economy())).toBeGreaterThan(
      serviceDemand(pensions, young, economy()),
    );
  });

  it('turns an unchanged budget into a degraded service', () => {
    /*
     * The mechanic, stated as plainly as it can be. Nothing about the budget
     * changes. The country gets older. The pension service is starved, and
     * no minister did it.
     */
    const ageing = demography({ retiredShare: 0.26, workingShare: 0.57, youthShare: 0.17 });
    const after = run(260, sectors(), ageing);
    const pensions = find(after, 'pensions');
    expect(coverage(pensions)).toBeLessThan(0.75);
    expect(pensions.quality).toBeLessThan(SERVICE_QUALITY_START);
  });

  it('costs most in exactly the month revenue falls', () => {
    /* Welfare demand is driven by unemployment, so a recession widens the
       deficit through the spending side as well as the revenue side. */
    const welfare = findService('welfare');
    const calm = serviceDemand(welfare, demography(), economy());
    const slump = serviceDemand(welfare, demography(), economy({ unemployment: 12 }));
    expect(slump).toBeGreaterThan(calm * 2);
  });

  it('falls too, when the thing driving it falls', () => {
    /* Fewer children is fewer schools needed, twenty years late. */
    const fewer = demography({ youthShare: 0.13, workingShare: 0.68, retiredShare: 0.19 });
    expect(serviceDemand(findService('education'), fewer, economy())).toBeLessThan(
      serviceDemand(findService('education'), demography(), economy()),
    );
  });

  it('measures every driver against a real group of people', () => {
    const d = demography();
    const e = economy();
    for (const driver of ['population', 'retired', 'youth', 'workforce', 'unemployed', 'urban'] as const) {
      const size = driverSize(driver, d, e);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(d.population);
    }
  });
});

describe('what underfunding produces', () => {
  it('lengthens the queue steeply, because 80% of a service is a waiting list', () => {
    const template = findService('healthcare');
    const full = waitFor(template, 1);
    const eighty = waitFor(template, 0.8);
    const half = waitFor(template, 0.5);
    expect(eighty).toBeGreaterThan(full);
    /* Steeply: halving the money more than doubles the extra wait. */
    expect(half - full).toBeGreaterThan((eighty - full) * 3);
    expect(half).toBeLessThanOrEqual(WAIT_CEILING);
  });

  it('does not queue where the failure is a gap rather than a wait', () => {
    expect(waitFor(findService('fire'), 0.3)).toBe(0);
    expect(waitFor(findService('defence'), 0.2)).toBe(0);
  });

  it('never reports a wait below what a fully funded service has', () => {
    for (const template of SERVICE_TEMPLATES.filter((t) => t.queues)) {
      expect(waitFor(template, 2)).toBeGreaterThanOrEqual(WAIT_AT_FULL_FUNDING);
    }
  });

  it('degrades quality more than proportionally', () => {
    const halved = run(312, sectors(0.5));
    for (const service of halved) {
      expect(service.quality).toBeLessThan(SERVICE_QUALITY_START);
    }
    /* A service at half its demand is far worse than half as good. */
    expect(find(halved, 'healthcare').quality).toBeLessThan(SERVICE_QUALITY_START * 0.5);
  });

  it('improves things when a budget outruns demand, but with limits', () => {
    const generous = run(312, sectors(1.6));
    for (const service of generous) {
      expect(service.quality).toBeGreaterThan(SERVICE_QUALITY_START);
      expect(service.quality).toBeLessThanOrEqual(100);
    }
  });

  it('follows staffing more slowly than money', () => {
    const cut = run(13, sectors(0.5));
    /* Three months after a halving, the staff are still mostly there. */
    expect(find(cut, 'healthcare').staffing).toBeGreaterThan(0.7);
    const later = run(260, sectors(0.5));
    expect(find(later, 'healthcare').staffing).toBeLessThan(0.65);
  });
});

describe('what it does to the sectors', () => {
  it('does nothing at all when every service is as it was', () => {
    for (const value of Object.values(sectorHealthEffects(start()))) {
      expect(Math.abs(value)).toBeLessThan(0.01);
    }
  });

  it('weights a sector by where its money actually goes', () => {
    /*
     * Healthcare is most of the health budget and consumer protection is a
     * rounding error in the economy one, so letting the second go is nearly
     * free. That is not an oversight — it is exactly why the cheap services
     * are always the first cut, and the model should say so rather than
     * pretend every service matters equally.
     */
    const base = start();
    const withoutHealthcare = base.map((s) =>
      s.key === 'healthcare' ? { ...s, quality: 10 } : s,
    );
    const withoutConsumer = base.map((s) =>
      s.key === 'consumer_protection' ? { ...s, quality: 10 } : s,
    );
    expect(sectorHealthEffects(withoutHealthcare).health!).toBeLessThan(
      sectorHealthEffects(withoutConsumer).economy!,
    );
  });
});

describe('reporting', () => {
  it('names the services under strain, worst first', () => {
    const squeezed = run(260, sectors(0.6));
    const list = strained(squeezed);
    expect(list.length).toBeGreaterThan(10);
    for (let i = 1; i < list.length; i += 1) {
      expect(coverage(list[i - 1]!)).toBeLessThanOrEqual(coverage(list[i]!));
    }
  });

  it('names nothing when nothing is strained', () => {
    expect(strained(run(104, sectors(1.3)))).toHaveLength(0);
    expect(longestWaits(run(104, sectors(1.3)))).toHaveLength(0);
  });

  it('reports a new strain once, when it happens', () => {
    const squeezed = sectors(0.6);
    const first = stepServices(start(), squeezed, demography(), economy());
    expect(first.newlyStrained.length).toBeGreaterThan(0);
    const second = stepServices(first.services, squeezed, demography(), economy());
    expect(second.newlyStrained).toHaveLength(0);
  });

  it('ranks the longest queues', () => {
    const waits = longestWaits(run(208, sectors(0.5)));
    expect(waits.length).toBeGreaterThan(0);
    for (let i = 1; i < waits.length; i += 1) {
      expect(waits[i - 1]!.waitMonths).toBeGreaterThanOrEqual(waits[i]!.waitMonths);
    }
  });

  it('is deterministic', () => {
    expect(run(104)).toEqual(run(104));
  });
});
