/**
 * drafting.ts — a bill the player wrote, priced by the engine.
 *
 * A player types what they want a law to do, in their own words, and a
 * model turns it into a bill. That is the only thing the model does. What
 * the bill COSTS, what it MOVES, whether it PASSES and what it does to the
 * country afterwards are all decided here, by the same code that handles
 * every hand-written bill in the game.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *
 *   The model authors. The engine adjudicates.
 *
 * That is not a stylistic preference. Three things depend on it:
 *
 *   REPLAY. A run is a seed and a list of intents. If a model's output
 *   decided an outcome, the same run would replay differently every time,
 *   and the server could not check the client's arithmetic because there
 *   would be no arithmetic to check.
 *
 *   SERVER AUTHORITY. The draft arrives from the client, which means it
 *   arrives from somewhere a determined player controls entirely. Every
 *   field is re-read here, every number is clamped here, and anything
 *   unrecognised is dropped here — so the worst a forged draft can do is
 *   produce a legal bill somebody could have written by hand.
 *
 *   BALANCE. Hand-written bills were costed against each other over many
 *   long runs. A drafted bill is held to exactly the same envelope, priced
 *   from the same table, and is not allowed to be a better deal than a
 *   bill of the same size somebody designed.
 *
 * WHAT THE MODEL IS ALLOWED TO CHOOSE
 *
 * A title, a summary, the trade-off, a category, a size, a position on the
 * three ideology axes, and a set of effects drawn from a fixed vocabulary.
 * That is a large space — large enough that two players describing the same
 * idea get different bills — and it contains nothing the engine cannot
 * already resolve.
 *
 * WHAT IT IS NOT ALLOWED TO CHOOSE
 *
 * Whether the bill passes. What the chamber thinks. What it costs in
 * political capital. Anything not in the vocabulary below. And it may not
 * exceed the envelope: a draft that asks for eight times what a major bill
 * has ever delivered comes back clamped to what a major bill delivers, with
 * the clamp recorded so the player can see it happened.
 */

import { makeIdeology } from '../ideology.ts';
import { SECTOR_KEYS } from '../balance.ts';
import { INDUSTRY_TEMPLATES } from '../content/industries.ts';
import type {
  Bill,
  BillCategory,
  BillMagnitude,
  Effects,
  Ideology,
  SectorKey,
} from '../types.ts';
import type { IndustryKey } from '../content/industries.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

export const BILL_CATEGORIES: BillCategory[] = [
  'fiscal',
  'health',
  'education',
  'infrastructure',
  'environment',
  'labour',
  'civic',
  'security',
];

/**
 * The envelope, per size of bill.
 *
 * Taken from what the hand-written bills actually do, so a drafted bill of
 * a given size is worth what a designed bill of that size is worth and no
 * more. Every figure is in the units the engine already uses, at the scale
 * it is calibrated at — the country's own scale is applied when the effects
 * are resolved, the same way it is for every other bill.
 */
export interface Envelope {
  approval: number;
  treasury: number;
  debt: number;
  revenueDelta: number;
  sectorDelta: number;
  fundingDelta: number;
  industryDelta: number;
  coalitionMood: number;
  /** How many different things one bill may move. */
  levers: number;
}

export const ENVELOPE: Record<BillMagnitude, Envelope> = {
  minor: {
    approval: 3,
    treasury: 30,
    debt: 30,
    revenueDelta: 40,
    sectorDelta: 4,
    fundingDelta: 30,
    industryDelta: 5,
    coalitionMood: 6,
    levers: 4,
  },
  major: {
    approval: 6,
    treasury: 70,
    debt: 80,
    revenueDelta: 120,
    sectorDelta: 7,
    fundingDelta: 60,
    industryDelta: 9,
    coalitionMood: 10,
    levers: 6,
  },
};

