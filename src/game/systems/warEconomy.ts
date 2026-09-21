/**
 * warEconomy.ts — turning a country over to it, and paying for it.
 *
 * THE CONVERSION TAKES TWO YEARS AND CANNOT BE HURRIED. A government
 * that decides to go onto a war footing gets NOTHING for eighteen
 * months, and gets it under a successor. That is the whole decision:
 * whether to pay now, visibly, for capacity that arrives after the
 * present crisis has been settled one way or the other by somebody else.
 * Every government that has faced it has found the arithmetic
 * unanswerable and the politics impossible, in that order.
 *
 * GUNS AND BUTTER IS A LIE, AND SO IS GUNS INSTEAD OF BUTTER. Directing
 * civilian production into weapons shrinks the tax base that pays for
 * the weapons. It is not a trade of one for the other; it is a trade of
 * one for less of the other AND less of the first, later. The country
 * can do it and cannot do it indefinitely, and nothing tells it which
 * side of that line it is on until afterwards.
 *
 * AND THE WAR ECONOMY DOES NOT UNWIND. Plants built for this have towns
 * around them, workforces in them, and members who represent both. The
 * unwind times here are longer than the conversion times on purpose: a
 * government that converts an economy is handing its successors a
 * country with a defence industry and a constituency for using it.
 *
 * The financing question is separate and is the one with a victim. A war
 * is paid for by borrowing, by printing, or by taxing, and the choice is
 * not economic — it is which group of people is asked, and how long the
 * delay is before they notice. The shortest delay is the one nobody
 * chooses.
 */

