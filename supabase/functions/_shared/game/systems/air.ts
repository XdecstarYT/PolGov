/**
 * air.ts — an air force, and the option that looks free.
 *
 * AIR POWER IS A CONSUMABLE THAT LOOKS LIKE AN ASSET. A government is
 * briefed squadrons, which is a stock. What it has is a sortie rate,
 * which is a flow that burns airframes and people. A force at full
 * strength in week one is at two-thirds by month six regardless of what
 * it achieved, and most of the missing third was not shot down — it is
 * worn out, cannibalised, and waiting on a part.
 *
 * PILOTS ARE WORSE THAN SOLDIERS. Two years to make, and an experienced
 * one cannot be replaced at all inside a war. A country can lose its air
 * force twice over and rebuild it; it cannot get the aircrew back.
 *
 * AND STRATEGIC BOMBING DOES NOT DO WHAT IT PROMISES. It is the most
 * politically attractive option on this desk — none of our people are on
 * the ground, the destruction is measurable, the footage is excellent —
 * and it reliably fails to produce the political result it is bought
 * for. It HARDENS the population it is aimed at rather than separating
 * them from their government, and the harder it is pressed the more it
 * hardens them. That is modelled here as a cost rather than a diminishing
 * return, because a diminishing return would still be a return.
 *
 * An engine in which bombing works is not modelling the twentieth
 * century. It is modelling the brochure.
 */

import {
  AIRCREW_REPLACEMENT,
  BOMBING_DAMAGE,
  BOMBING_HARDENS,
  SERVICEABILITY_AT_PEACE,
  SERVICEABILITY_AT_WAR,
  AIRCREW_TRAINING_STANDARD,
  HARDENING_DECAY,
  SERVICEABILITY_RATE,
  SORTIE_SCALE,
  SUPERIORITY_PACE,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  PILOT_SORTIES_TO_VETERAN,
  PILOT_YEARS,
  findAircraft,
  type AirCampaign,
  type AircraftKind,
} from '../content/air.ts';
import type { AirForce, Squadron } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

const SQUADRON_NAMES = [
  'No. 1', 'No. 4', 'No. 9', 'No. 12', 'No. 17', 'No. 23',
  'No. 31', 'No. 40', 'No. 55', 'No. 66', 'No. 74', 'No. 88',
];

