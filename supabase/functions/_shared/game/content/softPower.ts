/**
 * softPower.ts — moving everyone a little, instead of anyone a lot.
 *
 * Every other instrument in the diplomacy engine is bilateral: an
 * embassy, an ambassador, a sweetened offer, a sanction — all aimed at
 * one country at a time. Soft power is the one lever that is not. It
 * is spent once and it nudges every relationship in the world in the
 * same direction, by the same small amount, the way a country's
 * culture, universities and broadcasting actually do work — never
 * enough to win an argument on its own, and never absent from the
 * background of every argument either.
 */

/** What the investment actually is, this time. Flavour only — the mechanic is the same lever either way. */
export type SoftPowerChannel = 'cultural_exchange' | 'broadcasting' | 'scholarships';

export interface SoftPowerChannelTemplate {
  key: SoftPowerChannel;
  label: string;
  blurb: string;
}

export const SOFT_POWER_CHANNELS: SoftPowerChannelTemplate[] = [
  {
    key: 'cultural_exchange',
    label: 'Cultural exchange',
    blurb: 'Touring companies, festivals, an artist somebody abroad has actually heard of.',
  },
  {
    key: 'broadcasting',
    label: 'International broadcasting',
    blurb: 'A service in other languages, read as the country wants to be read rather than as it is covered elsewhere.',
  },
  {
    key: 'scholarships',
    label: 'Scholarships',
    blurb: 'Educating people who go home and remember where they studied. Slowest of the three, and the one that compounds.',
  },
];

export function findSoftPowerChannel(key: SoftPowerChannel): SoftPowerChannelTemplate {
  return SOFT_POWER_CHANNELS.find((c) => c.key === key) ?? SOFT_POWER_CHANNELS[0]!;
}
