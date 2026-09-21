/**
 * StateCapacityPanel.tsx — how far the state actually reaches, and what
 * it costs to reach further than usual.
 *
 * The one figure this panel exists to make visible: STAND-DOWN COST. A
 * government reading "declare a state of emergency" as a single button
 * reads it as a single decision. It is a decision with a second half —
 * ending it — whose price is shown here rising with duration, so the
 * trap is visible on the desk rather than discovered a year into
 * holding the powers.
 */

import { useGame } from '../../state/store.ts';
import {
  EMERGENCY_LEVELS,
  describeStateCapacity,
  responseCapability,
  standDownCost,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function StateCapacityPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const capacity = game.stateCapacity;
  const cost = standDownCost(capacity);

  return (
    <Panel title="State capacity" aside={capacity.level === 'normal' ? 'ordinary rule' : capacity.level}>
      <Kicker>Reach, not will. And easy to declare, hard to stand down</Kicker>
      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="Reach"
          value={capacity.reach.toFixed(0)}
          detail="how much of the country the state can actually administer"
          tone={capacity.reach < 45 ? 'loss' : capacity.reach < 60 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Response capability"
          value={responseCapability(capacity).toFixed(0)}
          detail="reach, scaled by whatever level is currently in force"
        />
        <Stat
          label="Disaster readiness"
          value={capacity.disasterReadiness.toFixed(0)}
          detail="stockpile — depletes on declaration, rebuilds slowly"
          tone={capacity.disasterReadiness < 30 ? 'warn' : 'neutral'}
        />
      </div>

      {capacity.level !== 'normal' && (
        <div className="mt-3">
          <Meter
            label="Legitimacy debt"
            value={Math.min(100, capacity.legitimacyDebt)}
            band={`${capacity.weeksInEmergency} weeks in force · stand-down now costs ${cost.toFixed(0)} PC`}
          />
        </div>
      )}

      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeStateCapacity(capacity)}</p>

      <div className="mt-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-ink-faint">Level of rule</p>
        {EMERGENCY_LEVELS.filter((t) => t.key !== 'normal').map((t) => (
          <div key={t.key} className="border-t border-rule pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={capacity.level === t.key}
                onClick={() => void dispatch({ type: 'declare_emergency', level: t.key })}
              >
                Declare: {t.label}
              </Button>
              {capacity.level === t.key && <Tag tone="accent">current</Tag>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
          </div>
        ))}
        {capacity.level !== 'normal' && (
          <div className="border-t border-rule pt-2">
            <Button onClick={() => void dispatch({ type: 'stand_down_emergency' })}>
              Return to ordinary rule · {cost.toFixed(0)} PC
            </Button>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Rises every week the emergency continues. This is the cheapest it will ever be again.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          disabled={game.politicalCapital < 5}
          onClick={() => void dispatch({ type: 'invest_readiness' })}
        >
          Invest in disaster readiness · 5 PC
        </Button>
        <span className="text-[0.7rem] text-ink-faint">Built before it is needed, not after.</span>
      </div>
    </Panel>
  );
}
