/**
 * organisations.ts — the rooms where nobody is in charge.
 *
 * The mechanic these exist for is the vote you cannot control.
 *
 * A player can propose a resolution. They cannot pass it. Every other member
 * votes by its own interests — its bloc, its trade, its relations with the
 * proposer, its view of the question — and a government that has not spent
 * the preceding years building relationships will find that being right is
 * not sufficient and is sometimes not even relevant. That is what
 * multilateralism is, and a game that let the player simply buy outcomes in
 * these rooms would be modelling something else.
 *
 * The second mechanic is the veto. One member of the Council can stop
 * anything, and Verdana is not one of them. A great deal of a middling
 * country's foreign policy is finding out what can be done without the
 * permission of people who will not give it.
 *
 * Membership costs money and constrains action. It is not a bonus.
 */

import type { NationKey } from './nations.ts';

export type OrganisationKey =
  | 'assembly'
  | 'council'
  | 'court'
  | 'trade_body'
  | 'northern_pact'
  | 'meridian_union'
  | 'development_bank';

export type OrganisationKind =
  | 'general_assembly'
  | 'security_council'
  | 'international_court'
  | 'trade_organisation'
  | 'defence_alliance'
  | 'economic_union'
  | 'development_bank';

export interface OrganisationTemplate {
  key: OrganisationKey;
  name: string;
  kind: OrganisationKind;
  blurb: string;
  /** What belonging actually obliges — stated, not implied. */
  obligation: string;
  /** Founding members other than Verdana. */
  members: NationKey[];
  /** Members who can stop anything on their own. */
  vetoHolders: NationKey[];
  /** Does Verdana begin inside it? */
  memberAtStart: boolean;
  /** ₡bn a year in dues. */
  dues: number;
  /** Political capital to apply for membership. */
  applicationCost: number;
  /** Relations with every member required before an application is heard. */
  entryRelations: number;
  /** What it does for the country while it is a member. */
  benefit: {
    /** Points of influence a month. */
    influence?: number;
    /** Points of reputation a month. */
    reputation?: number;
    /** ₡bn a year of concessional finance. */
    finance?: number;
    /** Points of tension it takes out of the world a month. */
    stability?: number;
  };
}

