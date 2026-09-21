/**
 * logistics.ts — what arrives, and what it costs to make it arrive.
 *
 * Three mechanics, and the first is the one this file exists for.
 *
 * THE COUNTRY HAS ELEVEN WEEKS OF AMMUNITION AND THE WAR IS PLANNED FOR
 * SIX MONTHS. That quotient is knowable on the first afternoon — the
 * stockpile is a number, the consumption rate is a number — and it never
 * appears in a briefing, because the briefing is about capability and
 * this is about arithmetic. It is discovered about eleven weeks in.
 * `weeksRemaining` is the whole point of the file and is deliberately
 * exported so a panel can put it in front of a government on day one.
 *
 * SUPPLY IS A THROUGHPUT, NOT A STOCK. A country does not have supplies;
 * it has a rate at which they arrive. The stockpile is a loan against
 * the difference between that rate and what the army burns, and like
 * every loan it is repaid at the worst possible moment.
 *
 * THE TAIL EATS THE TEETH. Every soldier at the front needs several
 * behind them; the ratio worsens with distance; and past a point adding
 * troops REDUCES what the country can bring to bear, because what the
 * new ones consume exceeds what they add. Every government has to be
 * shown this twice and does not believe it either time.
 */

import {
  STOCK_CRITICAL_WEEKS,
  STOCK_WARNING_WEEKS,
  STORAGE_CEILING,
  TAIL_CONGESTION,
  TAIL_DIMINISHING,
  TAIL_PENALTY,
  THROUGHPUT_FLOOR,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  SUPPLY_TEMPLATES,
  TAIL_PER_DEPTH,
  TAIL_PER_TOOTH,
  findSupply,
  type SupplyClass,
} from '../content/logistics.ts';
import type { Logistics, Stockpile } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

/**
 * What the country has in its depots, which nobody in this run ordered.
 *
 * Production is exactly consumption, so an untouched country neither
 * builds nor burns its stock: whatever changes it is something this
 * government did, or something that was done to it.
 */
