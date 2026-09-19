/**
 * organisations.ts — the rooms where nobody is in charge.
 *
 * Every other system in this engine answers to the player in the end. The
 * chamber can be whipped, the cabinet can be reshuffled, the budget can be
 * bought through. This one cannot: a resolution is put, and then twelve
 * other governments vote their own interests, and the player watches.
 *
 * Three things make that a mechanic rather than a dice roll.
 *
 *   THE VOTE IS EXPLAINED. Every nation's vote comes back with the reason
 *   for it — its posture, what it is owed, what it fears. A player who
 *   loses a vote can read exactly which relationships they did not build,
 *   which is the only way losing teaches anything.
 *
 *   BEING RIGHT IS NOT SUFFICIENT. Posture decides the starting position and
 *   relations move it. A country that has spent four years being correct and
 *   friendless loses votes it deserves to win, and that is not the engine
 *   being unfair; it is the engine being about diplomacy.
 *
 *   SOMEBODY ELSE HOLDS THE VETO. Three permanent members can stop anything
 *   in the Council on their own, and Verdana is not one of them. Much of a
 *   middling country's foreign policy is working out what can be done
 *   without the permission of people who will not give it.
 *
 * Membership is not a bonus. It costs dues every year and it binds.
 */

import {
  ORGANISATION_TEMPLATES,
  findOrganisation,
  type OrganisationKey,
  type OrganisationTemplate,
  type ResolutionTemplate,
} from '../content/organisations.ts';
import { NATION_TEMPLATES, findNation, type NationKey } from '../content/nations.ts';
import { TURNS_PER_YEAR } from '../balance.ts';
import type { Rng } from '../rng.ts';
import type { OrganisationState, Resolution, World } from '../types.ts';

/* ------------------------------------------------------------------ *
 * Membership
 * ------------------------------------------------------------------ */

export function buildOrganisations(): OrganisationState[] {
  return ORGANISATION_TEMPLATES.map((template) => ({
    key: template.key,
    member: template.memberAtStart,
    /* Somebody signed these before the player was born. */
    joinedTurn: template.memberAtStart ? 0 : null,
    suspended: false,
    standing: template.memberAtStart ? 55 : 0,
  }));
}

export function findMembership(
  organisations: readonly OrganisationState[],
  key: OrganisationKey,
): OrganisationState {
  const found = organisations.find((o) => o.key === key);
  if (!found) throw new Error(`organisations: no state for ${key}`);
  return found;
}

export function isMember(organisations: readonly OrganisationState[], key: OrganisationKey): boolean {
  const state = organisations.find((o) => o.key === key);
  return Boolean(state?.member && !state.suspended);
}

/** Dues across every body the country belongs to, ₡bn a year. */
export function duesTotal(organisations: readonly OrganisationState[]): number {
  return organisations
    .filter((o) => o.member)
    .reduce((sum, o) => sum + findOrganisation(o.key).dues, 0);
}

/**
 * Whether an application would even be heard.
 *
 * Not a threshold on average goodwill — on the worst relationship in the
 * room. Admission is by consent of the members, so the member who dislikes
 * you most is the one who decides, and a country cannot buy its way past
 * that with friends elsewhere.
 */
export function admissionCheck(
  template: OrganisationTemplate,
  world: World,
): { admissible: boolean; blocker: NationKey | null; worst: number } {
  let blocker: NationKey | null = null;
  let worst = 100;

  for (const key of template.members) {
    const nation = world.nations.find((n) => n.key === key);
    if (!nation) continue;
    if (nation.relations < worst) {
      worst = nation.relations;
      blocker = key;
    }
  }

  return { admissible: worst >= template.entryRelations, blocker, worst };
}

/* ------------------------------------------------------------------ *
 * What belonging does
 * ------------------------------------------------------------------ */

export interface OrganisationTick {
  influence: number;
  reputation: number;
  /** Points of tension taken out of the world this turn. */
  stability: number;
  /** Concessional finance available, ₡bn a year. */
  finance: number;
  /** Dues payable, ₡bn this turn. */
  dues: number;
}

/**
 * One turn of membership.
 *
 * The benefits are small and the dues are not, which is the honest shape of
 * it: belonging to these bodies is a long position. A government that joins
 * one to fix this year's problem has misunderstood what it bought.
 */
