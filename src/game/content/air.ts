/**
 * air.ts — aircraft, pilots, and the option that looks free.
 *
 * AIR POWER IS A CONSUMABLE THAT LOOKS LIKE AN ASSET. An air force reads
 * as a fleet of aircraft, which is a stock; it behaves as a rate of
 * sorties, which is a flow that burns airframes and people. A force at
 * full strength in week one is at two-thirds by month six regardless of
 * what it has achieved, and the missing third is mostly not shot down —
 * it is worn out, cannibalised for spares, and waiting on a part.
 *
 * PILOTS ARE THE CONSTRAINT, AND WORSE THAN SOLDIERS. Two years to
 * train, and an experienced one cannot be replaced at all inside a war.
 * A country can lose its air force twice over and rebuild it, and it
 * cannot get the aircrew of 1941 back in 1943.
 *
 * AND STRATEGIC BOMBING DOES NOT DO WHAT IT PROMISES. It is the most
 * politically attractive option on the desk — none of our people are on
 * the ground, the destruction is measurable, and the footage is
 * excellent. It reliably fails to produce the political result it is
 * bought for, and it hardens the population it is aimed at rather than
 * separating them from their government. Every government that has tried
 * it has been told this beforehand by somebody, and has done it anyway,
 * because the alternative was explaining why nothing was happening.
 *
 * That last one is why this file exists. An engine that makes bombing
 * work is not modelling the twentieth century; it is modelling the
 * brochure.
 */

export type AircraftKind =
  | 'fighter'
  | 'multirole'
  | 'strike'
  | 'bomber'
  | 'attack_helicopter'
  | 'transport'
  | 'tanker'
  | 'surveillance'
  | 'drone'
  | 'trainer';

export interface AircraftTemplate {
  key: AircraftKind;
  label: string;
  blurb: string;
  /** Years from the order to the squadron. */
  buildYears: number;
  /** ₡bn per squadron, at the engine's reference scale. */
  cost: number;
  upkeep: number;
  /** Sorties a week per squadron at full effort. */
  sortieRate: number;
  /** Share of sorties that end the aircraft, at ordinary opposition. */
  attrition: number;
  /** What it contributes to owning the sky. */
  superiority: number;
  /** And to killing things the army is fighting. */
  interdiction: number;
  /** And to hitting a country rather than an army. */
  strategic: number;
  /** Whether it needs aircrew at all. */
  crewed: boolean;
}

export const AIRCRAFT_TEMPLATES: AircraftTemplate[] = [
  {
    key: 'fighter',
    label: 'Air superiority fighter',
    blurb: 'Exists to make the sky unusable to somebody else. Does nothing else, expensively.',
    buildYears: 4,
    cost: 18,
    upkeep: 2.1,
    sortieRate: 22,
    attrition: 0.004,
    superiority: 16,
    interdiction: 2,
    strategic: 0,
    crewed: true,
  },
  {
    key: 'multirole',
    label: 'Multirole squadron',
    blurb:
      'Does everything adequately, which is what every air force buys and what every air force then complains about.',
    buildYears: 3.5,
    cost: 14,
    upkeep: 1.7,
    sortieRate: 24,
    attrition: 0.005,
    superiority: 9,
    interdiction: 9,
    strategic: 4,
    crewed: true,
  },
  {
    key: 'strike',
    label: 'Ground attack squadron',
    blurb: 'Flies low, kills what the army is fighting, and is shot at by everybody on the ground.',
    buildYears: 3,
    cost: 11,
    upkeep: 1.4,
    sortieRate: 26,
    attrition: 0.011,
    superiority: 2,
    interdiction: 16,
    strategic: 3,
    crewed: true,
  },
  {
    key: 'bomber',
    label: 'Bomber squadron',
    blurb:
      'Reaches a country rather than an army. The most politically attractive thing in the inventory and the least decisive.',
    buildYears: 6,
    cost: 31,
    upkeep: 3.4,
    sortieRate: 9,
    attrition: 0.014,
    superiority: 0,
    interdiction: 6,
    strategic: 22,
    crewed: true,
  },
  {
    key: 'attack_helicopter',
    label: 'Attack helicopters',
    blurb: 'The army’s own air force, in everything but which budget it is argued over in.',
    buildYears: 2.5,
    cost: 7,
    upkeep: 1.1,
    sortieRate: 30,
    attrition: 0.016,
    superiority: 0,
    interdiction: 13,
    strategic: 0,
    crewed: true,
  },
  {
    key: 'transport',
    label: 'Transport squadron',
    blurb:
      'Unglamorous and the reason anything anywhere is supplied. Cut first, missed immediately, replaced last.',
    buildYears: 3,
    cost: 9,
    upkeep: 1.2,
    sortieRate: 20,
    attrition: 0.003,
    superiority: 0,
    interdiction: 0,
    strategic: 0,
    crewed: true,
  },
  {
    key: 'tanker',
    label: 'Tanker squadron',
    blurb:
      'Nobody has ever campaigned on buying one, and nothing flies further than its own fuel without them.',
    buildYears: 3.5,
    cost: 12,
    upkeep: 1.3,
    sortieRate: 14,
    attrition: 0.002,
    superiority: 0,
    interdiction: 0,
    strategic: 0,
    crewed: true,
  },
  {
    key: 'surveillance',
    label: 'Surveillance aircraft',
    blurb:
      'The only thing in the inventory that reduces the distance between the map and the ground.',
    buildYears: 4,
    cost: 16,
    upkeep: 1.9,
    sortieRate: 12,
    attrition: 0.002,
    superiority: 3,
    interdiction: 2,
    strategic: 0,
    crewed: true,
  },
  {
    key: 'drone',
    label: 'Uncrewed squadron',
    blurb:
      'Loses airframes and not aircrew, which changes the arithmetic on the desk and not the one on the ground.',
    buildYears: 1.5,
    cost: 4,
    upkeep: 0.6,
    sortieRate: 34,
    attrition: 0.022,
    superiority: 1,
    interdiction: 8,
    strategic: 5,
    crewed: false,
  },
  {
    key: 'trainer',
    label: 'Training establishment',
    blurb:
      'Where pilots come from, at two years each, and the first line cut in every economy drive since aircraft existed.',
    buildYears: 2,
    cost: 5,
    upkeep: 0.9,
    sortieRate: 0,
    attrition: 0.0005,
    superiority: 0,
    interdiction: 0,
    strategic: 0,
    crewed: true,
  },
];