export const ORGANISATION_TEMPLATES: OrganisationTemplate[] = [
  {
    key: 'assembly',
    name: 'Assembly of States',
    kind: 'general_assembly',
    blurb:
      'Every recognised state, one vote each, and a great deal of speaking. The only room where Holm and Astrun are formally equal.',
    obligation:
      'Attendance, dues, and a vote on every question — including the ones where abstaining costs more than either side.',
    members: [
      'astrun',
      'belhaven',
      'corvane',
      'dunmarch',
      'ehlas',
      'fenwick',
      'garda',
      'holm',
      'iskerry',
      'jorvik',
      'kestran',
      'lorne',
    ],
    vetoHolders: [],
    memberAtStart: true,
    dues: 9.6,
    applicationCost: 6,
    entryRelations: -100,
    benefit: { influence: 0.12, reputation: 0.04 },
  },
  {
    key: 'council',
    name: 'Standing Council',
    kind: 'security_council',
    blurb:
      'Fifteen seats, four permanent, and a veto. Verdana has never held one of the four and is unlikely to.',
    obligation:
      'A rotating seat, if elected. Resolutions bind members, and any permanent member can stop anything.',
    members: ['astrun', 'ehlas', 'kestran', 'jorvik', 'belhaven', 'dunmarch'],
    vetoHolders: ['astrun', 'ehlas', 'kestran'],
    memberAtStart: false,
    dues: 16.8,
    applicationCost: 20,
    entryRelations: 25,
    benefit: { influence: 0.55, stability: 0.06 },
  },
  {
    key: 'court',
    name: 'International Court',
    kind: 'international_court',
    blurb:
      'Adjudicates disputes between states that have agreed in advance to be bound by the answer.',
    obligation:
      'Jurisdiction accepted in advance. You will lose a case at some point and will have to comply anyway.',
    members: ['dunmarch', 'jorvik', 'holm', 'belhaven', 'lorne', 'fenwick'],
    vetoHolders: [],
    memberAtStart: true,
    dues: 4.8,
    applicationCost: 10,
    entryRelations: 0,
    benefit: { reputation: 0.16, stability: 0.03 },
  },
  {
    key: 'trade_body',
    name: 'Commercial Convention',
    kind: 'trade_organisation',
    blurb:
      'Sets the rules on tariffs and settles the arguments about them. Membership is mostly about the arguments.',
    obligation:
      'Tariff ceilings, notified changes, and a dispute procedure you do not control the timing of.',
    members: ['astrun', 'belhaven', 'dunmarch', 'fenwick', 'jorvik', 'kestran', 'holm'],
    vetoHolders: [],
    memberAtStart: true,
    dues: 7.2,
    applicationCost: 12,
    entryRelations: 10,
    benefit: { influence: 0.18, finance: 4.8 },
  },
  {
    key: 'northern_pact',
    name: 'Northern Pact',
    kind: 'defence_alliance',
    blurb:
      'Collective defence among the northern states. Joining is a decision about who your enemies are.',
    obligation:
      'An attack on any member is an attack on all. Also: their quarrels become your agenda, permanently.',
    members: ['astrun', 'belhaven', 'dunmarch', 'holm'],
    vetoHolders: ['astrun'],
    memberAtStart: false,
    dues: 26.4,
    applicationCost: 24,
    entryRelations: 45,
    benefit: { influence: 0.35, stability: 0.1 },
  },
  {
    key: 'meridian_union',
    name: 'Meridian Economic Union',
    kind: 'economic_union',
    blurb:
      'A customs union with a common external tariff and a standing argument about who sets it.',
    obligation:
      'A common external tariff you no longer set alone, and rules you did not write on most of what you make.',
    members: ['jorvik', 'lorne', 'fenwick', 'iskerry'],
    vetoHolders: [],
    memberAtStart: false,
    dues: 21.6,
    applicationCost: 20,
    entryRelations: 30,
    benefit: { finance: 19.2, influence: 0.14 },
  },
  {
    key: 'development_bank',
    name: 'Development Bank',
    kind: 'development_bank',
    blurb:
      'Lends to members below the market rate, on conditions the borrower does not set.',
    obligation:
      'Paid-in capital, and conditions attached to anything you borrow. The conditions are the point.',
    members: ['astrun', 'dunmarch', 'jorvik', 'garda', 'iskerry', 'lorne'],
    vetoHolders: [],
    memberAtStart: true,
    dues: 12.0,
    applicationCost: 8,
    entryRelations: 0,
    benefit: { finance: 13.2, reputation: 0.03 },
  },
];

