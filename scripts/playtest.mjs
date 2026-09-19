/**
 * Headless playtest. Drives the engine through whole terms with a simple
 * heuristic "player" and prints the trajectory, so balance problems and
 * state-machine bugs surface without touching the UI.
 */
import { createGame, applyIntent } from '../src/game/index.ts';

const difficulty = process.argv[2] ?? 'standard';
const terms = Number(process.argv[3] ?? 2);
const seedLabel = process.argv[4] ?? 'playtest-1';
const country = process.argv[5] ?? 'verdana';

let state = createGame({
  gameId: seedLabel,
  country,
  difficulty,
  playerPartyName: 'Reform Coalition',
  playerColor: '#8c2f27',
  playerGlyph: '★',
  playerIdeology: { economic: -0.1, social: 0.2, environmental: 0.2 },
});

const must = (intent) => {
  const r = applyIntent(state, intent);
  /*
   * A government that has run out of political capital is a normal state,
   * not a bug — especially now a turn is a week and capital regenerates in
   * weekly slices. The bot notes it and moves on; anything else is a real
   * failure and still throws.
   */
  if (r.error) {
    if (/political capital|Not enough|already|only available|cannot/i.test(r.error)) return state;
    throw new Error(`${intent.type}: ${r.error}`);
  }
  state = r.state;
};
const tryTo = (intent) => {
  const r = applyIntent(state, intent);
  if (!r.error) state = r.state;
  return !r.error;
};

function formGovernment() {
  let guard = 0;
  while (state.phase === 'coalition' && guard++ < 40) {
    const n = state.negotiation;
    if (!n) break;
    // Accept partners in ideological order until a majority is reached.
    const total = state.parties.reduce((s, p) => s + p.seats, 0);
    const need = Math.floor(total / 2) + 1;
    let have = state.parties.find((p) => p.isPlayer).seats;
    for (const c of n.candidates) {
      if (have >= need) break;
      if (n.accepted.includes(c.partyId)) continue;
      if (tryTo({ type: 'negotiation_accept', partyId: c.partyId })) {
        have += state.parties.find((p) => p.id === c.partyId).seats;
      }
    }
    const before = state.phase;
    const r = applyIntent(state, { type: 'negotiation_form_government' });
    state = r.state;
    if (r.error && state.phase === before && state.negotiation?.accepted.length === 0) {
      // Could not assemble a majority at all — govern as a minority.
      tryTo({ type: 'negotiation_abandon' });
    }
  }
}

function playTurn() {
  must({ type: 'advance_phase' }); // briefing -> events
  for (const e of state.events.filter((e) => !e.resolved)) {
    // Pick the cheapest affordable response.
    let best = 0;
    let bestCost = Infinity;
    e.choices.forEach((c, i) => {
      if (c.pcCost <= state.politicalCapital && c.pcCost < bestCost) {
        bestCost = c.pcCost;
        best = i;
      }
    });
    must({ type: 'resolve_event', eventId: e.id, choiceIndex: best });
  }
  must({ type: 'advance_phase' }); // events -> agenda

  // Table up to two affordable bills, cheapest first.
  const available = state.bills.filter((b) => b.status === 'available');
  let tabled = 0;
  for (const b of available) {
    if (tabled >= 2) break;
    if (tryTo({ type: 'propose_bill', billId: b.id, whipSteps: 1 })) tabled += 1;
  }
  tryTo({ type: 'public_address' });

  must({ type: 'advance_phase' }); // agenda -> budget
  must({ type: 'advance_phase' }); // budget -> resolve -> report
  must({ type: 'advance_phase' }); // report -> advance
}

formGovernment();

