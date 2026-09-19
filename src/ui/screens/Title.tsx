/**
 * Title.tsx — run select.
 *
 * Also the honest place to say where saves are going: the game works with no
 * account at all, so the storage mode is stated plainly rather than implied.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import { isCloudConfigured } from '../../services/supabase.ts';
import { Button, EmptyNote, Kicker, Panel, Tag, pct } from '../components/Primitives.tsx';
import { DIFFICULTY } from '../../game/index.ts';
import type { Difficulty } from '../../game/index.ts';

export function Title() {
  const { saves, store, userEmail, setScreen, openGame, deleteGame, signIn, signOut, busy } =
    useGame();
  const [email, setEmail] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="border-b-2 border-ink pb-4">
        <Kicker>A turn-based political simulation</Kicker>
        <h1 className="font-serif text-5xl font-bold tracking-tight text-ink sm:text-6xl">
          Statecraft
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          You lead a party in the parliamentary democracy of Verdana. Win elections, hold a
          coalition together, pass an agenda, and balance a budget that will not balance. Every
          week you get a desk, a briefing, and more things worth doing than you have capital for.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Begin">
            <p className="text-sm text-ink-soft">
              A full term runs four years — two hundred and eight weeks — and ends at a general election. Expect thirty to
              forty-five minutes.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={() => setScreen('setup')}>
                Found a party
              </Button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => (
                <div key={key} className="border border-rule bg-sunk/40 p-3">
                  <div className="font-serif text-sm font-semibold text-ink">
                    {DIFFICULTY[key].label}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                    {DIFFICULTY[key].blurb}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Continue"
            aside={saves.length > 0 ? `${saves.length} saved` : undefined}
          >
            {saves.length === 0 ? (
              <EmptyNote>No saved runs yet.</EmptyNote>
            ) : (
              <ul className="divide-y divide-rule">
                {saves.map((save) => (
                  <li key={save.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-sm font-semibold text-ink">
                        {save.partyName}
                      </div>
                      <div className="truncate text-xs text-ink-faint tnum">
                        {save.countryName} · term {save.termNumber}, week {save.turnNumber} ·{' '}
                        {pct(save.approval, 1)} approval
                        {save.status !== 'active' && ` · ${save.status}`}
                      </div>
                    </div>
                    <Button onClick={() => openGame(save.id)}>Resume</Button>
                    <Button
                      variant="quiet"
                      onClick={() => deleteGame(save.id)}
                      title={`Delete the ${save.partyName} run`}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Saves">
            <p className="text-sm text-ink-soft">
              {store?.mode === 'cloud' ? (
                <>
                  Signed in as <span className="text-ink">{userEmail}</span>. Runs are saved to your
                  account and follow you between devices.
                </>
              ) : (
                <>
                  Runs are saved in this browser only. Clearing site data will remove them.
                  {isCloudConfigured
                    ? ' Sign in to keep them on your account instead.'
                    : ' This deployment has no backend configured, which is a supported way to play.'}
                </>
              )}
            </p>

            {isCloudConfigured && (
              <div className="mt-4">
                {store?.mode === 'cloud' ? (
                  <Button onClick={signOut}>Sign out</Button>
                ) : showAuth ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void signIn(email);
                    }}
                    className="space-y-2"
                  >
                    <label className="block text-xs text-ink-faint" htmlFor="signin-email">
                      Email address
                    </label>
                    <input
                      id="signin-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-rule bg-paper px-2 py-1.5 text-sm text-ink"
                      placeholder="you@example.com"
                    />
                    <Button type="submit" variant="primary" disabled={busy}>
                      {busy ? 'Sending…' : 'Send sign-in link'}
                    </Button>
                  </form>
                ) : (
                  <Button onClick={() => setShowAuth(true)}>Sign in for cloud saves</Button>
                )}
              </div>
            )}
          </Panel>

          <Panel title="About the content">
            <p className="text-sm leading-relaxed text-ink-soft">
              Verdana, its parties, its politicians, its press and its crises are all invented. No
              real country, party, person or event appears anywhere in this game.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Policies are written in the abstract and every one of them costs something real. The
              ideology axes are mechanical inputs to coalition arithmetic and voter appeal —
              the game takes no view on which positions are correct.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Tag>Fictional setting</Tag>
              <Tag>Nonpartisan by design</Tag>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
