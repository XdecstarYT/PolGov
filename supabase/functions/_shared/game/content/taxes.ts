/**
 * taxes.ts — the twenty instruments a government actually has.
 *
 * A single "tax level" slider is the most common way a political game gets
 * this wrong. It makes taxation a volume knob with one trade-off — more money
 * against less popularity — when the real decision is almost never how much
 * to raise. It is who to raise it from, and what they will do about it.
 *
 * So each instrument here carries four things:
 *
 *   base       the share of output it applies to, which is what makes a
 *              consumption tax broad and an inheritance tax narrow
 *   elasticity how fast the base shrinks as the rate rises — capital moves,
 *              wages are stickier, and land cannot go anywhere at all
 *   incidence  which voter segments actually pay it, which is the thing the
 *              electorate model turns into seats
 *   effect     what it does to the economy besides raising money
 *
 * The elasticities are set so each instrument's revenue peaks somewhere
 * defensible — a corporate rate above the mid-thirties raises less than one
 * below it, an income tax peaks near two-thirds, and a land tax essentially
 * never peaks because you cannot take land offshore. A player who pushes a
 * rate past its peak is not punished by a rule; they simply collect less,
 * and the panel shows them where the peak is before they do it.
 *
 * Nothing here argues that any level of tax is correct. Every instrument has
 * a real yield and a real cost, and the game never indicates which trade the
 * player should prefer.
 */

import type { SectorKey } from '../types.ts';
import type { SegmentKey } from './segments.ts';

export type TaxKey =
  | 'income'
  | 'corporate'
  | 'gst'
  | 'sales'
  | 'payroll'
  | 'property'
  | 'land'
  | 'capital_gains'
  | 'inheritance'
  | 'wealth'
  | 'fuel'
  | 'carbon'
  | 'mining_royalties'
  | 'resource'
  | 'import_tariff'
  | 'export'
  | 'excise';

export interface TaxTemplate {
  key: TaxKey;
  name: string;
  /** What it is, in one line, without an opinion about whether it is good. */
  blurb: string;
  /** Share of annual output the tax applies to. */
  base: number;
  /** The rate a government inherits. */
  defaultRate: number;
  /** The highest rate the machinery will accept at all. */
  maxRate: number;
  /**
   * How fast the base shrinks per point of rate.
   *
   * Revenue peaks at a rate of 1/(2·elasticity). Capital is mobile and
   * responds hard; consumption is broad and responds little; land cannot
   * leave and barely responds at all.
   */
  elasticity: number;
  /** Who bears it, as weights. Keys are voter segments. */
  incidence: Partial<Record<SegmentKey, number>>;
  /** What raising it does to the economy, per point of rate above default. */
  effect?: {
    /** Points of business investment share, ×100. Negative discourages it. */
    investment?: number;
    /** Points of consumer spending. */
    consumption?: number;
    /** Points added to a sector's health per point of rate. */
    sector?: Partial<Record<SectorKey, number>>;
    /** Points of annual inflation — taxes on things people buy show up in prices. */
    prices?: number;
  };
}

