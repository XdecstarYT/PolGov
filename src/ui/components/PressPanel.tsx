/**
 * PressPanel.tsx — who owns the feed, and what the government does
 * about it.
 *
 * The two decisions here have opposite signatures, deliberately shown
 * side by side: a pressure campaign moves the freedom index a large,
 * visible amount for a single week's cost, while a quiet ownership
 * transfer moves concentration almost nothing on the day it happens and
 * is cheaper every time — the entire point being that a government
 * reading this panel once sees why one route gets a headline and the
 * other does not.
 */

import { useGame } from '../../state/store.ts';
import {
  OWNER_TYPES,
  PRESS_POSTURES,
  describePress,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function PressPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const press = game.press;

  return (
    <Panel title="The press" aside={press.posture}>
      <Kicker>Pressure is fast and visible. Ownership is slow and quiet</Kicker>
      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="Freedom index"
          value={press.freedomIndex.toFixed(0)}
          detail="how free the press actually is to cover this government"
          tone={press.freedomIndex < 35 ? 'loss' : press.freedomIndex < 55 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Concentration"
          value={press.concentration.toFixed(2)}
          detail="the Herfindahl–Hirschman Index of who owns the outlets"
          tone={press.concentration > 0.55 ? 'loss' : press.concentration > 0.4 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Disinformation"
          value={press.disinformation.toFixed(0)}
          detail="how much of what circulates is false"
          tone={press.disinformation > 45 ? 'loss' : press.disinformation > 25 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="mt-3 space-y-1">
        {OWNER_TYPES.map((t) => (
          <div key={t.key} className="flex items-center gap-2 text-xs text-ink-faint">
            <span className="w-32 shrink-0">{t.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-surface-raised">
              <div
                className="h-full bg-accent"
                style={{ width: `${(press.ownership[t.key] * 100).toFixed(1)}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right tnum">
              {(press.ownership[t.key] * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describePress(press)}</p>

      <div className="mt-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-ink-faint">Posture toward the press</p>
        {PRESS_POSTURES.map((t) => (
          <div key={t.key} className="border-t border-rule pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={press.posture === t.key || game.politicalCapital < 4}
                onClick={() => void dispatch({ type: 'set_press_posture', posture: t.key })}
              >
                {t.label}
              </Button>
              {press.posture === t.key && <Tag tone="accent">current</Tag>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={game.politicalCapital < 5} onClick={() => void dispatch({ type: 'pressure_outlet' })}>
          Pressure a critical outlet · 5 PC
        </Button>
        <span className="text-[0.7rem] text-ink-faint">Immediate and visible.</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {OWNER_TYPES.filter((t) => t.key !== 'independent').map((t) => (
          <Button
            key={t.key}
            disabled={game.politicalCapital < 3 || press.ownership.independent <= 0.01}
            onClick={() =>
              void dispatch({
                type: 'consolidate_ownership',
                target: t.key as 'conglomerate' | 'state_owned' | 'partisan_patron',
              })
            }
          >
            Quiet transfer to {t.label.toLowerCase()} · 3 PC
          </Button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          disabled={game.politicalCapital < 12}
          onClick={() => void dispatch({ type: 'break_up_ownership' })}
        >
          Antitrust action · 12 PC
        </Button>
        <Button
          disabled={game.politicalCapital < 5}
          onClick={() => void dispatch({ type: 'launch_media_literacy' })}
        >
          Media-literacy programme · 5 PC
        </Button>
      </div>

      <div className="mt-3">
        <Meter
          label="Literacy stock"
          value={press.literacyStock}
          band="a decaying counter to disinformation"
        />
      </div>
    </Panel>
  );
}
