/**
 * grievances.ts — what a country remembers after relations recover.
 *
 * A GRIEVANCE OUTLIVES THE RELATIONS NUMBER THAT CAUSED IT. Relations
 * can fully recover to neutral, even warm, while the specific memory of
 * being sanctioned, expelled, or walked out on stays live for decades
 * — which is why two countries with identical relations figures can be
 * completely different propositions for a new treaty, and why
 * "we're on good terms now" is not the same claim as "they trust us."
 */

/** What kind of thing left a mark. */
export type GrievanceCause = 'sanctioned' | 'diplomats_expelled' | 'treaty_withdrawn';

export interface GrievanceTemplate {
  key: GrievanceCause;
  label: string;
  blurb: string;
  /** How much this adds to the grievance score, in one go. */
  weight: number;
}

export const GRIEVANCE_CAUSES: GrievanceTemplate[] = [
  {
    key: 'sanctioned',
    label: 'Sanctioned',
    blurb: 'An economic weapon, and remembered as one long after it is lifted.',
    weight: 14,
  },
  {
    key: 'diplomats_expelled',
    label: 'Diplomats expelled',
    blurb: 'A serious step. The channel is gone and so, for a long time, is the benefit of the doubt.',
    weight: 18,
  },
  {
    key: 'treaty_withdrawn',
    label: 'A treaty walked away from',
    blurb: 'Everyone watching learns the same lesson: an agreement with you can be undone.',
    weight: 22,
  },
];

export function findGrievanceCause(key: GrievanceCause): GrievanceTemplate {
  return GRIEVANCE_CAUSES.find((g) => g.key === key) ?? GRIEVANCE_CAUSES[0]!;
}
