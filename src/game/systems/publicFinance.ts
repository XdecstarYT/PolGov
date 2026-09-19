/**
 * publicFinance.ts — what the debt is made of, and who is willing to lend.
 *
 * A debt total is not something a player can act on. What they can act on is
 * how much falls due and when, what the market charges for the next tranche,
 * what the government has promised about it, and what has been set aside.
 * This module is those four things.
 *
 * The design rule throughout: the lenders are a transparent function of the
 * numbers, never a hidden opinion. A downgrade the player could not have
 * seen coming is a punishment; one they watched approach for three months
 * and chose not to act on is a decision. So the rating publishes both the
 * grade it holds and the grade the numbers justify, along with its reasons
 * in plain words.
 *
 * The one asymmetry that carries the most weight: adopting a fiscal rule
 * costs political capital and buys a cheaper cost of borrowing; repealing it
 * costs less than adopting it did. The cheap way out of a binding rule is
 * always to abolish it — and the market has been watching, so credibility
 * resets to nothing and has to be earned again over a year.
 */

import {
  BOND_TENORS,
  BOND_TERM_PREMIUM,
  BUDGET_UPDATE_INTERVAL,
  CREDIT_RATINGS,
  EMERGENCY_FUND_REFILL_SHARE,
  EMERGENCY_FUND_TARGET,
  FISCAL_RULE_BREACH_APPROVAL,
  FISCAL_RULE_BREACH_MOOD,
  FISCAL_RULE_CREDIBILITY_TURNS,
  FISCAL_RULE_CREDIBILITY_RELIEF,
  LOCAL_OWN_REVENUE_SHARE,
  RATING_DEFICIT_NOTCH_AT,
  RATING_RECESSION_NOTCH,
  RATING_REVIEW_TURNS,
  REGIONAL_FUNDING_PER_SEAT,
  REGIONAL_GRANT_SHARE,
  REGIONAL_SERVICE_DRIFT,
  REGIONAL_SERVICE_WEIGHT,
  RESERVE_FUND_RETURN,
  SPREAD_CEILING,
  SPREAD_FREE_DEBT_RATIO,
  SPREAD_PER_DEBT_POINT,
  SPREAD_PER_DEFICIT_POINT,
  MARKET_ACCESS_DEBT_RATIO,
} from '../balance.ts';
import { TURNS_PER_YEAR } from '../balance.ts';
import type {
  Bond,
  CreditGrade,
  CreditRating,
  Economy,
  FiscalForecast,
  FiscalPoint,
  FiscalRule,
  FiscalRuleKind,
  PublicFinance,
  Region,
  RegionalBudget,
} from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Ratios — the two numbers everything else is a function of
 * ------------------------------------------------------------------ */

/** Debt as a share of a year's output. The number lenders actually watch. */
export function debtRatio(debt: number, gdp: number): number {
  return gdp > 0 ? Math.max(0, debt) / gdp : 0;
}

/**
 * The deficit as a share of a year's output.
 *
 * Annualised from this turn's balance, so it reads the way a finance
 * ministry states it rather than the way the turn loop computes it.
 */
export function deficitRatio(turnBalance: number, gdp: number): number {
  return gdp > 0 ? (-turnBalance * TURNS_PER_YEAR) / gdp : 0;
}

/* ------------------------------------------------------------------ *
 * The market
 * ------------------------------------------------------------------ */

/**
 * What the market adds to the policy rate for this government's paper.
 *
 * Three terms: the level of debt, the direction it is moving, and whether
 * the government has kept the promises it made about both. The third is the
 * only one the player controls quickly, which is exactly why fiscal rules
 * are worth having and exactly why breaking one is expensive.
 */
