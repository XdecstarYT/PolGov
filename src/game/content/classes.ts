/**
 * classes.ts — the country sorted by what households have.
 *
 * Five bands, because five is the number a person can hold in their head
 * while making a decision, and the decisions this feeds are about who pays
 * for something and who gets it. Deciles are derived from these for the
 * statistical panel; nobody governs in deciles.
 *
 * The bands are written as positions in a distribution, not as characters.
 * A band is not virtuous or idle, deserving or undeserving. It is a set of
 * households with a certain income, a certain amount of property and a
 * certain exposure to a change in the price of things — and those three
 * facts are the whole of what the engine needs, because they are what
 * decides whether a given budget lands on this household as relief or as a
 * bill.
 *
 * The opening numbers are a developed mixed economy with a large middle and
 * a wealth distribution considerably more concentrated than its income
 * distribution, which is the ordinary shape and the reason a government
 * that taxes income and a government that taxes wealth are doing two very
 * different things.
 */

import type { TaxKey } from './taxes.ts';

export type ClassKey = 'lower' | 'working' | 'middle' | 'upper_middle' | 'wealthy';

export const CLASS_KEYS: ClassKey[] = ['lower', 'working', 'middle', 'upper_middle', 'wealthy'];

export interface ClassTemplate {
  key: ClassKey;
  label: string;
  /** One line of position. Descriptive, never evaluative. */
  blurb: string;
  /** Share of households in the band at the start of a run, 0–1. */
  households: number;
  /** Share of national income at the start, 0–1. */
  incomeShare: number;
  /** Share of national net worth at the start, 0–1. */
  wealthShare: number;
  /** Owned outright, mortgaged, renting at the start. Sums to 1. */
  tenure: { owned: number; mortgaged: number; renting: number };
  /** Household debt as a multiple of annual income at the start. */
  debtToIncome: number;
  /** Share of income saved at the start, %. Negative is running down. */
  savingsRate: number;
  /**
   * Share of this band's spending that goes on housing, energy and food —
   * the three prices a government is blamed for and the reason inflation is
   * not one number but five.
   */
  essentialsShare: number;
  /**
   * How much of the band's income comes from assets rather than work, 0–1.
   * This is why a rate cut and a wage rise are not the same policy.
   */
  capitalIncomeShare: number;
  /**
   * How far the band's fortunes follow the business cycle. The bottom is
   * hit first by unemployment and the top is carried furthest by a boom.
   */
  cyclicality: number;
}

export const CLASS_TEMPLATES: ClassTemplate[] = [
  {
    key: 'lower',
    label: 'Lower-income households',
    blurb:
      'Little or no property, income mostly from work or transfers, and almost all of it spent before the month is out.',
    households: 0.18,
    incomeShare: 0.078,
    wealthShare: 0.008,
    tenure: { owned: 0.08, mortgaged: 0.11, renting: 0.81 },
    debtToIncome: 0.7,
    savingsRate: -1.5,
    essentialsShare: 0.62,
    capitalIncomeShare: 0.01,
    cyclicality: 1.45,
  },
  {
    key: 'working',
    label: 'Working households',
    blurb:
      'Wages from work that is mostly secure, a mortgage more often than not, and very little between the two if either stops.',
    households: 0.29,
    incomeShare: 0.172,
    wealthShare: 0.062,
    tenure: { owned: 0.16, mortgaged: 0.42, renting: 0.42 },
    debtToIncome: 1.9,
    savingsRate: 2.5,
    essentialsShare: 0.52,
    capitalIncomeShare: 0.03,
    cyclicality: 1.2,
  },
  {
    key: 'middle',
    label: 'Middle households',
    blurb:
      'Salaried, housed, and with enough put by to absorb one bad year but not two.',
    households: 0.28,
    incomeShare: 0.25,
    wealthShare: 0.175,
    tenure: { owned: 0.24, mortgaged: 0.56, renting: 0.2 },
    debtToIncome: 2.6,
    savingsRate: 6.5,
    essentialsShare: 0.42,
    capitalIncomeShare: 0.07,
    cyclicality: 0.95,
  },
  {
    key: 'upper_middle',
    label: 'Upper-middle households',
    blurb:
      'Professional incomes, substantial housing equity, and the first band for whom what the assets do matters as much as what the job pays.',
    households: 0.17,
    incomeShare: 0.24,
    wealthShare: 0.275,
    tenure: { owned: 0.38, mortgaged: 0.55, renting: 0.07 },
    debtToIncome: 2.9,
    savingsRate: 12,
    essentialsShare: 0.31,
    capitalIncomeShare: 0.16,
    cyclicality: 0.8,
  },
  {
    key: 'wealthy',
    label: 'Wealthy households',
    blurb:
      'Income substantially from property and holdings, for whom the interest rate is a larger fact than the wage settlement.',
    households: 0.08,
    incomeShare: 0.26,
    wealthShare: 0.48,
    tenure: { owned: 0.72, mortgaged: 0.26, renting: 0.02 },
    debtToIncome: 1.4,
    savingsRate: 24,
    essentialsShare: 0.16,
    capitalIncomeShare: 0.42,
    cyclicality: 0.7,
  },
];