const header = (s) =>
  `T${String(s.termNumber).padStart(2)}/${String(s.turnNumber).padStart(2)} ` +
  `app ${s.approval.toFixed(1).padStart(5)} ` +
  `pc ${s.politicalCapital.toFixed(0).padStart(3)} ` +
  `tre ${s.treasury.toFixed(0).padStart(5)} ` +
  `debt ${s.debt.toFixed(0).padStart(5)} ` +
  `avgH ${(s.sectors.reduce((a, x) => a + x.health, 0) / 5).toFixed(1)} ` +
  `| g ${s.economy.growth.toFixed(2).padStart(5)} ` +
  `u ${s.economy.unemployment.toFixed(1).padStart(4)} ` +
  `cpi ${s.economy.inflation.toFixed(1).padStart(5)} ` +
  `r ${s.economy.policyRate.toFixed(2)} ` +
  `gap ${s.economy.outputGap.toFixed(1).padStart(5)} ` +
  `${s.economy.phase.padEnd(9)} | ` +
  `seats ${s.parties.find((p) => p.isPlayer).seats} ` +
  `bills ${s.career.billsPassed}/${s.career.billsPassed + s.career.billsFailed} ` +
  `phase ${s.phase}`;

if (process.env.DUMP_WEEK) {
  const want = Number(process.env.DUMP_WEEK);
  let g = 0;
  let seen = 0;
  while (seen < want && state.status === 'active' && g++ < 900) {
    if (state.phase === 'election_night') { tryTo({ type: 'advance_phase' }); formGovernment(); continue; }
    playTurn();
    seen += 1;
  }
  console.log(`--- through week ${state.turnNumber} (${state.countryName}) gdp ${state.economy.gdp.toFixed(0)} ---`);
  const totals = new Map();
  for (const l of state.logs) {
    for (const e of l.entries) {
      if (e.unit !== '\u20a1bn' && e.unit !== '\u20a1bn/turn') continue;
      const k = `${e.kind}:${e.label}`;
      totals.set(k, (totals.get(k) ?? 0) + e.delta);
    }
  }
  for (const [k, v] of [...totals].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 14)) {
    console.log(`  ${k.slice(0, 50).padEnd(52)} ${v.toFixed(1).padStart(11)}`);
  }
  console.log('  sectors  ', state.sectors.map((x) => `${x.key}=${x.funding.toFixed(0)}`).join(' '));
  console.log('  budget   ', state.budget.lines.reduce((a, l) => a + l.enacted, 0).toFixed(0),
    'proposed', state.budget.lines.reduce((a, l) => a + l.proposed, 0).toFixed(0),
    'status', state.budget.status);
  console.log('  services ', state.services.reduce((a, x) => a + x.demand, 0).toFixed(0),
    'funded', state.services.reduce((a, x) => a + x.funding, 0).toFixed(0));
  process.exit(0);
}

let guard = 0;
for (let t = 0; t < terms; t++) {
  while (state.status === 'active' && state.phase !== 'election_night' && guard++ < 400) {
    console.log(header(state));
    playTurn();
    if (state.phase === 'coalition') formGovernment();
    if (state.phase === 'election_night') break;
  }
  if (state.phase === 'election_night') {
    const e = state.elections[state.elections.length - 1];
    console.log(
      `\n--- ELECTION (term ${e.termNumber}) turnout ${(e.turnout * 100).toFixed(1)}% ---`,
    );
    for (const p of [...state.parties].sort(
      (a, b) => (e.seatsByParty[b.id] ?? 0) - (e.seatsByParty[a.id] ?? 0),
    )) {
      console.log(
        `  ${p.isPlayer ? '*' : ' '} ${p.name.padEnd(24)} ${String(e.seatsByParty[p.id] ?? 0).padStart(3)} seats  ${((e.voteShareByParty[p.id] ?? 0) * 100).toFixed(1)}%`,
      );
    }
    console.log('');
    must({ type: 'acknowledge_election' });
    if (state.phase === 'coalition') formGovernment();
  }
  if (state.status !== 'active') break;
}

console.log('\nFINAL:', header(state), '| status:', state.status);
