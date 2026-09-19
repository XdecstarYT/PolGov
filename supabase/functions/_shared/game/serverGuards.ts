/**
 * serverGuards.ts — the checks that make server authority real.
 *
 * These live in the engine rather than inside the edge function so they can be
 * unit-tested in CI alongside the rest of the rules. `resolve-turn` imports
 * them; nothing in the client depends on them, but the client bundles them
 * harmlessly and they are the same code the server runs.
 */

import { PC_MAX, SECTOR_KEYS, TOTAL_SEATS } from './balance.ts';
import type { GameState, Intent } from './index.ts';

/** Actions a client is permitted to submit for server replay. */
export const ALLOWED_INTENT_TYPES: ReadonlySet<Intent['type']> = new Set([
  'advance_phase',
  'resolve_event',
  'propose_bill',
  'withdraw_bill',
  'public_address',
  'coalition_concession',
  'reshuffle_cabinet',
  'emergency_budget',
  'set_funding',
  'diplomatic_act',
  'propose_treaty',
  'withdraw_treaty',
  'set_maintenance',
  'start_project',
  'cancel_project',
  'set_tax_rate',
  'set_tax_dial',
  'adopt_fiscal_rule',
  'repeal_fiscal_rule',
  'set_reserve_contribution',
  'draw_emergency_fund',
  'call_early_election',
  'retire',
  'campaign_stop',
  'ad_buy',
  'answer_debate',
  'redraw_boundaries',
  'rally_party',
  'fundraising_drive',
  'appoint_deputy',
  'discipline_rebels',
  'invest_headquarters',
  'rename_party',
  'send_to_committee',
  'amend_bill',
  'crossbench_deal',
  'close_debate',
  'question_time',
  'repeal_bill',
  'renew_sunset',
  'executive_order',
  'call_referendum',
  'set_manifesto',
  'campaign_push',
  'commission_poll',
  'hold_rally',
  'town_hall',
  'press_conference',
  'negotiation_accept',
  'negotiation_counter',
  'negotiation_remove',
  'negotiation_form_government',
  'negotiation_abandon',
  'acknowledge_election',
  'set_budget_line',
  'set_capital_share',
  'present_budget',
  'secure_supply',
]);

/** Cap the journal so one request cannot ask for unbounded computation. */
export const MAX_INTENTS_PER_REQUEST = 120;

/**
 * Hard invariants a stored snapshot must satisfy before the server will build
 * another turn on top of it.
 *
 * Games are created client-side, so a tampered client could in principle
 * insert a run that starts from an advantageous position. This does not make
 * that impossible, but it rejects the crude forms of it and catches genuine
 * corruption before a bad state is compounded by another turn.
 *
 * Returns null when the state is acceptable, or a reason when it is not.
 */
export function validateSnapshot(state: GameState | null | undefined): string | null {
  if (!state || typeof state !== 'object') return 'snapshot missing';

  if (!Number.isFinite(state.approval) || state.approval < 0 || state.approval > 100) {
    return 'approval out of range';
  }
  if (
    !Number.isFinite(state.politicalCapital) ||
    state.politicalCapital < 0 ||
    state.politicalCapital > PC_MAX
  ) {
    return 'political capital out of range';
  }
  if (!Array.isArray(state.parties) || state.parties.length === 0) return 'no parties';

  const seats = state.parties.reduce((sum, p) => sum + (p?.seats ?? 0), 0);
  if (seats !== TOTAL_SEATS) return `seats total ${seats}, expected ${TOTAL_SEATS}`;
  if (state.parties.filter((p) => p?.isPlayer).length !== 1) return 'player party not unique';

  if (!Array.isArray(state.sectors) || state.sectors.length !== SECTOR_KEYS.length) {
    return 'sector set incomplete';
  }
  for (const sector of state.sectors) {
    if (!Number.isFinite(sector?.health) || sector.health < 0 || sector.health > 100) {
      return `sector ${sector?.key} health out of range`;
    }
    if (!Number.isFinite(sector?.funding) || sector.funding < 0) {
      return `sector ${sector?.key} funding invalid`;
    }
  }

  if (!Number.isFinite(state.debt) || state.debt < 0) return 'debt invalid';
  if (!Number.isFinite(state.treasury)) return 'treasury invalid';
  if (!Number.isFinite(state.turnNumber) || state.turnNumber < 1) return 'turn number invalid';
  if (!Number.isFinite(state.termNumber) || state.termNumber < 1) return 'term number invalid';

  return null;
}

/** Returns null when the submitted journal is acceptable, or a reason. */
export function validateIntents(intents: unknown): string | null {
  if (!Array.isArray(intents)) return 'intents must be a list';
  if (intents.length > MAX_INTENTS_PER_REQUEST) {
    return `at most ${MAX_INTENTS_PER_REQUEST} actions per turn`;
  }
  for (const intent of intents) {
    if (!intent || typeof intent !== 'object') return 'malformed action';
    const type = (intent as Intent).type;
    if (!ALLOWED_INTENT_TYPES.has(type)) return `unrecognised action: ${String(type)}`;
  }
  return null;
}
