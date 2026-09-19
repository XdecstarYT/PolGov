/**
 * economicEvents.ts — the ten ways an economy goes wrong.
 *
 * These are not flavour. Each one delivers a real macroeconomic shock into
 * the model built in Engine 2A — a decaying impulse to growth, prices and
 * confidence — and most of them damage specific industries or specific
 * infrastructure, which means specific regions, which means specific seats.
 *
 * The design rule that makes them worth having: **a crisis is more likely
 * when the government has made it more likely.** A banking crisis needs a
 * long boom and dear money. A housing crash needs a real estate sector that
 * has run hot and a central bank that has turned. A supply-chain crisis
 * needs ports and roads somebody stopped maintaining. None of them is a die
 * roll against the player; each is a die roll the player has been loading,
 * in one direction or the other, for years.
 *
 * The choices are genuine. Rescuing a bank is expensive, works, and is
 * deeply unpopular with people who will still be angry about it at the next
 * election. Letting it fail costs nothing and costs everything. The game
 * takes no view on which is correct, and both are available every time.
 */

import { months } from '../balance.ts';
import type { EventTemplate, EventWeightContext } from './events.ts';

/** Scale an effect by severity, 1 mild to 3 severe. */
const s = (base: number, severity: number) => Math.round(base * severity * 10) / 10;

/** Raises weight as a value climbs above a threshold. */
const above = (value: number | undefined, threshold: number, scale: number) =>
  value === undefined ? 0 : Math.max(0, (value - threshold) * scale);

/** Raises weight as a value falls below a threshold. */
const below = (value: number | undefined, threshold: number, scale: number) =>
  value === undefined ? 0 : Math.max(0, (threshold - value) * scale);

const industry = (ctx: EventWeightContext, key: string) => ctx.industryHealth?.[key] ?? 100;

