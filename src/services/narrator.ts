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
 */

import type { GameEvent, GameState, NewsItem } from '../game/index.ts';
import {
  fallbackCoalitionLine,
  fallbackDebateAttack,
  fallbackOppositionQuote,
} from '../game/content/news.ts';
import { SECTOR_LABELS } from '../game/balance.ts';
import { isCloudConfigured, supabase } from './supabase.ts';

export type NarratorKind =
  | 'news'
  | 'event_narrative'
  | 'opposition_quote'
  | 'coalition_dialogue'
  | 'debate_line'
  | 'career_summary';

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
  if (!isCloudConfigured || !supabase) return null;

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
