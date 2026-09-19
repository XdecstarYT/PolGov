/**
 * infrastructure.test.ts — the maintenance backlog.
 *
 * One mechanic carries this module and these tests exist to protect its
 * shape: deferring maintenance has to be FREE for about an electoral cycle
 * and expensive afterwards. If it bites immediately it is not a trap, it is
 * a tax. If it never bites it is not a decision at all.
 */

import { describe, expect, it } from 'vitest';
import {
  FULL_MAINTENANCE_COST,
  INFRASTRUCTURE_TEMPLATES,
  buildInfrastructure,
  canStartProject,
  commission,
  congested,
  critical,
  failing,
  findInfrastructure,
  industryEffects,
  infrastructureSpend,
  maintenanceSpend,
  projectSpend,
  sectorEffects,
  stepInfrastructure,
  termsAway,
  totalBacklog,
  utilisation,
} from '../systems/infrastructure.ts';
import {
  CONDITION_FAILING,
  CONDITION_START,
  MAX_ACTIVE_PROJECTS,
  POPULATION_START,
  TURNS_PER_YEAR,
} from '../balance.ts';
import type { Infrastructure } from '../types.ts';

const POP = POPULATION_START;

/** Run `months` months at a given maintenance level. */
function run(months: number, level = 1, from = buildInfrastructure()): Infrastructure {
  let infra: Infrastructure = { ...from, maintenanceLevel: level };
  for (let i = 0; i < months; i += 1) infra = stepInfrastructure(infra).infrastructure;
  return infra;
}

const YEARS = (n: number) => n * TURNS_PER_YEAR;
const conditionOf = (infra: Infrastructure, key: string) =>
  infra.assets.find((a) => a.key === key)!.condition;

describe('the country as inherited', () => {
  it('starts with everything at capacity and no backlog', () => {
    const infra = buildInfrastructure();
    expect(totalBacklog(infra)).toBe(0);
    for (const asset of infra.assets) {
      expect(asset.condition).toBe(CONDITION_START);
      expect(asset.capacity).toBe(findInfrastructure(asset.key).capacity);
    }
  });

  it('starts with no inherited trap, because the trap has to be yours', () => {
    /* An inherited backlog would be an unfair hand. The whole point is that
       deferring maintenance looks reasonable at the moment you do it. */
    expect(failing(buildInfrastructure())).toHaveLength(0);
    expect(critical(buildInfrastructure())).toHaveLength(0);
  });

  it('is already being used to about its limit', () => {
    /* Doing nothing is not neutral: population grows into what exists. */
    for (const asset of buildInfrastructure().assets) {
      const use = utilisation(asset, POP);
      expect(use).toBeGreaterThan(0.6);
      expect(use).toBeLessThan(1.4);
    }
  });

  it('costs about a sixth of programme spending to keep up', () => {
    /* ₡bn a year, against programme spending of about ₡1,250bn a year. */
    expect(FULL_MAINTENANCE_COST).toBeGreaterThan(120);
    expect(FULL_MAINTENANCE_COST).toBeLessThan(300);
    expect(maintenanceSpend(buildInfrastructure())).toBeCloseTo(FULL_MAINTENANCE_COST, 6);
  });
});

