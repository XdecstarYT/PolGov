/**
 * intelligence.ts — you never know whether what you know is true.
 *
 * The mechanic this whole engine exists for is the assessment that is
 * confidently wrong. Every other system in the game hands the player a
 * number that means what it says; this one hands them a number drawn from
 * the truth with noise, labels it with a confidence that is itself only
 * usually right, and lets them govern on it.
 *
 * That is not a trick played on the player. It is the single most
 * consequential and least dramatised fact about how governments actually
 * decide anything: the paper says 'high confidence' and the paper is wrong,
 * and no amount of asking for a better paper fixes it, because the thing
 * being estimated is in somebody else's head.
 *
 * The rest follows from it. Collection is a budget that buys a narrower
 * error bar rather than a right answer. Operations are deniable until they
 * are not. Counter-intelligence is the same problem run in reverse, and the
 * penetration you have not found is worse than the one you have. Domestic
 * surveillance is the only lever here with a constituency on both sides,
 * which is why it is the one that ends governments.
 */

import type { NationKey } from './nations.ts';

/* ------------------------------------------------------------------ *
 * What the agencies are asked
 * ------------------------------------------------------------------ */

export type AssessmentSubject = 'intentions' | 'capability' | 'stability' | 'programme';

export interface SubjectTemplate {
  key: AssessmentSubject;
  name: string;
  question: string;
  /**
   * How hard it is to know, in points of added error.
   *
   * Capability is countable — ships can be photographed. Intentions are in
   * somebody's head and cannot be collected against at all, only inferred,
   * which is why every famous intelligence failure is one of these.
   */
  difficulty: number;
  /** Which part of the collection posture helps most. */
  served: 'human' | 'signals' | 'analysis';
  /** Political capital to commission one. */
  cost: number;
}

export const SUBJECT_TEMPLATES: SubjectTemplate[] = [
  {
    key: 'capability',
    name: 'Capability',
    question: 'What can they actually do, as opposed to what they say?',
    /* Countable. Ships can be photographed and counted, which is why this
       is the assessment that is usually right and never the one that
       matters most. */
    difficulty: 8,
    served: 'signals',
    cost: 8,
  },
  {
    key: 'intentions',
    name: 'Intentions',
    question: 'What do they mean to do, and when?',
    /*
     * The hard one, permanently. Intentions are in somebody's head; they
     * cannot be collected against, only inferred, and the inference is
     * being made by people who want the answer to be interesting. Every
     * famous intelligence failure in history is this box.
     */
    difficulty: 30,
    served: 'human',
    cost: 14,
  },
  {
    key: 'stability',
    name: 'Internal stability',
    question: 'Is that government going to be there next year?',
    difficulty: 20,
    served: 'analysis',
    cost: 11,
  },
  {
    key: 'programme',
    name: 'Weapons programme',
    question: 'Are they building something they have said they are not?',
    /*
     * Hard, consequential, and the box where confidence and accuracy have
     * historically been least related to one another.
     */
    difficulty: 26,
    served: 'signals',
    cost: 16,
  },
];

