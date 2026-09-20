/**
 * society.test.ts — the distribution, and the arithmetic of levels.
 *
 * Two kinds of claim are tested here.
 *
 * The first is that the opening country is a real one: a Gini, a poverty
 * rate, an ownership rate and a decile ratio that a statistical office
 * would recognise. Numbers outside those ranges are not a hard country,
 * they are a broken one, and nothing downstream that reads them can be
 * trusted.
 *
 * The second is the one that matters more. Almost everything in this file
 * is a LEVEL — a share, a burden, a standard of living — and the easiest
 * mistake available is to write a level as a rate. A constant tax burden
 * applied per week is not a tax burden, it is a collapse; a housing
 * shortage applied per week is not a shortage, it is the end of private
 * ownership. Both were written that way first, and neither failed any type
 * check. So the last test here simply runs the thing for eight years under
 * conditions nobody would call extreme and insists that nothing has run
 * away, which is the only check that catches this class at all.
 */

import { describe, expect, it } from 'vitest';
import {
  bandOf,
  buildSociety,
  burdenByBand,
  decileRatio,
  deciles,
  gini,
  homeownership,
  incomeAtPercentile,
  mortgagedShare,
  rentingShare,
  stepSociety,
  type SocietyInputs,
} from '../systems/society.ts';
import { buildEconomy } from '../systems/economy.ts';
import { buildTaxCode } from '../systems/taxation.ts';
import { GDP_START } from '../balance.ts';
import { CLASS_KEYS } from '../content/classes.ts';
import type { Society } from '../types.ts';

const economy = () => buildEconomy(GDP_START);

const inputs = (over: Partial<SocietyInputs> = {}): SocietyInputs => ({
  economy: economy(),
  taxes: buildTaxCode(),
  housingPressure: 1,
  educationQuality: 60,
  housingQuality: 60,
  energyPrices: 1,
  transferShare: 12,
  populationGrowth: 0.4,
  turn: 1,
  ...over,
});

/** Run a society forward `weeks` under one set of conditions. */
function run(weeks: number, over: Partial<SocietyInputs> = {}): Society {
  let society = buildSociety();
  for (let t = 1; t <= weeks; t += 1) {
    society = stepSociety(society, { ...inputs(over), turn: t }).society;
  }
  return society;
}

const TERM = 208;

