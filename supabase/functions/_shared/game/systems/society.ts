/**
 * society.ts — who the country's money belongs to, and what it buys them.
 *
 * The distribution is not a statistic on a panel. It is the mechanism by
 * which every decision on the budget screen becomes a decision about
 * particular households, and it is the reason a government can post good
 * national figures and be hated.
 *
 * Three ideas do all the work here.
 *
 * The first is that INCOME and WEALTH move for different reasons. Income
 * follows wages, employment and the tax code. Wealth follows asset prices,
 * which follow the real interest rate and the housing shortage — neither of
 * which the government sets. So a government can raise wages at the bottom
 * for four years and preside over a country that has become markedly more
 * unequal, because the thing that concentrated was not the thing it moved.
 *
 * The second is that what matters to a household is DISPOSABLE income:
 * what is left after tax, housing and energy. A band can have rising gross
 * income and falling disposable income at the same time, and when that
 * happens the polling does not care that the first number went up. That
 * divergence is the single most common shape of a real cost-of-living
 * crisis and it is modelled here directly.
 *
 * The third is that the bottom band spends nearly two thirds of its money
 * on things whose prices a government is blamed for, and the top spends a
 * sixth. Inflation is therefore not one number. The same five per cent is a
 * different event in each band, and the engine computes it five times.
 *
 * Nothing here asserts that a distribution ought to be any particular
 * shape. It says what follows from one.
 */

import {
  COST_OF_LIVING_ENERGY_WEIGHT,
  COST_OF_LIVING_HOUSING_WEIGHT,
  DISPOSABLE_ADJUST_RATE,
  HOUSING_BURDEN_CEILING,
  HOUSING_BURDEN_FLOOR,
  HOUSING_ADJUST_RATE,
  HOUSING_SHORTAGE_WEIGHT,
  INCOME_SHARE_DRIFT,
  MOBILITY_EDUCATION_WEIGHT,
  MOBILITY_HOUSING_WEIGHT,
  MOBILITY_START,
  MOBILITY_WEALTH_WEIGHT,
  POVERTY_LINE_SHARE,
  SAVINGS_ADJUST_RATE,
  SQUEEZE_GAP,
  TENURE_DRIFT,
  TURNS_PER_YEAR,
  WEALTH_SHARE_DRIFT,
} from '../balance.ts';
import {
  CLASS_KEYS,
  CLASS_TEMPLATES,
  TAX_INCIDENCE,
  findClass,
  type ClassKey,
} from '../content/classes.ts';
import { TAX_TEMPLATES } from '../content/taxes.ts';
import { buildTaxCode } from './taxation.ts';
import type { ClassBand, Economy, Society, TaxCode } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where a band sits in the order, -0.5 at the bottom to +0.5 at the top. */
function rankOf(key: ClassKey): number {
  return CLASS_KEYS.indexOf(key) / (CLASS_KEYS.length - 1) - 0.5;
}

/** Transfers as a share of output in the arrangements every country opens with. */
export const OPENING_TRANSFER_SHARE = 12;

/** Normalise a set of shares so they sum to one. */
function normalise(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 1 / values.length);
  return values.map((v) => v / total);
}

/* ------------------------------------------------------------------ *
 * Opening the books
 * ------------------------------------------------------------------ */

/**
 * The distribution a country opens with.
 *
 * `inequality` tilts the shares toward or away from the top and is the
 * only thing that differs between countries here. It is applied as a
 * rotation about the middle of the order — the top gains what the bottom
 * loses — so every band still sums to one and a country that is twice as
 * unequal has not acquired any extra money from anywhere.
 */