/**
 * What a bill has to give up for what it takes.
 *
 * The one piece of balance a drafted bill cannot be trusted with, because a
 * model asked to write a law will write a good one. Every benefit is scored
 * and every cost is scored, and a draft whose benefits outrun its costs has
 * its benefits cut until they do not.
 *
 * The weights are relative prices, not units: a point of approval is worth
 * roughly ten billion, a point of sector health roughly eight, and a
 * recurring billion a year is worth about three one-off billions because it
 * arrives every year for the rest of the run.
 */
const PRICE = {
  approval: 10,
  sectorDelta: 8,
  industryDelta: 4,
  coalitionMood: 2,
  fundingDelta: 1.2,
  revenueDelta: 3,
  treasury: 1,
  debt: 1,
};

/** How much more a bill may give than it takes, before it is cut back. */
export const BENEFIT_ALLOWANCE = 1.15;

/**
 * And how much a bill may give away for nothing at all.
 *
 * Small popular measures that cost the treasury nothing do exist — an
 * inquiry, a right of appeal, a bank holiday — and a rule that priced
 * every one of them out would be wrong about how legislatures work. The
 * allowance is roughly three points of approval, which is a good week and
 * not a re-election.
 */
export const FREE_ALLOWANCE = 30;

/* ------------------------------------------------------------------ *
 * What arrives from outside
 * ------------------------------------------------------------------ */

/**
 * The shape a draft claims to have.
 *
 * Every field optional and every field `unknown`, because this is parsed
 * from JSON produced by a language model and relayed through a client. It
 * is data, not a type — the function below is what turns it into one.
 */
export interface RawDraft {
  title?: unknown;
  summary?: unknown;
  tradeoff?: unknown;
  category?: unknown;
  magnitude?: unknown;
  ideology?: unknown;
  effects?: unknown;
}

/** What the engine made of it, and what it had to change. */
export interface DraftResult {
  bill: Bill;
  /** Every clamp, drop and rewrite, in the player's language. */
  notes: string[];
}

const text = (value: unknown, fallback: string, max: number): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
};

const number = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const axis = (value: unknown): number => clamp(number(value) ?? 0, -1, 1);

/* ------------------------------------------------------------------ *
 * Reading a draft
 * ------------------------------------------------------------------ */

/**
 * Turn whatever arrived into a bill this engine can resolve.
 *
 * Never throws and never rejects: a draft that is complete nonsense becomes
 * a small, dull, legal bill rather than an error, because a player who has
 * just typed a paragraph should get a bill back. What it will not do is
 * produce anything outside the envelope, and everything it changed is in
 * `notes` so the change is visible rather than silent.
 */
export function readDraft(
  raw: RawDraft,
  id: string,
  description: string,
): DraftResult {
  const notes: string[] = [];

  const magnitude: BillMagnitude = raw.magnitude === 'major' ? 'major' : 'minor';
  const envelope = ENVELOPE[magnitude];

  const category = BILL_CATEGORIES.includes(raw.category as BillCategory)
    ? (raw.category as BillCategory)
    : fallbackCategory(description);
  if (!BILL_CATEGORIES.includes(raw.category as BillCategory)) {
    notes.push(`Filed under ${category}: the draft did not name a recognised category.`);
  }

  const position = raw.ideology as Record<string, unknown> | undefined;
  const ideology: Ideology = makeIdeology(
    axis(position?.economic),
    axis(position?.social),
    axis(position?.environmental),
  );

  const { effects, effectNotes } = readEffects(raw.effects, envelope);
  notes.push(...effectNotes);

  const priced = price(effects);
  notes.push(...priced.notes);

  return {
    bill: {
      id,
      templateKey: `drafted-${id}`,
      title: text(raw.title, 'Members’ Bill', 60),
      summary: text(raw.summary, description, 240),
      tradeoff: text(
        raw.tradeoff,
        'The draft did not say what this costs. Something always does.',
        240,
      ),
      category,
      magnitude,
      ideology,
      effects: priced.effects,
      status: 'available',
      passChance: null,
      pcSpent: 0,
      whipSteps: 0,
      turnProposed: null,
      turnResolved: null,
      amendments: 0,
      committeeBonus: 0,
      committeeReturnsOn: null,
      crossbenchDeals: 0,
      /* Marked, permanently and visibly. A bill the player wrote is a bill
         the player wrote, in the journal and in the record. */
      drafted: true,
      draftPrompt: text(description, '', 400),
      draftNotes: notes,
    },
    notes,
  };
}

