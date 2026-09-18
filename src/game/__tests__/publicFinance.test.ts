/**
 * publicFinance.test.ts — the debt, the lenders, and the promises.
 *
 * The thing worth protecting here is not any individual formula: it is that
 * the market is a transparent function of the numbers. A player has to be
 * able to compute the downgrade before it lands, or a constraint on
 * borrowing stops being something to plan around and becomes something that
 * happens to you. Several tests below exist only to assert that nothing
 * about the lenders is hidden or surprising.
 */

import { describe, expect, it } from 'vitest';
import {
  averageCoupon,
  averageMaturity,
  borrowingCost,
  breachApprovalCost,
  buildPublicFinance,
  couponsDue,
  debtRatio,
  deficitRatio,
  describeRule,
  issueBond,
  justifiedRating,
  marketSpread,
  maturingWithin,
  regionalEquilibrium,
  regionalSwing,
  ruleCredibility,
  ruleHolds,
  rulesInBreach,
  stepPublicFinance,
  stepRating,
  stepRegionalBudgets,
  stepRules,
} from '../systems/publicFinance.ts';
import { buildEconomy } from '../systems/economy.ts';
import { buildRegions } from '../setup.ts';
import {
  FISCAL_RULE_CREDIBILITY_MONTHS,
  RATING_REVIEW_MONTHS,
  SPREAD_CEILING,
} from '../balance.ts';
import type { Economy, FiscalRule } from '../types.ts';

const economy = (overrides: Partial<Economy> = {}): Economy => ({
  ...buildEconomy(),
  ...overrides,
});

const regions = buildRegions();
const finance = () => buildPublicFinance(300, buildEconomy().gdp, 4.1, regions, 104);

const rule = (overrides: Partial<FiscalRule> = {}): FiscalRule => ({
  kind: 'deficit_cap',
  threshold: 0.03,
  adoptedTurn: 1,
  breachMonths: 0,
  complianceMonths: 0,
  ...overrides,
});

describe('the ratios everything else is a function of', () => {
  it('reads debt against a year of output', () => {
    expect(debtRatio(500, 1000)).toBeCloseTo(0.5, 10);
    expect(debtRatio(0, 1000)).toBe(0);
  });

  it('annualises the monthly balance, the way a finance ministry states it', () => {
    /* ₡10bn a month of deficit against ₡1,200bn of output is 10% a year. */
    expect(deficitRatio(-10, 1200)).toBeCloseTo(0.1, 10);
    expect(deficitRatio(10, 1200)).toBeCloseTo(-0.1, 10);
  });

  it('does not divide by an economy of nothing', () => {
    expect(debtRatio(100, 0)).toBe(0);
    expect(deficitRatio(-10, 0)).toBe(0);
  });
});

describe('the market', () => {
  const gdp = 3680;

  it('lends free until the debt is large enough to notice', () => {
    expect(marketSpread(gdp * 0.3, gdp, 0, 0)).toBe(0);
  });

  it('charges more as debt climbs', () => {
    const light = marketSpread(gdp * 0.7, gdp, 0, 0);
    const heavy = marketSpread(gdp * 1.2, gdp, 0, 0);
    expect(heavy).toBeGreaterThan(light);
  });

  it('charges for direction as well as level', () => {
    const steady = marketSpread(gdp * 0.9, gdp, 0, 0);
    const widening = marketSpread(gdp * 0.9, gdp, -40, 0);
    expect(widening).toBeGreaterThan(steady);
  });

  it('gives credit for keeping your own rules', () => {
    const unbound = marketSpread(gdp * 0.9, gdp, -10, 0);
    const credible = marketSpread(gdp * 0.9, gdp, -10, 1);
    expect(credible).toBeLessThan(unbound);
  });

  it('stops short of infinity — past a point they simply will not lend', () => {
    expect(marketSpread(gdp * 40, gdp, -9999, 0)).toBeLessThanOrEqual(SPREAD_CEILING);
  });

  it('never pays the government to borrow', () => {
    expect(marketSpread(0, gdp, 500, 1)).toBeGreaterThanOrEqual(0);
  });
});

