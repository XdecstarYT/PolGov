/**
 * movements.ts — the thirteen things a country organises about.
 *
 * A movement is not an event. It forms when three things coincide: a
 * GRIEVANCE the engine is already measuring, a CONSTITUENCY that carries
 * it, and enough MOBILISATION for anybody to act. Remove any one and
 * nothing happens — which is why a country with terrible problems and no
 * belief that acting works is quiet, and why a contented country with
 * high efficacy is also quiet.
 *
 * Each template names what it is about, who carries it, what it does, and
 * what would satisfy it. Nothing here is a judgement about whether a
 * movement is right. Several of these are movements against each other,
 * and the engine takes no side between them: it models the conditions
 * that produce organisation, not the merits of what gets organised.
 *
 * `escalation` is how fast a movement reaches for a harder tactic when it
 * is ignored, and `legitimacy` is how much of the public is inclined to
 * sympathise before anybody has done anything. Those two together decide
 * whether a government can afford to wait, which is the only question it
 * ever actually asks.
 */

import type { ProblemKey } from './problems.ts';
import type { SegmentKey } from './segments.ts';

export type MovementKey =
  | 'labour'
  | 'environmental'
  | 'civil_rights'
  | 'housing'
  | 'student'
  | 'youth'
  | 'farmer'
  | 'regional'
  | 'independence'
  | 'nationalist'
  | 'anti_government'
  | 'anti_war'
  | 'pro_government'
  | 'reform';

export const MOVEMENT_KEYS: MovementKey[] = [
  'labour',
  'environmental',
  'civil_rights',
  'housing',
  'student',
  'youth',
  'farmer',
  'regional',
  'independence',
  'nationalist',
  'anti_government',
  'anti_war',
  'pro_government',
  'reform',
];

/** What a movement does. Ordered by how far it is prepared to go. */
export type Tactic =
  | 'petition'
  | 'demonstration'
  | 'strike'
  | 'boycott'
  | 'occupation'
  | 'civil_disobedience'
  | 'mass_movement';

export const TACTIC_ORDER: Tactic[] = [
  'petition',
  'demonstration',
  'strike',
  'boycott',
  'occupation',
  'civil_disobedience',
  'mass_movement',
];

export const TACTIC_LABELS: Record<Tactic, string> = {
  petition: 'Petitions and letters',
  demonstration: 'Demonstrations',
  strike: 'Strikes and stoppages',
  boycott: 'Boycotts',
  occupation: 'Occupations',
  civil_disobedience: 'Civil disobedience',
  mass_movement: 'A mass movement',
};

/** How much disruption each tactic actually causes, and what it costs. */
export const TACTIC_DISRUPTION: Record<Tactic, number> = {
  petition: 0.05,
  demonstration: 0.2,
  strike: 0.65,
  boycott: 0.35,
  occupation: 0.45,
  civil_disobedience: 0.55,
  mass_movement: 0.9,
};

export interface MovementTemplate {
  key: MovementKey;
  label: string;
  /** What it is about, in the words the movement would use. */
  about: string;
  /** The problems it forms out of. */
  grievances: ProblemKey[];
  /** Who carries it. */
  constituency: SegmentKey[];
  /** The tactics it reaches for, in the order it reaches for them. */
  repertoire: Tactic[];
  /** How fast it escalates when nothing happens, per week. */
  escalation: number;
  /** How far the wider public is inclined to sympathise, 0–1. */
  legitimacy: number;
  /**
   * What satisfying it costs, as a share of a year's output.
   *
   * Some of these are cheap and some are not, and the cheap ones are not
   * the ones that are easiest to concede.
   */
  concessionCost: number;
  /** What a government is conceding when it concedes. */
  demand: string;
}

