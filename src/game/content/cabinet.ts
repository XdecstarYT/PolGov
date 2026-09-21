/**
 * cabinet.ts — who is round the table, and why they are there.
 *
 * A CABINET IS A COALITION YOU HAVE TO KEEP, NOT A TEAM YOU PICKED.
 * Almost nobody at the table is there because they are the best person
 * for the department. They are there because of what they represent —
 * a faction, a region, a wing, a debt — and the appointment is the
 * payment. Which means that sacking a minister is not a personnel
 * decision, it is a withdrawal of a payment, and the person who notices
 * is not the minister.
 *
 * AMBITION IS THE THIRD AXIS. Competence and loyalty are drawn
 * independently, as they are for generals. Ministers have a third: how
 * much they want the leader's job. The dangerous one is not the
 * incompetent minister or the disloyal one. It is the able, ambitious
 * minister who is loyal right up until the arithmetic changes — and
 * every government needs several of those, because the able ones are
 * ambitious and the unambitious ones are usually unambitious for a
 * reason.
 *
 * And the quiet one: A MINISTER IS CAPTURED BY THEIR DEPARTMENT within
 * about eighteen months. They arrive to change it and end up arguing its
 * case in cabinet, because they now know things the rest of the cabinet
 * does not and because the officials are very good at their jobs. Every
 * government finds this surprising and every government causes it.
 */

/** How somebody came to be at the table. It decides almost everything. */
export type AppointmentBasis =
  | 'loyalist'
  | 'technocrat'
  | 'faction'
  | 'rival'
  | 'regional'
  | 'coalition'
  | 'reward';

export interface BasisTemplate {
  key: AppointmentBasis;
  label: string;
  blurb: string;
  /** What this kind of appointment is usually worth at the department. */
  competence: number;
  /** And how far they can be relied on. */
  loyalty: number;
  /** And how much they want the job above them. */
  ambition: number;
  /** What removing one costs, beyond the person. */
  removalCost: number;
  /** What appointing one buys, in party or coalition management. */
  managementValue: number;
}

export const APPOINTMENT_BASES: BasisTemplate[] = [
  {
    key: 'loyalist',
    label: 'A loyalist',
    blurb:
      'Will do what is asked and say what is agreed. Also cannot run a department, which is a separate question nobody asks at the time.',
    competence: 42,
    loyalty: 88,
    ambition: 22,
    removalCost: 3,
    managementValue: 4,
  },
  {
    key: 'technocrat',
    label: 'A technocrat',
    blurb:
      'Knows the subject, has no base, and can be removed at no political cost — which is why they are the first to go when a sacking is needed.',
    competence: 82,
    loyalty: 52,
    ambition: 18,
    removalCost: 1,
    managementValue: 1,
  },
  {
    key: 'faction',
    label: 'A faction’s candidate',
    blurb:
      'Represents a wing of the party that has to be represented. The appointment is the payment, and the payment is what keeps the wing quiet.',
    competence: 55,
    loyalty: 44,
    ambition: 62,
    removalCost: 14,
    managementValue: 16,
  },
  {
    key: 'rival',
    label: 'A rival',
    blurb:
      'Better inside than outside, where they would be free to say what they think. Inside they are bound by collective responsibility and are counting.',
    competence: 74,
    loyalty: 28,
    ambition: 88,
    removalCost: 18,
    managementValue: 12,
  },
  {
    key: 'regional',
    label: 'A regional appointment',
    blurb:
      'Somewhere had to be represented and this is who that somewhere sent. Competent at the politics of one place and not chosen for anything else.',
    competence: 51,
    loyalty: 62,
    ambition: 40,
    removalCost: 9,
    managementValue: 8,
  },
  {
    key: 'coalition',
    label: 'A coalition partner',
    blurb:
      'Not in this party and not removable by this leader. Answers to somebody else, in a building this government does not control.',
    competence: 60,
    loyalty: 34,
    ambition: 46,
    removalCost: 24,
    managementValue: 22,
  },
  {
    key: 'reward',
    label: 'A debt being paid',
    blurb:
      'Was promised this, some time ago, in a leadership contest. Everybody at the table knows it and nobody will say so.',
    competence: 46,
    loyalty: 70,
    ambition: 52,
    removalCost: 11,
    managementValue: 7,
  },
];

export function findBasis(key: AppointmentBasis): BasisTemplate {
  const found = APPOINTMENT_BASES.find((b) => b.key === key);
  if (!found) throw new Error(`cabinet: unknown basis ${key}`);
  return found;
}

/** What a minister is like, beyond the numbers. */
export type MinisterTrait =
  | 'departmental'
  | 'media'
  | 'detail'
  | 'bruiser'
  | 'collegiate'
  | 'briefing'
  | 'principled'
  | 'invisible';

