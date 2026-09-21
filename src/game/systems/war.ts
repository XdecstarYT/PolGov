/**
 * war.ts — the lifecycle of a conflict, from declaration to the timeline.
 *
 * Four ideas, and the first is the one everything else hangs on.
 *
 * WARS ARE NOT ENDED BY RUNNING OUT OF SOLDIERS. They are ended when one
 * side's government can no longer carry its own population. So this
 * engine models a race between two exhaustions, and exhaustion is
 * political: it rises with casualties, with the cost, with how long
 * nothing has visibly been achieved, and with how little the war has to
 * do with the people being asked to pay for it. A country defending its
 * own territory will absorb an enormous amount before it tires. The same
 * country intervening somewhere else will not.
 *
 * MILITARY SUCCESS AND POLITICAL SUCCESS COME APART, and the gap is a
 * property of the war rather than of the government. Each kind carries a
 * `legibility`: how far winning engagements reads as winning. It is high
 * in a defensive war, where holding the line IS the achievement, and
 * very low in a counter-insurgency, where there is no day on which
 * anything can be said to have been won. A government can take ground
 * every week for three years and be destroyed by it.
 *
 * VICTORY IS NOT ONE THING. Each war aim has its own difficulty, and the
 * score needed to claim it is the score times that. Surviving is cheap.
 * Removing a government is the most expensive thing on the list and the
 * one most often attempted.
 *
 * And a war OUTLIVES ITS GOVERNMENT. Everything here is written into a
 * historical record that persists for the rest of the run, because the
 * point of modelling a war in a political game is what a country is like
 * afterwards.
 */

import {
  EXHAUSTION_CASUALTY_WEIGHT,
  EXHAUSTION_COST_WEIGHT,
  EXHAUSTION_BREAKS,
  EXHAUSTION_STALEMATE_WEIGHT,
  THEIR_RELIEF,
  TURNS_PER_YEAR,
  WAR_SCORE_ADJUST,
  WAR_SCORE_TO_WIN,
} from '../balance.ts';
import {
  WAR_AIM_DIFFICULTY,
  findWarKind,
  type WarAim,
  type WarKind,
  type WarOutcome,
} from '../content/war.ts';
import type { War, WarRecord, WarSide } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening one
 * ------------------------------------------------------------------ */

export interface DeclareWarOptions {
  id: string;
  kind: WarKind;
  /** Who it is against. A civil war names the country itself. */
  against: string;
  aim: WarAim;
  /** Who started it. A government that did not is treated very differently. */
  initiator: 'us' | 'them';
  allies: string[];
  theirAllies: string[];
  turn: number;
  /** A line for the history, written when it begins rather than after. */
  casus: string;
}

