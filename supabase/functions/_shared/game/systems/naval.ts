/**
 * naval.ts — a fleet, and the two things that make it different.
 *
 * BUILT IN DECADES, LOST IN AN AFTERNOON. Nothing else in this engine
 * has that shape. A division ground down in March is back by September,
 * badly; a carrier lost in March is a hole in the fleet list for eight
 * years, and the government that ordered the replacement will not be in
 * office when it commissions. So `build` and `loss` are asymmetric on
 * purpose, and the asymmetry is the whole of naval politics: it is why
 * admirals are cautious, why the fleet that never sails is doing its
 * job, and why the decision to risk it is always taken by somebody who
 * will not pay for it.
 *
 * AND THE SEA CANNOT BE HELD. Presence is not control, it IS control,
 * and it lasts exactly as long as the ships are there. Everything a navy
 * achieves has to be achieved again next week. A government that
 * economises on the fleet does not get a smaller navy; it gets the same
 * navy, absent from somewhere, and which somewhere is a decision nobody
 * announces.
 *
 * The number a government is briefed is HULLS. Hulls do not distinguish
 * between a ship that can sail and one alongside waiting for a part that
 * is not made any more, and that gap is where this file does most of its
 * work.
 */

import {
  DEPLOYMENT_LIMIT,
  HARBOUR_DECAY,
  PRESENCE_SCALE,
  REFIT_RATE,
  ROTATION_RATIO,
  ROTATE_HOME_AT,
  ROTATE_OUT_AT,
  SEAWORTHY,
  SEA_WEAR,
  SHIP_LOSS_RISK,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  SEA_ZONES,
  findSeaZone,
  findShip,
  type SeaZone,
  type ShipClass,
} from '../content/naval.ts';
import type { Rng } from '../rng.ts';
import type { Navy, Ship, ShipOrder } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

const SHIP_NAMES = [
  'Endeavour', 'Vigilant', 'Resolute', 'Intrepid', 'Dauntless', 'Formidable',
  'Tireless', 'Audacious', 'Relentless', 'Steadfast', 'Undaunted', 'Valiant',
  'Perseverance', 'Fortitude', 'Enterprise', 'Adamant', 'Indomitable', 'Sovereign',
];

/** The fleet a government inherits, which nobody in this run ordered. */
export function buildNavy(moneyScale: number, coastal = true): Navy {
  const wanted: [ShipClass, number][] = coastal
    ? [
        ['carrier', 1],
        ['cruiser', 2],
        ['destroyer', 5],
        ['frigate', 8],
        ['corvette', 6],
        ['submarine', 3],
        ['amphibious', 2],
        ['patrol', 10],
        ['auxiliary', 4],
        ['minesweeper', 4],
      ]
    : [
        ['corvette', 4],
        ['patrol', 8],
        ['minesweeper', 2],
      ];

  const ships: Ship[] = [];
  let n = 0;
  for (const [shipClass, count] of wanted) {
    /* Scaled by the size of the country, and never below one of
       anything it has any of. */
    const built = Math.max(1, Math.round(count * clamp(moneyScale, 0.25, 3)));
    for (let i = 0; i < built; i += 1) {
      ships.push({
        id: `sh-${shipClass}-${n}`,
        name: `${SHIP_NAMES[n % SHIP_NAMES.length]!}${n >= SHIP_NAMES.length ? ` ${Math.floor(n / SHIP_NAMES.length) + 1}` : ''}`,
        shipClass,
        /*
         * Staggered, because a fleet is not all new at once and because
         * a fleet that were would be useless: everything would refit in
         * the same year and the country would be at sea in pulses. The
         * spread IS the continuous presence, and it is the thing a
         * government inherits rather than arranges.
         */
        condition: 58 + ((n * 37) % 42),
        station: null,
        weeksDeployed: 0,
        crew: 62,
        commissionedTurn: 0,
        lost: false,
        lostTurn: null,
      });
      n += 1;
    }
  }

  return {
    ships,
    building: [],
    /* Present at home, because everybody is, and nowhere else, because
       nobody has decided to be. */
    stations: { home: 1 },
    hullsLost: 0,
    prestigeLost: 0,
    history: [],
  };
}

/**
 * Every ship is a different ship.
 *
 * Without this the whole fleet runs in phase: everything sails together,
 * wears at the same rate, comes home in the same month and refits in the
 * same year, and the country is at sea in pulses with nothing at all in
 * between. Real fleets are decorrelated by the fact that no two refits
 * are the same length, and a navy that lost that property would stop
 * being able to be anywhere continuously.
 */
function shipJitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 1009;
  return h / 1009;
}

/** The condition this particular ship is sent back out at. */
export function readyThreshold(ship: Ship): number {
  return ROTATE_OUT_AT + (shipJitter(ship.id) - 0.5) * 22;
}

/** And the one it is brought home at. */
export function homeThreshold(ship: Ship): number {
  return ROTATE_HOME_AT + (shipJitter(`${ship.id}h`) - 0.5) * 12;
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/** Ships still afloat. */
export function afloat(navy: Navy): Ship[] {
  return navy.ships.filter((s) => !s.lost);
}

/**
 * Ships that could actually sail.
 *
 * The difference between this and the hull count is the single most
 * useful thing a government can be told about its navy, and it is the
 * one figure that never appears in a written answer.
 */
export function seaworthy(navy: Navy): Ship[] {
  return afloat(navy).filter((s) => s.condition >= SEAWORTHY);
}

/**
 * What the fleet can actually sustain being present with.
 *
 * Total presence divided by the rotation, because only about a third of
 * a fleet is ever on station: the rest is working up or in refit. This
 * is the number a government needs when it promises to be somewhere, and
 * it is never the number it is given.
 */
export function sustainablePresence(navy: Navy): number {
  return totalPresence(navy) / ROTATION_RATIO;
}

/** What the fleet can be present with, if it all sailed. */
export function totalPresence(navy: Navy): number {
  return seaworthy(navy).reduce(
    (sum, s) => sum + findShip(s.shipClass).presence * (s.condition / 100) * PRESENCE_SCALE,
    0,
  );
}

/** And what it is being asked to be present with, right now. */
export function presenceAt(navy: Navy, zone: SeaZone): number {
  return seaworthy(navy)
    .filter((s) => s.station === zone)
    .reduce((sum, s) => sum + findShip(s.shipClass).presence * (s.condition / 100), 0);
}

/**
 * How well a zone is actually held, 0–1.
 *
 * Presence over demand, and nothing else. There is no occupying the sea:
 * the moment the ships leave, this number is zero again, and everything
 * it was buying stops.
 */
export function zoneControl(navy: Navy, zone: SeaZone): number {
  return clamp(presenceAt(navy, zone) / findSeaZone(zone).demand, 0, 1.4);
}

/** What the fleet is keeping open, as a share of the trade it needs to. */
export function laneSecurity(navy: Navy): number {
  const weighted = SEA_ZONES.reduce(
    (sum, z) => sum + zoneControl(navy, z.key) * z.tradeWeight,
    0,
  );
  const total = SEA_ZONES.reduce((sum, z) => sum + z.tradeWeight, 0);
  return clamp(weighted / Math.max(0.01, total), 0, 1.2);
}

/** What the fleet costs a year, whether or not it leaves harbour. */
export function fleetUpkeep(navy: Navy, moneyScale: number): number {
  return afloat(navy).reduce((sum, s) => sum + findShip(s.shipClass).upkeep, 0) * moneyScale;
}

/** What is under construction, and when a successor gets it. */
export function orderBook(navy: Navy): ShipOrder[] {
  return navy.building;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface NavyInputs {
  /** What the defence line is funding maintenance at, relative to need. */
  funding: number;
  /** Whether any of this is being shot at. */
  atWar: boolean;
  /** How hard, 0–100. */
  intensity: number;
  /** What the other side can do at sea, relative to us. */
  opposition: number;
  turn: number;
  rng: Rng;
  moneyScale: number;
}

export interface NavyTick {
  navy: Navy;
  /** Ships lost this week. There is no replacing them. */
  lost: Ship[];
  /** Ships commissioned. Ordered by somebody who is not here. */
  commissioned: Ship[];
  /** Ships that have to come home whatever the government wants. */
  recalled: Ship[];
  /** True the week the fleet list stops meaning what it says. */
  hollow: boolean;
  /** Approval cost of what was lost. */
  prestigeCost: number;
}

export function stepNavy(navy: Navy, inputs: NavyInputs): NavyTick {
  const lost: Ship[] = [];
  const commissioned: Ship[] = [];
  const recalled: Ship[] = [];
  let prestigeCost = 0;

  const hollowBefore = seaworthy(navy).length / Math.max(1, afloat(navy).length);

  /* ---- 1. Ships at sea, and ships alongside. ---- */
  const ships = navy.ships.map((ship) => {
    if (ship.lost) return ship;
    const template = findShip(ship.shipClass);
    const atSea = ship.station !== null;

    /*
     * Presence costs the ship. Everything a navy achieves has to be
     * achieved again next week, and the achieving is what wears it out.
     */
    const wear = atSea ? SEA_WEAR * (inputs.atWar ? 1.5 : 1) : 0;
    /*
     * Alongside, a ship is not resting. It is deteriorating, and only
     * money arrests that. A government that economises on maintenance
     * does not get a smaller navy — it gets the same fleet list and
     * fewer ships that can sail, and the fleet list is the figure it is
     * briefed.
     */
    const repair = atSea ? 0 : REFIT_RATE * clamp(inputs.funding, 0.1, 1.6) - HARBOUR_DECAY;
    const condition = clamp100(ship.condition - wear + repair);

    const weeksDeployed = atSea ? ship.weeksDeployed + 1 : 0;

    /*
     * And nothing lasts indefinitely. Crews, stores and machinery, in
     * that order of urgency. A government that keeps a deployment
     * running past the limit is not getting more presence out of the
     * fleet; it is getting less of it later, as a refit backlog under
     * somebody else.
     */
    if (atSea && (weeksDeployed > DEPLOYMENT_LIMIT || condition < homeThreshold(ship))) {
      recalled.push(ship);
      return { ...ship, condition, station: null, weeksDeployed: 0 };
    }

    /*
     * Losses. Small, and never zero. The point is not that ships sink
     * often — it is that when one does there is no replacing it inside
     * this war, and everybody involved knew that when the order to sail
     * was given.
     */
    if (
      inputs.atWar &&
      atSea &&
      (ship.station === 'contested' || ship.station === 'trade_route')
    ) {
      const risk =
        SHIP_LOSS_RISK *
        (inputs.intensity / 100) *
        clamp(inputs.opposition, 0.2, 3) *
        /* A ship in poor condition is a ship that does not get away. */
        (1 + (100 - condition) / 120) *
        (ship.station === 'contested' ? 1.6 : 0.7);
      if (inputs.rng.chance(risk)) {
        lost.push(ship);
        prestigeCost += template.prestige;
        return { ...ship, lost: true, lostTurn: inputs.turn, station: null, condition: 0 };
      }
    }

    const crew = clamp100(
      ship.crew + (atSea ? 0.14 : -0.04) * (inputs.atWar ? 2 : 1),
    );
    return { ...ship, condition, crew, weeksDeployed };
  });

  /* ---- 2. The rotation. ---- */
  /*
   * THE RULE OF THREE. A standing commitment is not a voyage — it is a
   * promise to be somewhere continuously, and the fleet keeps it by
   * rotating: one ship on station, one working up, one in refit. Which
   * means a government that wants continuous presence in one place needs
   * about three times the hulls it thinks it does.
   *
   * Every navy knows this. No government has ever put it in a manifesto,
   * because the sentence is "we must triple the fleet to be present in
   * one more place", and nobody has ever won an argument with it.
   */
  for (const [zone, wanted] of Object.entries(navy.stations)) {
    if (!wanted || wanted <= 0) continue;
    const onStation = ships.filter((s) => !s.lost && s.station === zone).length;
    if (onStation >= wanted) continue;

    const ready = ships
      .filter(
        (s) =>
          !s.lost &&
          s.station === null &&
          s.condition >= readyThreshold(s) &&
          s.condition >= SEAWORTHY,
      )
      .sort((a, b) => findShip(b.shipClass).presence - findShip(a.shipClass).presence);

    for (const ship of ready.slice(0, wanted - onStation)) {
      const index = ships.findIndex((s) => s.id === ship.id);
      ships[index] = { ...ship, station: zone as SeaZone, weeksDeployed: 0 };
    }
  }

  /* ---- 3. What a successor gets. ---- */
  const stillBuilding: ShipOrder[] = [];
  for (const order of navy.building) {
    if (inputs.turn < order.dueTurn) {
      stillBuilding.push(order);
      continue;
    }
    const ship: Ship = {
      id: order.id,
      name: `${SHIP_NAMES[ships.length % SHIP_NAMES.length]!} (${order.dueTurn})`,
      shipClass: order.shipClass,
      /* New, and therefore the best thing in the fleet by a distance. */
      condition: 100,
      station: null,
      weeksDeployed: 0,
      crew: 48,
      commissionedTurn: inputs.turn,
      lost: false,
      lostTurn: null,
    };
    ships.push(ship);
    commissioned.push(ship);
  }

  const next: Navy = {
    ...navy,
    ships,
    building: stillBuilding,
    hullsLost: navy.hullsLost + lost.length,
    prestigeLost: navy.prestigeLost + prestigeCost,
    history: [
      ...navy.history,
      {
        turn: inputs.turn,
        hulls: ships.filter((s) => !s.lost).length,
        presence: totalPresence({ ...navy, ships }),
        lanes: laneSecurity({ ...navy, ships }),
      },
    ].slice(-208),
  };

  const hollowAfter = seaworthy(next).length / Math.max(1, afloat(next).length);
  return {
    navy: next,
    lost,
    commissioned,
    recalled,
    /* The week the fleet list stops meaning what it says. */
    hollow: hollowAfter < 0.7 && hollowBefore >= 0.7,
    prestigeCost,
  };
}

/* ------------------------------------------------------------------ *
 * What a government can do about it
 * ------------------------------------------------------------------ */

/**
 * Send the fleet somewhere.
 *
 * Every zone a government says it cares about is a subtraction from all
 * the others. The whole of naval strategy is which waters to be absent
 * from, and no government has ever announced one.
 */
export function station(navy: Navy, zone: SeaZone, hulls: number): Navy {
  const available = seaworthy(navy)
    .filter((s) => s.station === null || s.station === zone)
    .sort((a, b) => findShip(b.shipClass).presence - findShip(a.shipClass).presence);
  const sending = new Set(available.slice(0, Math.max(0, hulls)).map((s) => s.id));
  return {
    ...navy,
    ships: navy.ships.map((s) =>
      sending.has(s.id)
        ? { ...s, station: zone }
        : s.station === zone
          ? { ...s, station: null, weeksDeployed: 0 }
          : s,
    ),
    stations: { ...navy.stations, [zone]: hulls },
  };
}

/** Bring everything home. Costs nothing today and everything it was buying. */
export function recallFleet(navy: Navy): Navy {
  return {
    ...navy,
    ships: navy.ships.map((s) => ({ ...s, station: null, weeksDeployed: 0 })),
    stations: {},
  };
}

/**
 * Order a ship.
 *
 * The money is spent now and the ship arrives under a government two
 * elections away. Which is why the fleet a country has is always the one
 * some previous administration argued about, and why cancelling one is
 * the easiest saving in any budget and the one that shows up latest.
 */
export function orderShip(
  navy: Navy,
  shipClass: ShipClass,
  turn: number,
  moneyScale: number,
): { navy: Navy; cost: number; dueTurn: number } {
  const template = findShip(shipClass);
  const dueTurn = turn + Math.round(template.buildYears * TURNS_PER_YEAR);
  const cost = template.cost * moneyScale;
  return {
    navy: {
      ...navy,
      building: [
        ...navy.building,
        {
          id: `ord-${shipClass}-${turn}-${navy.building.length}`,
          shipClass,
          orderedTurn: turn,
          dueTurn,
          spent: 0,
        },
      ],
    },
    cost,
    dueTurn,
  };
}

/** Cancel one. The money already spent does not come back. */
export function cancelOrder(navy: Navy, id: string): Navy {
  return { ...navy, building: navy.building.filter((o) => o.id !== id) };
}

/** One line on the fleet, and on the gap between it and the fleet list. */
export function describeNavy(navy: Navy, turn: number): string {
  const hulls = afloat(navy).length;
  const able = seaworthy(navy).length;
  const lanes = laneSecurity(navy);
  const soon = navy.building.filter((o) => o.dueTurn - turn > TURNS_PER_YEAR * 4);

  if (hulls > 0 && able / hulls < 0.7) {
    return `${hulls} ships on the list and ${able} that could sail. The gap is not damage — it is a refit backlog and a part that is not made any more, and it is the one figure that never appears in a written answer.`;
  }
  if (navy.hullsLost > 0) {
    return `${navy.hullsLost} ${navy.hullsLost === 1 ? 'ship' : 'ships'} lost and none of them replaced. There is no rebuilding a hull inside a war; the order would commission under a government two elections from here.`;
  }
  if (lanes < 0.5) {
    return `The fleet is holding ${(lanes * 100).toFixed(0)}% of what the trade routes need. Nothing about that is visible until something stops arriving, and then it is the only thing anybody can see.`;
  }
  if (soon.length > 0) {
    return `${able} ships at sea or able to be, and ${soon.length} on order that will commission under somebody else. That is not a criticism of the order; it is what ordering a ship is.`;
  }
  return `${able} of ${hulls} able to sail, present in ${
    new Set(afloat(navy).map((s) => s.station).filter(Boolean)).size
  } waters, keeping ${(lanes * 100).toFixed(0)}% of the trade routes open.`;
}
