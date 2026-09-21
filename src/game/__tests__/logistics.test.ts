/**
 * logistics.test.ts — the arithmetic nobody does, and the two years
 * nobody has.
 *
 * Three defects here were found by running campaigns:
 *
 * The stockpile was denominated in weeks of PEACETIME consumption, which
 * meant eleven weeks of ammunition was two weeks of war. The headline
 * fact this whole engine exists for — a country has eleven weeks of
 * ammunition and the war is planned for six months — was not in it.
 *
 * Adding troops never reduced what reached the front, because the tail
 * was a function of distance alone and not of how much army was trying
 * to come down the same three roads.
 *
 * And every industrial footing converted at the same rate regardless of
 * what its own template said, so preparedness and total war both arrived
 * in twenty-six months and the choice between them had no time dimension
 * at all — which is the only dimension it has.
 */

import { describe, expect, it } from 'vitest';
import {
  atTheFront,
  bindingConstraint,
  buildLogistics,
  congestionOf,
  describeLogistics,
  enduranceMonths,
  stepLogistics,
  stockOf,
  tailFor,
  teeth,
  warEndurance,
  weeksRemaining,
  type LogisticsInputs,
} from '../systems/logistics.ts';
import {
  buildWarEconomy,
  civilianCost,
  describeWarEconomy,
  footingChange,
  militaryOutput,
  monthsToConversion,
  setFinance,
  setFooting,
  stepWarEconomy,
  unwindLockWeeks,
  type WarEconomyInputs,
} from '../systems/warEconomy.ts';
import {
  SUPPLY_TEMPLATES,
  TAIL_PER_TOOTH,
  WAR_FOOTINGS,
  WAR_FOOTING_ORDER,
  findFinance,
  findFooting,
  findSupply,
} from '../content/logistics.ts';
import { STORAGE_CEILING, TAIL_DIMINISHING, TURNS_PER_YEAR } from '../balance.ts';
import type { Logistics, WarEconomy } from '../types.ts';

const quiet = (turn: number, over: Partial<LogisticsInputs> = {}): LogisticsInputs => ({
  committed: 0,
  force: 100,
  depth: 0,
  atWar: false,
  intensity: 0,
  output: 1,
  funding: 1,
  transport: 1,
  capacity: 100,
  turn,
  ...over,
});

const fighting = (turn: number, over: Partial<LogisticsInputs> = {}): LogisticsInputs =>
  quiet(turn, { committed: 100, force: 100, depth: 2, atWar: true, intensity: 100, ...over });

const run = (weeks: number, inputs: (t: number) => LogisticsInputs, from = buildLogistics()) => {
  let l: Logistics = from;
  const warned: string[] = [];
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepLogistics(l, inputs(t));
    l = tick.logistics;
    warned.push(...tick.warning);
  }
  return { logistics: l, warned };
};

const econ = (turn: number, over: Partial<WarEconomyInputs> = {}): WarEconomyInputs => ({
  gdp: 3680,
  warCost: 12,
  atWar: true,
  turn,
  moneyScale: 1,
  ...over,
});

const convert = (economy: WarEconomy, weeks: number, over: Partial<WarEconomyInputs> = {}) => {
  let e = economy;
  const totals = { borrowed: 0, inflation: 0, approval: 0, drag: 0 };
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepWarEconomy(e, econ(t, over));
    e = tick.economy;
    totals.borrowed += tick.borrowed;
    totals.inflation += tick.inflation;
    totals.approval += tick.approval;
    totals.drag += tick.growthDrag;
  }
  return { economy: e, ...totals };
};

/* ------------------------------------------------------------------ *
 * The arithmetic nobody does
 * ------------------------------------------------------------------ */

