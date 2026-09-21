/**
 * integrity.ts — the body of law, and what keeps power honest.
 *
 * CORRUPTION IS NOT ONE DEPARTMENT'S PROBLEM. Policing has its own
 * corruption index because a beat officer taking money is a different
 * failure from a minister steering a contract to a donor — but both draw
 * on the same well: how much oversight exists, how easy patronage is to
 * hide, and what happens to the people who report it. This file is the
 * well.
 *
 * TRANSPARENCY IS A CHOICE WITH A PRICE ATTACHED. An open regime — real
 * freedom of information, a funded auditor-general, a whistleblower
 * regime with teeth — makes corruption hard to hide and also hands
 * every mistake to the opposition and the press. A closed regime is
 * comfortable and rots from the inside on a clock nobody can see until
 * the story breaks.
 *
 * LAW ACCUMULATES. Every bill that passes adds to a stock of statute and
 * regulation that is never reviewed as a whole, only added to — and
 * regulatory stock is itself a governance-quality drag: a country that
 * can no longer explain its own rulebook cannot administer it evenly,
 * which is where a great deal of ordinary, unglamorous corruption
 * actually lives.
 */

/** How open the state is to being checked. */
export type TransparencyRegime = 'closed' | 'limited' | 'open';

export interface TransparencyTemplate {
  key: TransparencyRegime;
  label: string;
  blurb: string;
  /** Downward pull on the corruption index. */
  corruptionCheck: number;
  /** What operating in the open costs in political cover for ordinary mistakes. */
  exposureCost: number;
}

export const TRANSPARENCY_REGIMES: TransparencyTemplate[] = [
  {
    key: 'closed',
    label: 'Closed',
    blurb:
      'Cabinet papers stay cabinet papers. Comfortable for as long as nothing leaks, and everything eventually leaks.',
    corruptionCheck: 0.1,
    exposureCost: 0.05,
  },
  {
    key: 'limited',
    label: 'Limited disclosure',
    blurb: 'A freedom-of-information regime with enough exemptions to matter. What most governments actually run.',
    corruptionCheck: 0.45,
    exposureCost: 0.3,
  },
  {
    key: 'open',
    label: 'Open by default',
    blurb:
      'Contracts, expenses and minutes published as routine. Makes corruption hard to hide and hands the opposition every ordinary mistake as well as every real one.',
    corruptionCheck: 0.85,
    exposureCost: 0.65,
  },
];

export function findTransparency(key: TransparencyRegime): TransparencyTemplate {
  return TRANSPARENCY_REGIMES.find((t) => t.key === key) ?? TRANSPARENCY_REGIMES[1]!;
}

/** How independent and resourced the anti-corruption machinery is. */
export type AnticorruptionPosture = 'none' | 'nominal' | 'independent';

export interface AnticorruptionTemplate {
  key: AnticorruptionPosture;
  label: string;
  blurb: string;
  /** Downward pull on the corruption index, on top of transparency. */
  corruptionCheck: number;
  /** Ongoing running cost, in the same weekly PC terms as everything else on the desk. */
  upkeep: number;
}

export const ANTICORRUPTION_POSTURES: AnticorruptionTemplate[] = [
  {
    key: 'none',
    label: 'No standing body',
    blurb: 'Corruption is handled, when it is handled, by whichever department it turns up in.',
    corruptionCheck: 0,
    upkeep: 0,
  },
  {
    key: 'nominal',
    label: 'A nominal commission',
    blurb: 'Exists, reports annually, and answers to the government it is meant to be checking.',
    corruptionCheck: 0.35,
    upkeep: 1,
  },
  {
    key: 'independent',
    label: 'An independent commission',
    blurb:
      'Its own budget line, its own subpoena power, and no obligation to be liked by the people it investigates — including, on a bad week, this government.',
    corruptionCheck: 0.75,
    upkeep: 3,
  },
];

export function findAnticorruption(key: AnticorruptionPosture): AnticorruptionTemplate {
  return ANTICORRUPTION_POSTURES.find((t) => t.key === key) ?? ANTICORRUPTION_POSTURES[0]!;
}
