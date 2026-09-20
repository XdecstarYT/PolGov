/**
 * App.tsx — the shell.
 *
 * Routes on store state rather than URL: the title and setup screens, and then
 * whichever screen the run's current phase calls for. Also owns the two
 * globals — the screen-reader announcement region and the error banner.
 */

import { useEffect } from 'react';
import { useGame } from '../state/store.ts';
import { Title } from './screens/Title.tsx';
import { HowToPlay } from './screens/HowToPlay.tsx';
import { PartySetup } from './screens/PartySetup.tsx';
import { Desk } from './screens/Desk.tsx';
import { CoalitionRoom } from './screens/CoalitionRoom.tsx';
import { ElectionNight } from './screens/ElectionNight.tsx';
import { CareerSummary } from './screens/CareerSummary.tsx';
import { Button } from './components/Primitives.tsx';

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

      {screen === 'title' && <Title />}
      {screen === 'how-to-play' && <HowToPlay />}
      {screen === 'setup' && <PartySetup />}
      {screen === 'game' && game && <GameScreen />}
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
