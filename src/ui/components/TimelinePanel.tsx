/**
 * TimelinePanel.tsx — what the country remembers.
 *
 * This is the screen that makes the difference between a strategy game
 * and an alternate history somebody is living in. A player at the end of
 * a long run can look back fifty or a hundred years and find that the
 * reason a region votes the way it does is a war nobody in the
 * government was alive for — and the entries are written in the register
 * a history would use rather than the register a turn report uses,
 * because the point is that they outlived the people who made them.
 *
 * Entries fade. Wars fade slowest, which is why the map of a country's
 * politics is so often a map of its wars, and the panel says which ones
 * are still doing work rather than only listing what happened.
 */

import { useGame } from '../../state/store.ts';
import {
  describeTimeline,
  lookBack,
  stillMatters,
  yearOf,
} from '../../game/index.ts';
import type { TimelineKind } from '../../game/index.ts';
import { Kicker, Panel, Stat, Tag } from './Primitives.tsx';

const TONE: Record<TimelineKind, 'neutral' | 'loss' | 'warn' | 'accent' | 'brass' | 'gain'> = {
  war: 'loss',
  government: 'warn',
  election: 'accent',
  treaty: 'gain',
  economy: 'warn',
  constitutional: 'brass',
  disaster: 'loss',
};

export function TimelinePanel() {
  const { game } = useGame();
  if (!game) return null;

  const timeline = game.timeline;
  const year = yearOf(timeline, game.turnNumber + (game.termNumber - 1) * 208);
  const entries = lookBack(timeline, year, 120);
  const live = stillMatters(timeline, year);

  return (
    <div className="space-y-4">
      <Panel title="What the country remembers" aside={`${year}`}>
        <Kicker>It outlives every government in it</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="In the record" value={`${timeline.entries.length}`} detail="entries" />
          <Stat
            label="Wars"
            value={`${timeline.wars.length}`}
            detail={
              timeline.wars.length > 0
                ? `${timeline.wars.reduce((s, w) => s + w.casualties, 0).toFixed(0)}k casualties in all`
                : 'none yet'
            }
            tone={timeline.wars.length > 0 ? 'loss' : 'neutral'}
          />
          <Stat
            label="Since"
            value={`${timeline.firstYear}`}
            detail={`${year - timeline.firstYear} years`}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {describeTimeline(timeline, year)}
        </p>
      </Panel>

      {live.length > 0 && (
        <Panel title="Still doing work" aside="what explains the present">
          <p className="mb-3 text-xs leading-relaxed text-ink-faint">
            Everything fades, and wars fade slowest — which is why the map of a country's
            politics is so often a map of its wars.
          </p>
          <div className="flex flex-wrap gap-2">
            {live.map((entry) => (
              <Tag key={entry.id} tone={TONE[entry.kind]}>
                {entry.title}
              </Tag>
            ))}
          </div>
        </Panel>
      )}

      {entries.length > 0 && (
        <Panel title="The record" aside="newest first">
          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.id} className="border-t border-rule pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{entry.title}</span>
                  <span className="flex items-center gap-2">
                    {entry.endYear === null && <Tag tone="warn">continuing</Tag>}
                    <span className="text-[0.7rem] text-ink-faint tnum">
                      {entry.endYear === null
                        ? `${year - entry.startYear} years so far`
                        : `${year - entry.startYear} years ago`}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{entry.summary}</p>
                {entry.consequences.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {entry.consequences.map((line, i) => (
                      <li key={i} className="text-xs leading-relaxed text-ink-faint">
                        · {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {timeline.entries.length === 0 && (
        <Panel title="The record">
          <p className="text-sm leading-relaxed text-ink-soft">
            Nothing yet. Everything the country is now, it was when this government arrived — and
            whatever goes in here will still be here long after this government is not.
          </p>
        </Panel>
      )}
    </div>
  );
}
