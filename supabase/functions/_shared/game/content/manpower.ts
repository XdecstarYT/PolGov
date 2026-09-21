/**
 * manpower.ts — how a country fills an army, and what each way costs it.
 *
 * Five models, and the choice between them is one of the most
 * consequential a government makes, because it decides WHO FIGHTS.
 *
 * A professional army is small, excellent, expensive, and politically
 * frictionless — the country barely notices it is at war, which is
 * precisely why governments with one are so willing to use it and so
 * surprised when the bill arrives anyway.
 *
 * Conscription is the opposite. It is cheap per soldier, enormous, badly
 * trained at first, and it puts a bill through every door in the country.
 * A conscripting government cannot fight a war nobody supports, which is
 * either the strongest check on adventurism ever devised or an intolerable
 * constraint on national security, depending entirely on who is asked.
 *
 * The important asymmetry is that mobilisation is a RATCHET. Going up is
 * a decision taken in an afternoon; coming down takes years, because the
 * people are still in uniform, the factories are still built for it, and
 * the constituency that formed around the arrangement is still there.
 */

export type ManpowerModel =
  | 'volunteer'
  | 'professional'
  | 'selective'
  | 'conscript'
  | 'total_mobilisation';

export const MANPOWER_MODELS: ManpowerModel[] = [
  'volunteer',
  'professional',
  'selective',
  'conscript',
  'total_mobilisation',
];

export interface ManpowerTemplate {
  key: ManpowerModel;
  label: string;
  blurb: string;
  /**
   * Share of the eligible population that can be put under arms.
   *
   * The eligible population is the working-age cohort; this is the slice
   * of it a given arrangement can actually reach.
   */
  reach: number;
  /** What a soldier costs to keep, relative to a professional one. */
  costPerSoldier: number;
  /** How good they are when they arrive, 0–100. */
  baseQuality: number;
  /** How fast they can be brought in, as a share of the gap per week. */
  intakeRate: number;
  /**
   * Approval cost per week of running it, at peace.
   *
   * Nothing for a volunteer force and considerable for conscription,
   * which is the whole political economy of the question.
   */
  standingCost: number;
  /** How much of the country resents being called, 0–1. */
  resistance: number;
  /** How far it strips the civilian labour force per soldier raised. */
  labourDraw: number;
  /** Weeks before the arrangement can be wound back down. */
  demobilisationWeeks: number;
  /**
   * How long somebody serves before going home.
   *
   * The most consequential number in this file and the least discussed
   * one. It decides the shape of the army rather than its size: a
   * ten-year career accumulates veterans, an eighteen-month term never
   * does, and two countries fielding identical headcounts under the two
   * arrangements are not fielding comparable armies. It is also the
   * reason conscription is worse than it looks — the people it raises
   * leave again before they are any good.
   */
  serviceWeeks: number;
  /**
   * How large the trained reserve is, relative to the standing force.
   *
   * Where time-served soldiers go, and the only fast source of soldiers
   * a country has. Mobilisation draws on it first, which is why the
   * first months of a war produce an army and the months after that
   * produce recruits.
   */
  reserveRatio: number;
}

export const MANPOWER_TEMPLATES: ManpowerTemplate[] = [
  {
    key: 'volunteer',
    label: 'A volunteer force',
    blurb:
      'Whoever comes forward. Cheap, small, uneven, and it shrinks the moment a war starts to look like one.',
    reach: 0.004,
    costPerSoldier: 0.75,
    baseQuality: 48,
    intakeRate: 0.012,
    standingCost: 0,
    resistance: 0,
    labourDraw: 0.9,
    demobilisationWeeks: 8,
    serviceWeeks: 260,
    reserveRatio: 0.4,
  },
  {
    key: 'professional',
    label: 'A professional army',
    blurb:
      'Small, excellent and expensive. The country barely notices it is at war, which is why governments that have one keep finding uses for it.',
    reach: 0.009,
    costPerSoldier: 1,
    baseQuality: 74,
    intakeRate: 0.008,
    standingCost: 0,
    resistance: 0,
    labourDraw: 1,
    demobilisationWeeks: 26,
    serviceWeeks: 520,
    reserveRatio: 1.2,
  },
  {
    key: 'selective',
    label: 'Selective service',
    blurb:
      'A register, a ballot and an exemption for anybody who can arrange one. Which is the part that is remembered.',
    reach: 0.022,
    costPerSoldier: 0.62,
    baseQuality: 56,
    intakeRate: 0.02,
    standingCost: 0.012,
    resistance: 0.28,
    labourDraw: 1.15,
    demobilisationWeeks: 52,
    serviceWeeks: 104,
    reserveRatio: 2.5,
  },
  {
    key: 'conscript',
    label: 'Conscription',
    blurb:
      'A bill through every door in the country. No government fighting a war nobody supports can sustain this, which is either the finest check on adventurism ever devised or an intolerable constraint.',
    reach: 0.045,
    costPerSoldier: 0.42,
    baseQuality: 44,
    intakeRate: 0.035,
    standingCost: 0.03,
    resistance: 0.45,
    labourDraw: 1.3,
    demobilisationWeeks: 104,
    serviceWeeks: 78,
    reserveRatio: 4.0,
  },
  {
    key: 'total_mobilisation',
    label: 'Total mobilisation',
    blurb:
      'Everybody who can be spared and a good many who cannot. It is done once, it works, and the country is different afterwards.',
    reach: 0.085,
    costPerSoldier: 0.34,
    baseQuality: 34,
    intakeRate: 0.055,
    standingCost: 0.07,
    resistance: 0.6,
    labourDraw: 1.55,
    demobilisationWeeks: 156,
    serviceWeeks: 156,
    reserveRatio: 5.0,
  },
];

export function findManpowerModel(key: ManpowerModel): ManpowerTemplate {
  const found = MANPOWER_TEMPLATES.find((m) => m.key === key);
  if (!found) throw new Error(`manpower: unknown model ${key}`);
  return found;
}

/** Where a soldier is in their life as one. */
export type TroopStage = 'recruit' | 'trained' | 'veteran';

/**
 * Weeks in each stage before moving to the next.
 *
 * The reason a country can have two million men of military age and no
 * army: the pool is not the force, and the distance between them is
 * measured in months that cannot be bought.
 */
export const TRAINING_WEEKS: Record<Exclude<TroopStage, 'veteran'>, number> = {
  recruit: 14,
  /**
   * Weeks of sustained combat before a trained soldier is a veteran.
   *
   * Not a peacetime figure and deliberately not reachable in peacetime.
   * An army that has never fought has no veterans in it, whatever its
   * length of service says, and the first six months of any war are the
   * price of finding that out.
   */
  trained: 60,
};
