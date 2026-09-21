/**
 * theatre.ts — ground, and what it does to the people fighting over it.
 *
 * The thing this file exists to say is that TERRAIN IS NOT A MODIFIER.
 * It is the argument. An armoured division in mountains is not a
 * slightly worse armoured division; it is a traffic jam that can be
 * shelled. A river line held by two battalions is worth a corps in the
 * open. Ground decides which formations are worth anything, which is why
 * the composition a country bought in peacetime — against a war it
 * imagined — is usually wrong for the war it gets.
 *
 * The second thing is that GROUND COSTS MORE TO CROSS THAN TO HOLD, and
 * the ratio is not close. Every offensive in history has been priced by
 * somebody who knew this and did it anyway, because the alternative was
 * explaining why nothing was happening.
 *
 * And the third is CONCEALMENT. Some ground can be seen and some cannot,
 * and a government's picture of the war is only ever as good as the
 * ground it is being fought over allows. Forest and city are where
 * armies disappear, which is also where the despatches become confident
 * and wrong at the same time.
 */

export type TerrainKey =
  | 'plains'
  | 'farmland'
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'urban'
  | 'marsh'
  | 'desert'
  | 'river_line'
  | 'coastal'
  | 'tundra'
  | 'jungle';

export interface TerrainTemplate {
  key: TerrainKey;
  label: string;
  blurb: string;
  /**
   * What an attacker has to bring, relative to the defender, to make
   * progress here.
   *
   * The famous three-to-one is the number for open ground and nothing
   * else. Mountains and cities are where it becomes a figure nobody
   * wants to put in a paper.
   */
  attackRatio: number;
  /** How fast ground changes hands once it starts to, per week. */
  paceWeeks: number;
  /** What it costs to keep a formation supplied here, relative to plains. */
  supplyCost: number;
  /** Losses per week of fighting here, relative to plains. */
  attrition: number;
  /**
   * How much of what happens here can be seen, 0–1.
   *
   * The fog is a property of the ground before it is a property of
   * anybody's intelligence service. An army in forest is not hidden
   * because it is clever.
   */
  visibility: number;
  /** How far field works can be improved here. Rock does not dig. */
  fortifiable: number;
  /** What each kind of formation is worth here, as a multiplier. */
  favours: Partial<Record<import('./orbat.ts').FormationKind, number>>;
}

export const TERRAIN_TEMPLATES: TerrainTemplate[] = [
  {
    key: 'plains',
    label: 'Open ground',
    blurb: 'Nowhere to hide and nothing to hold. Whoever has more of everything wins here, quickly.',
    attackRatio: 2.4,
    paceWeeks: 1.4,
    supplyCost: 1,
    attrition: 1,
    visibility: 0.92,
    fortifiable: 0.8,
    favours: { armoured: 1.45, mechanised: 1.3, reconnaissance: 1.25, infantry: 0.85, territorial: 0.8 },
  },
  {
    key: 'farmland',
    label: 'Farmland',
    blurb:
      'Hedges, ditches, villages every few miles, and somebody’s year of work under the tracks.',
    attackRatio: 2.8,
    paceWeeks: 1.8,
    supplyCost: 1.05,
    attrition: 1.05,
    visibility: 0.78,
    fortifiable: 0.9,
    favours: { infantry: 1.1, mechanised: 1.1, armoured: 1.05, artillery: 1.15 },
  },
  {
    key: 'forest',
    label: 'Forest',
    blurb:
      'Armies disappear into it, including your own. Nobody who has fought in one wants to again.',
    attackRatio: 3.6,
    paceWeeks: 3.2,
    supplyCost: 1.35,
    attrition: 1.3,
    visibility: 0.34,
    fortifiable: 0.85,
    favours: { infantry: 1.35, special_forces: 1.4, engineer: 1.2, armoured: 0.5, artillery: 0.65 },
  },
  {
    key: 'hills',
    label: 'Hills',
    blurb: 'Every ridge is a position and there is always another ridge.',
    attackRatio: 3.4,
    paceWeeks: 2.8,
    supplyCost: 1.25,
    attrition: 1.15,
    visibility: 0.62,
    fortifiable: 1,
    favours: { infantry: 1.25, airborne: 1.25, artillery: 1.2, armoured: 0.65 },
  },
  {
    key: 'mountains',
    label: 'Mountains',
    blurb:
      'A hundred men on the right ground are worth a division, and the division cannot get to them anyway.',
    attackRatio: 5.2,
    paceWeeks: 5,
    supplyCost: 1.9,
    attrition: 1.2,
    visibility: 0.5,
    fortifiable: 0.55,
    favours: { airborne: 1.3, infantry: 1.15, special_forces: 1.3, armoured: 0.25, mechanised: 0.4 },
  },
  {
    key: 'urban',
    label: 'A city',
    blurb:
      'Taken a street at a time, by infantry, at a price nobody agrees to in advance. And the people are still in it.',
    attackRatio: 4.6,
    paceWeeks: 4.2,
    supplyCost: 1.5,
    attrition: 1.75,
    visibility: 0.28,
    fortifiable: 1.2,
    favours: { infantry: 1.4, engineer: 1.35, special_forces: 1.2, armoured: 0.55, reconnaissance: 0.6 },
  },
  {
    key: 'marsh',
    label: 'Marsh',
    blurb: 'Nothing heavy moves and nothing dug stays dug.',
    attackRatio: 3.8,
    paceWeeks: 4,
    supplyCost: 1.7,
    attrition: 1.25,
    visibility: 0.55,
    fortifiable: 0.3,
    favours: { infantry: 1.2, engineer: 1.4, armoured: 0.3, mechanised: 0.45 },
  },
  {
    key: 'desert',
    label: 'Desert',
    blurb:
      'No flanks and no cover. It is a naval war fought on land, and it is decided by fuel.',
    attackRatio: 2.2,
    paceWeeks: 1.2,
    supplyCost: 1.85,
    attrition: 0.9,
    visibility: 0.95,
    fortifiable: 0.6,
    favours: { armoured: 1.5, mechanised: 1.35, reconnaissance: 1.4, logistics: 1.2, infantry: 0.7 },
  },
  {
    key: 'river_line',
    label: 'A river line',
    blurb:
      'Crossed once, at a place chosen months ago by somebody who has since been promoted or shot.',
    attackRatio: 4.4,
    paceWeeks: 3.4,
    supplyCost: 1.3,
    attrition: 1.4,
    visibility: 0.72,
    fortifiable: 1.1,
    favours: { engineer: 1.6, artillery: 1.25, infantry: 1.1, armoured: 0.6 },
  },
  {
    key: 'coastal',
    label: 'Coast',
    blurb: 'One flank belongs to whoever owns the sea, and it is never nobody.',
    attackRatio: 2.9,
    paceWeeks: 2,
    supplyCost: 0.85,
    attrition: 1.1,
    visibility: 0.84,
    fortifiable: 0.9,
    favours: { marine: 1.5, infantry: 1.05, artillery: 1.1, armoured: 0.9 },
  },
  {
    key: 'tundra',
    label: 'Tundra',
    blurb:
      'Distances that make the map lie and a season that does more damage than the other army.',
    attackRatio: 3,
    paceWeeks: 3.6,
    supplyCost: 2.1,
    attrition: 1.45,
    visibility: 0.8,
    fortifiable: 0.4,
    favours: { airborne: 1.15, infantry: 1.1, logistics: 1.3, armoured: 0.6 },
  },
  {
    key: 'jungle',
    label: 'Jungle',
    blurb:
      'The ground, the water and the insects are all against both sides, and one side lives there.',
    attackRatio: 4,
    paceWeeks: 4.6,
    supplyCost: 1.75,
    attrition: 1.55,
    visibility: 0.22,
    fortifiable: 0.5,
    favours: { infantry: 1.3, special_forces: 1.5, engineer: 1.2, armoured: 0.2, artillery: 0.5 },
  },
];

