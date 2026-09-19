/**
 * organisations.ts — the rooms where nobody is in charge.
 *
 * Real institutions, named as they are: the General Assembly, the Security
 * Council, the International Court, the WTO, NATO, the European Union and
 * the development banks. Membership is not written here — it is read off
 * `world/countries.ts`, where each state carries the list of what it
 * belongs to, so adding a country to the world puts it in the right rooms
 * without anybody editing a second file.
 *
 * The mechanic these exist for is the vote the player cannot control.
 *
 * A government can propose a resolution. It cannot pass one. Every other
 * member votes by its own interests — its alignment, its trade, its
 * relations with the proposer, its view of the question — and a government
 * that has not spent the preceding years building relationships will find
 * that being right is not sufficient and is sometimes not relevant. That is
 * what multilateralism is, and a game that let the player simply buy
 * outcomes in these rooms would be modelling something else.
 *
 * The second mechanic is the veto. Five states hold a permanent seat on the
 * Council and can stop anything on their own. Most countries are not one of
 * them, and a great deal of a middling power's foreign policy is finding
 * out what can be done without the permission of people who will not give
 * it.
 *
 * Membership costs money and constrains action. It is not a bonus.
 */

import {
  COUNTRY_TEMPLATES,
  type InstitutionKey,
} from './world/countries.ts';
import type { NationKey } from './nations.ts';

export type OrganisationKey = InstitutionKey;

export type OrganisationKind =
  | 'general_assembly'
  | 'security_council'
  | 'international_court'
  | 'trade_organisation'
  | 'defence_alliance'
  | 'economic_union'
  | 'development_bank'
  | 'forum';

export interface OrganisationTemplate {
  key: OrganisationKey;
  name: string;
  kind: OrganisationKind;
  blurb: string;
  /** What belonging actually obliges — stated, not implied. */
  obligation: string;
  /** Members who can stop anything on their own. */
  vetoHolders: NationKey[];
  /**
   * Who is in the room.
   *
   * Derived from the country table at module load rather than written
   * here, so adding a state to the world puts it in the right rooms
   * without anybody remembering to edit a second file.
   */
  members: NationKey[];
  /** USD bn a year in dues and assessed contributions, as a share of output. */
  duesShare: number;
  /** Political capital to apply for membership. */
  applicationCost: number;
  /** Relations with every member required before an application is heard. */
  entryRelations: number;
  /** What it does for a member while it is one. */
  benefit: {
    influence?: number;
    reputation?: number;
    finance?: number;
    stability?: number;
  };
  /** Whether a country can apply at all, or is only admitted by geography. */
  open: boolean;
}

/** The five permanent members, which is a fact rather than a judgement. */
const PERMANENT: NationKey[] = [
  'united_states',
  'united_kingdom',
  'france',
  'russia',
  'china',
];