describe('credibility', () => {
  it('is nothing at all without rules to keep', () => {
    expect(ruleCredibility([])).toBe(0);
  });

  it('is earned over a year of compliance, not announced', () => {
    const fresh = ruleCredibility([rule({ complianceMonths: 1 })]);
    const proven = ruleCredibility([rule({ complianceMonths: FISCAL_RULE_CREDIBILITY_MONTHS })]);
    expect(fresh).toBeLessThan(proven);
    expect(proven).toBeCloseTo(1, 10);
  });

  it('is gone the moment a rule is broken, however long it was kept', () => {
    const broken = ruleCredibility([
      rule({ complianceMonths: 0, breachMonths: 1 }),
    ]);
    expect(broken).toBe(0);
  });
});

describe('ratings', () => {
  const gdp = 3680;

  it('follows the debt level, and says why in words', () => {
    const good = justifiedRating(gdp * 0.3, gdp, 0, economy());
    const bad = justifiedRating(gdp * 1.4, gdp, 0, economy());
    expect(good.grade).toBe('AAA');
    expect(bad.grade).not.toBe('AAA');
    expect(bad.spread).toBeGreaterThan(good.spread);
    expect(bad.reasons.join(' ')).toMatch(/Debt at/);
  });

  it('costs a notch for a deficit the lenders will not wear', () => {
    const steady = justifiedRating(gdp * 0.5, gdp, 0, economy());
    const bleeding = justifiedRating(gdp * 0.5, gdp, -60, economy());
    expect(bleeding.spread).toBeGreaterThan(steady.spread);
    expect(bleeding.reasons.join(' ')).toMatch(/Deficit running/);
  });

  it('costs a notch for a recession, because they price the revenue', () => {
    const calm = justifiedRating(gdp * 0.5, gdp, 0, economy());
    const slump = justifiedRating(gdp * 0.5, gdp, 0, economy({ phase: 'recession' }));
    expect(slump.spread).toBeGreaterThan(calm.spread);
  });

  it('warns for months before it downgrades', () => {
    let rating = finance().rating;
    const heavy = gdp * 1.5;
    for (let i = 1; i < RATING_REVIEW_MONTHS; i += 1) {
      rating = stepRating(rating, heavy, gdp, -50, economy());
      /* The grade has not moved, and the player can see exactly what is coming. */
      expect(rating.pending).not.toBe(rating.grade);
      expect(rating.reviewMonths).toBe(i);
    }
    rating = stepRating(rating, heavy, gdp, -50, economy());
    expect(rating.grade).toBe(rating.pending);
  });

  it('upgrades at once, rather than making a fixed government wait', () => {
    let rating = finance().rating;
    rating = stepRating(rating, 0, gdp, 40, economy());
    expect(rating.grade).toBe('AAA');
    expect(rating.reviewMonths).toBe(0);
  });

  it('abandons a review if the numbers recover before it completes', () => {
    let rating = finance().rating;
    rating = stepRating(rating, gdp * 1.5, gdp, -50, economy());
    expect(rating.reviewMonths).toBe(1);
    rating = stepRating(rating, gdp * 0.2, gdp, 20, economy());
    expect(rating.reviewMonths).toBe(0);
    expect(rating.pending).toBe(rating.grade);
  });
});

describe('bonds', () => {
  it('charges more for longer money', () => {
    expect(borrowingCost(4, 0, 120)).toBeGreaterThan(borrowingCost(4, 0, 12));
  });

  it('fixes the coupon at issue, so timing is a real decision', () => {
    const cheap = issueBond(100, 2, 0, 60, 1);
    const dear = issueBond(100, 9, 2, 60, 1);
    expect(cheap.coupon).toBeLessThan(dear.coupon);
    /* And the cheap one keeps its rate however bad things get later. */
    expect(couponsDue([cheap])).toBeLessThan(couponsDue([dear]));
  });

  it('reports what falls due and when', () => {
    const book = [issueBond(100, 4, 0, 12, 1), issueBond(300, 4, 0, 120, 1)];
    expect(maturingWithin(book, 12)).toBeCloseTo(100, 6);
    expect(maturingWithin(book, 120)).toBeCloseTo(400, 6);
    /* Weighted by size, so the big long tranche dominates. */
    expect(averageMaturity(book)).toBeGreaterThan(60);
  });

  it('reports the blended rate the book is carried at', () => {
    const book = [issueBond(100, 2, 0, 60, 1), issueBond(100, 8, 0, 60, 1)];
    expect(averageCoupon(book)).toBeCloseTo((book[0]!.coupon + book[1]!.coupon) / 2, 6);
  });

  it('handles an empty book without dividing by nothing', () => {
    expect(averageMaturity([])).toBe(0);
    expect(averageCoupon([])).toBe(0);
    expect(couponsDue([])).toBe(0);
  });

  it('inherits a staggered book, so the cliff was not the player’s doing', () => {
    const f = finance();
    const maturities = f.bonds.map((b) => b.remaining);
    expect(new Set(maturities).size).toBeGreaterThan(1);
    expect(f.bonds.reduce((s, b) => s + b.principal, 0)).toBeCloseTo(300, 6);
  });
});

