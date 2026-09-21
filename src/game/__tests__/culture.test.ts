/**
 * culture.test.ts — the stocks a government spends without noticing.
 *
 * Everything in this file is slow. That is the point: a government can do
 * real damage to a shared national story, to the norms that hold an
 * election together, or to an orchestra that took forty years to build,
 * and leave office before any of it shows up in a figure it would be
 * asked about. So the tests run for eight years, which is two terms, and
 * check what the successor inherits rather than what the incumbent sees.
 *
 * One structural claim is tested explicitly and matters more than the
 * rest: recognition, not diversity, drives whether a community feels part
 * of a country. A plural country that accommodates its communities holds
 * together better than a homogeneous one that does not accommodate its
 * small ones. The engine has no opinion about which kind of country is
 * preferable; it has an opinion about what follows from how one is run.
 */

import { describe, expect, it } from 'vitest';
import {
  belongingGap,
  buildCulture,
  cohesion,
  culturalReach,
  excludedShare,
  institutionOf,
  leastIncluded,
  stepCulture,
  type CultureInputs,
} from '../systems/culture.ts';
import {
  CULTURAL_INSTITUTION_KEYS,
  type CompositionProfile,
} from '../content/culture.ts';
import { NORMS_START } from '../balance.ts';
import type { Culture } from '../types.ts';

const HOMOGENEOUS: CompositionProfile = { shares: [0.97, 0.02, 0.01], majorityDefault: 0.9 };
const PLURAL: CompositionProfile = {
  shares: [0.23, 0.21, 0.18, 0.2, 0.18],
  majorityDefault: 0.3,
};

const SPEND = 20;

const inputs = (over: Partial<CultureInputs> = {}): CultureInputs => ({
  culturalSpend: SPEND,
  culturalDemand: SPEND,
  broadcasting: 65,
  education: 65,
  incomeGini: 0.33,
  ruralGap: 4,
  polarisation: 0.35,
  corruption: 5,
  growth: 2.1,
  unemployment: 5,
  standing: 60,
  youthShare: 0.2,
  turn: 1,
  ...over,
});

function run(
  weeks: number,
  composition: CompositionProfile = HOMOGENEOUS,
  over: Partial<CultureInputs> = {},
): Culture {
  let culture = buildCulture(composition, SPEND);
  for (let t = 1; t <= weeks; t += 1) {
    culture = stepCulture(culture, { ...inputs(over), turn: t }).culture;
  }
  return culture;
}

const YEARS = (n: number) => n * 52;

describe('the norms', () => {
  it('start high, because in an ordinary democracy nobody decides them', () => {
    const opening = buildCulture(HOMOGENEOUS, SPEND);
    expect(opening.politicalCulture).toBe(NORMS_START);
    expect(opening.politicalCulture).toBeGreaterThan(65);
  });

  it('erode under a politics conducted as a war', () => {
    const calm = run(YEARS(8), HOMOGENEOUS, { polarisation: 0.2 });
    const war = run(YEARS(8), HOMOGENEOUS, { polarisation: 0.95 });
    expect(war.politicalCulture).toBeLessThan(calm.politicalCulture - 15);
  });

  it('erode under a state that is seen to be for sale', () => {
    const clean = run(YEARS(8), HOMOGENEOUS, { corruption: 2 });
    const bought = run(YEARS(8), HOMOGENEOUS, { corruption: 80 });
    expect(bought.politicalCulture).toBeLessThan(clean.politicalCulture - 25);
  });

  it('fall a great deal faster than they come back', () => {
    /*
     * The asymmetry that makes this a stock rather than a dial. Four years
     * of a bitter politics does more damage than four years of a calm one
     * repairs, which is why the norms are worth protecting and almost
     * never worth spending.
     */
    let damaged = buildCulture(HOMOGENEOUS, SPEND);
    for (let t = 1; t <= YEARS(4); t += 1) {
      damaged = stepCulture(damaged, { ...inputs({ polarisation: 0.95, corruption: 70 }), turn: t })
        .culture;
    }
    const low = damaged.politicalCulture;
    expect(low).toBeLessThan(NORMS_START - 20);

    let healed = damaged;
    for (let t = 1; t <= YEARS(4); t += 1) {
      healed = stepCulture(healed, { ...inputs({ polarisation: 0.15, corruption: 0 }), turn: t })
        .culture;
    }
    const regained = healed.politicalCulture - low;
    const lost = NORMS_START - low;
    expect(regained).toBeLessThan(lost);
  });
});