const ORGANISATION_BASE: Omit<OrganisationTemplate, 'members'>[] = [
  {
    key: 'un',
    name: 'United Nations General Assembly',
    kind: 'general_assembly',
    blurb:
      'Every recognised state, one vote each, and a great deal of speaking. The only room where the largest and the smallest are formally equal.',
    obligation:
      'Dues, attendance, and a vote on every question — including the ones where abstaining costs more than either side.',
    vetoHolders: [],
    duesShare: 0.00261,
    applicationCost: 6,
    entryRelations: -100,
    benefit: { influence: 0.12, reputation: 0.04 },
    open: true,
  },
  {
    key: 'security_council',
    name: 'UN Security Council',
    kind: 'security_council',
    blurb:
      'Fifteen seats, five permanent, and a veto. Resolutions here bind in a way nothing else does, and any one of the five can stop all of it.',
    obligation:
      'A rotating seat, if elected. Resolutions bind members, and any permanent member can stop anything.',
    vetoHolders: PERMANENT,
    duesShare: 0.00457,
    applicationCost: 20,
    entryRelations: 25,
    benefit: { influence: 0.55, stability: 0.06 },
    open: false,
  },
  {
    key: 'icc',
    name: 'International Criminal Court',
    kind: 'international_court',
    blurb:
      'Tries individuals for the gravest offences, where the state of nationality will not. Several of the largest powers have never joined.',
    obligation:
      'Jurisdiction accepted in advance. Some case will eventually concern your own nationals, and the obligation does not have an exception for that.',
    vetoHolders: [],
    duesShare: 0.0013,
    applicationCost: 10,
    entryRelations: 0,
    benefit: { reputation: 0.16, stability: 0.03 },
    open: true,
  },
  {
    key: 'wto',
    name: 'World Trade Organization',
    kind: 'trade_organisation',
    blurb:
      'Sets the ceilings everybody is bound by and hears the disputes. Whoever exports most has the most to say about what the rules are.',
    obligation:
      'Bound tariff ceilings, most-favoured-nation treatment, and a dispute process whose findings you will sometimes lose.',
    vetoHolders: [],
    duesShare: 0.00196,
    applicationCost: 12,
    entryRelations: -20,
    benefit: { influence: 0.18, finance: 0 },
    open: true,
  },
  {
    key: 'nato',
    name: 'NATO',
    kind: 'defence_alliance',
    blurb:
      'An attack on one is an attack on all, which is the shortest and most consequential sentence in international law.',
    obligation:
      'Mutual defence, a spending target most members have missed for most of the alliance\u2019s history, and forces committed where the alliance decides rather than where you would.',
    vetoHolders: [],
    duesShare: 0.00717,
    applicationCost: 26,
    entryRelations: 35,
    benefit: { influence: 0.3, stability: 0.08 },
    open: true,
  },
  {
    key: 'eu',
    name: 'European Union',
    kind: 'economic_union',
    blurb:
      'A single market, a shared body of law and a budget. The deepest thing any set of states has agreed to do together, and the hardest to leave.',
    obligation:
      'Common external tariffs, free movement, a very large body of law adopted rather than negotiated, and a net contribution if you are wealthy.',
    vetoHolders: [],
    duesShare: 0.00587,
    applicationCost: 34,
    entryRelations: 45,
    benefit: { influence: 0.34, finance: 6, stability: 0.05 },
    open: true,
  },
  {
    key: 'imf',
    name: 'International Monetary Fund',
    kind: 'development_bank',
    blurb:
      'Lends to states that have run out of other options, on terms the borrower did not write. Voting weight follows the size of the contribution.',
    obligation:
      'A quota subscription, surveillance of your own economy, and published findings about it you will not always like.',
    vetoHolders: [],
    duesShare: 0.00326,
    applicationCost: 8,
    entryRelations: -30,
    benefit: { finance: 9, reputation: 0.02 },
    open: true,
  },
  {
    key: 'world_bank',
    name: 'World Bank',
    kind: 'development_bank',
    blurb:
      'Concessional lending for things that take twenty years to pay back, which is most of what actually develops a country.',
    obligation:
      'A capital subscription, and projects appraised by somebody other than your own ministry.',
    vetoHolders: [],
    duesShare: 0.00326,
    applicationCost: 8,
    entryRelations: -30,
    benefit: { finance: 13.2, reputation: 0.03 },
    open: true,
  },
  {
    key: 'g7',
    name: 'G7',
    kind: 'forum',
    blurb:
      'Seven large advanced economies and a communique. No treaty, no secretariat, and a great deal of influence for something that is not an institution at all.',
    obligation:
      'A summit a year, a shared position you helped draft and must then defend at home.',
    vetoHolders: [],
    duesShare: 0.0008,
    applicationCost: 30,
    entryRelations: 55,
    benefit: { influence: 0.26, reputation: 0.03 },
    open: false,
  },
  {
    key: 'g20',
    name: 'G20',
    kind: 'forum',
    blurb:
      'The larger room, and the only standing one where the western and eastern blocs both turn up. Agrees less and represents more.',
    obligation: 'A summit a year, and a communique that has to survive everybody in the room.',
    vetoHolders: [],
    duesShare: 0.0005,
    applicationCost: 22,
    entryRelations: 25,
    benefit: { influence: 0.22, stability: 0.02 },
    open: false,
  },
  {
    key: 'brics',
    name: 'BRICS',
    kind: 'forum',
    blurb:
      'A grouping of large economies outside the western institutions, with a development bank and a long argument about what else it is for.',
    obligation: 'A summit, a bank subscription, and a position that is read as a choice.',
    vetoHolders: [],
    duesShare: 0.0006,
    applicationCost: 20,
    entryRelations: 20,
    benefit: { influence: 0.2, finance: 5 },
    open: true,
  },
  {
    key: 'opec',
    name: 'OPEC',
    kind: 'forum',
    blurb:
      'Producers agreeing how much not to sell. It works for exactly as long as everybody holds, and somebody never does.',
    obligation: 'Production quotas set collectively, and the domestic politics of meeting them.',
    vetoHolders: [],
    duesShare: 0.0004,
    applicationCost: 16,
    entryRelations: 10,
    benefit: { influence: 0.14, finance: 4 },
    open: false,
  },
  {
    key: 'african_union',
    name: 'African Union',
    kind: 'economic_union',
    blurb:
      'Fifty-five states, a continental free trade area and a peace and security council that deploys.',
    obligation: 'Assessed contributions, and forces available to the continental mandate.',
    vetoHolders: [],
    duesShare: 0.0018,
    applicationCost: 10,
    entryRelations: 0,
    benefit: { influence: 0.16, stability: 0.04 },
    open: false,
  },
  {
    key: 'asean',
    name: 'ASEAN',
    kind: 'economic_union',
    blurb:
      'Ten states that decide by consensus and do not interfere in each other\u2019s affairs, which is both the strength and the complaint.',
    obligation: 'Consensus, non-interference, and a free trade area with long exemption lists.',
    vetoHolders: [],
    duesShare: 0.0012,
    applicationCost: 12,
    entryRelations: 15,
    benefit: { influence: 0.15, finance: 3, stability: 0.03 },
    open: false,
  },
];

