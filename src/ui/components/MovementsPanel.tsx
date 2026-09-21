/**
 * MovementsPanel.tsx — what is organised, and what to do about it.
 *
 * The only panel in the game with four buttons and no recommended one.
 * Each answer states its own cost in the words the engine actually
 * charges, including the cost that arrives later: conceding teaches the
 * country that organising works, and suppressing teaches it that it does
 * not. Both are true and both are bills.
 *
 * The panel deliberately does not say which to pick, and it deliberately
 * does say what each one does to the belief that acting works — because
 * that consequence lands two terms out and no player would infer it.
 */

import { useGame } from '../../state/store.ts';
import {
  TACTIC_LABELS,
  describeMovements,
  disruption,
  findMovement,
  responseEffects,
} from '../../game/index.ts';
import type { MovementResponse } from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

const ANSWERS: { key: MovementResponse; label: string }[] = [
  { key: 'concede', label: 'Concede' },
  { key: 'negotiate', label: 'Negotiate' },
  { key: 'ignore', label: 'Do nothing' },
  { key: 'suppress', label: 'Clear them out' },
];

export function MovementsPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const m = game.movements;
  const pressure = m.efficacyPressure;

  return (
    <div className="space-y-4">
      <Panel
        title="What is organised"
        aside={m.active.length === 0 ? 'nothing' : `${m.active.length} live`}
      >
        <Kicker>Four answers, and none of them is free</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Live movements"
            value={`${m.active.length}`}
            tone={m.active.length > 4 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Disruption"
            value={disruption(m).toFixed(2)}
            detail="what it is costing the country"
            tone={disruption(m) > 2 ? 'loss' : disruption(m) > 0.8 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Your answers have"
            value={
              Math.abs(pressure) < 0.5
                ? 'held'
                : pressure > 0
                  ? `+${pressure.toFixed(0)}`
                  : pressure.toFixed(0)
            }
            detail="moved the belief that acting works"
            tone={pressure < -3 ? 'loss' : pressure > 3 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeMovements(m)}</p>
        {pressure < -3 && (
          <p className="mt-3 border-l-2 border-loss/50 pl-3 text-xs leading-relaxed text-ink-soft">
            You have been clearing them out. It works, and what it is building is a country
            that has stopped asking — quieter on every measure, and with nowhere for any of
            this to go.
          </p>
        )}
        {pressure > 3 && (
          <p className="mt-3 border-l-2 border-warn/50 pl-3 text-xs leading-relaxed text-ink-soft">
            You have been giving way. Each concession is also a demonstration that organising
            is how things get done here, which is true — and which is why there will be more of
            them.
          </p>
        )}
      </Panel>

      {m.active.map((movement) => {
        const template = findMovement(movement.key);
        const step = template.repertoire.indexOf(movement.tactic) + 1;
        return (
          <Panel
            key={movement.key}
            title={template.label}
            aside={`${TACTIC_LABELS[movement.tactic]} · ${step} of ${template.repertoire.length}`}
          >
            <p className="text-sm leading-relaxed text-ink-soft">{template.about}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              They are asking for <strong>{template.demand}</strong>.
            </p>

            <div className="mt-4">
              <Meter
                label="Support"
                value={movement.support}
                band={`${movement.support.toFixed(0)}%`}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-ink-faint tnum">
                <span>intensity {movement.intensity.toFixed(0)}</span>
                <span aria-hidden>·</span>
                <span>
                  {movement.weeksIgnored === 0
                    ? 'answered recently'
                    : `${movement.weeksIgnored} weeks unanswered`}
                </span>
                {movement.lastResponse && <Tag tone="neutral">answered this week</Tag>}
                {movement.weeksIgnored > 20 && !movement.lastResponse && (
                  <Tag tone="warn">about to escalate</Tag>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {ANSWERS.map(({ key, label }) => {
                const effect = responseEffects(movement, key, game.economy.gdp);
                return (
                  <div key={key} className="border-t border-rule pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        disabled={
                          movement.lastResponse !== null ||
                          game.politicalCapital < effect.politicalCapital
                        }
                        onClick={() =>
                          void dispatch({
                            type: 'answer_movement',
                            movement: movement.key,
                            response: key,
                          })
                        }
                      >
                        {label}
                      </Button>
                      <span className="tnum text-[0.7rem] text-ink-faint">
                        {effect.money > 0 && `₡${effect.money.toFixed(0)}bn/yr · `}
                        {effect.politicalCapital > 0 && `${effect.politicalCapital} PC`}
                        {effect.money === 0 && effect.politicalCapital === 0 && 'free'}
                        {effect.norms < 0 && ` · ${effect.norms} norms`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{effect.summary}</p>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}

      {m.resolved.length > 0 && (
        <Panel title="How the last ones ended" tone="quiet">
          <ul className="space-y-1 text-xs text-ink-soft">
            {m.resolved
              .slice(-6)
              .reverse()
              .map((movement, i) => (
                <li key={`${movement.key}-${i}`} className="flex justify-between gap-3">
                  <span>{findMovement(movement.key).label}</span>
                  <span className="text-ink-faint">
                    {movement.outcome === 'won'
                      ? 'got what it asked for'
                      : movement.outcome === 'suppressed'
                        ? 'cleared out'
                        : movement.outcome === 'absorbed'
                          ? 'the grievance went away'
                          : 'ran out of people'}
                    {' · peaked at '}
                    {movement.peakSupport.toFixed(0)}%
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
