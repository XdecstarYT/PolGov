/**
 * peace.ts — how wars end, and why they do not.
 *
 * THE WAR AIM YOU ANNOUNCED IS THE TRAP. A government that tells the
 * country it will accept nothing less than X has made X a condition of
 * its own survival, and it did that in week one, on the strength of a
 * rally, before anybody knew whether X was achievable. By week a hundred
 * the terms on offer are worse than the ones it refused in week six, and
 * the reason it refused those is still on the record. Every sentence a
 * government says about why it is fighting is a sentence it will be read
 * back to.
 *
 * SUNK COSTS MAKE PEACE HARDER, NOT EASIER. The more a country has
 * spent, the worse any given settlement looks — which is exactly
 * backwards, because what has been spent is gone either way. This is not
 * a mistake governments make out of stupidity; it is the only position
 * they can hold in public, because "we should stop, and everything so
 * far was for nothing" is not a speech anybody has ever survived giving.
 *
 * AND SOMEBODY HAS TO SIGN IT. The government that starts a war is
 * rarely the one that can end it, because ending it means saying out
 * loud what it was worth. Most wars are ended by the people who did not
 * begin them, and that is a fact about domestic politics rather than
 * about diplomacy.
 */

/** What one side gives up. Wars end by somebody conceding something. */
export type PeaceTerm =
  | 'territory'
  | 'reparations'
  | 'disarmament'
  | 'recognition'
  | 'withdrawal'
  | 'autonomy'
  | 'access'
  | 'amnesty'
  | 'guarantees'
  | 'nothing';

export interface TermTemplate {
  key: PeaceTerm;
  label: string;
  blurb: string;
  /** How much it is worth in the bargaining, 0–100. */
  weight: number;
  /**
   * How badly it plays at home when conceded.
   *
   * Not proportional to its weight, which is the interesting part.
   * Territory is worth a great deal and costs a great deal; an amnesty
   * is worth almost nothing and is unsurvivable.
   */
  domesticCost: number;
  /** And how long the country remembers having conceded it. */
  memoryYears: number;
}

export const TERM_TEMPLATES: TermTemplate[] = [
  {
    key: 'territory',
    label: 'Territory',
    blurb: 'Ground changes hands, on a map that will be printed in schoolbooks for a century.',
    weight: 32,
    domesticCost: 22,
    memoryYears: 60,
  },
  {
    key: 'reparations',
    label: 'Reparations',
    blurb: 'Money, paid over decades, resented by everybody paying and forgotten by everybody paid.',
    weight: 18,
    domesticCost: 11,
    memoryYears: 25,
  },
  {
    key: 'disarmament',
    label: 'Limits on the forces',
    blurb: 'A ceiling on what the country may hold, which every government afterwards is asked about.',
    weight: 22,
    domesticCost: 16,
    memoryYears: 30,
  },
  {
    key: 'recognition',
    label: 'Recognition',
    blurb: 'Saying out loud that a thing is theirs. Costs nothing and is the hardest one to say.',
    weight: 14,
    domesticCost: 19,
    memoryYears: 40,
  },
  {
    key: 'withdrawal',
    label: 'Withdrawal',
    blurb: 'Going home. The only term that is also a relief, and it is never described as one.',
    weight: 20,
    domesticCost: 14,
    memoryYears: 20,
  },
  {
    key: 'autonomy',
    label: 'Autonomy for a region',
    blurb:
      'A settlement everybody signs and nobody accepts, which holds for about a generation.',
    weight: 24,
    domesticCost: 20,
    memoryYears: 45,
  },
  {
    key: 'access',
    label: 'Access',
    blurb: 'A road, a river, a strait. Small on the map and the reason the war started.',
    weight: 12,
    domesticCost: 7,
    memoryYears: 15,
  },
  {
    key: 'amnesty',
    label: 'Amnesty',
    blurb:
      'Nobody is tried. Worth almost nothing in the bargaining and close to unsurvivable at home.',
    weight: 6,
    domesticCost: 24,
    memoryYears: 35,
  },
  {
    key: 'guarantees',
    label: 'Guarantees',
    blurb: 'Somebody else promises it will not happen again, in writing, for a while.',
    weight: 10,
    domesticCost: 4,
    memoryYears: 10,
  },
  {
    key: 'nothing',
    label: 'Nothing at all',
    blurb: 'Both sides stop, claim it, and explain it differently for fifty years.',
    weight: 0,
    domesticCost: 12,
    memoryYears: 30,
  },
];

