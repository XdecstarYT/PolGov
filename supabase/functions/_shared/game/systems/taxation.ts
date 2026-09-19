/**
 * taxation.ts — raising the money.
 *
 * The decision this module is built around is not how much to tax. It is who
 * to tax, and what they will do about it. Every instrument has a base that
 * shrinks as its rate rises, a set of voter segments that actually bear it,
 * and an effect on the economy beyond the money it brings in — so the
 * question a player is answering at the tax panel is a distributional one
 * with an efficiency cost attached, which is the question real budgets are.
 *
 * Three properties the design depends on:
 *
 *   · Every instrument has a revenue peak, and the peak is shown. Pushing a
 *     rate past it collects LESS money, and the game does not punish that
 *     with a rule or a warning — it simply pays out less, and the panel told
 *     you where the peak was. A player who taxes capital into the ground has
 *     made a legible mistake rather than hit a hidden wall.
 *
 *   · Incidence lands on named segments, and those segments are the same
 *     ones the electorate model turns into seats. There is no abstract
 *     "unpopularity" term: a fuel tax annoys rural households and farmers,
 *     specifically, and they are a particular number of votes in particular
 *     regions.
 *
 *   · Nothing here has an opinion about the right level of tax. Every rate
 *     raises real money and imposes a real cost on real people, and the game
 *     never indicates which trade the player ought to prefer.
 */

import {
  NON_TAX_RECEIPTS_SHARE,
  TAX_TEMPLATES,
  findTaxTemplate,
  type TaxKey,
  type TaxTemplate,
} from '../content/taxes.ts';
import {
  INCOME_TAX_CREDIT_MAX,
  INCOME_TAX_DEDUCTION_MAX,
  TAX_CHANGE_MEMORY_MONTHS,
  TAX_PROGRESSIVITY_SHIFT,
  TURNS_PER_YEAR,
} from '../balance.ts';
import type { SegmentKey } from '../content/segments.ts';
import type { SectorKey, TaxCode } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * The code a government inherits
 * ------------------------------------------------------------------ */

export function buildTaxCode(): TaxCode {
  return {
    rates: Object.fromEntries(TAX_TEMPLATES.map((t) => [t.key, t.defaultRate])) as Record<
      TaxKey,
      number
    >,
    progressivity: 0.5,
    deductions: 0.35,
    credits: 0.3,
    recentChanges: [],
  };
}

/* ------------------------------------------------------------------ *
 * Yield
 * ------------------------------------------------------------------ */

/**
 * How much of the base survives at a given rate.
 *
 * Linear shrinkage, floored at nothing: `1 − elasticity·rate`. Simple on
 * purpose — the player has to be able to see where the peak is and reason
 * about it, and a curve with more parameters would be more realistic and
 * less legible without changing a single decision.
 */
export function baseSurviving(template: TaxTemplate, rate: number): number {
  return Math.max(0, 1 - template.elasticity * rate);
}

/**
 * The rate at which this instrument raises the most money.
 *
 * Revenue is base·r·(1 − e·r), which peaks at r = 1/(2e). Shown on the panel,
 * so that going past it is a choice rather than a trap. Capped at the
 * instrument's legal maximum, because some instruments cannot legally reach
 * their own peak and it would be misleading to print a rate you cannot set.
 */
export function revenuePeak(template: TaxTemplate): number {
  return Math.min(template.maxRate, 1 / (2 * template.elasticity));
}

/** Annual yield of one instrument, ₡bn. */
export function instrumentYield(template: TaxTemplate, rate: number, gdp: number): number {
  const r = clamp(rate, 0, template.maxRate);
  return gdp * template.base * r * baseSurviving(template, r);
}

/** Is this instrument past the point where raising it collects more? */
export function isPastPeak(template: TaxTemplate, rate: number): boolean {
  return rate > revenuePeak(template) + 1e-9;
}

/**
 * The income tax reliefs, as a multiplier on its yield.
 *
 * Deductions narrow the base and credits are paid straight back out, so both
 * cost money; progressivity does not, by itself, change the total — it
 * changes who pays it, which is handled in `incidenceBySegment`. Keeping the
 * three dials separate means a government can make the income tax fairer
 * without making it smaller, or smaller without making it fairer, and has to
 * choose which it is doing.
 */
