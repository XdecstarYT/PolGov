/**
 * industry.ts — what the economy is made of, and where it is.
 *
 * The purpose of this module is to make a national decision land unevenly.
 * A rate rise is one number; construction and real estate feel it four times
 * harder than healthcare does, and construction and real estate are not
 * evenly spread across the country. So a decision taken in the capital
 * arrives as a job loss in Estmoor and nowhere else, and Estmoor votes.
 *
 * That chain — policy → industry → region → jobs → votes — is the whole
 * reason industries exist here rather than being folded into a single GDP
 * figure. Nothing in this file is decoration; each industry is a different
 * set of people who will be angry about a different decision.
 *
 * Two deliberate asymmetries worth knowing about:
 *
 *   · Output share and employment share are different numbers. Mining is a
 *     sixteenth of output and a sixtieth of the jobs; retail is the reverse.
 *     That gap is why resource regions are simultaneously wealthy and
 *     politically aggrieved, and it falls straight out of the data rather
 *     than needing a special case.
 *
 *   · Publicly funded industries barely move with the cycle and move a great
 *     deal with the budget. A government cutting health spending in a boom
 *     is laying people off into a labour market that will absorb them; one
 *     doing it in a slump is not.
 */

import {
  INDUSTRY_TEMPLATES,
  findIndustry,
  type IndustryKey,
  type IndustryTemplate,
} from '../content/industries.ts';
import {
  INDUSTRY_ADJUST_RATE,
  INDUSTRY_PUBLIC_FUNDING_WEIGHT,
  INDUSTRY_UNCOUNTED_EMPLOYMENT,
  NEUTRAL_REAL_RATE,
} from '../balance.ts';
import { findTaxTemplate } from '../content/taxes.ts';
import type { Economy, IndustryState, Sector, TaxCode } from '../types.ts';
import { findSector } from './budget.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Starting state
 * ------------------------------------------------------------------ */

/** Every industry at its baseline: exactly the share the template names. */
export function buildIndustries(): IndustryState[] {
  return INDUSTRY_TEMPLATES.map((template) => ({
    key: template.key,
    /** 100 = performing exactly as its share of the economy implies. */
    health: 100,
    outputShare: template.outputShare,
    employmentShare: template.employmentShare,
  }));
}

/* ------------------------------------------------------------------ *
 * What each industry is being done to
 * ------------------------------------------------------------------ */

export interface IndustryPressure {
  key: IndustryKey;
  /** The health this industry is heading toward. */
  target: number;
  /** Named, signed reasons, largest first. Shown verbatim on the panel. */
  reasons: { label: string; value: number }[];
}

/**
 * The health each industry is being pushed toward, and why.
 *
 * Every term is named and signed, so an industry in trouble can always be
 * traced to the decisions that put it there — including the ones taken by a
 * previous government, and the ones taken by the central bank, which the
 * player does not control and will be blamed for anyway.
 */
export function industryPressure(
  industry: IndustryState,
  economy: Economy,
  taxes: TaxCode,
  sectors: readonly Sector[],
): IndustryPressure {
  const template = findIndustry(industry.key);
  const reasons: { label: string; value: number }[] = [];

  /* Rates. The single biggest thing separating construction from healthcare. */
  const realRate = economy.policyRate - economy.inflationExpectation;
  const rateTerm = -(realRate - NEUTRAL_REAL_RATE) * template.rateSensitivity * 3;
  if (Math.abs(rateTerm) > 0.05) {
    reasons.push({ label: 'Cost of borrowing', value: rateTerm });
  }

  /* The cycle, amplified or damped by how cyclical the industry is. */
  const cycleTerm = economy.outputGap * template.cyclicality * 2.2;
  if (Math.abs(cycleTerm) > 0.05) reasons.push({ label: 'The cycle', value: cycleTerm });

  /* The carbon price, which is meant to hurt some of these. */
  const carbonDelta = (taxes.rates.carbon - findTaxTemplate('carbon').defaultRate) * 100;
  const carbonTerm = -carbonDelta * template.carbonSensitivity * 0.5;
  if (Math.abs(carbonTerm) > 0.05) reasons.push({ label: 'Carbon price', value: carbonTerm });

  /* Tariffs, which shelter some industries at the expense of others. */
  const tariffDelta =
    (taxes.rates.import_tariff - findTaxTemplate('import_tariff').defaultRate) * 100;
  const tariffTerm = tariffDelta * template.tariffSensitivity * 0.7;
  if (Math.abs(tariffTerm) > 0.05) reasons.push({ label: 'Import tariffs', value: tariffTerm });

  /* The public sector this industry stands on. */
  if (template.supports) {
    const health = findSector(sectors, template.supports).health;
    const supportTerm = (health - 60) * 0.35;
    if (Math.abs(supportTerm) > 0.05) {
      reasons.push({ label: `Public ${template.supports}`, value: supportTerm });
    }
  }

  /* Publicly funded industries move with the budget, not the market. */
  if (template.publiclyFunded && template.supports) {
    const funding = findSector(sectors, template.supports).funding;
    const fundingTerm = (funding - 24) * INDUSTRY_PUBLIC_FUNDING_WEIGHT;
    if (Math.abs(fundingTerm) > 0.05) {
      reasons.push({ label: 'Government orders', value: fundingTerm });
    }
  }

  const target = clamp(
    100 + reasons.reduce((sum, r) => sum + r.value, 0),
    10,
    190,
  );
  reasons.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { key: industry.key, target, reasons };
}

