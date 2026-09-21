/**
 * orbat.ts — the shape of an army, and the people who run it.
 *
 * The hierarchy exists in full and is readable, because a player should
 * be able to see what their country actually has. It is NOT a thing the
 * player pushes around: this is a game about being a head of government,
 * and a head of government who is personally directing battalions has
 * already lost the plot and probably the war.
 *
 * So the player operates at the top three levels — what army groups
 * exist, what they are for, and who commands them — and everything below
 * brigade is a count rather than an entity. A battalion is a number of
 * companies; a company is a number of platoons. They are reported, they
 * matter to the arithmetic, and nobody is asked to name them.
 *
 * The commanders are the interesting part. A commander has competence,
 * experience and LOYALTY, and those three do not correlate. The most
 * capable officer in a country is not necessarily the one its government
 * can rely on, and a government that only appoints people it trusts ends
 * up with an army run by people who are trusted. Both of those are ways
 * to lose, and choosing between them is the decision this file exists
 * for.
 */

export type EchelonKey =
  | 'army_group'
  | 'field_army'
  | 'corps'
  | 'division'
  | 'brigade'
  | 'regiment'
  | 'battalion';

export const ECHELON_ORDER: EchelonKey[] = [
  'army_group',
  'field_army',
  'corps',
  'division',
  'brigade',
  'regiment',
  'battalion',
];

export interface EchelonTemplate {
  key: EchelonKey;
  label: string;
  /** Roughly how many of the next level down one of these contains. */
  subordinates: number;
  /** People in one, at full strength. */
  personnel: number;
  /** Whether the player appoints its commander by name. */
  named: boolean;
  /**
   * Weeks an order takes to reach the level below.
   *
   * Small numbers that add up: an order from the top to a battalion
   * passes through six of these, which is why armies are slow and why
   * shortening the chain is worth as much as any equipment.
   */
  orderLag: number;
}

export const ECHELON_TEMPLATES: EchelonTemplate[] = [
  { key: 'army_group', label: 'Army group', subordinates: 3, personnel: 400000, named: true, orderLag: 0.6 },
  { key: 'field_army', label: 'Field army', subordinates: 3, personnel: 130000, named: true, orderLag: 0.5 },
  { key: 'corps', label: 'Corps', subordinates: 3, personnel: 45000, named: true, orderLag: 0.4 },
  { key: 'division', label: 'Division', subordinates: 3, personnel: 15000, named: false, orderLag: 0.3 },
  { key: 'brigade', label: 'Brigade', subordinates: 3, personnel: 4500, named: false, orderLag: 0.25 },
  { key: 'regiment', label: 'Regiment', subordinates: 3, personnel: 1500, named: false, orderLag: 0.2 },
  { key: 'battalion', label: 'Battalion', subordinates: 4, personnel: 500, named: false, orderLag: 0.15 },
];

export function findEchelon(key: EchelonKey): EchelonTemplate {
  const found = ECHELON_TEMPLATES.find((e) => e.key === key);
  if (!found) throw new Error(`orbat: unknown echelon ${key}`);
  return found;
}

/** What a formation is made of. Decides what it is good for. */
export type FormationKind =
  | 'infantry'
  | 'mechanised'
  | 'armoured'
  | 'artillery'
  | 'air_defence'
  | 'reconnaissance'
  | 'engineer'
  | 'logistics'
  | 'special_forces'
  | 'marine'
  | 'airborne'
  | 'territorial';

export const FORMATION_KINDS: FormationKind[] = [
  'infantry',
  'mechanised',
  'armoured',
  'artillery',
  'air_defence',
  'reconnaissance',
  'engineer',
  'logistics',
  'special_forces',
  'marine',
  'airborne',
  'territorial',
];