describe('the trap', () => {
  it('costs nothing at all for the first term', () => {
    const deferred = run(YEARS(4), 0);
    /* Four years of paying nothing, and not one asset has crossed into
       visible failure. This is the whole reason governments do it. */
    expect(failing(deferred)).toHaveLength(0);
  });

  it('and then it costs everything', () => {
    const oneTerm = run(YEARS(4), 0);
    const twoTerms = run(YEARS(8), 0);
    const threeTerms = run(YEARS(12), 0);
    expect(failing(oneTerm).length).toBeLessThan(failing(twoTerms).length);
    expect(failing(twoTerms).length).toBeLessThanOrEqual(failing(threeTerms).length);
    expect(failing(threeTerms).length).toBeGreaterThan(5);
  });

  it('compounds — the work owed grows faster than the money saved', () => {
    /* Four years of not paying an ANNUAL bill. */
    const saved = FULL_MAINTENANCE_COST * 4;
    const owed = totalBacklog(run(YEARS(4), 0));
    /* A resurfacing deferred becomes a reconstruction. If this ever comes
       out below one, deferring maintenance is a free loan and the decision
       stops being a decision. */
    expect(owed).toBeGreaterThan(saved);
  });

  it('holds condition steady at full upkeep', () => {
    const kept = run(YEARS(10), 1);
    for (const asset of kept.assets) {
      expect(Math.abs(asset.condition - CONDITION_START)).toBeLessThan(2);
    }
    expect(totalBacklog(kept)).toBeCloseTo(0, 6);
  });

  it('cannot be bought back in a term, however much is spent', () => {
    const wrecked = run(YEARS(10), 0);
    const worst = Math.min(...wrecked.assets.map((a) => a.condition));
    const repairing = run(YEARS(4), 1.8, wrecked);
    const recovered = Math.min(...repairing.assets.map((a) => a.condition));
    expect(recovered).toBeGreaterThan(worst);
    /* Better, and nowhere near where it started. Ten years of neglect is
       not a four-year problem. */
    expect(recovered).toBeLessThan(CONDITION_START);
  });

  it('works the backlog off faster the more is spent on it', () => {
    const wrecked = run(YEARS(8), 0);
    const owed = totalBacklog(wrecked);
    const minimal = totalBacklog(run(YEARS(4), 1, wrecked));
    const aggressive = totalBacklog(run(YEARS(4), 1.8, wrecked));
    expect(minimal).toBeLessThan(owed);
    expect(aggressive).toBeLessThan(minimal);
  });

  it('never lets a condition or a backlog go out of bounds', () => {
    for (const level of [0, 0.5, 1, 1.8]) {
      const infra = run(YEARS(40), level);
      for (const asset of infra.assets) {
        expect(asset.condition).toBeGreaterThanOrEqual(0);
        expect(asset.condition).toBeLessThanOrEqual(100);
        expect(asset.backlog).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(asset.backlog)).toBe(true);
      }
    }
  });
});

describe('what it does to everything else', () => {
  it('turns failing hospitals into a failing health service', () => {
    const kept = sectorEffects(buildInfrastructure(), POP);
    const wrecked = sectorEffects(run(YEARS(12), 0), POP);
    expect(wrecked.health!).toBeLessThan(kept.health!);
    expect(wrecked.education!).toBeLessThan(kept.education!);
  });

  it('averages across the assets serving a sector rather than summing them', () => {
    /*
     * Eight assets serve the infrastructure sector. Summing their condition
     * terms handed it +25 points before anybody had spent a credit, and
     * average service health jumped from 62 to 69 the moment this module was
     * wired in. The effect of a sector's assets has to be comparable to the
     * effect of its budget or the budget stops mattering.
     */
    const effect = sectorEffects(buildInfrastructure(), POP).infrastructure!;
    expect(Math.abs(effect)).toBeLessThan(8);
  });

  it('makes congestion feel like a failing service even in perfect repair', () => {
    const crowded = sectorEffects(buildInfrastructure(), POP * 1.5);
    const comfortable = sectorEffects(buildInfrastructure(), POP * 0.7);
    expect(crowded.health!).toBeLessThan(comfortable.health!);
  });

  it('drags on the industries that run on what has been let go', () => {
    const wrecked = industryEffects(run(YEARS(12), 0), POP);
    expect(wrecked.logistics ?? 0).toBeLessThan(0);
    expect(wrecked.manufacturing ?? 0).toBeLessThan(0);
  });

  it('drags on nothing when nothing is wrong', () => {
    const fine = industryEffects(buildInfrastructure(), POP * 0.75);
    for (const value of Object.values(fine)) expect(value).toBeGreaterThanOrEqual(-0.01);
  });

  it('makes a dirty grid an environmental problem and a clean one a solution', () => {
    const base = buildInfrastructure();
    const dirty = {
      ...base,
      assets: base.assets.map((a) =>
        a.key === 'power_plants' ? { ...a, capacity: a.capacity * 3 } : a,
      ),
    };
    const clean = {
      ...base,
      assets: base.assets.map((a) =>
        a.key === 'renewables' ? { ...a, capacity: a.capacity * 3 } : a,
      ),
    };
    expect(sectorEffects(dirty, POP).environment!).toBeLessThan(
      sectorEffects(base, POP).environment!,
    );
    expect(sectorEffects(clean, POP).environment!).toBeGreaterThan(
      sectorEffects(base, POP).environment!,
    );
  });

  it('reports congestion only where there actually is any', () => {
    expect(congested(buildInfrastructure(), POP * 0.5)).toHaveLength(0);
    expect(congested(buildInfrastructure(), POP * 2).length).toBeGreaterThan(10);
  });
});

