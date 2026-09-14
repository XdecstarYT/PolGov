/**
 * Report.tsx — phase 7. "What changed, and why."
 *
 * The transparency pillar made concrete. Every itemised entry the engine wrote
 * during the turn is shown, grouped by what it affected, with the cause in
 * plain language beside it. If a number on the top bar moved, the reason for
 * it is on this page.
 */

import { useMemo } from 'react';
import { useGame } from '../../state/store.ts';
import {
  TURNS_PER_TERM,
  coalitionPartners,
  isThreateningExit,
  type LogEntry,
  type LogKind,
} from '../../game/index.ts';
import {
  Button,
  Delta,
  EmptyNote,
  Kicker,
  Panel,
  PartyMark,
  Tag,
  bandFor,
  money,
  pct,
} from '../components/Primitives.tsx';

const GROUPS: { kind: LogKind; title: string; blurb: string }[] = [
  { kind: 'legislature', title: 'The chamber', blurb: 'Divisions held this month.' },
  { kind: 'event', title: 'Events', blurb: 'What reached the desk, and what you did about it.' },
  { kind: 'approval', title: 'Approval', blurb: 'Every movement in your public standing.' },
  { kind: 'political_capital', title: 'Political capital', blurb: 'Earned and spent.' },
  { kind: 'treasury', title: 'Treasury', blurb: 'Money in and money out.' },
  { kind: 'debt', title: 'Debt', blurb: 'Borrowing, interest, and repayment.' },
  { kind: 'sector', title: 'Public services', blurb: 'Health of each sector and its funding.' },
  { kind: 'coalition', title: 'Coalition', blurb: 'How your partners took the month.' },
  { kind: 'note', title: 'Notes', blurb: '' },
  { kind: 'election', title: 'Election', blurb: '' },
];

export function Report() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const log = useMemo(
    () => game.logs.find((l) => l.turnNumber === game.turnNumber)?.entries ?? [],
    [game.logs, game.turnNumber],
  );

  const netApproval = sumOf(log, 'approval');
  const netCapital = sumOf(log, 'political_capital');
  const netTreasury = sumOf(log, 'treasury');
  const netDebt = sumOf(log, 'debt');

  const passed = log.filter((e) => e.kind === 'legislature' && e.cause.includes('passed'));
  const failed = log.filter((e) => e.kind === 'legislature' && e.cause.includes('failed'));
  const unhappy = coalitionPartners(game.parties).filter(isThreateningExit);
  const lastTurnOfTerm = game.turnNumber >= TURNS_PER_TERM;

  return (
    <div className="space-y-5">
      <Panel
        title={`End of month ${game.turnNumber}`}
        aside={`Term ${game.termNumber}`}
      >
        <Kicker>The month in one line</Kicker>
        <p className="font-serif text-lg leading-snug text-ink">
          {passed.length > 0
            ? `${passed.length} bill${passed.length === 1 ? '' : 's'} carried`
            : 'Nothing carried'}
          {failed.length > 0 && `, ${failed.length} defeated`}. Approval{' '}
          {netApproval >= 0 ? 'up' : 'down'} {Math.abs(netApproval).toFixed(1)} to{' '}
          {pct(game.approval, 1)}.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-rule pt-4 sm:grid-cols-4">
          <SummaryFigure label="Approval" delta={netApproval} now={pct(game.approval, 1)} unit="pts" />
          <SummaryFigure
            label="Capital"
            delta={netCapital}
            now={`${game.politicalCapital.toFixed(0)} PC`}
            unit="PC"
          />
          <SummaryFigure label="Treasury" delta={netTreasury} now={money(game.treasury)} unit="₡bn" />
          <SummaryFigure label="Debt" delta={netDebt} now={money(game.debt)} unit="₡bn" />
        </div>

        {unhappy.length > 0 && (
          <div className="mt-4 border border-warn p-3">
            <Kicker>Coalition warning</Kicker>
            <ul className="space-y-1">
              {unhappy.map((partner) => (
                <li key={partner.id} className="flex items-center gap-2 text-sm text-ink-soft">
                  <PartyMark color={partner.color} glyph={partner.glyph} />
                  <span className="text-ink">{partner.name}</span>
                  <span className="tnum">
                    mood {(partner.coalitionMood ?? 0).toFixed(0)} — {bandFor(partner.coalitionMood ?? 0)}
                  </span>
                  <Tag tone="loss">threatening to leave</Tag>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              A partner whose mood reaches zero walks out. If that costs your majority, the
              government falls and a new agreement has to be negotiated.
            </p>
          </div>
        )}

        <div className="mt-4">
          <Button variant="primary" onClick={() => void dispatch({ type: 'advance_phase' })}>
            {lastTurnOfTerm ? 'To the election →' : 'Begin the next month →'}
          </Button>
        </div>
      </Panel>

      <Panel title="What changed, and why" aside={`${log.length} entries`}>
        {log.length === 0 ? (
          <EmptyNote>Nothing moved this month.</EmptyNote>
        ) : (
          <div className="space-y-6">
            {GROUPS.map((group) => {
              const entries = log.filter((entry) => entry.kind === group.kind);
              if (entries.length === 0) return null;
              return (
                <section key={group.kind}>
                  <h3 className="font-serif text-sm font-semibold text-ink">{group.title}</h3>
                  {group.blurb && (
                    <p className="mb-1.5 text-xs text-ink-faint">{group.blurb}</p>
                  )}
                  <ul className="divide-y divide-rule border-t border-rule">
                    {entries.map((entry, index) => (
                      <li
                        key={`${entry.label}-${index}`}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink">{entry.label}</div>
                          <div className="text-xs leading-relaxed text-ink-faint">{entry.cause}</div>
                        </div>
                        {entry.delta !== null && (
                          <div className="shrink-0 text-sm">
                            <Delta value={entry.delta} unit={entry.unit ?? ''} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function SummaryFigure({
  label,
  delta,
  now,
  unit,
}: {
  label: string;
  delta: number;
  now: string;
  unit: string;
}) {
  return (
    <div>
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </div>
      <div className="font-serif text-lg tnum text-ink">{now}</div>
      <div className="text-xs">
        <Delta value={delta} unit={unit} /> <span className="text-ink-faint">this month</span>
      </div>
    </div>
  );
}

/**
 * Net change for a resource this month. Informational lines — gross revenue,
 * gross spending, interest charged, rate changes — are deliberately excluded:
 * they explain the movement but are not themselves the movement, and summing
 * them would make this figure disagree with the top bar.
 */
function sumOf(entries: LogEntry[], kind: LogKind): number {
  return entries
    .filter((entry) => entry.kind === kind && entry.delta !== null && !entry.informational)
    .reduce((total, entry) => total + (entry.delta ?? 0), 0);
}
