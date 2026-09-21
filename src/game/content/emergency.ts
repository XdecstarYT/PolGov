/**
 * emergency.ts — how far the state actually reaches, and what happens
 * when it reaches further than usual.
 *
 * STATE CAPACITY IS REACH, NOT WILL. A government can want anything it
 * likes; what it can actually administer is bounded by a civil service's
 * capability, the infrastructure a decision has to travel over, and how
 * evenly the country's institutions cover it — not by how strongly the
 * decision was meant. A weak state that wants something badly still does
 * it badly.
 *
 * EMERGENCY POWERS ARE EASY TO DECLARE AND HARD TO STAND DOWN. The
 * decision to declare is a single vote at a single moment of danger.
 * The decision to relinquish has to be taken against whatever interest
 * has organised itself around the powers in the meantime — a security
 * apparatus, a political convenience, a public that has stopped
 * noticing the powers are unusual — and that interest grows every week
 * the emergency continues. Standing down gets more expensive the longer
 * a government waits to do it, which is exactly backwards from what the
 * danger that justified it usually does.
 */

/** How far outside ordinary rule the government is currently operating. */
export type EmergencyLevel = 'normal' | 'state_of_emergency' | 'martial_law';

export interface EmergencyTemplate {
  key: EmergencyLevel;
  label: string;
  blurb: string;
  /** Multiplier on effective response capability while this is in force. */
  responseMultiplier: number;
  /** Weekly legitimacy drag at the moment of declaring — grows with duration separately. */
  legitimacyDrag: number;
  /** What it costs civil liberties trust, immediately. */
  libertyCost: number;
}

export const EMERGENCY_LEVELS: EmergencyTemplate[] = [
  {
    key: 'normal',
    label: 'Ordinary rule',
    blurb: 'The government the courts, the chamber and the constitution recognise.',
    responseMultiplier: 1,
    legitimacyDrag: 0,
    libertyCost: 0,
  },
  {
    key: 'state_of_emergency',
    label: 'State of emergency',
    blurb:
      'Expanded executive power, time-limited on paper. Buys real response capability and starts a clock that gets more expensive to stop than it was to start.',
    responseMultiplier: 1.5,
    legitimacyDrag: 0.4,
    libertyCost: 12,
  },
  {
    key: 'martial_law',
    label: 'Martial law',
    blurb:
      'The military runs ordinary administration. The largest capability a government can buy, and the largest legitimacy debt it can take on to buy it.',
    responseMultiplier: 2.1,
    legitimacyDrag: 1.1,
    libertyCost: 32,
  },
];

export function findEmergencyLevel(key: EmergencyLevel): EmergencyTemplate {
  return EMERGENCY_LEVELS.find((e) => e.key === key) ?? EMERGENCY_LEVELS[0]!;
}
