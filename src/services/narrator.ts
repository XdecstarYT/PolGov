/**
 * narrator.ts — client side of the AI layer.
 *
 * Every function here returns good prose whether or not the AI is reachable.
 * The fallback strings were written first and are what ships when the backend
 * is unconfigured, rate-limited, slow, or down — which is why the game is
 * fully playable with AI completely offline, per the brief.
 *
 * No model is ever asked to decide a mechanic. These calls send outcomes that
 * game code has already computed and ask only for words about them.
 *
 * TWO WAYS TO REACH GROQ
 *
 * The default, and the only one documented in DEPLOY.md's main path, is the
 * Supabase edge function: the key stays server-side, calls are rate-limited
 * per signed-in user, and RLS gates who can even ask. That path is used
 * whenever `isCloudConfigured` is true.
 *
 * The second is `VITE_GROQ_API_KEY` — calling Groq straight from the
 * browser, no backend at all. It exists because a backend is a real cost to
 * set up, and this game is meant to be playable without one. It is also a
 * real security trade-off: a `VITE_` value is compiled into the public
 * bundle, so the key is readable by anyone who opens dev tools on the
 * deployed site, there is no way to stop them using it, and a client-side
 * call counter (below) only guards against this game's own bugs, not
 * against a key already lifted out of the page. Set it only with a key
 * you have accepted could end up spent by someone else.
 */

import type { BillMagnitude, GameEvent, GameState, NewsItem } from '../game/index.ts';
import {
  draftingVocabulary,
  outletOf,
  voiceContext,
  type Persona,
  type RawDraft,
} from '../game/index.ts';
import {
  fallbackCoalitionLine,
  fallbackDebateAttack,
  fallbackOppositionQuote,
} from '../game/content/news.ts';
import { SECTOR_LABELS } from '../game/balance.ts';
import { isCloudConfigured, supabase } from './supabase.ts';
import {
  MAX_TOKENS,
  STRUCTURED_KINDS,
  SYSTEM_PROMPTS,
  TEMPERATURE,
  type NarratorKind,
} from './aiPrompts.ts';

export type { NarratorKind };

/** Give up quickly — a slow narrator must never hold up a turn. */
const TIMEOUT_MS = 6000;

/** Cached per (game, turn, kind) so re-renders never re-bill. */
const cache = new Map<string, string>();

function cacheKey(kind: NarratorKind, gameId: string, turn: number, extra = ''): string {
  return `${kind}:${gameId}:${turn}:${extra}`;
}

async function callNarrator(
  kind: NarratorKind,
  gameId: string,
  context: unknown,
): Promise<string | null> {
  if (isCloudConfigured && supabase) return callViaEdgeFunction(kind, gameId, context);
  if (directApiKey) return callGroqDirect(kind, context);
  return null;
}

