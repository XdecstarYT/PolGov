/**
 * diplomats.ts — the mission, and who is sent to run it.
 *
 * A POSTING IS A PERSON, NOT A SETTLING CLOCK. The existing dividend an
 * ambassador earns just by being in post long enough is real and stays
 * exactly as it was. What this file adds is who that ambassador is —
 * their own skill and their own traits — as a second, independent
 * dividend layered on top, because a skilled, well-connected ambassador
 * genuinely does more with the same posting than an adequate one, and a
 * government that never bothers to notice who it sent is leaving that
 * on the table.
 *
 * A TIER IS A CHOICE ABOUT HOW MUCH THE RELATIONSHIP IS WORTH DEFENDING.
 * A consulate is a foothold — cheap, and barely slows a relationship's
 * drift. A high commission is a standing commitment, expensive to run
 * and a genuine brake on decline. Nothing about the tier improves
 * relations; exactly like the embassy it upgrades, it only slows how
 * fast they get worse.
 */

/** How substantial the mission is. */
export type EmbassyTier = 'consulate' | 'standard' | 'high_commission';

export interface EmbassyTierTemplate {
  key: EmbassyTier;
  label: string;
  blurb: string;
  /** Multiplies the embassy's own stabilising effect on relations drift. */
  stabiliserMultiplier: number;
  /** What upgrading TO this tier costs, one-off. */
  upgradeCost: number;
}

export const EMBASSY_TIERS: EmbassyTierTemplate[] = [
  {
    key: 'consulate',
    label: 'Consulate',
    blurb: 'A foothold. Barely slows the drift, and costs almost nothing to keep.',
    stabiliserMultiplier: 0.5,
    upgradeCost: 2,
  },
  {
    key: 'standard',
    label: 'Standard mission',
    blurb: 'What an embassy ordinarily is. The baseline everything else is measured against.',
    stabiliserMultiplier: 1,
    upgradeCost: 0,
  },
  {
    key: 'high_commission',
    label: 'High commission',
    blurb: 'A standing commitment. Expensive, and a genuine brake on a relationship going bad.',
    stabiliserMultiplier: 1.8,
    upgradeCost: 6,
  },
];

export function findEmbassyTier(key: EmbassyTier): EmbassyTierTemplate {
  return EMBASSY_TIERS.find((t) => t.key === key) ?? EMBASSY_TIERS[1]!;
}

/** What kind of ambassador got sent. */
export type DiplomatTrait = 'connected' | 'blunt' | 'meticulous' | 'charming';

export interface DiplomatTraitTemplate {
  key: DiplomatTrait;
  label: string;
  blurb: string;
  /** Added to the ambassador's own dividend, per month settled. */
  dividendBonus: number;
}

export const DIPLOMAT_TRAITS: DiplomatTraitTemplate[] = [
  {
    key: 'connected',
    label: 'Connected',
    blurb: 'Knows everybody worth knowing in the host capital already.',
    dividendBonus: 0.05,
  },
  {
    key: 'blunt',
    label: 'Blunt',
    blurb: 'Says what the government actually thinks. Refreshing, sometimes, and sometimes not.',
    dividendBonus: -0.02,
  },
  {
    key: 'meticulous',
    label: 'Meticulous',
    blurb: 'Every cable is exact. Nothing is ever misread because of how it was phrased.',
    dividendBonus: 0.03,
  },
  {
    key: 'charming',
    label: 'Charming',
    blurb: 'Liked at every reception. It adds up.',
    dividendBonus: 0.04,
  },
];

export function findDiplomatTrait(key: DiplomatTrait): DiplomatTraitTemplate {
  return DIPLOMAT_TRAITS.find((t) => t.key === key) ?? DIPLOMAT_TRAITS[0]!;
}