export const TAX_TEMPLATES: TaxTemplate[] = [
  {
    key: 'income',
    name: 'Income tax',
    blurb: 'The largest single source, paid by everyone who works.',
    base: 0.45,
    defaultRate: 0.285,
    maxRate: 0.75,
    /* Peaks around 67%. People work less and declare less, but they do not
       relocate the way capital does. */
    elasticity: 0.75,
    incidence: {
      professionals: 1.4,
      graduates: 1.1,
      high_income: 1.6,
      public_sector: 1.0,
      industrial_workers: 0.9,
      union_members: 0.9,
      non_graduates: 0.8,
      suburban_families: 1.0,
      low_income: 0.5,
    },
    effect: { consumption: -0.4 },
  },
  {
    key: 'corporate',
    name: 'Corporate tax',
    blurb: 'On company profits. The most mobile base there is.',
    base: 0.14,
    defaultRate: 0.25,
    maxRate: 0.6,
    /* Peaks around 36%. Above that, profit is booked elsewhere. */
    elasticity: 1.4,
    incidence: { business_owners: 2.0, high_income: 0.9, professionals: 0.4, small_traders: 0.7 },
    effect: { investment: -0.9 },
  },
  {
    key: 'gst',
    name: 'Goods and services tax',
    blurb: 'A broad tax on consumption. Cheap to collect and hard to avoid.',
    base: 0.55,
    defaultRate: 0.1,
    maxRate: 0.3,
    /* Peaks around 125% — which is to say, never in practice. Broad
       consumption taxes are the hardest thing in the code to escape. */
    elasticity: 0.4,
    incidence: {
      low_income: 1.8,
      retirees: 1.3,
      young_renters: 1.2,
      suburban_families: 1.1,
      non_graduates: 1.0,
      students: 0.9,
      rural_households: 0.9,
    },
    effect: { consumption: -0.6, prices: 0.35 },
  },
  {
    key: 'sales',
    name: 'Sales taxes',
    blurb: 'Narrower than the GST, levied on particular goods at the till.',
    base: 0.2,
    defaultRate: 0.04,
    maxRate: 0.2,
    elasticity: 0.6,
    incidence: { low_income: 1.2, suburban_families: 0.9, small_traders: 0.8, retirees: 0.7 },
    effect: { consumption: -0.3, prices: 0.2 },
  },
  {
    key: 'payroll',
    name: 'Payroll and social contributions',
    blurb: 'Levied on employers and employees per worker. Falls on wages in the end.',
    base: 0.45,
    /*
     * 30% sounds enormous next to the income tax rate beside it, and it is
     * not: this is the combined employer-and-employee social contribution,
     * which in most countries is the second-largest thing the state collects
     * and is roughly a tenth of national output. Modelling it at a token 5%
     * left the whole tax code raising 27% of GDP against a state that spends
     * 34% — a country permanently and inexplicably in deficit.
     */
    defaultRate: 0.3,
    maxRate: 0.55,
    elasticity: 0.9,
    incidence: {
      business_owners: 1.3,
      small_traders: 1.4,
      industrial_workers: 0.9,
      union_members: 0.8,
      public_sector: 0.5,
    },
    effect: { investment: -0.3 },
  },
  {
    key: 'property',
    name: 'Property tax',
    blurb: 'An annual charge on the value of buildings.',
    base: 0.3,
    defaultRate: 0.012,
    maxRate: 0.06,
    elasticity: 0.5,
    incidence: { homeowners: 2.0, retirees: 1.1, suburban_families: 1.0, high_income: 0.8 },
  },
  {
    key: 'land',
    name: 'Land tax',
    blurb: 'On the unimproved value of land, which cannot be moved offshore.',
    base: 0.12,
    defaultRate: 0.01,
    maxRate: 0.06,
    /* Almost no behavioural response: the base is physically fixed. This is
       why economists like it and why almost nobody levies much of it. */
    elasticity: 0.12,
    incidence: { homeowners: 1.5, farmers: 1.6, high_income: 1.1, business_owners: 0.7 },
  },
  {
    key: 'capital_gains',
    name: 'Capital gains tax',
    blurb: 'On the profit from selling an asset. Easy to defer by not selling.',
    base: 0.05,
    defaultRate: 0.18,
    maxRate: 0.6,
    /* Peaks near 45%: the response is mostly timing, not relocation. */
    elasticity: 1.1,
    incidence: { high_income: 2.2, business_owners: 1.2, homeowners: 0.6, retirees: 0.5 },
    effect: { investment: -0.4 },
  },
  {
    key: 'inheritance',
    name: 'Inheritance tax',
    blurb: 'On estates passed on at death. A narrow base and a loud argument.',
    base: 0.02,
    defaultRate: 0.2,
    maxRate: 0.7,
    elasticity: 0.9,
    incidence: { high_income: 2.4, farmers: 1.3, homeowners: 0.9, business_owners: 0.9 },
  },
  {
    key: 'wealth',
    name: 'Wealth tax',
    blurb: 'An annual charge on net assets above a threshold.',
    base: 0.4,
    defaultRate: 0.004,
    maxRate: 0.03,
    /* Very elastic: the base is exactly the kind that hires people to move it. */
    elasticity: 22,
    incidence: { high_income: 2.8, business_owners: 1.4 },
    effect: { investment: -0.6 },
  },
  {
    key: 'fuel',
    name: 'Fuel tax',
    blurb: 'Per litre at the pump. Felt hardest by whoever drives furthest.',
    base: 0.05,
    defaultRate: 0.35,
    maxRate: 1.2,
    elasticity: 0.55,
    incidence: {
      rural_households: 2.0,
      farmers: 1.6,
      coastal_trades: 1.3,
      industrial_workers: 1.0,
      suburban_families: 1.1,
      small_traders: 1.0,
    },
    effect: { prices: 0.25, sector: { environment: 0.09 } },
  },
  {
    key: 'carbon',
    name: 'Carbon price',
    blurb: 'Per tonne emitted. Raises money by making something more expensive.',
    base: 0.04,
    defaultRate: 0.05,
    maxRate: 0.5,
    /* The base is meant to shrink. That is the entire point of it, and it is
       why revenue from a carbon price is not something to build a budget on. */
    elasticity: 1.6,
    incidence: {
      industrial_workers: 1.6,
      business_owners: 1.2,
      rural_households: 1.0,
      farmers: 1.0,
      low_income: 0.8,
    },
    effect: { prices: 0.3, investment: -0.25, sector: { environment: 0.42 } },
  },
  {
    key: 'mining_royalties',
    name: 'Mining royalties',
    blurb: 'A share of what is dug up. Paid by an industry that cannot move the ore.',
    base: 0.03,
    defaultRate: 0.08,
    maxRate: 0.45,
    elasticity: 0.8,
    incidence: { business_owners: 1.5, industrial_workers: 0.9, rural_households: 0.7 },
    effect: { investment: -0.3, sector: { environment: 0.12 } },
  },
  {
    key: 'resource',
    name: 'Resource rent tax',
    blurb: 'On profits above a normal return from extracting a public resource.',
    base: 0.02,
    defaultRate: 0.1,
    maxRate: 0.5,
    elasticity: 0.9,
    incidence: { business_owners: 1.8, high_income: 0.8, industrial_workers: 0.5 },
    effect: { investment: -0.35 },
  },
  {
    key: 'import_tariff',
    name: 'Import tariffs',
    blurb: 'A charge on goods coming in. Paid at the border, felt at the till.',
    base: 0.25,
    defaultRate: 0.02,
    maxRate: 0.3,
    elasticity: 1.3,
    incidence: {
      low_income: 1.1,
      small_traders: 1.4,
      coastal_trades: 1.5,
      suburban_families: 0.8,
      industrial_workers: -0.6,
    },
    effect: { prices: 0.4, consumption: -0.3 },
  },
  {
    key: 'export',
    name: 'Export taxes',
    blurb: 'A charge on goods going out. Rare, and resented by whoever sells them.',
    base: 0.2,
    defaultRate: 0.005,
    maxRate: 0.15,
    elasticity: 2.2,
    incidence: { farmers: 1.8, coastal_trades: 1.6, business_owners: 1.2, industrial_workers: 0.8 },
    effect: { investment: -0.4 },
  },
  {
    key: 'excise',
    name: 'Excise duties',
    blurb: 'On alcohol, tobacco and the like. Raises money and discourages use.',
    base: 0.04,
    defaultRate: 0.3,
    maxRate: 1.5,
    elasticity: 0.5,
    incidence: { low_income: 1.4, non_graduates: 1.1, industrial_workers: 0.9, students: 0.8 },
    effect: { prices: 0.15, sector: { health: 0.1 } },
  },
];

/**
 * Receipts that are not taxes: fees, fines, dividends from state holdings,
 * the sale of things.
 *
 * Small, boring, and here because leaving it out would force the tax rates
 * up by a fifth to balance the books, which would make every instrument read
 * as heavier than the country it is modelled on.
 */
export const NON_TAX_RECEIPTS_SHARE = 0.025;

export function findTaxTemplate(key: TaxKey): TaxTemplate {
  const found = TAX_TEMPLATES.find((t) => t.key === key);
  if (!found) throw new Error(`taxes: unknown instrument ${key}`);
  return found;
}