describe('fiscal rules', () => {
  const gdp = 3680;

  it('states itself in plain words', () => {
    expect(describeRule(rule())).toMatch(/deficit will not exceed/i);
    expect(describeRule(rule({ kind: 'debt_ceiling', threshold: 0.6 }))).toMatch(/Debt will not/);
  });

  it('knows whether it is being kept', () => {
    expect(ruleHolds(rule({ threshold: 0.03 }), 0, gdp, -5, 100)).toBe(true);
    expect(ruleHolds(rule({ threshold: 0.03 }), 0, gdp, -60, 100)).toBe(false);
    expect(ruleHolds(rule({ kind: 'debt_ceiling', threshold: 0.6 }), gdp * 0.5, gdp, 0, 100)).toBe(true);
    expect(ruleHolds(rule({ kind: 'debt_ceiling', threshold: 0.6 }), gdp * 0.9, gdp, 0, 100)).toBe(false);
    expect(ruleHolds(rule({ kind: 'spending_cap', threshold: 120 }), 0, gdp, 0, 100)).toBe(true);
    expect(ruleHolds(rule({ kind: 'spending_cap', threshold: 80 }), 0, gdp, 0, 100)).toBe(false);
    expect(ruleHolds(rule({ kind: 'balanced_budget', threshold: 0 }), 0, gdp, 1, 100)).toBe(true);
    expect(ruleHolds(rule({ kind: 'balanced_budget', threshold: 0 }), 0, gdp, -1, 100)).toBe(false);
  });

  it('counts compliance and breach as opposites', () => {
    const kept = stepRules([rule({ breachMonths: 3 })], 0, gdp, 5, 100)[0]!;
    expect(kept.breachMonths).toBe(0);
    expect(kept.complianceMonths).toBe(1);

    const broken = stepRules([rule({ complianceMonths: 9 })], 0, gdp, -90, 100)[0]!;
    expect(broken.complianceMonths).toBe(0);
    expect(broken.breachMonths).toBe(1);
  });

  it('costs more the longer it goes unfixed', () => {
    const fresh = breachApprovalCost([rule({ breachMonths: 1 })]);
    const chronic = breachApprovalCost([rule({ breachMonths: 12 })]);
    expect(chronic).toBeGreaterThan(fresh);
    /* The political problem is not the month you break it. It is the
       eleventh month of explaining why it is still broken. */
    expect(fresh).toBeGreaterThan(0);
  });

  it('costs nothing at all while it is kept', () => {
    expect(breachApprovalCost([rule({ complianceMonths: 30 })])).toBe(0);
    expect(rulesInBreach([rule({ complianceMonths: 30 })])).toHaveLength(0);
  });
});