describe('logistics: the country has eleven weeks and the war is six months', () => {
  it('states the stockpile in weeks of the war it is planning', () => {
    /*
     * The whole point. Eleven weeks means eleven weeks of sustained
     * full-intensity combat, not eleven weeks of peacetime consumption —
     * which is the same stock, a figure five times larger, and how a
     * stockpile gets described as comfortable.
     */
    const l = buildLogistics();
    const at = stepLogistics(l, fighting(0)).logistics;
    const ammunition = stockOf(at, 'ammunition');
    expect(ammunition.consumption).toBeCloseTo(1, 1);
    expect(weeksRemaining(ammunition)).toBeGreaterThan(10);
    expect(weeksRemaining(ammunition)).toBeLessThan(14);
  });

  it('makes that figure available on the first afternoon', () => {
    const at = stepLogistics(buildLogistics(), fighting(0)).logistics;
    expect(Number.isFinite(warEndurance(at))).toBe(true);
    expect(enduranceMonths(at)).toBeGreaterThan(0);
    expect(enduranceMonths(at)).toBeLessThan(6);
    /* And the class that runs out first is the one that decides it. */
    expect(bindingConstraint(at).key).toBeDefined();
  });

  it('looks comfortable for the whole of peacetime', () => {
    /*
     * Peacetime consumption is a fraction of combat consumption, which
     * is precisely why nobody develops the habit of asking. An untouched
     * country neither builds nor burns its stock.
     */
    const opening = buildLogistics();
    const after = run(416, quiet).logistics;
    for (const template of SUPPLY_TEMPLATES) {
      expect(stockOf(after, template.key).weeks).toBeCloseTo(
        stockOf(opening, template.key).weeks,
        4,
      );
      expect(weeksRemaining(stockOf(after, template.key))).toBe(Infinity);
    }
  });

  it('runs the depots down and says what running out does', () => {
    const out = run(60, (t) => fighting(t, { intensity: 70, committed: 70 }));
    expect(out.warned.length).toBeGreaterThan(0);
    expect(stockOf(out.logistics, 'ammunition').weeks).toBeLessThan(4);
    expect(findSupply('ammunition').outcome).toMatch(/artillery/);
    expect(describeLogistics(out.logistics, true)).toMatch(/\S/);
  });

  it('takes longer to raise production than the stock lasts', () => {
    /* Which was true on the first day too, and is the part nobody says. */
    const at = stepLogistics(buildLogistics(), fighting(0)).logistics;
    const binding = bindingConstraint(at);
    const template = findSupply(binding.key);
    const monthsOfStock = weeksRemaining(binding) / (TURNS_PER_YEAR / 12);
    expect(template.leadMonths).toBeGreaterThan(monthsOfStock);
  });

  it('extends the war when industry has actually converted, and not before', () => {
    const unconverted = run(26, (t) => fighting(t, { intensity: 70, committed: 70, output: 1 }));
    const converted = run(26, (t) => fighting(t, { intensity: 70, committed: 70, output: 3.8 }));
    expect(stockOf(converted.logistics, 'ammunition').weeks).toBeGreaterThan(
      stockOf(unconverted.logistics, 'ammunition').weeks,
    );
    /*
     * And it is not a rescue. A converted war economy roughly doubles
     * how long the depots last; it does not make them last indefinitely
     * while most of the army is fighting, which is the finding that
     * decides whether the war is a short one.
     */
    const long = run(78, (t) => fighting(t, { intensity: 70, committed: 70, output: 3.8 }));
    expect(stockOf(long.logistics, 'ammunition').weeks).toBe(0);
  });

  it('has somewhere to put it, and it is not unlimited', () => {
    const glut = run(416, (t) => quiet(t, { output: 6 })).logistics;
    for (const template of SUPPLY_TEMPLATES) {
      expect(stockOf(glut, template.key).weeks).toBeLessThanOrEqual(
        template.peacetimeWeeks * STORAGE_CEILING + 0.001,
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * The tail
 * ------------------------------------------------------------------ */

describe('logistics: the tail eats the teeth', () => {
  it('lengthens with distance', () => {
    expect(tailFor(0)).toBeCloseTo(TAIL_PER_TOOTH, 3);
    for (let d = 1; d < 6; d += 1) {
      expect(tailFor(d)).toBeGreaterThan(tailFor(d - 1));
    }
    expect(atTheFront(150_000, 5, 100_000)).toBeLessThan(atTheFront(150_000, 0, 100_000));
  });

  it('lengthens with how much army is on the same three roads', () => {
    expect(congestionOf(100_000, 100_000)).toBe(0);
    expect(congestionOf(200_000, 100_000)).toBe(1);
    expect(tailFor(3, 1, 1)).toBeGreaterThan(tailFor(3, 1, 0));
  });

  it('peaks, and then sending more forward sends less', () => {
    /*
     * The least intuitive fact in the subject. Every government has to
     * be shown it twice and does not believe it either time — so the
     * engine had better actually do it, and for a while it did not.
     */
    const capacity = 100_000;
    const sizes = [60_000, 100_000, 150_000, 200_000, 300_000, 450_000];
    const values = sizes.map((f) => atTheFront(f, 3, capacity));
    const peak = Math.max(...values);
    const peakAt = sizes[values.indexOf(peak)]!;

    expect(peakAt).toBeGreaterThan(capacity);
    expect(peakAt).toBeLessThan(capacity * 3);
    /* And a force three times the peak puts less at the front than one
       the size of the network does. */
    expect(atTheFront(450_000, 3, capacity)).toBeLessThan(atTheFront(100_000, 3, capacity));
  });

  it('names the point where the supply chain starts carrying itself', () => {
    expect(teeth(100_000, TAIL_DIMINISHING - 0.5)).toBeGreaterThan(0);
    const before = teeth(100_000, TAIL_DIMINISHING);
    const after = teeth(100_000, TAIL_DIMINISHING + 2);
    expect(after).toBeLessThan(before);
  });

  it('reports the tail and the throughput every week', () => {
    const tick = stepLogistics(buildLogistics(), fighting(0, { depth: 4, force: 260 }));
    expect(tick.logistics.tail).toBeGreaterThan(TAIL_PER_TOOTH);
    expect(tick.throughput).toBeGreaterThan(0);
    expect(tick.throughput).toBeLessThanOrEqual(1.15);
  });
});

/* ------------------------------------------------------------------ *
 * The war economy
 * ------------------------------------------------------------------ */

describe('war economy: a government gets nothing for eighteen months', () => {
  it('converts each footing at its own pace rather than a shared one', () => {
    /*
     * The choice between preparedness and total war is a choice about
     * WHEN, and for a while both arrived in twenty-six months, which
     * removed the only dimension the decision has.
     */
    const quick = convert(setFooting(buildWarEconomy(), 'preparedness', 0), 52).economy;
    const slow = convert(setFooting(buildWarEconomy(), 'total', 0), 52).economy;
    expect(quick.converted).toBeGreaterThan(0.9);
    expect(slow.converted).toBeLessThan(0.6);
    expect(monthsToConversion(slow)).toBeGreaterThan(monthsToConversion(quick));
  });

  it('produces nothing on the day it is ordered', () => {
    const ordered = setFooting(buildWarEconomy(), 'full', 0);
    expect(ordered.converted).toBe(0);
    expect(militaryOutput(ordered)).toBe(1);
    expect(monthsToConversion(ordered)).toBeCloseTo(findFooting('full').conversionMonths, 0);
  });

  it('delivers it to a successor', () => {
    const term = 208;
    const ordered = setFooting(buildWarEconomy(), 'total', 0);
    const atElection = convert(ordered, term).economy;
    /* Converted by then, but the government that ordered it spent most
       of a term paying for nothing. */
    const halfway = convert(ordered, Math.round(term / 3)).economy;
    expect(militaryOutput(halfway)).toBeLessThan(findFooting('total').output * 0.7);
    expect(militaryOutput(atElection)).toBeCloseTo(findFooting('total').output, 1);
  });

  it('is a trade of butter for less butter and fewer guns later', () => {
    const converted = convert(setFooting(buildWarEconomy(), 'full', 0), 208);
    expect(converted.drag).toBeGreaterThan(0);
    expect(converted.economy.civilianForegone).toBeGreaterThan(0);
    expect(civilianCost(converted.economy)).toBeCloseTo(findFooting('full').civilianCost, 3);
  });

  it('does not unwind', () => {
    const economy = setFooting(buildWarEconomy(), 'full', 10);
    expect(unwindLockWeeks(economy, 10)).toBeGreaterThan(104);
    expect(footingChange(economy, 'peacetime', 60).allowed).toBe(false);
    expect(footingChange(economy, 'peacetime', 10 + 40 * 4.4).allowed).toBe(true);
    /* Longer to wind back than it took to convert, because the plants
       have towns around them. */
    expect(findFooting('full').unwindMonths).toBeGreaterThan(
      findFooting('full').conversionMonths,
    );
  });

  it('costs standing every week it is run, war or no war', () => {
    const running = convert(setFooting(buildWarEconomy(), 'total', 0), 104, { warCost: 0 });
    expect(running.approval).toBeLessThan(0);
  });

  it('orders every footing in an order, and each is worse than the last', () => {
    for (let i = 1; i < WAR_FOOTING_ORDER.length; i += 1) {
      const previous = findFooting(WAR_FOOTING_ORDER[i - 1]!);
      const current = findFooting(WAR_FOOTING_ORDER[i]!);
      expect(current.output).toBeGreaterThan(previous.output);
      expect(current.civilianCost).toBeGreaterThan(previous.civilianCost);
      expect(current.conversionMonths).toBeGreaterThan(previous.conversionMonths);
      expect(current.unwindMonths).toBeGreaterThan(previous.unwindMonths);
    }
    expect(WAR_FOOTINGS).toHaveLength(WAR_FOOTING_ORDER.length);
  });
});

describe('war economy: three ways to pay, and a different victim each', () => {
  it('borrows, prints or taxes, and each hurts comparably', () => {
    const borrowed = convert(setFinance(buildWarEconomy(), 'borrow'), 156);
    const printed = convert(setFinance(buildWarEconomy(), 'print'), 156);
    const taxed = convert(setFinance(buildWarEconomy(), 'tax'), 156);

    expect(borrowed.borrowed).toBeGreaterThan(1000);
    expect(borrowed.inflation).toBe(0);
    expect(printed.inflation).toBeGreaterThan(3);
    expect(printed.borrowed).toBe(0);
    expect(taxed.approval).toBeLessThan(-6);
    expect(taxed.borrowed).toBe(0);
    /* None of them is the cheap one. That is the whole point of having
       three, and for a while taxing came out at two approval points over
       three years, which would have made it the obvious answer and is
       the one thing it has never been. */
    expect(taxed.approval).toBeLessThan(borrowed.approval - 5);
  });

  it('says who pays and how long before they notice', () => {
    expect(findFinance('tax').delayWeeks).toBeLessThan(findFinance('print').delayWeeks);
    expect(findFinance('print').delayWeeks).toBeLessThan(findFinance('borrow').delayWeeks);
    for (const key of ['borrow', 'print', 'tax'] as const) {
      expect(findFinance(key).victim.length).toBeGreaterThan(30);
    }
  });

  it('says one true thing about where the country is', () => {
    expect(describeWarEconomy(buildWarEconomy(), 0)).toMatch(/\S/);
    const mid = convert(setFooting(buildWarEconomy(), 'total', 0), 30).economy;
    expect(describeWarEconomy(mid, 30)).toMatch(/months/);
  });
});
