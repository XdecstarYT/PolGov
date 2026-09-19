/**
 * intelligence.ts — the assessment that is confidently wrong.
 *
 * Every other system in this engine hands the player a number that means
 * what it says. This one draws a number from the truth, adds noise scaled
 * by how good collection actually is, labels it with a confidence that is
 * itself only usually right, and lets them govern on it.
 *
 * That is not a trick. It is the least dramatised and most consequential
 * fact about how governments decide anything: the paper says high
 * confidence and the paper is wrong, and asking for a better paper does not
 * help, because the thing being estimated is in somebody else's head.
 *
 * Four consequences, each of which is a mechanic:
 *
 *   COLLECTION BUYS A NARROWER ERROR BAR, NOT A RIGHT ANSWER. Money moves
 *   the spread. It never removes it, and on intentions it barely moves it,
 *   which is why every famous failure is an intentions failure.
 *
 *   CONFIDENCE IS AN ESTIMATE TOO. The label is drawn from the same
 *   machinery as the number. A high-confidence assessment is usually right
 *   and occasionally catastrophic, and the player cannot tell which.
 *
 *   OPERATIONS ARE DENIABLE UNTIL THEY ARE NOT. Cheap, effective, and every
 *   one carries a chance of surfacing years later under a government that
 *   did not order it.
 *
 *   SOMEBODY IS ALREADY INSIDE. Penetration runs the same machinery in
 *   reverse, and the one you have not found is worse than the one you have,
 *   because it makes your assessments worse without telling you.
 */

import {
  ASSESSMENT_DECAY_WEEKS,
  CAPABILITY_ADJUST_RATE,
  INTEL_FUNDING_PIVOT,
  OVERCONFIDENCE_BASE,
  OVERSIGHT_EXPOSURE_WEIGHT,
  PENETRATION_DRIFT,
  SCANDAL_OVERSIGHT_GUARD,
  SURVEILLANCE_UNREST_WEIGHT,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  OPERATION_TEMPLATES,
  findOperation,
  findPower,
  findSubject,
  type AssessmentSubject,
  type OperationKey,
} from '../content/intelligence.ts';
import { findNation, type NationKey } from '../content/nations.ts';
import type { Rng } from '../rng.ts';
import type {
  Assessment,
  Crisis,
  Intelligence,
  Military,
  Operation,
  World,
} from '../types.ts';
import { combatPower } from './military.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * What the country starts with
 * ------------------------------------------------------------------ */

export function buildIntelligence(): Intelligence {
  return {
    /* A conventional split nobody chose deliberately, inherited from
       whichever review last had the argument. */
    posture: { human: 0.3, signals: 0.45, analysis: 0.25 },
    capability: 46,
    /*
     * Somebody is already inside. They always are, and a country that
     * believed otherwise would be the only one in history.
     */
    penetration: 22,
    powers: 0,
    /* Watched, but not closely. This is the level almost every country
       actually operates at and calls robust. */
    oversight: 48,
    assessments: [],
    operations: [],
  };
}

/* ------------------------------------------------------------------ *
 * Assessment
 * ------------------------------------------------------------------ */

/**
 * How well the country can see a given question.
 *
 * Capability, weighted by whether the collection posture happens to suit
 * the question being asked — a country that spent a decade on signals and
 * is now asked about intentions has bought the wrong thing, and cannot fix
 * it inside a term.
 */
export function collectionFor(intel: Intelligence, subject: AssessmentSubject): number {
  const template = findSubject(subject);
  const fit = intel.posture[template.served];
  /* A third of the answer is raw capability; the rest is whether the
     capability is pointed at the right thing. */
  const pointed = clamp(fit / 0.33, 0, 1.8);
  /* And whoever is inside our own house degrades everything. */
  const leak = 1 - intel.penetration / 250;
  return clamp(intel.capability * (0.55 + pointed * 0.45) * leak, 0, 100);
}

/** What the truth actually is, for a question about a country. */
export function truthOf(
  subject: AssessmentSubject,
  nation: NationKey,
  world: World,
  military: Military,
  crises: readonly Crisis[],
): number {
  const template = findNation(nation);
  const state = world.nations.find((n) => n.key === nation);
  const relations = state?.relations ?? 0;

  switch (subject) {
    case 'capability':
      /* Their forces relative to ours, as a 0–100 figure. */
      return clamp((template.power * 40) / Math.max(1, combatPower(military)) * 42, 0, 100);
    case 'intentions': {
      /* How likely they are to move against us. Relations, posture and
         whether there is already a quarrel. */
      const hostile: Record<string, number> = {
        assertive: 62,
        volatile: 70,
        guarded: 40,
        mercantile: 24,
        institutional: 18,
        aligned: 12,
      };
      const quarrel = crises.some((c) => c.nation === nation && c.stage !== 'settled') ? 18 : 0;
      return clamp((hostile[template.posture] ?? 35) - relations / 2.2 + quarrel, 0, 100);
    }
    case 'stability':
      /* How likely that government is to still be there. Volatile
         countries are not, and everybody else mostly is. */
      return clamp(template.posture === 'volatile' ? 38 : 74 - world.tension / 4, 0, 100);
    default:
      /* Whether they are building something they said they were not. */
      return clamp(
        template.power * 22 + (template.posture === 'assertive' ? 22 : 0) - relations / 3,
        0,
        100,
      );
  }
}

