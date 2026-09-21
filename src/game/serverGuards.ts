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
  'draft_bill',
  'record_remark',
  'set_language_policy',
  'answer_movement',
  'set_mobilisation',
  'dismiss_commander',
  'commit_formations',
  'set_sector_posture',
  'garrison_sector',
  'set_reconnaissance',
  'station_fleet',
  'order_ship',
  'set_air_effort',
  'order_squadron',
  'set_war_footing',
  'set_war_finance',
  'set_doctrine_belief',
  'force_doctrine',
  'start_research',
  'cancel_research',
  'open_talks',
  'break_off_talks',
  'accept_terms',
  'refuse_terms',
  'revise_war_aim',
  'withdraw_bill',
  'public_address',
  'coalition_concession',
  'reshuffle_cabinet',
  'appoint_minister',
  'full_reshuffle',
  'set_machine_posture',
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
  'join_organisation',
  'leave_organisation',
  'propose_resolution',
  'set_tariff',
  'file_trade_complaint',
  'set_doctrine',
  'start_programme',
  'cancel_programme',
  'deploy_force',
  'withdraw_force',
  'escalate_crisis',
  'de_escalate_crisis',
  'settle_crisis',
  'commission_assessment',
  'launch_operation',
  'set_collection',
  'set_surveillance',
  'set_oversight',
  'respond_globally',
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

  /*
   * The rest of the state.
   *
   * These grew after the first three checks were written, and a validator
   * that stopped at approval would have let a tampered client hand itself
   * a fully ready army, a perfect intelligence service or a budget it had
   * not passed — none of which is reachable through any intent, which is
   * precisely why the snapshot is where it would have been done.
   */
  const bounded = (label: string, value: unknown): string | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
      ? null
      : `${label} out of range`;

  if (state.budget) {
    if (!Array.isArray(state.budget.lines)) return 'budget lines missing';
    for (const line of state.budget.lines) {
      if (!Number.isFinite(line?.enacted) || line.enacted < 0) return 'budget line invalid';
      if (!Number.isFinite(line?.proposed) || line.proposed < 0) return 'budget line invalid';
      const share = line?.capitalShare;
      if (!Number.isFinite(share) || share < 0 || share > 1) return 'capital share invalid';
    }
  }

  if (state.military) {
    if (!Array.isArray(state.military.arms)) return 'forces missing';
    for (const arm of state.military.arms) {
      for (const field of ['strength', 'readiness', 'equipment'] as const) {
        const bad = bounded(`${arm?.key} ${field}`, arm?.[field]);
        if (bad) return bad;
      }
    }
    const committed = (state.military.deployments ?? []).reduce(
      (sum, d) => sum + (d?.commitment ?? 0),
      0,
    );
    if (!Number.isFinite(committed) || committed < 0 || committed > 1) {
      return 'deployment commitment invalid';
    }
  }

  if (state.intelligence) {
    for (const field of ['capability', 'penetration', 'oversight'] as const) {
      const bad = bounded(`intelligence ${field}`, state.intelligence[field]);
      if (bad) return bad;
    }
    const posture = state.intelligence.posture;
    const shares = (posture?.human ?? 0) + (posture?.signals ?? 0) + (posture?.analysis ?? 0);
    if (!Number.isFinite(shares) || Math.abs(shares - 1) > 0.05) {
      return 'collection posture does not add up';
    }
  }

  if (state.trade) {
    if (!Array.isArray(state.trade.flows)) return 'trade flows missing';
    for (const flow of state.trade.flows) {
      if (!Number.isFinite(flow?.exports) || flow.exports < 0) return 'trade flow invalid';
      if (!Number.isFinite(flow?.imports) || flow.imports < 0) return 'trade flow invalid';
      if (!Number.isFinite(flow?.surcharge) || flow.surcharge < 0) return 'tariff invalid';
    }
  }

  if (state.world) {
    for (const field of ['reputation', 'influence', 'tension'] as const) {
      const bad = bounded(`world ${field}`, state.world[field]);
      if (bad) return bad;
    }
    for (const nation of state.world.nations ?? []) {
      if (!Number.isFinite(nation?.relations) || nation.relations < -100 || nation.relations > 100) {
        return `relations with ${nation?.key} out of range`;
      }
    }
  }

  if (!Number.isFinite(state.economy?.gdp) || (state.economy?.gdp ?? 0) <= 0) {
    return 'output invalid';
  }

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
