/**
 * living.test.ts — the treadmill, and the difference between quality and access.
 *
 * The central claim of this file is uncomfortable and well evidenced:
 * people adapt to levels and react to changes. A government that inherits
 * a good country and hands on an equally good country has, as far as the
 * mood is concerned, done nothing at all. A government that inherits a
 * wreck and gets it halfway to adequate is rewarded handsomely for leaving
 * the country in a worse state than the first one did.
 *
 * That is not a bug to be balanced away. It is the reason the honest
 * strategy and the popular strategy come apart, which is the subject of
 * the game, so it is tested directly and in both directions.
 *
 * The second claim is that quality and access are different things. A
 * health service can be excellent and unreachable, and a government that
 * reports the first number while the country experiences the second is
 * doing the most ordinary thing in politics.
 */

import { describe, expect, it } from 'vitest';
import {
  accessForBand,
  accessOf,
  buildLiving,
  standardFrom,
  stepLiving,
  type LivingInputs,
} from '../systems/living.ts';
import { buildSociety } from '../systems/society.ts';
import { ACCESS_KEYS, findAccess } from '../content/access.ts';

const SERVICES = [
  'healthcare',
  'education',
  'police',
  'administration',
  'broadcasting',
  'housing_assistance',
  'environmental_protection',
];
const ASSETS = [
  'roads',
  'railways',
  'public_transport',
  'highways',
  'internet',
  'telecoms',
  'grid',
  'water',
  'schools',
];

/** A country where everything the state does is at one level. */
const inputs = (quality: number, over: Partial<LivingInputs> = {}): LivingInputs => ({
  society: buildSociety(),
  serviceQuality: Object.fromEntries(SERVICES.map((k) => [k, quality])),
  serviceWait: {},
  assetCondition: Object.fromEntries(ASSETS.map((k) => [k, quality])),
  assetPressure: {},
  unemployment: 5,
  environmentHealth: quality,
  crimeRate: 20,
  urbanisation: 0.7,
  regional: [
    { regionId: 'a', population: 10, netFlow: 1.2, urban: 0.92 },
    { regionId: 'b', population: 8, netFlow: -0.9, urban: 0.35 },
    { regionId: 'c', population: 6, netFlow: 0.1, urban: 0.6 },
  ],
  turn: 1,
  ...over,
});

/** Run a country for `weeks`, with the state's performance given per week. */
function run(weeks: number, quality: (week: number) => number, over: Partial<LivingInputs> = {}) {
  let living = buildLiving();
  for (let t = 1; t <= weeks; t += 1) {
    living = stepLiving(living, { ...inputs(quality(t), over), turn: t }).living;
  }
  return living;
}

const YEARS = (n: number) => n * 52;

