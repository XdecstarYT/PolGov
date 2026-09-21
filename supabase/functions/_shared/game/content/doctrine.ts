/**
 * doctrine.ts — how an army believes wars are won.
 *
 * EVERY ARMY PREPARES FOR THE LAST WAR, AND IT IS RATIONAL TO. This is
 * the fact the file exists for, and it is usually told as a joke about
 * stupidity, which it is not. The doctrine that won the last war is the
 * one with evidence behind it. The officers who executed it are the ones
 * who were promoted for executing it. The alternative is a theory, held
 * by somebody junior, about a war nobody has fought. A government that
 * changes doctrine on a theory is betting against the only data anybody
 * has, in public, against the advice of everybody with a record — and it
 * is right about one time in three.
 *
 * DOCTRINE IS A BELIEF SYSTEM, NOT A SETTING. A government can order a
 * change and the army will not make one, because the people who would
 * have to make it are the people who believe the old one and were
 * promoted for believing it. Adoption therefore moves at the speed of
 * officer turnover — years — and an army halfway through a doctrinal
 * change is worse at both than it was at either.
 *
 * And RESEARCH DELIVERS AFTER THE WAR IT WAS FOR. A programme started
 * when the need became obvious arrives eight to twelve years later,
 * specified against a threat as it was understood on the day it was
 * written. The equipment fighting any war was specified for a different
 * one, and the question on the desk is never "what do we need" — it is
 * "what will we need in 2041, and how wrong are we willing to be".
 */

export type WarDoctrine =
  | 'attrition'
  | 'manoeuvre'
  | 'positional'
  | 'combined_arms'
  | 'deep_battle'
  | 'defensive_depth'
  | 'counterinsurgency'
  | 'denial';

export interface WarDoctrineTemplate {
  key: WarDoctrine;
  label: string;
  blurb: string;
  /**
   * The war it was learned from.
   *
   * Every doctrine is an answer to a specific previous war, and its
   * weaknesses are the questions that war did not ask.
   */
  learnedFrom: string;
  /** What it is good at. */
  attack: number;
  defence: number;
  /** How fast it can act once told to. */
  tempo: number;
  /** What it costs in people to fight this way. */
  casualties: number;
  /** And in materiel, which is the part nobody budgets for. */
  consumption: number;
  /** Ground it suits. */
  favours: import('./theatre.ts').TerrainKey[];
  /** And ground it is wrong for, which is where it is usually fought. */
  poorIn: import('./theatre.ts').TerrainKey[];
  /**
   * How hard it is for an officer corps to actually adopt.
   *
   * A multiplier on the years of turnover it takes. The doctrines that
   * ask most of subordinate commanders are the hardest to adopt, because
   * adopting them means trusting people the last doctrine taught you not
   * to.
   */
  adoptionDifficulty: number;
  /** What it needs of the officers below the top, 0–1. */
  delegation: number;
}