/** Somewhere to file a bill whose category nobody could read. */
function fallbackCategory(description: string): BillCategory {
  const lower = description.toLowerCase();
  const guesses: [RegExp, BillCategory][] = [
    [/tax|budget|spend|deficit|revenue|duty|levy/, 'fiscal'],
    [/health|hospital|doctor|nhs|care|medicine|patient/, 'health'],
    [/school|univers|student|teach|educat|skill|train/, 'education'],
    [/road|rail|bridge|port|grid|broadband|housing|build/, 'infrastructure'],
    [/climate|carbon|emission|environ|nature|pollut|energy/, 'environment'],
    [/wage|union|worker|employ|labour|labor|job|strike/, 'labour'],
    [/police|crime|defence|defense|army|border|security|terror/, 'security'],
  ];
  for (const [pattern, category] of guesses) {
    if (pattern.test(lower)) return category;
  }
  return 'civic';
}

/* ------------------------------------------------------------------ *
 * Reading the effects
 * ------------------------------------------------------------------ */

function readEffects(
  raw: unknown,
  envelope: Envelope,
): { effects: Effects; effectNotes: string[] } {
  const effectNotes: string[] = [];
  const source = (raw ?? {}) as Record<string, unknown>;
  const effects: Effects = {};

  const scalar = (
    key: 'approval' | 'treasury' | 'debt' | 'revenueDelta' | 'coalitionMood',
    limit: number,
    label: string,
    unit: string,
  ) => {
    const value = number(source[key]);
    if (value === null || value === 0) return;
    const held = clamp(value, -limit, limit);
    if (Math.abs(held - value) > 0.01) {
      effectNotes.push(
        `${label} held at ${held > 0 ? '+' : ''}${round(held)}${unit}: a ${
          envelope === ENVELOPE.major ? 'major' : 'minor'
        } bill does not move it further.`,
      );
    }
    effects[key] = round(held);
  };

  scalar('approval', envelope.approval, 'Approval', ' pts');
  scalar('treasury', envelope.treasury, 'Treasury', '₡bn');
  scalar('debt', envelope.debt, 'Debt', '₡bn');
  scalar('revenueDelta', envelope.revenueDelta, 'Recurring revenue', '₡bn/yr');
  scalar('coalitionMood', envelope.coalitionMood, 'Coalition mood', ' pts');

  const sectorDeltas = readMap(
    source.sectorDeltas,
    SECTOR_KEYS as readonly string[],
    envelope.sectorDelta,
  );
  if (Object.keys(sectorDeltas.kept).length > 0) {
    effects.sectorDeltas = sectorDeltas.kept as Partial<Record<SectorKey, number>>;
  }
  effectNotes.push(...noteDrops(sectorDeltas.dropped, 'sector'));

  const fundingDeltas = readMap(
    source.fundingDeltas,
    SECTOR_KEYS as readonly string[],
    envelope.fundingDelta,
  );
  if (Object.keys(fundingDeltas.kept).length > 0) {
    effects.fundingDeltas = fundingDeltas.kept as Partial<Record<SectorKey, number>>;
  }
  effectNotes.push(...noteDrops(fundingDeltas.dropped, 'sector'));

  const industryKeys = INDUSTRY_TEMPLATES.map((t) => t.key as string);
  const industryDeltas = readMap(source.industryDeltas, industryKeys, envelope.industryDelta);
  if (Object.keys(industryDeltas.kept).length > 0) {
    effects.industryDeltas = industryDeltas.kept as Partial<Record<IndustryKey, number>>;
  }
  effectNotes.push(...noteDrops(industryDeltas.dropped, 'industry'));

  /*
   * A bill may not pull every lever at once. Without this a drafted bill
   * would always be a better deal than a designed one simply by touching
   * more things, which is not a policy and is not a trade-off.
   */
  const levers = countLevers(effects);
  if (levers > envelope.levers) {
    trimTo(effects, envelope.levers);
    effectNotes.push(
      `Trimmed to ${envelope.levers} measures: one bill does not do ${levers} things at once.`,
    );
  }

  return { effects, effectNotes };
}

