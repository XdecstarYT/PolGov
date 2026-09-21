/**
 * ScandalsPanel.tsx — what happens after the story breaks.
 *
 * Three responses, laid out with their real trade-off rather than a
 * recommendation: admitting is the known price, shown up front; denying
 * is cheap today and carries a live risk of the confirmed-denial cost,
 * which this panel deliberately does not hide behind the small number;
 * investigating is the slow middle that actually brings the risk down
 * instead of leaving it to be found or not.
 */

import { useGame } from '../../state/store.ts';
import { SCANDAL_CAUSE_LABELS, SCANDAL_RESPONSES, describeScandal } from '../../game/index.ts';
import { Button, Kicker, Panel, Tag } from './Primitives.tsx';

export function ScandalsPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const scandals = game.scandals;
  if (scandals.length === 0) return null;

  return (
    <Panel title="Scandals" aside={`${scandals.length} open`}>
      <Kicker>The cover-up costs more than the crime — but only if found</Kicker>
      <div className="space-y-3">
        {scandals.map((scandal) => (
          <div key={scandal.id} className="border-t border-rule pt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-ink">{SCANDAL_CAUSE_LABELS[scandal.cause]}</span>
              <span className="flex items-center gap-1">
                <Tag tone={scandal.stage === 'confirmed' ? 'loss' : scandal.response ? 'neutral' : 'warn'}>
                  {scandal.stage}
                </Tag>
                {scandal.response && <Tag tone="accent">{scandal.response}</Tag>}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[0.7rem] text-ink-faint tnum">
              <span>severity {scandal.severity.toFixed(0)}</span>
              <span>risk {(scandal.escalationRisk * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{describeScandal(scandal)}</p>
            {scandal.response === null && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {SCANDAL_RESPONSES.map((r) => (
                  <Button
                    key={r.key}
                    onClick={() =>
                      void dispatch({ type: 'respond_scandal', scandalId: scandal.id, response: r.key })
                    }
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

