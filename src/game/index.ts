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
export * from './systems/coalition.ts';
export * from './systems/election.ts';
export * from './systems/electorate.ts';
export * from './systems/electoralSystems.ts';
export * from './systems/districts.ts';
export * from './systems/partyInternals.ts';
export * from './systems/eventEngine.ts';
export * from './systems/legacy.ts';
export * from './systems/legislature.ts';

export { BILL_TEMPLATES, BILL_CATEGORY_LABELS } from './content/bills.ts';
export { EVENT_TEMPLATES, EVENT_CATEGORY_LABELS } from './content/events.ts';
export { PARTY_TEMPLATES, PLAYER_COLORS } from './content/parties.ts';
export { REGION_TEMPLATES } from './content/regions.ts';
export { FACTION_TEMPLATES, factionPosition } from './content/factions.ts';
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