export const MOVEMENT_TEMPLATES: MovementTemplate[] = [
  {
    key: 'labour',
    label: 'The labour movement',
    about: 'Pay that has not kept up, and conditions nobody agreed to.',
    grievances: ['youth_unemployment', 'housing_stress', 'food_insecurity'],
    constituency: ['industrial_workers', 'union_members', 'public_sector'],
    repertoire: ['petition', 'demonstration', 'strike', 'mass_movement'],
    escalation: 0.012,
    legitimacy: 0.55,
    concessionCost: 0.008,
    demand: 'a pay settlement and a floor under conditions',
  },
  {
    key: 'environmental',
    label: 'The environmental movement',
    about: 'A country being handed on in worse condition than it was received.',
    grievances: ['health_gap', 'community_decline'],
    constituency: ['students', 'graduates', 'young_renters'],
    repertoire: ['petition', 'demonstration', 'occupation', 'civil_disobedience'],
    escalation: 0.014,
    legitimacy: 0.45,
    concessionCost: 0.011,
    demand: 'binding targets and the money to meet them',
  },
  {
    key: 'civil_rights',
    label: 'A civil-rights movement',
    about: 'Being treated by the state as less of a citizen than somebody else.',
    grievances: ['social_exclusion', 'violent_crime'],
    constituency: ['newcomers', 'low_income', 'young_renters'],
    repertoire: ['petition', 'demonstration', 'civil_disobedience', 'mass_movement'],
    escalation: 0.016,
    legitimacy: 0.5,
    concessionCost: 0.004,
    demand: 'recognition in law and a change in how the state conducts itself',
  },
  {
    key: 'housing',
    label: 'A housing movement',
    about: 'Rents that take a third of everything, and nowhere else to go.',
    grievances: ['housing_stress', 'homelessness'],
    constituency: ['young_renters', 'low_income', 'students'],
    repertoire: ['petition', 'demonstration', 'occupation', 'civil_disobedience'],
    escalation: 0.015,
    legitimacy: 0.58,
    concessionCost: 0.014,
    demand: 'rent control, or building at a scale nobody has managed in forty years',
  },
  {
    key: 'student',
    label: 'A student movement',
    about: 'Fees, places, and a promise about what a degree was for.',
    grievances: ['education_gap', 'youth_unemployment'],
    constituency: ['students', 'graduates'],
    repertoire: ['petition', 'demonstration', 'occupation', 'strike'],
    escalation: 0.02,
    legitimacy: 0.38,
    concessionCost: 0.006,
    demand: 'fees reversed and places restored',
  },
  {
    key: 'youth',
    label: 'A youth movement',
    about: 'A generation asked to wait for things the last one was given.',
    grievances: ['youth_unemployment', 'housing_stress', 'age_divide'],
    constituency: ['students', 'young_renters', 'non_graduates'],
    repertoire: ['demonstration', 'occupation', 'civil_disobedience', 'mass_movement'],
    escalation: 0.018,
    legitimacy: 0.4,
    concessionCost: 0.009,
    demand: 'the settlement their parents had',
  },
  {
    key: 'farmer',
    label: 'A farmers\' movement',
    about: 'Prices set elsewhere, rules written elsewhere, and land that cannot move.',
    grievances: ['regional_decline', 'community_decline'],
    constituency: ['farmers', 'rural_households'],
    repertoire: ['petition', 'demonstration', 'boycott', 'occupation'],
    escalation: 0.013,
    legitimacy: 0.62,
    concessionCost: 0.007,
    demand: 'support payments and an exemption from the rules',
  },
  {
    key: 'regional',
    label: 'A regional movement',
    about: 'Decisions taken somewhere else about a place its people have to live in.',
    grievances: ['regional_decline', 'community_decline'],
    constituency: ['rural_households', 'coastal_trades', 'non_graduates'],
    repertoire: ['petition', 'demonstration', 'boycott', 'mass_movement'],
    escalation: 0.009,
    legitimacy: 0.52,
    concessionCost: 0.012,
    demand: 'money, and the power to spend it here',
  },
  {
    key: 'independence',
    label: 'An independence movement',
    about: 'A settlement one part of the country never agreed to.',
    grievances: ['regional_decline', 'social_exclusion'],
    constituency: ['rural_households', 'coastal_trades', 'graduates'],
    repertoire: ['petition', 'demonstration', 'mass_movement'],
    escalation: 0.006,
    legitimacy: 0.35,
    concessionCost: 0.02,
    demand: 'a referendum, which is not a thing that can be half given',
  },
  {
    key: 'nationalist',
    label: 'A nationalist movement',
    about: 'A country people say they no longer recognise.',
    grievances: ['community_decline', 'regional_decline', 'crime'],
    constituency: ['non_graduates', 'retirees', 'rural_households'],
    repertoire: ['petition', 'demonstration', 'boycott', 'mass_movement'],
    escalation: 0.011,
    legitimacy: 0.33,
    concessionCost: 0.005,
    demand: 'borders, and a halt to something',
  },
  {
    key: 'anti_government',
    label: 'An anti-government movement',
    about: 'A government a large part of the country has stopped accepting.',
    grievances: ['unrest', 'social_exclusion'],
    constituency: ['non_graduates', 'low_income', 'small_traders'],
    repertoire: ['demonstration', 'strike', 'civil_disobedience', 'mass_movement'],
    escalation: 0.022,
    legitimacy: 0.3,
    concessionCost: 0.003,
    demand: 'the government, and it is not on offer',
  },
  {
    key: 'anti_war',
    label: 'An anti-war movement',
    about:
      'People who were told what this was for in week one and have since read the casualty returns. It does not form while a war is going well.',
    grievances: ['unrest', 'social_exclusion'],
    constituency: ['students', 'graduates', 'professionals'],
    repertoire: ['petition', 'demonstration', 'civil_disobedience', 'mass_movement'],
    escalation: 0.026,
    /* Considerable, and it rises with every week the war does not end,
       because the case for it was made once and has not been remade. */
    legitimacy: 0.52,
    /* Conceding costs nothing in money and everything in the sentence
       the government said in week one. */
    concessionCost: 0.001,
    demand: 'an end to it, on whatever terms are available',
  },
  {
    key: 'pro_government',
    label: 'A counter-movement',
    about: 'People who think the country is being taken from them by the other lot.',
    grievances: ['unrest'],
    constituency: ['homeowners', 'retirees', 'business_owners'],
    repertoire: ['petition', 'demonstration', 'boycott'],
    escalation: 0.008,
    legitimacy: 0.28,
    concessionCost: 0.002,
    demand: 'that the government stop giving way',
  },
  {
    key: 'reform',
    label: 'A reform movement',
    about: 'Institutions that do not work, argued about by people who want them to.',
    grievances: ['social_exclusion', 'community_decline'],
    constituency: ['graduates', 'professionals', 'public_sector'],
    repertoire: ['petition', 'demonstration', 'boycott'],
    escalation: 0.007,
    legitimacy: 0.6,
    concessionCost: 0.006,
    demand: 'a commission, and then the thing the commission says',
  },
];

export function findMovement(key: MovementKey): MovementTemplate {
  const found = MOVEMENT_TEMPLATES.find((m) => m.key === key);
  if (!found) throw new Error(`movements: unknown movement ${key}`);
  return found;
}
