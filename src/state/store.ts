/**
 * store.ts — application state.
 *
 * Holds the current run plus the small amount of UI state that is not part of
 * the simulation. All game mutation goes through `dispatch`, which runs the
 * engine's `applyIntent`.
 *
 * Server authority: the store keeps a snapshot of the state at the start of
 * the turn and a journal of every intent applied since. When the backend is
 * available, ending a turn sends that pair to `resolve-turn`, which replays
 * the intents against its own copy of the snapshot, validates each cost, runs
 * resolution, and returns authoritative state that replaces the local copy.
 * The client's own numbers are never uploaded.
 */

import { create } from 'zustand';
import {
  applyIntent,
  computeLegacy,
  createGame,
  type Difficulty,
  type ElectoralSystem,
  type GameState,
  type Ideology,
  type Intent,
  type LegacyScore,
  type CountryKey,
} from '../game/index.ts';
import { localStore, resolveStore, type GameStore, type GameSummary } from '../services/storage.ts';
import { downloadRun, readRun } from '../services/transfer.ts';
import { isCloudConfigured, supabase } from '../services/supabase.ts';

export type Screen = 'title' | 'how-to-play' | 'setup' | 'game';

export interface NewGameForm {
  partyName: string;
  color: string;
  glyph: string;
  ideology: Ideology;
  difficulty: Difficulty;
  /** Which country to govern. Everything else about the run follows from it. */
  country: CountryKey;
  countryName: string;
  /**
   * How votes become seats.
   *
   * Defaults to the country's own system and can be overridden, because
   * "what would this country look like counted another way" is one of the
   * more interesting questions the engine can answer.
   */
  electoralSystem: ElectoralSystem;
}

interface AppState {
  screen: Screen;
  game: GameState | null;
  store: GameStore | null;
  saves: GameSummary[];
  ready: boolean;
  busy: boolean;
  error: string | null;
  /** Text pushed to an aria-live region so state changes reach screen readers. */
  announcement: string;
  theme: 'light' | 'dark';
  userEmail: string | null;
  /** True while a turn is being resolved by the server. */
  resolvingRemotely: boolean;

  /** State as it stood when the current turn opened. Not persisted. */
  turnStart: GameState | null;
  /** Intents applied since the turn opened. Not persisted. */
  journal: Intent[];

  init: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  toggleTheme: () => void;
  announce: (message: string) => void;
  clearError: () => void;

  startGame: (form: NewGameForm) => Promise<void>;
  openGame: (id: string) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;
  /** Hand the run in play, or a named save, back to the player as a file. */
  exportGame: (id?: string) => Promise<void>;
  /** Read a run back in from a file and put it in the save list. */
  importGame: (text: string) => Promise<void>;
  quitToTitle: () => Promise<void>;

  dispatch: (intent: Intent) => Promise<void>;
  endTurn: () => Promise<void>;