export function declareWar(options: DeclareWarOptions): War {
  const template = findWarKind(options.kind);
  const side = (): WarSide => ({
    exhaustion: 0,
    casualties: 0,
    materiel: 0,
    resolve: 70,
    committed: 0,
  });

  return {
    id: options.id,
    kind: options.kind,
    against: options.against,
    aim: options.aim,
    initiator: options.initiator,
    allies: [...options.allies],
    theirAllies: [...options.theirAllies],
    startedTurn: options.turn,
    /* The rally is spent from the moment it is granted. */
    rally: template.rally,
    score: 0,
    intensity: 30,
    us: side(),
    them: { ...side(), resolve: 70 },
    /* Nothing has happened yet, so nothing is known about how it is
       going. A government at war learns what it is doing from reports
       that are late, partial and shaped by whoever wrote them. */
    reportedScore: 0,
    ended: false,
    endedTurn: null,
    outcome: null,
    casus: options.casus,
    events: [],
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading one
 * ------------------------------------------------------------------ */

/** How long it has been going, in years. */
export function warYears(war: War, turn: number): number {
  return ((war.ended && war.endedTurn !== null ? war.endedTurn : turn) - war.startedTurn) /
    TURNS_PER_YEAR;
}

/**
 * The score a side needs to claim its aim, 0–100.
 *
 * Surviving is cheap. Removing a government is not, and the difference
 * between them is the most common reason a war that was going well ends
 * without anybody getting what they came for.
 */
export function scoreToWin(war: War): number {
  return clamp(WAR_SCORE_TO_WIN * WAR_AIM_DIFFICULTY[war.aim], 10, 98);
}

/**
 * And the score at which it is lost, which is NOT the mirror of winning.
 *
 * A country whose aim is to survive is very hard to beat: the other side
 * has to achieve a great deal before anything is settled. A country whose
 * aim is to remove a foreign government is easy to beat, because falling
 * short of an enormous objective is failure and everyone can see it.
 *
 * So ambition cuts both ways, and the two thresholds move in opposite
 * directions. Written as the mirror of `scoreToWin`, a defensive war was
 * lost by being twenty points down — which is not how a country is
 * conquered.
 */
export function scoreToLose(war: War): number {
  return clamp(WAR_SCORE_TO_WIN * (2.1 - WAR_AIM_DIFFICULTY[war.aim]), 10, 98);
}

/**
 * How much of the military success is actually visible as success.
 *
 * The gap between winning and being seen to be winning, which is a
 * property of the war rather than of the government prosecuting it.
 */
export function politicalReturn(war: War): number {
  return findWarKind(war.kind).legibility;
}

/** Which side is closer to being unable to continue. */
export function losingTheRace(war: War): 'us' | 'them' | 'neither' {
  const gap = war.us.exhaustion - war.them.exhaustion;
  if (gap > 12) return 'us';
  if (gap < -12) return 'them';
  return 'neither';
}

/**
 * What the government would be able to claim if it stopped today.
 *
 * Not the same as the score: a war can be going well militarily and be
 * unclaimable politically, and a government that has run out of
 * exhaustion cannot hold out for the better terms it can see coming.
 */
export function availableOutcome(war: War): WarOutcome {
  const needed = scoreToWin(war);
  if (war.score >= needed) return 'victory';
  if (war.score >= needed * 0.55) return 'favourable_settlement';
  if (war.score <= -scoreToLose(war)) return 'defeat';
  if (war.score <= -scoreToLose(war) * 0.55) return 'unfavourable_settlement';
  if (war.us.exhaustion > 80) return findWarKind(war.kind).homeland ? 'stalemate' : 'withdrawal';
  return 'status_quo';
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface WarInputs {
  /**
   * How the fighting itself went this week, -1 to 1.
   *
   * Supplied by the theatre engine. Everything in this file is what
   * follows from it politically, which is the part a head of government
   * actually experiences.
   */
  battlefield: number;
  /** Casualties this week, in thousands, on each side. */
  ourCasualties: number;
  theirCasualties: number;
  /** What the week cost, as a share of a year's output. */
  costShare: number;
  /** How much of the country's force is committed, 0–1. */
  committed: number;
  /** Materiel lost this week, as an index. */
  ourMateriel: number;
  theirMateriel: number;
  /** Whether the country still believes in its institutions. */
  institutionalTrust: number;
  /** And in this particular war. Moves with the media and the opposition. */
  publicSupport: number;
  /** Allies actually contributing, which changes the burden. */
  allyContribution: number;
  /** How good the reporting is, 0–1. Decides what the government knows. */
  intelligenceQuality: number;
  turn: number;
  /** Deterministic noise, so a replayed turn produces the same week. */
  noise: number;
}

export interface WarTick {
  war: War;
  /** True the week the war ends, whatever the outcome. */
  ended: boolean;
  /** Things worth putting in the report. */
  events: string[];
  /** True the week exhaustion crosses the point a government cannot hold. */
  breaking: boolean;
}

export function stepWar(war: War, inputs: WarInputs): WarTick {
  if (war.ended) return { war, ended: false, events: [], breaking: false };

  const template = findWarKind(war.kind);
  const events: string[] = [];
  const years = warYears(war, inputs.turn);

  /* ---- 1. The score. ---- */
  /*
   * The war score follows the battlefield, slowly. A single good week
   * does not win a war and a single bad one does not lose it, which is
   * the main thing a government under daily pressure gets wrong about
   * the war it is running.
   */
  const score = clamp(war.score + inputs.battlefield * 100 * WAR_SCORE_ADJUST, -100, 100);

  /*
   * And what the government THINKS the score is. Reports are late,
   * partial and written by people with an interest in them. Good
   * intelligence narrows the gap; it never closes it.
   */
  const fog = (1 - clamp(inputs.intelligenceQuality, 0, 1)) * 22;
  const reportedScore = clamp(
    war.reportedScore + (score + inputs.noise * fog - war.reportedScore) * 0.18,
    -100,
    100,
  );

  /* ---- 2. Exhaustion, which is what actually decides it. ---- */
  /*
   * Casualties, cost, and the absence of visible progress. The third is
   * the largest term in the kinds of war where nothing is ever visibly
   * achieved, which is why those are the wars that end governments.
   */
  const stalemate = Math.max(0, 1 - Math.abs(score) / 40) * (1 - template.legibility);
  const ourPressure =
    inputs.ourCasualties * EXHAUSTION_CASUALTY_WEIGHT +
    inputs.costShare * EXHAUSTION_COST_WEIGHT +
    stalemate * EXHAUSTION_STALEMATE_WEIGHT;

  /*
   * Relief. A country that believes in its institutions carries more, a
   * coalition shares the burden, and a war on one's own soil is borne
   * very differently from one somewhere else — the last being the single
   * largest term here and the reason expeditionary wars end early.
   */
  const relief =
    (inputs.institutionalTrust / 100) * 0.3 +
    inputs.allyContribution * 0.25 +
    (template.homeland ? 0.35 : 0) +
    (war.initiator === 'them' ? 0.2 : 0);

  const exhaustion = clamp100(
    war.us.exhaustion +
      (template.exhaustionRate * 100 + ourPressure) * clamp(1 - relief, 0.15, 1.4),
  );

  /*
   * Theirs, on the same terms but without the detail. What a government
   * knows about the other side's capacity to continue is an estimate,
   * and it is the estimate wars are lost by getting wrong.
   */
  const theirExhaustion = clamp100(
    war.them.exhaustion +
      (template.exhaustionRate * 100 +
        inputs.theirCasualties * EXHAUSTION_CASUALTY_WEIGHT +
        Math.max(0, 1 - Math.abs(score) / 40) * EXHAUSTION_STALEMATE_WEIGHT * 0.8) *
        /* The other side gets relief too. Denied it, they exhausted three
           times faster than we did and every war was won by outlasting an
           opponent who had been given no capacity to outlast anybody. */
        THEIR_RELIEF,
  );

  /* ---- 3. The rally, which is being spent. ---- */
  const rally = Math.max(0, war.rally * (1 - template.rallyDecay) - 0.02);
  if (war.rally > 3 && rally <= 3) {
    events.push(
      'The rally is over. Whatever standing this war was worth on the day it started has now been spent, and from here it is judged on what it has achieved.',
    );
  }

  /* ---- 4. Resolve. ---- */
  /*
   * Derived from exhaustion rather than accumulated alongside it. Kept as
   * its own accumulator it drained at two points a week against an
   * exhaustion rising at one, so every war in the game ended inside five
   * months — two numbers measuring the same thing and disagreeing about
   * how fast it moved.
   */
  const ourResolve = clamp100(100 - exhaustion * 0.85 + (inputs.publicSupport - 50) * 0.2);
  const theirResolve = clamp100(100 - theirExhaustion * 0.85);

  const intensity = clamp100(
    war.intensity + (inputs.committed * 100 * template.commitment - war.intensity) * 0.06,
  );

  const next: War = {
    ...war,
    score,
    reportedScore,
    rally,
    intensity,
    us: {
      exhaustion,
      casualties: war.us.casualties + inputs.ourCasualties,
      materiel: war.us.materiel + inputs.ourMateriel,
      resolve: ourResolve,
      committed: inputs.committed,
    },
    them: {
      exhaustion: theirExhaustion,
      casualties: war.them.casualties + inputs.theirCasualties,
      materiel: war.them.materiel + inputs.theirMateriel,
      resolve: theirResolve,
      committed: war.them.committed,
    },
    history: [
      ...war.history,
      {
        turn: inputs.turn,
        score,
        ourExhaustion: exhaustion,
        theirExhaustion,
        intensity,
      },
    ].slice(-416),
  };

  /* ---- 5. Endings. ---- */
  let ended = false;
  let outcome: WarOutcome | null = null;

  /*
   * Endings run off the score and off exhaustion, which are the two
   * things a war is actually decided by. Resolve is a reading of
   * exhaustion and is not tested separately.
   */
  if (score >= scoreToWin(next)) {
    outcome = 'victory';
  } else if (score <= -scoreToLose(next)) {
    outcome = 'defeat';
  } else if (exhaustion >= EXHAUSTION_BREAKS) {
    /* The country cannot carry it any longer. Which of these it is
       depends on whether there is anywhere to withdraw to. */
    outcome = template.homeland ? 'unfavourable_settlement' : 'withdrawal';
  } else if (theirExhaustion >= EXHAUSTION_BREAKS) {
    outcome = score >= 0 ? 'favourable_settlement' : 'status_quo';
  } else if (years > 12 && Math.abs(score) < 15) {
    outcome = 'stalemate';
  }

  if (outcome) {
    ended = true;
    next.ended = true;
    next.endedTurn = inputs.turn;
    next.outcome = outcome;
  }

  const breaking = exhaustion > 78 && war.us.exhaustion <= 78;
  if (breaking) {
    events.push(
      'The country is at the end of what it will carry for this. Whatever is going to be settled has to be settled now, on whatever terms are available, because the terms available in six months will be worse.',
    );
  }

  return { war: next, ended, events, breaking };
}

/* ------------------------------------------------------------------ *
 * What the history remembers
 * ------------------------------------------------------------------ */

/**
 * Write a finished war into the record.
 *
 * The point of modelling a war in a political game is what the country
 * is like afterwards, so this is kept for the rest of the run and read
 * by the career summary fifty years later.
 */
export function recordWar(
  war: War,
  name: string,
  extra: Omit<WarRecord, 'id' | 'name' | 'kind' | 'against' | 'aim' | 'outcome' | 'startedTurn' | 'endedTurn' | 'casualties' | 'peakIntensity' | 'casus'>,
): WarRecord {
  return {
    id: war.id,
    name,
    kind: war.kind,
    against: war.against,
    aim: war.aim,
    outcome: war.outcome ?? 'stalemate',
    startedTurn: war.startedTurn,
    endedTurn: war.endedTurn ?? war.startedTurn,
    casualties: war.us.casualties + war.them.casualties,
    peakIntensity: Math.max(0, ...war.history.map((h) => h.intensity)),
    casus: war.casus,
    ...extra,
  };
}

/** What a government is being told, which is not what is happening. */
export function describeWar(war: War, turn: number): string {
  const template = findWarKind(war.kind);
  const years = warYears(war, turn);

  if (war.ended) {
    return `${template.label}, ${years.toFixed(1)} years, ${(war.us.casualties + war.them.casualties).toFixed(0)}k casualties. ${war.outcome}.`;
  }
  if (war.us.exhaustion > 78) {
    return `${years.toFixed(1)} years in. The country is at the end of what it will carry: exhaustion at ${war.us.exhaustion.toFixed(0)} against their ${war.them.exhaustion.toFixed(0)}. Wars are not ended by running out of soldiers.`;
  }
  if (Math.abs(war.reportedScore) < 12 && years > 1.5) {
    return `${years.toFixed(1)} years, and the reports do not describe progress in either direction. ${template.legibility < 0.4 ? 'They were never going to: there is no day on which this kind of war can be said to have been won.' : 'The line has not moved.'}`;
  }
  return `${template.label} against ${war.against}, ${years.toFixed(1)} years. The despatches put it at ${war.reportedScore > 0 ? '+' : ''}${war.reportedScore.toFixed(0)}; exhaustion ${war.us.exhaustion.toFixed(0)} against ${war.them.exhaustion.toFixed(0)}.`;
}
