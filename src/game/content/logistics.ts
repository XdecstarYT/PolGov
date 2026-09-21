/**
 * logistics.ts — what an army eats, and how fast.
 *
 * The fact this file exists for: A COUNTRY ENTERS A WAR WITH A
 * COMPUTABLE NUMBER OF WEEKS OF AMMUNITION, AND NOBODY COMPUTES IT. The
 * stockpile is a number, the consumption rate is a number, and the
 * quotient is the date the war changes character. It can be worked out
 * on the first afternoon by anybody who wants to, it never appears in a
 * briefing, and it is discovered about eleven weeks in by a government
 * that had planned for six months.
 *
 * The second fact is that SUPPLY IS A THROUGHPUT, NOT A STOCK. A country
 * does not have supplies; it has a rate at which they arrive. An army
 * consumes at a rate. Everything that happens on a front is decided by
 * the difference between those two numbers, and a stockpile is only ever
 * a loan against it.
 *
 * And the third is that THE TAIL EATS THE TEETH. Every soldier at the
 * front needs several behind them, the ratio gets worse the further
 * forward the front is, and past some point adding troops REDUCES what
 * the country can bring to bear — because what the new ones consume
 * exceeds what they add. Nothing about that is intuitive and every
 * government has to be shown it twice.
 */

export type SupplyClass = 'ammunition' | 'fuel' | 'food' | 'spares' | 'medical';

export interface SupplyTemplate {
  key: SupplyClass;
  label: string;
  blurb: string;
  /**
   * Weeks of SUSTAINED FULL-INTENSITY COMBAT the country holds.
   *
   * This is the number, and it is stated in the units everybody quotes
   * it in rather than in weeks of peacetime consumption — which is the
   * same stock and a figure five times larger, and is how a stockpile
   * gets described as comfortable. Eleven weeks means eleven weeks of
   * the war the country is actually planning, and the war it is
   * planning is six months long.
   */
  peacetimeWeeks: number;
  /**
   * How much a committed formation burns, relative to a quiet one.
   *
   * Also fixes the peacetime draw, at one over this: a class consumed
   * fourteen times faster in combat is consumed at a fourteenth of the
   * combat rate when nobody is fighting, which is what makes the
   * stockpile look comfortable for the whole of peacetime.
   */
  combatDraw: number;
  /**
   * Months to get production up once somebody decides to.
   *
   * Nothing here is quick and ammunition is the slowest, because the
   * plant that makes propellant was closed in a previous economy drive
   * and the people who ran it have retired.
   */
  leadMonths: number;
  /** Whether a shortage stops the army or merely degrades it. */
  critical: boolean;
  /** What running out actually does, in the words a briefing would use. */
  outcome: string;
}

export const SUPPLY_TEMPLATES: SupplyTemplate[] = [
  {
    key: 'ammunition',
    label: 'Ammunition',
    blurb:
      'The one everybody means when they say supplies, the one with the shortest stock, and the one with the longest lead time.',
    peacetimeWeeks: 11,
    combatDraw: 14,
    leadMonths: 22,
    critical: true,
    outcome:
      'The artillery stops. Not slows — stops, and an army without artillery is an army that can hold ground and cannot take any.',
  },
  {
    key: 'fuel',
    label: 'Fuel',
    blurb:
      'Bought on a market, stored in tanks somebody privatised, and the only class of supply an enemy can interrupt without firing at it.',
    peacetimeWeeks: 9,
    combatDraw: 6,
    leadMonths: 3,
    critical: true,
    outcome:
      'Nothing moves. The formations are where they are, which is where they will be when the other side arrives.',
  },
  {
    key: 'food',
    label: 'Rations',
    blurb: 'Easy to make, heavy to move, and the first thing anybody notices the absence of.',
    peacetimeWeeks: 14,
    combatDraw: 1.4,
    leadMonths: 2,
    critical: false,
    outcome:
      'Morale, immediately and visibly. An army that is not fed is an army that is deciding things for itself.',
  },
  {
    key: 'spares',
    label: 'Spares',
    blurb:
      'The least glamorous line in any estimate, cut in every one of them, and the reason a third of the equipment is not equipment.',
    peacetimeWeeks: 7,
    combatDraw: 9,
    leadMonths: 14,
    critical: false,
    outcome:
      'Vehicles are cannibalised for parts and the fleet shrinks without anybody being attacked.',
  },
  {
    key: 'medical',
    label: 'Medical',
    blurb:
      'Costs almost nothing, is never stockpiled, and is the difference between a casualty and a death.',
    peacetimeWeeks: 10,
    combatDraw: 5,
    leadMonths: 5,
    critical: false,
    outcome:
      'The wounded who would have returned to their units do not, which shows up as a manpower figure months later and is never traced back to here.',
  },
];

export function findSupply(key: SupplyClass): SupplyTemplate {
  const found = SUPPLY_TEMPLATES.find((s) => s.key === key);
  if (!found) throw new Error(`logistics: unknown class ${key}`);
  return found;
}