describe('belonging', () => {
  it('follows recognition rather than diversity', () => {
    /*
     * The claim this engine actually makes. A country whose arrangements
     * are one community's arrangements has a worse-included minority than
     * a far more plural country that accommodates everybody — and the
     * plural one is not harder to hold together for being plural.
     */
    const unaccommodating = run(YEARS(8), HOMOGENEOUS);
    const accommodating = run(YEARS(8), PLURAL);
    expect(belongingGap(accommodating)).toBeLessThan(belongingGap(unaccommodating));

    /* And within the same composition, recognising people closes it. */
    const recognised = run(YEARS(8), { ...PLURAL, majorityDefault: 0.05 });
    const not = run(YEARS(8), { ...PLURAL, majorityDefault: 0.95 });
    expect(belongingGap(recognised)).toBeLessThan(belongingGap(not));
    expect(leastIncluded(recognised).belonging).toBeGreaterThan(
      leastIncluded(not).belonging,
    );
  });

  it('separates how badly a community is doing from how many people that is', () => {
    /*
     * A wide gap over one community in fifty is a real grievance and is
     * not a country coming apart. Reporting only the gap would have told
     * every player of a homogeneous country that their nation was
     * fracturing over three per cent of it.
     */
    const narrowButDeep = run(YEARS(6), HOMOGENEOUS);
    const broad = run(YEARS(6), { ...PLURAL, majorityDefault: 0.95 });

    expect(belongingGap(narrowButDeep)).toBeGreaterThan(10);
    expect(excludedShare(narrowButDeep)).toBeLessThan(0.05);
    expect(cohesion(narrowButDeep)).toBeGreaterThan(60);

    expect(excludedShare(broad)).toBeGreaterThan(excludedShare(narrowButDeep));
    expect(cohesion(broad)).toBeLessThan(cohesion(narrowButDeep));
  });

  it('only calls a country coming apart when enough of it is', () => {
    /*
     * A country that opens below the alarm and drifts across it. The flag
     * is a transition detector, so a country that was already over on week
     * one can never raise it — which is correct behaviour and was worth
     * discovering, because the first draft of this test asked for an alarm
     * from a country that had been coming apart before the player arrived.
     */
    let culture = buildCulture({ ...PLURAL, majorityDefault: 0.75 }, SPEND);
    let flagged = false;
    for (let t = 1; t <= YEARS(8); t += 1) {
      const tick = stepCulture(culture, {
        ...inputs({ incomeGini: 0.55, polarisation: 0.85 }),
        turn: t,
      });
      culture = tick.culture;
      if (tick.comingApart) flagged = true;
    }
    expect(flagged).toBe(true);

    /* The same treatment of a country with nobody much to exclude does not
       raise the alarm. */
    let tiny = buildCulture({ shares: [0.995, 0.005], majorityDefault: 0.98 }, SPEND);
    let cried = false;
    for (let t = 1; t <= YEARS(8); t += 1) {
      const tick = stepCulture(tiny, {
        ...inputs({ incomeGini: 0.55, polarisation: 0.85 }),
        turn: t,
      });
      tiny = tick.culture;
      if (tick.comingApart) cried = true;
    }
    expect(cried).toBe(false);
  });
});

