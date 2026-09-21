/**
 * war.ts — the kinds of war, and what winning one means.
 *
 * The single most important thing in this file is that VICTORY IS NOT ONE
 * THING. A war of conquest is won by taking ground. A defensive war is
 * won by still existing. A counter-insurgency is won by the absence of
 * something, which is why nobody can ever tell whether it has been. An
 * intervention is won by leaving, and is almost never left.
 *
 * So each war type carries its own victory condition, its own clock, and
 * its own relationship between military success and political survival —
 * because those come apart constantly. A government can win every battle
 * and lose the war, and it can lose ground for three years and be
 * re-elected for holding the line.
 *
 * The second thing is EXHAUSTION. Every war in this engine is a race
 * between the two sides' capacity to keep going, and that capacity is
 * political rather than material. Wars do not end when one side runs out
 * of soldiers; they end when one side's government can no longer carry
 * its own population. The `exhaustionRate` on each type is how fast that
 * happens, and it is the number that decides most wars here.
 *
 * Nothing in this file says a war is justified or unjustified. It says
 * what follows from starting one.
 */

export type WarKind =
  | 'defensive'
  | 'border'
  | 'territorial'
  | 'limited'
  | 'total'
  | 'civil'
  | 'revolution'
  | 'insurgency'
  | 'proxy'
  | 'independence'
  | 'secession'
  | 'coalition'
  | 'peacekeeping'
  | 'humanitarian'
  | 'intervention';

export const WAR_KINDS: WarKind[] = [
  'defensive',
  'border',
  'territorial',
  'limited',
  'total',
  'civil',
  'revolution',
  'insurgency',
  'proxy',
  'independence',
  'secession',
  'coalition',
  'peacekeeping',
  'humanitarian',
  'intervention',
];

/** What a side is trying to achieve. Wars are lost by picking badly. */
export type WarAim =
  | 'survive'
  | 'restore_border'
  | 'seize_territory'
  | 'regime_change'
  | 'deny_objective'
  | 'protect_population'
  | 'compel_settlement'
  | 'secure_independence'
  | 'restore_order';

export const WAR_AIM_LABELS: Record<WarAim, string> = {
  survive: 'Still be here',
  restore_border: 'Restore the border',
  seize_territory: 'Take and hold territory',
  regime_change: 'Remove the government on the other side',
  deny_objective: 'Stop them getting what they came for',
  protect_population: 'Protect a population',
  compel_settlement: 'Force them to the table',
  secure_independence: 'Secure independence',
  restore_order: 'Restore the authority of the state',
};

/**
 * How hard each aim is, as a multiplier on the war score needed to claim
 * it. Removing a government is very nearly the hardest thing a state can
 * attempt and is attempted constantly.
 */
export const WAR_AIM_DIFFICULTY: Record<WarAim, number> = {
  survive: 0.35,
  deny_objective: 0.5,
  restore_border: 0.75,
  compel_settlement: 0.85,
  protect_population: 0.9,
  restore_order: 1.15,
  seize_territory: 1.2,
  secure_independence: 1.4,
  regime_change: 1.75,
};

export interface WarTemplate {
  kind: WarKind;
  label: string;
  /** What it is, in the words a briefing would use. */
  blurb: string;
  /** The aims a side in this kind of war can plausibly hold. */
  aims: WarAim[];
  /**
   * How fast the population tires of it, per week at full intensity.
   *
   * The number that decides most wars in this engine. A defensive war
   * against an invasion exhausts a country very slowly; an intervention
   * somewhere else exhausts it quickly, and an insurgency exhausts the
   * counter-insurgent fastest of all because there is never a day on
   * which anything has visibly been achieved.
   */
  exhaustionRate: number;
  /**
   * How much the country rallies to the government at the outset.
   *
   * Real, large, and temporary. It decays regardless of how the war is
   * going, which is why a government that starts one on the strength of
   * it is spending capital it has not earned.
   */
  rally: number;
  /** How fast that rally decays, per week. */
  rallyDecay: number;
  /**
   * How much of the country's military can be brought to bear.
   *
   * A border skirmish uses a fraction of a standing army. A total war
   * uses the country.
   */
  commitment: number;
  /** Whether it is fought on the country's own soil. Changes everything. */
  homeland: boolean;
  /**
   * How far military success translates into political success, 0–1.
   *
   * Low in interventions and counter-insurgencies, where winning
   * engagements is not the same as being seen to be winning. High in a
   * defensive war, where holding the line IS the achievement.
   */
  legibility: number;
}