export const MINISTER_TRAITS: {
  key: MinisterTrait;
  label: string;
  blurb: string;
  /** Delivery at the department. */
  delivery: number;
  /** How the department's officials take to them. */
  machine: number;
  /** What they are worth in public. */
  presentation: number;
  /** And what they do to cabinet. */
  cohesion: number;
}[] = [
  {
    key: 'departmental',
    label: 'Departmental',
    blurb: 'Went native in eleven months and now argues the department’s case in cabinet.',
    delivery: 0.18,
    machine: 0.25,
    presentation: -0.05,
    cohesion: -0.12,
  },
  {
    key: 'media',
    label: 'Good on television',
    blurb: 'Excellent in a studio and has not read the submission. Both facts travel.',
    delivery: -0.12,
    machine: -0.15,
    presentation: 0.35,
    cohesion: 0,
  },
  {
    key: 'detail',
    label: 'Across the detail',
    blurb: 'Reads everything, finds the problem on page forty, and is impossible to brief against.',
    delivery: 0.28,
    machine: 0.12,
    presentation: -0.1,
    cohesion: 0.05,
  },
  {
    key: 'bruiser',
    label: 'A bruiser',
    blurb: 'Gets things through by force. Leaves a department that will not do it again quietly.',
    delivery: 0.22,
    machine: -0.3,
    presentation: 0.05,
    cohesion: -0.18,
  },
  {
    key: 'collegiate',
    label: 'Collegiate',
    blurb: 'Holds the table together, which is invisible until they are not there.',
    delivery: 0.02,
    machine: 0.08,
    presentation: 0,
    cohesion: 0.3,
  },
  {
    key: 'briefing',
    label: 'Briefs against colleagues',
    blurb: 'Every unattributable quote in the weekend papers comes from one office, and everybody knows which.',
    delivery: -0.05,
    machine: -0.1,
    presentation: 0.12,
    cohesion: -0.35,
  },
  {
    key: 'principled',
    label: 'Principled',
    blurb:
      'Will resign over something. That is a strength, an asset and a countdown, in that order.',
    delivery: 0.08,
    machine: 0.1,
    presentation: 0.15,
    cohesion: -0.08,
  },
  {
    key: 'invisible',
    label: 'Invisible',
    blurb:
      'Has held the post for two years and could not be named by anybody outside the building. Causes no trouble of any kind.',
    delivery: -0.02,
    machine: 0.05,
    presentation: -0.2,
    cohesion: 0.12,
  },
];

export function findMinisterTrait(key: MinisterTrait) {
  const found = MINISTER_TRAITS.find((t) => t.key === key);
  if (!found) throw new Error(`cabinet: unknown trait ${key}`);
  return found;
}

/**
 * How a government treats the permanent officials.
 *
 * THE CIVIL SERVICE OUTLASTS YOU AND KNOWS IT. It has its own view, its
 * own timescale, and the ability to do exactly what it was told in a way
 * that takes four years. A government that fights it wins on the day and
 * loses over the term; a government that is captured by it gets
 * competent delivery of things it did not want.
 *
 * There is no correct setting here, which is why it is on the desk.
 */
export type MachinePosture = 'partnership' | 'direction' | 'confrontation' | 'politicisation';

export const MACHINE_POSTURES: {
  key: MachinePosture;
  label: string;
  blurb: string;
  /** What it does to how much of a decision actually happens. */
  compliance: number;
  /** What it does to the quality of what happens. */
  capability: number;
  /** How fast institutional memory is lost. */
  memoryLoss: number;
  /**
   * How much compliance depends on morale under this posture.
   *
   * Nearly nothing under politicisation, which is the entire point of
   * it: officials appointed to comply do comply, whatever they think.
   * What that buys is compliance from people who cannot do the job.
   */
  moraleWeight: number;
  /** Weekly cost to the norms, which is the part that is permanent. */
  normsCost: number;
  /** And what the officials come to think of this government. */
  moraleEffect: number;
}[] = [
  {
    key: 'partnership',
    label: 'Work with them',
    blurb:
      'Ask what is possible, be told, and get most of it. The price is that most of it is what was already possible.',
    compliance: 0.92,
    capability: 1.0,
    memoryLoss: 0,
    normsCost: 0,
    moraleEffect: 0.0,
    moraleWeight: 0.35,
  },
  {
    key: 'direction',
    label: 'Direct them',
    blurb:
      'State the objective, refuse the first three reasons it cannot be done, and accept the fourth.',
    compliance: 0.82,
    capability: 0.98,
    memoryLoss: 0.002,
    normsCost: 0.004,
    moraleEffect: -0.02,
    moraleWeight: 0.35,
  },
  {
    key: 'confrontation',
    label: 'Take them on',
    blurb:
      'Win the argument in public, lose it in the implementation, and be told afterwards that it was always going to take four years.',
    compliance: 0.58,
    capability: 0.84,
    memoryLoss: 0.008,
    normsCost: 0.02,
    moraleEffect: -0.14,
    moraleWeight: 0.45,
  },
  {
    key: 'politicisation',
    label: 'Replace them',
    blurb:
      'Appoint people who agree. Compliance goes up immediately and competence goes with the people who left, and the next government inherits both.',
    compliance: 0.96,
    capability: 0.62,
    memoryLoss: 0.022,
    normsCost: 0.048,
    moraleEffect: -0.24,
    moraleWeight: 0.05,
  },
];

export function findPosture(key: MachinePosture) {
  const found = MACHINE_POSTURES.find((p) => p.key === key);
  if (!found) throw new Error(`cabinet: unknown posture ${key}`);
  return found;
}

/**
 * Weeks before a minister starts arguing their department's case rather
 * than the government's.
 *
 * About eighteen months. They arrive to change it and end up defending
 * it, because they now know things the rest of the cabinet does not and
 * because the officials are extremely good at their jobs. Every
 * government finds this surprising and every government causes it.
 */
export const CAPTURE_WEEKS = 78;

/** Ambition above which a minister is counting rather than serving. */
export const LEADERSHIP_AMBITION = 72;