export function findTerrain(key: TerrainKey): TerrainTemplate {
  const found = TERRAIN_TEMPLATES.find((t) => t.key === key);
  if (!found) throw new Error(`theatre: unknown terrain ${key}`);
  return found;
}

/**
 * How dug in a sector is.
 *
 * Fortification is time rather than money, which is the part that gets
 * missed. A government can fund a defensive line and still not have one,
 * because what the line needs is weeks that nobody is shooting during —
 * and those are exactly the weeks a government spends deciding whether
 * the line is necessary.
 */
export type FortificationLevel = 0 | 1 | 2 | 3 | 4;

export const FORTIFICATION_LABELS: Record<FortificationLevel, string> = {
  0: 'Open',
  1: 'Field works',
  2: 'Prepared positions',
  3: 'Fortified',
  4: 'A fortress line',
};

/** What each level is worth to a defender, and what it cost to get there. */
export const FORTIFICATION: Record<
  FortificationLevel,
  { defence: number; weeks: number; blurb: string }
> = {
  0: { defence: 1, weeks: 0, blurb: 'Nothing but the ground itself.' },
  1: {
    defence: 1.25,
    weeks: 3,
    blurb: 'Scrapes and wire. Three weeks of work and worth more than the three weeks.',
  },
  2: {
    defence: 1.6,
    weeks: 10,
    blurb: 'Trenches, cover, registered artillery. The point at which attacking here becomes a decision.',
  },
  3: {
    defence: 2.1,
    weeks: 26,
    blurb: 'Concrete, depth, and a plan for losing the first line on purpose.',
  },
  4: {
    defence: 2.8,
    weeks: 140,
    blurb:
      'A generation of spending, impossible to take from the front, and routinely gone around.',
  },
};

/** What a sector is doing, which is usually nothing. */
export type SectorPosture = 'holding' | 'attacking' | 'defending' | 'withdrawing' | 'quiet';

export const SECTOR_POSTURE_LABELS: Record<SectorPosture, string> = {
  holding: 'Holding',
  attacking: 'Attacking',
  defending: 'Under attack',
  withdrawing: 'Withdrawing',
  quiet: 'Quiet',
};

/**
 * How stale a government's picture of a sector is allowed to get before
 * it stops being a picture.
 *
 * Belief decays toward the last thing anybody confirmed, and after this
 * many weeks the staff are briefing from a map rather than from the
 * ground. The briefing does not become less confident when this happens,
 * which is the entire problem.
 */
export const STALE_WEEKS = 6;