describe('the language settlement', () => {
  it('is a lever a government can actually pull, and pays a successor', () => {
    /*
     * Recognition follows language policy over years and belonging follows
     * recognition, so the government that widens the settlement does not
     * see the result. That is the shape of nearly everything in this file
     * and it is the reason these stocks get spent.
     */
    const widen = (c: Culture): Culture => ({ ...c, languagePolicy: 95 });
    const narrow = (c: Culture): Culture => ({ ...c, languagePolicy: 5 });

    const opened = buildCulture(PLURAL, SPEND);
    let widened = widen(opened);
    let narrowed = narrow(opened);
    for (let t = 1; t <= YEARS(8); t += 1) {
      widened = stepCulture(widened, { ...inputs(), turn: t }).culture;
      narrowed = stepCulture(narrowed, { ...inputs(), turn: t }).culture;
    }
    expect(leastIncluded(widened).belonging).toBeGreaterThan(
      leastIncluded(narrowed).belonging + 15,
    );
    expect(cohesion(widened)).toBeGreaterThan(cohesion(narrowed) + 8);

    /* And one year in, almost nothing has happened. */
    let early = widen(opened);
    for (let t = 1; t <= YEARS(1); t += 1) {
      early = stepCulture(early, { ...inputs(), turn: t }).culture;
    }
    expect(leastIncluded(early).belonging - leastIncluded(opened).belonging).toBeLessThan(8);
  });
});

