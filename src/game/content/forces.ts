/**
 * forces.ts — what the country can actually do, as opposed to what it says.
 *
 * Four arms, because four is the number that produces genuinely different
 * decisions. An army defends ground and occupies it. A navy projects and
 * protects trade, which is why a trading country with no navy is making a
 * bet. An air force decides how fast anything happens. Cyber is the one a
 * middling country can afford to be good at, and the only one whose use is
 * deniable.
 *
 * Each arm has three numbers and they mean different things:
 *
 *   STRENGTH is how much of it there is. Bought over years, lost in weeks,
 *   and the only one the public ever hears a figure for.
 *
 *   READINESS is whether it could go tomorrow. It is the first thing cut
 *   because nothing visible happens when you cut it, and the first thing
 *   missed when anything happens at all. A government that funded strength
 *   and starved readiness has a parade, not a deterrent.
 *
 *   EQUIPMENT is how old the kit is. It ages every single week whatever
 *   anybody does, which makes procurement a treadmill rather than a
 *   decision, and makes a government that skipped a cycle discover it
 *   during a crisis rather than before one.
 */

export type ArmKey = 'army' | 'navy' | 'air' | 'cyber';

export interface ArmTemplate {
  key: ArmKey;
  name: string;
  blurb: string;
  /** Share of the defence budget this arm takes at a standing posture. */
  budgetShare: number;
  /** How much of the defence line goes on people rather than kit. */
  manpowerShare: number;
  /** Weight in a defensive fight on our own ground. */
  defensive: number;
  /** Weight in anything that happens somewhere else. */
  expeditionary: number;
  /** How fast its equipment goes obsolete, in points a year. */
  obsolescence: number;
  /** How much readiness decays a year when nothing is spent on it. */
  readinessDecay: number;
  /** What the public thinks it is for, which is not always what it is for. */
  publicRegard: number;
}

export const ARM_TEMPLATES: ArmTemplate[] = [
  {
    key: 'army',
    name: 'Army',
    blurb:
      'Ground forces. The only arm that can hold a place rather than merely reach it, and the only one whose casualties are counted on the news every evening.',
    budgetShare: 0.38,
    manpowerShare: 0.62,
    defensive: 1.0,
    expeditionary: 0.55,
    obsolescence: 3.2,
    readinessDecay: 9,
    publicRegard: 1.0,
  },
  {
    key: 'navy',
    name: 'Navy',
    blurb:
      'Ships, and what they protect. A trading country without one is making a bet that nobody will ever test the sea lanes it lives on.',
    budgetShare: 0.26,
    manpowerShare: 0.42,
    defensive: 0.6,
    expeditionary: 1.0,
    obsolescence: 2.4,
    readinessDecay: 7,
    publicRegard: 0.85,
  },
  {
    key: 'air',
    name: 'Air force',
    blurb:
      'Aircraft and air defence. Decides how fast anything happens, and costs more per head than any other arm by a wide margin.',
    budgetShare: 0.27,
    manpowerShare: 0.3,
    defensive: 0.85,
    expeditionary: 0.9,
    obsolescence: 4.6,
    readinessDecay: 12,
    publicRegard: 0.8,
  },
  {
    key: 'cyber',
    name: 'Cyber command',
    blurb:
      'The one arm a middling country can afford to be genuinely good at, and the only one whose use can be denied afterwards.',
    budgetShare: 0.09,
    manpowerShare: 0.55,
    defensive: 0.45,
    expeditionary: 0.6,
    obsolescence: 8.5,
    readinessDecay: 6,
    publicRegard: 0.4,
  },
];

