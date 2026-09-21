/**
 * personas.ts — a cast that persists, and remembers.
 *
 * Built once, from the run's own seed, and then carried in game state for
 * sixteen years. That is the whole design, and everything good about the
 * feature follows from it.
 *
 * WHY IN STATE RATHER THAN GENERATED EACH TURN
 *
 *   MEMORY. A leader who called the health settlement a betrayal in term
 *   one is the same leader in term four, and can be reminded of it. The
 *   remarks they have made are stored against them, and are handed to the
 *   model every time it writes in their voice, which is what keeps a
 *   persona a person rather than a style.
 *
 *   STANDING. What each of them thinks of the government moves with what
 *   the government actually did — every week, by their own temperament,
 *   in the direction the record justifies. A theatrical opponent swings
 *   fifteen points on a bad month; a dogged one barely moves for years and
 *   then does.
 *
 *   DETERMINISM. Everything here is drawn from the seeded RNG at setup and
 *   stepped by game code afterwards. No model output ever enters state
 *   except as remembered prose, which nothing reads back as a number. A
 *   run replays identically with the AI off, on, or halfway through a
 *   timeout.
 *
 * The model's job, as everywhere else in this game, is to say what these
 * people said. It never decides what they think.
 */

import { Rng } from '../rng.ts';
import {
  BACKGROUNDS,
  BEATS,
  DISPOSITIONS,
  DISPOSITION_WEIGHT,
  MASTHEAD_FIRST,
  MASTHEAD_SECOND,
  TEMPERAMENTS,
  TEMPERAMENT_VOLATILITY,
  nameBankFor,
  type Disposition,
  type Register,
  type Temperament,
} from '../content/personas.ts';
import { findCountry, type CountryKey } from '../content/world/countries.ts';
import type { Party } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How many of a person's own remarks are kept. Enough to be held to. */
export const REMARK_MEMORY = 6;

/* ------------------------------------------------------------------ *
 * The types
 * ------------------------------------------------------------------ */

export interface Remark {
  /** The absolute week, so a remark outlives the term it was made in. */
  week: number;
  /** What they were talking about. */
  about: string;
  text: string;
}

export interface Persona {
  id: string;
  name: string;
  /** The office, which is what they are addressed as. */
  title: string;
  /** The party they lead, when they lead one. */
  partyId?: string;
  /** The outlet they write for, when they write. */
  outletId?: string;
  temperament: Temperament;
  /** What they did before, which decides what they notice. */
  background: string;
  /** The beat, for a journalist. */
  beat?: string;
  /**
   * What they make of this government, −100 to 100.
   *
   * Moves every week with the record, at a rate their temperament sets. It
   * is not the same as their party's coalition mood: a partner can be in
   * government and its leader can privately think very little of the
   * person running it.
   */
  standing: number;
  /** The last few things they said, so they can be held to them. */
  remarks: Remark[];
}

export interface PressOutlet {
  id: string;
  name: string;
  disposition: Disposition;
  register: Register;
  /** Share of the country's attention, 0–1. */
  reach: number;
}

export interface Cast {
  /** One per party in the chamber, including the player's own. */
  leaders: Persona[];
  outlets: PressOutlet[];
  /** One columnist per outlet. */
  columnists: Persona[];
}

/* ------------------------------------------------------------------ *
 * Building it
 * ------------------------------------------------------------------ */

const pick = <T,>(rng: Rng, list: readonly T[]): T =>
  list[Math.min(list.length - 1, Math.floor(rng.next() * list.length))]!;

/**
 * A name nobody in the world is called, assembled from two halves.
 *
 * Drawn without replacement inside one run, so no chamber contains two
 * people with the same surname by accident.
 */
/**
 * A name from the country's own bank, with both halves held distinct.
 *
 * Exported because the officer corps draws from the same banks as the
 * benches and the press: a country has one set of names.
 */
