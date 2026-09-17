/**
 * segments.ts — the electorate of Verdana, as people rather than a vector.
 *
 * Until now a region was a single ideology vector: everyone in Halloway Basin
 * wanted the same thing. This replaces that with twenty overlapping voter
 * segments, each with its own position, its own turnout habit, and its own
 * view of which issues actually matter. A region's character is now emergent —
 * it is whatever mix of people live there.
 *
 * Every segment is written as a coherent set of priorities with real internal
 * tensions. None is a caricature, none is positioned as correct, and the
 * game never suggests that any segment's preferences are the right ones.
 */

import type { Ideology } from '../types.ts';
import { makeIdeology } from '../ideology.ts';

/**
 * The issues voters weigh. Each maps to something the simulation already
 * tracks, so a segment's satisfaction is always derived from the actual state
 * of the country rather than asserted.
 */
export type IssueKey =
  | 'economy'
  | 'health'
  | 'education'
  | 'infrastructure'
  | 'environment'
  | 'cost_of_living'
  | 'tax'
  | 'debt';

export const ISSUE_LABELS: Record<IssueKey, string> = {
  economy: 'Jobs and the economy',
  health: 'Health services',
  education: 'Schools and training',
  infrastructure: 'Roads, transport and housing',
  environment: 'Environment and land',
  cost_of_living: 'Cost of living',
  tax: 'Tax burden',
  debt: 'Public debt',
};

export const ISSUE_KEYS: IssueKey[] = [
  'economy',
  'health',
  'education',
  'infrastructure',
  'environment',
  'cost_of_living',
  'tax',
  'debt',
];

export type SegmentKey =
  | 'industrial_workers'
  | 'union_members'
  | 'public_sector'
  | 'professionals'
  | 'business_owners'
  | 'small_traders'
  | 'farmers'
  | 'rural_households'
  | 'students'
  | 'young_renters'
  | 'suburban_families'
  | 'homeowners'
  | 'retirees'
  | 'low_income'
  | 'high_income'
  | 'graduates'
  | 'non_graduates'
  | 'faith_communities'
  | 'coastal_trades'
  | 'newcomers';

export interface SegmentTemplate {
  key: SegmentKey;
  label: string;
  /** One line of character. Descriptive, never evaluative. */
  blurb: string;
  /** The segment's own position. Parties near it are heard more kindly. */
  ideology: Ideology;
  /**
   * How reliably this segment votes, as a multiplier on baseline turnout.
   * Above 1 turns out more than average; below 1, less.
   */
  turnout: number;
  /**
   * How much this segment weights each issue when judging a government.
   * Weights are relative and are normalised at use.
   */
  issueWeights: Partial<Record<IssueKey, number>>;
  /**
   * How readily the segment changes its mind. High volatility swings hard on
   * performance; low volatility votes on identity almost regardless.
   */
  volatility: number;
}