export function findOrganisation(key: OrganisationKey): OrganisationTemplate {
  const found = ORGANISATION_TEMPLATES.find((o) => o.key === key);
  if (!found) throw new Error(`organisations: unknown organisation ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Resolutions
 * ------------------------------------------------------------------ */

export type ResolutionKind =
  | 'condemnation'
  | 'sanctions'
  | 'peacekeeping'
  | 'humanitarian'
  | 'investigation'
  | 'aid'
  | 'climate'
  | 'trade_rules';

export interface ResolutionTemplate {
  kind: ResolutionKind;
  title: string;
  /** Which body hears it. */
  organisation: OrganisationKey;
  /** What it does, in one line, without an opinion about whether it is good. */
  blurb: string;
  /** Political capital to put it on the agenda. */
  proposeCost: number;
  /** ₡bn a year it costs the country if it passes. */
  cost: number;
  /**
   * Which nations are naturally for it, by posture.
   *
   * Countries vote their interests, not the merits. A player who has not
   * spent years building relationships will find that being right is not
   * sufficient and is sometimes not relevant.
   */
  favouredBy: string[];
  opposedBy: string[];
  /** What passing it does. */
  effects: {
    reputation?: number;
    influence?: number;
    tension?: number;
    approval?: number;
  };
}

export const RESOLUTION_TEMPLATES: ResolutionTemplate[] = [
  {
    kind: 'condemnation',
    title: 'Resolution of Condemnation',
    organisation: 'assembly',
    blurb: 'Formally deplores a named state’s conduct. Binds nobody and is remembered by everybody.',
    proposeCost: 8,
    cost: 0.0,
    favouredBy: ['institutional', 'aligned'],
    opposedBy: ['assertive', 'guarded'],
    effects: { reputation: 3, tension: 4 },
  },
  {
    kind: 'sanctions',
    title: 'Multilateral Sanctions',
    organisation: 'council',
    blurb: 'Collective economic measures. They work only if everyone holds, and somebody never does.',
    proposeCost: 16,
    cost: 28.8,
    favouredBy: ['institutional', 'aligned'],
    opposedBy: ['mercantile', 'assertive', 'volatile'],
    effects: { influence: 4, tension: 8 },
  },
  {
    kind: 'peacekeeping',
    title: 'Peacekeeping Mandate',
    organisation: 'council',
    blurb: 'Authorises a force to stand between two parties who have agreed to let it.',
    proposeCost: 18,
    cost: 45.6,
    favouredBy: ['institutional', 'aligned', 'guarded'],
    opposedBy: ['assertive'],
    effects: { reputation: 6, influence: 5, tension: -12 },
  },
  {
    kind: 'humanitarian',
    title: 'Humanitarian Mission',
    organisation: 'assembly',
    blurb: 'Relief, access and a corridor. Cheap, uncontroversial, and it saves lives.',
    proposeCost: 6,
    cost: 19.2,
    favouredBy: ['institutional', 'aligned', 'guarded', 'mercantile'],
    opposedBy: [],
    effects: { reputation: 5, approval: 0.8, tension: -3 },
  },
  {
    kind: 'investigation',
    title: 'International Investigation',
    organisation: 'court',
    blurb: 'An independent inquiry with a published finding nobody can pre-agree to.',
    proposeCost: 10,
    cost: 7.2,
    favouredBy: ['institutional'],
    opposedBy: ['assertive', 'volatile', 'guarded'],
    effects: { reputation: 4, tension: 5 },
  },
  {
    kind: 'aid',
    title: 'Development Programme',
    organisation: 'development_bank',
    blurb: 'Concessional lending to states that need it, on terms they did not set.',
    proposeCost: 8,
    cost: 33.6,
    favouredBy: ['institutional', 'aligned', 'volatile'],
    opposedBy: ['mercantile'],
    effects: { reputation: 5, influence: 3, tension: -4 },
  },
  {
    kind: 'climate',
    title: 'Emissions Convention',
    organisation: 'assembly',
    blurb: 'Binding targets, reported annually. The argument is never about the science.',
    proposeCost: 14,
    cost: 22.8,
    favouredBy: ['institutional', 'aligned'],
    opposedBy: ['mercantile', 'assertive'],
    effects: { reputation: 7, influence: 3 },
  },
  {
    kind: 'trade_rules',
    title: 'Revision of Trade Rules',
    organisation: 'trade_body',
    blurb: 'Changes the ceilings everyone is bound by. Whoever exports most has the most to say.',
    proposeCost: 12,
    cost: 0.0,
    favouredBy: ['mercantile', 'institutional'],
    opposedBy: ['guarded', 'volatile'],
    effects: { influence: 6 },
  },
];

export const ORGANISATION_KIND_LABELS: Record<OrganisationKind, string> = {
  general_assembly: 'General assembly',
  security_council: 'Security council',
  international_court: 'International court',
  trade_organisation: 'Trade organisation',
  defence_alliance: 'Defence alliance',
  economic_union: 'Economic union',
  development_bank: 'Development bank',
};