describe('the institutions', () => {
  it('decay when the money stops and do not come back at the same rate', () => {
    const funded = run(YEARS(6));
    const starved = run(YEARS(6), HOMOGENEOUS, { culturalSpend: SPEND * 0.15 });
    expect(culturalReach(starved)).toBeLessThan(culturalReach(funded) - 20);

    /* Six years of cuts, then six years of full funding: not recovered. */
    let culture = buildCulture(HOMOGENEOUS, SPEND);
    for (let t = 1; t <= YEARS(6); t += 1) {
      culture = stepCulture(culture, { ...inputs({ culturalSpend: SPEND * 0.15 }), turn: t })
        .culture;
    }
    const bottom = culturalReach(culture);
    for (let t = 1; t <= YEARS(6); t += 1) {
      culture = stepCulture(culture, { ...inputs(), turn: t }).culture;
    }
    expect(culturalReach(culture)).toBeGreaterThan(bottom);
    expect(culturalReach(culture)).toBeLessThan(culturalReach(funded));
  });

  it('loses the fragile ones first', () => {
    /* A building survives neglect for a long time. A company does not:
       the players took other work and the ones who trained stopped. */
    const starved = run(YEARS(5), HOMOGENEOUS, { culturalSpend: SPEND * 0.1 });
    expect(institutionOf(starved, 'arts').vitality).toBeLessThan(
      institutionOf(starved, 'heritage').vitality,
    );
  });

  it('reports a hollowing once rather than every week after', () => {
    let culture = buildCulture(HOMOGENEOUS, SPEND);
    const seen = new Set<string>();
    let reports = 0;
    for (let t = 1; t <= YEARS(6); t += 1) {
      const tick = stepCulture(culture, { ...inputs({ culturalSpend: 1 }), turn: t });
      culture = tick.culture;
      for (const key of tick.hollowed) {
        seen.add(key);
        reports += 1;
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(reports).toBe(seen.size);
  });
});

describe('pride and patriotism', () => {
  it('are different things, and only one of them is about the government', () => {
    const failing = run(YEARS(6), HOMOGENEOUS, {
      standing: 15,
      growth: -2.5,
      unemployment: 13,
    });
    const thriving = run(YEARS(6), HOMOGENEOUS, { standing: 90, growth: 3.5, unemployment: 3 });

    /* Pride swings hard on how the country is doing. */
    expect(thriving.nationalPride - failing.nationalPride).toBeGreaterThan(25);
    /* Attachment barely moves, whatever is happening. */
    expect(Math.abs(thriving.patriotism - failing.patriotism)).toBeLessThan(10);
    /* Which is the shape a government misreads: pride has gone, and it
       will be told the country is losing its patriotism. */
    expect(failing.patriotism).toBeGreaterThan(failing.nationalPride + 20);
  });
});

describe('a shared story', () => {
  it('is harder to tell in a country that has come apart economically', () => {
    const even = run(YEARS(8), HOMOGENEOUS, { incomeGini: 0.27, ruralGap: 2 });
    const split = run(YEARS(8), HOMOGENEOUS, { incomeGini: 0.55, ruralGap: 20 });
    expect(split.nationalIdentity).toBeLessThan(even.nationalIdentity - 12);
    /* And where the national story is thin, the local one fills the space. */
    expect(split.regionalIdentity).toBeGreaterThan(even.regionalIdentity);
  });

  it('is built by the things people actually share', () => {
    const shared = run(YEARS(8), HOMOGENEOUS, { broadcasting: 95, culturalSpend: SPEND * 1.6 });
    const nothing = run(YEARS(8), HOMOGENEOUS, { broadcasting: 15, culturalSpend: SPEND * 0.1 });
    expect(shared.nationalIdentity).toBeGreaterThan(nothing.nationalIdentity + 8);
  });
});

describe('eight years of anything', () => {
  it('never produces a figure that could not be a real country', () => {
    const cases: [string, CompositionProfile, Partial<CultureInputs>][] = [
      ['nothing', HOMOGENEOUS, {}],
      ['no culture line at all', HOMOGENEOUS, { culturalSpend: 0 }],
      ['lavish', HOMOGENEOUS, { culturalSpend: SPEND * 4 }],
      ['total polarisation', HOMOGENEOUS, { polarisation: 1 }],
      ['total corruption', HOMOGENEOUS, { corruption: 100 }],
      ['plural and ignored', PLURAL, { majorityDefault: 1 } as never],
      ['collapse', PLURAL, {
        incomeGini: 0.62,
        ruralGap: 30,
        polarisation: 1,
        corruption: 95,
        standing: 0,
        growth: -6,
        unemployment: 25,
        culturalSpend: 0,
      }],
    ];

    for (const [label, composition, over] of cases) {
      const c = run(YEARS(8), composition, over);
      const where = `after eight years of ${label}`;

      for (const key of [
        'nationalIdentity',
        'regionalIdentity',
        'politicalCulture',
        'patriotism',
        'nationalPride',
        'traditionStrength',
        'youthDivergence',
      ] as const) {
        expect(c[key], `${key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(c[key], `${key} ${where}`).toBeLessThanOrEqual(100);
        expect(Number.isFinite(c[key]), `${key} ${where}`).toBe(true);
      }
      expect(c.religiosity, where).toBeGreaterThan(5);
      expect(c.religiosity, where).toBeLessThan(95);
      expect(c.institutions, where).toHaveLength(CULTURAL_INSTITUTION_KEYS.length);
      for (const institution of c.institutions) {
        expect(institution.vitality, `${institution.key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(institution.vitality, `${institution.key} ${where}`).toBeLessThanOrEqual(100);
        expect(institution.reach, `${institution.key} ${where}`).toBeGreaterThanOrEqual(0);
        expect(institution.reach, `${institution.key} ${where}`).toBeLessThanOrEqual(100);
      }
      expect(culturalReach(c), where).toBeGreaterThanOrEqual(0);
      expect(culturalReach(c), where).toBeLessThanOrEqual(100);
      expect(cohesion(c), where).toBeGreaterThanOrEqual(0);
      expect(cohesion(c), where).toBeLessThanOrEqual(100);
      expect(
        c.communities.reduce((a, b) => a + b.share, 0),
        where,
      ).toBeCloseTo(1, 6);
      expect(c.history.length, where).toBeLessThanOrEqual(208);
    }
  });

  it('never names anybody', () => {
    /*
     * The limit the whole engine is built on. Community labels are
     * ordinal positions, never identities, and nothing in the state
     * carries a name for who anybody is.
     */
    const c = run(YEARS(2), PLURAL);
    for (const community of c.communities) {
      expect(community.label).toMatch(/communit|Everyone else/i);
      expect(community.id).toMatch(/^community-\d+$/);
    }
  });
});
