/**
 * projection.ts — GameState to normalised rows.
 *
 * games.snapshot is authoritative for resolution. These projections keep the
 * relational tables (parties, sectors, bills, regions, news, turn_log,
 * elections) populated alongside it so career history and per-turn records are
 * genuinely queryable rather than buried in a JSON blob.
 */

import type { GameState } from '../game/index.ts';

export function gameRow(state: GameState, ownerId: string) {
  return {
    id: state.id,
    owner_id: ownerId,
    country_name: state.countryName,
    difficulty: state.difficulty,
    turn_number: state.turnNumber,
    term_number: state.termNumber,
    phase: state.phase,
    political_capital: state.politicalCapital,
    approval: state.approval,
    treasury: state.treasury,
    debt: state.debt,
    status: state.status,
    snapshot: state as unknown as Record<string, unknown>,
  };
}

export function partyRows(state: GameState) {
  return state.parties.map((party) => ({
    game_id: state.id,
    party_key: party.id,
    name: party.name,
    color: party.color,
    is_player: party.isPlayer,
    in_coalition: party.inCoalition,
    ideology: party.ideology,
    seats: party.seats,
    coalition_mood: party.coalitionMood,
    red_lines: party.redLines,
  }));
}

export function sectorRows(state: GameState) {
  return state.sectors.map((sector) => ({
    game_id: state.id,
    key: sector.key,
    health: sector.health,
    funding: sector.funding,
  }));
}

export function billRows(state: GameState) {
  return state.bills.map((bill) => ({
    game_id: state.id,
    bill_key: bill.templateKey,
    title: bill.title,
    category: bill.category,
    magnitude: bill.magnitude,
    ideology: bill.ideology,
    effects: bill.effects,
    status: bill.status,
    pass_chance: bill.passChance,
    pc_spent: bill.pcSpent,
    turn_proposed: bill.turnProposed,
    turn_resolved: bill.turnResolved,
  }));
}

export function regionRows(state: GameState) {
  return state.regions.map((region) => ({
    game_id: state.id,
    region_key: region.id,
    name: region.name,
    seats: region.seats,
    lean: region.lean,
    campaign_investment: region.campaignInvestment,
  }));
}

export function newsRows(state: GameState) {
  return state.news.map((item) => ({
    game_id: state.id,
    turn_number: item.turnNumber,
    outlet: item.outlet,
    headline: item.headline,
    body: item.body,
    sentiment: item.sentiment,
  }));
}

export function turnLogRows(state: GameState) {
  return state.logs.map((entry) => ({
    game_id: state.id,
    turn_number: entry.turnNumber,
    entries: entry.entries,
  }));
}

export function electionRows(state: GameState) {
  return state.elections.map((election) => ({
    game_id: state.id,
    term_number: election.termNumber,
    turnout: election.turnout,
    results: election.seatsByParty,
    regional_breakdown: election.regions,
  }));
}

export function eventRows(state: GameState) {
  return state.events.map((event) => ({
    game_id: state.id,
    turn_number: event.turnNumber,
    template_key: event.templateKey,
    category: event.category,
    severity: event.severity,
    narrative: event.narrative,
    choices: event.choices,
    chosen_index: event.chosenIndex,
    consequences: event.chosenIndex !== null ? event.choices[event.chosenIndex]?.effects ?? null : null,
    resolved_at: event.resolved ? new Date().toISOString() : null,
  }));
}
