/**
 * resolve-turn — the authoritative turn resolver.
 *
 * WHY THIS EXISTS
 * The browser must not be able to write its own approval rating. So the client
 * sends only INTENTS — "table this bill", "answer this event with option 2" —
 * and never a computed figure. This function loads its own copy of the game
 * from the database, replays those intents through the same engine the client
 * runs, validates every political-capital cost as it goes, resolves the turn,
 * writes the result, and returns it.
 *
 * Nothing in the request body is trusted except the game id and the list of
 * intents. In particular the client's own state is never read: a tampered
 * client can only ever send a sequence of legal-looking actions, and illegal
 * ones are rejected by the engine's own validation.
 *
 * The engine under _shared/game is a verbatim copy of src/game, produced by
 * `npm run sync:engine`. It is the same rules, not a reimplementation.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, preflight } from '../_shared/http.ts';
/*
 * Imported from the individual modules rather than the barrel: pulling in
 * index.ts drags the whole bill catalogue into the deploy bundle, and this
 * function never creates a game, so it never needs it.
 */
import { applyIntents, resolveTurn, type Intent } from '../_shared/game/turn.ts';
import {
  validateIntents,
  validateSnapshot,
} from '../_shared/game/serverGuards.ts';
import type { GameState } from '../_shared/game/types.ts';



Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  /*
   * The client's own JWT is used, so every query below runs under that user's
   * RLS policies. This function has no elevated database access and cannot
   * reach another player's game even if asked to.
   */
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: 'Not signed in.' }, 401);

  let body: { gameId?: string; intents?: Intent[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Malformed request body.' }, 400);
  }

  const gameId = body.gameId;
  const intents = Array.isArray(body.intents) ? body.intents : [];

  if (typeof gameId !== 'string' || gameId.length === 0) {
    return json({ error: 'gameId is required.' }, 400);
  }
  const intentProblem = validateIntents(intents);
  if (intentProblem) return json({ error: `Refused: ${intentProblem}.` }, 400);

  /* Authoritative state comes from the database, never from the request. */
  const { data: row, error: loadError } = await supabase
    .from('games')
    .select('id, owner_id, status, snapshot')
    .eq('id', gameId)
    .maybeSingle();

  if (loadError) return json({ error: loadError.message }, 500);
  if (!row) return json({ error: 'No such game.' }, 404);
  if (row.owner_id !== auth.user.id) return json({ error: 'Not your game.' }, 403);
  if (row.status !== 'active') return json({ error: 'That run has ended.' }, 409);

  const stored = row.snapshot as GameState | null;
  if (!stored) return json({ error: 'That run has no saved state.' }, 409);

  const problem = validateSnapshot(stored);
  if (problem) return json({ error: `Stored state failed validation: ${problem}` }, 409);

  /* Replay the player's actions against our own copy, validating each. */
  const replayed = applyIntents(stored, intents);
  if (replayed.error) {
    return json({ error: `Action refused: ${replayed.error}` }, 422);
  }

  /*
   * Resolve only if the replay left us at the point a turn ends. This stops a
   * client from asking for resolution twice and banking two months of drift.
   */
  const ready = replayed.state;
  const resolved = ready.phase === 'budget' ? resolveTurn(ready) : ready;

  const { error: saveError } = await supabase
    .from('games')
    .update({
      turn_number: resolved.turnNumber,
      term_number: resolved.termNumber,
      phase: resolved.phase,
      political_capital: resolved.politicalCapital,
      approval: resolved.approval,
      treasury: resolved.treasury,
      debt: resolved.debt,
      status: resolved.status,
      snapshot: resolved,
    })
    .eq('id', gameId);

  if (saveError) return json({ error: saveError.message }, 500);

  /* Best effort: the queryable turn log. A failure here must not lose the turn. */
  const log = resolved.logs.find((entry) => entry.turnNumber === resolved.turnNumber);
  if (log) {
    await supabase
      .from('turn_log')
      .upsert(
        { game_id: gameId, turn_number: log.turnNumber, entries: log.entries },
        { onConflict: 'game_id,turn_number' },
      );
  }

  return new Response(JSON.stringify({ state: resolved }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
