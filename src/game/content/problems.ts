/**
 * problems.ts — the sixteen things that go wrong in a country.
 *
 * Every one of these is derived from something the game already tracks.
 * None is a dial, none arrives at random, and none is a moral judgement
 * about the people it happens to: they are outcomes of a distribution, a
 * housing stock, a labour market and a set of services, and they are
 * modelled so that a government can see what its budget did to people
 * eighteen months after it did it.
 *
 * Two properties matter more than the individual definitions.
 *
 * They COMPOUND. Youth unemployment feeds crime; crime feeds community
 * decline; community decline feeds exclusion; exclusion feeds every other
 * one on the list. A country with one problem has one problem. A country
 * with four has considerably more than four, which is why a government
 * that lets several run at once finds them much harder to reverse than
 * the arithmetic of any one of them suggests.
 *
 * And they are SLOW COMING BACK. Every one of these has an inertia
 * heavier in recovery than in onset, because the thing that was lost —
 * a job history, a tenancy, a school year, a high street — is not
 * returned by restoring the conditions that lost it.
 */

export type ProblemKey =
  | 'homelessness'
  | 'crime'
  | 'violent_crime'
  | 'drug_harm'
  | 'domestic_violence'
  | 'youth_unemployment'
  | 'food_insecurity'
  | 'energy_poverty'
  | 'housing_stress'
  | 'social_exclusion'
  | 'community_decline'
  | 'regional_decline'
  | 'education_gap'
  | 'health_gap'
  | 'age_divide'
  | 'unrest';

export const PROBLEM_KEYS: ProblemKey[] = [
  'homelessness',
  'crime',
  'violent_crime',
  'drug_harm',
  'domestic_violence',
  'youth_unemployment',
  'food_insecurity',
  'energy_poverty',
  'housing_stress',
  'social_exclusion',
  'community_decline',
  'regional_decline',
  'education_gap',
  'health_gap',
  'age_divide',
  'unrest',
];

export interface ProblemTemplate {
  key: ProblemKey;
  label: string;
  /** What the number counts. Stated, because the units differ. */
  unit: string;
  blurb: string;
  /** Where an ordinary country sits. */
  opening: number;
  /** A reading this bad is a country in serious trouble. */
  severe: number;
  /**
   * How fast it responds to conditions getting worse, per week.
   *
   * Recovery is slower by `stickiness` — a job history, a tenancy, a
   * school year and a high street are not returned by restoring the
   * conditions that took them.
   */
  onset: number;
  /** How much slower it comes back than it went. */
  stickiness: number;
  /**
   * How much this contributes to unrest when it is bad.
   *
   * Not the same as how much harm it does. A great deal of the most
   * serious harm in this list is suffered quietly.
   */
  unrest: number;
}