/* ------------------------------------------------------------------ *
 * The month
 * ------------------------------------------------------------------ */

/**
 * Advance every industry by a month.
 *
 * Industries move slowly: a factory does not close because rates went up
 * last Tuesday. The adjustment rate is deliberately low, which means a
 * government usually inherits the industrial consequences of the previous
 * one's decisions and hands its own to the next.
 */
export function stepIndustries(
  industries: readonly IndustryState[],
  economy: Economy,
  taxes: TaxCode,
  sectors: readonly Sector[],
): IndustryState[] {
  return industries.map((industry) => {
    const template = findIndustry(industry.key);
    const { target } = industryPressure(industry, economy, taxes, sectors);
    const health = industry.health + (target - industry.health) * INDUSTRY_ADJUST_RATE;

    /* An industry's share of output and of jobs both follow its health, but
       jobs lag: firms cut hours and hoard skilled staff long before they cut
       headcount, and rehire later than they recover. */
    return {
      key: industry.key,
      health,
      outputShare: template.outputShare * (health / 100),
      employmentShare:
        industry.employmentShare +
        (template.employmentShare * (health / 100) - industry.employmentShare) * 0.5,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Aggregates
 * ------------------------------------------------------------------ */

/**
 * What the industry mix does to national output, as a multiplier.
 *
 * One when every industry is exactly at its baseline. This is how the
 * industrial detail reaches the macro model: it is not a second, competing
 * account of GDP, it is a correction to the one that already exists.
 */
export function outputMultiplier(industries: readonly IndustryState[]): number {
  const total = industries.reduce((sum, i) => sum + i.outputShare, 0);
  return total;
}

/**
 * Employment, by region, relative to normal.
 *
 * Zero means a region's industries are employing exactly as many people as
 * they normally would. Negative is a regional jobs problem — which is a
 * regional political problem, and the reason any of this is modelled.
 */
export function regionalEmployment(
  industries: readonly IndustryState[],
): Record<string, number> {
  const weightByRegion: Record<string, number> = {};
  const shortfallByRegion: Record<string, number> = {};

  for (const industry of industries) {
    const template = findIndustry(industry.key);
    for (const [region, weight] of Object.entries(template.regions)) {
      const mass = weight * template.employmentShare;
      weightByRegion[region] = (weightByRegion[region] ?? 0) + mass;
      shortfallByRegion[region] =
        (shortfallByRegion[region] ?? 0) + mass * (industry.health - 100);
    }
  }

  const out: Record<string, number> = {};
  for (const region of Object.keys(weightByRegion)) {
    const weight = weightByRegion[region]!;
    out[region] = weight > 0 ? shortfallByRegion[region]! / weight : 0;
  }
  return out;
}

/**
 * Total employment relative to normal, in points.
 *
 * Feeds the unemployment rate on top of what Okun's law already says, so a
 * downturn concentrated in labour-intensive industries costs more jobs than
 * the same downturn in mining — which is true, and which a single output gap
 * could not express.
 */
export function employmentGap(industries: readonly IndustryState[]): number {
  const employed = industries.reduce(
    (sum, i) => sum + i.employmentShare,
    INDUSTRY_UNCOUNTED_EMPLOYMENT,
  );
  const normal =
    INDUSTRY_TEMPLATES.reduce((sum, t) => sum + t.employmentShare, 0) +
    INDUSTRY_UNCOUNTED_EMPLOYMENT;
  return ((employed - normal) / normal) * 100;
}

/** The industries in most and least trouble, for the briefing. */
export function industryExtremes(industries: readonly IndustryState[], count = 3) {
  const sorted = [...industries].sort((a, b) => a.health - b.health);
  return {
    struggling: sorted.slice(0, count).filter((i) => i.health < 97),
    thriving: sorted.slice(-count).reverse().filter((i) => i.health > 103),
  };
}

/** Largest industries by current output, for the panel. */
export function byOutput(industries: readonly IndustryState[]): IndustryState[] {
  return [...industries].sort((a, b) => b.outputShare - a.outputShare);
}

export { INDUSTRY_TEMPLATES, findIndustry };
export type { IndustryKey, IndustryTemplate };