export function findClass(key: ClassKey): ClassTemplate {
  const found = CLASS_TEMPLATES.find((c) => c.key === key);
  if (!found) throw new Error(`classes: unknown band ${key}`);
  return found;
}

/**
 * Where each tax instrument actually lands, by band.
 *
 * Weights are relative shares of the burden, normalised at use. This is the
 * single most consequential table in the file: it is what makes raising the
 * sales tax and raising the wealth tax different acts rather than two ways
 * of collecting the same money, and it is why a government can increase its
 * receipts and lose the country at the same time.
 *
 * The shape is the ordinary one. Consumption taxes are regressive because
 * the poorest spend all of what they have; property and capital taxes are
 * progressive because holdings are more concentrated than earnings. None of
 * this is a claim about which is correct.
 */
export const TAX_INCIDENCE: Record<TaxKey, Record<ClassKey, number>> = {
  income: { lower: 0.3, working: 0.9, middle: 1.2, upper_middle: 1.5, wealthy: 1.6 },
  corporate: { lower: 0.2, working: 0.5, middle: 0.8, upper_middle: 1.3, wealthy: 2.4 },
  gst: { lower: 2.0, working: 1.5, middle: 1.0, upper_middle: 0.7, wealthy: 0.4 },
  sales: { lower: 2.0, working: 1.5, middle: 1.0, upper_middle: 0.7, wealthy: 0.4 },
  payroll: { lower: 0.9, working: 1.5, middle: 1.3, upper_middle: 1.0, wealthy: 0.5 },
  property: { lower: 0.3, working: 0.8, middle: 1.2, upper_middle: 1.6, wealthy: 2.1 },
  land: { lower: 0.1, working: 0.4, middle: 0.9, upper_middle: 1.6, wealthy: 3.0 },
  capital_gains: { lower: 0.05, working: 0.15, middle: 0.5, upper_middle: 1.4, wealthy: 3.9 },
  inheritance: { lower: 0.02, working: 0.1, middle: 0.4, upper_middle: 1.3, wealthy: 4.2 },
  wealth: { lower: 0.01, working: 0.05, middle: 0.3, upper_middle: 1.1, wealthy: 4.5 },
  fuel: { lower: 1.7, working: 1.6, middle: 1.1, upper_middle: 0.8, wealthy: 0.5 },
  carbon: { lower: 1.6, working: 1.4, middle: 1.1, upper_middle: 0.9, wealthy: 0.7 },
  mining_royalties: { lower: 0.3, working: 0.6, middle: 0.8, upper_middle: 1.2, wealthy: 2.1 },
  resource: { lower: 0.3, working: 0.6, middle: 0.8, upper_middle: 1.2, wealthy: 2.1 },
  import_tariff: { lower: 1.6, working: 1.4, middle: 1.1, upper_middle: 0.8, wealthy: 0.6 },
  export: { lower: 0.4, working: 0.8, middle: 0.9, upper_middle: 1.2, wealthy: 1.7 },
  excise: { lower: 1.9, working: 1.5, middle: 1.0, upper_middle: 0.7, wealthy: 0.4 },
};

/**
 * Which voter segments sit mostly in which band.
 *
 * Not a partition — a shift worker and a graduate can be the same household
 * — but enough to carry a change in a band's disposable income through to
 * the people who vote on it. Without this join the distribution would be a
 * panel nobody's decisions ever touched.
 */
export const SEGMENT_BAND: Record<string, ClassKey> = {
  industrial_workers: 'working',
  union_members: 'working',
  public_sector: 'middle',
  professionals: 'upper_middle',
  business_owners: 'upper_middle',
  small_traders: 'middle',
  farmers: 'middle',
  rural_households: 'working',
  students: 'lower',
  young_renters: 'lower',
  suburban_families: 'middle',
  homeowners: 'upper_middle',
  retirees: 'working',
  low_income: 'lower',
  high_income: 'wealthy',
  graduates: 'upper_middle',
  non_graduates: 'working',
  faith_communities: 'working',
  coastal_trades: 'working',
  newcomers: 'lower',
};
