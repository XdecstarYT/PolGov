/**
 * storage.ts — where a run lives.
 *
 * Two interchangeable adapters behind one interface:
 *
 *   local  browser localStorage. No account, no network, works offline.
 *   cloud  Supabase. Accounts, cross-device saves, and the relational
 *          projection that makes career history queryable.
 *
 * The game picks `cloud` when the backend is configured AND a session exists,
 * and falls back to `local` otherwise — including if the network drops
 * mid-session, so a save is never simply lost.
 */

import type { GameState } from '../game/index.ts';
import { migrateState } from '../game/migrate.ts';
import { isCloudConfigured, supabase } from './supabase.ts';
import {
  billRows,
  electionRows,
  eventRows,
  gameRow,
  newsRows,
  partyRows,
  regionRows,
  sectorRows,
  turnLogRows,
} from './projection.ts';

export interface GameSummary {
  id: string;
  countryName: string;
  partyName: string;
  difficulty: string;
  termNumber: number;
  turnNumber: number;
  approval: number;
  status: string;
  updatedAt: string;
}

export interface GameStore {
  readonly mode: 'local' | 'cloud';
  list(): Promise<GameSummary[]>;
  load(id: string): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
  remove(id: string): Promise<void>;
}

const KEY_PREFIX = 'statecraft:game:';
const INDEX_KEY = 'statecraft:index';

function summarise(state: GameState): GameSummary {
  return {
    id: state.id,
    countryName: state.countryName,
    partyName: state.parties.find((p) => p.isPlayer)?.name ?? 'Unnamed party',
    difficulty: state.difficulty,
    termNumber: state.termNumber,
    turnNumber: state.turnNumber,
    approval: state.approval,
    status: state.status,
    updatedAt: state.updatedAt,
  };
}

/* ----------------------------- local ----------------------------- */

class LocalStore implements GameStore {
  readonly mode = 'local' as const;

  async list(): Promise<GameSummary[]> {
    const ids = this.readIndex();
    const summaries: GameSummary[] = [];
    for (const id of ids) {
      const state = await this.load(id);
      if (state) summaries.push(summarise(state));
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<GameState | null> {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + id);
      /* Through the migration, because a save written before a subsystem
         existed is a state with a hole in it, and reading one directly is a
         white screen rather than a message. */
      return raw ? migrateState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  async save(state: GameState): Promise<void> {
    try {
      localStorage.setItem(KEY_PREFIX + state.id, JSON.stringify(state));
      const ids = new Set(this.readIndex());
      ids.add(state.id);
      localStorage.setItem(INDEX_KEY, JSON.stringify([...ids]));
    } catch (error) {
      /* Quota exceeded or storage disabled — surface it rather than failing mute. */
      throw new Error(
        `Could not save locally: ${error instanceof Error ? error.message : 'storage unavailable'}`,
      );
    }
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(KEY_PREFIX + id);
    localStorage.setItem(
      INDEX_KEY,
      JSON.stringify(this.readIndex().filter((existing) => existing !== id)),
    );
  }

  private readIndex(): string[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
}

/* ----------------------------- cloud ----------------------------- */

class CloudStore implements GameStore {
  readonly mode = 'cloud' as const;

  constructor(private readonly userId: string) {}

  async list(): Promise<GameSummary[]> {
    const client = supabase!;
    const { data, error } = await client
      .from('games')
      .select('id, country_name, difficulty, term_number, turn_number, approval, status, updated_at, snapshot')
      .eq('owner_id', this.userId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const snapshot = row.snapshot as GameState | null;
      return {
        id: row.id as string,
        countryName: row.country_name as string,
        partyName: snapshot?.parties.find((p) => p.isPlayer)?.name ?? 'Unnamed party',
        difficulty: row.difficulty as string,
        termNumber: row.term_number as number,
        turnNumber: row.turn_number as number,
        approval: Number(row.approval),
        status: row.status as string,
        updatedAt: row.updated_at as string,
      };
    });
  }

  async load(id: string): Promise<GameState | null> {
    const client = supabase!;
    const { data, error } = await client
      .from('games')
      .select('snapshot')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data?.snapshot as GameState | undefined) ?? null;
  }

  /**
   * Write the snapshot first — that is the save. The relational projection is
   * written afterwards and a failure there is logged but not fatal: losing a
   * queryable projection is an inconvenience, losing the run is not acceptable.
   */
  async save(state: GameState): Promise<void> {
    const client = supabase!;

    const { error } = await client.from('games').upsert(gameRow(state, this.userId));
    if (error) throw new Error(error.message);

    try {
      await Promise.all([
        client.from('parties').upsert(partyRows(state), { onConflict: 'game_id,party_key' }),
        client.from('sectors').upsert(sectorRows(state), { onConflict: 'game_id,key' }),
        client.from('bills').upsert(billRows(state), { onConflict: 'game_id,bill_key' }),
        client.from('regions').upsert(regionRows(state), { onConflict: 'game_id,region_key' }),
        client.from('turn_log').upsert(turnLogRows(state), { onConflict: 'game_id,turn_number' }),
      ]);

      /* Append-only tables: clear the turn's rows, then re-insert. */
      if (state.news.length > 0) {
        await client.from('news_feed').delete().eq('game_id', state.id).eq('turn_number', state.turnNumber);
        await client.from('news_feed').insert(newsRows(state));
      }
      if (state.events.length > 0) {
        await client.from('events').delete().eq('game_id', state.id).eq('turn_number', state.turnNumber);
        await client.from('events').insert(eventRows(state));
      }
      if (state.elections.length > 0) {
        await client.from('elections').delete().eq('game_id', state.id);
        await client.from('elections').insert(electionRows(state));
      }
    } catch (error) {
      console.warn('Statecraft: relational projection failed; snapshot saved.', error);
    }
  }

  async remove(id: string): Promise<void> {
    const client = supabase!;
    const { error } = await client.from('games').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}

/* --------------------------- selection --------------------------- */

export const localStore = new LocalStore();

/**
 * Pick a store for the current session. Falls back to local storage whenever
 * the cloud is unavailable, unconfigured, or unauthenticated.
 */
export async function resolveStore(): Promise<GameStore> {
  if (!isCloudConfigured || !supabase) return localStore;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    return userId ? new CloudStore(userId) : localStore;
  } catch {
    return localStore;
  }
}