describe('the tiers', () => {
  it('funds every region out of national revenue, by size', () => {
    const f = finance();
    expect(f.regional).toHaveLength(regions.length);
    const biggest = [...regions].sort((a, b) => b.seats - a.seats)[0]!;
    const smallest = [...regions].sort((a, b) => a.seats - b.seats)[0]!;
    const grantFor = (id: string) => f.regional.find((r) => r.regionId === id)!.grant;
    expect(grantFor(biggest.id)).toBeGreaterThan(grantFor(smallest.id));
  });

  it('turns a grant cut into a regional deficit first and a service failure after', () => {
    let budgets = finance().regional;
    const before = budgets[0]!.serviceQuality;
    /* The centre halves what it sends. Nothing in the national accounts
       records this as a cut to any service. */
    for (let i = 0; i < 24; i += 1) {
      budgets = stepRegionalBudgets(budgets, regions, 52);
    }
    expect(budgets[0]!.debt).toBeGreaterThan(0);
    expect(budgets[0]!.serviceQuality).toBeLessThan(before);
  });

  it('holds services steady when the grant holds steady', () => {
    let budgets = finance().regional;
    for (let i = 0; i < 24; i += 1) {
      budgets = stepRegionalBudgets(budgets, regions, 104);
    }
    for (const b of budgets) {
      expect(b.serviceQuality).toBeGreaterThan(30);
      expect(b.serviceQuality).toBeLessThanOrEqual(100);
    }
  });

  it('turns regional services into regional support, in both directions', () => {
    expect(regionalSwing({ serviceQuality: 90 } as never)).toBeGreaterThan(0);
    expect(regionalSwing({ serviceQuality: 20 } as never)).toBeLessThan(0);
    expect(regionalSwing({ serviceQuality: 60 } as never)).toBeCloseTo(0, 10);
  });

  it('diminishes returns on regional funding like everything else', () => {
    const single = regionalEquilibrium(30, 20);
    const double = regionalEquilibrium(60, 20);
    expect(double).toBeGreaterThan(single);
    expect(double).toBeLessThan(single * 2);
  });
});

describe('a month of public finance', () => {
  const step = (overrides: Parameters<typeof stepPublicFinance>[1]) =>
    stepPublicFinance(finance(), overrides);

  const base = {
    debt: 300,
    economy: economy(),
    monthlyBalance: -10,
    spending: 100,
    regions,
    nationalRevenue: 104,
    newBorrowing: 10,
    tenor: 60,
    turn: 1,
  };

  it('ages the book and refinances what falls due', () => {
    const f = finance();
    /* Push one tranche to the brink, then step it over. */
    const onTheEdge = { ...f, bonds: f.bonds.map((b, i) => (i === 0 ? { ...b, remaining: 1 } : b)) };
    const tick = stepPublicFinance(onTheEdge, base);
    expect(tick.matured).toBeCloseTo(100, 6);
    /* Refinanced, not forgiven: the principal is still owed. */
    const after = tick.finance.bonds.reduce((s, b) => s + b.principal, 0);
    expect(after).toBeGreaterThanOrEqual(300);
  });

  it('reissues at today’s price, not the price it was first borrowed at', () => {
    const f = finance();
    const onTheEdge = { ...f, bonds: f.bonds.map((b, i) => (i === 0 ? { ...b, remaining: 1 } : b)) };
    const cheap = stepPublicFinance(onTheEdge, { ...base, economy: economy({ policyRate: 1 }) });
    const dear = stepPublicFinance(onTheEdge, { ...base, economy: economy({ policyRate: 12 }) });
    expect(averageCoupon(dear.finance.bonds)).toBeGreaterThan(averageCoupon(cheap.finance.bonds));
  });

  it('records the month for the chart', () => {
    const tick = step(base);
    expect(tick.finance.history).toHaveLength(1);
    expect(tick.finance.history[0]!.turn).toBe(1);
  });

  it('grows the reserve fund and tops up the emergency fund only out of surplus', () => {
    const withFund = { ...finance(), reserveFund: 1000, reserveContribution: 5, emergencyFund: 0 };
    const deficit = stepPublicFinance(withFund, base);
    expect(deficit.reserveReturn).toBeGreaterThan(0);
    expect(deficit.reserveContributed).toBe(5);
    /* Running a deficit, so there is nothing to refill the emergency fund with. */
    expect(deficit.emergencyRefilled).toBe(0);

    const surplus = stepPublicFinance(withFund, { ...base, monthlyBalance: 40 });
    expect(surplus.emergencyRefilled).toBeGreaterThan(0);
  });

  it('reports a new breach once, when it happens', () => {
    const bound = { ...finance(), rules: [rule({ kind: 'balanced_budget', threshold: 0 })] };
    const first = stepPublicFinance(bound, base);
    expect(first.newBreaches).toEqual(['balanced_budget']);
    /* Second month of the same breach is not news. */
    const second = stepPublicFinance(first.finance, base);
    expect(second.newBreaches).toEqual([]);
  });

  it('is deterministic', () => {
    expect(step(base)).toEqual(step(base));
  });
});
