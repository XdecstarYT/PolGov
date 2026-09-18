/**
 * industry.test.ts — the chain from a decision to a region.
 *
 * The reason industries exist in this game is to make a national decision
 * land unevenly. Most of the tests below are checks on that chain rather
 * than on any individual formula: a rate rise has to hurt construction more
 * than healthcare, construction has to be somewhere in particular, and that
 * somewhere has to end up with a jobs problem. If any link breaks, the
 * industrial model is decoration.
 */

import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_TEMPLATES,
  buildIndustries,
  byOutput,
  employmentGap,
  findIndustry,
  industryExtremes,
  industryPressure,
  outputMultiplier,
  regionalEmployment,
  stepIndustries,
} from '../systems/industry.ts';
import { buildEconomy } from '../systems/economy.ts';
import { buildTaxCode } from '../systems/taxation.ts';
import { SECTOR_BASELINE_FUNDING, SECTOR_KEYS } from '../balance.ts';
import type { Economy, Sector, TaxCode } from '../types.ts';

const sectors: Sector[] = SECTOR_KEYS.map((key) => ({
  key,
  health: 60,
  funding: SECTOR_BASELINE_FUNDING[key],
}));
const economy = (overrides: Partial<Economy> = {}): Economy => ({
  ...buildEconomy(),
  ...overrides,
});
const taxes = (rates: Partial<TaxCode['rates']> = {}): TaxCode => {
  const base = buildTaxCode();
  return { ...base, rates: { ...base.rates, ...rates } };
};

/** Run the industries forward n months under fixed conditions. */
function run(months: number, e = economy(), t = taxes(), s = sectors) {
  let industries = buildIndustries();
  for (let i = 0; i < months; i += 1) industries = stepIndustries(industries, e, t, s);
  return industries;
}

const healthOf = (industries: ReturnType<typeof buildIndustries>, key: string) =>
  industries.find((i) => i.key === key)!.health;

describe('the shape of the economy', () => {
  it('accounts for all of output and most of the jobs', () => {
    const output = INDUSTRY_TEMPLATES.reduce((s, t) => s + t.outputShare, 0);
    expect(output).toBeCloseTo(1, 6);
    /* The rest is public administration and self-employment, which is held
       outside the twenty rather than hidden inside one of them. */
    const jobs = INDUSTRY_TEMPLATES.reduce((s, t) => s + t.employmentShare, 0);
    expect(jobs).toBeGreaterThan(0.85);
    expect(jobs).toBeLessThan(1);
  });

  it('separates what an industry produces from who it employs', () => {
    /* The gap that makes resource regions rich and politically aggrieved. */
    const mining = findIndustry('mining');
    expect(mining.outputShare).toBeGreaterThan(mining.employmentShare * 3);
    const retail = findIndustry('retail');
    expect(retail.employmentShare).toBeGreaterThan(retail.outputShare * 1.5);
  });

  it('starts every industry at its baseline', () => {
    for (const industry of buildIndustries()) expect(industry.health).toBe(100);
    expect(outputMultiplier(buildIndustries())).toBeCloseTo(1, 6);
    expect(employmentGap(buildIndustries())).toBeCloseTo(0, 6);
  });

  it('puts every industry somewhere real', () => {
    for (const template of INDUSTRY_TEMPLATES) {
      expect(Object.keys(template.regions).length).toBeGreaterThan(0);
      for (const weight of Object.values(template.regions)) expect(weight).toBeGreaterThan(0);
    }
  });
});

describe('what moves an industry', () => {
  it('hits rate-sensitive industries far harder when money is dear', () => {
    const tight = economy({ policyRate: 11 });
    const construction = industryPressure(buildIndustries()[3]!, tight, taxes(), sectors);
    const healthcare = industryPressure(
      buildIndustries().find((i) => i.key === 'healthcare')!,
      tight,
      taxes(),
      sectors,
    );
    expect(construction.target).toBeLessThan(healthcare.target);
    expect(construction.reasons[0]!.label).toBe('Cost of borrowing');
  });

  it('helps the one industry that gains from dear money', () => {
    /* Banks make more on a wider margin. It is the only negative rate
       sensitivity in the file and it should show up as a positive term. */
    const finance = buildIndustries().find((i) => i.key === 'finance')!;
    const dear = industryPressure(finance, economy({ policyRate: 11 }), taxes(), sectors);
    expect(dear.reasons.find((r) => r.label === 'Cost of borrowing')!.value).toBeGreaterThan(0);
  });

  it('makes a carbon price bite exactly where it is aimed', () => {
    const priced = taxes({ carbon: 0.35 });
    const after = run(48, economy(), priced);
    expect(healthOf(after, 'energy')).toBeLessThan(100);
    expect(healthOf(after, 'mining')).toBeLessThan(100);
    /* And it is a tailwind for the two industries that benefit. */
    expect(healthOf(after, 'forestry')).toBeGreaterThan(healthOf(run(48), 'forestry'));
  });

  it('makes a tariff a transfer between industries, not a free gift', () => {
    const protective = taxes({ import_tariff: 0.22 });
    const after = run(48, economy(), protective);
    /* Manufacturing is sheltered; logistics pays for it at the port. */
    expect(healthOf(after, 'manufacturing')).toBeGreaterThan(100);
    expect(healthOf(after, 'logistics')).toBeLessThan(100);
  });

  it('ties an industry to the public sector it stands on', () => {
    const starved = sectors.map((s) =>
      s.key === 'education' ? { ...s, health: 20, funding: 4 } : s,
    );
    const after = run(60, economy(), taxes(), starved);
    expect(healthOf(after, 'technology')).toBeLessThan(100);
    expect(healthOf(after, 'research')).toBeLessThan(100);
    /* Mining does not care how good the schools are. */
    expect(healthOf(after, 'mining')).toBeCloseTo(healthOf(run(60), 'mining'), 6);
  });

  it('names every reason, so trouble can always be traced', () => {
    const pressure = industryPressure(
      buildIndustries()[3]!,
      economy({ policyRate: 12, outputGap: -4 }),
      taxes({ carbon: 0.3 }),
      sectors,
    );
    expect(pressure.reasons.length).toBeGreaterThan(1);
    /* Largest first, so the panel leads with what actually matters. */
    for (let i = 1; i < pressure.reasons.length; i += 1) {
      expect(Math.abs(pressure.reasons[i - 1]!.value)).toBeGreaterThanOrEqual(
        Math.abs(pressure.reasons[i]!.value),
      );
    }
  });
});