export function stepOrganisations(organisations: readonly OrganisationState[]): OrganisationTick {
  const tick: OrganisationTick = {
    influence: 0,
    reputation: 0,
    stability: 0,
    finance: 0,
    dues: 0,
  };

  for (const state of organisations) {
    if (!state.member) continue;
    const template = findOrganisation(state.key);
    tick.dues += template.dues / TURNS_PER_YEAR;
    if (state.suspended) continue;

    /* A member in poor standing gets the obligations and less of the rest. */
    const weight = 0.4 + (state.standing / 100) * 0.6;
    tick.influence += (template.benefit.influence ?? 0) * weight;
    tick.reputation += (template.benefit.reputation ?? 0) * weight;
    tick.stability += (template.benefit.stability ?? 0) * weight;
    tick.finance += (template.benefit.finance ?? 0) * weight;
  }

  return tick;
}

/* ------------------------------------------------------------------ *
 * The vote
 * ------------------------------------------------------------------ */

export type Vote = 'for' | 'against' | 'abstain';

export interface NationVote {
  nation: NationKey;
  vote: Vote;
  /** The reason, in the country's own terms. */
  why: string;
  /** Can this one stop it alone? */
  veto: boolean;
}

export interface ResolutionOutcome {
  for: number;
  against: number;
  abstain: number;
  passed: boolean;
  /** Who stopped it, if anybody could and did. */
  vetoedBy: NationKey | null;
  votes: NationVote[];
  /** The share of votes cast that was needed, for the report. */
  threshold: number;
  /** How many governments had to have an opinion for it to count at all. */
  quorum: number;
}

/**
 * Was the room even interested?
 *
 * Abstentions are not votes — that is real practice, and it is why a
 * resolution can carry two-to-nothing with ten countries looking at the
 * ceiling. A game that allowed that would hand the player a free win for
 * tabling something anodyne, so a resolution also needs a third of the room
 * to have an opinion at all. Indifference is a result.
 */
function quorumFor(template: OrganisationTemplate): number {
  return Math.ceil(template.members.length / 3);
}

/** What share of those voting a resolution needs in each kind of room. */
function thresholdFor(template: OrganisationTemplate): number {
  switch (template.kind) {
    /* An assembly resolution carries weight precisely because it is hard. */
    case 'general_assembly':
      return 2 / 3;
    /* The council's arithmetic is easy. Its veto is not. */
    case 'security_council':
      return 0.5;
    default:
      return 0.5;
  }
}

/**
 * How one government decides.
 *
 * Posture first, because a country's disposition toward a question is not
 * negotiable in the week of the vote. Then relations, which is everything
 * the player has done for four years arriving at once. Then the standing of
 * the government proposing it, because a reputation for keeping agreements
 * is what makes a proposal worth supporting when it is inconvenient.
 */
export function leanOf(
  nation: NationKey,
  template: ResolutionTemplate,
  world: World,
  target: NationKey | null,
): { lean: number; why: string } {
  const state = world.nations.find((n) => n.key === nation);
  const relations = state?.relations ?? 0;
  /* The posture it has now, not the one it was written with. A government
     removed overnight votes differently the following week. */
  const base = findNation(nation);
  const country = { ...base, posture: state?.posture ?? base.posture };

  let lean = 0;
  const reasons: string[] = [];

  if (template.favouredBy.includes(country.posture)) {
    lean += 14;
    reasons.push('disposed toward it');
  }
  if (template.opposedBy.includes(country.posture)) {
    lean -= 16;
    reasons.push('opposed in principle');
  }

  /* Four years of diplomacy, arriving at once. */
  const fromRelations = relations / 5;
  lean += fromRelations;
  if (Math.abs(fromRelations) >= 4) {
    reasons.push(relations > 0 ? 'friendly to Verdana' : 'has no reason to help Verdana');
  }

  /* A government believed to keep its word is worth supporting. */
  lean += (world.reputation - 50) / 8;
  lean += (world.influence - 50) / 12;

  /* Nobody votes to condemn themselves, and their friends do not either. */
  if (target && nation === target) {
    lean -= 60;
    reasons.push('it is about them');
  } else if (target) {
    const them = findNation(target);
    if (them.bloc !== 'unaligned' && them.bloc === country.bloc) {
      lean -= 18;
      reasons.push(`will not break with ${them.name}`);
    }
  }

  /* A country that trades with us has a reason to keep us content. */
  lean += (state?.tradeDependence ?? 0) * 12;

  /* And a dangerous world makes everybody more careful, in both directions:
     the institutional want the resolution, the assertive want a free hand. */
  const tension = (world.tension - 40) / 10;
  lean += template.effects.tension && template.effects.tension < 0 ? tension : -tension;

  if (reasons.length === 0) reasons.push('sees no interest either way');
  return { lean, why: reasons.join('; ') };
}

/**
 * Put it, and see.
 *
 * The player cannot whip this. They can only have spent the preceding years
 * in a way that makes the room willing.
 */
