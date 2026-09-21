/**
 * CommunicationsPanel.tsx — what the government says on purpose, before
 * anyone else says it for them.
 *
 * The one number this panel exists to surface is `pendingDisclosures`:
 * a government that never looks at this figure discovers it only when
 * it leaks, at the larger cost a leak always carries and on a week it
 * did not choose. Releasing it on purpose is right here, at the smaller,
 * predictable cost the same information would have cost announced.
 */

import { useGame } from '../../state/store.ts';
import {
  COMMS_STRATEGIES,
  PENDING_DISCLOSURES_CEILING,
  describeCommunications,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function CommunicationsPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const comms = game.communications;

  return (
    <Panel title="Communications" aside={comms.strategy}>
      <Kicker>A leak is information you don't control the timing of</Kicker>
      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="Discipline"
          value={comms.discipline.toFixed(0)}
          detail="how on-message the government is"
          tone={comms.discipline < 30 ? 'loss' : comms.discipline < 50 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Pending disclosures"
          value={comms.pendingDisclosures.toFixed(1)}
          detail="sitting unannounced — released on purpose, or found"
          tone={
            comms.pendingDisclosures > PENDING_DISCLOSURES_CEILING * 0.6
              ? 'loss'
              : comms.pendingDisclosures > PENDING_DISCLOSURES_CEILING * 0.3
                ? 'warn'
                : 'neutral'
          }
        />
        <Stat
          label="Leaks this run"
          value={`${comms.leaksThisRun}`}
          detail="each one makes the press hungrier for the next"
          tone={comms.leaksThisRun >= 3 ? 'loss' : comms.leaksThisRun >= 1 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="mt-3">
        <Meter
          label="Pending disclosures"
          value={(comms.pendingDisclosures / (PENDING_DISCLOSURES_CEILING * 1.5)) * 100}
          band={`ceiling ${PENDING_DISCLOSURES_CEILING}`}
        />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeCommunications(comms)}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          disabled={comms.pendingDisclosures < 0.01 || game.politicalCapital < 4}
          onClick={() => void dispatch({ type: 'release_information' })}
        >
          Get ahead of it · 4 PC
        </Button>
        <span className="text-[0.7rem] text-ink-faint">
          Announced on a week this government chose — worth less to a reporter than a week it did not.
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-ink-faint">Communications strategy</p>
        {COMMS_STRATEGIES.map((t) => (
          <div key={t.key} className="border-t border-rule pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={comms.strategy === t.key || game.politicalCapital < 4}
                onClick={() => void dispatch({ type: 'set_comms_strategy', strategy: t.key })}
              >
                {t.label}
              </Button>
              {comms.strategy === t.key && <Tag tone="accent">current</Tag>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