export function findAircraft(key: AircraftKind): AircraftTemplate {
  const found = AIRCRAFT_TEMPLATES.find((a) => a.key === key);
  if (!found) throw new Error(`air: unknown aircraft ${key}`);
  return found;
}

/**
 * What an air force is being asked to do this week.
 *
 * Effort is finite and every campaign is a subtraction from the others.
 * A government that orders all four is ordering none of them, which is
 * the most common way air power is wasted and the least visible.
 */
export type AirCampaign =
  | 'superiority'
  | 'interdiction'
  | 'close_support'
  | 'strategic'
  | 'transport';

export const AIR_CAMPAIGNS: {
  key: AirCampaign;
  label: string;
  blurb: string;
  /** What it actually achieves, against what it is bought for. */
  honest: string;
}[] = [
  {
    key: 'superiority',
    label: 'Take the sky',
    blurb: 'Make the air unusable to them, so that everything else becomes possible.',
    honest:
      'A precondition rather than a victory. It lets the country do things; it does not do them, and nothing it achieves appears in any figure the public sees.',
  },
  {
    key: 'interdiction',
    label: 'Cut what reaches the front',
    blurb: 'Hit the roads, the bridges and the trains between their factories and their army.',
    honest:
      'The most useful thing an air force does and the hardest to point at. It is measured in what did not arrive, which is not a photograph.',
  },
  {
    key: 'close_support',
    label: 'Support the army',
    blurb: 'Kill what the soldiers are fighting, where they are fighting it.',
    honest:
      'Works, immediately and visibly, and costs airframes fastest of everything here because it is flown within range of everybody on the ground.',
  },
  {
    key: 'strategic',
    label: 'Bomb the country',
    blurb: 'Reach past the army to the factories, the ports and the cities behind them.',
    honest:
      'Politically the easiest thing on this desk: none of our people are on the ground, the destruction is measurable and the footage is excellent. It has never yet produced the political result it is bought for, and it hardens the people it is aimed at rather than separating them from their government.',
  },
  {
    key: 'transport',
    label: 'Supply by air',
    blurb: 'Reach a place the roads no longer reach.',
    honest:
      'The only way to supply an encircled position, at several times the cost of a road and a fraction of the tonnage.',
  },
];

export function findCampaign(key: AirCampaign) {
  const found = AIR_CAMPAIGNS.find((c) => c.key === key);
  if (!found) throw new Error(`air: unknown campaign ${key}`);
  return found;
}

/**
 * Years to make aircrew, and the part that cannot be shortened.
 *
 * Worse than the army's fourteen weeks in every way: longer, narrower,
 * and the experienced ones cannot be replaced at all. A country can lose
 * its air force twice and rebuild it. It cannot get the aircrew back.
 */
export const PILOT_YEARS = 2;

/** Sorties before aircrew are counted as experienced. */
export const PILOT_SORTIES_TO_VETERAN = 40;