export function buildLogistics(): Logistics {
  return {
    stock: SUPPLY_TEMPLATES.map((template) => ({
      key: template.key,
      weeks: template.peacetimeWeeks,
      production: 1,
      consumption: 1,
      conversion: 0,
      history: [],
    })),
    tail: TAIL_PER_TOOTH,
    throughput: 1,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * The arithmetic nobody does
 * ------------------------------------------------------------------ */

export function stockOf(logistics: Logistics, key: SupplyClass): Stockpile {
  const found = logistics.stock.find((s) => s.key === key);
  if (!found) throw new Error(`logistics: no stock of ${key}`);
  return found;
}

/**
 * How long this class of supply lasts at the present rate.
 *
 * The number. Stock over the net drain, and it can be worked out on the
 * first afternoon of a war by anybody who wants to. Infinite when
 * production covers consumption, which is what peacetime looks like and
 * is why nobody has the habit of asking.
 */
export function weeksRemaining(stock: Stockpile): number {
  const drain = stock.consumption - stock.production;
  if (drain <= 0) return Infinity;
  return stock.weeks / drain;
}

/** The class that runs out first, which is the one that decides the war. */
export function bindingConstraint(logistics: Logistics): Stockpile {
  return [...logistics.stock].sort((a, b) => weeksRemaining(a) - weeksRemaining(b))[0]!;
}

/** And how long the war can be fought at this rate before it changes shape. */
export function warEndurance(logistics: Logistics): number {
  return weeksRemaining(bindingConstraint(logistics));
}

/**
 * How many people are behind the front for each one at it.
 *
 * Worse with distance and worse with everything a modern army has that
 * makes it good, which is why the armies best at fighting need the most
 * people not fighting.
 */
export function tailFor(depth: number, mechanisation = 1, congestion = 0): number {
  /*
   * And congestion: the same roads, the same railheads, the same three
   * bridges. A force twice the size of what the network was built for
   * does not get half the supply each — it gets less than that, because
   * the congestion is itself consuming the capacity.
   */
  return (
    (TAIL_PER_TOOTH * mechanisation + depth * TAIL_PER_DEPTH) *
    (1 + Math.max(0, congestion) * TAIL_CONGESTION)
  );
}

/** How far a force exceeds what the transport network was built for. */
export function congestionOf(force: number, capacity: number): number {
  return Math.max(0, force / Math.max(1, capacity) - 1);
}

/**
 * What a given force can actually put at the front.
 *
 * And the fact nobody believes: past a point this FALLS as the force
 * rises, because what the additional formations consume exceeds what
 * they add. The front gets weaker as the army gets bigger, and every
 * government has to be shown it twice.
 */
export function teeth(force: number, tail: number): number {
  const atFront = force / (1 + tail);
  /* Past the diminishing point the supply chain is carrying its own
     weight and some of somebody else's. */
  const penalty = tail > TAIL_DIMINISHING ? 1 - (tail - TAIL_DIMINISHING) * TAIL_PENALTY : 1;
  return atFront * Math.max(0.2, penalty);
}

/**
 * What a force of a given size can put at the front, given the network
 * it has to come down.
 *
 * The least intuitive function in the engine. It rises, peaks, and then
 * FALLS — past the peak, sending more formations forward reduces what
 * can be brought to bear, because what the new ones consume exceeds what
 * they add. Every government has to be shown it twice and does not
 * believe it either time.
 */
export function atTheFront(
  force: number,
  depth: number,
  capacity: number,
  mechanisation = 1,
): number {
  return teeth(force, tailFor(depth, mechanisation, congestionOf(force, capacity)));
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface LogisticsInputs {
  /** People under arms who are actually committed. */
  committed: number;
  /** And everybody, so the tail can be measured against it. */
  force: number;
  /** How far forward the fighting is, in sectors of depth. */
  depth: number;
  /** Whether there is a war on, and how hard. */
  atWar: boolean;
  intensity: number;
  /**
   * What industry is producing, as a multiple of peacetime.
   *
   * Comes from the war economy, arrives years after anybody asked for
   * it, and is the only thing that moves the arithmetic in this file.
   */
  output: number;
  /** What the budget is funding stockholding at. */
  funding: number;
  /** Infrastructure between the depots and the front, 0–1. */
  transport: number;
  /**
   * What the transport network was built to supply, in people.
   *
   * A force larger than this is not better supplied by being larger. It
   * is worse supplied, and so is everybody already there.
   */
  capacity: number;
  turn: number;
}

export interface LogisticsTick {
  logistics: Logistics;
  /** Classes that have crossed into warning this week. */
  warning: SupplyClass[];
  /** And into the part where it stops being a warning. */
  critical: SupplyClass[];
  /** True the week the tail starts eating the teeth. */
  diminishing: boolean;
  /** What actually reaches the front, 0–1, for every other engine. */
  throughput: number;
}

export function stepLogistics(logistics: Logistics, inputs: LogisticsInputs): LogisticsTick {
  const warning: SupplyClass[] = [];
  const critical: SupplyClass[] = [];

  /*
   * The tail, which is set by geography and mechanisation rather than by
   * anything a government decides. It gets worse the further forward the
   * front is, which is the same arithmetic as the culminating point
   * looked at from the other end.
   */
  const tail = tailFor(
    inputs.depth,
    1 + (inputs.intensity / 100) * 0.35,
    congestionOf(inputs.force, inputs.capacity),
  );

  /*
   * And what gets through. The transport network between the depots and
   * the front is the ceiling; the tail is the tax on it. Never zero,
   * because somebody always walks forward with something — but not an
   * army's worth of something.
   */
  const throughput = clamp(
    inputs.transport * (1 - (tail - TAIL_PER_TOOTH) * 0.08),
    THROUGHPUT_FLOOR,
    1.15,
  );

  const stock: Stockpile[] = logistics.stock.map((entry) => {
    const template = findSupply(entry.key);

    /*
     * Everything here is measured in weeks of SUSTAINED FULL COMBAT,
     * because that is the unit the stockpile is quoted in and the unit
     * the question is asked in. One unit of consumption is one week of
     * the whole army fighting flat out.
     *
     * Peacetime consumption is a fraction of that — one over the combat
     * draw — which is precisely why a stockpile looks comfortable for
     * the whole of peacetime and stops looking comfortable in the second
     * month of a war.
     */
    const peaceDraw = 1 / template.combatDraw;
    const committedShare = inputs.force > 0 ? inputs.committed / inputs.force : 0;
    const consumption = inputs.atWar
      ? peaceDraw + committedShare * (inputs.intensity / 100) * (1 - peaceDraw)
      : peaceDraw;

    /*
     * Production. At peace it is exactly peacetime consumption, so an
     * untouched country holds its stock exactly and any movement is
     * something this government did or something done to it. It rises
     * only as far as the war economy has actually converted, which is
     * years after anybody asked for it.
     */
    const production = peaceDraw * clamp(inputs.output, 0.4, 6) * clamp(inputs.funding, 0.4, 1.4);

    /* There is somewhere to put it, and it is not unlimited. */
    const weeks = clamp(
      entry.weeks + production - consumption,
      0,
      template.peacetimeWeeks * STORAGE_CEILING,
    );

    const before = weeksRemaining(entry);
    const after = weeksRemaining({ ...entry, weeks, production, consumption });
    if (after <= STOCK_WARNING_WEEKS && before > STOCK_WARNING_WEEKS) warning.push(entry.key);
    if (after <= STOCK_CRITICAL_WEEKS && before > STOCK_CRITICAL_WEEKS) critical.push(entry.key);

    return {
      ...entry,
      weeks,
      production,
      consumption,
      conversion: clamp((production - 1) / 4, 0, 1),
      history: [...entry.history, { turn: inputs.turn, weeks }].slice(-208),
    };
  });

  const next: Logistics = {
    stock,
    tail,
    throughput,
    history: [
      ...logistics.history,
      {
        turn: inputs.turn,
        shortest: Math.min(...stock.map((s) => weeksRemaining(s))),
        throughput,
        tail,
      },
    ].slice(-208),
  };

  return {
    logistics: next,
    warning,
    critical,
    diminishing: tail > TAIL_DIMINISHING && logistics.tail <= TAIL_DIMINISHING,
    throughput,
  };
}

/* ------------------------------------------------------------------ *
 * Describing it
 * ------------------------------------------------------------------ */

/** One line on the depots, written as the arithmetic rather than the mood. */
export function describeLogistics(logistics: Logistics, atWar: boolean): string {
  const binding = bindingConstraint(logistics);
  const template = findSupply(binding.key);
  const left = weeksRemaining(binding);

  if (Number.isFinite(left) && left <= STOCK_CRITICAL_WEEKS) {
    return `${template.label.toLowerCase()} runs out in ${left.toFixed(0)} weeks. ${template.outcome} Production takes ${template.leadMonths} months to raise, which is longer than the stock lasts, and was longer than the stock lasted on the first day too.`;
  }
  if (Number.isFinite(left) && left <= 20) {
    return `At this rate there are ${left.toFixed(0)} weeks of ${template.label.toLowerCase()} left. That figure was available on the first afternoon of this war — the stock is a number and the consumption is a number — and it has not appeared in a briefing since.`;
  }
  if (logistics.tail > TAIL_DIMINISHING) {
    return `${logistics.tail.toFixed(1)} people behind the front for every one at it. Past this point sending more formations forward reduces what can be brought to bear, because what they consume exceeds what they add.`;
  }
  if (atWar) {
    return `${(logistics.throughput * 100).toFixed(0)}% of what the front needs is reaching it, with ${logistics.tail.toFixed(1)} behind the line for every one on it.`;
  }
  return `Depots at ${logistics.stock.map((s) => `${findSupply(s.key).label.toLowerCase()} ${s.weeks.toFixed(0)}w`).join(', ')}. Nothing is being drawn down; nothing is being built up.`;
}

/** Weeks of war the country could fight before the arithmetic changes it. */
export function enduranceMonths(logistics: Logistics): number {
  const weeks = warEndurance(logistics);
  return Number.isFinite(weeks) ? weeks / (TURNS_PER_YEAR / 12) : Infinity;
}
