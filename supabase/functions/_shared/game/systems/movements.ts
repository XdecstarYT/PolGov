/**
 * movements.ts — what a country does when asking nicely stops working.
 *
 * A movement forms when three things coincide, and only then: a
 * GRIEVANCE the engine is already measuring, a CONSTITUENCY that carries
 * it, and enough MOBILISATION for anybody to act on it. Remove any one
 * and nothing happens — which is why a country with terrible problems
 * and no belief that acting works stays quiet, and why a contented
 * country with every reason to believe in itself also stays quiet.
 *
 * Once formed, a movement escalates when it is ignored. It starts with
 * petitions because petitions are what people try first, and it works
 * through its own repertoire toward whatever it is prepared to do. The
 * government's four answers are the decision this file exists for, and
 * none of them is free:
 *
 *   CONCEDE   costs money now and raises efficacy — the belief that
 *             acting works — which means MORE movements later. A
 *             government that always concedes builds a mobilised country
 *             it cannot afford.
 *
 *   NEGOTIATE costs political capital and buys time. The grievance is
 *             not addressed, so the movement comes back.
 *
 *   IGNORE    is free this week. The movement escalates, and the next
 *             tactic costs the country more than the concession would
 *             have.
 *
 *   SUPPRESS  works, briefly. It costs the norms, trust in the police,
 *             and the sympathy of everybody watching, and it converts a
 *             movement about housing into a movement about the
 *             government. A country suppressed into quiet is the most
 *             dangerous state in this engine and the one that looks best
 *             on every measure.
 *
 * There is no correct answer. That is the point of modelling it.
 */

import {
  CONCESSION_EFFICACY_GAIN,
  MOVEMENT_DECAY,
  MOVEMENT_FORM_THRESHOLD,
  MOVEMENT_SUPPORT_RATE,
  SUPPRESSION_BACKFIRE,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  MOVEMENT_TEMPLATES,
  TACTIC_DISRUPTION,
  findMovement,
  type MovementKey,
  type Tactic,
} from '../content/movements.ts';
import type { Movement, Movements, MovementResponse } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildMovements(): Movements {
  return { active: [], resolved: [], efficacyPressure: 0, history: [] };
}

/* ------------------------------------------------------------------ *
 * Reading them
 * ------------------------------------------------------------------ */

/** How much disruption the live movements are causing between them. */
export function disruption(movements: Movements): number {
  return movements.active.reduce(
    (sum, m) => sum + TACTIC_DISRUPTION[m.tactic] * (m.support / 100) * (m.intensity / 100),
    0,
  );
}

/** The movement a government most needs to answer. */
export function loudest(movements: Movements): Movement | null {
  if (movements.active.length === 0) return null;
  return movements.active.reduce((a, b) =>
    TACTIC_DISRUPTION[b.tactic] * b.support > TACTIC_DISRUPTION[a.tactic] * a.support ? b : a,
  );
}

