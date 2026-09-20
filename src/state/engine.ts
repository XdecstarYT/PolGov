/**
 * engine.ts — the simulation, loaded when it is needed.
 *
 * The engine is most of the download: forty thousand lines of rules, the
 * country table, every bill, every event. The title screen needs none of
 * it — it lists saves and four difficulty blurbs — and somebody arriving
 * at the game should not wait for the whole simulation to render a list.
 *
 * So it is behind a dynamic import, resolved once and remembered. The
 * store's actions are already async, so nothing above this has to change
 * shape; the first call waits a few milliseconds for a chunk and every
 * call after it is a property read on a resolved promise.
 *
 * What does NOT go through here: types, and the handful of constants the
 * title and setup screens display. Those are imported directly from the
 * module that defines them, because a type costs nothing at runtime and a
 * number does not need a network round trip.
 */

type Engine = typeof import('../game/index.ts');

let pending: Promise<Engine> | null = null;
let resolved: Engine | null = null;

/**
 * The engine, once.
 *
 * Memoised on the promise rather than the module, so two actions racing
 * on a cold start share one import instead of starting two.
 */
export function engine(): Promise<Engine> {
  pending ??= import('../game/index.ts').then((module) => {
    resolved = module;
    return module;
  });
  return pending;
}

/**
 * The engine if it is already here, and null if it is not.
 *
 * For the handful of places that read the rules during a render and
 * cannot await — all of which are inside a run, which means the engine
 * was loaded before the screen they are on could exist. The null branch
 * is unreachable in practice and is handled anyway, because "unreachable"
 * is a claim about today's routing.
 */
export function loadedEngine(): Engine | null {
  return resolved;
}

/**
 * Start fetching it without waiting.
 *
 * Called when the player does something that means a run is coming — in
 * practice, opening the setup screen or a save — so the chunk is usually
 * already there by the time anything needs it.
 */
export function warmEngine(): void {
  void engine();
}
