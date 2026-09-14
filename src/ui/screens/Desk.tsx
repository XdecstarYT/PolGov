/**
 * Desk.tsx — the main hub.
 *
 * Persistent top bar (turn, capital, approval, treasury, seats), a centre
 * panel that changes with the phase, and a right rail carrying coalition mood
 * and the news feed.
 *
 * The whole turn loop is reachable with Tab and Enter: the phase advance
 * control is a real button in document order, and every phase's primary
 * action precedes its secondary ones.
 */

import { useMemo } from 'react';
import { useGame } from '../../state/store.ts';
import {
  MAJORITY_SEATS,
  TURNS_PER_TERM,
  coalitionPartners,
  coalitionSeats,
  hasMajority,
  isCampaignTurn,
  playerParty,
  type Phase,
} from '../../game/index.ts';
import {
  Button,
  Meter,
  Panel,
  PartyMark,
  Stat,
  Tag,
  bandFor,
  money,
  pct,
} from '../components/Primitives.tsx';
import { Briefing } from '../phases/Briefing.tsx';
import { EventsPhase } from '../phases/EventsPhase.tsx';
import { Agenda } from '../phases/Agenda.tsx';
import { BudgetRoom } from '../phases/BudgetRoom.tsx';
import { Report } from '../phases/Report.tsx';

const PHASE_ORDER: { phase: Phase; label: string; player: boolean }[] = [
  { phase: 'briefing', label: 'Briefing', player: false },
  { phase: 'events', label: 'Events', player: true },
  { phase: 'agenda', label: 'Agenda', player: true },
  { phase: 'budget', label: 'Budget', player: true },
  { phase: 'report', label: 'Report', player: false },
];

export function Desk() {
  const { game, theme, toggleTheme, quitToTitle } = useGame();
  if (!game) return null;

  const player = playerParty(game.parties);
  const blocSeats = coalitionSeats(game.parties);
  const majority = hasMajority(game.parties);
  const campaign = isCampaignTurn(game.turnNumber);

  const activeIndex = PHASE_ORDER.findIndex((p) => p.phase === game.phase);

  return (
    <div className="min-h-full">
      {/* ---------------------------- top bar ---------------------------- */}
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PartyMark color={player.color} glyph={player.glyph} />
                <span className="truncate font-serif text-base font-bold text-ink">
                  {player.name}
                </span>
              </div>
              <div className="text-[0.68rem] uppercase tracking-wide text-ink-faint tnum">
                {game.countryName} · Term {game.termNumber}, month {game.turnNumber} of{' '}
                {TURNS_PER_TERM}
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-start gap-x-6 gap-y-2">
              <Stat
                label="Capital"
                value={game.politicalCapital.toFixed(0)}
                detail="political capital"
                tone={game.politicalCapital < 10 ? 'warn' : 'neutral'}
              />
              <Stat
                label="Approval"
                value={pct(game.approval, 1)}
                detail={bandFor(game.approval)}
                tone={game.approval < 35 ? 'loss' : game.approval > 60 ? 'gain' : 'neutral'}
              />
              <Stat label="Treasury" value={money(game.treasury)} detail="cash in hand" />
              <Stat
                label="Debt"
                value={money(game.debt)}
                detail="outstanding"
                tone={game.debt > 400 ? 'loss' : game.debt > 250 ? 'warn' : 'neutral'}
              />
              <Stat
                label="Bloc"
                value={`${blocSeats}`}
                detail={majority ? `majority (needs ${MAJORITY_SEATS})` : `short of ${MAJORITY_SEATS}`}
                tone={majority ? 'neutral' : 'warn'}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Button variant="quiet" onClick={toggleTheme} title="Switch between light and dark">
                {theme === 'dark' ? 'Light' : 'Dark'}
              </Button>
              <Button variant="quiet" onClick={() => void quitToTitle()}>
                Save &amp; exit
              </Button>
            </div>
          </div>

          {/* phase rail */}
          <nav aria-label="Turn progress" className="mt-2 flex flex-wrap items-center gap-1">
            {PHASE_ORDER.map((step, index) => {
              const done = activeIndex > index;
              const current = activeIndex === index;
              return (
                <span
                  key={step.phase}
                  aria-current={current ? 'step' : undefined}
                  className={`border px-2 py-0.5 text-[0.68rem] uppercase tracking-wide ${
                    current
                      ? 'border-ink bg-ink text-paper'
                      : done
                        ? 'border-rule text-ink-faint'
                        : 'border-rule text-ink-faint opacity-60'
                  }`}
                >
                  {step.label}
                  {step.player && <span className="sr-only"> (you may act)</span>}
                  {done && <span className="sr-only"> (completed)</span>}
                  {current && <span className="sr-only"> (current phase)</span>}
                </span>
              );
            })}
            {campaign && <Tag tone="accent">Campaign</Tag>}
          </nav>
        </div>
      </header>

      {/* ---------------------------- body ---------------------------- */}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0">
          {game.phase === 'briefing' && <Briefing />}
          {game.phase === 'events' && <EventsPhase />}
          {game.phase === 'agenda' && <Agenda />}
          {game.phase === 'budget' && <BudgetRoom />}
          {game.phase === 'report' && <Report />}
        </main>

        <aside className="space-y-5">
          <CoalitionRail />
          <NewsRail />
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------- right rail ---------------------------- */

function CoalitionRail() {
  const { game } = useGame();
  if (!game) return null;
  const partners = coalitionPartners(game.parties);
  const player = playerParty(game.parties);

  return (
    <Panel title="Government" aside={`${coalitionSeats(game.parties)} seats`}>
      <div className="flex items-center gap-2 border-b border-rule pb-2.5">
        <PartyMark color={player.color} glyph={player.glyph} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{player.name}</span>
        <span className="text-sm tnum text-ink-soft">{player.seats}</span>
      </div>

      {partners.length === 0 ? (
        <p className="pt-3 text-xs leading-relaxed text-ink-faint">
          Governing alone. Without partners, every bill has to find its majority on the floor.
        </p>
      ) : (
        <ul className="space-y-3 pt-3">
          {partners.map((partner) => {
            const mood = partner.coalitionMood ?? 0;
            return (
              <li key={partner.id}>
                <Meter
                  label={
                    <span className="flex items-center gap-1.5">
                      <PartyMark color={partner.color} glyph={partner.glyph} />
                      <span className="truncate">{partner.shortName}</span>
                      <span className="text-ink-faint tnum">({partner.seats})</span>
                    </span>
                  }
                  value={mood}
                  band={mood < 30 ? 'Threatening exit' : bandFor(mood)}
                  accent={partner.color}
                />
                {partner.redLines.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {partner.redLines.map((line) => (
                      <li key={line.id} className="text-[0.7rem] leading-snug text-ink-faint">
                        — {line.description}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function NewsRail() {
  const { game } = useGame();
  const items = useMemo(() => game?.news ?? [], [game]);
  if (!game) return null;

  return (
    <Panel title="The press" aside={items.length > 0 ? `month ${items[0]?.turnNumber}` : undefined}>
      {items.length === 0 ? (
        <p className="text-xs text-ink-faint">
          Coverage of your first month appears once it has been resolved.
        </p>
      ) : (
        <ul className="space-y-3.5">
          {items.map((item) => (
            <li key={item.id} className="border-l-2 pl-2.5" style={{ borderColor: 'var(--color-rule-strong)' }}>
              <div className="text-[0.65rem] uppercase tracking-wide text-ink-faint">
                {item.outlet}
              </div>
              <h3 className="font-serif text-sm font-semibold leading-snug text-ink">
                {item.headline}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{item.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