export function marketSpread(
  debt: number,
  gdp: number,
  turnBalance: number,
  credibility: number,
  /** How much this country's creditors will carry. See `debtTolerance`. */
  debtTolerance = 1,
): number {
  const level =
    Math.max(0, debtRatio(debt, gdp) - SPREAD_FREE_DEBT_RATIO * debtTolerance) * 100;
  const direction = Math.max(0, deficitRatio(turnBalance, gdp) * 100);

  const raw =
    level * SPREAD_PER_DEBT_POINT +
    direction * SPREAD_PER_DEFICIT_POINT -
    credibility * FISCAL_RULE_CREDIBILITY_RELIEF;

  return clamp(raw, 0, SPREAD_CEILING);
}

/**
 * How much the market believes the government's own fiscal rules, 0–1.
 *
 * Earned by a year of compliance and lost the moment a rule is breached or
 * repealed. Deliberately slow to build and instant to lose, because that is
 * the actual shape of fiscal credibility and because it makes the decision
 * to breach a rule a real one rather than a small fine.
 */
export function ruleCredibility(rules: readonly FiscalRule[]): number {
  if (rules.length === 0) return 0;
  const scores = rules.map((rule) =>
    rule.breachTurns > 0
      ? 0
      : clamp(rule.complianceTurns / FISCAL_RULE_CREDIBILITY_TURNS, 0, 1),
  );
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** All-in annual cost of issuing new paper at a given tenor. */
export function borrowingCost(policyRate: number, spread: number, tenor = 60): number {
  return policyRate + spread + (BOND_TERM_PREMIUM[tenor] ?? 0);
}

/* ------------------------------------------------------------------ *
 * Ratings
 * ------------------------------------------------------------------ */

const GRADES = CREDIT_RATINGS.map((r) => r.grade);

function gradeIndex(grade: CreditGrade): number {
  const i = GRADES.indexOf(grade);
  return i < 0 ? GRADES.length - 1 : i;
}

/**
 * The grade the numbers justify right now, with the reasons written out.
 *
 * Nothing here is hidden or random. The player can compute it themselves
 * from the briefing, which is the only way a constraint on borrowing can be
 * something to plan around rather than something that happens to you.
 */
export function justifiedRating(
  debt: number,
  gdp: number,
  turnBalance: number,
  economy: Economy,
): { grade: CreditGrade; spread: number; reasons: string[] } {
  const ratio = debtRatio(debt, gdp);
  const reasons: string[] = [];

  let index = CREDIT_RATINGS.findIndex((band) => ratio <= band.maxDebtRatio);
  if (index < 0) index = CREDIT_RATINGS.length - 1;
  reasons.push(`Debt at ${(ratio * 100).toFixed(0)}% of output`);

  const deficit = deficitRatio(turnBalance, gdp);
  if (deficit > RATING_DEFICIT_NOTCH_AT) {
    index += 1;
    reasons.push(
      `Deficit running at ${(deficit * 100).toFixed(1)}% of output, above the ${(
        RATING_DEFICIT_NOTCH_AT * 100
      ).toFixed(0)}% they tolerate`,
    );
  }

  if (RATING_RECESSION_NOTCH && economy.phase === 'recession') {
    index += 1;
    reasons.push('In recession — they price the revenue, not the plan for it');
  }

  index = clamp(index, 0, CREDIT_RATINGS.length - 1);
  const band = CREDIT_RATINGS[index]!;
  return { grade: band.grade, spread: band.spread, reasons };
}

/**
 * Advance the rating by a month.
 *
 * Downgrades take `RATING_REVIEW_TURNS` to arrive, which gives the player a
 * standing, visible warning. Upgrades are immediate — not out of generosity,
 * but because the alternative is a government that fixes its finances and
 * then waits a quarter to be told, which reads as the game withholding
 * credit for something already earned.
 */
export function stepRating(
  rating: CreditRating,
  debt: number,
  gdp: number,
  turnBalance: number,
  economy: Economy,
): CreditRating {
  const justified = justifiedRating(debt, gdp, turnBalance, economy);
  const held = gradeIndex(rating.grade);
  const due = gradeIndex(justified.grade);

  if (due <= held) {
    /* As good as or better than what we hold: act on it at once. */
    return {
      grade: justified.grade,
      spread: justified.spread,
      pending: justified.grade,
      reviewTurns: 0,
      reasons: justified.reasons,
    };
  }

  const reviewTurns = rating.pending === justified.grade ? rating.reviewTurns + 1 : 1;
  if (reviewTurns >= RATING_REVIEW_TURNS) {
    return {
      grade: justified.grade,
      spread: justified.spread,
      pending: justified.grade,
      reviewTurns: 0,
      reasons: justified.reasons,
    };
  }

  /* On review: the warning is visible, and the grade has not moved yet. */
  return {
    ...rating,
    pending: justified.grade,
    reviewTurns,
    reasons: justified.reasons,
  };
}

/* ------------------------------------------------------------------ *
 * Bonds
 * ------------------------------------------------------------------ */

let bondCounter = 0;

/**
 * Issue paper to cover a shortfall.
 *
 * The tenor is a real choice. Short paper is cheap and comes back to be
 * refinanced — possibly at a rate set by a market that has since taken a
 * dimmer view. Long paper is dearer and locks today's rate in. A government
 * that funds itself entirely at twelve months is running a refinancing risk
 * that will not appear anywhere until the month it does.
 */
export function issueBond(
  principal: number,
  policyRate: number,
  spread: number,
  tenor: number,
  turn: number,
): Bond {
  bondCounter += 1;
  return {
    id: `bond-${turn}-${bondCounter}`,
    principal,
    coupon: borrowingCost(policyRate, spread, tenor),
    tenor,
    remaining: tenor,
    issuedTurn: turn,
  };
}

/** Interest due this month across the whole book, ₡bn. */
export function couponsDue(bonds: readonly Bond[]): number {
  return bonds.reduce((sum, b) => sum + (b.principal * b.coupon) / 100 / TURNS_PER_YEAR, 0);
}

/** Principal falling due within the next `months`, ₡bn. */
export function maturingWithin(bonds: readonly Bond[], months: number): number {
  return bonds.filter((b) => b.remaining <= months).reduce((sum, b) => sum + b.principal, 0);
}

/**
 * The weighted average life of the book, in months.
 *
 * One number that says how exposed the government is to a change of mood in
 * the market. Low is cheap and fragile; high is dear and durable.
 */
export function averageMaturity(bonds: readonly Bond[]): number {
  const total = bonds.reduce((sum, b) => sum + b.principal, 0);
  if (total <= 0) return 0;
  return bonds.reduce((sum, b) => sum + b.principal * b.remaining, 0) / total;
}

/** The blended rate the existing book is carried at, %. */
export function averageCoupon(bonds: readonly Bond[]): number {
  const total = bonds.reduce((sum, b) => sum + b.principal, 0);
  if (total <= 0) return 0;
  return bonds.reduce((sum, b) => sum + b.principal * b.coupon, 0) / total;
}

/* ------------------------------------------------------------------ *
 * Fiscal rules
 * ------------------------------------------------------------------ */

export const FISCAL_RULE_LABELS: Record<FiscalRuleKind, string> = {
  deficit_cap: 'Deficit cap',
  debt_ceiling: 'Debt ceiling',
  spending_cap: 'Spending cap',
  balanced_budget: 'Balanced budget',
};

export function describeRule(rule: FiscalRule): string {
  switch (rule.kind) {
    case 'deficit_cap':
      return `The deficit will not exceed ${(rule.threshold * 100).toFixed(1)}% of output.`;
    case 'debt_ceiling':
      return `Debt will not exceed ${(rule.threshold * 100).toFixed(0)}% of output.`;
    case 'spending_cap':
      return `Programme spending will not exceed ₡${rule.threshold.toFixed(0)}bn a year.`;
    case 'balanced_budget':
      return 'The budget will balance over the cycle.';
  }
}

/** Is a rule being kept, given where the finances currently stand? */
export function ruleHolds(
  rule: FiscalRule,
  debt: number,
  gdp: number,
  turnBalance: number,
  spending: number,
): boolean {
  switch (rule.kind) {
    case 'deficit_cap':
      return deficitRatio(turnBalance, gdp) <= rule.threshold;
    case 'debt_ceiling':
      return debtRatio(debt, gdp) <= rule.threshold;
    case 'spending_cap':
      return spending <= rule.threshold;
    case 'balanced_budget':
      return turnBalance >= 0;
  }
}

/** Advance each rule's compliance and breach counters by a week. */
export function stepRules(
  rules: readonly FiscalRule[],
  debt: number,
  gdp: number,
  turnBalance: number,
  spending: number,
): FiscalRule[] {
  return rules.map((rule) => {
    const holds = ruleHolds(rule, debt, gdp, turnBalance, spending);
    return {
      ...rule,
      breachTurns: holds ? 0 : rule.breachTurns + 1,
      complianceTurns: holds ? rule.complianceTurns + 1 : 0,
    };
  });
}

/** Rules currently being broken. */
export function rulesInBreach(rules: readonly FiscalRule[]): FiscalRule[] {
  return rules.filter((r) => r.breachTurns > 0);
}

/**
 * Approval cost this month from rules being broken.
 *
 * It compounds with the length of the breach, because the political problem
 * with breaking your own rule is not the month you break it — it is the
 * eleventh month of explaining why it is still broken.
 */
export function breachApprovalCost(rules: readonly FiscalRule[]): number {
  return rulesInBreach(rules).reduce(
    (sum, rule) => sum + FISCAL_RULE_BREACH_APPROVAL * Math.min(4, Math.sqrt(rule.breachTurns)),
    0,
  );
}

/** Coalition mood cost this month from rules being broken. */
export function breachMoodCost(rules: readonly FiscalRule[]): number {
  return rulesInBreach(rules).length * FISCAL_RULE_BREACH_MOOD;
}

/* ------------------------------------------------------------------ *
 * The tiers
 * ------------------------------------------------------------------ */

/**
 * Build the regional accounts.
 *
 * Regions deliver services and can raise almost nothing themselves, which is
 * the arrangement most countries have and the one that produces the argument
 * the game wants: a national government that trims the grant has cut
 * regional services without appearing anywhere in the regional accounts, and
 * the regional politicians who take the blame did not make the decision.
 */
export function buildRegionalBudgets(
  regions: readonly Region[],
  /** National receipts, ₡bn A YEAR. The grant is a share of them. */
  nationalRevenue: number,
): RegionalBudget[] {
  const totalSeats = regions.reduce((sum, r) => sum + r.seats, 0) || 1;
  const pool = nationalRevenue * REGIONAL_GRANT_SHARE;

  return regions.map((region) => {
    const share = region.seats / totalSeats;
    const grant = pool * share;
    const ownRevenue = grant * LOCAL_OWN_REVENUE_SHARE;
    return {
      regionId: region.id,
      grant,
      ownRevenue,
      spending: grant + ownRevenue,
      serviceQuality: 60,
      debt: 0,
    };
  });
}

/** What regional service quality a given level of funding per seat sustains. */
export function regionalEquilibrium(funding: number, seats: number): number {
  if (seats <= 0) return 0;
  const perSeat = funding / seats;
  const k = REGIONAL_FUNDING_PER_SEAT * (2 / 3);
  return perSeat + k === 0 ? 0 : (100 * perSeat) / (perSeat + k);
}

/** One month of regional finances and the service quality they buy. */
export function stepRegionalBudgets(
  budgets: readonly RegionalBudget[],
  regions: readonly Region[],
  /** National receipts, ₡bn A YEAR, like every other budget figure. */
  nationalRevenue: number,
): RegionalBudget[] {
  const totalSeats = regions.reduce((sum, r) => sum + r.seats, 0) || 1;
  const pool = nationalRevenue * REGIONAL_GRANT_SHARE;

  return budgets.map((budget) => {
    const region = regions.find((r) => r.id === budget.regionId);
    if (!region) return budget;

    const grant = pool * (region.seats / totalSeats);
    const ownRevenue = grant * LOCAL_OWN_REVENUE_SHARE;
    const income = grant + ownRevenue;

    /*
     * Regions cannot cut as fast as the centre can. They carry a shortfall
     * as their own debt for a while, which is why a grant cut shows up as a
     * regional deficit first and as a service failure afterwards.
     */
    /* Regions cannot cut as fast as the centre can, so they hold spending
       up for a while and carry the gap. Per turn, not per year: this is the
       speed of the adjustment, not its size. */
    const spending = Math.max(income, budget.spending * (1 - 0.06 / (TURNS_PER_YEAR / 12)));
    const shortfall = Math.max(0, spending - income);

    const target = regionalEquilibrium(spending, region.seats);
    const serviceQuality = clamp(
      budget.serviceQuality + (target - budget.serviceQuality) * REGIONAL_SERVICE_DRIFT,
      0,
      100,
    );

    return {
      ...budget,
      grant,
      ownRevenue,
      spending,
      serviceQuality,
      /* The shortfall is an annual rate; what accrues this turn is a slice. */
      debt: budget.debt + shortfall / TURNS_PER_YEAR,
    };
  });
}

/**
 * What regional service quality does to support in that region.
 *
 * Returned as a swing to be applied on top of the national picture, so a
 * government can be liked nationally and resented in the three regions whose
 * grant it cut — which is how regional politics actually works.
 */
export function regionalSwing(budget: RegionalBudget): number {
  return (budget.serviceQuality - 60) * REGIONAL_SERVICE_WEIGHT;
}

/* ------------------------------------------------------------------ *
 * Starting state
 * ------------------------------------------------------------------ */

/**
 * The finances a new government inherits.
 *
 * The starting debt is issued as a real book with a spread of maturities,
 * rather than as one undifferentiated number, so that the refinancing
 * problem exists from turn one and was not created by the player.
 */
export function buildPublicFinance(
  debt: number,
  gdp: number,
  policyRate: number,
  regions: readonly Region[],
  nationalRevenue: number,
): PublicFinance {
  bondCounter = 0;
  const share = 1 / BOND_TENORS.length;
  /* Stagger what the previous government left behind, so the refinancing
     cliff is inherited rather than invented by the player's first budget. */
  const bonds = BOND_TENORS.map((tenor, i) => {
    const bond = issueBond(debt * share, policyRate, 0, tenor, 0);
    return { ...bond, remaining: Math.max(1, Math.round(tenor * (0.35 + i * 0.2))) };
  });

  const justified = justifiedRating(debt, gdp, 0, {
    phase: 'expansion',
  } as Economy);

  return {
    bonds,
    rating: {
      grade: justified.grade,
      spread: justified.spread,
      pending: justified.grade,
      reviewTurns: 0,
      reasons: justified.reasons,
    },
    spread: justified.spread,
    rules: [],
    emergencyFund: EMERGENCY_FUND_TARGET,
    reserveFund: 0,
    reserveContribution: 0,
    regional: buildRegionalBudgets(regions, nationalRevenue),
    /* Somebody will lend to this country. For now. */
    marketAccess: true,
    weeksShutOut: 0,
    history: [],
  };
}

/**
 * Will anybody lend to this country at all?
 *
 * Every other fiscal consequence in this engine is a matter of degree: a
 * wider spread, a worse grade, a bigger interest line. This one is not.
 * Below it a government borrows expensively; at it a government does not
 * borrow, and the deficit has to be closed this week rather than over a
 * parliament — which is what a sovereign debt crisis actually is, and why
 * it ends governments rather than embarrassing them.
 *
 * It takes BOTH a debt the market cannot see being repaid and a deficit
 * still being run, because a high debt that is falling is a country
 * everybody lends to and a modest debt rising fast is not.
 */
export function marketAccessHolds(
  debt: number,
  gdp: number,
  turnBalance: number,
  grade: CreditGrade,
  debtTolerance = 1,
): boolean {
  if (grade !== 'CCC' && grade !== 'B') return true;
  const ratio = debtRatio(debt, gdp);
  if (ratio < MARKET_ACCESS_DEBT_RATIO * debtTolerance) return true;
  /* A surplus buys the benefit of the doubt at any level of debt, because
     the question the market is asking is about direction. */
  return turnBalance >= 0;
}

/* ------------------------------------------------------------------ *
 * The month
 * ------------------------------------------------------------------ */

export interface FinanceTick {
  finance: PublicFinance;
  /** Principal that matured and had to be refinanced or repaid, ₡bn. */
  matured: number;
  /** Interest paid across the book this month, ₡bn. */
  coupons: number;
  /** Earned by the reserve fund this month, ₡bn. */
  reserveReturn: number;
  /** Paid into the reserve fund this month, ₡bn. */
  reserveContributed: number;
  /** Paid into the emergency fund this month, ₡bn. */
  emergencyRefilled: number;
  /** True if the rating changed this month. */
  ratingMoved: boolean;
  /** Rules newly in breach this month. */
  newBreaches: FiscalRuleKind[];
  /** True on the week the market stopped lending. */
  lostMarketAccess: boolean;
  /** True on the week it came back. */
  regainedMarketAccess: boolean;
}

/**
 * Advance the public finances by one month.
 *
 * Order: age the book and refinance what fell due, then price the market,
 * then let the agencies react to the prices, then the rules, then the funds,
 * then the regions. Each step reads what the previous one produced.
 */
export function stepPublicFinance(
  finance: PublicFinance,
  options: {
    debt: number;
    economy: Economy;
    turnBalance: number;
    spending: number;
    regions: readonly Region[];
    nationalRevenue: number;
    /** New borrowing to fund this month, ₡bn. */
    newBorrowing: number;
    /** Tenor the treasury is issuing at. */
    tenor: number;
    turn: number;
    /** How much this country's creditors will carry. See `debtTolerance`. */
    debtTolerance?: number;
  },
): FinanceTick {
  const { debt, economy, turnBalance, spending, regions, nationalRevenue, turn } = options;
  const debtTolerance = options.debtTolerance ?? 1;

  /* 1. Age the book. Matured paper is refinanced at today's price, which is
        the whole point of tracking maturities at all. */
  const aged = finance.bonds.map((b) => ({ ...b, remaining: b.remaining - 1 }));
  const matured = aged.filter((b) => b.remaining <= 0);
  const maturedPrincipal = matured.reduce((sum, b) => sum + b.principal, 0);
  let bonds = aged.filter((b) => b.remaining > 0);
  const coupons = couponsDue(bonds);

  /* 2. The market prices this government's paper. */
  const credibility = ruleCredibility(finance.rules);
  const spread = marketSpread(debt, economy.gdp, turnBalance, credibility);

  /* 3. Refinance the cliff and fund the month's shortfall, at today's rate. */
  const toIssue = maturedPrincipal + Math.max(0, options.newBorrowing);
  if (toIssue > 0) {
    bonds = [...bonds, issueBond(toIssue, economy.policyRate, spread, options.tenor, turn)];
  }

  /* 4. The agencies. Slow to downgrade, immediate to upgrade. */
  const rating = stepRating(finance.rating, debt, economy.gdp, turnBalance, economy);
  const ratingMoved = rating.grade !== finance.rating.grade;

  /* 5. The government's promises about all of the above. */
  const before = new Set(rulesInBreach(finance.rules).map((r) => r.kind));
  const rules = stepRules(finance.rules, debt, economy.gdp, turnBalance, spending);
  const newBreaches = rulesInBreach(rules)
    .map((r) => r.kind)
    .filter((kind) => !before.has(kind));

  /* 6. The funds. The reserve compounds; the emergency fund refills only out
        of surplus, which is why it is usually empty when it is needed. */
  const reserveReturn = finance.reserveFund * RESERVE_FUND_RETURN;
  const reserveContributed = Math.max(0, finance.reserveContribution);
  const surplus = Math.max(0, turnBalance);
  const emergencyRefilled = Math.min(
    Math.max(0, EMERGENCY_FUND_TARGET - finance.emergencyFund),
    surplus * EMERGENCY_FUND_REFILL_SHARE,
  );

  /* 7. The regions, funded out of national revenue. */
  const regional = stepRegionalBudgets(finance.regional, regions, nationalRevenue);

  /* 8. And the question underneath all of it. */
  const marketAccess = marketAccessHolds(
    debt,
    economy.gdp,
    turnBalance,
    rating.grade,
    debtTolerance,
  );
  const weeksShutOut = marketAccess ? 0 : finance.weeksShutOut + 1;

  const point: FiscalPoint = {
    turn,
    debtRatio: debtRatio(debt, economy.gdp),
    deficitRatio: deficitRatio(turnBalance, economy.gdp),
    borrowingCost: borrowingCost(economy.policyRate, spread, options.tenor),
    grade: rating.grade,
  };

  return {
    finance: {
      bonds,
      rating,
      spread,
      rules,
      emergencyFund: finance.emergencyFund + emergencyRefilled,
      reserveFund: finance.reserveFund + reserveReturn + reserveContributed,
      reserveContribution: finance.reserveContribution,
      regional,
      marketAccess,
      weeksShutOut,
      history: [...finance.history, point].slice(-120),
    },
    lostMarketAccess: finance.marketAccess && !marketAccess,
    regainedMarketAccess: !finance.marketAccess && marketAccess,
    matured: maturedPrincipal,
    coupons,
    reserveReturn,
    reserveContributed,
    emergencyRefilled,
    ratingMoved,
    newBreaches,
  };
}

/* ------------------------------------------------------------------ *
 * Forecasting and reporting
 * ------------------------------------------------------------------ */

/**
 * Where the finances go on the current settings.
 *
 * Holds the deficit and the economy constant, which is a simplification the
 * economic forecast does not make — but it is the right one here, because
 * the question this answers is "if we keep doing this", and letting the
 * economy drift would blur the answer with a second moving part.
 */
export function forecastFinance(
  finance: PublicFinance,
  debt: number,
  economy: Economy,
  turnBalance: number,
  spending: number,
  horizon = 12,
): FiscalForecast {
  const months: FiscalPoint[] = [];
  let runningDebt = debt;
  let rating = finance.rating;
  const breached = new Set<FiscalRuleKind>();
  let downgrade = false;

  for (let i = 1; i <= horizon; i += 1) {
    runningDebt = Math.max(0, runningDebt - turnBalance);
    const credibility = ruleCredibility(finance.rules);
    const spread = marketSpread(runningDebt, economy.gdp, turnBalance, credibility);
    rating = stepRating(rating, runningDebt, economy.gdp, turnBalance, economy);
    if (rating.grade !== finance.rating.grade) downgrade = true;

    for (const rule of finance.rules) {
      if (!ruleHolds(rule, runningDebt, economy.gdp, turnBalance, spending)) {
        breached.add(rule.kind);
      }
    }

    months.push({
      turn: i,
      debtRatio: debtRatio(runningDebt, economy.gdp),
      deficitRatio: deficitRatio(turnBalance, economy.gdp),
      borrowingCost: borrowingCost(economy.policyRate, spread),
      grade: rating.grade,
    });
  }

  return {
    months,
    endDebtRatio: months[months.length - 1]?.debtRatio ?? debtRatio(debt, economy.gdp),
    breachInHorizon: [...breached],
    downgradeInHorizon: downgrade,
  };
}

/** Is this the month the accounts are published? */
export function isBudgetUpdateTurn(turn: number): boolean {
  return turn > 0 && turn % BUDGET_UPDATE_INTERVAL === 0;
}