export function makeName(rng: Rng, country: CountryKey, used: Set<string>): string {
  const bank = nameBankFor(findCountry(country).region);

  /*
   * Both halves are held apart, not just the pair.
   *
   * Deduping on the full name alone let a chamber contain two Isoldes and
   * two Marchbanks, which reads as a bug even though every name in it was
   * unique. A dozen people out of a hundred given names and a hundred
   * surnames has room to avoid it entirely.
   */
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const given = pick(rng, bank.given);
    const family = pick(rng, bank.family);
    if (used.has(`given:${given}`) || used.has(`family:${family}`)) continue;
    used.add(`given:${given}`);
    used.add(`family:${family}`);
    return `${given} ${family}`;
  }

  /* More people in the run than the bank holds distinct halves for. Take
     whatever is left rather than loop forever. */
  for (const given of bank.given) {
    for (const family of bank.family) {
      const name = `${given} ${family}`;
      if (used.has(name)) continue;
      used.add(name);
      return name;
    }
  }
  const fallback = `${pick(rng, bank.given)} ${pick(rng, bank.family)} ${used.size}`;
  used.add(fallback);
  return fallback;
}

/**
 * The cast of a run.
 *
 * Deterministic from the seed: the same run always produces the same
 * people, which is what lets a save be reopened and a turn be re-resolved
 * on a server without anybody's name changing.
 */
export function buildCast(
  parties: readonly Party[],
  country: CountryKey,
  rng: Rng,
  outletCount = 5,
): Cast {
  const used = new Set<string>();

  const leaders: Persona[] = parties.map((party) => ({
    id: `leader-${party.id}`,
    name: makeName(rng, country, used),
    title: party.leaderTitle,
    partyId: party.id,
    temperament: pick(rng, TEMPERAMENTS),
    background: pick(rng, BACKGROUNDS),
    /*
     * Where they start. A party the player will need is not warm on day
     * one and an opposition is not at war: everybody begins in the middle
     * and earns their position over the term.
     */
    standing: party.isPlayer ? 60 : Math.round(rng.range(-15, 20)),
    remarks: [],
  }));

  /* Same rule for the mastheads: three papers all called something Ledger
     is a newsstand nobody would believe. */
  const usedSecond = new Set<string>();
  const outlets: PressOutlet[] = Array.from({ length: outletCount }, (_, i) => {
    let second = pick(rng, MASTHEAD_SECOND);
    let guard = 0;
    while (usedSecond.has(second) && guard++ < 30) second = pick(rng, MASTHEAD_SECOND);
    usedSecond.add(second);
    const name = `${pick(rng, MASTHEAD_FIRST)} ${second}`;

    const disposition = DISPOSITIONS[i % DISPOSITIONS.length]!;
    const register: Register = pick(rng, [
      'broadsheet',
      'tabloid',
      'trade',
      'regional',
      'broadcast',
    ] as Register[]);

    return {
      id: `outlet-${i + 1}`,
      name,
      disposition,
      register,
      reach: Math.round(rng.range(0.08, 0.3) * DISPOSITION_WEIGHT[disposition] * 100) / 100,
    };
  });

  const columnists: Persona[] = outlets.map((outlet) => ({
    id: `columnist-${outlet.id}`,
    name: makeName(rng, country, used),
    title: 'columnist',
    outletId: outlet.id,
    temperament: pick(rng, TEMPERAMENTS),
    background: pick(rng, BACKGROUNDS),
    beat: pick(rng, BEATS),
    /* The paper's disposition is the starting point, not the person's. */
    standing: startingPress(outlet.disposition) + Math.round(rng.range(-8, 8)),
    remarks: [],
  }));

  return { leaders, outlets, columnists };
}

function startingPress(disposition: Disposition): number {
  switch (disposition) {
    case 'loyal':
      return 35;
    case 'institutional':
      return 5;
    case 'commercial':
      return 0;
    case 'sceptical':
      return -10;
    case 'populist':
      return -12;
    case 'hostile':
      return -40;
  }
}

/* ------------------------------------------------------------------ *
 * What they make of it
 * ------------------------------------------------------------------ */

export interface WeekOnTheRecord {
  /** Change in approval this week, in points. */
  approvalDelta: number;
  /** Bills the government got through this week. */
  billsPassed: number;
  /** And lost. */
  billsFailed: number;
  /** Average sector health, 0–100. */
  sectorHealth: number;
  /** Debt as a share of output. */
  debtRatio: number;
  /** Whether the economy is contracting. */
  recession: boolean;
}

/**
 * One week of the cast reading the papers.
 *
 * Everybody moves toward what the record justifies, at a rate their
 * temperament sets, and nobody moves all the way. A government that has a
 * good year earns a hostile columnist's grudging half-point a week, which
 * is roughly how long it takes in life.
 *
 * Deterministic: no randomness, no model, and the same inputs always give
 * the same cast.
 */