/**
 * How many people it takes behind the front to keep one person at it.
 *
 * The tooth-to-tail ratio, and the reason an army of a hundred thousand
 * is not a hundred thousand rifles. It gets worse with distance, worse
 * with mechanisation, and worse with everything a modern army has that
 * makes it good — which is why the armies that are best at fighting are
 * the ones that need the most people not fighting.
 */
export const TAIL_PER_TOOTH = 2.6;

/** And how much worse it gets per sector of depth from the base. */
export const TAIL_PER_DEPTH = 0.42;

/**
 * How a government pays for a war.
 *
 * There are three ways and a government picks one, because it has to.
 * Each has a different victim, each has a different delay before the
 * victim notices, and the shortest delay is the one nobody chooses.
 */
export type WarFinance = 'borrow' | 'print' | 'tax';

export const WAR_FINANCE: {
  key: WarFinance;
  label: string;
  blurb: string;
  /** Who actually pays, said plainly. */
  victim: string;
  /** Weeks before anybody notices. The whole of the political calculus. */
  delayWeeks: number;
}[] = [
  {
    key: 'borrow',
    label: 'Borrow it',
    blurb: 'Issue the debt, pay the coupon, and let the war be a line in every budget for thirty years.',
    victim:
      'Whoever is governing in fifteen years, and every programme that competes with debt service between now and then.',
    delayWeeks: 160,
  },
  {
    key: 'print',
    label: 'Print it',
    blurb:
      'The quickest, the quietest, and the only one that does not require anybody to vote for anything.',
    victim:
      'Everybody with savings and everybody on a fixed income, in that order, through a mechanism most of them will not connect to the war.',
    delayWeeks: 40,
  },
  {
    key: 'tax',
    label: 'Tax for it',
    blurb: 'Say what it costs, put it on the statute book, and collect it from people who can see it.',
    victim: 'This electorate, now, visibly, and with the government’s name on it.',
    delayWeeks: 4,
  },
];

export function findFinance(key: WarFinance) {
  const found = WAR_FINANCE.find((f) => f.key === key);
  if (!found) throw new Error(`logistics: unknown finance ${key}`);
  return found;
}

/**
 * How far the economy has been turned over to the war.
 *
 * The important thing about every step here is the CONVERSION TIME. A
 * government that decides to go onto a war footing gets nothing for
 * eighteen months — and gets it under a successor, in a country whose
 * industry now has a constituency that does not want it turned back.
 */
export type WarFooting = 'peacetime' | 'preparedness' | 'partial' | 'full' | 'total';

export const WAR_FOOTINGS: {
  key: WarFooting;
  label: string;
  blurb: string;
  /** Months before any of it produces anything. */
  conversionMonths: number;
  /** Multiplier on military production, once converted. */
  output: number;
  /** What it takes out of the civilian economy, as a share of GDP. */
  civilianCost: number;
  /** How far it can be wound back, and how fast. */
  unwindMonths: number;
  /** Weekly approval cost of running it. */
  standingCost: number;
}[] = [
  {
    key: 'peacetime',
    label: 'Peacetime',
    blurb: 'Defence is a procurement programme rather than an industry, and is argued about as one.',
    conversionMonths: 0,
    output: 1,
    civilianCost: 0,
    unwindMonths: 0,
    standingCost: 0,
  },
  {
    key: 'preparedness',
    label: 'Preparedness',
    blurb:
      'Long-lead items ordered, plant kept warm, and a stockpile that somebody has to defend in every budget round until the day it is needed.',
    conversionMonths: 8,
    output: 1.5,
    civilianCost: 0.006,
    unwindMonths: 6,
    standingCost: 0.004,
  },
  {
    key: 'partial',
    label: 'Partial mobilisation of industry',
    blurb: 'Some plants converted, some shifts added, and the first arguments about who is exempt.',
    conversionMonths: 14,
    output: 2.4,
    civilianCost: 0.022,
    unwindMonths: 18,
    standingCost: 0.014,
  },
  {
    key: 'full',
    label: 'A war economy',
    blurb:
      'Civilian production directed, materials allocated, and a planning apparatus that will outlive the war by a decade.',
    conversionMonths: 20,
    output: 3.8,
    civilianCost: 0.058,
    unwindMonths: 36,
    standingCost: 0.03,
  },
  {
    key: 'total',
    label: 'Total war',
    blurb:
      'Everything the country can make, made for this. It is done once, it works, and the country is different afterwards.',
    conversionMonths: 26,
    output: 5.2,
    civilianCost: 0.12,
    unwindMonths: 60,
    standingCost: 0.062,
  },
];

export function findFooting(key: WarFooting) {
  const found = WAR_FOOTINGS.find((f) => f.key === key);
  if (!found) throw new Error(`logistics: unknown footing ${key}`);
  return found;
}

export const WAR_FOOTING_ORDER: WarFooting[] = [
  'peacetime',
  'preparedness',
  'partial',
  'full',
  'total',
];