function readMap(
  raw: unknown,
  allowed: readonly string[],
  limit: number,
): { kept: Record<string, number>; dropped: string[] } {
  const kept: Record<string, number> = {};
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object') return { kept, dropped };

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.includes(key)) {
      dropped.push(key);
      continue;
    }
    const n = number(value);
    if (n === null || n === 0) continue;
    kept[key] = round(clamp(n, -limit, limit));
  }
  return { kept, dropped };
}

function noteDrops(dropped: readonly string[], what: string): string[] {
  if (dropped.length === 0) return [];
  return [`Dropped ${dropped.length} unrecognised ${what} name${dropped.length > 1 ? 's' : ''}.`];
}

function countLevers(effects: Effects): number {
  let count = 0;
  for (const key of ['approval', 'treasury', 'debt', 'revenueDelta', 'coalitionMood'] as const) {
    if (effects[key]) count += 1;
  }
  count += Object.keys(effects.sectorDeltas ?? {}).length;
  count += Object.keys(effects.fundingDeltas ?? {}).length;
  count += Object.keys(effects.industryDeltas ?? {}).length;
  return count;
}

/** Keep the largest levers and drop the rest, so the bill stays recognisable. */
function trimTo(effects: Effects, limit: number): void {
  const entries: { drop: () => void; weight: number }[] = [];

  for (const key of ['approval', 'treasury', 'debt', 'revenueDelta', 'coalitionMood'] as const) {
    const value = effects[key];
    if (value) {
      entries.push({
        weight: Math.abs(value) * PRICE[key === 'coalitionMood' ? 'coalitionMood' : key],
        drop: () => delete effects[key],
      });
    }
  }
  for (const group of ['sectorDeltas', 'fundingDeltas', 'industryDeltas'] as const) {
    const map = effects[group] as Record<string, number> | undefined;
    if (!map) continue;
    const weightKey =
      group === 'sectorDeltas'
        ? 'sectorDelta'
        : group === 'fundingDeltas'
          ? 'fundingDelta'
          : 'industryDelta';
    for (const [key, value] of Object.entries(map)) {
      entries.push({
        weight: Math.abs(value) * PRICE[weightKey],
        drop: () => {
          delete map[key];
          if (Object.keys(map).length === 0) delete effects[group];
        },
      });
    }
  }

  entries.sort((a, b) => a.weight - b.weight);
  for (let i = 0; i < entries.length - limit; i += 1) entries[i]!.drop();
}

/* ------------------------------------------------------------------ *
 * Making it cost something
 * ------------------------------------------------------------------ */

/** What a bundle gives and what it takes, on one scale. */
export function weigh(effects: Effects): { benefit: number; cost: number } {
  let benefit = 0;
  let cost = 0;

  const add = (value: number, weight: number, goodWhenPositive = true) => {
    const good = goodWhenPositive ? value > 0 : value < 0;
    const size = Math.abs(value) * weight;
    if (good) benefit += size;
    else cost += size;
  };

  add(effects.approval ?? 0, PRICE.approval);
  add(effects.coalitionMood ?? 0, PRICE.coalitionMood);
  add(effects.treasury ?? 0, PRICE.treasury);
  add(effects.revenueDelta ?? 0, PRICE.revenueDelta);
  /* Debt the other way round: more of it is the cost, less of it is the win. */
  add(effects.debt ?? 0, PRICE.debt, false);

  for (const value of Object.values(effects.sectorDeltas ?? {})) {
    add(value ?? 0, PRICE.sectorDelta);
  }
  for (const value of Object.values(effects.fundingDeltas ?? {})) {
    /* Funding is spending: it helps the sector and it is money out. */
    benefit += Math.max(0, value ?? 0) * PRICE.fundingDelta;
    cost += Math.abs(value ?? 0) * PRICE.fundingDelta * 0.8;
  }
  for (const value of Object.values(effects.industryDeltas ?? {})) {
    add(value ?? 0, PRICE.industryDelta);
  }

  return { benefit, cost };
}