export function voteOnResolution(
  template: ResolutionTemplate,
  world: World,
  target: NationKey | null,
  rng: Rng,
): ResolutionOutcome {
  const organisation = findOrganisation(template.organisation);
  const votes: NationVote[] = [];

  let ayes = 0;
  let noes = 0;
  let abstentions = 0;
  let vetoedBy: NationKey | null = null;

  for (const key of organisation.members) {
    const nation = world.nations.find((n) => n.key === key);
    /* A state we do not recognise is not in the room for us. */
    if (nation && !nation.recognised) continue;

    const { lean, why } = leanOf(key, template, world, target);
    /* Governments are not functions. The same room on a different day
       produces a different answer, and a vote inside ten points is one
       nobody should have been confident about. */
    const jittered = lean + (rng.next() + rng.next() - 1) * 9;

    const vote: Vote = jittered > 5 ? 'for' : jittered < -5 ? 'against' : 'abstain';
    const veto = organisation.vetoHolders.includes(key);

    if (vote === 'for') ayes += 1;
    else if (vote === 'against') noes += 1;
    else abstentions += 1;

    if (vote === 'against' && veto && vetoedBy === null) vetoedBy = key;

    votes.push({ nation: key, vote, why, veto });
  }

  return tally(organisation, ayes, noes, abstentions, vetoedBy, votes);
}

/** The arithmetic, in one place, so the estimate and the vote agree. */
function tally(
  organisation: OrganisationTemplate,
  ayes: number,
  noes: number,
  abstentions: number,
  vetoedBy: NationKey | null,
  votes: NationVote[],
): ResolutionOutcome {
  const cast = ayes + noes;
  const threshold = thresholdFor(organisation);
  const carried =
    cast >= quorumFor(organisation) && cast > 0 && ayes / cast >= threshold;

  return {
    for: ayes,
    against: noes,
    abstain: abstentions,
    passed: carried && vetoedBy === null,
    vetoedBy,
    votes,
    threshold,
    quorum: quorumFor(organisation),
  };
}

/**
 * What the room thought, before it is asked.
 *
 * A foreign ministry counts the votes before putting a resolution, the same
 * way a whip counts the chamber, and is wrong for the same reasons. This is
 * the count without the jitter.
 */
export function countTheRoom(
  template: ResolutionTemplate,
  world: World,
  target: NationKey | null,
): ResolutionOutcome {
  const organisation = findOrganisation(template.organisation);
  const votes: NationVote[] = [];
  let ayes = 0;
  let noes = 0;
  let abstentions = 0;
  let vetoedBy: NationKey | null = null;

  for (const key of organisation.members) {
    const nation = world.nations.find((n) => n.key === key);
    if (nation && !nation.recognised) continue;

    const { lean, why } = leanOf(key, template, world, target);
    const vote: Vote = lean > 5 ? 'for' : lean < -5 ? 'against' : 'abstain';
    const veto = organisation.vetoHolders.includes(key);

    if (vote === 'for') ayes += 1;
    else if (vote === 'against') noes += 1;
    else abstentions += 1;
    if (vote === 'against' && veto && vetoedBy === null) vetoedBy = key;

    votes.push({ nation: key, vote, why, veto });
  }

  return tally(organisation, ayes, noes, abstentions, vetoedBy, votes);
}

/** A one-line account of where a resolution stands. */
export function describeOutcome(outcome: ResolutionOutcome): string {
  if (outcome.vetoedBy) {
    return `${findNation(outcome.vetoedBy).name} used the veto. The arithmetic was never the point.`;
  }
  if (outcome.passed) {
    return `Carried, ${outcome.for} to ${outcome.against}, with ${outcome.abstain} abstaining.`;
  }
  const cast = outcome.for + outcome.against;
  if (cast < outcome.quorum) {
    return `${outcome.abstain} governments abstained. The room declined to have an opinion, which is an answer.`;
  }
  if (cast > 0 && outcome.for > outcome.against) {
    return `A majority for it — ${outcome.for} to ${outcome.against} — and not the ${Math.round(outcome.threshold * 100)}% this room requires.`;
  }
  return `Lost, ${outcome.against} to ${outcome.for}, with ${outcome.abstain} abstaining.`;
}

/** Resolutions still on the record, most recent first. */
export function recentResolutions(resolutions: readonly Resolution[], limit = 6): Resolution[] {
  return [...resolutions].sort((a, b) => b.turn - a.turn).slice(0, limit);
}

/** Every nation that is in a given room, for the UI. */
export function membersOf(key: OrganisationKey): NationKey[] {
  return findOrganisation(key).members.filter((k) =>
    NATION_TEMPLATES.some((n) => n.key === k),
  );
}