export function buildSociety(inequality = 1): Society {
  const tilt = (base: number[], strength: number): number[] => {
    const tilted = base.map((v, i) => {
      const rank = i / (base.length - 1) - 0.5;
      return Math.max(0.0005, v * (1 + (inequality - 1) * rank * strength));
    });
    return normalise(tilted);
  };

  /* Net worth is tilted harder than income, because the gap between a
     country's rich and poor is always wider in holdings than in earnings
     and widens faster along the ranking. */
  const incomes = tilt(CLASS_TEMPLATES.map((t) => t.incomeShare), 2.2);
  const wealths = tilt(CLASS_TEMPLATES.map((t) => t.wealthShare), 3.4);

  const bands: ClassBand[] = CLASS_TEMPLATES.map((t, i) => ({
    key: t.key,
    households: t.households,
    incomeShare: incomes[i]!,
    wealthShare: wealths[i]!,
    tenure: { ...t.tenure },
    debtToIncome: t.debtToIncome,
    savingsRate: t.savingsRate,
    /* Indexed, so week one reads 100 everywhere and every later number is
       a statement about what this government did. */
    disposableIndex: 100,
  }));

  return {
    bands,
    inequality,
    highNetWorthPerThousand: 3.4 * inequality,
    incomeGini: gini(bands.map((b) => b.households), bands.map((b) => b.incomeShare)),
    wealthGini: gini(bands.map((b) => b.households), bands.map((b) => b.wealthShare)),
    povertyRate: povertyFrom(bands),
    socialMobility: clamp(MOBILITY_START / inequality, 4, 55),
    inheritedWealthShare: clamp(38 * inequality, 10, 85),
    costOfLiving: 100,
    basePrices: 100,
    realIncomeIndex: 100,
    housingCostBurden: 24,
    householdDebt: 96,
    householdSavings: 6.2,
    history: [],
  };
}

/**
 * The reference shares a run's bands are measured against.
 *
 * Every target in the step is written as a multiple of where this country
 * started, not of the engine's reference country — otherwise a run in an
 * unequal country would spend two terms being dragged toward the average
 * by nothing in particular.
 */
export function openingShares(inequality = 1): {
  income: Record<ClassKey, number>;
  wealth: Record<ClassKey, number>;
} {
  const opening = buildSociety(inequality);
  const income = {} as Record<ClassKey, number>;
  const wealth = {} as Record<ClassKey, number>;
  for (const band of opening.bands) {
    income[band.key] = band.incomeShare;
    wealth[band.key] = band.wealthShare;
  }
  return { income, wealth };
}

/* ------------------------------------------------------------------ *
 * Reading the distribution
 * ------------------------------------------------------------------ */

/**
 * The Gini coefficient of a distribution given as population and value shares.
 *
 * The standard Brown formula over the Lorenz curve, computed on the bands
 * from poorest to richest. Zero is everybody identical; one is one
 * household holding everything. Real countries sit between about 0.24 and
 * 0.63 and both ends of that range are governed by somebody.
 */
export function gini(populationShares: number[], valueShares: number[]): number {
  const pop = normalise(populationShares);
  const val = normalise(valueShares);
  let cumPop = 0;
  let cumVal = 0;
  let area = 0;
  for (let i = 0; i < pop.length; i += 1) {
    const nextPop = cumPop + pop[i]!;
    const nextVal = cumVal + val[i]!;
    area += (nextPop - cumPop) * (nextVal + cumVal);
    cumPop = nextPop;
    cumVal = nextVal;
  }
  return clamp(1 - area, 0, 1);
}

/**
 * Income deciles, interpolated from the bands.
 *
 * Nobody governs in deciles, but every statistical office publishes them
 * and the opposition will quote them, so the engine can produce them.
 */
export function deciles(bands: readonly ClassBand[]): number[] {
  const out: number[] = [];
  for (let d = 0; d < 10; d += 1) {
    const from = d / 10;
    const to = (d + 1) / 10;
    let cum = 0;
    let share = 0;
    for (const band of bands) {
      const start = cum;
      const end = cum + band.households;
      const overlap = Math.max(0, Math.min(to, end) - Math.max(from, start));
      if (overlap > 0 && band.households > 0) {
        share += band.incomeShare * (overlap / band.households);
      }
      cum = end;
    }
    out.push(share);
  }
  return normalise(out);
}

/** The ratio of the top tenth's income to the bottom tenth's. */
export function decileRatio(bands: readonly ClassBand[]): number {
  const d = deciles(bands);
  const bottom = d[0]!;
  const top = d[9]!;
  return bottom > 0 ? top / bottom : Infinity;
}

/**
 * Households below sixty per cent of median disposable income, %.
 *
 * The relative definition, which is the one that is actually used and the
 * one with the property that matters for play: it does not fall because
 * everybody got poorer together.
 */