export function buildAirForce(moneyScale: number): AirForce {
  const wanted: [AircraftKind, number][] = [
    ['multirole', 4],
    ['fighter', 2],
    ['strike', 2],
    ['attack_helicopter', 2],
    ['transport', 2],
    ['tanker', 1],
    ['surveillance', 1],
    ['drone', 1],
    ['trainer', 1],
  ];

  const squadrons: Squadron[] = [];
  let n = 0;
  for (const [kind, count] of wanted) {
    const built = Math.max(1, Math.round(count * clamp(moneyScale, 0.3, 3)));
    for (let i = 0; i < built; i += 1) {
      squadrons.push({
        id: `sq-${kind}-${n}`,
        name: `${SQUADRON_NAMES[n % SQUADRON_NAMES.length]!} Squadron`,
        kind,
        strength: 100,
        /* Where a peacetime air force actually sits, which is not where
           the fleet list says it does. */
        serviceable: SERVICEABILITY_AT_PEACE,
        aircrew: 64,
        sortiesFlown: 0,
        commissionedTurn: 0,
      });
      n += 1;
    }
  }

  return {
    squadrons,
    building: [],
    superiority: 0,
    /* Nothing is being asked of it, which is the peacetime condition and
       is also how most air forces enter a war. */
    effort: {},
    trainees: 0,
    airframesLost: 0,
    aircrewLost: 0,
    bombingResolve: 0,
    bombingDamage: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/**
 * What the air force can actually put in the air this week.
 *
 * Squadrons times strength times serviceability, and the third of those
 * is the one nobody is briefed. The difference between this and the
 * squadron count is where an air force quietly goes.
 */
export function availableSorties(air: AirForce): number {
  return air.squadrons.reduce((sum, sq) => {
    const template = findAircraft(sq.kind);
    return (
      sum +
      template.sortieRate *
        (sq.strength / 100) *
        (sq.serviceable / 100) *
        (0.6 + (sq.aircrew / 100) * 0.6) *
        SORTIE_SCALE
    );
  }, 0);
}

/** How much of the air force is actually on the line. */
export function readyShare(air: AirForce): number {
  if (air.squadrons.length === 0) return 0;
  return (
    air.squadrons.reduce((sum, sq) => sum + (sq.strength / 100) * (sq.serviceable / 100), 0) /
    air.squadrons.length
  );
}

/** The effort shares, normalised, because governments order all of them. */
export function effortShares(air: AirForce): Partial<Record<AirCampaign, number>> {
  const total = Object.values(air.effort).reduce((s, v) => s + (v ?? 0), 0);
  if (total <= 0) return {};
  const out: Partial<Record<AirCampaign, number>> = {};
  for (const [key, value] of Object.entries(air.effort)) {
    out[key as AirCampaign] = (value ?? 0) / total;
  }
  return out;
}

/** What the air force contributes to a given campaign this week. */
export function campaignWeight(air: AirForce, campaign: AirCampaign): number {
  const share = effortShares(air)[campaign] ?? 0;
  if (share <= 0) return 0;
  const field =
    campaign === 'superiority'
      ? 'superiority'
      : campaign === 'strategic'
        ? 'strategic'
        : 'interdiction';
  const capability = air.squadrons.reduce((sum, sq) => {
    const template = findAircraft(sq.kind);
    return sum + template[field] * (sq.strength / 100) * (sq.serviceable / 100);
  }, 0);
  return capability * share;
}

/** Aircrew quality across the force, which is what cannot be rebuilt. */
export function aircrewQuality(air: AirForce): number {
  const crewed = air.squadrons.filter((sq) => findAircraft(sq.kind).crewed);
  if (crewed.length === 0) return 0;
  return crewed.reduce((s, sq) => s + sq.aircrew, 0) / crewed.length;
}

/** What it costs a year to have one. */
export function airUpkeep(air: AirForce, moneyScale: number): number {
  return air.squadrons.reduce((s, sq) => s + findAircraft(sq.kind).upkeep, 0) * moneyScale;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface AirInputs {
  funding: number;
  atWar: boolean;
  intensity: number;
  /** What is shooting back, relative to us. */
  opposition: number;
  /** How much the training establishment is producing. */
  trainingFunding: number;
  turn: number;
}

export interface AirTick {
  air: AirForce;
  /** What the air force did for the land battle this week. */
  interdiction: number;
  closeSupport: number;
  /** What the bombing destroyed, and what it did to their willingness. */
  bombingDamage: number;
  bombingHardening: number;
  /** Aircrew lost. Two years each, and the experienced ones are gone. */
  aircrewLost: number;
  airframesLost: number;
  /** True the week the squadron count stops meaning what it says. */
  hollow: boolean;
  /** True the week the aircrew are the constraint rather than the aircraft. */
  aircrewBound: boolean;
}

export function stepAir(air: AirForce, inputs: AirInputs): AirTick {
  const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;
  const shares = effortShares(air);
  /*
   * An air force with orders and no war is an air force on exercises.
   * Without this, a government that set an effort once carried on
   * bombing a country it was at peace with for the rest of the run,
   * which nothing in the log would have mentioned.
   */
  const flying = inputs.atWar && Object.values(shares).reduce((s, v) => s + (v ?? 0), 0) > 0;

  const readyBefore = readyShare(air);
  let airframesLost = 0;
  let aircrewLost = 0;

  /* ---- 1. The squadrons. ---- */
  const squadrons: Squadron[] = air.squadrons.map((sq) => {
    const template = findAircraft(sq.kind);
    const sorties = flying
      ? template.sortieRate * (sq.strength / 100) * (sq.serviceable / 100)
      : template.sortieRate * 0.15 * (sq.strength / 100);

    /*
     * Serviceability is where an air force goes, and it is not losses.
     * Wear, cannibalisation and a part that is three months out take a
     * third of any air force off the line within six months of a war
     * starting, and no figure briefed to a government has ever included
     * it.
     */
    const target =
      (inputs.atWar && flying ? SERVICEABILITY_AT_WAR : SERVICEABILITY_AT_PEACE) *
      clamp(inputs.funding, 0.5, 1.2);
    const serviceable = clamp100(toward(sq.serviceable, target, SERVICEABILITY_RATE));

    /* And losses, which are smaller than the wear and hurt far more,
       because what they take is people. */
    const risk = inputs.atWar
      ? template.attrition * clamp(inputs.opposition, 0.2, 3) * (inputs.intensity / 100)
      : template.attrition * 0.05;
    const lostFrames = sorties * risk;
    airframesLost += lostFrames;
    if (template.crewed) aircrewLost += lostFrames * 0.6;

    const strength = clamp100(
      sq.strength - lostFrames * 2.4 + clamp(inputs.funding, 0.3, 1.5) * 0.35,
    );

    /*
     * Aircrew. Flying makes them better and losing them makes them
     * worse, and the second happens faster. An air force three months
     * into a war has more sorties behind it and worse people flying
     * them, which is the shape nobody expects.
     */
    /*
     * Flying operations makes aircrew better. Flying exercises does not,
     * any more than a peacetime army becomes experienced — which is why
     * an air force at rest sits exactly at whatever its training
     * establishment produces and does not creep upward for twenty years.
     */
    const learning = flying ? Math.min(0.28, sorties / PILOT_SORTIES_TO_VETERAN) : 0;
    const dilution = template.crewed ? lostFrames * 9 : 0;
    const aircrew = clamp100(sq.aircrew + learning - dilution);

    return {
      ...sq,
      serviceable,
      strength,
      aircrew,
      sortiesFlown: sq.sortiesFlown + sorties,
    };
  });

  /* ---- 2. Who owns the sky. ---- */
  const contest = campaignWeight({ ...air, squadrons }, 'superiority');
  const against = inputs.atWar ? clamp(inputs.opposition, 0.1, 3) * 24 : 0;
  const superiorityTarget = inputs.atWar
    ? clamp(((contest - against) / Math.max(1, contest + against)) * 100, -100, 100)
    : 0;
  const superiority = clamp(
    air.superiority + clamp(superiorityTarget - air.superiority, -SUPERIORITY_PACE, SUPERIORITY_PACE),
    -100,
    100,
  );

  /*
   * Air superiority is a precondition, not a victory. It multiplies
   * everything else the air force does and achieves nothing on its own,
   * and nothing it achieves appears in any figure the public sees.
   */
  const permission = clamp(0.45 + (superiority / 100) * 0.75, 0.15, 1.5);

  /* ---- 3. What the effort bought. ---- */
  /*
   * And nothing is bought by a campaign that is not being flown. The
   * effort shares say what the air force is FOR; whether it is doing it
   * is a separate question, and gating only the sortie count left a
   * government bombing a country it was at peace with for the rest of
   * the run.
   */
  const working = { ...air, squadrons };
  const interdiction = flying ? campaignWeight(working, 'interdiction') * permission : 0;
  const closeSupport = flying ? campaignWeight(working, 'close_support') * permission : 0;
  const bombing = flying ? campaignWeight(working, 'strategic') * permission : 0;

  /*
   * And the bombing. The damage is real. The political result is not —
   * it hardens them, and the harder it is pressed the more it hardens
   * them. This is a cost rather than a diminishing return, because a
   * diminishing return would still be a return.
   */
  const bombingDamage = bombing * BOMBING_DAMAGE;
  const bombingHardening = bombing * BOMBING_HARDENS;

  /* ---- 4. Aircrew, which is the real constraint. ---- */
  const crewedSquadrons = squadrons.filter((sq) => findAircraft(sq.kind).crewed).length;
  const trainers = squadrons.filter((sq) => sq.kind === 'trainer').length;
  /* Two years each, and the training establishment is the first line
     cut in every economy drive since aircraft existed. */
  const graduating =
    (air.trainees / (PILOT_YEARS * TURNS_PER_YEAR)) * clamp(inputs.trainingFunding, 0.2, 2);
  const intake = trainers * 0.9 * clamp(inputs.trainingFunding, 0.2, 2);
  const trainees = Math.max(0, air.trainees + intake - graduating);

  const needed = crewedSquadrons * AIRCREW_REPLACEMENT * 100;
  const aircrewBound = inputs.atWar && graduating < needed * 0.8;

  /*
   * New crews are not as good as the ones they replace. An air force
   * does not slowly become elite in peacetime, and one three months into
   * a war has more sorties behind it and worse people flying them —
   * which is the shape nobody expects and the reason the aircrew figure
   * moves the opposite way to the sortie figure.
   */
  const replenished = squadrons.map((sq) => {
    if (!findAircraft(sq.kind).crewed || crewedSquadrons === 0) return sq;
    const intakeShare = clamp((graduating / crewedSquadrons) * 0.11, 0, 0.08);
    return {
      ...sq,
      aircrew: clamp100(sq.aircrew + (AIRCREW_TRAINING_STANDARD - sq.aircrew) * intakeShare),
    };
  });

  const next: AirForce = {
    ...air,
    squadrons: replenished,
    superiority,
    trainees,
    airframesLost: air.airframesLost + airframesLost,
    aircrewLost: air.aircrewLost + aircrewLost,
    /*
     * Bounded, and it fades slowly rather than not at all. A population
     * that has been bombed does not go back to what it was when the
     * bombing stops, which is the other half of why the option is worse
     * than it looks: the cost outlives the campaign, and the campaign
     * was the part anybody budgeted for.
     */
    bombingResolve: clamp(
      air.bombingResolve * (1 - HARDENING_DECAY) + bombingHardening,
      0,
      100,
    ),
    bombingDamage: air.bombingDamage + bombingDamage,
    history: [
      ...air.history,
      {
        turn: inputs.turn,
        squadrons: replenished.length,
        serviceable: readyShare({ ...air, squadrons: replenished }) * 100,
        aircrew: aircrewQuality({ ...air, squadrons: replenished }),
        superiority,
      },
    ].slice(-208),
  };

  return {
    air: next,
    interdiction,
    closeSupport,
    bombingDamage,
    bombingHardening,
    aircrewLost,
    airframesLost,
    hollow: readyShare(next) < 0.6 && readyBefore >= 0.6,
    aircrewBound,
  };
}

/* ------------------------------------------------------------------ *
 * What a government can do about it
 * ------------------------------------------------------------------ */

/**
 * Decide what the air force is for this week.
 *
 * Effort is finite and every campaign is a subtraction from the others.
 * A government that orders all of them is ordering none of them, which
 * is the most common way air power is wasted and the least visible way,
 * because every campaign will report activity.
 */
export function setEffort(
  air: AirForce,
  effort: Partial<Record<AirCampaign, number>>,
): AirForce {
  return { ...air, effort };
}

/** Order aircraft. Quicker than a ship and still not quick. */
export function orderSquadron(
  air: AirForce,
  kind: AircraftKind,
  turn: number,
  moneyScale: number,
): { air: AirForce; cost: number; dueTurn: number } {
  const template = findAircraft(kind);
  const dueTurn = turn + Math.round(template.buildYears * TURNS_PER_YEAR);
  return {
    air: {
      ...air,
      building: [
        ...air.building,
        { id: `air-${kind}-${turn}-${air.building.length}`, kind, orderedTurn: turn, dueTurn, spent: 0 },
      ],
    },
    cost: template.cost * moneyScale,
    dueTurn,
  };
}

/** One line on the air force, and on what it is actually able to do. */
export function describeAir(air: AirForce): string {
  const ready = readyShare(air);
  const crew = aircrewQuality(air);

  if (air.bombingDamage > 40 && air.bombingResolve > 12) {
    return `The bombing has destroyed a great deal and hardened them by ${air.bombingResolve.toFixed(0)} points. It was always going to: nothing separates a population from its government less reliably than being bombed by somebody else's, and every government that has tried it was told so first.`;
  }
  if (ready < 0.6) {
    return `${air.squadrons.length} squadrons on the list and ${(ready * 100).toFixed(0)}% of them on the line. The missing part is mostly not losses — it is wear, cannibalisation and a component three months out, and it is in no figure anybody has been briefed.`;
  }
  if (crew < 45) {
    return `Aircrew quality is at ${crew.toFixed(0)}. The aircraft can be replaced in three years and the people flying them cannot be replaced at all inside this war, which is the constraint that decides air campaigns and the one nobody plans around.`;
  }
  if (air.superiority > 45) {
    return `The sky belongs to this country at ${air.superiority.toFixed(0)}. That is a precondition rather than an achievement — it makes things possible and does none of them, and nothing it has bought will appear in any figure the public sees.`;
  }
  return `${air.squadrons.length} squadrons, ${(ready * 100).toFixed(0)}% on the line, ${availableSorties(air).toFixed(0)} sorties a week available, aircrew at ${crew.toFixed(0)}.`;
}
