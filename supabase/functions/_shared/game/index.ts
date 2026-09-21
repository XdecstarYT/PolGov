/**
 * index.ts — the engine's public surface.
 *
 * Everything the client and the edge functions need, in one import. The engine
 * has no platform dependencies: no DOM, no fetch, no Supabase. That is what
 * lets `resolve-turn` run precisely the same code the browser ran.
 */

export * from './types.ts';
export * from './balance.ts';
export * from './rng.ts';
export * from './ideology.ts';
export * from './setup.ts';
export * from './turn.ts';

export * from './systems/approval.ts';
export * from './systems/budget.ts';
export * from './systems/economy.ts';
export * from './systems/publicFinance.ts';
export * from './systems/taxation.ts';
export * from './content/taxes.ts';
export * from './systems/industry.ts';
export * from './content/industries.ts';
export * from './systems/demography.ts';
export * from './systems/coalition.ts';
export * from './systems/infrastructure.ts';
export * from './content/infrastructure.ts';
export * from './systems/services.ts';
export * from './content/services.ts';
export * from './systems/diplomacy.ts';
export * from './content/nations.ts';
export * from './content/world/politics.ts';
export * from './content/world/generate.ts';
export * from './systems/election.ts';
export * from './systems/electorate.ts';
export * from './systems/electoralSystems.ts';
export * from './systems/districts.ts';
export * from './systems/partyInternals.ts';
export * from './systems/parliament.ts';
export * from './systems/policy.ts';
export * from './systems/drafting.ts';
export * from './systems/personas.ts';
export * from './content/personas.ts';
export * from './systems/media.ts';
export * from './systems/eventEngine.ts';
export * from './systems/legacy.ts';
export * from './systems/legislature.ts';
export * from './systems/budgetProcess.ts';
export * from './systems/organisations.ts';
export * from './content/organisations.ts';
export * from './systems/trade.ts';
export * from './systems/military.ts';
export * from './systems/society.ts';
export * from './systems/living.ts';
export * from './systems/culture.ts';
export * from './systems/opinion.ts';
export * from './systems/problems.ts';
export * from './systems/generations.ts';
export * from './systems/movements.ts';
export * from './content/movements.ts';
export * from './systems/manpower.ts';
export * from './content/manpower.ts';
export * from './systems/orbat.ts';
export * from './content/orbat.ts';
export * from './systems/theatre.ts';
export * from './content/theatre.ts';
export * from './systems/cabinet.ts';
export * from './content/cabinet.ts';
export * from './systems/justice.ts';
export * from './content/justice.ts';
export * from './systems/integrity.ts';
export * from './content/integrity.ts';
export * from './systems/stateCapacity.ts';
export * from './content/emergency.ts';
export * from './systems/press.ts';
export * from './content/press.ts';
export * from './systems/communications.ts';
export * from './content/communications.ts';
export * from './systems/scandal.ts';
export * from './content/scandal.ts';
export * from './systems/diplomats.ts';
export * from './content/diplomats.ts';
export * from './systems/grievances.ts';
export * from './content/grievances.ts';
export * from './systems/negotiation.ts';
export * from './systems/sanctions.ts';
export * from './systems/softPower.ts';
export * from './content/softPower.ts';
export * from './systems/timeline.ts';
export * from './systems/peace.ts';
export * from './content/peace.ts';
export * from './systems/doctrine.ts';
export * from './content/doctrine.ts';
export * from './systems/logistics.ts';
export * from './systems/warEconomy.ts';
export * from './content/logistics.ts';
export * from './systems/naval.ts';
export * from './content/naval.ts';
export * from './systems/air.ts';
export * from './content/air.ts';
export * from './content/problems.ts';
export * from './content/trust.ts';
export * from './content/culture.ts';
export * from './content/access.ts';
export * from './content/classes.ts';
export * from './systems/conflict.ts';
export * from './content/forces.ts';
export * from './systems/intelligence.ts';
export * from './content/intelligence.ts';
export * from './systems/worldSim.ts';
export * from './migrate.ts';
export * from './content/globalEvents.ts';

export { BILL_TEMPLATES, BILL_CATEGORY_LABELS } from './content/bills.ts';
export { EVENT_TEMPLATES, EVENT_CATEGORY_LABELS } from './content/events.ts';
export { PARTY_TEMPLATES, PLAYER_EMBLEMS, PLAYER_INK } from './content/parties.ts';
export { REGION_TEMPLATES } from './content/regions.ts';
export { FACTION_TEMPLATES, factionPosition } from './content/factions.ts';
export { REFERENDUM_TEMPLATES } from './content/referendums.ts';
export { CHANNEL_TEMPLATES, channelTemplate } from './content/channels.ts';
export type { ChannelKey, ChannelTemplate } from './content/channels.ts';
export type { ReferendumTemplate } from './content/referendums.ts';
export type { FactionTemplate } from './content/factions.ts';
export {
  ISSUE_KEYS,
  ISSUE_LABELS,
  SEGMENT_KEYS,
  SEGMENT_TEMPLATES,
  segmentTemplate,
} from './content/segments.ts';
export type { IssueKey, SegmentKey, SegmentTemplate } from './content/segments.ts';
export { OUTLETS, generateNews } from './content/news.ts';