/**
 * The income of a typical household in each band, and the spread around it.
 *
 * A band is not a point. Its households run from roughly the midpoint
 * between it and the band below to the midpoint between it and the band
 * above, which is enough structure to make every threshold question — the
 * poverty line, a tax band, a benefit taper — a smooth one. Without it the
 * poverty rate would move in twenty-point steps as a whole band crossed,
 * and no poverty rate has ever done that.
 */
function bandRanges(
  bands: readonly ClassBand[],
): { mean: number; low: number; high: number }[] {
  const mean = bands.map((b) =>
    b.households > 0 ? (b.incomeShare * b.disposableIndex) / b.households : 0,
  );
  return mean.map((m, i) => {
    const below = mean[i - 1];
    const above = mean[i + 1];
    return {
      mean: m,
      /* The bottom band's floor and the top band's ceiling have no
         neighbour to split the difference with, so they are set from the
         band's own mean: a long thin tail downward, a longer one upward. */
      low: below === undefined ? m * 0.55 : (below + m) / 2,
      high: above === undefined ? m * 1.9 : (m + above) / 2,
    };
  });
}

/** Disposable income at a given percentile of households. */
export function incomeAtPercentile(bands: readonly ClassBand[], percentile: number): number {
  const ranges = bandRanges(bands);
  let cum = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i]!;
    const next = cum + band.households;
    if (percentile <= next || i === bands.length - 1) {
      const within = band.households > 0 ? (percentile - cum) / band.households : 0;
      const r = ranges[i]!;
      return r.low + clamp(within, 0, 1) * (r.high - r.low);
    }
    cum = next;
  }
  return ranges[ranges.length - 1]!.mean;
}

/**
 * Households below sixty per cent of median disposable income, %.
 *
 * The relative definition, which is the one statistical offices use and the
 * one with the property that matters for play: it does not fall because
 * everybody got poorer together. A government can lift every household in
 * the country and leave this number exactly where it was.
 */
function povertyFrom(bands: readonly ClassBand[]): number {
  const line = incomeAtPercentile(bands, 0.5) * POVERTY_LINE_SHARE;
  const ranges = bandRanges(bands);

  let below = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i]!;
    const r = ranges[i]!;
    const span = r.high - r.low;
    const share = span > 0 ? clamp((line - r.low) / span, 0, 1) : line >= r.mean ? 1 : 0;
    below += band.households * share;
  }
  return clamp(below * 100, 0, 100);
}

/** The share of households that own, with or without a mortgage, %. */
export function homeownership(bands: readonly ClassBand[]): number {
  return (
    bands.reduce((sum, b) => sum + b.households * (b.tenure.owned + b.tenure.mortgaged), 0) * 100
  );
}

/** The share of households renting, %. */
export function rentingShare(bands: readonly ClassBand[]): number {
  return bands.reduce((sum, b) => sum + b.households * b.tenure.renting, 0) * 100;
}

/** The share of households paying a mortgage, %. */
export function mortgagedShare(bands: readonly ClassBand[]): number {
  return bands.reduce((sum, b) => sum + b.households * b.tenure.mortgaged, 0) * 100;
}