/**
 * Make the bill pay for itself.
 *
 * A model asked to draft a law will draft a good one — every benefit, no
 * cost, and a summary explaining why there is no cost. Every hand-written
 * bill in this game has a real price against a real gain, and a drafted one
 * has to as well or the feature is a cheat code with a text box.
 *
 * The cut is proportional and it is reported. A player who writes a wish
 * gets a bill and an explanation of which half of it survived.
 */
function price(effects: Effects): { effects: Effects; notes: string[] } {
  const notes: string[] = [];
  const { benefit, cost } = weigh(effects);

  /* A bill with no benefit at all is somebody's austerity programme, and
     is perfectly legal. Only free lunches are refused. */
  if (benefit <= 0) return { effects, notes };

  const allowed = Math.max(cost * BENEFIT_ALLOWANCE, FREE_ALLOWANCE);
  if (benefit <= allowed) return { effects, notes };

  const factor = allowed / benefit;
  const scaled = scaleBenefits(effects, factor);
  notes.push(
    `Scaled back to ${Math.round(factor * 100)}% of what the draft claimed: it asked for ` +
      'more than it was willing to give up, and the chamber prices bills against each other.',
  );
  return { effects: scaled, notes };
}

function scaleBenefits(effects: Effects, factor: number): Effects {
  const out: Effects = { ...effects };

  const shrink = (value: number | undefined, goodWhenPositive = true): number | undefined => {
    if (!value) return value;
    const good = goodWhenPositive ? value > 0 : value < 0;
    return good ? round(value * factor) : value;
  };

  out.approval = shrink(out.approval);
  out.coalitionMood = shrink(out.coalitionMood);
  out.treasury = shrink(out.treasury);
  out.revenueDelta = shrink(out.revenueDelta);
  out.debt = shrink(out.debt, false);

  for (const group of ['sectorDeltas', 'fundingDeltas', 'industryDeltas'] as const) {
    const map = effects[group] as Record<string, number> | undefined;
    if (!map) continue;
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(map)) {
      next[key] = value > 0 ? round(value * factor) : value;
    }
    (out as Record<string, unknown>)[group] = next;
  }

  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ *
 * What the model is told
 * ------------------------------------------------------------------ */

/**
 * The vocabulary, as data.
 *
 * Sent to the model with every request rather than written into its prompt,
 * so that adding a sector or an industry to the game teaches the drafter
 * about it without anybody editing a prompt in a different repository.
 */
export function draftingVocabulary(magnitude: BillMagnitude = 'major') {
  return {
    categories: BILL_CATEGORIES,
    magnitudes: ['minor', 'major'],
    sectors: SECTOR_KEYS,
    industries: INDUSTRY_TEMPLATES.map((t) => t.key),
    limits: ENVELOPE[magnitude],
    axes: {
      economic: 'negative is collective provision, positive is market provision',
      social: 'negative is traditional order, positive is individual latitude',
      environmental: 'negative is industrial priority, positive is ecological priority',
    },
  };
}

/** A one-line reading of what a drafted bill would do, before it is tabled. */
export function describeDraft(bill: Bill): string {
  const { benefit, cost } = weigh(bill.effects);
  if (benefit <= 0 && cost <= 0) return 'A bill that changes nothing anybody can measure.';
  const ratio = cost > 0 ? benefit / cost : Infinity;
  if (ratio > 1.05) return 'Gives a little more than it takes, which is why it will be popular.';
  if (ratio < 0.7) return 'Costs considerably more than it returns. Somebody has to argue for it.';
  return 'Gives about what it takes. An honest bill, and a hard one to sell.';
}