export const PROBLEM_TEMPLATES: ProblemTemplate[] = [
  {
    key: 'homelessness',
    label: 'Homelessness',
    unit: 'per 10,000',
    blurb: 'Rough sleeping and temporary accommodation. Follows rents, not the economy.',
    opening: 4.2,
    severe: 40,
    onset: 0.012,
    stickiness: 2.6,
    unrest: 0.5,
  },
  {
    key: 'crime',
    label: 'Recorded crime',
    unit: 'per 1,000',
    blurb: 'What is reported, which is not the same as what happens.',
    opening: 62,
    severe: 160,
    onset: 0.01,
    stickiness: 1.9,
    unrest: 0.8,
  },
  {
    key: 'violent_crime',
    label: 'Violent crime',
    unit: 'per 1,000',
    blurb: 'The part people actually change their behaviour over.',
    opening: 7.4,
    severe: 30,
    onset: 0.008,
    stickiness: 2.2,
    unrest: 1.3,
  },
  {
    key: 'drug_harm',
    label: 'Drug harm',
    unit: 'index',
    blurb: 'Deaths, dependency and the services that are meant to reach them.',
    opening: 22,
    severe: 75,
    onset: 0.006,
    stickiness: 3.1,
    unrest: 0.3,
  },
  {
    key: 'domestic_violence',
    label: 'Domestic violence',
    unit: 'index',
    blurb:
      'Rises with pressure at home and with the loss of anywhere to go. Very largely unreported, and the figure moves with reporting as much as with incidence.',
    opening: 26,
    severe: 70,
    onset: 0.007,
    stickiness: 2.4,
    unrest: 0.2,
  },
  {
    key: 'youth_unemployment',
    label: 'Youth unemployment',
    unit: '%',
    blurb: 'Roughly twice the headline rate, and the one that scars a career.',
    /* Exactly twice the ordinary headline rate, so a country at ordinary
       unemployment generates no pressure here and sits still. */
    opening: 10.5,
    severe: 38,
    onset: 0.05,
    stickiness: 1.7,
    unrest: 1.6,
  },
  {
    key: 'food_insecurity',
    label: 'Food insecurity',
    unit: '%',
    blurb: 'Households choosing between the heating and the shopping.',
    opening: 6.5,
    severe: 30,
    onset: 0.04,
    stickiness: 1.4,
    unrest: 1.1,
  },
  {
    key: 'energy_poverty',
    label: 'Energy poverty',
    unit: '%',
    blurb: 'Homes that cannot be heated at a price the household can pay.',
    opening: 9,
    severe: 35,
    onset: 0.045,
    stickiness: 1.3,
    unrest: 1.0,
  },
  {
    key: 'housing_stress',
    label: 'Housing stress',
    unit: '%',
    blurb: 'Households paying more than a third of their income to be housed.',
    opening: 18,
    severe: 52,
    onset: 0.02,
    stickiness: 1.9,
    unrest: 1.2,
  },
  {
    key: 'social_exclusion',
    label: 'Social exclusion',
    unit: '%',
    blurb:
      'Outside work, outside secure housing and outside anything civic, all at once. The composite that predicts the rest.',
    opening: 7,
    severe: 28,
    onset: 0.008,
    stickiness: 3.4,
    unrest: 1.4,
  },
  {
    key: 'community_decline',
    label: 'Community decline',
    unit: 'index',
    blurb: 'The high street, the club, the bus and the branch. Noticed only once they are gone.',
    opening: 24,
    severe: 70,
    onset: 0.005,
    stickiness: 3.8,
    unrest: 0.9,
  },
  {
    key: 'regional_decline',
    label: 'Regional decline',
    unit: 'index',
    blurb: 'Places people leave, which is a decision made one household at a time.',
    opening: 20,
    severe: 68,
    onset: 0.004,
    stickiness: 4.2,
    unrest: 1.1,
  },
  {
    key: 'education_gap',
    label: 'Education inequality',
    unit: 'points',
    blurb: 'How far a school place depends on where a household can afford to live.',
    opening: 16,
    severe: 45,
    onset: 0.01,
    stickiness: 2.8,
    unrest: 0.6,
  },
  {
    key: 'health_gap',
    label: 'Health inequality',
    unit: 'years',
    blurb: 'The difference in life expectancy between the best and worst places to be born.',
    opening: 7.5,
    severe: 20,
    onset: 0.005,
    stickiness: 3.6,
    unrest: 0.5,
  },
  {
    key: 'age_divide',
    label: 'The age divide',
    unit: 'index',
    blurb:
      'How differently the young and the old are doing, and how differently they vote about it.',
    opening: 28,
    severe: 72,
    onset: 0.009,
    stickiness: 2.1,
    unrest: 0.8,
  },
  {
    key: 'unrest',
    label: 'Social unrest',
    unit: 'index',
    blurb: 'The composite. What a movement forms out of, and what a crisis comes from.',
    opening: 18,
    severe: 65,
    onset: 0.04,
    stickiness: 1.2,
    unrest: 0,
  },
];

export function findProblem(key: ProblemKey): ProblemTemplate {
  const found = PROBLEM_TEMPLATES.find((p) => p.key === key);
  if (!found) throw new Error(`problems: unknown problem ${key}`);
  return found;
}