/** A band, by key. */
export function bandOf(society: Society, key: ClassKey): ClassBand {
  const found = society.bands.find((b) => b.key === key);
  if (!found) throw new Error(`society: no band ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * The tax code, landing
 * ------------------------------------------------------------------ */

/**
 * How much of the tax burden each band is carrying, relative to its income.
 *
 * Above one is paying more than its share of income; below one is paying
 * less. Progressivity moves the income tax's own incidence without changing
 * what it raises, which is the distinction the tax screen is built on.
 */
export function burdenByBand(code: TaxCode): Record<ClassKey, number> {
  const weight: Record<ClassKey, number> = {
    lower: 0,
    working: 0,
    middle: 0,
    upper_middle: 0,
    wealthy: 0,
  };

  let total = 0;
  for (const template of TAX_TEMPLATES) {
    const rate = code.rates[template.key];
    /* Weighted by the size of the base the instrument sits on, so a point on the
       sales tax counts for more than a point on the export duty. */
    const size = rate * template.base;
    if (size <= 0) continue;
    const incidence = TAX_INCIDENCE[template.key];
    for (const key of CLASS_KEYS) {
      let landing = incidence[key];
      if (template.key === 'income') {
        /* The one instrument whose shape is itself a decision. At full
           progressivity the top carries about twice what it does at flat,
           and the bottom about half — which is roughly the distance between
           a flat tax and a steeply banded one. */
        const tilt = (code.progressivity - 0.5) * 1.4;
        const rank = CLASS_KEYS.indexOf(key) / (CLASS_KEYS.length - 1) - 0.5;
        landing *= Math.max(0.15, 1 + tilt * rank * 2);
      }
      weight[key] += landing * size;
      total += landing * size;
    }
  }

  const out: Record<ClassKey, number> = {
    lower: 1,
    working: 1,
    middle: 1,
    upper_middle: 1,
    wealthy: 1,
  };
  if (total <= 0) return out;
  for (const key of CLASS_KEYS) {
    const template = findClass(key);
    const shareOfBurden = weight[key] / total;
    out[key] = template.incomeShare > 0 ? shareOfBurden / template.incomeShare : 1;
  }
  return out;
}

/**
 * What each band carried under the arrangements the country inherited.
 *
 * Computed once from the opening code. Every burden in the run is read
 * against this, so a government that changes no tax sees no band move —
 * which is correct, and was not true when the burden was measured against
 * an imaginary proportional code nobody had ever legislated.
 */
export const OPENING_BURDEN: Record<ClassKey, number> = burdenByBand(buildTaxCode());

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface SocietyInputs {
  economy: Economy;
  taxes: TaxCode;
  /**
   * How far housing demand exceeds housing capacity, 1 being balanced.
   * Straight off the infrastructure book, which is where the houses are.
   */
  housingPressure: number;
  /** Education service health, 0–100. What decides whether the bottom moves. */
  educationQuality: number;
  /** Housing service health, 0–100. The other half of mobility. */
  housingQuality: number;
  /** Energy prices relative to the start, 1 being unchanged. */
  energyPrices: number;
  /** Cash transfers as a share of output, %. What a welfare state is. */
  transferShare: number;
  /** Annual population growth, %. Output per head is output minus this. */
  populationGrowth: number;
  turn: number;
}

export interface SocietyTick {
  society: Society;
  /** Bands whose disposable income has just started falling. For the report. */
  squeezed: ClassKey[];
  /** True the week the poverty rate crosses a fifth of the country. */
  povertyAlarm: boolean;
}

/**
 * Advance the distribution by one week.
 *
 * Order matters: prices first, because everything else is measured against
 * them; then the shares, which are the slow part; then what a household
 * actually has left, which is the fast part and the part that is felt.
 */
export function stepSociety(society: Society, inputs: SocietyInputs): SocietyTick {
  const { economy } = inputs;
  const weekly = 1 / TURNS_PER_YEAR;
  /** Move a quantity a fraction of the way toward where it belongs. */
  const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

  /* ---- 1. Prices. ---- */
  /*
   * Two different kinds of thing, kept apart deliberately.
   *
   * The general price level COMPOUNDS, because inflation is a rate: five
   * per cent a year for eight years is a level forty-eight per cent
   * higher. Housing and energy are LEVELS: a housing shortage makes rent a
   * larger share of income and then it stays a larger share. Writing
   * either of those as the other is how a constant becomes a runaway, and
   * it is the single easiest mistake to make in this file.
   */
  const basePrices = society.basePrices * (1 + (economy.inflation * weekly) / 100);

  const housingTarget = clamp(
    24 + (inputs.housingPressure - 1) * HOUSING_SHORTAGE_WEIGHT * 100,
    HOUSING_BURDEN_FLOOR,
    HOUSING_BURDEN_CEILING,
  );
  const housingBurden = toward(society.housingCostBurden, housingTarget, HOUSING_ADJUST_RATE);

  const costOfLiving =
    basePrices *
    (1 +
      ((housingBurden - 24) / 100) * COST_OF_LIVING_HOUSING_WEIGHT +
      (inputs.energyPrices - 1) * COST_OF_LIVING_ENERGY_WEIGHT);

  /* ---- 2. Shares. ---- */
  const burden = burdenByBand(inputs.taxes);
  /*
   * The real rate decides whether holdings grow faster than wages. Cheap
   * money and short housing concentrate net worth; dear money and a tax on
   * holdings disperse it. Neither is a moral claim, and both are slow.
   */
  const realRate = economy.policyRate - economy.inflation;
  const holdingTax =
    (inputs.taxes.rates.wealth +
      inputs.taxes.rates.inheritance +
      inputs.taxes.rates.capital_gains) /
    3;

  /* Where this country started, which is what its targets are relative to. */
  const opening = openingShares(society.inequality);

  const incomeRaw: number[] = [];
  const wealthRaw: number[] = [];
  for (const band of society.bands) {
    const template = findClass(band.key);
    const rank = CLASS_KEYS.indexOf(band.key) / (CLASS_KEYS.length - 1) - 0.5;

    /*
     * A TARGET share, not a push. The distribution settles somewhere given
     * the cycle, the code and the rate environment, and moves toward it.
     * A push would walk one band to everything and the rest to nothing,
     * however small the push was, because a share has nowhere else to go.
     */
    const cycle =
      ((economy.growth - economy.potentialGrowth) * 0.012 -
        (economy.unemployment - 5) * 0.014) *
      (template.cyclicality - 1);
    const capital = -realRate * 0.012 * (template.capitalIncomeShare - 0.14);
    /*
     * MARKET income: what the band earns before the state touches it. The
     * tax code and the transfer system both act further down, on what is
     * left. Counting them here as well charged the bottom band twice for
     * the same sales tax and walked a stationary country into a poverty
     * rate of twenty-two per cent with nobody having decided anything.
     */
    const incomeTarget = opening.income[band.key] * clamp(1 + cycle + capital, 0.45, 1.8);
    incomeRaw.push(Math.max(0.001, toward(band.incomeShare, incomeTarget, INCOME_SHARE_DRIFT)));

    /* Net worth. Asset prices against what the code takes off holdings. */
    const assets = (-realRate * 0.02 + (inputs.housingPressure - 1) * 0.16) * rank;
    const taxed = -holdingTax * 0.55 * rank;
    const wealthTarget = opening.wealth[band.key] * clamp(1 + assets + taxed, 0.4, 2.2);
    wealthRaw.push(Math.max(0.0005, toward(band.wealthShare, wealthTarget, WEALTH_SHARE_DRIFT)));
  }
  const incomeShares = normalise(incomeRaw);
  const wealthShares = normalise(wealthRaw);

  /* ---- 3. What is left. ---- */
  /*
   * Real income per household, indexed to 100. Output per head is the only
   * thing that makes a country better off in aggregate, and it is the base
   * each band's own position is measured against — so a band can lose
   * ground while this rises, which is the distinction the whole
   * distribution exists to draw.
   */
  const realIncomeIndex =
    society.realIncomeIndex * (1 + ((economy.growth - inputs.populationGrowth) * weekly) / 100);

  /*
   * Where every band is heading, before deciding which of them counts as
   * squeezed. That judgement is a comparison rather than a level: an
   * energy shock lowers every household in the country, and a report line
   * that named all five bands every time would be telling the player
   * nothing. What is worth saying is who is falling behind the rest.
   */
  const targets = society.bands.map((band, i) => {
    const template = findClass(band.key);

    /*
     * Four factors multiplying a level: what the band earns before tax,
     * what the code takes, and what the essentials take. Each is a
     * position rather than a decline, so a household settles at a standard
     * of living and stays there until something moves.
     */
    const gross = (incomeShares[i]! / opening.income[band.key]) * realIncomeIndex;
    /*
     * Measured against the code the country opened with, not against a
     * proportional one. The index reads 100 on week one under whatever
     * arrangements were inherited, so every later number is a statement
     * about what THIS government did — which is the only thing the player
     * can be held to.
     */
    const taxFactor = 1 - clamp((burden[band.key] - OPENING_BURDEN[band.key]) * 0.11, -0.25, 0.3);
    /* Transfers, which are the other half of what the state does to a
       household's income and the half that is aimed at the bottom. */
    const transferFactor =
      1 + (inputs.transferShare - OPENING_TRANSFER_SHARE) * 0.006 * -rankOf(band.key);
    const essentialsFactor = clamp(
      1 -
        (((housingBurden - 24) / 100) * template.essentialsShare * 1.6 +
          (inputs.energyPrices - 1) * template.essentialsShare * 0.3),
      0.45,
      1.3,
    );

    return gross * taxFactor * transferFactor * essentialsFactor;
  });

  /* What is happening to the country, as one number: the change a
     population-weighted household is seeing. */
  const nationalChange = society.bands.reduce(
    (sum, band, i) =>
      sum + band.households * ((targets[i]! - band.disposableIndex) / band.disposableIndex) * 100,
    0,
  );

  const squeezed: ClassKey[] = [];
  const bands: ClassBand[] = society.bands.map((band, i) => {
    const template = findClass(band.key);
    const target = targets[i]!;

    const change = ((target - band.disposableIndex) / band.disposableIndex) * 100;
    /* Falling, and falling faster than the country. Both halves matter: in
       a boom that lifts everybody unevenly nobody is being squeezed. */
    if (change < 0 && change < nationalChange - SQUEEZE_GAP) squeezed.push(band.key);

    const disposableIndex = Math.max(
      20,
      toward(band.disposableIndex, target, DISPOSABLE_ADJUST_RATE),
    );

    /*
     * Tenure. Ownership falls when houses cost more than incomes carry,
     * and the households that stop owning become the households that rent.
     * A decade of this is how a country's politics changes shape without
     * anybody legislating for it — slowly, and against a floor, because
     * somebody always owns.
     */
    const pressure = clamp((inputs.housingPressure - 1) * 0.8, -0.3, 0.4);
    const mortgaged = toward(
      band.tenure.mortgaged,
      clamp(template.tenure.mortgaged * (1 - pressure), 0, 0.95),
      TENURE_DRIFT,
    );
    const owned = toward(
      band.tenure.owned,
      clamp(template.tenure.owned * (1 - pressure * 0.3), 0, 0.95),
      TENURE_DRIFT,
    );
    const renting = clamp(1 - mortgaged - owned, 0, 1);

    /* Debt against the price of a house, discouraged by the price of money. */
    const debtToIncome = toward(
      band.debtToIncome,
      clamp(
        template.debtToIncome * (1 + (inputs.housingPressure - 1) * 0.6 - realRate * 0.035),
        0.1,
        6,
      ),
      0.01,
    );

    /* Saving is the shock absorber: the first thing a squeeze takes and
       the last thing a recovery returns. */
    const savingsRate = clamp(
      toward(
        band.savingsRate,
        template.savingsRate -
          (100 - disposableIndex) * 0.2 -
          (housingBurden - 24) * 0.25 * template.essentialsShare,
        SAVINGS_ADJUST_RATE,
      ),
      -14,
      45,
    );

    return {
      key: band.key,
      households: band.households,
      incomeShare: incomeShares[i]!,
      wealthShare: wealthShares[i]!,
      tenure: { owned, mortgaged, renting },
      debtToIncome,
      savingsRate,
      disposableIndex,
    };
  });

  /* ---- 4. The figures that get quoted. ---- */
  const incomeGini = gini(bands.map((b) => b.households), bands.map((b) => b.incomeShare));
  const wealthGini = gini(bands.map((b) => b.households), bands.map((b) => b.wealthShare));
  const povertyRate = povertyFrom(bands);

  /*
   * Mobility. Schools and housing are what let a household move; a
   * concentrated stock of net worth is what stops them, because past a
   * certain gap the thing being competed for is a deposit, and deposits
   * are priced off the stock of wealth rather than the flow of income.
   * All three are slow, and a government that fixes the first two will not
   * see this number move before the election.
   */
  /* This country's own starting concentration, which is the level its
     mobility was calibrated against. */
  const openingWealthGini = gini(
    CLASS_TEMPLATES.map((t) => t.households),
    CLASS_KEYS.map((k) => opening.wealth[k]),
  );
  const socialMobility = clamp(
    toward(
      society.socialMobility,
      MOBILITY_START +
        (inputs.educationQuality - 60) * MOBILITY_EDUCATION_WEIGHT +
        (inputs.housingQuality - 60) * MOBILITY_HOUSING_WEIGHT -
        (wealthGini - openingWealthGini) * 100 * MOBILITY_WEALTH_WEIGHT,
      0.004,
    ),
    2,
    60,
  );

  const householdDebt = bands.reduce((sum, b) => sum + b.debtToIncome * b.incomeShare * 100, 0);
  const householdSavings = bands.reduce((sum, b) => sum + b.savingsRate * b.incomeShare, 0);
  const inheritedWealthShare = clamp(
    toward(
      society.inheritedWealthShare,
      38 * society.inequality + (wealthGini - openingWealthGini) * 110 -
        inputs.taxes.rates.inheritance * 45,
      0.006,
    ),
    10,
    85,
  );
  /*
   * The very top of the top band, per thousand households — the unit it is
   * reported in. It tracks the wealth share rather than the economy, and
   * the two come apart, which is the point of counting it separately.
   */
  const wealthy = bands.find((b) => b.key === 'wealthy')!;
  const highNetWorthPerThousand = clamp(
    (wealthy.wealthShare / opening.wealth.wealthy) *
      3.4 *
      society.inequality *
      (1 + (wealthGini - openingWealthGini) * 1.2),
    0.2,
    40,
  );

  const next: Society = {
    bands,
    inequality: society.inequality,
    highNetWorthPerThousand,
    incomeGini,
    wealthGini,
    povertyRate,
    socialMobility,
    inheritedWealthShare,
    costOfLiving,
    basePrices,
    realIncomeIndex,
    housingCostBurden: housingBurden,
    householdDebt,
    householdSavings,
    history: [
      ...society.history,
      {
        turn: inputs.turn,
        incomeGini,
        wealthGini,
        povertyRate,
        costOfLiving,
        lowerDisposable: bands[0]!.disposableIndex,
        medianDisposable: bands[2]!.disposableIndex,
      },
    ].slice(-208),
  };

  return {
    society: next,
    squeezed,
    povertyAlarm: povertyRate >= 20 && society.povertyRate < 20,
  };
}

/**
 * One line on the state of the distribution.
 *
 * Written from the numbers rather than from a judgement about them: it
 * reports which way things moved and for whom, and leaves what to do about
 * it to the person whose job that is.
 */
export function describeSociety(society: Society): string {
  const lower = bandOf(society, 'lower');
  const wealthy = bandOf(society, 'wealthy');
  const squeeze = lower.disposableIndex < 98;
  const concentrating = society.wealthGini > 0.65;

  if (squeeze && concentrating) {
    return `The bottom fifth has ${(100 - lower.disposableIndex).toFixed(1)}% less to spend than at the start of the run, while the top eighth holds ${(wealthy.wealthShare * 100).toFixed(0)}% of the country's net worth. Both of those numbers will be quoted at you, usually in the same sentence.`;
  }
  if (squeeze) {
    return `Disposable income is falling at the bottom — ${(100 - lower.disposableIndex).toFixed(1)}% down — with housing taking ${society.housingCostBurden.toFixed(0)}% of a typical household's income.`;
  }
  if (concentrating) {
    return `Living standards are holding, but net worth is concentrating: a wealth Gini of ${society.wealthGini.toFixed(2)} against an income Gini of ${society.incomeGini.toFixed(2)}. The gap between those two is what people mean when they say the figures do not match the mood.`;
  }
  if (society.povertyRate < 14 && society.socialMobility > 28) {
    return `A comparatively even country: ${society.povertyRate.toFixed(0)}% below the poverty line and a bottom-to-top mobility rate of ${society.socialMobility.toFixed(0)}%. It took somebody a long time to build and can be spent quickly.`;
  }
  return `Income Gini ${society.incomeGini.toFixed(2)}, wealth Gini ${society.wealthGini.toFixed(2)}, ${society.povertyRate.toFixed(0)}% in relative poverty, housing taking ${society.housingCostBurden.toFixed(0)}% of income.`;
}