export function findTerm(key: PeaceTerm): TermTemplate {
  const found = TERM_TEMPLATES.find((t) => t.key === key);
  if (!found) throw new Error(`peace: unknown term ${key}`);
  return found;
}

/**
 * Who is holding the pen.
 *
 * A mediator does not make a settlement fairer. It makes one POSSIBLE,
 * by giving both governments somebody else to blame for the terms — and
 * that is the entire function, which is why the choice of mediator is
 * argued about more than the terms are.
 */
export type Mediator = 'none' | 'neutral_state' | 'great_power' | 'international_body' | 'ally';

export const MEDIATORS: {
  key: Mediator;
  label: string;
  blurb: string;
  /** How much easier it makes agreeing, 0–1. */
  credit: number;
  /** How much of the domestic cost it absorbs. The real service. */
  cover: number;
}[] = [
  {
    key: 'none',
    label: 'Direct talks',
    blurb:
      'Two governments in a room, each of which has to sell whatever comes out of it as a victory.',
    credit: 0,
    cover: 0,
  },
  {
    key: 'neutral_state',
    label: 'A neutral state',
    blurb: 'Somewhere with good hotels, no interest in the outcome, and a long habit of this.',
    credit: 0.22,
    cover: 0.18,
  },
  {
    key: 'great_power',
    label: 'A great power',
    blurb:
      'Brings both sides to the table by making it clear what happens if they do not come, and takes a cut of the terms.',
    credit: 0.4,
    cover: 0.3,
  },
  {
    key: 'international_body',
    label: 'An international body',
    blurb:
      'Slow, procedural, and produces a text nobody likes that both governments can blame on the text.',
    credit: 0.28,
    cover: 0.42,
  },
  {
    key: 'ally',
    label: 'An ally',
    blurb:
      'Understands the domestic problem exactly, which is why the other side does not trust a word of it.',
    credit: 0.14,
    cover: 0.36,
  },
];

export function findMediator(key: Mediator) {
  const found = MEDIATORS.find((m) => m.key === key);
  if (!found) throw new Error(`peace: unknown mediator ${key}`);
  return found;
}

/**
 * Where an intelligence estimate of the enemy goes wrong.
 *
 * NOT NOISE. Bias, and the direction is set by what the organisation
 * producing the estimate needs to be true. An army asking for resources
 * finds a larger enemy; a government that has decided on war finds a
 * smaller one; and neither is lying, because both are reading genuinely
 * ambiguous evidence in the direction they were already facing.
 */
export type EstimateBias = 'threat_inflation' | 'wishful' | 'mirror' | 'honest';

export const ESTIMATE_BIASES: {
  key: EstimateBias;
  label: string;
  blurb: string;
  /** How far the estimate is off, as a multiple of the truth. */
  factor: number;
  /** Whose interest it serves, which is how it is produced honestly. */
  serves: string;
}[] = [
  {
    key: 'threat_inflation',
    label: 'The enemy is larger than they are',
    blurb:
      'Every ambiguous piece of evidence read the worrying way, by people who will be blamed if it turns out to be the worrying way.',
    factor: 1.45,
    serves: 'an armed forces asking for a budget, and nobody is lying',
  },
  {
    key: 'wishful',
    label: 'The enemy is smaller than they are',
    blurb:
      'Every ambiguous piece of evidence read the convenient way, by people who already know what the government has decided.',
    factor: 0.66,
    serves: 'a government that has made up its mind and needs the paper to agree',
  },
  {
    key: 'mirror',
    label: 'The enemy is like us',
    blurb:
      'Assumes they want what we want, fear what we fear, and will stop where we would stop. The most expensive assumption in the subject.',
    factor: 1,
    serves: 'nobody, and it is the default because thinking otherwise is hard',
  },
  {
    key: 'honest',
    label: 'As good as it gets',
    blurb:
      'Still wrong, because the evidence is genuinely ambiguous, but wrong in both directions rather than one.',
    factor: 1,
    serves: 'an agency that has been left alone, which is rarer than it sounds',
  },
];

export function findBias(key: EstimateBias) {
  const found = ESTIMATE_BIASES.find((b) => b.key === key);
  if (!found) throw new Error(`peace: unknown bias ${key}`);
  return found;
}

/**
 * How much worse a settlement looks per point of exhaustion already
 * spent.
 *
 * The sunk cost. It is not stupidity: "we should stop, and everything so
 * far was for nothing" is not a speech anybody has survived giving, so
 * it is the only position a government can hold in public.
 */
export const SUNK_COST_WEIGHT = 0.4;

/** How much a publicly declared aim binds the government that declared it. */
export const DECLARED_AIM_WEIGHT = 0.8;