/**
 * Who is in the room.
 *
 * Read off the country table rather than written here, so that adding a
 * state to the world puts it in the right rooms without anybody having to
 * remember to edit a second file — and so the two can never disagree.
 */
export function membersOfOrganisation(key: OrganisationKey): NationKey[] {
  return COUNTRY_TEMPLATES.filter(
    (c) => c.region !== 'nowhere' && c.institutions.includes(key),
  ).map((c) => c.key);
}

export const ORGANISATION_TEMPLATES: OrganisationTemplate[] = ORGANISATION_BASE.map(
  (template) => {
    const members = membersOfOrganisation(template.key);
    return {
      ...template,
      members,
      /* A veto is only a veto if you are in the room. */
      vetoHolders: template.vetoHolders.filter((h) => members.includes(h)),
    };
  },
);

/** Members who can stop anything alone, which for every body but one is nobody. */
export function vetoHoldersOf(key: OrganisationKey): NationKey[] {
  const template = findOrganisationTemplate(key);
  return template.vetoHolders.filter((holder) =>
    membersOfOrganisation(key).includes(holder),
  );
}

function findOrganisationTemplate(key: OrganisationKey): OrganisationTemplate {
  const found = ORGANISATION_TEMPLATES.find((o) => o.key === key);
  if (!found) throw new Error(`organisations: unknown organisation ${key}`);
  return found;
}

export function findOrganisation(key: OrganisationKey): OrganisationTemplate {
  const found = ORGANISATION_TEMPLATES.find((o) => o.key === key);
  if (!found) throw new Error(`organisations: unknown organisation ${key}`);
  return found;
}

/**
 * What belonging costs a country of this size, ₡bn a year.
 *
 * Assessed contributions scale with the ability to pay — that is how every
 * one of these bodies actually bills — so the figure is a share of output
 * rather than a fixed sum. It is why the same membership is a rounding
 * error for one member and a line the finance ministry argues about for
 * another.
 */
export function duesOf(key: OrganisationKey, gdp: number): number {
  return Math.round(findOrganisation(key).duesShare * gdp * 10) / 10;
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
  /**
   * Must it name a state?
   *
   * A condemnation of nobody in particular is not a resolution, it is a
   * press release. The ones that name a country are also the ones that cost
   * something to put, because the country named remembers who put it.
   */
  needsTarget?: boolean;
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
    needsTarget: true,
    title: 'Resolution of Condemnation',
    organisation: 'un',
    blurb: 'Formally deplores a named state’s conduct. Binds nobody and is remembered by everybody.',
    proposeCost: 8,
    cost: 0.0,
    favouredBy: ['institutional', 'aligned'],
    opposedBy: ['assertive', 'guarded'],
    effects: { reputation: 3, tension: 4 },
  },
  {
    kind: 'sanctions',
    needsTarget: true,
    title: 'Multilateral Sanctions',
    organisation: 'security_council',
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
    organisation: 'security_council',
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
    organisation: 'un',
    blurb: 'Relief, access and a corridor. Cheap, uncontroversial, and it saves lives.',
    proposeCost: 6,
    cost: 19.2,
    favouredBy: ['institutional', 'aligned', 'guarded', 'mercantile'],
    opposedBy: [],
    effects: { reputation: 5, approval: 0.8, tension: -3 },
  },
  {
    kind: 'investigation',
    needsTarget: true,
    title: 'International Investigation',
    organisation: 'icc',
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
    organisation: 'world_bank',
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
    organisation: 'un',
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
    organisation: 'wto',
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
  forum: 'Forum',
};