export const WAR_DOCTRINE_TEMPLATES: WarDoctrineTemplate[] = [
  {
    key: 'attrition',
    label: 'Attrition',
    blurb:
      'Find them, fix them, and out-produce them. It is not a failure of imagination; it is what works when neither side can manoeuvre.',
    learnedFrom: 'a war in which nobody could move and both sides could build',
    attack: 0.9,
    defence: 1.1,
    tempo: 0.7,
    casualties: 1.4,
    consumption: 1.6,
    favours: ['plains', 'farmland', 'urban'],
    poorIn: ['mountains', 'jungle', 'forest'],
    adoptionDifficulty: 0.6,
    delegation: 0.2,
  },
  {
    key: 'manoeuvre',
    label: 'Manoeuvre',
    blurb:
      'Go round rather than through, and aim at the thing holding them together rather than at their army.',
    learnedFrom: 'a war won by an army that was smaller and faster than the one it beat',
    attack: 1.4,
    defence: 0.85,
    tempo: 1.5,
    casualties: 0.8,
    consumption: 1.35,
    favours: ['plains', 'desert', 'farmland'],
    poorIn: ['mountains', 'urban', 'marsh', 'jungle'],
    adoptionDifficulty: 1.5,
    delegation: 0.85,
  },
  {
    key: 'positional',
    label: 'Positional defence',
    blurb: 'Hold the line, make them pay for every yard, and be there at the end of it.',
    learnedFrom: 'a war of survival fought on the country’s own ground',
    attack: 0.55,
    defence: 1.5,
    tempo: 0.5,
    casualties: 0.7,
    consumption: 0.85,
    favours: ['hills', 'mountains', 'river_line', 'urban'],
    poorIn: ['plains', 'desert'],
    adoptionDifficulty: 0.5,
    delegation: 0.25,
  },
  {
    key: 'combined_arms',
    label: 'Combined arms',
    blurb:
      'Everything together, all the time, so that whatever they have an answer to is not what arrives.',
    learnedFrom: 'a war lost by armies that fought each arm separately',
    attack: 1.25,
    defence: 1.2,
    tempo: 1.1,
    casualties: 0.9,
    consumption: 1.5,
    favours: ['plains', 'farmland', 'hills', 'coastal'],
    poorIn: ['jungle', 'marsh'],
    adoptionDifficulty: 1.3,
    delegation: 0.6,
  },
  {
    key: 'deep_battle',
    label: 'Deep battle',
    blurb:
      'Attack the whole depth of them at once — the front, the reserves, and the railway behind both.',
    learnedFrom: 'a war of enormous fronts and enormous reserves',
    attack: 1.5,
    defence: 0.9,
    tempo: 1.25,
    casualties: 1.15,
    consumption: 1.9,
    favours: ['plains', 'farmland', 'tundra'],
    poorIn: ['mountains', 'urban', 'jungle', 'forest'],
    adoptionDifficulty: 1.6,
    delegation: 0.7,
  },
  {
    key: 'defensive_depth',
    label: 'Defence in depth',
    blurb:
      'Give ground on purpose, let them come, and meet them where they are furthest from home.',
    learnedFrom: 'a war in which a country survived by having somewhere to retreat to',
    attack: 0.6,
    defence: 1.45,
    tempo: 0.8,
    casualties: 0.75,
    consumption: 1,
    favours: ['plains', 'tundra', 'forest', 'marsh'],
    poorIn: ['coastal', 'urban'],
    adoptionDifficulty: 1.1,
    delegation: 0.55,
  },
  {
    key: 'counterinsurgency',
    label: 'Counter-insurgency',
    blurb:
      'Protect the population rather than kill the enemy, on the grounds that the second is how you make more of them.',
    learnedFrom: 'a war that was lost while every engagement in it was won',
    attack: 0.5,
    defence: 1.05,
    tempo: 0.9,
    casualties: 0.6,
    consumption: 0.7,
    favours: ['urban', 'jungle', 'mountains', 'forest'],
    poorIn: ['plains', 'desert', 'tundra'],
    adoptionDifficulty: 1.8,
    delegation: 0.9,
  },
  {
    key: 'denial',
    label: 'Denial',
    blurb:
      'Do not try to win. Make it expensive enough that nobody starts, and accept that nothing about this is visible when it is working.',
    learnedFrom: 'a war that did not happen, which is why nobody agrees it was the doctrine',
    attack: 0.35,
    defence: 1.35,
    tempo: 0.95,
    casualties: 0.5,
    consumption: 0.65,
    favours: ['coastal', 'mountains', 'river_line', 'marsh'],
    poorIn: ['plains', 'farmland'],
    adoptionDifficulty: 1.2,
    delegation: 0.5,
  },
];

export function findWarDoctrine(key: WarDoctrine): WarDoctrineTemplate {
  const found = WAR_DOCTRINE_TEMPLATES.find((d) => d.key === key);
  if (!found) throw new Error(`doctrine: unknown doctrine ${key}`);
  return found;
}

/**
 * What a research programme is trying to buy.
 *
 * Each is specified against a threat as it is understood on the day the
 * programme is written, and delivered against one as it is on the day it
 * arrives. Those are eight to twelve years apart and nobody has ever
 * closed the gap.
 */