  legacy: () => LegacyScore | null;

  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `game-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

function readTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('statecraft:theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage unavailable — fall through to the system preference */
  }
  return typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  try {
    localStorage.setItem('statecraft:theme', theme);
  } catch {
    /* non-fatal */
  }
}

/** Intents after which the turn is considered to have re-opened. */
function opensNewTurn(before: GameState, after: GameState): boolean {
  return after.turnNumber !== before.turnNumber || after.termNumber !== before.termNumber;
}

export const useGame = create<AppState>((set, get) => ({
  screen: 'title',
  game: null,
  store: null,
  saves: [],
  ready: false,
  busy: false,
  error: null,
  announcement: '',
  theme: 'light',
  userEmail: null,
  resolvingRemotely: false,
  turnStart: null,
  journal: [],

  async init() {
    const theme = readTheme();
    applyTheme(theme);

    const store = await resolveStore();
    let userEmail: string | null = null;
    if (isCloudConfigured && supabase) {
      const { data } = await supabase.auth.getSession();
      userEmail = data.session?.user.email ?? null;
    }

    let saves: GameSummary[] = [];
    try {
      saves = await store.list();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not list saved runs.' });
    }

    set({ theme, store, saves, userEmail, ready: true });
  },

  setScreen(screen) {
    set({ screen });
  },

  toggleTheme() {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    set({ theme });
  },

  announce(message) {
    set({ announcement: message });
  },

  clearError() {
    set({ error: null });
  },

  async startGame(form) {
    set({ busy: true, error: null });
    try {
      const game = createGame({
        gameId: uuid(),
        country: form.country,
        countryName: form.countryName,
        difficulty: form.difficulty,
        playerPartyName: form.partyName.trim() || 'Reform Coalition',
        playerColor: form.color,
        playerGlyph: form.glyph,
        playerIdeology: form.ideology,
        electoralSystem: form.electoralSystem,
      });

      const store = get().store ?? (await resolveStore());
      await store.save(game);

      set({
        game,
        store,
        screen: 'game',
        turnStart: game,
        journal: [],
        busy: false,
        announcement: `New run started in ${game.countryName}. ${
          game.phase === 'coalition'
            ? 'No party holds a majority — coalition negotiations have begun.'
            : 'Your party holds a majority.'
        }`,
      });
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Could not start a new run.',
      });
    }
  },

  async openGame(id) {
    set({ busy: true, error: null });
    try {
      const store = get().store ?? (await resolveStore());
      const game = await store.load(id);
      if (!game) throw new Error('That run could not be found.');
      set({
        game,
        store,
        screen: 'game',
        turnStart: game,
        journal: [],
        busy: false,
        announcement: `Resumed term ${game.termNumber}, turn ${game.turnNumber}.`,
      });
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Could not open that run.',
      });
    }
  },

  /**
   * Write a run out.
   *
   * The run in play if there is one, otherwise a named save loaded for the
   * purpose. Never throws into the interface: a browser that refuses the
   * download says so in the error line and leaves the run where it was.
   */
  async exportGame(id) {
    try {
      const { game, store: existing } = get();
      const store = existing ?? (await resolveStore());
      const target = id ? await store.load(id) : game;
      if (!target) throw new Error('There is no run to export.');
      if (!downloadRun(target)) {
        throw new Error('This browser would not save the file.');
      }
      set({ announcement: `Exported ${target.countryName}, term ${target.termNumber}.` });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not export that run.' });
    }
  },

  /**
   * Read a run back in.
   *
   * Through `migrateState`, exactly as a stored save is, so a run exported
   * from an older build opens here. A run already on this device is given
   * a fresh id rather than overwriting the one being played, because
   * nobody expects a restore to destroy the thing it was restoring.
   */
  async importGame(text) {
    set({ busy: true, error: null });
    try {
      const store = get().store ?? (await resolveStore());
      const saves = await store.list();
      const result = readRun(text, saves.map((s) => s.id));
      if (!result.ok) throw new Error(result.reason);

      await store.save(result.state);
      set({
        store,
        saves: await store.list(),
        busy: false,
        announcement: result.renamed
          ? 'Imported as a second copy: a run with that id is already here.'
          : `Imported ${result.state.countryName}, term ${result.state.termNumber}.`,
      });
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Could not read that file.',
      });
    }
  },

  async deleteGame(id) {
    try {
      const store = get().store ?? (await resolveStore());
      await store.remove(id);
      set({ saves: await store.list() });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not delete that run.' });
    }
  },

  async quitToTitle() {
    const { game, store } = get();
    if (game && store) {
      try {
        await store.save(game);
      } catch {
        /* keep the player's exit responsive; the save is retried on next action */
      }
    }
    const nextStore = store ?? (await resolveStore());
    let saves: GameSummary[] = [];
    try {
      saves = await nextStore.list();
    } catch {
      saves = [];
    }
    set({ screen: 'title', game: null, saves, turnStart: null, journal: [] });
  },

  async dispatch(intent) {
    const { game, store } = get();
    if (!game) return;

    const result = applyIntent(game, intent);
    if (result.error) {
      set({ error: result.error });
      return;
    }

    const next = result.state;
    const startedNewTurn = opensNewTurn(game, next);

    set({
      game: next,
      error: null,
      turnStart: startedNewTurn ? next : get().turnStart,
      journal: startedNewTurn ? [] : [...get().journal, intent],
    });

    /*
     * In cloud mode the database copy is the authoritative one and is written
     * only by resolve-turn. Persisting the client's own mid-turn state would
     * hand the browser exactly the write path server authority exists to
     * remove. Instead it is cached locally for crash recovery, which is not
     * authoritative and is overwritten by the server's answer at end of turn.
     */
    try {
      if (store && store.mode === 'local') {
        await store.save(next);
      } else {
        await localStore.save(next);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not save.' });
    }
  },

  /**
   * End the turn. With a backend configured, resolution is performed by the
   * edge function and its answer replaces local state. Without one — or if the
   * call fails — the identical engine code runs locally so play continues.
   */
  async endTurn() {
    const { game, store, journal } = get();
    if (!game) return;

    if (isCloudConfigured && supabase && store?.mode === 'cloud') {
      set({ resolvingRemotely: true });
      try {
        /*
         * Only the game id and the player's actions are sent. No figure this
         * client computed is uploaded; the server replays these intents
         * against its own stored copy and returns the authoritative result.
         */
        const { data, error } = await supabase.functions.invoke('resolve-turn', {
          body: { gameId: game.id, intents: journal },
        });

        const authoritative = (data as { state?: GameState } | null)?.state;
        if (!error && authoritative) {
          set({
            game: authoritative,
            turnStart: authoritative,
            journal: [],
            resolvingRemotely: false,
            error: null,
            announcement: 'Turn resolved. The report is ready.',
          });
          /* Refresh the local crash-recovery cache from the server's answer. */
          await localStore.save(authoritative).catch(() => undefined);
          return;
        }
      } catch {
        /* fall through to local resolution */
      }
      set({ resolvingRemotely: false });
    }

    await get().dispatch({ type: 'advance_phase' });
    set({ announcement: 'Turn resolved. The report is ready.' });
  },

  legacy() {
    const { game } = get();
    return game ? computeLegacy(game) : null;
  },

  async signIn(email) {
    if (!isCloudConfigured || !supabase) {
      set({ error: 'Accounts are not configured for this deployment.' });
      return;
    }
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    set({
      busy: false,
      error: error ? error.message : null,
      announcement: error ? '' : `A sign-in link has been sent to ${email}.`,
    });
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut();
    const store = await resolveStore();
    set({ userEmail: null, store, saves: await store.list().catch(() => []) });
  },
}));