describe('building things', () => {
  it('takes years, and most of them open under somebody else', () => {
    for (const template of INFRASTRUCTURE_TEMPLATES) {
      const project = commission(template, 1, 1, 1);
      expect(project.remainingTurns).toBeGreaterThan(TURNS_PER_YEAR);
    }
    const nuclear = commission(findInfrastructure('nuclear'), 1, 1, 1);
    /* Nine years. Two elections away, minimum. */
    expect(termsAway(nuclear)).toBeGreaterThanOrEqual(2);
  });

  it('adds the capacity when it opens, and not before', () => {
    const template = findInfrastructure('internet');
    let infra: Infrastructure = {
      ...buildInfrastructure(),
      projects: [commission(template, 10, 1, 1)],
    };
    const before = infra.assets.find((a) => a.key === 'internet')!.capacity;

    for (let i = 0; i < template.buildTurns - 1; i += 1) {
      infra = stepInfrastructure(infra).infrastructure;
      expect(infra.assets.find((a) => a.key === 'internet')!.capacity).toBe(before);
    }
    const tick = stepInfrastructure(infra);
    expect(tick.opened).toHaveLength(1);
    expect(tick.infrastructure.assets.find((a) => a.key === 'internet')!.capacity).toBe(
      before + 10,
    );
  });

  it('spreads the cost across the build, and stops when it opens', () => {
    const template = findInfrastructure('schools');
    const infra: Infrastructure = {
      ...buildInfrastructure(),
      projects: [commission(template, 4, 1, 1)],
    };
    const annual = projectSpend(infra);
    expect(annual).toBeCloseTo(
      ((template.buildCost * 4) / template.buildTurns) * TURNS_PER_YEAR,
      4,
    );
    expect(infrastructureSpend(infra)).toBeCloseTo(FULL_MAINTENANCE_COST + annual, 4);
  });

  it('limits how much can be under way at once', () => {
    const busy: Infrastructure = {
      ...buildInfrastructure(),
      projects: Array.from({ length: MAX_ACTIVE_PROJECTS }, (_, i) =>
        commission(findInfrastructure('roads'), 1, i, 1),
      ),
    };
    expect(canStartProject(buildInfrastructure())).toBe(true);
    expect(canStartProject(busy)).toBe(false);
  });
});

describe('reporting', () => {
  it('announces an asset the month it starts failing, and only then', () => {
    let infra: Infrastructure = { ...buildInfrastructure(), maintenanceLevel: 0 };
    const announced: string[] = [];
    for (let i = 0; i < YEARS(15); i += 1) {
      const tick = stepInfrastructure(infra);
      infra = tick.infrastructure;
      announced.push(...tick.newlyFailing);
    }
    /* Every asset announced exactly once, and every one of them is in fact
       below the failing line. */
    expect(new Set(announced).size).toBe(announced.length);
    for (const key of announced) {
      expect(conditionOf(infra, key)).toBeLessThan(CONDITION_FAILING);
    }
  });

  it('is deterministic', () => {
    expect(run(YEARS(6), 0.5)).toEqual(run(YEARS(6), 0.5));
  });
});