export type ResearchField =
  | 'firepower'
  | 'protection'
  | 'mobility'
  | 'sensors'
  | 'communications'
  | 'precision'
  | 'uncrewed'
  | 'electronic_warfare'
  | 'sustainment';

export interface ResearchTemplate {
  key: ResearchField;
  label: string;
  blurb: string;
  /** Years from the decision to anything in service. */
  leadYears: number;
  /** ₡bn a year while it runs, at the engine's reference scale. */
  annualCost: number;
  /** What it does when it arrives, as an index. */
  benefit: number;
  /**
   * How badly it dates if the doctrine it was specified for changes.
   *
   * Some things are useful whatever the war. A better radio is a better
   * radio. A weapon designed for a specific kind of engagement is a
   * museum piece if that engagement stops happening.
   */
  specificity: number;
  /** What it does for the government that funds it. Usually nothing. */
  visible: boolean;
}

export const RESEARCH_TEMPLATES: ResearchTemplate[] = [
  {
    key: 'firepower',
    label: 'Firepower',
    blurb: 'More of it, further, faster. The easiest programme to fund and the easiest to date.',
    leadYears: 9,
    annualCost: 3.8,
    benefit: 14,
    specificity: 0.8,
    visible: true,
  },
  {
    key: 'protection',
    label: 'Protection',
    blurb:
      'Armour, hardening, and the only category whose success is measured in things that did not happen.',
    leadYears: 8,
    annualCost: 3.2,
    benefit: 12,
    specificity: 0.6,
    visible: false,
  },
  {
    key: 'mobility',
    label: 'Mobility',
    blurb: 'Getting there, and getting there again somewhere else the following week.',
    leadYears: 7,
    annualCost: 2.9,
    benefit: 11,
    specificity: 0.5,
    visible: false,
  },
  {
    key: 'sensors',
    label: 'Sensors',
    blurb:
      'Seeing them before they see you, which decides more engagements than anything that is fired.',
    leadYears: 6,
    annualCost: 3.4,
    benefit: 15,
    specificity: 0.3,
    visible: false,
  },
  {
    key: 'communications',
    label: 'Communications',
    blurb:
      'Shortens the chain between the desk and the rifle company, which is worth as much as any weapon and has never once been announced.',
    leadYears: 5,
    annualCost: 2.2,
    /* Low headline benefit, and it multiplies everything else. */
    benefit: 8,
    specificity: 0.15,
    visible: false,
  },
  {
    key: 'precision',
    label: 'Precision',
    blurb: 'Hitting what was aimed at, which turns out to be a different problem from firing at it.',
    leadYears: 8,
    annualCost: 4.6,
    benefit: 17,
    specificity: 0.65,
    visible: true,
  },
  {
    key: 'uncrewed',
    label: 'Uncrewed systems',
    blurb:
      'Cheap, expendable, and the only category where the lead time is short enough to matter inside a war.',
    leadYears: 3,
    annualCost: 2.1,
    benefit: 10,
    specificity: 0.55,
    visible: true,
  },
  {
    key: 'electronic_warfare',
    label: 'Electronic warfare',
    blurb:
      'Taking away what they can see and say. Invisible, decisive, and impossible to demonstrate to a committee.',
    leadYears: 6,
    annualCost: 2.8,
    benefit: 13,
    specificity: 0.45,
    visible: false,
  },
  {
    key: 'sustainment',
    label: 'Sustainment',
    blurb:
      'Keeping it running, moving and supplied. Never funded, always the reason an offensive stopped.',
    leadYears: 5,
    annualCost: 1.9,
    benefit: 9,
    specificity: 0.1,
    visible: false,
  },
];

export function findResearch(key: ResearchField): ResearchTemplate {
  const found = RESEARCH_TEMPLATES.find((r) => r.key === key);
  if (!found) throw new Error(`doctrine: unknown research field ${key}`);
  return found;
}

/**
 * How much of an army's strength a doctrine it does not believe in
 * actually delivers.
 *
 * An army halfway through a doctrinal change is worse at both than it
 * was at either, which is the cost nobody prices when ordering one.
 */
export const HALF_ADOPTED_PENALTY = 0.78;