export const ECONOMIC_EVENT_TEMPLATES: EventTemplate[] = [
  {
    key: 'banking-crisis',
    category: 'economic_shock',
    title: 'A Bank Cannot Meet Its Obligations',
    narrative:
      'The third-largest lender in the country has failed to settle overnight. The governor has been on the telephone since four in the morning and is now in your outer office. Whatever you decide, you will be asked about it for the rest of your career, and the version of events that survives will not be yours.',
    minSeverity: 2,
    maxSeverity: 3,
    /* Needs a long expansion and dear money: the two things that put
       leverage into the system and then made it expensive to carry. */
    weight: (c) =>
      0.12 +
      above(c.outputGap, 1, 0.22) +
      above(c.policyRate, 6, 0.12) +
      above(c.debtRatio ? c.debtRatio * 100 : undefined, 80, 0.006) +
      below(industry(c, 'finance'), 95, 0.02),
    choices: (v) => [
      {
        label: 'Guarantee the deposits and take the equity',
        tradeoff:
          'It works. It costs a fortune, and half the country will call it a bailout for the rest of your life.',
        pcCost: 12,
        effects: {
          treasury: -s(70, v),
          approval: -s(4.5, v),
          shockRelief: 0.3,
          economicShock: {
            id: 'banking-crisis',
            label: 'Banking crisis',
            kind: 'financial',
            growthImpulse: -2.2,
            inflationImpulse: -0.3,
            confidenceImpulse: -9,
            turns: months(8),
          },
        },
      },
      {
        label: 'Let it fail, and protect the depositors only',
        tradeoff: 'Cheaper, fairer, and the credit market will not reopen for months.',
        pcCost: 6,
        effects: {
          treasury: -s(22, v),
          industryDeltas: { finance: -s(11, v), construction: -s(6, v), real_estate: -s(8, v) },
          economicShock: {
            id: 'banking-crisis',
            label: 'Banking crisis',
            kind: 'financial',
            growthImpulse: -6.5,
            inflationImpulse: -0.9,
            confidenceImpulse: -26,
            turns: months(11),
          },
        },
      },
      {
        label: 'Force a private rescue',
        tradeoff:
          'Costs the treasury little. Whether it holds depends on people who do not work for you.',
        pcCost: 18,
        effects: {
          treasury: -s(6, v),
          approval: s(1, v),
          economicShock: {
            id: 'banking-crisis',
            label: 'Banking crisis',
            kind: 'financial',
            growthImpulse: -4,
            inflationImpulse: -0.5,
            confidenceImpulse: -16,
            turns: months(9),
          },
        },
      },
    ],
  },
  {
    key: 'market-crash',
    category: 'economic_shock',
    title: 'The Exchange Falls Thirty Per Cent',
    narrative:
      'Two days, and a third of the market capitalisation of the country is gone. Most of it was never real. The pension funds that held it were, and so are the people whose retirements they were holding.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) =>
      0.14 + above(c.outputGap, 1.5, 0.2) + above(c.policyRate, 7, 0.1) + above(industry(c, 'finance'), 112, 0.03),
    choices: (v) => [
      {
        label: 'Say nothing, and let it find a floor',
        tradeoff: 'The correct answer, and it looks exactly like doing nothing.',
        pcCost: 0,
        effects: {
          approval: -s(2, v),
          economicShock: {
            id: 'market-crash',
            label: 'Market crash',
            kind: 'financial',
            growthImpulse: -2.4,
            inflationImpulse: -0.2,
            confidenceImpulse: -18,
            turns: months(6),
          },
        },
      },
      {
        label: 'Underwrite the pension funds',
        tradeoff: 'Protects the people who did nothing wrong. Everyone else notices the bill.',
        pcCost: 8,
        effects: {
          treasury: -s(34, v),
          approval: s(1.5, v),
          shockRelief: 0.55,
          economicShock: {
            id: 'market-crash',
            label: 'Market crash',
            kind: 'financial',
            growthImpulse: -2.4,
            inflationImpulse: -0.2,
            confidenceImpulse: -18,
            turns: months(6),
          },
        },
      },
    ],
  },
  {
    key: 'housing-crash',
    category: 'economic_shock',
    title: 'House Prices Fall Off a Cliff',
    narrative:
      'Prices in the capital are down eighteen per cent in five months. Everyone who bought in the last three years is underwater, everyone who has been priced out for a decade is quietly delighted, and both of them vote.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) =>
      0.1 + above(c.policyRate, 6.5, 0.16) + above(industry(c, 'real_estate'), 108, 0.04),
    choices: (v) => [
      {
        label: 'Support the mortgage market',
        tradeoff:
          'Stops the forced sales. Also stops prices falling, which was the only thing helping anyone under forty.',
        pcCost: 10,
        effects: {
          treasury: -s(28, v),
          shockRelief: 0.5,
          industryDeltas: { real_estate: s(4, v), construction: s(3, v) },
          economicShock: {
            id: 'housing-crash',
            label: 'Housing crash',
            kind: 'financial',
            growthImpulse: -3.2,
            inflationImpulse: -0.5,
            confidenceImpulse: -15,
            turns: months(10),
          },
        },
      },
      {
        label: 'Let the market clear',
        tradeoff: 'Painful, honest, and a building industry with nothing to build.',
        pcCost: 4,
        effects: {
          industryDeltas: { construction: -s(9, v), real_estate: -s(13, v) },
          approval: -s(2.5, v),
          economicShock: {
            id: 'housing-crash',
            label: 'Housing crash',
            kind: 'financial',
            growthImpulse: -4.4,
            inflationImpulse: -0.8,
            confidenceImpulse: -21,
            turns: months(14),
          },
        },
      },
    ],
  },
  {
    key: 'commodity-boom',
    category: 'opportunity',
    title: 'The Price of Everything We Dig Up Doubles',
    narrative:
      'Sable Reach has not had a year like this in a generation. The royalties are extraordinary, the wage inflation is spreading, and every economist in the building is using the phrase "while it lasts" in a tone you are beginning to find irritating.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) => 0.4 + above(c.growth, 2, 0.05),
    choices: (v) => [
      {
        label: 'Bank it in the reserve fund',
        tradeoff:
          'The right answer, and it means explaining why a windfall has not been spent on anything.',
        pcCost: 6,
        effects: {
          treasury: s(26, v),
          approval: -s(1.2, v),
          industryDeltas: { mining: s(10, v), energy: s(6, v) },
        },
      },
      {
        label: 'Spend it on services now',
        tradeoff: 'Popular, immediate, and it builds a base you cannot fund when the price turns.',
        pcCost: 2,
        effects: {
          treasury: s(8, v),
          fundingDeltas: { health: s(3, v), education: s(2, v) },
          approval: s(3, v),
          industryDeltas: { mining: s(10, v) },
        },
      },
      {
        label: 'Cut taxes while it lasts',
        tradeoff: 'The hardest thing in politics to reverse once the price falls back.',
        pcCost: 8,
        effects: {
          revenueDelta: -s(3, v),
          approval: s(4, v),
          industryDeltas: { mining: s(12, v), energy: s(7, v) },
        },
      },
    ],
  },
  {
    key: 'commodity-collapse',
    category: 'economic_shock',
    title: 'The Price Falls Back, and Keeps Falling',
    narrative:
      'The boom is over. Sable Reach has been told before that this would happen and did not believe it, and is not in a mood to be reminded now. Four thousand jobs are on a list somebody has already leaked.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => 0.16 + above(industry(c, 'mining'), 110, 0.05),
    choices: (v) => [
      {
        label: 'Fund a transition programme for the region',
        tradeoff: 'Expensive, slow, and the only thing that has ever worked anywhere.',
        pcCost: 10,
        effects: {
          treasury: -s(24, v),
          approval: s(1.4, v),
          industryDeltas: { mining: -s(12, v), technology: s(2, v) },
          economicShock: {
            id: 'commodity-collapse',
            label: 'Commodity collapse',
            kind: 'external',
            growthImpulse: -2.1,
            inflationImpulse: -0.4,
            confidenceImpulse: -8,
            turns: months(9),
          },
        },
      },
      {
        label: 'Say the market will recover',
        tradeoff: 'It might. The people being laid off this month will not be there for it.',
        pcCost: 2,
        effects: {
          approval: -s(3.2, v),
          industryDeltas: { mining: -s(19, v), energy: -s(7, v) },
          economicShock: {
            id: 'commodity-collapse',
            label: 'Commodity collapse',
            kind: 'external',
            growthImpulse: -3.4,
            inflationImpulse: -0.6,
            confidenceImpulse: -13,
            turns: months(13),
          },
        },
      },
    ],
  },
  {
    key: 'drought',
    category: 'natural_disaster',
    title: 'The Third Failed Harvest',
    narrative:
      'Callow Downs has had no meaningful rain since the spring before last. The reservoirs are at nineteen per cent, the wheat is a write-off, and the farm lobby has arrived with a costed proposal and a photographer.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) => 0.3 + below(c.sectorHealth.environment, 55, 0.02),
    choices: (v) => [
      {
        label: 'Emergency relief for the farms',
        tradeoff: 'Keeps the farms. Does nothing whatever about the reservoirs.',
        pcCost: 4,
        effects: {
          treasury: -s(16, v),
          approval: s(1.2, v),
          industryDeltas: { agriculture: -s(8, v) },
          economicShock: {
            id: 'drought',
            label: 'Drought',
            kind: 'supply',
            growthImpulse: -0.9,
            inflationImpulse: 1.1,
            confidenceImpulse: -5,
            turns: months(8),
          },
        },
      },
      {
        label: 'Build the water infrastructure instead',
        tradeoff:
          'Solves it permanently, four years from now, for the government that is here then.',
        pcCost: 9,
        effects: {
          treasury: -s(26, v),
          sectorDeltas: { environment: s(4, v), infrastructure: s(3, v) },
          approval: -s(1.8, v),
          industryDeltas: { agriculture: -s(13, v) },
          economicShock: {
            id: 'drought',
            label: 'Drought',
            kind: 'supply',
            growthImpulse: -1.3,
            inflationImpulse: 1.4,
            confidenceImpulse: -7,
            turns: months(10),
          },
        },
      },
    ],
  },
  {
    key: 'natural-disaster',
    category: 'natural_disaster',
    title: 'The Coast Floods',
    narrative:
      'A storm surge overnight and eleven thousand homes are uninhabitable. The sea defences held for forty years and the engineers have been saying for six that they would not hold for forty-one.',
    minSeverity: 2,
    maxSeverity: 3,
    /* More likely, and worse, where the defences were let go. */
    weight: (c) =>
      0.22 + below(c.worstAssetCondition, 60, 0.012) + above(c.maintenanceBacklog, 40, 0.004),
    choices: (v) => [
      {
        label: 'Full reconstruction, whatever it costs',
        tradeoff: 'The only decent answer and an enormous unbudgeted bill.',
        pcCost: 6,
        effects: {
          treasury: -s(42, v),
          approval: s(2.6, v),
          assetDamage: { housing: -s(6, v), roads: -s(5, v), water: -s(7, v) },
          economicShock: {
            id: 'flood',
            label: 'Flooding',
            kind: 'supply',
            growthImpulse: -1.4,
            inflationImpulse: 0.4,
            confidenceImpulse: -9,
            turns: months(6),
          },
        },
      },
      {
        label: 'Insurance-led recovery',
        tradeoff:
          'Costs a fraction. Two thousand of those families were uninsured and everybody knows which two thousand.',
        pcCost: 3,
        effects: {
          treasury: -s(12, v),
          approval: -s(3.4, v),
          assetDamage: { housing: -s(11, v), roads: -s(8, v), water: -s(12, v) },
          economicShock: {
            id: 'flood',
            label: 'Flooding',
            kind: 'supply',
            growthImpulse: -2.2,
            inflationImpulse: 0.6,
            confidenceImpulse: -14,
            turns: months(9),
          },
        },
      },
    ],
  },
  {
    key: 'energy-crisis',
    category: 'economic_shock',
    title: 'The Lights Go Out in Halloway',
    narrative:
      'Two generating units failed inside a week and the grid could not carry the shortfall. Industry was shed first, which is the plan working. The plan working is not what the six o’clock news is calling it.',
    minSeverity: 2,
    maxSeverity: 3,
    weight: (c) => 0.18 + below(c.worstAssetCondition, 55, 0.015) + above(c.inflation, 5, 0.04),
    choices: (v) => [
      {
        label: 'Cap what households pay and carry the cost',
        tradeoff: 'Protects everyone from the price. Protects nobody from the shortage.',
        pcCost: 8,
        effects: {
          treasury: -s(31, v),
          approval: s(2.2, v),
          shockRelief: 0.55,
          economicShock: {
            id: 'energy-crisis',
            label: 'Energy crisis',
            kind: 'supply',
            growthImpulse: -2.6,
            inflationImpulse: 2.8,
            confidenceImpulse: -12,
            turns: months(9),
          },
        },
      },
      {
        label: 'Let prices ration it',
        tradeoff: 'Efficient, and the winter will be remembered by name.',
        pcCost: 3,
        effects: {
          approval: -s(4.6, v),
          industryDeltas: { manufacturing: -s(9, v), mining: -s(5, v) },
          economicShock: {
            id: 'energy-crisis',
            label: 'Energy crisis',
            kind: 'supply',
            growthImpulse: -3.4,
            inflationImpulse: 4.2,
            confidenceImpulse: -19,
            turns: months(11),
          },
        },
      },
      {
        label: 'Emergency build programme',
        tradeoff: 'Fixes the cause. Arrives long after the winter it was announced in.',
        pcCost: 12,
        effects: {
          treasury: -s(20, v),
          assetDamage: { grid: s(6, v), power_plants: s(5, v) },
          economicShock: {
            id: 'energy-crisis',
            label: 'Energy crisis',
            kind: 'supply',
            growthImpulse: -3,
            inflationImpulse: 3.4,
            confidenceImpulse: -15,
            turns: months(10),
          },
        },
      },
    ],
  },
  {
    key: 'supply-chain-crisis',
    category: 'economic_shock',
    title: 'Nothing Is Moving Through the Ports',
    narrative:
      'Ashmere is at a standstill. Some of it is a dispute, some of it is a berth that has needed dredging since the last government, and all of it is on the front page next to a photograph of empty shelves.',
    minSeverity: 1,
    maxSeverity: 3,
    weight: (c) =>
      0.2 + below(c.worstAssetCondition, 58, 0.013) + below(industry(c, 'logistics'), 96, 0.03),
    choices: (v) => [
      {
        label: 'Settle it, and pay to clear the backlog',
        tradeoff: 'Quick, expensive, and every other dispute has been watching.',
        pcCost: 7,
        effects: {
          treasury: -s(18, v),
          shockRelief: 0.5,
          economicShock: {
            id: 'supply-chain',
            label: 'Supply-chain crisis',
            kind: 'supply',
            growthImpulse: -1.9,
            inflationImpulse: 2.1,
            confidenceImpulse: -10,
            turns: months(7),
          },
        },
      },
      {
        label: 'Hold the line',
        tradeoff: 'Costs nothing now. Costs the shelves, and then the prices.',
        pcCost: 4,
        effects: {
          approval: -s(2.8, v),
          industryDeltas: { logistics: -s(12, v), retail: -s(7, v), manufacturing: -s(6, v) },
          economicShock: {
            id: 'supply-chain',
            label: 'Supply-chain crisis',
            kind: 'supply',
            growthImpulse: -3.1,
            inflationImpulse: 3.4,
            confidenceImpulse: -17,
            turns: months(12),
          },
        },
      },
    ],
  },
  {
    key: 'recovery',
    category: 'opportunity',
    title: 'The Figures Turn',
    narrative:
      'Three consecutive months of growth, the unemployment series has rolled over, and the Treasury is prepared to use the word "recovery" in writing. It will be claimed by whoever is standing nearest a microphone.',
    minSeverity: 1,
    maxSeverity: 2,
    /* Only offered to a country actually coming out of something. */
    weight: (c) => (c.inRecession || (c.outputGap ?? 0) < -1.5 ? 0.9 + below(c.growth, 0, 0.1) : 0),
    choices: (v) => [
      {
        label: 'Claim it, loudly',
        tradeoff: 'Free approval, and you now own every figure that follows.',
        pcCost: 2,
        effects: {
          approval: s(3.4, v),
          economicShock: {
            id: 'recovery',
            label: 'Recovery',
            kind: 'confidence',
            growthImpulse: 1.6,
            inflationImpulse: 0.2,
            confidenceImpulse: 11,
            turns: months(6),
          },
        },
      },
      {
        label: 'Use it to repair the finances',
        tradeoff: 'The responsible moment to do it, and nobody will ever know you did.',
        pcCost: 4,
        effects: {
          treasury: s(14, v),
          approval: -s(0.8, v),
          economicShock: {
            id: 'recovery',
            label: 'Recovery',
            kind: 'confidence',
            growthImpulse: 1.1,
            inflationImpulse: 0.1,
            confidenceImpulse: 7,
            turns: months(6),
          },
        },
      },
    ],
  },
];