/** What conceding to a movement would cost, ₡bn a year. */
export function concessionCost(movement: Movement, gdp: number): number {
  return findMovement(movement.key).concessionCost * gdp * (movement.support / 60);
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface MovementInputs {
  /** How bad each grievance is, 0–1, from the social register. */
  severity: (key: string) => number;
  /** Frustration times the belief that acting works. The hinge. */
  mobilisation: number;
  /** Which is made of these two. */
  frustration: number;
  efficacy: number;
  /** The norms, which decide what a government can get away with. */
  norms: number;
  /** How much of the country feels shut out, which broadens a movement. */
  excludedShare: number;
  /** Whether the state is trusted, which narrows one. */
  institutionalTrust: number;
  turn: number;
}

export interface MovementsTick {
  movements: Movements;
  /** Movements that have just formed. */
  formed: MovementKey[];
  /** Movements that have just reached for a harder tactic. */
  escalated: { key: MovementKey; to: Tactic }[];
  /** And those that have ended, one way or another. */
  ended: { key: MovementKey; outcome: Movement['outcome'] }[];
}

/** How strong a case a movement has, 0–1, from the problems behind it. */
function grievanceOf(key: MovementKey, inputs: MovementInputs): number {
  const template = findMovement(key);
  if (template.grievances.length === 0) return 0;
  let worst = 0;
  let total = 0;
  for (const problem of template.grievances) {
    const s = inputs.severity(problem);
    worst = Math.max(worst, s);
    total += s;
  }
  /* Weighted toward the worst of them: a movement forms around one thing
     that has become intolerable rather than around an average. */
  return clamp(worst * 0.65 + (total / template.grievances.length) * 0.35, 0, 1.4);
}

export function stepMovements(movements: Movements, inputs: MovementInputs): MovementsTick {
  const weekly = 1 / TURNS_PER_YEAR;

  const formed: MovementKey[] = [];
  const escalated: { key: MovementKey; to: Tactic }[] = [];
  const ended: { key: MovementKey; outcome: Movement['outcome'] }[] = [];

  /* ---- 1. Existing movements. ---- */
  const active: Movement[] = [];
  const resolved = [...movements.resolved];

  for (const movement of movements.active) {
    const template = findMovement(movement.key);
    const grievance = grievanceOf(movement.key, inputs);

    /*
     * Support follows the case and the country's willingness to act on
     * anything. A movement whose grievance has been addressed loses its
     * people whatever anybody says about it.
     */
    const ceiling = clamp100(
      grievance * 62 +
        inputs.mobilisation * 70 +
        template.legitimacy * 22 +
        inputs.excludedShare * 40,
    );
    const support = clamp100(
      movement.support + (ceiling - movement.support) * MOVEMENT_SUPPORT_RATE,
    );

    /*
     * Intensity is what the movement has left in it. It decays every week
     * — organising is exhausting and people have jobs — and it is
     * replenished only by the grievance continuing.
     */
    let intensity = clamp100(
      movement.intensity * (1 - MOVEMENT_DECAY) + grievance * 100 * MOVEMENT_DECAY * 1.15,
    );

    /*
     * Escalation. A movement that is ignored reaches for the next thing
     * in its repertoire; one that has been answered does not.
     */
    let tactic = movement.tactic;
    let weeksIgnored = movement.weeksIgnored + (movement.lastResponse === 'ignore' ? 1 : 0);
    if (movement.lastResponse === 'suppress') {
      /*
       * Suppression raises the temperature of everybody watching. The
       * movement loses people and gains resolve, which is the shape that
       * makes it so often counterproductive: a smaller, angrier, more
       * committed movement with the sympathy of people who were not
       * previously involved.
       */
      intensity = clamp100(intensity + SUPPRESSION_BACKFIRE * 100);
      weeksIgnored += 2;
    }

    const patience = 1 / Math.max(1e-6, template.escalation);
    if (weeksIgnored > patience && intensity > 30) {
      const at = template.repertoire.indexOf(tactic);
      const next = template.repertoire[at + 1];
      if (next) {
        tactic = next;
        weeksIgnored = 0;
        escalated.push({ key: movement.key, to: next });
      }
    }

    /* ---- Endings. ---- */
    let outcome: Movement['outcome'] = null;
    if (movement.lastResponse === 'concede' && grievance < 0.45) {
      outcome = 'won';
    } else if (intensity < 18) {
      /* It ran out of people. Nothing was conceded and nothing changed,
         which is how most movements end. */
      outcome = grievance < 0.3 ? 'absorbed' : 'exhausted';
    } else if (
      movement.lastResponse === 'suppress' &&
      inputs.norms < 40 &&
      support < 24
    ) {
      outcome = 'suppressed';
    }

    if (outcome) {
      resolved.push({ ...movement, support, intensity, tactic, outcome, endedTurn: inputs.turn });
      ended.push({ key: movement.key, outcome });
      continue;
    }

    active.push({
      ...movement,
      support,
      intensity,
      tactic,
      weeksIgnored,
      /* The response is consumed: a government has to answer every week
         it wants to have answered. */
      lastResponse: null,
      peakSupport: Math.max(movement.peakSupport, support),
    });
  }

  /* ---- 2. New movements. ---- */
  for (const template of MOVEMENT_TEMPLATES) {
    if (active.some((m) => m.key === template.key)) continue;
    /* One at a time, and not immediately again: a movement that has just
       ended does not re-form the following week. */
    const recent = resolved.find(
      (m) => m.key === template.key && inputs.turn - m.endedTurn < TURNS_PER_YEAR,
    );
    if (recent) continue;

    const grievance = grievanceOf(template.key, inputs);
    /*
     * The three conditions. All of them, multiplied — a strong grievance
     * in a country that has given up produces nothing at all, and a
     * mobilised country with nothing wrong produces nothing either.
     */
    const pressure =
      grievance * Math.max(0, inputs.mobilisation) * (0.4 + template.legitimacy * 0.6);
    if (pressure < MOVEMENT_FORM_THRESHOLD) continue;

    active.push({
      key: template.key,
      startedTurn: inputs.turn,
      support: clamp100(8 + grievance * 14),
      intensity: clamp100(30 + grievance * 40),
      peakSupport: 0,
      tactic: template.repertoire[0]!,
      weeksIgnored: 0,
      lastResponse: null,
      outcome: null,
      endedTurn: 0,
    });
    formed.push(template.key);
  }

  /*
   * What the week's concessions do to the belief that acting works.
   *
   * The most important line in the file. Conceding addresses a grievance
   * AND teaches a country that organising is how things get done, so a
   * government that always concedes is building the pressure that
   * produces the next movement. Suppression does the reverse and is worse
   * for it.
   */
  const conceded = movements.active.filter((m) => m.lastResponse === 'concede').length;
  const suppressed = movements.active.filter((m) => m.lastResponse === 'suppress').length;
  const efficacyPressure =
    movements.efficacyPressure * 0.985 +
    conceded * CONCESSION_EFFICACY_GAIN -
    suppressed * CONCESSION_EFFICACY_GAIN * 1.4;

  void weekly;
  const next: Movements = {
    active,
    /* The record is kept, because a career is judged on it. */
    resolved: resolved.slice(-60),
    efficacyPressure: clamp(efficacyPressure, -20, 20),
    history: [
      ...movements.history,
      {
        turn: inputs.turn,
        count: active.length,
        support: active.reduce((a, m) => a + m.support, 0),
        disruption: disruption({ ...movements, active }),
      },
    ].slice(-208),
  };

  return { movements: next, formed, escalated, ended };
}

/* ------------------------------------------------------------------ *
 * Answering one
 * ------------------------------------------------------------------ */

/** What a response costs and does, before it is taken. */
export function responseEffects(
  movement: Movement,
  response: MovementResponse,
  gdp: number,
): {
  money: number;
  politicalCapital: number;
  norms: number;
  policeTrust: number;
  frustration: number;
  summary: string;
} {
  const template = findMovement(movement.key);
  switch (response) {
    case 'concede':
      return {
        money: concessionCost(movement, gdp),
        politicalCapital: 4,
        norms: 0,
        policeTrust: 0,
        frustration: -6,
        summary: `Give them ${template.demand}. It costs what it costs, and it teaches the country that organising works — which is true, and which is why there will be more of this.`,
      };
    case 'negotiate':
      return {
        money: concessionCost(movement, gdp) * 0.25,
        politicalCapital: 8,
        norms: 1,
        policeTrust: 0,
        frustration: -2,
        summary:
          'Talks, a working group and a timetable. Buys time without addressing the grievance, so this comes back — but later, and to somebody who may not be you.',
      };
    case 'ignore':
      return {
        money: 0,
        politicalCapital: 0,
        norms: 0,
        policeTrust: 0,
        frustration: 1,
        summary:
          'Nothing. Free this week. They escalate, and the next thing they do costs the country more than the concession would have.',
      };
    case 'suppress':
      return {
        money: concessionCost(movement, gdp) * 0.12,
        politicalCapital: 10,
        norms: -7,
        policeTrust: -9,
        frustration: 5,
        summary:
          'Clear them out. It works this week. It costs the norms, it costs trust in the police, and it turns a movement about one thing into a movement about the government — which is a movement with no concession that ends it.',
      };
  }
}

/** One line on what is organised and how far it has gone. */
export function describeMovements(movements: Movements): string {
  if (movements.active.length === 0) {
    const recent = movements.resolved[movements.resolved.length - 1];
    if (recent && recent.outcome === 'suppressed') {
      return 'Nothing is organised. The last thing that was organised was cleared out, which is not the same as settled and is remembered for a long time.';
    }
    return 'Nothing is organised at the moment. That is either because there is nothing to organise about or because nobody believes it would help, and those are very different countries.';
  }
  const loud = loudest(movements)!;
  const template = findMovement(loud.key);
  return `${template.label} is at ${loud.support.toFixed(0)}% support and has reached ${template.repertoire.indexOf(loud.tactic) + 1} of ${template.repertoire.length} on what it is prepared to do. ${template.about}`;
}