export function incomeReliefFactor(code: TaxCode): number {
  const fromDeductions = code.deductions * INCOME_TAX_DEDUCTION_MAX;
  const fromCredits = code.credits * INCOME_TAX_CREDIT_MAX;
  return Math.max(0.3, 1 - fromDeductions - fromCredits);
}

/** Total government receipts for one turn, ₡bn. */
export function turnReceipts(code: TaxCode, gdp: number): number {
  let annual = gdp * NON_TAX_RECEIPTS_SHARE;
  for (const template of TAX_TEMPLATES) {
    const raw = instrumentYield(template, code.rates[template.key], gdp);
    annual += template.key === 'income' ? raw * incomeReliefFactor(code) : raw;
  }
  return annual / TURNS_PER_YEAR;
}

/** Every instrument's contribution this turn, largest first. */
export function receiptsBreakdown(
  code: TaxCode,
  gdp: number,
): { template: TaxTemplate; rate: number; perTurn: number; pastPeak: boolean }[] {
  return TAX_TEMPLATES.map((template) => {
    const rate = code.rates[template.key];
    const raw = instrumentYield(template, rate, gdp);
    const perTurn =
      (template.key === 'income' ? raw * incomeReliefFactor(code) : raw) / TURNS_PER_YEAR;
    return { template, rate, perTurn, pastPeak: isPastPeak(template, rate) };
  }).sort((a, b) => b.perTurn - a.perTurn);
}

/**
 * What one more point on this instrument would actually raise, ₡bn a month.
 *
 * Marginal rather than average, so the panel can tell a player that the next
 * point of corporate tax is worth a third of what the last one was — which
 * is the information that makes an elasticity mean something.
 */
export function marginalYield(template: TaxTemplate, rate: number, gdp: number): number {
  const step = 0.01;
  const up = Math.min(template.maxRate, rate + step);
  return (
    (instrumentYield(template, up, gdp) - instrumentYield(template, rate, gdp)) / TURNS_PER_YEAR
  );
}

/* ------------------------------------------------------------------ *
 * Who pays
 * ------------------------------------------------------------------ */

/**
 * The tax burden each voter segment is carrying, relative to the code it
 * inherited.
 *
 * Zero means "exactly what they were paying when this government took
 * office". Positive means this government has raised their taxes. That
 * framing is deliberate: voters do not judge a tax system against an
 * abstract optimum, they judge it against what they were paying before.
 *
 * Income tax progressivity moves burden between the top and the bottom
 * without changing the total, which is why it appears here as a shift and
 * nowhere in the yield.
 */
export function incidenceBySegment(code: TaxCode, gdp: number): Partial<Record<SegmentKey, number>> {
  const out: Partial<Record<SegmentKey, number>> = {};

  for (const template of TAX_TEMPLATES) {
    const rate = code.rates[template.key];
    const delta = rate - template.defaultRate;
    if (Math.abs(delta) < 1e-9) continue;

    /* Weighted by how much money the instrument moves, so a point on the
       GST matters far more than a point on the export tax. */
    const scale = (template.base * delta * gdp) / 100;
    for (const [segment, weight] of Object.entries(template.incidence)) {
      out[segment as SegmentKey] = (out[segment as SegmentKey] ?? 0) + scale * weight;
    }
  }

  /* Progressivity: the same money, collected from different people. */
  const shift = (code.progressivity - 0.5) * TAX_PROGRESSIVITY_SHIFT;
  if (Math.abs(shift) > 1e-9) {
    const up: SegmentKey[] = ['high_income', 'professionals', 'business_owners'];
    const down: SegmentKey[] = ['low_income', 'young_renters', 'students', 'non_graduates'];
    for (const key of up) out[key] = (out[key] ?? 0) + shift;
    for (const key of down) out[key] = (out[key] ?? 0) - shift;
  }

  /* Credits are money handed to the people with the least of it. */
  const credit = (code.credits - 0.3) * TAX_PROGRESSIVITY_SHIFT;
  if (Math.abs(credit) > 1e-9) {
    for (const key of ['low_income', 'young_renters', 'retirees'] as SegmentKey[]) {
      out[key] = (out[key] ?? 0) - credit;
    }
  }

  /* Deductions are worth most to whoever has the most to deduct. */
  const deduction = (code.deductions - 0.35) * TAX_PROGRESSIVITY_SHIFT;
  if (Math.abs(deduction) > 1e-9) {
    for (const key of ['high_income', 'homeowners', 'business_owners'] as SegmentKey[]) {
      out[key] = (out[key] ?? 0) - deduction;
    }
  }

  return out;
}