describe('the opening country', () => {
  it('has a distribution a statistical office would recognise', () => {
    const s = buildSociety();
    /* OECD income Ginis run about 0.25 to 0.40. */
    expect(s.incomeGini).toBeGreaterThan(0.25);
    expect(s.incomeGini).toBeLessThan(0.4);
    /* Wealth is always far more concentrated than income. Always. */
    expect(s.wealthGini).toBeGreaterThan(s.incomeGini + 0.2);
    expect(s.wealthGini).toBeLessThan(0.85);
    /* Relative poverty in developed countries runs about 11% to 19%. */
    expect(s.povertyRate).toBeGreaterThan(10);
    expect(s.povertyRate).toBeLessThan(19);
    /* Ownership between about 55% and 75%. */
    expect(homeownership(s.bands)).toBeGreaterThan(55);
    expect(homeownership(s.bands)).toBeLessThan(75);
    expect(homeownership(s.bands) + rentingShare(s.bands)).toBeCloseTo(100, 6);
    expect(mortgagedShare(s.bands)).toBeGreaterThan(0);
    /* And a top-to-bottom decile ratio in the ordinary range. */
    expect(decileRatio(s.bands)).toBeGreaterThan(4);
    expect(decileRatio(s.bands)).toBeLessThan(12);
  });

  it('accounts for every household and all of the money', () => {
    const s = buildSociety();
    const sum = (f: (b: (typeof s.bands)[number]) => number) =>
      s.bands.reduce((a, b) => a + f(b), 0);
    expect(sum((b) => b.households)).toBeCloseTo(1, 6);
    expect(sum((b) => b.incomeShare)).toBeCloseTo(1, 6);
    expect(sum((b) => b.wealthShare)).toBeCloseTo(1, 6);
    for (const band of s.bands) {
      const t = band.tenure;
      expect(t.owned + t.mortgaged + t.renting).toBeCloseTo(1, 6);
    }
    expect(s.bands.map((b) => b.key)).toEqual(CLASS_KEYS);
    expect(deciles(s.bands).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe('a country of its own', () => {
  it('opens each country at its own concentration, and keeps it there', () => {
    /*
     * Real states differ on this more than on almost anything else, and a
     * game where every country opened identically would be throwing away
     * the most consequential fact about several of them.
     */
    const even = buildSociety(0.82);
    const reference = buildSociety(1);
    const steep = buildSociety(1.55);

    expect(even.incomeGini).toBeLessThan(reference.incomeGini);
    expect(steep.incomeGini).toBeGreaterThan(reference.incomeGini);
    expect(even.povertyRate).toBeLessThan(reference.povertyRate);
    expect(steep.povertyRate).toBeGreaterThan(reference.povertyRate);
    /* Mobility is lower where the stock of wealth is more concentrated. */
    expect(steep.socialMobility).toBeLessThan(even.socialMobility);

    /* Tilting the distribution does not conjure money: every country still
       accounts for exactly one country's worth of income and net worth. */
    for (const s of [even, reference, steep]) {
      expect(s.bands.reduce((a, b) => a + b.incomeShare, 0)).toBeCloseTo(1, 6);
      expect(s.bands.reduce((a, b) => a + b.wealthShare, 0)).toBeCloseTo(1, 6);
      expect(s.bands.reduce((a, b) => a + b.households, 0)).toBeCloseTo(1, 6);
    }
  });

  it('measures an unequal country against itself, not against the average', () => {
    /*
     * A run in a steeply unequal country must not drift toward the
     * reference country's shape just by existing. Its targets are written
     * against where it started, so eight years of nobody deciding anything
     * leaves it exactly as unequal as it was.
     */
    let s = buildSociety(1.55);
    const opened = s.incomeGini;
    for (let t = 1; t <= TERM * 2; t += 1) s = stepSociety(s, { ...inputs(), turn: t }).society;
    expect(s.incomeGini).toBeCloseTo(opened, 2);
    expect(s.inequality).toBe(1.55);
  });
});

describe('the Gini coefficient', () => {
  it('is zero when everybody has the same and approaches one when nobody does', () => {
    expect(gini([0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0, 6);
    expect(gini([0.25, 0.25, 0.25, 0.25], [0, 0, 0, 1])).toBeGreaterThan(0.7);
  });

  it('does not care about the order the shares arrive in, only the shape', () => {
    /* Two populations with the same Lorenz curve have the same Gini. */
    const a = gini([0.5, 0.5], [0.2, 0.8]);
    const b = gini([0.25, 0.25, 0.5], [0.1, 0.1, 0.8]);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('poverty', () => {
  it('is relative, so it does not fall because everybody got poorer together', () => {
    const s = buildSociety();
    const halved: Society = {
      ...s,
      bands: s.bands.map((b) => ({ ...b, disposableIndex: b.disposableIndex * 0.5 })),
    };
    /*
     * Every household in the country has lost half its income. The
     * poverty rate is unchanged, because poverty here is a statement about
     * distance from the middle rather than about a fixed basket — which is
     * the definition statistical offices use and the reason a government
     * cannot abolish poverty by impoverishing the median.
     */
    const before = stepSociety(s, inputs()).society.povertyRate;
    const after = stepSociety(halved, inputs()).society.povertyRate;
    expect(after).toBeCloseTo(before, 1);
  });

  it('moves smoothly rather than in whole-band steps', () => {
    /*
     * Bands have internal spread, so a squeeze moves some of a band across
     * the line rather than all of it. Without that the rate would jump
     * eighteen points at a stroke, which no poverty rate does.
     */
    const seen: number[] = [];
    for (let squeeze = 1; squeeze >= 0.72; squeeze -= 0.02) {
      const s = buildSociety();
      const pushed: Society = {
        ...s,
        bands: s.bands.map((b) => ({
          ...b,
          disposableIndex: b.key === 'lower' || b.key === 'working' ? 100 * squeeze : 100,
        })),
      };
      seen.push(stepSociety(pushed, inputs()).society.povertyRate);
    }
    const jumps = seen.slice(1).map((v, i) => Math.abs(v - seen[i]!));
    expect(Math.max(...jumps)).toBeLessThan(8);
    /* And it does move — a smooth line is not the same as a flat one. */
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(3);
  });
});

describe('the tax code, landing', () => {
  it('makes consumption taxes regressive and holding taxes progressive', () => {
    const code = buildTaxCode();
    const base = burdenByBand(code);
    const consumption = burdenByBand({ ...code, rates: { ...code.rates, gst: 0.3, excise: 0.5 } });
    const holdings = burdenByBand({
      ...code,
      rates: { ...code.rates, wealth: 0.05, inheritance: 0.5, capital_gains: 0.5 },
    });
    /*
     * Stated as a SHIFT rather than an ordering. In a country with a large
     * consumption tax already on the books the bottom carries more of its
     * income than the top does whatever else is done, and a wealth tax does
     * not reverse that — it moves it. Asserting the ordering would have been
     * asserting that no real tax system exists.
     */
    expect(consumption.lower - base.lower).toBeGreaterThan(consumption.wealthy - base.wealthy);
    expect(holdings.wealthy - base.wealthy).toBeGreaterThan(holdings.lower - base.lower);
    expect(holdings.wealthy).toBeGreaterThan(base.wealthy);
  });

  it('moves burden between top and bottom when progressivity changes', () => {
    const code = buildTaxCode();
    const flat = burdenByBand({ ...code, progressivity: 0 });
    const steep = burdenByBand({ ...code, progressivity: 1 });
    expect(steep.wealthy).toBeGreaterThan(flat.wealthy);
    expect(steep.lower).toBeLessThan(flat.lower);
  });
});

describe('a term and a half of governing', () => {
  it('leaves the distribution where it found it when nothing is decided', () => {
    /*
     * The regression that matters. A government that changes no tax, builds
     * no houses and presides over trend growth should hand on the country
     * it inherited. The first version of this file walked relative poverty
     * from 15% to 22% under exactly these conditions, because the standing
     * tax burden was charged as a weekly decline rather than as a position
     * — and then charged a second time against a proportional code nobody
     * had ever legislated.
     */
    const before = buildSociety();
    const after = run(TERM * 2);

    expect(after.povertyRate).toBeCloseTo(before.povertyRate, 0);
    expect(after.incomeGini).toBeCloseTo(before.incomeGini, 2);
    expect(after.wealthGini).toBeCloseTo(before.wealthGini, 1);
    expect(homeownership(after.bands)).toBeCloseTo(homeownership(before.bands), 0);

    /* Every band shares in growth, and shares in it about equally. */
    const spread = after.bands.map((b) => b.disposableIndex);
    expect(Math.min(...spread)).toBeGreaterThan(105);
    expect(Math.max(...spread) - Math.min(...spread)).toBeLessThan(6);
  });

  it('never lets a level run away, whatever is thrown at it', () => {
    /*
     * The guard for the whole class. Each of these is a hard but entirely
     * ordinary eight years; none should produce a number that could not
     * appear in a real country's accounts. A level written as a rate fails
     * here and nowhere else.
     */
    const cases: [string, Partial<SocietyInputs>][] = [
      ['nothing', {}],
      ['housing crisis', { housingPressure: 1.4 }],
      ['zero rates', { economy: { ...economy(), policyRate: 0, inflation: 2 } }],
      ['dear money', { economy: { ...economy(), policyRate: 11, inflation: 3 } }],
      ['slump', { economy: { ...economy(), growth: -2, unemployment: 13, wageGrowth: 0 } }],
      ['price shock', { economy: { ...economy(), inflation: 11 }, energyPrices: 1.8 }],
      ['confiscatory', { taxes: { ...buildTaxCode(), progressivity: 1 }, transferShare: 26 }],
      ['laissez-faire', { taxes: { ...buildTaxCode(), progressivity: 0 }, transferShare: 2 }],
    ];

    for (const [label, over] of cases) {
      const s = run(TERM * 2, over);
      const where = `after eight years of ${label}`;

      expect(s.povertyRate, where).toBeGreaterThanOrEqual(0);
      expect(s.povertyRate, where).toBeLessThan(60);
      expect(s.incomeGini, where).toBeGreaterThan(0.12);
      expect(s.incomeGini, where).toBeLessThan(0.7);
      expect(s.wealthGini, where).toBeGreaterThan(0.3);
      expect(s.wealthGini, where).toBeLessThan(0.92);
      /* Eight years of prices. Even at eleven per cent this is under 3x. */
      expect(s.costOfLiving, where).toBeGreaterThan(90);
      expect(s.costOfLiving, where).toBeLessThan(320);
      expect(homeownership(s.bands), where).toBeGreaterThan(20);
      expect(s.housingCostBurden, where).toBeLessThan(59);
      expect(s.householdDebt, where).toBeLessThan(400);

      for (const band of s.bands) {
        expect(band.disposableIndex, `${band.key} ${where}`).toBeGreaterThan(50);
        expect(band.disposableIndex, `${band.key} ${where}`).toBeLessThan(200);
        expect(band.tenure.owned + band.tenure.mortgaged + band.tenure.renting).toBeCloseTo(1, 6);
        expect(Number.isFinite(band.debtToIncome)).toBe(true);
      }
      expect(s.bands.reduce((a, b) => a + b.incomeShare, 0), where).toBeCloseTo(1, 6);
      expect(s.bands.reduce((a, b) => a + b.wealthShare, 0), where).toBeCloseTo(1, 6);
    }
  });
});

describe('what a government actually changes', () => {
  it('takes the bottom first in a slump and the top first when money gets dear', () => {
    const slump = run(TERM, {
      economy: { ...economy(), growth: -1.5, unemployment: 11, wageGrowth: 0.5 },
    });
    const steady = run(TERM);
    const fall = (s: Society, key: 'lower' | 'wealthy') =>
      bandOf(steady, key).disposableIndex - bandOf(s, key).disposableIndex;
    /* Unemployment is not distributed evenly and never has been. */
    expect(fall(slump, 'lower')).toBeGreaterThan(fall(slump, 'wealthy'));

    /* Holdings are repriced by the discount rate; wages are not. */
    const cheap = run(TERM, { economy: { ...economy(), policyRate: 1, inflation: 2 } });
    const dear = run(TERM, { economy: { ...economy(), policyRate: 9, inflation: 3 } });
    expect(cheap.wealthGini).toBeGreaterThan(dear.wealthGini);
  });

  it('turns a housing shortage into tenure, slowly and against a floor', () => {
    const short = run(TERM * 2, { housingPressure: 1.35 });
    const balanced = run(TERM * 2);
    expect(short.housingCostBurden).toBeGreaterThan(balanced.housingCostBurden + 8);
    expect(homeownership(short.bands)).toBeLessThan(homeownership(balanced.bands) - 5);
    /* But somebody still owns. This is a shift, not an abolition. */
    expect(homeownership(short.bands)).toBeGreaterThan(35);
    /* And the households that stopped owning are renting, not missing. */
    expect(rentingShare(short.bands)).toBeGreaterThan(rentingShare(balanced.bands));
  });

  it('answers a redistributive budget, and an unredistributive one', () => {
    const steep = run(TERM * 2, {
      taxes: { ...buildTaxCode(), progressivity: 1 },
      transferShare: 20,
    });
    const flat = run(TERM * 2, {
      taxes: { ...buildTaxCode(), progressivity: 0 },
      transferShare: 6,
    });
    expect(steep.povertyRate).toBeLessThan(flat.povertyRate);
    expect(bandOf(steep, 'lower').disposableIndex).toBeGreaterThan(
      bandOf(flat, 'lower').disposableIndex,
    );
    expect(bandOf(flat, 'wealthy').disposableIndex).toBeGreaterThan(
      bandOf(steep, 'wealthy').disposableIndex,
    );
  });

  it('moves mobility with schools, and not before the election', () => {
    const good = run(TERM * 2, { educationQuality: 90 });
    const poor = run(TERM * 2, { educationQuality: 30 });
    expect(good.socialMobility).toBeGreaterThan(poor.socialMobility + 4);

    /* One year in, almost nothing. This is a generational number and the
       engine refuses to pretend otherwise. */
    const early = run(52, { educationQuality: 90 });
    expect(early.socialMobility - buildSociety().socialMobility).toBeLessThan(2);
  });

  it('reports a squeeze the week it starts', () => {
    const s = buildSociety();
    const tick = stepSociety(s, inputs({ housingPressure: 1.6, energyPrices: 2 }));
    expect(tick.squeezed).toContain('lower');
    /* The top of the distribution spends a sixth of its money on the things
       that just got dearer and the bottom spends two thirds, so the shock
       lowers both and leaves only one of them behind the country. */
    expect(tick.squeezed).not.toContain('wealthy');
  });
});

describe('reading a percentile', () => {
  it('rises monotonically across the distribution', () => {
    const s = buildSociety();
    let last = -Infinity;
    for (let p = 0.05; p <= 0.95; p += 0.05) {
      const here = incomeAtPercentile(s.bands, p);
      expect(here).toBeGreaterThan(last);
      last = here;
    }
  });
});
