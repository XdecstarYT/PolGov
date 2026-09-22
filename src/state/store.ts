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
import type {
  Difficulty,
  ElectoralSystem,
  GameEvent,
  GameState,
  Ideology,
  Intent,
  LegacyScore,
  CountryKey,
} from '../game/index.ts';
/*
 * The engine is loaded on demand rather than imported. It is most of the
 * download and the title screen needs none of it — see `engine.ts`. Every
 * action below that touches the rules awaits it; the first one pays a few
 * milliseconds and the rest are free.
 */
import { engine, loadedEngine, warmEngine } from './engine.ts';
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

  /** True while `skipTurns` is driving the run forward unattended. */
  skipping: boolean;
  /** How far a run of `skipTurns` has got, for a progress line. */
  skipProgress: { done: number; total: number } | null;

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
  /**
   * Drive the run forward `weeks` weeks unattended: click through briefing,
   * agenda and budget exactly as a player clicking "Continue" would, and
   * answer any event that fires with its cheapest affordable response.
   * Stops early — before spending a political-capital figure the player
   * never chose, and before an election or a fallen coalition needs a real
   * decision — and says why, via `announce`.
   */
  skipTurns: (weeks: number) => Promise<void>;

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

/**
 * The cheapest response to an event that the treasury of political capital
 * can actually afford — ties broken by whichever comes first, same as a
 * player scanning the list top to bottom. `null` means every option costs
 * more than the government currently has, which `skipTurns` treats as a
 * stopping point rather than a licence to go into debt on the player's
 * behalf.
 */
function cheapestAffordableChoice(event: GameEvent, politicalCapital: number): number | null {
  let bestIndex: number | null = null;
  let bestCost = Infinity;
  event.choices.forEach((choice, index) => {
    if (choice.pcCost < bestCost) {
      bestCost = choice.pcCost;
      bestIndex = index;
    }
  });
  return bestIndex !== null && bestCost <= politicalCapital ? bestIndex : null;
}

/**
 * Phases `skipTurns` can drive through on its own, because nothing in them
 * requires a decision only a player can make once events are answered.
 * Anything else — an election, coalition talks, the end of a career — is
 * exactly the kind of moment a skip should hand back rather than click
 * through.
 */
const AUTOPLAYABLE_PHASES: ReadonlySet<GameState['phase']> = new Set([
  'briefing',
  'events',
  'agenda',
  'budget',
  'report',
]);

/**
 * Drive one full week forward — briefing through report — using the same
 * `dispatch`/`endTurn` calls the phase screens' own buttons use. Returns why
 * it stopped short of a week whenever it did, so `skipTurns` can tell the
 * player rather than leaving them to work it out from where the run ended up.
 */
async function advanceOneWeek(
  get: () => AppState,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  /* A real week never takes more than a handful of phase transitions; this
     guards against a future bug turning a stuck phase into a frozen tab. */
  for (let guard = 0; guard < 40; guard++) {
    const { game, dispatch, endTurn } = get();
    if (!game) return { ok: false, reason: 'There is no run in progress.' };
    if (game.status !== 'active') return { ok: false, reason: 'This run has already ended.' };
    if (!AUTOPLAYABLE_PHASES.has(game.phase)) {
      return { ok: false, reason: 'The run needs your attention before it can continue.' };
    }

    switch (game.phase) {
      case 'events': {
        const pending = game.events.find((e) => !e.resolved);
        if (!pending) {
          await dispatch({ type: 'advance_phase' });
          break;
        }
        const choice = cheapestAffordableChoice(pending, game.politicalCapital);
        if (choice === null) {
          return {
            ok: false,
            reason: `"${pending.title}" needs a response the government can't currently afford.`,
          };
        }
        await dispatch({ type: 'resolve_event', eventId: pending.id, choiceIndex: choice });
        break;
      }

      case 'budget':
        await endTurn();
        break;

      case 'report':
        await dispatch({ type: 'advance_phase' });
        return get().error ? { ok: false, reason: get().error! } : { ok: true };

      default:
        /* briefing, agenda — nothing here blocks moving on. */
        await dispatch({ type: 'advance_phase' });
        break;
    }

    if (get().error) return { ok: false, reason: get().error! };
  }
  return { ok: false, reason: 'Could not make progress on this week.' };
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
  skipping: false,
  skipProgress: null,

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
    /* Anything past the title means a run is coming. Start fetching the
       rules now rather than when somebody presses the button. */
    if (screen !== 'title') warmEngine();
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
      const { createGame } = await engine();
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
    warmEngine();
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
      const { migrateState } = await engine();
      const result = readRun(text, saves.map((s) => s.id), migrateState);
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

    const { applyIntent } = await engine();
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

  async skipTurns(weeks) {
    if (get().skipping) return;
    set({ skipping: true, skipProgress: { done: 0, total: weeks }, error: null });

    let completed = 0;
    let stopReason: string | null = null;

    for (; completed < weeks; completed++) {
      const result = await advanceOneWeek(get);
      if (!result.ok) {
        stopReason = result.reason;
        break;
      }
      set({ skipProgress: { done: completed + 1, total: weeks } });
    }

    const weekWord = completed === 1 ? 'week' : 'weeks';
    const stoppedEarly = stopReason !== null && completed < weeks;
    set({
      skipping: false,
      skipProgress: null,
      /* The sr-only announcement region is silent to a sighted player, and a
         stop worth explaining — an election, an event nobody can afford —
         is worth more than that. Reuse the one visible banner the app has. */
      error: stoppedEarly ? `Skipped ${completed} of ${weeks} ${weekWord} — ${stopReason}` : null,
      announcement: stoppedEarly
        ? `Skip stopped after ${completed} ${weekWord}: ${stopReason}`
        : `Skipped ${completed} ${weekWord}.`,
    });
  },

  legacy() {
    const { game } = get();
    /* Only reachable inside a run, which means the engine is here. */
    const loaded = loadedEngine();
    return game && loaded ? loaded.computeLegacy(game) : null;
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
