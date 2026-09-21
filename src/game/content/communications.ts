/**
 * communications.ts — what the government says, on purpose, before
 * anyone else says it for them.
 *
 * A LEAK IS INFORMATION THE GOVERNMENT DOESN'T CONTROL THE TIMING OF,
 * AND TIMING IS MOST OF WHAT COMMUNICATION IS. The same fact, announced
 * on a Tuesday morning with a line prepared, and found by a reporter on
 * a Friday night, do different amounts of damage — not because the
 * fact changed, but because one version comes with a government that
 * looks like it is in control and the other comes with a government
 * that looks like it got caught. Sitting on bad news saves the cost of
 * announcing it and risks paying the larger cost of it leaking instead,
 * which is the trade this file models rather than asserts.
 */

/** How the government approaches saying anything at all. */
export type CommsStrategy = 'reactive' | 'disciplined' | 'permanent_campaign';

export interface CommsStrategyTemplate {
  key: CommsStrategy;
  label: string;
  blurb: string;
  /** Weekly pull on discipline toward this resting level. */
  disciplineTarget: number;
  /** Ongoing weekly upkeep, in the same PC terms as everything else on the desk. */
  upkeep: number;
}

export const COMMS_STRATEGIES: CommsStrategyTemplate[] = [
  {
    key: 'reactive',
    label: 'Reactive',
    blurb: 'No line to take until there is a question to answer. Cheap, and it shows.',
    disciplineTarget: 30,
    upkeep: 0,
  },
  {
    key: 'disciplined',
    label: 'Disciplined',
    blurb: 'A line, agreed and held, department by department. What most functioning governments run.',
    disciplineTarget: 62,
    upkeep: 1,
  },
  {
    key: 'permanent_campaign',
    label: 'Permanent campaign',
    blurb: 'Never off. Builds the highest discipline this desk can produce, and the country tires of it faster than any single address would.',
    disciplineTarget: 85,
    upkeep: 3,
  },
];

export function findCommsStrategy(key: CommsStrategy): CommsStrategyTemplate {
  return COMMS_STRATEGIES.find((s) => s.key === key) ?? COMMS_STRATEGIES[1]!;
}
