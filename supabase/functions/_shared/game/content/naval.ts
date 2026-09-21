/**
 * naval.ts — ships, and the two facts that make them different.
 *
 * BUILT IN DECADES, LOST IN AN AFTERNOON. A carrier is eight years of
 * building and twenty minutes of sinking, and there is no replacing it
 * inside the war it is lost in. Every other part of this engine lets a
 * government rebuild what it spends: a division ground down in March is
 * back by September, badly. A ship is not. That asymmetry is the whole
 * of naval politics — it is why admirals are cautious, why the fleet
 * that never sails is doing its job, and why the decision to risk it is
 * taken by people who will not be in office when the replacement is
 * laid down.
 *
 * AND THE SEA CANNOT BE HELD. There is no occupying it. A fleet does not
 * control an area; it is PRESENT in one, and the control lasts exactly
 * as long as the presence does. Everything a navy achieves has to be
 * achieved again next week, which is why sea power costs what it costs
 * and why it disappears the moment a government economises on it.
 *
 * What follows politically is that a navy is the most expensive thing a
 * country owns, does nothing visible for decades, and is the only reason
 * a good deal of what the country eats arrives.
 */

export type ShipClass =
  | 'carrier'
  | 'cruiser'
  | 'destroyer'
  | 'frigate'
  | 'corvette'
  | 'submarine'
  | 'missile_submarine'
  | 'amphibious'
  | 'patrol'
  | 'auxiliary'
  | 'minesweeper';

export interface ShipTemplate {
  key: ShipClass;
  label: string;
  blurb: string;
  /**
   * Years from the order to the commissioning.
   *
   * The number that makes naval policy a different kind of decision. A
   * government ordering a carrier is buying something for a successor
   * two elections away, and a government that cancels one is saving
   * money now against a gap that opens after it has left.
   */
  buildYears: number;
  /** ₡bn, at the engine's reference scale. */
  cost: number;
  /** ₡bn a year to keep it at sea, which is most of what a navy costs. */
  upkeep: number;
  /** Crew, in hundreds. People, not tonnage. */
  crew: number;
  /** What it is worth in a fight at sea. */
  combat: number;
  /** How much sea it can be present in. Presence IS control. */
  presence: number;
  /** What it contributes to keeping the trade routes open. */
  escort: number;
  /** And to closing somebody else's. */
  blockade: number;
  /** What it can do to a coast. */
  strike: number;
  /**
   * How badly losing one goes politically, beyond the ships and people.
   *
   * A frigate is a tragedy. A carrier is a national event that ends
   * careers, because everybody understood what it cost and nobody was
   * told what it was for.
   */
  prestige: number;
}