export interface FormationTemplate {
  kind: FormationKind;
  label: string;
  blurb: string;
  /** What it contributes in an attack, and in a defence. Rarely the same. */
  attack: number;
  defence: number;
  /** How fast it can move and exploit a gap. */
  mobility: number;
  /** What it costs to keep in the field, relative to infantry. */
  upkeep: number;
  /** And what it takes to feed and fuel, which is not the same thing. */
  supplyDraw: number;
  /** How long it takes to train and equip one. */
  formationWeeks: number;
}

export const FORMATION_TEMPLATES: FormationTemplate[] = [
  {
    kind: 'infantry',
    label: 'Infantry',
    blurb: 'Holds ground. Everything else in this list exists to help it or to replace it.',
    attack: 1,
    defence: 1.2,
    mobility: 0.5,
    upkeep: 1,
    supplyDraw: 1,
    formationWeeks: 16,
  },
  {
    kind: 'mechanised',
    label: 'Mechanised infantry',
    blurb: 'Infantry that arrives, which is most of the difference.',
    attack: 1.5,
    defence: 1.3,
    mobility: 1.4,
    upkeep: 2.1,
    supplyDraw: 2.4,
    formationWeeks: 26,
  },
  {
    kind: 'armoured',
    label: 'Armour',
    blurb: 'Breaks a line and exploits the hole. Useless in a city and ruinous to run.',
    attack: 2.6,
    defence: 1.5,
    mobility: 1.8,
    upkeep: 3.4,
    supplyDraw: 4.2,
    formationWeeks: 38,
  },
  {
    kind: 'artillery',
    label: 'Artillery',
    blurb: 'Kills more people than anything else on the list and is the first thing to run out of ammunition.',
    attack: 2.2,
    defence: 1.6,
    mobility: 0.6,
    upkeep: 1.8,
    supplyDraw: 3.8,
    formationWeeks: 24,
  },
  {
    kind: 'air_defence',
    label: 'Air defence',
    blurb: 'Decides whether anybody else on this list can move by daylight.',
    attack: 0.3,
    defence: 1.9,
    mobility: 0.7,
    upkeep: 2.2,
    supplyDraw: 1.9,
    formationWeeks: 30,
  },
  {
    kind: 'reconnaissance',
    label: 'Reconnaissance',
    blurb: 'Not strength. Knowledge, which is worth more and is spent faster.',
    attack: 0.6,
    defence: 0.5,
    mobility: 2.2,
    upkeep: 1.2,
    supplyDraw: 1.3,
    formationWeeks: 20,
  },
  {
    kind: 'engineer',
    label: 'Engineers',
    blurb: 'Bridges, mines, fortifications and roads. Nothing advances further than they allow.',
    attack: 0.5,
    defence: 1.1,
    mobility: 0.8,
    upkeep: 1.4,
    supplyDraw: 1.6,
    formationWeeks: 22,
  },
  {
    kind: 'logistics',
    label: 'Logistics troops',
    blurb: 'The reason an army a hundred miles forward is still an army.',
    attack: 0.1,
    defence: 0.3,
    mobility: 1.1,
    upkeep: 1.1,
    supplyDraw: 0.6,
    formationWeeks: 14,
  },
  {
    kind: 'special_forces',
    label: 'Special forces',
    blurb: 'Very good, very few, and asked to do everything by governments who have run out of options.',
    attack: 2.8,
    defence: 0.7,
    mobility: 2.4,
    upkeep: 4.1,
    supplyDraw: 1.2,
    formationWeeks: 96,
  },
  {
    kind: 'marine',
    label: 'Marines',
    blurb: 'The only people who can arrive somewhere that has no port and no airfield.',
    attack: 1.9,
    defence: 1.1,
    mobility: 1.3,
    upkeep: 2.6,
    supplyDraw: 2.2,
    formationWeeks: 44,
  },
  {
    kind: 'airborne',
    label: 'Airborne',
    blurb: 'Arrives anywhere and can be supplied nowhere. A weapon with a clock on it.',
    attack: 2.1,
    defence: 0.8,
    mobility: 2.6,
    upkeep: 2.9,
    supplyDraw: 1.5,
    formationWeeks: 52,
  },
  {
    kind: 'territorial',
    label: 'Territorial defence',
    blurb: 'People defending the place they live, which is the cheapest and most stubborn infantry there is.',
    attack: 0.4,
    defence: 1.4,
    mobility: 0.3,
    upkeep: 0.35,
    supplyDraw: 0.5,
    formationWeeks: 6,
  },
];

