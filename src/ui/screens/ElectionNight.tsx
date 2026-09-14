/**
 * ElectionNight.tsx — the emotional payoff.
 *
 * Regions declare one at a time with a running seat tally against the majority
 * line. The result is already fixed by the time this screen renders — nothing
 * here is random — so the reveal is purely presentational and can be skipped
 * without changing a single seat.
 *
 * Respects prefers-reduced-motion by declaring everything at once.
 */

import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../state/store.ts';
import { MAJORITY_SEATS, playerParty } from '../../game/index.ts';
import { Button, Kicker, Panel, PartyMark, Stat, Tag, pct } from '../components/Primitives.tsx';

const REVEAL_INTERVAL_MS = 1100;

export function ElectionNight() {
  const { game, dispatch } = useGame();
  const election = game?.elections[game.elections.length - 1];

  const prefersReducedMotion = useMemo(
    () =>
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const total = election?.regions.length ?? 0;
  const [declared, setDeclared] = useState(prefersReducedMotion ? total : 0);

  useEffect(() => {
    if (prefersReducedMotion || declared >= total) return;
    const timer = setTimeout(() => setDeclared((n) => n + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [declared, total, prefersReducedMotion]);

  if (!game || !election) return null;

  const player = playerParty(game.parties);
  const complete = declared >= total;

  /* Running tally across only the regions declared so far. */
  const tally: Record<string, number> = {};
  for (const region of election.regions.slice(0, declared)) {
    for (const [partyId, seats] of Object.entries(region.seatsByParty)) {
      tally[partyId] = (tally[partyId] ?? 0) + seats;
    }
  }
  const declaredSeats = Object.values(tally).reduce((a, b) => a + b, 0);
  const playerTally = tally[player.id] ?? 0;

  const standings = [...game.parties]
    .map((party) => ({ party, seats: tally[party.id] ?? 0 }))
    .sort((a, b) => b.seats - a.seats);

  const largest = standings[0];
  const playerWon = complete && largest?.party.id === player.id;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="border-b-2 border-ink pb-3">
        <Kicker>General election · term {election.termNumber}</Kicker>
        <h1 className="font-serif text-4xl font-bold text-ink">Election night</h1>
        <p className="mt-2 text-sm text-ink-soft tnum">
          Turnout {pct(election.turnout * 100, 1)} · {declaredSeats} of{' '}
          {election.regions.reduce((sum, r) => sum + r.seats, 0)} seats declared
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-3">
        <Stat
          label="Your seats"
          value={playerTally}
          detail={
            complete
              ? playerTally >= MAJORITY_SEATS
                ? 'an outright majority'
                : 'short of a majority'
              : 'counting'
          }
          tone={playerTally >= MAJORITY_SEATS ? 'gain' : 'neutral'}
        />
        <Stat label="Majority line" value={MAJORITY_SEATS} detail="seats required" />
        <Stat
          label="Change"
          value={`${playerTally - election.playerSeatsBefore >= 0 ? '+' : '−'}${Math.abs(playerTally - election.playerSeatsBefore)}`}
          detail={`from ${election.playerSeatsBefore}`}
          tone={playerTally >= election.playerSeatsBefore ? 'gain' : 'loss'}
        />
        {!complete && (
          <Button variant="quiet" onClick={() => setDeclared(total)}>
            Declare all remaining
          </Button>
        )}
      </div>

      {/* majority progress */}
      <div className="mt-4">
        <div
          className="h-3 w-full border border-rule bg-sunk"
          role="meter"
          aria-valuenow={playerTally}
          aria-valuemin={0}
          aria-valuemax={MAJORITY_SEATS}
          aria-label="Progress toward a majority"
        >
          <div
            className="h-full transition-[width] duration-700"
            style={{
              width: `${Math.min(100, (playerTally / MAJORITY_SEATS) * 100)}%`,
              backgroundColor: player.color,
            }}
          />
        </div>
        <p className="mt-1 text-xs text-ink-faint tnum">
          {playerTally} of {MAJORITY_SEATS} needed for a majority
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Declarations" aside={`${declared} of ${total}`}>
          <ul className="divide-y divide-rule">
            {election.regions.map((region, index) => {
              const revealed = index < declared;
              const winnerId = Object.entries(region.seatsByParty).sort(
                (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
              )[0]?.[0];
              const winner = game.parties.find((p) => p.id === winnerId);

              return (
                <li key={region.regionId} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-sm font-semibold text-ink">
                      {region.regionName}
                    </span>
                    <span className="text-xs tnum text-ink-faint">{region.seats} seats</span>
                  </div>
                  {revealed && winner ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="flex items-center gap-1.5">
                        <PartyMark color={winner.color} glyph={winner.glyph} />
                        <span className="text-ink">{winner.shortName} leads</span>
                      </span>
                      <span className="tnum text-ink-faint">
                        {Object.entries(region.seatsByParty)
                          .filter(([, seats]) => seats > 0)
                          .sort((a, b) => b[1] - a[1])
                          .map(([partyId, seats]) => {
                            const party = game.parties.find((p) => p.id === partyId);
                            return `${party?.shortName ?? partyId} ${seats}`;
                          })
                          .join(' · ')}
                      </span>
                      {winner.isPlayer && <Tag tone="gain">held by you</Tag>}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-ink-faint">Counting…</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <Panel title="Running total">
            <ul className="space-y-1.5">
              {standings.map(({ party, seats }) => (
                <li key={party.id} className="flex items-center gap-2 text-sm">
                  <PartyMark color={party.color} glyph={party.glyph} />
                  <span className="min-w-0 flex-1 truncate text-ink">{party.shortName}</span>
                  {party.isPlayer && (
                    <span className="text-[0.65rem] uppercase tracking-wide text-seal">you</span>
                  )}
                  <span className="tnum text-ink-soft">{seats}</span>
                </li>
              ))}
            </ul>
          </Panel>

          {complete && (
            <Panel title="The result">
              <p className="font-serif text-base leading-relaxed text-ink">
                {playerTally >= MAJORITY_SEATS
                  ? `${player.name} has won an outright majority and will govern alone.`
                  : playerWon
                    ? `${player.name} is the largest party but is short of a majority. A coalition will have to be assembled.`
                    : `${largest?.party.name} is the largest party. ${player.name} must negotiate from a weaker position than before.`}
              </p>
              <div className="mt-4">
                <Button
                  variant="primary"
                  onClick={() => void dispatch({ type: 'acknowledge_election' })}
                >
                  {playerTally >= MAJORITY_SEATS
                    ? 'Take office →'
                    : 'Open negotiations →'}
                </Button>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
