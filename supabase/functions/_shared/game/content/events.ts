/**
 * events.ts — crisis and opportunity templates.
 *
 * The model never decides mechanics. Each template fixes its category,
 * severity band, choice list and mechanical consequences here in code; only
 * the `narrative` string is ever replaced by ai-narrator output, and the
 * string shipped below is a complete, playable fallback.
 *
 * `weight` reads the current state so the world responds to how it is being
 * run: starved sectors invite their own crises, debt invites market trouble,
 * low approval invites unrest.
 */

import type { EventCategory, EventChoice, SectorKey } from '../types.ts';

export interface EventWeightContext {
  sectorHealth: Record<SectorKey, number>;
  approval: number;
  debt: number;
  treasury: number;
  turnNumber: number;
  averageMood: number;

  /*
   * The state of the country as Engine 2 models it.
   *
   * Optional because a handful of tests build a context by hand and care
   * only about sector health. Every template that reads these guards for
   * absence, so a partial context produces a plausible world rather than a
   * crash — but the real game always passes all of it, and crises that fire
   * out of nowhere are exactly what this exists to prevent.
   */
  /** Debt as a share of a year's output. */
  debtRatio?: number;
  /** The central bank's policy rate, %. */
  policyRate?: number;
  /** Annualised real growth, %. */
  growth?: number;
  /** Output against capacity, %. */
  outputGap?: number;
  /** Annual inflation, %. */
  inflation?: number;
  /** Per cent out of work. */
  unemployment?: number;
  /** True when the country is formally in recession. */
  inRecession?: boolean;
  /** Health of named industries, 100 = normal. */
  industryHealth?: Partial<Record<string, number>>;
  /** Worst infrastructure condition in the country, 0–100. */
  worstAssetCondition?: number;
  /** Total deferred maintenance, ₡bn. */
  maintenanceBacklog?: number;
  /** Share of the population past retiring age. */
  retiredShare?: number;
}

export interface EventTemplate {
  key: string;
  category: EventCategory;
  title: string;
  /** Fallback prose. Fully playable with the AI layer switched off. */
  narrative: string;
  minSeverity: number;
  maxSeverity: number;
  weight: (ctx: EventWeightContext) => number;
  choices: (severity: number) => EventChoice[];
}

/** Scales an effect by severity (1 = mild, 3 = severe). */
const s = (base: number, severity: number) => Math.round(base * severity * 10) / 10;

/** Raises weight as a value falls below a threshold. */
const below = (value: number, threshold: number, scale = 0.06) =>
  Math.max(0, (threshold - value) * scale);

/** Raises weight as a value climbs above a threshold. */
const above = (value: number, threshold: number, scale = 0.01) =>
  Math.max(0, (value - threshold) * scale);