export function findFormation(kind: FormationKind): FormationTemplate {
  const found = FORMATION_TEMPLATES.find((f) => f.kind === kind);
  if (!found) throw new Error(`orbat: unknown formation ${kind}`);
  return found;
}

/**
 * What a commander is like.
 *
 * Traits are not good or bad. Each is an advantage somewhere and a
 * liability somewhere else, and a government that has to pick one is
 * picking which kind of war it thinks it is about to fight.
 */
export type CommanderTrait =
  | 'cautious'
  | 'aggressive'
  | 'logistician'
  | 'improviser'
  | 'political'
  | 'beloved'
  | 'butcher'
  | 'methodical';

export const COMMANDER_TRAITS: {
  key: CommanderTrait;
  label: string;
  blurb: string;
  attack: number;
  defence: number;
  supply: number;
  casualties: number;
  loyalty: number;
  morale: number;
}[] = [
  {
    key: 'cautious',
    label: 'Cautious',
    blurb: 'Will not lose an army. Will also not win a war quickly, and knows it.',
    attack: -0.2,
    defence: 0.25,
    supply: 0.05,
    casualties: -0.25,
    loyalty: 0,
    morale: 0.05,
  },
  {
    key: 'aggressive',
    label: 'Aggressive',
    blurb: 'Takes ground. The question is always what it cost and whether it can be held.',
    attack: 0.3,
    defence: -0.15,
    supply: -0.1,
    casualties: 0.3,
    loyalty: 0,
    morale: 0.05,
  },
  {
    key: 'logistician',
    label: 'A logistician',
    blurb: 'Unglamorous, unpromoted, and the reason the offensive did not stop at the river.',
    attack: 0.05,
    defence: 0.1,
    supply: 0.35,
    casualties: -0.1,
    loyalty: 0.05,
    morale: 0,
  },
  {
    key: 'improviser',
    label: 'An improviser',
    blurb: 'Best when the plan has already failed, which is most of the time.',
    attack: 0.15,
    defence: 0.15,
    supply: -0.05,
    casualties: 0,
    loyalty: -0.05,
    morale: 0.1,
  },
  {
    key: 'political',
    label: 'Political',
    blurb: 'Understands exactly who they answer to and exactly what the papers will say.',
    attack: -0.05,
    defence: 0,
    supply: 0,
    casualties: -0.05,
    loyalty: -0.2,
    morale: -0.05,
  },
  {
    key: 'beloved',
    label: 'Beloved by the ranks',
    blurb: 'The troops will go further for this one than the arithmetic says they should.',
    attack: 0.1,
    defence: 0.1,
    supply: 0,
    casualties: -0.05,
    loyalty: -0.1,
    morale: 0.3,
  },
  {
    key: 'butcher',
    label: 'Prepared to spend lives',
    blurb: 'Achieves the objective. The casualty return arrives in the same despatch.',
    attack: 0.35,
    defence: 0.05,
    supply: 0,
    casualties: 0.5,
    loyalty: 0.05,
    morale: -0.2,
  },
  {
    key: 'methodical',
    label: 'Methodical',
    blurb: 'Slow, thorough, and has not lost a position in eleven years.',
    attack: -0.1,
    defence: 0.3,
    supply: 0.15,
    casualties: -0.2,
    loyalty: 0.1,
    morale: 0,
  },
];

export function findTrait(key: CommanderTrait) {
  const found = COMMANDER_TRAITS.find((t) => t.key === key);
  if (!found) throw new Error(`orbat: unknown trait ${key}`);
  return found;
}
