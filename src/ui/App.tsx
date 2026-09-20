/**
 * App.tsx — the shell.
 *
 * Routes on store state rather than URL: the title and setup screens, and then
 * whichever screen the run's current phase calls for. Also owns the two
 * globals — the screen-reader announcement region and the error banner.
 *
 * ON THE SPLIT
 *
 * The title screen is what somebody arriving is looking at, and it needs a
 * list of saves and four difficulty blurbs. The desk is thirty panels, and
 * it is only reachable once a run exists. Loading the second to render the
 * first is a slower first paint for no reason, so everything past the
 * title is deferred.
 *
 * The fallback is deliberately quiet. A split that flashes a spinner on
 * every screen change is worse than no split at all, and these chunks
 * arrive in a few milliseconds from a warm cache — which, after the first
 * turn, is every time.
 */

import { Suspense, lazy, useEffect } from 'react';
import { useGame } from '../state/store.ts';
import { Title } from './screens/Title.tsx';
import { Button } from './components/Primitives.tsx';

const HowToPlay = lazy(() =>
  import('./screens/HowToPlay.tsx').then((m) => ({ default: m.HowToPlay })),
);
const PartySetup = lazy(() =>
  import('./screens/PartySetup.tsx').then((m) => ({ default: m.PartySetup })),
);
const Desk = lazy(() => import('./screens/Desk.tsx').then((m) => ({ default: m.Desk })));
const CoalitionRoom = lazy(() =>
  import('./screens/CoalitionRoom.tsx').then((m) => ({ default: m.CoalitionRoom })),
);
const ElectionNight = lazy(() =>
  import('./screens/ElectionNight.tsx').then((m) => ({ default: m.ElectionNight })),
);
const CareerSummary = lazy(() =>
  import('./screens/CareerSummary.tsx').then((m) => ({ default: m.CareerSummary })),
);

/** Quiet on purpose: see the note above. */
function Loading() {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <p className="font-serif text-lg text-ink-faint">Opening the red box…</p>
    </div>
  );
}

export function App() {
  const { screen, game, ready, error, announcement, clearError, init } = useGame();

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <p className="font-serif text-lg text-ink-faint">Opening the red box…</p>
      </div>
    );
  }

  return (
    <>
      {/*
        Every state change the player causes is announced here. Politeness is
        deliberate: an assertive region would interrupt a screen reader mid-way
        through the briefing text.
      */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {error && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-loss bg-panel px-4 py-2 text-sm text-loss"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="quiet" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <Suspense fallback={<Loading />}>
        {screen === 'title' && <Title />}
        {screen === 'how-to-play' && <HowToPlay />}
        {screen === 'setup' && <PartySetup />}
        {screen === 'game' && game && <GameScreen />}
      </Suspense>
    </>
  );
}

/** Pick the screen the run's phase calls for. */
function GameScreen() {
  const { game } = useGame();
  if (!game) return null;

  if (game.status !== 'active' || game.phase === 'career_summary') return <CareerSummary />;
  if (game.phase === 'coalition') return <CoalitionRoom />;
  if (game.phase === 'election_night') return <ElectionNight />;
  return <Desk />;
}