import {
  CONVERSION_WEEKS_PER_MONTH,
  PRINTING_INFLATION,
  TURNS_PER_YEAR,
  WAR_TAX_APPROVAL,
} from '../balance.ts';
import {
  WAR_FOOTING_ORDER,
  findFinance,
  findFooting,
  type WarFinance,
  type WarFooting,
} from '../content/logistics.ts';
import type { WarEconomy } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildWarEconomy(): WarEconomy {
  return {
    footing: 'peacetime',
    /* Peacetime is fully converted to peacetime, which is the only
       footing a country is ever ready for. */
    converted: 1,
    orderedTurn: 0,
    /* Borrowing, because every country is already doing it and no
       government has ever announced a change to this. */
    finance: 'borrow',
    spent: 0,
    civilianForegone: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/**
 * What industry is actually producing, as a multiple of peacetime.
 *
 * Interpolated by how far the conversion has got, not by what was
 * ordered. A government eight months into a twenty-month conversion has
 * ordered a war economy and has forty per cent of one, and the
 * difference is the entire subject.
 */
export function militaryOutput(economy: WarEconomy): number {
  const target = findFooting(economy.footing).output;
  return 1 + (target - 1) * clamp(economy.converted, 0, 1);
}

/** What it is taking out of the civilian economy, as a share of GDP. */
export function civilianCost(economy: WarEconomy): number {
  return findFooting(economy.footing).civilianCost * clamp(economy.converted, 0, 1);
}

/** Months until the footing that was ordered actually exists. */
export function monthsToConversion(economy: WarEconomy): number {
  if (economy.converted >= 1) return 0;
  const template = findFooting(economy.footing);
  if (template.conversionMonths === 0) return 0;
  return (1 - economy.converted) * template.conversionMonths;
}

/** Whether the footing can be wound back yet, and when. */
export function unwindLockWeeks(economy: WarEconomy, turn: number): number {
  const template = findFooting(economy.footing);
  const locked = template.unwindMonths * (TURNS_PER_YEAR / 12);
  return Math.max(0, locked - (turn - economy.orderedTurn));
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface WarEconomyInputs {
  gdp: number;
  /** What the war is costing this week, in ₡bn. */
  warCost: number;
  atWar: boolean;
  turn: number;
  moneyScale: number;
}

export interface WarEconomyTick {
  economy: WarEconomy;
  /** What industry produces this week, for the logistics engine. */
  output: number;
  /** Growth knocked off by what the civilian economy is not making. */
  growthDrag: number;
  /** Added to the debt. Somebody's problem, and the question is whose. */
  borrowed: number;
  /** Added to inflation, annualised. Quietly, and with a long delay. */
  inflation: number;
  /** Approval, per week. Visible immediately, which is the point. */
  approval: number;
  /** True the week the conversion finally delivers. */
  converted: boolean;
}

export function stepWarEconomy(
  economy: WarEconomy,
  inputs: WarEconomyInputs,
): WarEconomyTick {
  const template = findFooting(economy.footing);

  /*
   * The conversion. Slow, and slow on purpose: everything about
   * industrial conversion is measured in years, and an engine that let a
   * government turn the taps on inside a term would be modelling a
   * country that has never existed.
   */
  const wasConverted = economy.converted >= 1;
  /* Each footing at its own pace. Preparedness arrives inside a term
     and a total war economy arrives under a successor, and the
     difference between those two facts is the entire decision. */
  const rate =
    template.conversionMonths > 0
      ? 1 / (template.conversionMonths * CONVERSION_WEEKS_PER_MONTH)
      : 1;
  const converted = clamp(economy.converted + rate, 0, 1);

  const output = militaryOutput({ ...economy, converted });
  const taken = civilianCost({ ...economy, converted });

  /*
   * And the thing nobody says out loud: this is not a trade of guns for
   * butter. Directing civilian production shrinks the tax base that pays
   * for the guns, so the country gets less butter AND, later, fewer
   * guns than the arithmetic promised.
   */
  const growthDrag = taken * 100 * 0.38;
  const civilianForegone = economy.civilianForegone + taken * inputs.gdp * (1 / TURNS_PER_YEAR);

  /*
   * Paying for it. Three ways, one victim each, and the delay before the
   * victim notices is the whole of the political calculus.
   */
  const cost = inputs.warCost;
  let borrowed = 0;
  let inflation = 0;
  let approval = 0;

  if (cost > 0) {
    if (economy.finance === 'borrow') {
      borrowed = cost;
    } else if (economy.finance === 'print') {
      /* Quickest, quietest, and requires nobody to vote for anything.
         The people with savings pay, through a mechanism most of them
         will not connect to the war. */
      inflation = (cost / Math.max(1, inputs.moneyScale)) * PRINTING_INFLATION;
    } else {
      /* Said out loud, on the statute book, collected from people who
         can see it, with the government's name on it. */
      /*
       * Priced against what a serious war actually costs per week, so
       * that all three options hurt comparably and differ only in WHO
       * and WHEN. Set against a larger reference it came out at two
       * approval points over three years, which would have made taxing
       * for a war the obvious answer and is the one thing it has never
       * been.
       */
      approval = -WAR_TAX_APPROVAL * clamp(cost / Math.max(1, 8 * inputs.moneyScale), 0.2, 3);
    }
  }

  /* And the standing cost of running the footing at all, which is paid
     whether or not anybody is being shot at. */
  approval -= template.standingCost * 100 * (inputs.atWar ? 0.5 : 1);

  const next: WarEconomy = {
    ...economy,
    converted,
    spent: economy.spent + cost,
    civilianForegone,
    history: [
      ...economy.history,
      { turn: inputs.turn, output, civilianCost: taken, converted },
    ].slice(-208),
  };

  return {
    economy: next,
    output,
    growthDrag,
    borrowed,
    inflation,
    approval,
    converted: converted >= 1 && !wasConverted && template.conversionMonths > 0,
  };
}

/* ------------------------------------------------------------------ *
 * What a government can do about it
 * ------------------------------------------------------------------ */

/** Whether the country can move to a footing, and what it costs. */
export function footingChange(
  economy: WarEconomy,
  to: WarFooting,
  turn: number,
): {
  allowed: boolean;
  reason: string;
  months: number;
  approvalCost: number;
  politicalCapital: number;
} {
  const from = WAR_FOOTING_ORDER.indexOf(economy.footing);
  const target = WAR_FOOTING_ORDER.indexOf(to);
  const step = target - from;
  const template = findFooting(to);

  if (step === 0) {
    return {
      allowed: false,
      reason: 'The country is on that footing already.',
      months: 0,
      approvalCost: 0,
      politicalCapital: 0,
    };
  }

  if (step < 0) {
    const locked = unwindLockWeeks(economy, turn);
    if (locked > 0) {
      return {
        allowed: false,
        reason: `Not for another ${Math.ceil(locked / 4)} months. The plants have towns around them, the towns have workforces, and the workforces have members who represent them. Winding this down is a programme rather than a decision.`,
        months: 0,
        approvalCost: 0,
        politicalCapital: 0,
      };
    }
  }

  return {
    allowed: true,
    reason: '',
    /*
     * The number that makes it a decision. A government ordering this
     * gets nothing for this many months and gets it under a successor.
     */
    months: template.conversionMonths,
    approvalCost: Math.max(0, step) * 5.5,
    politicalCapital: 8 + Math.max(0, step) * 9,
  };
}

/** Order it. The conversion starts from nothing, whichever way it goes. */
export function setFooting(economy: WarEconomy, to: WarFooting, turn: number): WarEconomy {
  return {
    ...economy,
    footing: to,
    /* A footing that has just been ordered is not a footing that exists.
       Even winding down takes the retooling. */
    converted: findFooting(to).conversionMonths === 0 ? 1 : 0,
    orderedTurn: turn,
  };
}

/** Decide who pays. The choice is not economic; it is which people. */
export function setFinance(economy: WarEconomy, finance: WarFinance): WarEconomy {
  return { ...economy, finance };
}

/** One line on the war economy, and on when any of it arrives. */
export function describeWarEconomy(economy: WarEconomy, turn: number): string {
  const template = findFooting(economy.footing);
  const months = monthsToConversion(economy);
  const finance = findFinance(economy.finance);

  if (months > 1) {
    return `${template.label} was ordered ${Math.round((turn - economy.orderedTurn) / 4)} months ago and is ${(economy.converted * 100).toFixed(0)}% of the way there. Another ${months.toFixed(0)} months before any of it produces anything, which means a successor collects it.`;
  }
  if (economy.footing !== 'peacetime' && economy.converted >= 1) {
    return `${template.label}, converted, producing ${militaryOutput(economy).toFixed(1)}× peacetime and taking ${(civilianCost(economy) * 100).toFixed(1)}% of the economy to do it. Winding it back takes ${template.unwindMonths} months, because the plants have towns around them.`;
  }
  if (economy.spent > 0) {
    return `The war is being paid for by ${finance.label.toLowerCase()}. ${finance.victim} That is not an economic choice; it is a choice about which people are asked, and the delay before they notice is ${Math.round(finance.delayWeeks / 4)} months.`;
  }
  return `${template.label}. Defence is a procurement programme rather than an industry, and nothing here can be changed in under ${findFooting('preparedness').conversionMonths} months.`;
}