async function callViaEdgeFunction(
  kind: NarratorKind,
  gameId: string,
  context: unknown,
): Promise<string | null> {
  if (!supabase) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { data, error } = await supabase.functions.invoke('ai-narrator', {
      body: { kind, gameId, context },
    });
    if (error) return null;
    const text = (data as { text?: string } | null)?.text;
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The insecure path — see the file header. Present only when the player has
 * explicitly set it; absent (the default), this whole branch never runs.
 */
const directApiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
const directModel =
  (import.meta.env.VITE_GROQ_MODEL as string | undefined) || 'llama-3.3-70b-versatile';

/** Calls allowed per hour, tracked in memory only — see the file header. */
const DIRECT_RATE_LIMIT_PER_HOUR = 60;
const directCallTimestamps: number[] = [];

function withinDirectRateLimit(): boolean {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (directCallTimestamps.length > 0 && directCallTimestamps[0]! < cutoff) {
    directCallTimestamps.shift();
  }
  return directCallTimestamps.length < DIRECT_RATE_LIMIT_PER_HOUR;
}

async function callGroqDirect(kind: NarratorKind, context: unknown): Promise<string | null> {
  if (!directApiKey || !withinDirectRateLimit()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${directApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: directModel,
        temperature: TEMPERATURE[kind],
        max_tokens: MAX_TOKENS[kind],
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[kind] },
          { role: 'user', content: JSON.stringify(context ?? {}) },
        ],
        ...(STRUCTURED_KINDS.has(kind) ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) return null;
    directCallTimestamps.push(Date.now());

    const payload = await response.json();
    const text: unknown = payload?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Draft a bill from what the player typed.
 *
 * The one call in this file whose output the ENGINE reads rather than a
 * person, and the only one where "the model never decides a mechanic" needs
 * spelling out, because at a glance it looks like the model deciding a
 * mechanic.
 *
 * It is not. What comes back is a PROPOSAL in the engine's own vocabulary,
 * and `systems/drafting.ts` re-reads every field of it, clamps every figure
 * to what a bill of that size is allowed, drops anything it does not
 * recognise, and cuts a bill that asks for more than it gives up. The
 * result is a bill somebody could have written by hand, and it then has to
 * get through the chamber like any other. If this function returned
 * nonsense, or nothing, the player would get a small dull legal bill and
 * the simulation would be unaffected.
 *
 * Returns null when the AI is unreachable, which the caller should treat as
 * "drafting is unavailable" rather than as a failed bill.
 */
export async function draftBill(
  state: GameState,
  description: string,
  magnitude: BillMagnitude = 'major',
): Promise<RawDraft | null> {
  const text = await callNarrator('bill_draft', state.id, {
    request: description.slice(0, 600),
    country: compactContext(state),
    /* The engine's own vocabulary, sent rather than written into a prompt,
       so adding a sector or an industry teaches the drafter about it. */
    vocabulary: draftingVocabulary(magnitude),
    magnitude,
  });
  if (!text) return null;

  try {
    /* Some models fence their JSON however firmly they are asked not to. */
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? (parsed as RawDraft) : null;
  } catch {
    return null;
  }
}

/**
 * A named politician, speaking about what the government just did.
 *
 * The persona is state, not prose: who they are, what they did before,
 * their temperament and what they already think of this government were
 * all decided by game code and have been moving all run. What the model
 * adds is the sentence — and the last few sentences it wrote for the same
 * person go back in with the request, which is what stops a persona being
 * a style and makes them somebody who can be held to what they said.
 *
 * Falls back to the hand-written line, which is what ships when the AI is
 * unreachable.
 */
export async function leaderVoice(
  state: GameState,
  persona: Persona,
  about: string,
  facts: Record<string, unknown>,
  fallback: string,
): Promise<string> {
  const outlet = persona.outletId ? outletOf(state.cast, persona.outletId) : undefined;
  const key = cacheKey('leader_voice', state.id, state.turnNumber, `${persona.id}:${about}`);
  const hit = cache.get(key);
  if (hit) return hit;

  const text = await callNarrator(
    'leader_voice',
    state.id,
    voiceContext(persona, outlet, about, { ...facts, country: compactContext(state) }),
  );
  const line = text ?? fallback;
  cache.set(key, line);
  return line;
}

/**
 * A columnist's week, written to their paper's disposition.
 *
 * Same division of labour. The outlet's disposition, the columnist's beat
 * and what they make of this government are all game state; the model
 * supplies eighty words about a record it is given and may not add to.
 */
export async function pressColumn(
  state: GameState,
  persona: Persona,
  facts: Record<string, unknown>,
  fallback: string,
): Promise<string> {
  const outlet = persona.outletId ? outletOf(state.cast, persona.outletId) : undefined;
  const key = cacheKey('press_column', state.id, state.turnNumber, persona.id);
  const hit = cache.get(key);
  if (hit) return hit;

  const text = await callNarrator(
    'press_column',
    state.id,
    voiceContext(persona, outlet, 'the week', { ...facts, country: compactContext(state) }),
  );
  const column = text ?? fallback;
  cache.set(key, column);
  return column;
}

/**
 * Compact context only — approval, turn, recent bills, sector health,
 * coalition status. Never the whole state.
 */
function compactContext(state: GameState) {
  return {
    country: state.countryName,
    turn: state.turnNumber,
    term: state.termNumber,
    approval: Math.round(state.approval),
    treasury: Math.round(state.treasury),
    debt: Math.round(state.debt),
    sectors: Object.fromEntries(
      state.sectors.map((s) => [SECTOR_LABELS[s.key], Math.round(s.health)]),
    ),
    playerParty: state.parties.find((p) => p.isPlayer)?.name,
    coalition: state.parties
      .filter((p) => p.inCoalition && !p.isPlayer)
      .map((p) => ({ name: p.name, mood: Math.round(p.coalitionMood ?? 0) })),
    recentBills: state.bills
      .filter((b) => b.turnResolved === state.turnNumber)
      .map((b) => ({ title: b.title, outcome: b.status })),
  };
}

/**
 * Replace the offline newsroom's prose with generated coverage, keeping the
 * deterministic outlet, sentiment and ordering. Returns the input unchanged on
 * any failure.
 */
export async function embellishNews(
  state: GameState,
  items: NewsItem[],
): Promise<NewsItem[]> {
  if (items.length === 0) return items;

  const key = cacheKey('news', state.id, state.turnNumber);
  const cached = cache.get(key);
  const raw =
    cached ??
    (await callNarrator('news', state.id, {
      ...compactContext(state),
      headlines: items.map((i) => ({ headline: i.headline, body: i.body })),
    }));

  if (!raw) return items;
  cache.set(key, raw);

  /* The function returns one "headline :: body" pair per line. */
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('::'));

  if (lines.length === 0) return items;

  return items.map((item, index) => {
    const line = lines[index];
    if (!line) return item;
    const [headline, ...bodyParts] = line.split('::');
    const body = bodyParts.join('::').trim();
    return {
      ...item,
      headline: headline?.trim() || item.headline,
      body: body || item.body,
    };
  });
}

/** Prose wrapper around a deterministic event template. */
export async function embellishEvent(
  state: GameState,
  event: GameEvent,
): Promise<string> {
  const key = cacheKey('event_narrative', state.id, state.turnNumber, event.templateKey);
  const cached = cache.get(key);
  if (cached) return cached;

  const text = await callNarrator('event_narrative', state.id, {
    ...compactContext(state),
    event: {
      title: event.title,
      category: event.category,
      severity: event.severity,
      baseNarrative: event.narrative,
    },
  });

  if (!text) return event.narrative;
  cache.set(key, text);
  return text;
}

export async function oppositionQuote(
  state: GameState,
  billTitle: string,
  passed: boolean,
): Promise<string> {
  const opposition = state.parties
    .filter((p) => !p.isPlayer && !p.inCoalition && p.seats > 0)
    .sort((a, b) => b.seats - a.seats)[0];

  const offline = opposition
    ? fallbackOppositionQuote(opposition.leaderTitle, opposition.name, passed, billTitle)
    : '';

  const key = cacheKey('opposition_quote', state.id, state.turnNumber, billTitle);
  const cached = cache.get(key);
  if (cached) return cached;
  if (!opposition) return offline;

  const text = await callNarrator('opposition_quote', state.id, {
    ...compactContext(state),
    opposition: { name: opposition.name, title: opposition.leaderTitle, ideology: opposition.ideology },
    bill: { title: billTitle, passed },
  });

  if (!text) return offline;
  cache.set(key, text);
  return text;
}

export async function coalitionDialogue(
  state: GameState,
  partyId: string,
  mood: number,
  sector: keyof typeof SECTOR_LABELS,
  amount: number,
): Promise<string> {
  const party = state.parties.find((p) => p.id === partyId);
  const offline = fallbackCoalitionLine(
    party?.name ?? 'The party',
    mood,
    SECTOR_LABELS[sector],
    amount,
  );

  const key = cacheKey('coalition_dialogue', state.id, state.turnNumber, partyId);
  const cached = cache.get(key);
  if (cached) return cached;
  if (!party) return offline;

  const text = await callNarrator('coalition_dialogue', state.id, {
    ...compactContext(state),
    partner: {
      name: party.name,
      title: party.leaderTitle,
      ideology: party.ideology,
      mood: Math.round(mood),
      demands: { sector: SECTOR_LABELS[sector], amount },
    },
  });

  if (!text) return offline;
  cache.set(key, text);
  return text;
}

export async function debateLine(state: GameState, partyId: string): Promise<string> {
  const party = state.parties.find((p) => p.id === partyId);
  const offline = fallbackDebateAttack(party?.name ?? 'The opposition', state.approval);

  const key = cacheKey('debate_line', state.id, state.turnNumber, partyId);
  const cached = cache.get(key);
  if (cached) return cached;
  if (!party) return offline;

  const text = await callNarrator('debate_line', state.id, {
    ...compactContext(state),
    opponent: { name: party.name, title: party.leaderTitle, ideology: party.ideology },
  });

  if (!text) return offline;
  cache.set(key, text);
  return text;
}

export async function careerSummary(
  state: GameState,
  legacyTotal: number,
  verdict: string,
): Promise<string> {
  const key = cacheKey('career_summary', state.id, state.turnNumber, 'final');
  const cached = cache.get(key);
  if (cached) return cached;

  const text = await callNarrator('career_summary', state.id, {
    ...compactContext(state),
    career: state.career,
    legacyTotal,
    verdict,
    outcome: state.status,
  });

  if (!text) return verdict;
  cache.set(key, text);
  return text;
}