/**
 * The headline "tax burden" the electorate scores, 0–100, where 50 is the
 * code as inherited.
 *
 * Note the sign: a HIGHER score is a lighter burden, because that is the
 * direction every other issue score runs in and an issue that ran the other
 * way would quietly invert every segment weight that reads it.
 */
export function taxBurdenScore(code: TaxCode, gdp: number): number {
  const inherited = turnReceipts(buildTaxCode(), gdp);
  const now = turnReceipts(code, gdp);
  const delta = inherited > 0 ? (now - inherited) / inherited : 0;
  return clamp(66 - delta * 130, 0, 100);
}

/* ------------------------------------------------------------------ *
 * What tax does besides raise money
 * ------------------------------------------------------------------ */

export interface TaxEffects {
  /** Added to the business investment share. */
  investment: number;
  /** Added to household consumption, as a share of income. */
  consumption: number;
  /** Added to annual inflation. */
  prices: number;
  /** Added to each sector's equilibrium health. */
  sectors: Partial<Record<SectorKey, number>>;
}

/**
 * The economic consequences of the code, relative to the one inherited.
 *
 * A carbon price that raises no money because nobody is emitting any more is
 * not a failed tax — it is a tax that worked. The environment effect here is
 * what makes that legible rather than reading as a revenue hole.
 */
export function taxEffects(code: TaxCode): TaxEffects {
  const out: TaxEffects = { investment: 0, consumption: 0, prices: 0, sectors: {} };

  for (const template of TAX_TEMPLATES) {
    if (!template.effect) continue;
    const delta = (code.rates[template.key] - template.defaultRate) * 100;
    if (Math.abs(delta) < 1e-9) continue;

    out.investment += (template.effect.investment ?? 0) * delta * 0.01;
    out.consumption += (template.effect.consumption ?? 0) * delta * 0.01;
    out.prices += (template.effect.prices ?? 0) * delta * 0.01;
    for (const [sector, value] of Object.entries(template.effect.sector ?? {})) {
      const key = sector as SectorKey;
      out.sectors[key] = (out.sectors[key] ?? 0) + value * delta * 0.1;
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Changing the code
 * ------------------------------------------------------------------ */

/**
 * Record a rate change so the political cost of it can decay.
 *
 * A tax rise is not resented forever — it is resented sharply and then it
 * becomes the rate, and the next government inherits it as normal. Keeping a
 * memory of recent changes is what lets a player raise something unpopular
 * early in a term and have it stop costing them by the election, which is a
 * real and entirely cynical strategy the game should permit.
 */
export function recordChange(code: TaxCode, key: TaxKey, from: number, to: number, turn: number): TaxCode {
  return {
    ...code,
    recentChanges: [
      ...code.recentChanges.filter((c) => turn - c.turn < TAX_CHANGE_MEMORY_MONTHS),
      { key, from, to, turn },
    ],
  };
}

/** Age the memory of recent changes by a month. */
export function forgetOldChanges(code: TaxCode, turn: number): TaxCode {
  const kept = code.recentChanges.filter((c) => turn - c.turn < TAX_CHANGE_MEMORY_MONTHS);
  return kept.length === code.recentChanges.length ? code : { ...code, recentChanges: kept };
}

/**
 * How raw a recent change still feels, 0–1.
 *
 * One when it has just happened, nothing once it is older than the memory
 * window. This multiplies the political cost, not the revenue — the money
 * keeps coming in long after anybody stops being angry about it.
 */
export function changeRawness(code: TaxCode, key: TaxKey, turn: number): number {
  const recent = code.recentChanges.filter((c) => c.key === key);
  if (recent.length === 0) return 0;
  const newest = recent.reduce((a, b) => (b.turn > a.turn ? b : a));
  const age = turn - newest.turn;
  return clamp(1 - age / TAX_CHANGE_MEMORY_MONTHS, 0, 1);
}

export { TAX_TEMPLATES, findTaxTemplate };
export type { TaxKey, TaxTemplate };