export const EVENT_TEMPLATES: EventTemplate[] = [
  /* ----------------------- economic shock ----------------------- */
  {
    key: 'export-contraction',
    category: 'economic_shock',
    title: 'Export Orders Fall Away',
    narrative:
      'Three of the largest overseas buyers have cut forward orders in the same quarter. The trade desk cannot yet say whether this is a cycle or a shift, and the manufacturing districts will not wait for the distinction.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) => 1 + below(c.sectorHealth.economy, 55) + above(c.debt, 250),
    choices: (v) => [
      {
        label: 'Stand up an export credit facility',
        tradeoff: 'Holds the order book together with public money you have to find now.',
        pcCost: 4,
        effects: { treasury: -s(9, v), sectorDeltas: { economy: s(2, v) } },
      },
      {
        label: 'Let the correction run',
        tradeoff: 'Costs nothing today. The districts take the hit and remember it.',
        pcCost: 0,
        effects: { sectorDeltas: { economy: -s(3, v) }, approval: -s(1.6, v) },
      },
      {
        label: 'Fund short-time working instead of redundancies',
        tradeoff: 'Keeps people attached to their jobs; a slower, cheaper, less visible answer.',
        pcCost: 6,
        effects: {
          treasury: -s(5, v),
          sectorDeltas: { economy: -s(1, v) },
          approval: s(1.2, v),
        },
      },
    ],
  },
  {
    key: 'currency-pressure',
    category: 'economic_shock',
    title: 'Pressure on the Currency',
    narrative:
      'The exchange rate has moved against you for six consecutive sessions. Importers are repricing, the central bank is briefing that it will not act alone, and every option on the table is unpopular with somebody.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) => 0.8 + above(c.debt, 200, 0.012) + below(c.sectorHealth.economy, 50),
    choices: (v) => [
      {
        label: 'Back the bank publicly and hold the line',
        tradeoff: 'Steadies markets at the cost of tying yourself to an outcome you do not control.',
        pcCost: 8,
        effects: { sectorDeltas: { economy: s(1.5, v) }, approval: -s(0.8, v) },
      },
      {
        label: 'Announce a fiscal tightening signal',
        tradeoff: 'Credible to lenders, read domestically as a promise of cuts to come.',
        pcCost: 5,
        effects: { debt: -s(8, v), approval: -s(2.2, v) },
      },
      {
        label: 'Say nothing and let it settle',
        tradeoff: 'Preserves your options entirely, and cedes the narrative for a week.',
        pcCost: 0,
        effects: { sectorDeltas: { economy: -s(2, v) } },
      },
    ],
  },
  {
    key: 'employer-insolvency',
    category: 'economic_shock',
    title: 'A Principal Employer Fails',
    narrative:
      'The largest private employer in one of the older industrial districts has entered administration overnight. The workforce is counted in thousands, the supply chain in hundreds of firms, and the administrators want an answer by the end of the week.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => 0.7 + below(c.sectorHealth.economy, 50, 0.08),
    choices: (v) => [
      {
        label: 'Take an emergency public stake',
        tradeoff: 'Saves the jobs now and puts the state on the hook for a business it cannot run.',
        pcCost: 12,
        effects: {
          treasury: -s(16, v),
          sectorDeltas: { economy: s(1.5, v) },
          approval: s(2.4, v),
        },
      },
      {
        label: 'Fund retraining and transition instead',
        tradeoff: 'Honest about what is finished. It reads as abandonment in the district itself.',
        pcCost: 6,
        effects: {
          treasury: -s(7, v),
          sectorDeltas: { education: s(1.5, v), economy: -s(1.5, v) },
          approval: -s(1.2, v),
        },
      },
      {
        label: 'Broker a private sale on any terms',
        tradeoff: 'Costs the treasury nothing and hands the buyer every concession they ask for.',
        pcCost: 9,
        effects: { sectorDeltas: { economy: -s(0.5, v) }, approval: -s(0.6, v), revenueDelta: -1 },
      },
    ],
  },
  {
    key: 'supply-disruption',
    category: 'economic_shock',
    title: 'Supply Routes Disrupted',
    narrative:
      'A shipping bottleneck outside your waters has stalled inbound freight. Shelves are still full, the forward contracts are not, and the retail associations are asking publicly what the government intends to do.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: (c) => 0.9 + below(c.sectorHealth.infrastructure, 55),
    choices: (v) => [
      {
        label: 'Release strategic reserves',
        tradeoff: 'Immediate relief, and the reserve is not there for the next one.',
        pcCost: 3,
        effects: { treasury: -s(6, v), approval: s(1.2, v) },
      },
      {
        label: 'Prioritise medical and food freight by order',
        tradeoff: 'Protects what matters most and visibly rations everything else.',
        pcCost: 5,
        effects: { sectorDeltas: { health: s(1, v), economy: -s(1.5, v) } },
      },
    ],
  },
  {
    key: 'rating-review',
    category: 'economic_shock',
    title: 'Sovereign Rating Under Review',
    narrative:
      'A ratings agency has placed the sovereign on review with negative implications, citing the trajectory of borrowing rather than its level. They have asked for a meeting and a plan.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => above(c.debt, 260, 0.02),
    choices: (v) => [
      {
        label: 'Publish a binding consolidation path',
        tradeoff: 'Protects the borrowing cost by pre-committing to cuts you must then deliver.',
        pcCost: 10,
        effects: { debt: -s(10, v), approval: -s(2.6, v) },
      },
      {
        label: 'Dispute the methodology in public',
        tradeoff: 'Plays well domestically and does nothing whatsoever to the interest bill.',
        pcCost: 4,
        effects: { approval: s(1, v), debt: s(6, v) },
      },
      {
        label: 'Accept the downgrade quietly',
        tradeoff: 'Spends no capital and lets the cost of every future borrowing rise.',
        pcCost: 0,
        effects: { debt: s(12, v) },
      },
    ],
  },

  /* ---------------------- natural disaster ---------------------- */
  {
    key: 'coastal-flooding',
    category: 'natural_disaster',
    title: 'Coastal Flooding',
    narrative:
      'A tidal surge has overtopped defences along the low reaches. Evacuation is underway, the defences held where they had been renewed and failed where they had not, and the comparison is already being drawn.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) =>
      0.6 + below(c.sectorHealth.infrastructure, 55, 0.08) + below(c.sectorHealth.environment, 50),
    choices: (v) => [
      {
        label: 'Full emergency response and rebuild pledge',
        tradeoff: 'The right answer on the ground, at a cost you have not budgeted for.',
        pcCost: 6,
        effects: {
          treasury: -s(14, v),
          sectorDeltas: { infrastructure: s(1.5, v) },
          approval: s(2.6, v),
        },
      },
      {
        label: 'Relief only, defer reconstruction',
        tradeoff: 'Controls the cost and leaves the same communities exposed to the next surge.',
        pcCost: 3,
        effects: {
          treasury: -s(6, v),
          sectorDeltas: { infrastructure: -s(1.5, v) },
          approval: -s(0.8, v),
        },
      },
      {
        label: 'Announce a permanent defence programme',
        tradeoff: 'Fixes the underlying exposure with borrowing that outlasts your term.',
        pcCost: 9,
        effects: {
          debt: s(18, v),
          sectorDeltas: { infrastructure: s(3, v), environment: s(1, v) },
          approval: s(1.6, v),
        },
      },
    ],
  },
  {
    key: 'wildfire-season',
    category: 'natural_disaster',
    title: 'Severe Fire Season',
    narrative:
      'The uplands have been burning for nine days. The fire service is holding, barely, and has asked for a decision on whether to commit the strategic reserve or keep it for the weeks still to come.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) => 0.5 + below(c.sectorHealth.environment, 50, 0.08),
    choices: (v) => [
      {
        label: 'Commit every available asset now',
        tradeoff: 'Ends this fire faster and leaves nothing in hand for the next.',
        pcCost: 4,
        effects: {
          treasury: -s(8, v),
          sectorDeltas: { environment: -s(1, v) },
          approval: s(1.8, v),
        },
      },
      {
        label: 'Hold the reserve, fight defensively',
        tradeoff: 'Disciplined and defensible; more land burns and it will be filmed.',
        pcCost: 2,
        effects: { sectorDeltas: { environment: -s(3, v) }, approval: -s(1.4, v) },
      },
    ],
  },
  {
    key: 'severe-winter',
    category: 'natural_disaster',
    title: 'Prolonged Severe Winter',
    narrative:
      'Six weeks of hard weather have pushed the health service past its planned surge capacity and closed two of the trunk routes intermittently. Neither system was built with much slack in it.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) =>
      0.5 + below(c.sectorHealth.health, 55) + below(c.sectorHealth.infrastructure, 50),
    choices: (v) => [
      {
        label: 'Emergency funding to both services',
        tradeoff: 'Buys through the peak; the money comes straight off the bottom line.',
        pcCost: 5,
        effects: {
          treasury: -s(10, v),
          sectorDeltas: { health: s(1.5, v), infrastructure: s(1, v) },
          approval: s(1.4, v),
        },
      },
      {
        label: 'Reprioritise within existing budgets',
        tradeoff: 'Fiscally clean, and something else quietly goes without.',
        pcCost: 7,
        effects: { sectorDeltas: { health: -s(1, v), education: -s(1.5, v) } },
      },
    ],
  },
  {
    key: 'seismic-event',
    category: 'natural_disaster',
    title: 'Seismic Event Inland',
    narrative:
      'A moderate earthquake has damaged older building stock across two districts. Casualties are low, structural surveys are not finished, and the question of who signed off the building standards is already in circulation.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => 0.35 + below(c.sectorHealth.infrastructure, 45),
    choices: (v) => [
      {
        label: 'Guarantee full reconstruction',
        tradeoff: 'Unambiguous and correct, and it is borrowed money.',
        pcCost: 7,
        effects: { debt: s(16, v), sectorDeltas: { infrastructure: s(2, v) }, approval: s(2.4, v) },
      },
      {
        label: 'Order a standards review first',
        tradeoff: 'Prevents the next one; the people in temporary housing wait on the findings.',
        pcCost: 5,
        effects: {
          treasury: -s(5, v),
          sectorDeltas: { infrastructure: s(1, v) },
          approval: -s(1.2, v),
        },
      },
    ],
  },

  /* --------------------------- scandal -------------------------- */
  {
    key: 'procurement-irregularity',
    category: 'scandal',
    title: 'Procurement Irregularity',
    narrative:
      'An audit has found that a mid-sized contract was awarded outside the normal competitive process. Nobody alleges corruption yet. The paperwork is bad enough on its own.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) => 0.8 + below(c.approval, 45, 0.02),
    choices: (v) => [
      {
        label: 'Publish the audit in full immediately',
        tradeoff: 'One bad day instead of six, and everything in the file is now public.',
        pcCost: 4,
        effects: { approval: -s(1.4, v), politicalCapital: -2 },
      },
      {
        label: 'Refer it to an independent reviewer',
        tradeoff: 'Buys time and credibility, and hands the timing of the story to someone else.',
        pcCost: 6,
        effects: { approval: -s(0.7, v) },
      },
      {
        label: 'Defend the award as within the rules',
        tradeoff: 'Costs nothing if it holds. It compounds badly if anything else surfaces.',
        pcCost: 2,
        effects: { approval: -s(2.6, v), coalitionMood: -s(2, v) },
      },
    ],
  },
  {
    key: 'ministerial-expenses',
    category: 'scandal',
    title: 'Ministerial Expenses Disclosure',
    narrative:
      'A routine disclosure has produced an unroutine figure against one of your ministers. The sum is small, the explanation is complicated, and complicated explanations do not travel well.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: (c) => 0.9 + below(c.approval, 50, 0.015),
    choices: (v) => [
      {
        label: 'Require immediate repayment and an apology',
        tradeoff: 'Ends it in a day, and concedes the premise that something was wrong.',
        pcCost: 3,
        effects: { approval: -s(0.8, v) },
      },
      {
        label: 'Dismiss the minister',
        tradeoff: 'Decisive and clean. You lose a competent minister and their faction notices.',
        pcCost: 8,
        effects: { approval: s(0.6, v), coalitionMood: -s(4, v) },
      },
      {
        label: 'Back them fully',
        tradeoff: 'Loyalty is worth something internally. Externally this runs for a fortnight.',
        pcCost: 5,
        effects: { approval: -s(2.2, v), coalitionMood: s(2, v) },
      },
    ],
  },
  {
    key: 'leaked-memorandum',
    category: 'scandal',
    title: 'Leaked Internal Memorandum',
    narrative:
      'A candid internal assessment has reached the press with its frankest paragraph intact. The analysis was sound. The wording was never meant to leave the building.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: () => 0.85,
    choices: (v) => [
      {
        label: 'Own the analysis, defend the candour',
        tradeoff: 'Respected by people who read it properly; the paragraph still gets quoted alone.',
        pcCost: 5,
        effects: { approval: -s(1, v), politicalCapital: 3 },
      },
      {
        label: 'Launch a leak inquiry',
        tradeoff: 'Signals that you take it seriously and guarantees a second week of coverage.',
        pcCost: 7,
        effects: { approval: -s(1.8, v), coalitionMood: -s(2, v) },
      },
      {
        label: 'Disown the document',
        tradeoff: 'Kills the story quickly at the price of every official who worked on it.',
        pcCost: 3,
        effects: { approval: -s(0.6, v), politicalCapital: -6 },
      },
    ],
  },
  {
    key: 'donor-access',
    category: 'scandal',
    title: 'Questions Over Donor Access',
    narrative:
      'A newspaper has matched your published diary against your published donations and found a pattern it considers newsworthy. Everything disclosed was disclosed correctly, which is not the same as it looking well.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => 0.6 + below(c.approval, 48, 0.02),
    choices: (v) => [
      {
        label: 'Publish the full meeting record voluntarily',
        tradeoff: 'Demonstrates you have nothing to hide, and sets a precedent you must now keep.',
        pcCost: 6,
        effects: { approval: -s(0.8, v), politicalCapital: -4 },
      },
      {
        label: 'Announce a tightening of the access rules',
        tradeoff: 'Converts an attack into a reform, and closes a door you use.',
        pcCost: 9,
        effects: { approval: s(1.2, v), politicalCapital: -6 },
      },
      {
        label: 'Point to the disclosure rules and move on',
        tradeoff: 'Accurate, minimal effort, and entirely unpersuasive to anyone not already with you.',
        pcCost: 1,
        effects: { approval: -s(2.4, v) },
      },
    ],
  },
  {
    key: 'appointment-controversy',
    category: 'scandal',
    title: 'Contested Appointment',
    narrative:
      'Your nominee to an independent body has a prior association with one of your coalition partners. The nominee is qualified. The association is real. Both facts are being reported as though only one of them is.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: () => 0.7,
    choices: (v) => [
      {
        label: 'Proceed with the appointment',
        tradeoff: 'Keeps your partner close and confirms the critics’ framing for them.',
        pcCost: 5,
        effects: { approval: -s(1.8, v), coalitionMood: s(4, v) },
      },
      {
        label: 'Withdraw and reopen the competition',
        tradeoff: 'Neutralises the story and tells your partner exactly what their support is worth.',
        pcCost: 4,
        effects: { approval: s(0.8, v), coalitionMood: -s(5, v) },
      },
    ],
  },

  /* -------------------------- diplomatic ------------------------- */
  {
    key: 'trade-negotiation',
    category: 'diplomatic',
    title: 'Trade Negotiation Opens',
    narrative:
      'A neighbouring bloc has opened talks on tariff alignment. Their offer is serious, their timetable is short, and the sectors that gain are not the sectors that lose.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: () => 0.8,
    choices: (v) => [
      {
        label: 'Sign the broad agreement',
        tradeoff: 'Opens real markets for exporters and exposes domestic producers to the same.',
        pcCost: 8,
        effects: {
          revenueDelta: s(2, v),
          sectorDeltas: { economy: s(2.5, v) },
          approval: -s(1, v),
        },
      },
      {
        label: 'Negotiate carve-outs for exposed sectors',
        tradeoff: 'Protects the districts that would have paid, and the deal shrinks accordingly.',
        pcCost: 11,
        effects: { revenueDelta: s(0.8, v), sectorDeltas: { economy: s(1, v) }, approval: s(1, v) },
      },
      {
        label: 'Decline to open talks',
        tradeoff: 'No disruption and no gain. The bloc will not offer these terms twice.',
        pcCost: 2,
        effects: { sectorDeltas: { economy: -s(1, v) } },
      },
    ],
  },
  {
    key: 'border-dispute',
    category: 'diplomatic',
    title: 'Maritime Boundary Dispute',
    narrative:
      'A neighbouring state has begun surveying inside a boundary you consider settled and they consider arguable. Nobody wants an incident. Everybody wants to be seen not to have conceded.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: () => 0.5,
    choices: (v) => [
      {
        label: 'Deploy a visible patrol presence',
        tradeoff: 'Firm, popular, and it raises the cost of every subsequent step.',
        pcCost: 7,
        effects: { treasury: -s(6, v), approval: s(2, v) },
      },
      {
        label: 'Take it to arbitration',
        tradeoff: 'Lowers the temperature and binds you to a ruling you cannot predict.',
        pcCost: 5,
        effects: { approval: -s(0.8, v), politicalCapital: 2 },
      },
      {
        label: 'Open quiet talks on joint survey rights',
        tradeoff: 'Likely to work, and impossible to present as a win.',
        pcCost: 9,
        effects: { approval: -s(1.4, v), revenueDelta: s(0.8, v) },
      },
    ],
  },
  {
    key: 'treaty-ratification',
    category: 'diplomatic',
    title: 'Treaty Ratification Due',
    narrative:
      'A multilateral instrument your predecessors signed now falls due for ratification. Parts of it constrain what future governments — including yours — may do.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: () => 0.6,
    choices: (v) => [
      {
        label: 'Ratify in full',
        tradeoff: 'Buys standing and cooperation, and permanently narrows your own options.',
        pcCost: 9,
        effects: {
          approval: s(0.8, v),
          sectorDeltas: { environment: s(1.5, v) },
          politicalCapital: -4,
        },
      },
      {
        label: 'Ratify with reservations',
        tradeoff: 'Keeps your freedom of action and irritates every other signatory.',
        pcCost: 6,
        effects: { approval: -s(0.4, v) },
      },
      {
        label: 'Defer the vote',
        tradeoff: 'Costs nothing now and leaves the question sitting in your diary indefinitely.',
        pcCost: 1,
        effects: { politicalCapital: -3 },
      },
    ],
  },
  {
    key: 'arrival-surge',
    category: 'diplomatic',
    title: 'Sudden Arrival Surge',
    narrative:
      'Instability beyond the region has produced a sharp increase in arrivals at the eastern ports. Reception capacity was built for a fraction of this, and the districts affected did not choose it.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => 0.5 + below(c.sectorHealth.infrastructure, 50),
    choices: (v) => [
      {
        label: 'Fund emergency reception capacity',
        tradeoff: 'Manages the situation properly and is expensive and contested in equal measure.',
        pcCost: 8,
        effects: { treasury: -s(11, v), approval: -s(1, v), sectorDeltas: { health: -s(0.5, v) } },
      },
      {
        label: 'Distribute arrivals across all regions',
        tradeoff: 'Shares the load fairly and spreads the political cost to places that had none.',
        pcCost: 11,
        effects: { approval: -s(1.8, v), coalitionMood: -s(3, v) },
      },
      {
        label: 'Process at the border with strict limits',
        tradeoff: 'Controls numbers visibly, at a standard that will be litigated for years.',
        pcCost: 6,
        effects: { approval: s(1.4, v), coalitionMood: -s(4, v), treasury: -s(4, v) },
      },
    ],
  },

  /* ------------------------ social unrest ------------------------ */
  {
    key: 'public-sector-strike',
    category: 'social_unrest',
    title: 'Coordinated Public Sector Strike',
    narrative:
      'Three service unions have coordinated action for the first time in a decade. Their case is arithmetical and public, and the disruption starts on Monday whatever you decide tonight.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) =>
      0.6 + below(c.sectorHealth.health, 55) + below(c.sectorHealth.education, 55) + below(c.approval, 45, 0.02),
    choices: (v) => [
      {
        label: 'Settle at the figure asked',
        tradeoff: 'Ends it immediately and prices every future negotiation off this number.',
        pcCost: 6,
        effects: {
          treasury: -s(9, v),
          fundingDeltas: { health: 1, education: 1 },
          approval: s(1.2, v),
        },
      },
      {
        label: 'Hold the line and legislate on minimum service',
        tradeoff: 'Protects the budget and guarantees a long, bitter, visible dispute.',
        pcCost: 10,
        effects: {
          sectorDeltas: { health: -s(2, v), education: -s(2, v) },
          approval: -s(2, v),
        },
      },
      {
        label: 'Offer binding independent arbitration',
        tradeoff: 'Defensible to both sides, and you are bound by whatever it returns.',
        pcCost: 7,
        effects: { treasury: -s(5, v), approval: s(0.4, v) },
      },
    ],
  },
  {
    key: 'protest-wave',
    category: 'social_unrest',
    title: 'Sustained Protests in the Capital',
    narrative:
      'The demonstrations have entered their third week and have stopped being about any single decision. Policing costs are mounting and the footage each evening is doing more work than the arguments.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) => 0.5 + below(c.approval, 42, 0.04),
    choices: (v) => [
      {
        label: 'Meet the organisers publicly',
        tradeoff: 'Lowers the temperature and confers a legitimacy you cannot later withdraw.',
        pcCost: 6,
        effects: { approval: s(1.2, v), politicalCapital: -3 },
      },
      {
        label: 'Increase the policing presence',
        tradeoff: 'Restores order on the street, and the images get worse before they get better.',
        pcCost: 4,
        effects: { treasury: -s(5, v), approval: -s(1.8, v) },
      },
      {
        label: 'Concede one specific demand',
        tradeoff: 'Splits the movement effectively, and every remaining group now knows the method.',
        pcCost: 8,
        effects: { approval: s(0.6, v), treasury: -s(6, v), coalitionMood: -s(3, v) },
      },
    ],
  },
  {
    key: 'housing-demonstrations',
    category: 'social_unrest',
    title: 'Housing Cost Demonstrations',
    narrative:
      'Rent has outrun wages in the four largest towns for six consecutive quarters, and the people who noticed first are now organised. The arithmetic is not in dispute.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: (c) => 0.6 + below(c.sectorHealth.infrastructure, 55, 0.05),
    choices: (v) => [
      {
        label: 'Announce emergency rent stabilisation',
        tradeoff: 'Immediate relief for tenants and a measurable freeze on new supply.',
        pcCost: 9,
        effects: {
          approval: s(2.4, v),
          sectorDeltas: { infrastructure: -s(1.5, v), economy: -s(1, v) },
        },
      },
      {
        label: 'Fund a large public building programme',
        tradeoff: 'Addresses the actual cause, and delivers nothing anyone can see for years.',
        pcCost: 7,
        effects: { debt: s(14, v), sectorDeltas: { infrastructure: s(2.5, v) }, approval: s(0.6, v) },
      },
    ],
  },
  {
    key: 'autonomy-march',
    category: 'social_unrest',
    title: 'Regional Autonomy Mobilisation',
    narrative:
      'One of the outer regions has held its largest political gathering in living memory, on a platform of fiscal autonomy. Their case rests on numbers your own treasury published.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => 0.4 + below(c.approval, 45, 0.02),
    choices: (v) => [
      {
        label: 'Open a devolution settlement',
        tradeoff: 'Defuses it durably and permanently reduces what the centre controls.',
        pcCost: 12,
        effects: { approval: s(1.4, v), revenueDelta: -s(1.5, v), coalitionMood: -s(2, v) },
      },
      {
        label: 'Offer targeted investment instead',
        tradeoff: 'Cheaper than constitutional change and treated locally as a payment to go quiet.',
        pcCost: 6,
        effects: { treasury: -s(10, v), approval: s(0.4, v) },
      },
      {
        label: 'Restate the constitutional position',
        tradeoff: 'Concedes nothing and hands the movement its next recruiting argument.',
        pcCost: 3,
        effects: { approval: -s(1.6, v) },
      },
    ],
  },

  /* ------------------------- opportunity ------------------------- */
  {
    key: 'technology-bid',
    category: 'opportunity',
    title: 'Major Investment Bid',
    narrative:
      'An international manufacturer is choosing between your country and two others for a large facility. They have asked what you can offer, and they have been explicit that they are asking everyone.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: (c) => 0.7 + Math.max(0, (c.sectorHealth.economy - 55) * 0.02),
    choices: (v) => [
      {
        label: 'Offer a substantial incentive package',
        tradeoff: 'Very likely wins the plant, and every future investor now knows your opening bid.',
        pcCost: 6,
        effects: {
          treasury: -s(13, v),
          sectorDeltas: { economy: s(4, v) },
          approval: s(1.6, v),
          revenueDelta: s(1.2, v),
        },
      },
      {
        label: 'Compete on infrastructure and skills only',
        tradeoff: 'Builds something that outlasts this deal, and may well lose this deal.',
        pcCost: 4,
        effects: {
          treasury: -s(6, v),
          sectorDeltas: { education: s(1.5, v), infrastructure: s(1, v) },
        },
      },
      {
        label: 'Decline to bid',
        tradeoff: 'Keeps the money and concedes the facility to a competitor state.',
        pcCost: 0,
        effects: { approval: -s(0.8, v) },
      },
    ],
  },
  {
    key: 'summit-invitation',
    category: 'opportunity',
    title: 'Invitation to Host a Summit',
    narrative:
      'You have been offered the chair of a regional summit at short notice. The standing is real; so is the security bill and the fortnight it removes from your domestic diary.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: () => 0.6,
    choices: (v) => [
      {
        label: 'Accept and host it fully',
        tradeoff: 'Genuine standing abroad, paid for in money and in a fortnight of absence at home.',
        pcCost: 5,
        effects: { treasury: -s(8, v), approval: s(2, v), politicalCapital: -4 },
      },
      {
        label: 'Attend without hosting',
        tradeoff: 'Most of the benefit at a fraction of the cost, and none of the chair’s leverage.',
        pcCost: 2,
        effects: { approval: s(0.6, v) },
      },
    ],
  },
  {
    key: 'resource-discovery',
    category: 'opportunity',
    title: 'Commercial Resource Discovery',
    narrative:
      'A survey has confirmed a commercially viable deposit under one of the protected margins. The valuation is substantial. So is the designation that currently sits on top of it.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: () => 0.45,
    choices: (v) => [
      {
        label: 'Licence extraction',
        tradeoff: 'A serious and lasting revenue stream, taken out of protected ground.',
        pcCost: 10,
        effects: {
          revenueDelta: s(3, v),
          sectorDeltas: { economy: s(3, v), environment: -s(5, v) },
          approval: -s(1.2, v),
        },
      },
      {
        label: 'Licence with a sovereign fund and strict conditions',
        tradeoff: 'Captures more of the value for the public and delays every pound of it.',
        pcCost: 13,
        effects: {
          revenueDelta: s(1.8, v),
          sectorDeltas: { environment: -s(2.5, v) },
          treasury: -s(4, v),
        },
      },
      {
        label: 'Maintain the protection',
        tradeoff: 'Keeps a promise exactly as made, and forgoes revenue you badly need.',
        pcCost: 4,
        effects: { sectorDeltas: { environment: s(2, v) }, approval: s(0.4, v) },
      },
    ],
  },
  {
    key: 'endowment',
    category: 'opportunity',
    title: 'Private Endowment Offered',
    narrative:
      'A large private foundation has offered to endow a national programme in a field of your choosing. They want naming rights and a seat on the governing board.',
    minSeverity: 1,
    maxSeverity: 1,
    weight: () => 0.5,
    choices: () => [
      {
        label: 'Accept for education',
        tradeoff: 'Substantial free capacity, with a private board seat over public provision.',
        pcCost: 3,
        effects: { sectorDeltas: { education: 4 }, approval: 0.8 },
      },
      {
        label: 'Accept for health',
        tradeoff: 'Substantial free capacity, with a private board seat over public provision.',
        pcCost: 3,
        effects: { sectorDeltas: { health: 4 }, approval: 0.8 },
      },
      {
        label: 'Decline the conditions',
        tradeoff: 'Keeps public provision wholly public, and turns down real money.',
        pcCost: 1,
        effects: { approval: 0.4, politicalCapital: 2 },
      },
    ],
  },

  /* --------------------------- routine --------------------------- */
  {
    key: 'scrutiny-hearing',
    category: 'routine',
    title: 'Budget Scrutiny Hearing',
    narrative:
      'The scrutiny committee has called you to account for the current allocations. The questions are known in advance; the follow-ups are not.',
    minSeverity: 1,
    maxSeverity: 1,
    weight: () => 1.1,
    choices: () => [
      {
        label: 'Prepare thoroughly and attend',
        tradeoff: 'A solid performance is worth real credibility, and costs two days of preparation.',
        pcCost: 4,
        effects: { approval: 1.2, politicalCapital: 2 },
      },
      {
        label: 'Send the responsible minister',
        tradeoff: 'Protects your diary and signals that you did not consider it worth your time.',
        pcCost: 0,
        effects: { approval: -0.6 },
      },
    ],
  },
  {
    key: 'by-election',
    category: 'routine',
    title: 'By-Election Called',
    narrative:
      'A vacancy has arisen in a marginal district. The seat does not change the arithmetic. The result will be read as a verdict regardless.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: () => 0.9,
    choices: (v) => [
      {
        label: 'Campaign personally and heavily',
        tradeoff: 'Improves the odds markedly; a loss after visible effort is a much worse loss.',
        pcCost: 8,
        effects: { approval: s(1.4, v), politicalCapital: -2 },
      },
      {
        label: 'Run a standard local campaign',
        tradeoff: 'Preserves your capital and accepts whatever the district was going to do anyway.',
        pcCost: 2,
        effects: {},
      },
      {
        label: 'Stay away entirely',
        tradeoff: 'Insulates you from the result, and the local party will not forget it.',
        pcCost: 0,
        effects: { approval: -s(0.8, v), coalitionMood: -2 },
      },
    ],
  },
  {
    key: 'service-review',
    category: 'routine',
    title: 'Efficiency Review Reports',
    narrative:
      'The standing review has reported. It has found savings, as such reviews always do, and each one has a name and a department attached.',
    minSeverity: 1,
    maxSeverity: 2,
    weight: () => 0.8,
    choices: (v) => [
      {
        label: 'Implement the recommendations in full',
        tradeoff: 'Real, permanent savings extracted from services that were already stretched.',
        pcCost: 6,
        effects: {
          revenueDelta: s(1.5, v),
          sectorDeltas: { education: -s(1, v), health: -s(1, v) },
          approval: -s(1, v),
        },
      },
      {
        label: 'Adopt the uncontested findings only',
        tradeoff: 'Banks the easy savings and leaves the structural problem exactly where it was.',
        pcCost: 3,
        effects: { revenueDelta: s(0.6, v) },
      },
      {
        label: 'Shelve the report',
        tradeoff: 'Protects the services entirely and wastes the review that produced it.',
        pcCost: 2,
        effects: { approval: -s(0.4, v), politicalCapital: -2 },
      },
    ],
  },
  {
    key: 'state-visit',
    category: 'routine',
    title: 'State Visit Arrangements',
    narrative:
      'A head of state is visiting and the protocol office needs decisions. None of it is difficult and all of it is visible.',
    minSeverity: 1,
    maxSeverity: 1,
    weight: () => 0.7,
    choices: () => [
      {
        label: 'A full ceremonial programme',
        tradeoff: 'Looks like a country that takes itself seriously, and the bill is itemised publicly.',
        pcCost: 2,
        effects: { treasury: -5, approval: 1 },
      },
      {
        label: 'A working visit, minimal ceremony',
        tradeoff: 'Frugal and businesslike, and read by your guest as exactly that.',
        pcCost: 3,
        effects: { approval: 0.2 },
      },
    ],
  },
];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  economic_shock: 'Economic shock',
  natural_disaster: 'Natural disaster',
  scandal: 'Scandal',
  diplomatic: 'Diplomatic incident',
  social_unrest: 'Social unrest',
  opportunity: 'Opportunity',
  routine: 'Routine',
};

/*
 * The ten economic crises live in their own file because they are a
 * different kind of content: each delivers a real macroeconomic shock into
 * the model rather than a one-off nudge, and each fires in proportion to how
 * likely the government has made it. They join the same pool.
 */
export { ECONOMIC_EVENT_TEMPLATES } from './economicEvents.ts';