export const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  {
    key: 'industrial_workers',
    label: 'Industrial workers',
    blurb: 'Shift work in heavy industry. Judges a government on whether the plant is still open.',
    ideology: makeIdeology(-0.55, -0.05, -0.15),
    turnout: 0.95,
    issueWeights: { economy: 5, cost_of_living: 4, health: 3, infrastructure: 2, environment: -1 },
    volatility: 1.1,
  },
  {
    key: 'union_members',
    label: 'Union members',
    blurb: 'Organised and well-informed. Votes as a bloc more often than not, and knows it.',
    ideology: makeIdeology(-0.7, 0.15, 0.1),
    turnout: 1.15,
    issueWeights: { economy: 4, health: 4, education: 3, cost_of_living: 3 },
    volatility: 0.7,
  },
  {
    key: 'public_sector',
    label: 'Public sector staff',
    blurb: 'Teachers, nurses, clerks. Experiences every budget decision as a working condition.',
    ideology: makeIdeology(-0.5, 0.3, 0.2),
    turnout: 1.2,
    issueWeights: { health: 5, education: 5, economy: 2, tax: -1 },
    volatility: 0.85,
  },
  {
    key: 'professionals',
    label: 'Professionals',
    blurb: 'Salaried, mobile, and attentive to competence. Forgiving of unpopularity, unforgiving of chaos.',
    ideology: makeIdeology(0.25, 0.3, 0.15),
    turnout: 1.2,
    issueWeights: { economy: 4, education: 3, infrastructure: 3, debt: 3, tax: 2 },
    volatility: 1.2,
  },
  {
    key: 'business_owners',
    label: 'Business owners',
    blurb: 'Carries the payroll personally. Reads the budget line before the speech.',
    ideology: makeIdeology(0.7, -0.05, -0.2),
    turnout: 1.25,
    issueWeights: { economy: 5, tax: 5, debt: 3, infrastructure: 2 },
    volatility: 0.9,
  },
  {
    key: 'small_traders',
    label: 'Small traders',
    blurb: 'High street shops and trades. Feels every change in consumer spending within a fortnight.',
    ideology: makeIdeology(0.45, -0.15, -0.1),
    turnout: 1.0,
    issueWeights: { cost_of_living: 5, economy: 4, tax: 4, infrastructure: 2 },
    volatility: 1.25,
  },
  {
    key: 'farmers',
    label: 'Farmers',
    blurb: 'Land, weather and margins. Long memories about who showed up in a bad season.',
    ideology: makeIdeology(0.35, -0.4, 0.05),
    turnout: 1.15,
    issueWeights: { economy: 4, infrastructure: 4, environment: 2, tax: 3 },
    volatility: 0.8,
  },
  {
    key: 'rural_households',
    label: 'Rural households',
    blurb: 'Small towns and distances. Notices a closed clinic faster than a national statistic.',
    ideology: makeIdeology(0.15, -0.45, -0.05),
    turnout: 1.05,
    issueWeights: { health: 5, infrastructure: 5, education: 3, cost_of_living: 3 },
    volatility: 0.95,
  },
  {
    key: 'students',
    label: 'Students',
    blurb: 'Engaged in argument, erratic at the ballot box. Moves in large numbers when it moves.',
    ideology: makeIdeology(-0.35, 0.75, 0.6),
    turnout: 0.6,
    issueWeights: { education: 5, environment: 4, cost_of_living: 4, health: 2 },
    volatility: 1.6,
  },
  {
    key: 'young_renters',
    label: 'Young renters',
    blurb: 'Housing costs dominate everything else. Lowest stake in the status quo of any group.',
    ideology: makeIdeology(-0.3, 0.6, 0.45),
    turnout: 0.7,
    issueWeights: { cost_of_living: 6, infrastructure: 4, economy: 3, environment: 2 },
    volatility: 1.5,
  },
  {
    key: 'suburban_families',
    label: 'Suburban families',
    blurb: 'Schools, commute, bills. The largest genuinely persuadable group in the country.',
    ideology: makeIdeology(0.1, 0.05, 0.05),
    turnout: 1.05,
    issueWeights: { education: 4, health: 4, cost_of_living: 4, infrastructure: 3, tax: 2 },
    volatility: 1.35,
  },
  {
    key: 'homeowners',
    label: 'Homeowners',
    blurb: 'Equity in one asset. Interested in stability and suspicious of anything that moves prices.',
    ideology: makeIdeology(0.3, -0.1, 0),
    turnout: 1.25,
    issueWeights: { tax: 4, economy: 3, infrastructure: 3, debt: 3, cost_of_living: 2 },
    volatility: 0.85,
  },
  {
    key: 'retirees',
    label: 'Retirees',
    blurb: 'Votes in every election without fail. Health and prices; very little else.',
    ideology: makeIdeology(0.2, -0.45, -0.1),
    turnout: 1.4,
    issueWeights: { health: 6, cost_of_living: 5, debt: 2, tax: 2 },
    volatility: 0.6,
  },
  {
    key: 'low_income',
    label: 'Lower-income households',
    blurb: 'Least margin for error. Turnout is depressed less by apathy than by circumstance.',
    ideology: makeIdeology(-0.6, 0.1, 0),
    turnout: 0.65,
    issueWeights: { cost_of_living: 6, health: 5, economy: 4, education: 2 },
    volatility: 1.2,
  },
  {
    key: 'high_income',
    label: 'Higher-income households',
    blurb: 'Insulated from most shocks. Attentive to tax and to the long fiscal picture.',
    ideology: makeIdeology(0.6, 0.15, -0.05),
    turnout: 1.3,
    issueWeights: { tax: 6, debt: 4, economy: 3 },
    volatility: 0.75,
  },
  {
    key: 'graduates',
    label: 'Graduates',
    blurb: 'Reads the detail and punishes contradictions. Overrepresented in every argument.',
    ideology: makeIdeology(-0.1, 0.5, 0.4),
    turnout: 1.25,
    issueWeights: { education: 4, environment: 4, economy: 3, health: 3, debt: 2 },
    volatility: 1.15,
  },
  {
    key: 'non_graduates',
    label: 'Non-graduates',
    blurb: 'Judges on outcomes rather than argument. Least impressed by process reforms.',
    ideology: makeIdeology(-0.1, -0.35, -0.15),
    turnout: 0.85,
    issueWeights: { economy: 5, cost_of_living: 5, health: 4, infrastructure: 3 },
    volatility: 1.2,
  },
  {
    key: 'faith_communities',
    label: 'Faith communities',
    blurb: 'Dense local networks and high turnout. Values continuity and community provision alike.',
    ideology: makeIdeology(-0.05, -0.6, 0.05),
    turnout: 1.2,
    issueWeights: { health: 4, education: 4, cost_of_living: 3 },
    volatility: 0.7,
  },
  {
    key: 'coastal_trades',
    label: 'Coastal trades',
    blurb: 'Fishing, ports and seasonal tourism. Exposed to weather, quotas and fuel prices at once.',
    ideology: makeIdeology(0.2, -0.2, 0.2),
    turnout: 1.0,
    issueWeights: { economy: 5, environment: 3, infrastructure: 4, cost_of_living: 3 },
    volatility: 1.1,
  },
  {
    key: 'newcomers',
    label: 'Recent arrivals',
    blurb: 'Building a life from scratch. Public services matter more than politics does.',
    ideology: makeIdeology(-0.2, 0.4, 0.15),
    turnout: 0.7,
    issueWeights: { health: 5, education: 5, cost_of_living: 4, economy: 4 },
    volatility: 1.05,
  },
];

export const SEGMENT_KEYS: SegmentKey[] = SEGMENT_TEMPLATES.map((s) => s.key);

export function segmentTemplate(key: SegmentKey): SegmentTemplate {
  const found = SEGMENT_TEMPLATES.find((s) => s.key === key);
  if (!found) throw new Error(`segments: unknown segment ${key}`);
  return found;
}