export const SHIP_TEMPLATES: ShipTemplate[] = [
  {
    key: 'carrier',
    label: 'Aircraft carrier',
    blurb:
      'Eight years to build, four thousand people aboard, and the only thing in the inventory whose loss is a national event.',
    buildYears: 8,
    cost: 92,
    upkeep: 7.4,
    crew: 42,
    combat: 30,
    presence: 26,
    escort: 4,
    blockade: 8,
    strike: 34,
    prestige: 30,
  },
  {
    key: 'cruiser',
    label: 'Cruiser',
    blurb: 'Command, air defence, and enough missiles to make a coastline reconsider.',
    buildYears: 6,
    cost: 34,
    upkeep: 2.6,
    crew: 4,
    combat: 16,
    presence: 12,
    escort: 10,
    blockade: 9,
    strike: 14,
    prestige: 11,
  },
  {
    key: 'destroyer',
    label: 'Destroyer',
    blurb: 'The ship that actually does the work, and the one nobody names a class after.',
    buildYears: 5,
    cost: 21,
    upkeep: 1.7,
    crew: 3,
    combat: 12,
    presence: 10,
    escort: 12,
    blockade: 10,
    strike: 9,
    prestige: 7,
  },
  {
    key: 'frigate',
    label: 'Frigate',
    blurb: 'Escort, patrol, and showing the flag somewhere the government has promised to care about.',
    buildYears: 4,
    cost: 12,
    upkeep: 1,
    crew: 2,
    combat: 7,
    presence: 9,
    escort: 14,
    blockade: 8,
    strike: 3,
    prestige: 4,
  },
  {
    key: 'corvette',
    label: 'Corvette',
    blurb: 'Small, cheap, coastal, and the only thing most navies can afford enough of.',
    buildYears: 2.5,
    cost: 5,
    upkeep: 0.45,
    crew: 1,
    combat: 4,
    presence: 5,
    escort: 6,
    blockade: 5,
    strike: 2,
    prestige: 2,
  },
  {
    key: 'submarine',
    label: 'Attack submarine',
    blurb:
      'Cannot hold anything and can deny everything. The cheapest way to make a stronger navy stay in port.',
    buildYears: 7,
    cost: 42,
    upkeep: 3.1,
    crew: 1,
    combat: 22,
    /* A submarine is present in the sense that matters — nobody knows
       where it is, so everybody behaves as though it is everywhere. */
    presence: 4,
    escort: 2,
    blockade: 24,
    strike: 11,
    prestige: 9,
  },
  {
    key: 'missile_submarine',
    label: 'Ballistic missile submarine',
    blurb:
      'The part of the deterrent that cannot be found, and therefore the only part that counts.',
    buildYears: 10,
    cost: 118,
    upkeep: 6.2,
    crew: 1.5,
    combat: 6,
    presence: 2,
    escort: 0,
    blockade: 2,
    strike: 4,
    prestige: 26,
  },
  {
    key: 'amphibious',
    label: 'Amphibious ship',
    blurb: 'Puts an army on a beach, which is the hardest thing anybody asks a navy to do.',
    buildYears: 5.5,
    cost: 28,
    upkeep: 2.2,
    crew: 6,
    combat: 5,
    presence: 8,
    escort: 2,
    blockade: 3,
    strike: 18,
    prestige: 9,
  },
  {
    key: 'patrol',
    label: 'Patrol vessel',
    blurb: 'Fisheries, smuggling, and being the state where the state is otherwise a rumour.',
    buildYears: 1.5,
    cost: 1.2,
    upkeep: 0.12,
    crew: 0.3,
    combat: 1,
    presence: 3,
    escort: 2,
    blockade: 2,
    strike: 0,
    prestige: 1,
  },
  {
    key: 'auxiliary',
    label: 'Fleet auxiliary',
    blurb:
      'Fuel, stores and spares. Unglamorous, unbuilt, and the reason the fleet can be more than four days from home.',
    buildYears: 3,
    cost: 9,
    upkeep: 0.8,
    crew: 1,
    combat: 0,
    /* It has no presence of its own. It multiplies everybody else's,
       which is why it is always the first thing cut and always the
       reason the deployment ends early. */
    presence: 0,
    escort: 1,
    blockade: 1,
    strike: 0,
    prestige: 2,
  },
  {
    key: 'minesweeper',
    label: 'Mine countermeasures vessel',
    blurb: 'Nobody has ever won an election because of one, and no port reopens without them.',
    buildYears: 2,
    cost: 3,
    upkeep: 0.3,
    crew: 0.4,
    combat: 1,
    presence: 2,
    escort: 4,
    blockade: 3,
    strike: 0,
    prestige: 1,
  },
];

export function findShip(key: ShipClass): ShipTemplate {
  const found = SHIP_TEMPLATES.find((s) => s.key === key);
  if (!found) throw new Error(`naval: unknown class ${key}`);
  return found;
}

/**
 * The waters a country can be asked to be in.
 *
 * Presence is the currency and it is finite, so every zone a government
 * says it cares about is a subtraction from all the others. The whole of
 * naval strategy is which of these to be absent from, and no government
 * has ever announced one.
 */
export type SeaZone = 'home' | 'approaches' | 'trade_route' | 'distant' | 'contested';

export const SEA_ZONE_LABELS: Record<SeaZone, string> = {
  home: 'Home waters',
  approaches: 'The approaches',
  trade_route: 'The trade routes',
  distant: 'Distant station',
  contested: 'Contested waters',
};

export const SEA_ZONES: {
  key: SeaZone;
  blurb: string;
  /** How much presence it takes to hold at all. */
  demand: number;
  /** What losing it does to the economy, per week. */
  tradeWeight: number;
}[] = [
  {
    key: 'home',
    blurb: 'The waters the country cannot be absent from, and the ones nobody counts as a deployment.',
    demand: 14,
    tradeWeight: 0.2,
  },
  {
    key: 'approaches',
    blurb: 'Where anything arriving has to pass, and where a submarine would choose to wait.',
    demand: 22,
    tradeWeight: 0.55,
  },
  {
    key: 'trade_route',
    blurb:
      'A line on a chart that most of what the country eats travels along. Invisible until it closes.',
    demand: 34,
    tradeWeight: 1,
  },
  {
    key: 'distant',
    blurb: 'Somewhere a previous government promised to care about, in writing.',
    demand: 26,
    tradeWeight: 0.15,
  },
  {
    key: 'contested',
    blurb: 'Water somebody else also considers theirs, being sailed through on purpose.',
    demand: 40,
    tradeWeight: 0.35,
  },
];

export function findSeaZone(key: SeaZone) {
  const found = SEA_ZONES.find((z) => z.key === key);
  if (!found) throw new Error(`naval: unknown sea zone ${key}`);
  return found;
}