export function findSubject(key: AssessmentSubject): SubjectTemplate {
  const found = SUBJECT_TEMPLATES.find((s) => s.key === key);
  if (!found) throw new Error(`intelligence: unknown subject ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Things done quietly
 * ------------------------------------------------------------------ */

export type OperationKey =
  | 'recruit_source'
  | 'intercept'
  | 'sabotage'
  | 'influence'
  | 'exfiltrate'
  | 'counter_sweep';

export interface OperationTemplate {
  key: OperationKey;
  name: string;
  blurb: string;
  /** What it is for, in one line, with no opinion about whether it is wise. */
  purpose: string;
  cost: number;
  /** Weeks before it resolves. */
  weeks: number;
  /** Base chance of working at all. Capability moves it. */
  success: number;
  /** Base chance of surfacing. Oversight and capability move it. */
  exposure: number;
  /** What it does when it works. */
  effect: {
    capability?: number;
    penetration?: number;
    relations?: number;
    tension?: number;
    /** Points of their military strength it sets back. */
    setback?: number;
  };
  /** And what it costs when it surfaces. */
  scandal: { approval: number; reputation: number; relations: number };
}

export const OPERATION_TEMPLATES: OperationTemplate[] = [
  {
    key: 'recruit_source',
    name: 'Recruit a source',
    blurb:
      'Somebody inside, reporting. Slow to build, impossible to replace, and the only way anybody has ever learned an intention.',
    purpose: 'Better assessments of what they mean to do.',
    cost: 12,
    weeks: 26,
    success: 0.55,
    exposure: 0.18,
    effect: { capability: 9 },
    scandal: { approval: -4, reputation: -5, relations: -18 },
  },
  {
    key: 'intercept',
    name: 'Intercept programme',
    blurb:
      'Reading what they send each other. Technically superb, politically radioactive, and it tells you what they said rather than what they meant.',
    purpose: 'Better assessments of capability and programmes.',
    cost: 16,
    weeks: 18,
    success: 0.7,
    exposure: 0.22,
    effect: { capability: 11 },
    scandal: { approval: -6, reputation: -8, relations: -22 },
  },
  {
    key: 'sabotage',
    name: 'Sabotage',
    blurb:
      'Something they were building no longer works. Deniable for as long as it is deniable, and an act of war the moment it is not.',
    purpose: 'Set a programme back by years.',
    cost: 26,
    weeks: 12,
    success: 0.45,
    exposure: 0.4,
    effect: { setback: 14, tension: 6 },
    scandal: { approval: -12, reputation: -18, relations: -40 },
  },
  {
    key: 'influence',
    name: 'Influence operation',
    blurb:
      'Money, stories and people who will repeat them. Cheap, effective, and the thing this country complains loudest about when it is done to us.',
    purpose: 'Move another government toward a position it would not take.',
    cost: 18,
    weeks: 20,
    success: 0.5,
    exposure: 0.3,
    effect: { relations: 14 },
    scandal: { approval: -9, reputation: -14, relations: -30 },
  },
  {
    key: 'exfiltrate',
    name: 'Exfiltration',
    blurb:
      'Getting somebody out who cannot stay. Almost never worth it on any calculation, and the calculation is not the only thing involved.',
    purpose: 'Recover a source before they are lost.',
    cost: 20,
    weeks: 6,
    success: 0.6,
    exposure: 0.35,
    effect: { capability: 5, relations: -6 },
    scandal: { approval: -5, reputation: -6, relations: -24 },
  },
  {
    key: 'counter_sweep',
    name: 'Counter-intelligence sweep',
    blurb:
      'Looking for whoever is already inside. Disruptive, demoralising, and the only thing worse than doing it is not.',
    purpose: 'Find and remove a penetration.',
    cost: 14,
    weeks: 14,
    success: 0.62,
    exposure: 0.05,
    effect: { penetration: -22 },
    scandal: { approval: -2, reputation: -1, relations: 0 },
  },
];

export function findOperation(key: OperationKey): OperationTemplate {
  const found = OPERATION_TEMPLATES.find((o) => o.key === key);
  if (!found) throw new Error(`intelligence: unknown operation ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * At home
 * ------------------------------------------------------------------ */

/**
 * Surveillance powers, as a ladder rather than a dial.
 *
 * Each rung is a real statutory step with a real argument attached, and the
 * argument does not go away when the government wins it. This is the only
 * lever in the intelligence system with a constituency on both sides, which
 * is why it is the one that ends governments.
 */
export interface PowerTemplate {
  level: number;
  name: string;
  blurb: string;
  /** Points of surveillance capability. */
  surveillance: number;
  /** Political capital to legislate. */
  cost: number;
  /** What it does to approval, immediately. */
  approval: number;
  /** Which segments mind, and how much. */
  objectors: string[];
}

export const POWER_TEMPLATES: PowerTemplate[] = [
  {
    level: 0,
    name: 'Warranted interception only',
    blurb:
      'A judge signs each one. Slow, narrow, and the position almost every country says it is in.',
    surveillance: 20,
    cost: 0,
    approval: 0,
    objectors: [],
  },
  {
    level: 1,
    name: 'Bulk retention',
    blurb:
      'Everybody’s metadata, kept. Not read without cause, which is a sentence that has had to be defended in court more than once.',
    surveillance: 45,
    cost: 20,
    approval: -3,
    objectors: ['graduates', 'young_renters', 'students'],
  },
  {
    level: 2,
    name: 'Bulk interception',
    blurb:
      'Content as well, at scale, with an oversight body rather than a judge. Genuinely effective and genuinely a different country.',
    surveillance: 70,
    cost: 34,
    approval: -8,
    objectors: ['graduates', 'young_renters', 'students', 'professionals'],
  },
  {
    level: 3,
    name: 'Emergency powers',
    blurb:
      'Detention without charge, association offences and a reporting ban. Every country that has done this has said it was temporary.',
    surveillance: 88,
    cost: 48,
    approval: -15,
    objectors: ['graduates', 'young_renters', 'students', 'professionals', 'newcomers'],
  },
];

export function findPower(level: number): PowerTemplate {
  const found = POWER_TEMPLATES.find((p) => p.level === level);
  if (!found) throw new Error(`intelligence: unknown powers level ${level}`);
  return found;
}

export const CONFIDENCE_LABELS: Record<'low' | 'moderate' | 'high', string> = {
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  high: 'High confidence',
};

export type { NationKey };
