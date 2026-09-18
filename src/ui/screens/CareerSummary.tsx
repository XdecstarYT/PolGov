/**
 * CareerSummary.tsx — the end of a run.
 *
 * There is no win condition, so this screen measures rather than judges: how
 * long you lasted, what you enacted, and the condition of the country you
 * leave behind. The retrospective is written by a fictional historian and
 * falls back to a hand-written verdict when the AI layer is unavailable.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../../state/store.ts';
import { SECTOR_LABELS, computeLegacy, playerParty } from '../../game/index.ts';
import { careerSummary } from '../../services/narrator.ts';
import {
  Button,
  Kicker,
  Meter,
  Panel,
  PartyMark,
  Stat,
  bandFor,
  money,
  pct,
} from '../components/Primitives.tsx';
import { benchInk } from '../bench.ts';

const OUTCOME_TITLE: Record<string, string> = {
  defeated: 'Out of office',
  collapsed: 'The government fell',
  retired: 'Stood down',
  active: 'A career so far',
};

export function CareerSummary() {
  const { game, quitToTitle } = useGame();
  const [retrospective, setRetrospective] = useState<string | null>(null);

  const legacy = game ? computeLegacy(game) : null;

  useEffect(() => {
    if (!game || !legacy) return;
    let cancelled = false;
    setRetrospective(legacy.verdict);
    void careerSummary(game, legacy.total, legacy.verdict).then((text) => {
      if (!cancelled && text) setRetrospective(text);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, game?.status]);

  if (!game || !legacy) return null;

  const player = playerParty(game.parties);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="border-b-2 border-ink pb-4">
        <Kicker>{OUTCOME_TITLE[game.status] ?? 'A career'}</Kicker>
        <h1 className="font-serif text-4xl font-bold text-ink">
          {player.name}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
          <PartyMark color={benchInk(player)} glyph={player.glyph} />
          {game.countryName} · {game.career.termsServed} term
          {game.career.termsServed === 1 ? '' : 's'} served
        </p>
      </header>

      <Panel title="Legacy score" aside={`${legacy.total} points`} className="mt-6">
        <ul className="divide-y divide-rule">
          {legacy.lines.map((line) => (
            <li
              key={line.label}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">{line.label}</div>
                <div className="text-xs text-ink-faint">{line.detail}</div>
              </div>
              <div
                className={`shrink-0 tnum text-sm font-medium ${
                  line.points >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {line.points >= 0 ? '+' : '−'}
                {Math.abs(Math.round(line.points))}
              </div>
            </li>
          ))}
          <li className="flex items-baseline justify-between py-3 font-serif text-lg font-semibold">
            <span className="text-ink">Total</span>
            <span className="tnum text-ink">{legacy.total}</span>
          </li>
        </ul>
      </Panel>

      <Panel title="The historians' view" className="mt-5">
        <p className="font-serif text-base leading-relaxed text-ink">{retrospective}</p>
      </Panel>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Panel title="The country you leave">
          <ul className="space-y-3">
            {game.sectors.map((sector) => (
              <li key={sector.key}>
                <Meter
                  label={SECTOR_LABELS[sector.key]}
                  value={sector.health}
                  band={bandFor(sector.health)}
                />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="The record">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Elections won" value={game.career.electionsWon} />
            <Stat label="Bills passed" value={game.career.billsPassed} />
            <Stat label="Bills defeated" value={game.career.billsFailed} />
            <Stat label="Events resolved" value={game.career.eventsResolved} />
            <Stat label="Peak approval" value={pct(game.career.peakApproval, 1)} tone="gain" />
            <Stat label="Lowest approval" value={pct(game.career.lowestApproval, 1)} tone="loss" />
            <Stat label="Final debt" value={money(game.debt)} />
            <Stat label="Final treasury" value={money(game.treasury)} />
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Button variant="primary" onClick={() => void quitToTitle()}>
          Return to the title
        </Button>
      </div>
    </div>
  );
}