/**
 * Commission one.
 *
 * The estimate is the truth plus noise, where the noise is set by how well
 * the country can see this particular question. The confidence label is
 * drawn from the SAME noise — which means a high-confidence assessment is
 * usually right and occasionally catastrophic, and nothing available to the
 * player distinguishes the two cases in advance.
 */
export function assess(
  subject: AssessmentSubject,
  nation: NationKey,
  intel: Intelligence,
  world: World,
  military: Military,
  crises: readonly Crisis[],
  turn: number,
  rng: Rng,
): Assessment {
  const template = findSubject(subject);
  const truth = truthOf(subject, nation, world, military, crises);
  const collection = collectionFor(intel, subject);

  /*
   * The spread. Difficulty is the floor — intentions cannot be collected
   * against at all, only inferred — and collection narrows what is left.
   * A country with perfect collection asking about intentions still has a
   * thirty-point error bar, because the thing is in somebody's head.
   */
  const spread = template.difficulty + (100 - collection) * 0.32;
  const draw = (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
  const estimate = clamp(truth + draw * spread, 0, 100);

  /*
   * And the confidence, which is a judgement about the spread rather than
   * about this particular answer. It is usually right about the spread,
   * which is exactly why it is so dangerous: nobody is lying, the process
   * worked, and the number is wrong anyway.
   */
  const stated: Assessment['confidence'] = spread < 18 ? 'high' : spread < 30 ? 'moderate' : 'low';

  /*
   * And then the part that produces every famous failure.
   *
   * Analysts systematically understate the spread on exactly the questions
   * where the political demand for an answer is highest — which is to say,
   * on the hard ones. So the overconfidence roll is scaled by difficulty:
   * a capability assessment rarely oversells itself, and an intentions
   * assessment, the one that cannot be collected against at all, is the one
   * most likely to arrive marked high confidence.
   *
   * Nobody is lying. The process worked. There is nothing on the paper
   * that says which case this is, and that is the mechanic.
   */
  const overconfidence = OVERCONFIDENCE_BASE + template.difficulty / 200;
  const ladder: Assessment['confidence'][] = ['low', 'moderate', 'high'];
  let rung = ladder.indexOf(stated);
  if (rng.chance(overconfidence)) rung += 1;
  if (rng.chance(overconfidence * 0.5)) rung += 1;
  const confidence = ladder[Math.min(ladder.length - 1, rung)]!;

  return {
    id: `assess-${subject}-${nation}-${turn}`,
    nation,
    subject,
    turn,
    estimate,
    truth,
    confidence,
    verdict: 'unknown',
  };
}

/**
 * Was it right, in the end?
 *
 * Only knowable later, and only approximately, which is why the verdict is
 * recorded on the assessment rather than announced at the time. A player
 * who reads back a term's worth of these learns something about the
 * agencies that no single assessment could have told them.
 */
export function judge(assessment: Assessment, truthNow: number): Assessment {
  if (assessment.verdict !== 'unknown') return assessment;
  const error = Math.abs(assessment.estimate - truthNow);
  return { ...assessment, verdict: error < 18 ? 'sound' : 'wrong' };
}

/** How often the agencies have been right lately, as a share. */
export function trackRecord(assessments: readonly Assessment[]): number | null {
  const judged = assessments.filter((a) => a.verdict !== 'unknown');
  if (judged.length === 0) return null;
  return judged.filter((a) => a.verdict === 'sound').length / judged.length;
}

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

/** What a given operation's chances actually are, here and now. */
export function operationOdds(
  key: OperationKey,
  intel: Intelligence,
): { success: number; exposure: number } {
  const template = findOperation(key);
  return {
    success: clamp(template.success * (0.6 + (intel.capability / 100) * 0.8), 0.05, 0.95),
    /*
     * Oversight cuts both ways, and this is the honest half of it: an
     * agency nobody is watching is harder to catch. That is the argument
     * against oversight, it is a real argument, and the cost of winning it
     * is the scandal that ends a government rather than embarrasses one.
     */
    exposure: clamp(
      template.exposure *
        (1 + (intel.oversight / 100) * OVERSIGHT_EXPOSURE_WEIGHT) *
        (1 + intel.penetration / 160),
      0.01,
      0.95,
    ),
  };
}

export function launch(
  intel: Intelligence,
  key: OperationKey,
  nation: NationKey,
  turn: number,
): Intelligence {
  const template = findOperation(key);
  const odds = operationOdds(key, intel);
  return {
    ...intel,
    operations: [
      ...intel.operations,
      {
        id: `op-${key}-${nation}-${turn}`,
        kind: key,
        nation,
        startedTurn: turn,
        dueTurn: turn + template.weeks,
        exposure: odds.exposure,
        status: 'running',
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface IntelligenceInputs {
  /** ₡bn a year the agencies are funded at, as a share of what they need. */
  cover: number;
  world: World;
  military: Military;
  crises: readonly Crisis[];
  turn: number;
  rng: Rng;
}

export interface IntelligenceTick {
  intelligence: Intelligence;
  /** Operations that concluded this week, and how. */
  concluded: { operation: Operation; template: ReturnType<typeof findOperation> }[];
  /** Assessments that can now be marked right or wrong. */
  judged: Assessment[];
  /** Points of unrest that surveillance took out of the country. */
  unrestAverted: number;
}

/**
 * Advance the agencies by one week.
 *
 * Capability moves slowly, because it is people and relationships rather
 * than equipment. Penetration drifts upward on its own, because somebody is
 * always trying, and the only thing that reduces it is looking.
 */
export function stepIntelligence(
  intel: Intelligence,
  inputs: IntelligenceInputs,
): IntelligenceTick {
  const concluded: IntelligenceTick['concluded'] = [];
  let capability = intel.capability;
  let penetration = intel.penetration;

  /* Capability follows the money, slowly and with a floor: the agencies do
     not stop existing when they are cut, they stop being good. */
  const target = clamp(
    25 + ((inputs.cover - INTEL_FUNDING_PIVOT) / (1 - INTEL_FUNDING_PIVOT)) * 55,
    10,
    92,
  );
  capability += (target - capability) * CAPABILITY_ADJUST_RATE;

  /* Somebody is always trying. The only thing that reduces this is looking
     for them, which is unglamorous and nobody funds it. */
  penetration = clamp(penetration + PENETRATION_DRIFT, 0, 100);

  const operations = intel.operations.map((operation) => {
    if (operation.status !== 'running') return operation;
    if (inputs.turn < operation.dueTurn) return operation;

    const template = findOperation(operation.kind);
    const odds = operationOdds(operation.kind, { ...intel, capability });

    /* Exposure is rolled separately from success, because an operation can
       perfectly well fail AND surface, which is the worst outcome and the
       one nobody plans for. */
    const worked = inputs.rng.chance(odds.success);
    const surfaced = inputs.rng.chance(operation.exposure);

    const status: Operation['status'] = surfaced ? 'exposed' : worked ? 'succeeded' : 'failed';
    const done = { ...operation, status };

    if (worked) {
      capability = clamp(capability + (template.effect.capability ?? 0), 0, 100);
      penetration = clamp(penetration + (template.effect.penetration ?? 0), 0, 100);
    }

    concluded.push({ operation: done, template });
    return done;
  });

  /* Assessments age out of usefulness and are marked right or wrong once
     enough time has passed that the answer is visible. */
  const judged: Assessment[] = [];
  const assessments = intel.assessments.map((assessment) => {
    if (assessment.verdict !== 'unknown') return assessment;
    if (inputs.turn - assessment.turn < ASSESSMENT_DECAY_WEEKS) return assessment;
    const now = truthOf(
      assessment.subject,
      assessment.nation,
      inputs.world,
      inputs.military,
      inputs.crises,
    );
    const marked = judge(assessment, now);
    judged.push(marked);
    return marked;
  });

  /*
   * What surveillance actually buys. Not nothing: it does reduce what goes
   * wrong at home, measurably, and a model that pretended otherwise would
   * be arguing rather than simulating.
   */
  const powers = findPower(intel.powers);
  const unrestAverted = (powers.surveillance / 100) * SURVEILLANCE_UNREST_WEIGHT;

  return {
    intelligence: { ...intel, capability, penetration, operations, assessments },
    concluded,
    judged,
    unrestAverted,
  };
}

/**
 * Whether an agency nobody is watching has done something.
 *
 * The cost of winning the oversight argument. Low oversight makes
 * operations harder to catch and makes this more likely, which is the
 * genuine shape of the trade rather than a punishment for choosing wrong.
 */
export function scandalRisk(intel: Intelligence): number {
  if (intel.oversight >= SCANDAL_OVERSIGHT_GUARD) return 0;
  const exposure = (SCANDAL_OVERSIGHT_GUARD - intel.oversight) / SCANDAL_OVERSIGHT_GUARD;
  const powers = findPower(intel.powers);
  return (exposure * (powers.surveillance / 100)) / TURNS_PER_YEAR;
}

/** A one-line account of what the agencies can and cannot see. */
export function describeIntelligence(intel: Intelligence): string {
  const record = trackRecord(intel.assessments);
  if (intel.penetration > 55) {
    return 'Somebody is inside, and has been for some time. Every assessment on this page was written by people who do not know that.';
  }
  if (record !== null && record < 0.5) {
    return `The agencies have been wrong more often than right lately — ${Math.round(record * 100)}% sound. That is a fact about the questions as much as about the answers.`;
  }
  if (intel.capability > 70) {
    return 'Good collection, pointed at roughly the right things. It still cannot tell you what anybody intends, and it never will.';
  }
  return 'Adequate on what can be counted, and guessing on everything else — which is most of what matters.';
}

export { OPERATION_TEMPLATES, findOperation, findPower, findSubject };