describe('the lag', () => {
  it('is slow — a government inherits the last one’s industrial decisions', () => {
    const shock = economy({ policyRate: 12 });
    const oneMonth = run(1, shock);
    const oneYear = run(12, shock);
    const threeYears = run(36, shock);
    expect(healthOf(oneMonth, 'construction')).toBeGreaterThan(healthOf(oneYear, 'construction'));
    expect(healthOf(oneYear, 'construction')).toBeGreaterThan(healthOf(threeYears, 'construction'));
    /* The claim is proportional, not absolute: after one month of an
       extreme shock, less than a tenth of the eventual damage has landed. */
    const afterOne = 100 - healthOf(oneMonth, 'construction');
    const afterThree = 100 - healthOf(threeYears, 'construction');
    expect(afterOne / afterThree).toBeLessThan(0.1);
  });

  it('cuts jobs more slowly than output, and rehires later', () => {
    const after = run(6, economy({ policyRate: 12 }));
    const construction = after.find((i) => i.key === 'construction')!;
    const template = findIndustry('construction');
    const outputFall = 1 - construction.outputShare / template.outputShare;
    const jobsFall = 1 - construction.employmentShare / template.employmentShare;
    expect(jobsFall).toBeLessThan(outputFall);
  });
});

describe('the regional chain', () => {
  it('turns a national rate rise into a specific region’s jobs problem', () => {
    const dear = run(36, economy({ policyRate: 12 }));
    const jobs = regionalEmployment(dear);
    /* Construction and real estate are the rate-sensitive industries, and
       they are concentrated in the capital and its commuter belt. */
    expect(jobs.ternhill!).toBeLessThan(0);
    /* Sable Reach is energy and mining. It barely notices. */
    expect(jobs.sable!).toBeGreaterThan(jobs.ternhill!);
  });

  it('turns a carbon price into a different region’s jobs problem', () => {
    const priced = run(36, economy(), taxes({ carbon: 0.4 }));
    const jobs = regionalEmployment(priced);
    expect(jobs.sable!).toBeLessThan(0);
    /* And the capital, which does not dig anything up, is fine. */
    expect(jobs.ternhill!).toBeGreaterThan(jobs.sable!);
  });

  it('reports nothing wrong anywhere when nothing is wrong', () => {
    for (const value of Object.values(regionalEmployment(buildIndustries()))) {
      expect(Math.abs(value)).toBeLessThan(1e-6);
    }
  });
});

describe('aggregates', () => {
  it('reads employment off the industries that actually employ people', () => {
    /* Kill retail — a ninth of the jobs — and kill mining, a sixtieth of
       them, and see that the model can tell the difference. */
    const base = buildIndustries();
    const withoutRetail = base.map((i) =>
      i.key === 'retail' ? { ...i, employmentShare: i.employmentShare * 0.5 } : i,
    );
    const withoutMining = base.map((i) =>
      i.key === 'mining' ? { ...i, employmentShare: i.employmentShare * 0.5 } : i,
    );
    expect(employmentGap(withoutRetail)).toBeLessThan(employmentGap(withoutMining));
  });

  it('ranks by output, and names what is in trouble and what is not', () => {
    const struggling = buildIndustries().map((i) =>
      i.key === 'mining' ? { ...i, health: 70 } : i.key === 'finance' ? { ...i, health: 130 } : i,
    );
    expect(byOutput(struggling)[0]!.outputShare).toBeGreaterThanOrEqual(
      byOutput(struggling)[1]!.outputShare,
    );
    const { struggling: bad, thriving: good } = industryExtremes(struggling);
    expect(bad.map((i) => i.key)).toContain('mining');
    expect(good.map((i) => i.key)).toContain('finance');
  });

  it('reports nothing as extreme when everything is normal', () => {
    const { struggling, thriving } = industryExtremes(buildIndustries());
    expect(struggling).toHaveLength(0);
    expect(thriving).toHaveLength(0);
  });

  it('is deterministic', () => {
    expect(run(24)).toEqual(run(24));
  });
});