describe('the treadmill', () => {
  it('gives a government that held an excellent country steady no credit at all', () => {
    const held = run(YEARS(8), () => 88);
    /* The country is genuinely good, and people say so. */
    expect(held.standardOfLiving).toBeGreaterThan(80);
    expect(held.lifeSatisfaction).toBeGreaterThan(80);
    /* And the mood is exactly neutral, because nothing has got better. */
    expect(held.happiness).toBeGreaterThan(46);
    expect(held.happiness).toBeLessThan(54);
  });

  it('rewards improvement over achievement, which is the whole problem', () => {
    const held = run(YEARS(8), () => 88);
    const climbed = run(YEARS(8), (t) => 38 + Math.min(50, t * 0.13));

    /* The two countries end up in almost the same place. */
    expect(Math.abs(climbed.standardOfLiving - held.standardOfLiving)).toBeLessThan(4);
    /* The one that got there is in a better mood than the one that always was. */
    expect(climbed.happiness).toBeGreaterThan(held.happiness + 3);
    /* But it is LESS satisfied, because satisfaction tracks the level and
       this country spent six of its eight years being worse. */
    expect(climbed.lifeSatisfaction).toBeLessThan(held.lifeSatisfaction);
  });

  it('turns on a government before the country is actually bad', () => {
    const falling = run(YEARS(6), (t) => 88 - Math.min(50, t * 0.13));
    /* Still a better-than-adequate country by the level. */
    expect(falling.lifeSatisfaction).toBeGreaterThan(70);
    /* And the mood has already gone, because the direction is what is felt. */
    expect(falling.happiness).toBeLessThan(46);
  });

  it('lets a poor country settle into contentment with itself', () => {
    const poor = run(YEARS(8), () => 38);
    expect(poor.standardOfLiving).toBeLessThan(70);
    /* Nobody is in revolt. They have adapted, which is what people do, and
       it is why a bad country is not automatically an ungovernable one. */
    expect(poor.happiness).toBeGreaterThan(46);
    expect(poor.happiness).toBeLessThan(54);
  });

  it('names the shape a long competent government produces', () => {
    let living = buildLiving();
    let seen = false;
    for (let t = 1; t <= YEARS(8); t += 1) {
      const tick = stepLiving(living, { ...inputs(88), turn: t });
      living = tick.living;
      if (tick.contentedButUnhappy) seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe('access is not quality', () => {
  it('lets an excellent service be one nobody can reach', () => {
    /* Same service quality. The only difference is the wait. */
    const seen = run(YEARS(3), () => 85, { serviceWait: {} });
    const queued = run(YEARS(3), () => 85, { serviceWait: { healthcare: 7 } });

    expect(accessOf(seen, 'healthcare').level).toBeGreaterThan(
      accessOf(queued, 'healthcare').level + 25,
    );
    /* And the country's standard of living falls with it, because what a
       household has is the appointment rather than the hospital. */
    expect(queued.standardOfLiving).toBeLessThan(seen.standardOfLiving);
  });

  it('rations by price in some domains and by queue in others', () => {
    /*
     * The distinction that decides who a shortage lands on. When housing
     * is short the top simply pays more; when hospital beds are short
     * everybody waits. So the same depth of shortage produces a much
     * steeper gradient in one than the other.
     */
    const short = run(YEARS(4), () => 30, {
      assetPressure: { housing: 1.5, hospitals: 1.5 },
      society: (() => {
        const s = buildSociety();
        return { ...s, housingCostBurden: 46 };
      })(),
    });
    expect(accessOf(short, 'housing').gradient).toBeGreaterThan(
      accessOf(short, 'healthcare').gradient,
    );

    /* Which shows up as the bottom and the top having different countries. */
    const topHousing = accessForBand(short, 'housing', 0.5);
    const bottomHousing = accessForBand(short, 'housing', -0.5);
    expect(topHousing).toBeGreaterThan(bottomHousing + 10);
  });

  it('weights a roof above a library', () => {
    const base = buildLiving();
    const withRoof = base.access.map((a) => ({ ...a, level: a.key === 'housing' ? 90 : 40 }));
    const withLibrary = base.access.map((a) => ({ ...a, level: a.key === 'recreation' ? 90 : 40 }));
    expect(standardFrom(withRoof)).toBeGreaterThan(standardFrom(withLibrary));
  });

  it('reports a domain the week it goes out of reach', () => {
    let living = buildLiving();
    const failed = new Set<string>();
    for (let t = 1; t <= YEARS(4); t += 1) {
      const tick = stepLiving(living, { ...inputs(12), turn: t });
      living = tick.living;
      for (const key of tick.failing) failed.add(key);
    }
    expect(failed.size).toBeGreaterThan(0);
    /* And each is reported once, not every week thereafter. */
    let repeats = 0;
    for (let t = 1; t <= 40; t += 1) {
      const tick = stepLiving(living, { ...inputs(12), turn: t });
      living = tick.living;
      repeats += tick.failing.length;
    }
    expect(repeats).toBe(0);
  });
});

describe('where you live', () => {
  it('finds a gap between the cities and everywhere else', () => {
    const country = run(YEARS(3), () => 66);
    expect(country.urbanAdvantage).toBeGreaterThan(0);
    expect(country.ruralGap).toBeGreaterThan(0);
    expect(country.regionalInequality).toBeGreaterThan(country.ruralGap);
    expect(country.regional).toHaveLength(3);
    /* The region people are leaving is the one that has already lost. */
    const leaving = country.regional.find((r) => r.regionId === 'b')!;
    const arriving = country.regional.find((r) => r.regionId === 'a')!;
    expect(arriving.standard).toBeGreaterThan(leaving.standard);
  });

  it('reads migration as a rate, not as a headcount', () => {
    /*
     * Net flow is thousands of people a week, so a region of three hundred
     * million gaining a rounding error's worth of people posts an enormous
     * absolute figure. Treated as a headcount it saturated this term in
     * every populous country and cancelled the rural gap outright — India
     * reported a rural disadvantage of exactly zero with four hundred and
     * sixty million people living in its two most agrarian regions.
     *
     * The same flow in a region a hundred times larger must move the
     * standard of living a hundred times less.
     */
    const small = run(YEARS(2), () => 66, {
      regional: [
        { regionId: 'small', population: 1, netFlow: 0.6, urban: 0.7 },
        { regionId: 'other', population: 1, netFlow: 0, urban: 0.7 },
      ],
      urbanisation: 0.7,
    });
    const large = run(YEARS(2), () => 66, {
      regional: [
        { regionId: 'large', population: 100, netFlow: 0.6, urban: 0.7 },
        { regionId: 'other', population: 1, netFlow: 0, urban: 0.7 },
      ],
      urbanisation: 0.7,
    });
    const lift = (l: typeof small, id: string) =>
      l.regional.find((r) => r.regionId === id)!.standard -
      l.regional.find((r) => r.regionId === 'other')!.standard;

    /* A flow chosen to sit inside the cap, so the comparison is of the
       term itself rather than of the clamp. */
    expect(lift(small, 'small')).toBeGreaterThan(1);
    expect(lift(large, 'large')).toBeLessThan(lift(small, 'small') / 20);
  });

  it('keeps the countryside behind the country in every shape of nation', () => {
    /* Whether the rural regions are few and very rural or many and
       slightly so, the weighted gap is real and bounded. */
    const shapes: [string, LivingInputs['regional']][] = [
      ['one very rural region', [
        { regionId: 'city', population: 40, netFlow: 0, urban: 0.95 },
        { regionId: 'far', population: 8, netFlow: 0, urban: 0.3 },
      ]],
      ['mostly middling', [
        { regionId: 'a', population: 12, netFlow: 0, urban: 0.84 },
        { regionId: 'b', population: 12, netFlow: 0, urban: 0.72 },
        { regionId: 'c', population: 12, netFlow: 0, urban: 0.6 },
      ]],
    ];
    for (const [label, regional] of shapes) {
      const urbanisation =
        regional.reduce((a, r) => a + r.population * r.urban, 0) /
        regional.reduce((a, r) => a + r.population, 0);
      const l = run(YEARS(3), () => 66, { regional, urbanisation });
      expect(l.ruralGap, label).toBeGreaterThan(0.5);
      expect(l.ruralGap, label).toBeLessThan(20);
      expect(l.urbanAdvantage, label).toBeGreaterThan(0);
    }
  });
});

describe('eight years of anything', () => {
  it('never produces a figure that could not be a real country', () => {
    const cases: [string, (t: number) => number, Partial<LivingInputs>][] = [
      ['steady', () => 66, {}],
      ['collapse', () => 4, {}],
      ['excellence', () => 98, {}],
      ['mass unemployment', () => 55, { unemployment: 22 }],
      ['crime wave', () => 55, { crimeRate: 90 }],
      ['everything congested', () => 55, {
        assetPressure: Object.fromEntries(ASSETS.map((k) => [k, 1.9])),
      }],
      ['sawtooth', (t) => (Math.floor(t / 26) % 2 === 0 ? 30 : 90), {}],
    ];

    for (const [label, quality, over] of cases) {
      const s = run(YEARS(8), quality, over);
      const where = `after eight years of ${label}`;

      for (const key of [
        'standardOfLiving',
        'qualityOfLife',
        'lifeSatisfaction',
        'happiness',
      ] as const) {
        expect(s[key], `${key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(s[key], `${key} ${where}`).toBeLessThanOrEqual(100);
        expect(Number.isFinite(s[key]), `${key} ${where}`).toBe(true);
      }
      expect(s.access, where).toHaveLength(ACCESS_KEYS.length);
      for (const domain of s.access) {
        expect(domain.level, `${domain.key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(domain.level, `${domain.key} ${where}`).toBeLessThanOrEqual(100);
        /* A gradient wider than the scale itself would be meaningless. */
        expect(domain.gradient, `${domain.key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(domain.gradient, `${domain.key} ${where}`).toBeLessThan(60);
      }
      expect(s.regionalInequality, where).toBeLessThan(100);
      expect(s.ruralGap, where).toBeGreaterThanOrEqual(0);
      expect(s.history.length, where).toBeLessThanOrEqual(208);
    }
  });

  it('keeps every domain derived from something the player presides over', () => {
    /*
     * The rule the whole engine runs on: no dials. Raising what the state
     * does must raise what households can reach, in every domain without
     * exception, or that domain has quietly become a number that moves on
     * its own.
     */
    const poor = run(YEARS(6), () => 25);
    const rich = run(YEARS(6), () => 95, {
      society: (() => {
        const s = buildSociety();
        return { ...s, housingCostBurden: 16, povertyRate: 6 };
      })(),
      unemployment: 3,
      crimeRate: 6,
    });
    for (const key of ACCESS_KEYS) {
      expect(
        accessOf(rich, key).level,
        `${findAccess(key).label} did not respond to anything the state did`,
      ).toBeGreaterThan(accessOf(poor, key).level);
    }
  });
});