export const WAR_TEMPLATES: WarTemplate[] = [
  {
    kind: 'defensive',
    label: 'A defensive war',
    blurb: 'Somebody has crossed the border. Nobody had to decide to be in this one.',
    aims: ['survive', 'restore_border', 'deny_objective'],
    exhaustionRate: 0.0022,
    rally: 26,
    rallyDecay: 0.004,
    commitment: 1,
    homeland: true,
    legibility: 0.9,
  },
  {
    kind: 'border',
    label: 'A border conflict',
    blurb: 'Shooting along a line both governments have described differently for years.',
    aims: ['restore_border', 'deny_objective', 'compel_settlement'],
    exhaustionRate: 0.004,
    rally: 12,
    rallyDecay: 0.012,
    commitment: 0.28,
    homeland: true,
    legibility: 0.65,
  },
  {
    kind: 'territorial',
    label: 'A territorial war',
    blurb: 'A piece of ground that has been argued about for a century, now being fought over.',
    exhaustionRate: 0.0055,
    aims: ['seize_territory', 'restore_border', 'compel_settlement'],
    rally: 16,
    rallyDecay: 0.009,
    commitment: 0.6,
    homeland: false,
    legibility: 0.7,
  },
  {
    kind: 'limited',
    label: 'A limited war',
    blurb: 'Stated objectives, a stated end point, and a government that intends to stop there.',
    aims: ['compel_settlement', 'deny_objective', 'protect_population'],
    exhaustionRate: 0.006,
    rally: 14,
    rallyDecay: 0.014,
    commitment: 0.45,
    homeland: false,
    legibility: 0.55,
  },
  {
    kind: 'total',
    label: 'A total war',
    blurb:
      'Everything the country has, against everything they have. Nothing else the government does will matter for as long as it lasts.',
    aims: ['survive', 'regime_change', 'seize_territory'],
    exhaustionRate: 0.0035,
    rally: 34,
    rallyDecay: 0.0025,
    commitment: 1,
    homeland: true,
    legibility: 0.85,
  },
  {
    kind: 'civil',
    label: 'A civil war',
    blurb: 'The state against part of itself. Every casualty on both sides is a citizen.',
    aims: ['restore_order', 'survive'],
    exhaustionRate: 0.0075,
    rally: 8,
    rallyDecay: 0.02,
    commitment: 0.85,
    homeland: true,
    legibility: 0.35,
  },
  {
    kind: 'revolution',
    label: 'A revolution',
    blurb: 'A government fighting for its own existence against people it governs.',
    aims: ['survive', 'restore_order'],
    exhaustionRate: 0.009,
    rally: 4,
    rallyDecay: 0.03,
    commitment: 0.7,
    homeland: true,
    legibility: 0.25,
  },
  {
    kind: 'insurgency',
    label: 'An insurgency',
    blurb:
      'No front line, no decisive engagement, and no day on which anybody can say it has been won.',
    aims: ['restore_order', 'deny_objective'],
    exhaustionRate: 0.0085,
    rally: 6,
    rallyDecay: 0.022,
    commitment: 0.4,
    homeland: true,
    legibility: 0.2,
  },
  {
    kind: 'proxy',
    label: 'A proxy war',
    blurb: 'Somebody else doing the fighting with your equipment, in a war nobody has declared.',
    aims: ['deny_objective', 'compel_settlement'],
    exhaustionRate: 0.0025,
    rally: 3,
    rallyDecay: 0.02,
    commitment: 0.15,
    homeland: false,
    legibility: 0.3,
  },
  {
    kind: 'independence',
    label: 'A war of independence',
    blurb: 'A settlement one part of a country never agreed to, now being decided by force.',
    aims: ['secure_independence', 'survive'],
    exhaustionRate: 0.005,
    rally: 22,
    rallyDecay: 0.006,
    commitment: 0.8,
    homeland: true,
    legibility: 0.6,
  },
  {
    kind: 'secession',
    label: 'A war of secession',
    blurb: 'The state trying to hold together something that is leaving.',
    aims: ['restore_order', 'deny_objective'],
    exhaustionRate: 0.007,
    rally: 15,
    rallyDecay: 0.015,
    commitment: 0.75,
    homeland: true,
    legibility: 0.45,
  },
  {
    kind: 'coalition',
    label: 'A coalition war',
    blurb:
      'Fought alongside allies, which halves the burden and doubles the number of people who have to agree.',
    aims: ['compel_settlement', 'deny_objective', 'regime_change'],
    exhaustionRate: 0.0045,
    rally: 18,
    rallyDecay: 0.011,
    commitment: 0.55,
    homeland: false,
    legibility: 0.6,
  },
  {
    kind: 'peacekeeping',
    label: 'A peacekeeping operation',
    blurb: 'Standing between two parties who have agreed to let somebody, for now.',
    aims: ['protect_population', 'deny_objective'],
    exhaustionRate: 0.0035,
    rally: 5,
    rallyDecay: 0.018,
    commitment: 0.18,
    homeland: false,
    legibility: 0.4,
  },
  {
    kind: 'humanitarian',
    label: 'A humanitarian intervention',
    blurb:
      'Going in to stop something. The justification is the easiest part and the exit is the hardest.',
    aims: ['protect_population', 'compel_settlement'],
    exhaustionRate: 0.0065,
    rally: 11,
    rallyDecay: 0.017,
    commitment: 0.3,
    homeland: false,
    legibility: 0.35,
  },
  {
    kind: 'intervention',
    label: 'A military intervention',
    blurb:
      "Somebody else's war, entered on purpose, with objectives that will be revised at least twice.",
    aims: ['regime_change', 'compel_settlement', 'deny_objective'],
    exhaustionRate: 0.0078,
    rally: 9,
    rallyDecay: 0.019,
    commitment: 0.35,
    homeland: false,
    legibility: 0.3,
  },
];

export function findWarKind(kind: WarKind): WarTemplate {
  const found = WAR_TEMPLATES.find((w) => w.kind === kind);
  if (!found) throw new Error(`war: unknown kind ${kind}`);
  return found;
}

/** How a war ended. Most of them end in the middle four. */
export type WarOutcome =
  | 'victory'
  | 'favourable_settlement'
  | 'status_quo'
  | 'unfavourable_settlement'
  | 'defeat'
  | 'stalemate'
  | 'withdrawal'
  | 'collapse';

export const WAR_OUTCOME_LABELS: Record<WarOutcome, string> = {
  victory: 'Won',
  favourable_settlement: 'Settled on favourable terms',
  status_quo: 'Ended where it started',
  unfavourable_settlement: 'Settled on their terms',
  defeat: 'Lost',
  stalemate: 'Neither side could finish it',
  withdrawal: 'Withdrawn from',
  collapse: 'The government fell before it ended',
};
