/**
 * EventsPhase.tsx — phase 2. The player must resolve everything that fired.
 *
 * The narrative text may be replaced by the AI narrator; the choices, their
 * costs and their consequences are fixed in code and are shown in full before
 * the player commits. Nothing here is hidden behind a die roll.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  EVENT_CATEGORY_LABELS,
  SECTOR_LABELS,
  type Effects,
  type GameEvent,
} from '../../game/index.ts';
import { embellishEvent } from '../../services/narrator.ts';
import { Button, Delta, Kicker, Panel, Tag, money } from '../components/Primitives.tsx';

/** Render an effects bundle as plain readable consequences. */
export function EffectSummary({ effects }: { effects: Effects }) {
  const parts: { label: string; value: number; unit: string }[] = [];

  if (effects.approval) parts.push({ label: 'Approval', value: effects.approval, unit: 'pts' });
  if (effects.treasury) parts.push({ label: 'Treasury', value: effects.treasury, unit: '₡bn' });
  if (effects.debt) parts.push({ label: 'Debt', value: effects.debt, unit: '₡bn' });
  if (effects.politicalCapital)
    parts.push({ label: 'Capital', value: effects.politicalCapital, unit: 'PC' });
  if (effects.revenueDelta)
    parts.push({ label: 'Revenue', value: effects.revenueDelta, unit: '₡bn/yr' });
  if (effects.coalitionMood)
    parts.push({ label: 'All partners', value: effects.coalitionMood, unit: 'mood' });

  for (const [key, value] of Object.entries(effects.sectorDeltas ?? {})) {
    if (value) parts.push({ label: SECTOR_LABELS[key as keyof typeof SECTOR_LABELS], value, unit: 'pts' });
  }
  for (const [key, value] of Object.entries(effects.fundingDeltas ?? {})) {
    if (value)
      parts.push({
        label: `${SECTOR_LABELS[key as keyof typeof SECTOR_LABELS]} funding`,
        value,
        unit: '₡bn/yr',
      });
  }

  if (parts.length === 0) {
    return <span className="text-xs text-ink-faint">No direct mechanical effect.</span>;
  }

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {parts.map((part) => (
        <li key={`${part.label}-${part.unit}`} className="text-xs">
          <span className="text-ink-faint">{part.label} </span>
          <Delta value={part.value} unit={part.unit} />
        </li>
      ))}
    </ul>
  );
}

export function EventsPhase() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const pending = game.events.filter((e) => !e.resolved);
  const resolved = game.events.filter((e) => e.resolved);

  if (game.events.length === 0) {
    return (
      <Panel title="Events" aside="nothing to resolve">
        <p className="text-sm text-ink-soft">
          A quiet week. Nothing has reached the desk that requires a decision.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={() => void dispatch({ type: 'advance_phase' })}>
            Continue to the agenda →
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      {pending.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}

      {resolved.map((event) => (
        <Panel key={event.id} title={event.title} aside="resolved">
          <p className="text-sm text-ink-soft">
            {event.chosenIndex !== null && event.choices[event.chosenIndex]?.label}
          </p>
        </Panel>
      ))}

      {pending.length === 0 && (
        <Button variant="primary" onClick={() => void dispatch({ type: 'advance_phase' })}>
          Continue to the agenda →
        </Button>
      )}
    </div>
  );
}

function EventCard({ event }: { event: GameEvent }) {
  const { game, dispatch } = useGame();
  const [narrative, setNarrative] = useState(event.narrative);

  useEffect(() => {
    let cancelled = false;
    if (!game) return;
    /* The fallback is already on screen; this only upgrades it if it arrives. */
    void embellishEvent(game, event).then((text) => {
      if (!cancelled && text) setNarrative(text);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  if (!game) return null;

  const severityWord = event.severity >= 3 ? 'Severe' : event.severity === 2 ? 'Serious' : 'Minor';

  return (
    <Panel
      title={event.title}
      aside={
        <span className="flex items-center gap-2">
          <Tag tone={event.category === 'opportunity' ? 'gain' : 'warn'}>
            {EVENT_CATEGORY_LABELS[event.category]}
          </Tag>
          <span>{severityWord}</span>
        </span>
      }
    >
      <p className="font-serif text-[0.95rem] leading-relaxed text-ink">{narrative}</p>

      <Kicker>
        <span className="mt-4 block">Your options</span>
      </Kicker>

      <ul className="space-y-2.5">
        {event.choices.map((choice, index) => {
          const affordable = game.politicalCapital >= choice.pcCost;
          return (
            <li key={choice.label}>
              <div
                className={`border p-3 ${affordable ? 'border-rule' : 'border-rule opacity-60'}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{choice.label}</span>
                  <span className="text-xs text-ink-faint tnum">
                    {choice.pcCost > 0 ? `${choice.pcCost} PC` : 'no capital cost'}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{choice.tradeoff}</p>
                <div className="mt-2">
                  <EffectSummary effects={choice.effects} />
                </div>
                <div className="mt-3">
                  <Button
                    variant={affordable ? 'primary' : 'default'}
                    disabled={!affordable}
                    onClick={() =>
                      void dispatch({
                        type: 'resolve_event',
                        eventId: event.id,
                        choiceIndex: index,
                      })
                    }
                  >
                    {affordable
                      ? 'Take this course'
                      : `Needs ${choice.pcCost} PC (you have ${game.politicalCapital.toFixed(0)})`}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-ink-faint">
        Money in hand: {money(game.treasury)} · Capital: {game.politicalCapital.toFixed(0)} PC
      </p>
    </Panel>
  );
}