export function stepCast(cast: Cast, week: WeekOnTheRecord): Cast {
  const justified = judgement(week);

  const move = (persona: Persona, floor: number, ceiling: number): Persona => {
    const rate = 0.06 * TEMPERAMENT_VOLATILITY[persona.temperament];
    /* Everybody has a position they will not go past, whatever happens.
       A hostile paper does not become an admirer and a loyal one does not
       become an enemy; each of them has a range it argues inside. */
    const target = clamp(justified, floor, ceiling);
    return {
      ...persona,
      standing: Math.round((persona.standing + (target - persona.standing) * rate) * 10) / 10,
    };
  };

  return {
    ...cast,
    leaders: cast.leaders.map((leader) =>
      /* A leader in the player's own party is loyal until they are not. */
      move(leader, leader.partyId === 'player' ? 20 : -85, leader.partyId === 'player' ? 95 : 70),
    ),
    columnists: cast.columnists.map((columnist) => {
      const outlet = cast.outlets.find((o) => o.id === columnist.outletId);
      const bounds = pressBounds(outlet?.disposition ?? 'institutional');
      return move(columnist, bounds[0], bounds[1]);
    }),
    outlets: cast.outlets,
  };
}

/** What the week actually warrants, before anybody's temperament touches it. */
export function judgement(week: WeekOnTheRecord): number {
  let score = 0;
  score += week.approvalDelta * 6;
  score += (week.sectorHealth - 55) * 1.4;
  score += week.billsPassed * 8;
  score -= week.billsFailed * 10;
  score -= Math.max(0, week.debtRatio - 0.7) * 40;
  if (week.recession) score -= 18;
  return clamp(score, -100, 100);
}

function pressBounds(disposition: Disposition): [number, number] {
  switch (disposition) {
    case 'loyal':
      return [-10, 85];
    case 'institutional':
      return [-55, 55];
    case 'commercial':
      return [-60, 60];
    case 'sceptical':
      return [-70, 40];
    case 'populist':
      return [-80, 45];
    case 'hostile':
      return [-90, 15];
  }
}

/* ------------------------------------------------------------------ *
 * Being held to it
 * ------------------------------------------------------------------ */

/**
 * Record something a persona said.
 *
 * Prose in, prose out — nothing here is read back as a number, which is
 * what makes it safe to store a model's words in game state at all.
 */
export function remember(
  cast: Cast,
  personaId: string,
  remark: Remark,
): Cast {
  const update = (list: Persona[]): Persona[] =>
    list.map((p) =>
      p.id === personaId
        ? { ...p, remarks: [...p.remarks, remark].slice(-REMARK_MEMORY) }
        : p,
    );
  return { ...cast, leaders: update(cast.leaders), columnists: update(cast.columnists) };
}

export function findPersona(cast: Cast, id: string): Persona | undefined {
  return cast.leaders.find((p) => p.id === id) ?? cast.columnists.find((p) => p.id === id);
}

export function leaderOf(cast: Cast, partyId: string): Persona | undefined {
  return cast.leaders.find((p) => p.partyId === partyId);
}

export function outletOf(cast: Cast, id: string): PressOutlet | undefined {
  return cast.outlets.find((o) => o.id === id);
}

/** Where somebody stands, in a word. */
export function standingOf(persona: Persona): string {
  if (persona.standing >= 55) return 'supportive';
  if (persona.standing >= 20) return 'warm';
  if (persona.standing > -20) return 'non-committal';
  if (persona.standing > -55) return 'critical';
  return 'implacable';
}

/**
 * Everything the model needs to write in somebody's voice, and nothing else.
 *
 * Deliberately small. The persona, what they have already said, and the
 * facts of the week — never the game state, never a figure the model could
 * misread as an instruction, and never a suggestion about what to think.
 */
export function voiceContext(
  persona: Persona,
  outlet: PressOutlet | undefined,
  about: string,
  facts: Record<string, unknown>,
) {
  return {
    who: {
      name: persona.name,
      title: persona.title,
      background: persona.background,
      temperament: persona.temperament,
      standing: standingOf(persona),
      beat: persona.beat,
    },
    outlet: outlet
      ? { name: outlet.name, disposition: outlet.disposition, register: outlet.register }
      : undefined,
    /* What they have said before, so they stay the same person. */
    saidBefore: persona.remarks.map((r) => ({ about: r.about, text: r.text })),
    about,
    facts,
  };
}