export function findArm(key: ArmKey): ArmTemplate {
  const found = ARM_TEMPLATES.find((a) => a.key === key);
  if (!found) throw new Error(`forces: unknown arm ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Doctrine
 * ------------------------------------------------------------------ */

/**
 * How the country raises and uses its forces.
 *
 * Each of these is a genuine political choice with a constituency on both
 * sides, which is the test for whether something belongs in this game at
 * all. None of them is strictly better.
 */
export type DoctrineKey = 'professional' | 'conscript' | 'territorial' | 'expeditionary';

export interface DoctrineTemplate {
  key: DoctrineKey;
  name: string;
  blurb: string;
  /** What it costs to change to, in political capital. */
  cost: number;
  /** Multiplier on manpower available. */
  manpower: number;
  /** Multiplier on readiness. */
  readiness: number;
  /** Multiplier on fighting at home, and away. */
  defensive: number;
  expeditionary: number;
  /** What it does to approval on adoption, and to the young in particular. */
  approval: number;
  /** ₡bn a year it adds to the defence line beyond what is budgeted. */
  surcharge: number;
}

export const DOCTRINE_TEMPLATES: DoctrineTemplate[] = [
  {
    key: 'professional',
    name: 'A professional force',
    blurb:
      'Volunteers, long service, expensive per head and good at what it does. The default almost everywhere, because it is the one that does not require asking anybody to serve.',
    cost: 0,
    manpower: 1.0,
    readiness: 1.0,
    defensive: 1.0,
    expeditionary: 1.0,
    approval: 0,
    surcharge: 0,
  },
  {
    key: 'conscript',
    name: 'National service',
    blurb:
      'Everyone serves. Far more people under arms, far less good at anything technical, and a permanent argument with everybody under twenty-five and their parents.',
    cost: 34,
    manpower: 2.3,
    readiness: 0.78,
    defensive: 1.25,
    expeditionary: 0.7,
    approval: -7,
    surcharge: 62,
  },
  {
    key: 'territorial',
    name: 'Territorial defence',
    blurb:
      'A small regular core and a large trained reserve. Cheap, genuinely hard to invade, and almost useless for anything that happens somewhere else.',
    cost: 22,
    manpower: 1.5,
    readiness: 0.85,
    defensive: 1.4,
    expeditionary: 0.45,
    approval: 2,
    surcharge: -38,
  },
  {
    key: 'expeditionary',
    name: 'Expeditionary posture',
    blurb:
      'Built to go somewhere. Lift, logistics and the assumption that the fighting happens elsewhere — which is a statement about the country as much as about the forces.',
    cost: 28,
    manpower: 0.85,
    readiness: 1.1,
    defensive: 0.8,
    expeditionary: 1.45,
    approval: -3,
    surcharge: 74,
  },
];

export function findDoctrine(key: DoctrineKey): DoctrineTemplate {
  const found = DOCTRINE_TEMPLATES.find((d) => d.key === key);
  if (!found) throw new Error(`forces: unknown doctrine ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Procurement
 * ------------------------------------------------------------------ */

/**
 * Things that take years, cost more than anybody said, and arrive late.
 *
 * Every one of these is late and over budget on purpose, because every one
 * of them is late and over budget in reality, and a game where procurement
 * ran to time would be modelling a world nobody has ever governed in. The
 * interesting decision is not which to buy; it is whether to start
 * something that will be finished by somebody else.
 */
export interface ProgrammeTemplate {
  key: string;
  name: string;
  arm: ArmKey;
  blurb: string;
  /** ₡bn, total, spread over the build. */
  cost: number;
  /** Years it is supposed to take. It will not take this. */
  years: number;
  /** Points of strength it adds when it finally lands. */
  strength: number;
  /** Points of equipment modernity it restores. */
  equipment: number;
  /** How likely it is to slip, 0–1. Complexity is the whole story. */
  risk: number;
  /** Where the jobs are, which is why it is hard to cancel. */
  regions: string[];
}

export const PROGRAMME_TEMPLATES: ProgrammeTemplate[] = [
  {
    key: 'frigates',
    name: 'Frigate programme',
    arm: 'navy',
    blurb:
      'Eight hulls from a yard that has not built one in fifteen years. The yard is the point as much as the ships are, and everybody involved knows it.',
    cost: 186,
    years: 8,
    strength: 14,
    equipment: 28,
    risk: 0.55,
    regions: ['sable', 'estmoor'],
  },
  {
    key: 'combat_air',
    name: 'Combat air replacement',
    arm: 'air',
    blurb:
      'The most expensive thing the state will ever buy, for an air force that is otherwise flying aircraft older than its pilots.',
    cost: 268,
    years: 9,
    strength: 18,
    equipment: 42,
    risk: 0.62,
    regions: ['halloway', 'ternhill'],
  },
  {
    key: 'armour',
    name: 'Armoured vehicle refit',
    arm: 'army',
    blurb:
      'Rebuilding what exists rather than buying what does not. Unglamorous, achievable, and the sort of thing no government has ever won a vote announcing.',
    cost: 74,
    years: 4,
    strength: 8,
    equipment: 22,
    risk: 0.3,
    regions: ['karrow', 'ternhill'],
  },
  {
    key: 'air_defence',
    name: 'Integrated air defence',
    arm: 'air',
    blurb:
      'Radar, missiles and the software to make them agree with each other. The third of those is what will be late.',
    cost: 118,
    years: 6,
    strength: 11,
    equipment: 26,
    risk: 0.48,
    regions: ['halloway', 'callow'],
  },
  {
    key: 'cyber_capability',
    name: 'National cyber capability',
    arm: 'cyber',
    blurb:
      'People rather than hardware, which makes it fast to build and impossible to show anybody. A government gets no photograph out of this one.',
    cost: 46,
    years: 3,
    strength: 16,
    equipment: 38,
    risk: 0.25,
    regions: ['halloway'],
  },
  {
    key: 'sealift',
    name: 'Strategic lift',
    arm: 'navy',
    blurb:
      'Ships and aircraft whose only job is to move the others. Nobody votes for logistics, and nothing happens without it.',
    cost: 92,
    years: 5,
    strength: 7,
    equipment: 18,
    risk: 0.35,
    regions: ['sable'],
  },
];

export function findProgramme(key: string): ProgrammeTemplate {
  const found = PROGRAMME_TEMPLATES.find((p) => p.key === key);
  if (!found) throw new Error(`forces: unknown programme ${key}`);
  return found;
}

export const ARM_LABELS: Record<ArmKey, string> = {
  army: 'Army',
  navy: 'Navy',
  air: 'Air force',
  cyber: 'Cyber command',
};
