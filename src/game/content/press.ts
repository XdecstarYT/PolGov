/**
 * press.ts — who owns the feed, and what the government does about it.
 *
 * CAPTURE THROUGH PRESSURE IS FAST, VISIBLE AND EXPENSIVE. A phone call
 * threatening an outlet's licence produces coverage by Friday and a
 * story about the phone call by Monday — the press freedom hit lands
 * immediately and everyone can see exactly what happened and why.
 *
 * CAPTURE THROUGH OWNERSHIP IS SLOW, QUIET AND DURABLE. Buying a stake
 * costs little each time, moves the needle almost nothing on the day,
 * and produces no story anyone can point to — the entire mechanism is
 * that there is no single event to react to, only a landscape that is
 * gradually different from the one before. It is why ownership
 * concentration is the more effective route to a compliant press for
 * any government patient enough to use it, and the harder one to
 * reverse once it has happened.
 */

/** How the government treats the press it does not own. */
export type PressPosture = 'hands_off' | 'assertive' | 'adversarial';

export interface PressPostureTemplate {
  key: PressPosture;
  label: string;
  blurb: string;
  /** Weekly pull on the freedom index toward this resting level. */
  freedomTarget: number;
}

export const PRESS_POSTURES: PressPostureTemplate[] = [
  {
    key: 'hands_off',
    label: 'Hands off',
    blurb: 'Access, criticism and the occasional damaging leak, left entirely alone.',
    freedomTarget: 80,
  },
  {
    key: 'assertive',
    label: 'Assertive',
    blurb: 'Access managed carefully, briefings selective, nothing that would show up as a story about press freedom.',
    freedomTarget: 55,
  },
  {
    key: 'adversarial',
    label: 'Adversarial',
    blurb: 'Threats, selective access and legal harassment of the outlets that will not fall in line. Everyone can see it happening.',
    freedomTarget: 25,
  },
];

export function findPressPosture(key: PressPosture): PressPostureTemplate {
  return PRESS_POSTURES.find((p) => p.key === key) ?? PRESS_POSTURES[0]!;
}

/** Who holds a share of the country's outlets. */
export type OwnerType = 'independent' | 'conglomerate' | 'state_owned' | 'partisan_patron';

export interface OwnerTemplate {
  key: OwnerType;
  label: string;
  blurb: string;
}

export const OWNER_TYPES: OwnerTemplate[] = [
  {
    key: 'independent',
    label: 'Independently owned',
    blurb: 'Answers to a newsroom and a masthead rather than to a portfolio.',
  },
  {
    key: 'conglomerate',
    label: 'A conglomerate',
    blurb: 'One shareholder register behind several outlets, coordinated in ways a reader never sees.',
  },
  {
    key: 'state_owned',
    label: 'State-owned',
    blurb: 'Funded by the government it covers, which does not have to mean captured by it — and usually does.',
  },
  {
    key: 'partisan_patron',
    label: 'A partisan patron',
    blurb: 'Owned to be useful to a cause rather than to turn a profit, which is a different kind of unfree.',
  },
];

export function findOwnerType(key: OwnerType): OwnerTemplate {
  return OWNER_TYPES.find((o) => o.key === key) ?? OWNER_TYPES[0]!;
}
