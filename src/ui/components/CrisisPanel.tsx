/**
 * CrisisPanel.tsx — the ladder, and the two buttons on it.
 *
 * The panel is built around one asymmetry, which is the whole mechanic:
 * climbing is cheap, popular and fast, and coming down is expensive,
 * unpopular and slow. So the two buttons sit next to each other with their
 * costs on them, and the approval consequence of each is stated in advance.
 * A player who escalates because the polling improves is doing exactly what
 * the model is about — but they should be able to see that that is what
 * they are doing.
 *
 * What is deliberately absent: any way to fight. There is no battle here to
 * win. What decides a war is the force ratio, the alliances and the resolve,
 * all of which were set by budgets passed years before — which is the
 * argument the defence panel exists to make.
 */

import { useGame } from '../../state/store.ts';
import {
  DEESCALATE_PC_COST,
  DEESCALATION_APPROVAL,
  ESCALATE_PC_COST,
  ESCALATION_APPROVAL,
  SETTLE_PC_COST,
  STAGE_LABELS,
  balanceOfForce,
  describeCrisis,
  deterred,
  findNation,
  live,
  rungOf,
} from '../../game/index.ts';
import { Button, EmptyNote, Panel, Tag } from './Primitives.tsx';

const RUNGS = ['incident', 'standoff', 'crisis', 'war'] as const;

export function CrisisPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const open = live(game.crises);
  if (open.length === 0) {
    return (
      <Panel title="Quarrels" tone="quiet">
        <EmptyNote>
          Nothing is going on with anybody. Most weeks are like this, and no government has ever
          been thanked for one.
        </EmptyNote>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      {open.map((crisis) => {
        const them = findNation(crisis.nation);
        const rung = rungOf(crisis.stage);
        const balance = balanceOfForce(crisis, game.military, game.world);
        const held = deterred(crisis, game.military, game.world);

        return (
          <Panel
            key={crisis.id}
            title={`${STAGE_LABELS[crisis.stage]} with ${them.name}`}
            aside={`week ${crisis.startedTurn}`}
            tone="seal"
          >
            <p className="font-serif text-[1.02rem] leading-relaxed text-ink">{crisis.cause}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {describeCrisis(crisis, game.military, game.world)}
            </p>

            {/* The ladder itself, with the current rung marked. */}
            <ol
              className="mt-4 flex gap-[2px]"
              role="img"
              aria-label={`At rung ${rung + 1} of 4: ${STAGE_LABELS[crisis.stage]}`}
            >
              {RUNGS.map((stage, index) => (
                <li
                  key={stage}
                  className="flex-1 border-t-2 pt-1.5 text-[0.62rem] uppercase tracking-[0.08em]"
                  style={{
                    borderColor:
                      index < rung
                        ? 'var(--color-rule-strong)'
                        : index === rung
                          ? 'var(--color-seal)'
                          : 'var(--color-rule)',
                    color:
                      index === rung ? 'var(--color-seal)' : 'var(--color-ink-faint)',
                  }}
                >
                  {stage}
                </li>
              ))}
            </ol>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-faint">
              <span>
                Balance of force{' '}
                <span className="tnum text-ink-soft">{balance.toFixed(2)}</span>
                {balance < 1 ? ' — against us' : ' — with us'}
              </span>
              <span>
                Their resolve <span className="tnum text-ink-soft">{crisis.theirResolve.toFixed(0)}</span>
              </span>
              <span>
                Ours <span className="tnum text-ink-soft">{crisis.ourResolve.toFixed(0)}</span>
              </span>
              {crisis.casualties > 0 && (
                <span className="text-loss">
                  {crisis.casualties.toFixed(0)} casualties
                </span>
              )}
              {held && <Tag tone="gain">deterred</Tag>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                disabled={
                  crisis.stage === 'war' || game.politicalCapital < ESCALATE_PC_COST
                }
                onClick={() => void dispatch({ type: 'escalate_crisis', crisisId: crisis.id })}
              >
                Stand firm · {ESCALATE_PC_COST} PC · +{ESCALATION_APPROVAL}
              </Button>
              <Button
                disabled={game.politicalCapital < DEESCALATE_PC_COST}
                onClick={() => void dispatch({ type: 'de_escalate_crisis', crisisId: crisis.id })}
              >
                Step back · {DEESCALATE_PC_COST} PC · {DEESCALATION_APPROVAL}
              </Button>
              <Button
                variant="primary"
                disabled={game.politicalCapital < SETTLE_PC_COST}
                onClick={() => void dispatch({ type: 'settle_crisis', crisisId: crisis.id })}
              >
                Settle · {SETTLE_PC_COST} PC
              </Button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              Standing firm is popular the week it happens and hardens them too, which nobody
              will report until it matters. Stepping back costs approval immediately and in
              public, and is very often the right thing to do. Settlement terms are not
              negotiated — they are what the balance of force and the remaining resolve produce,
              and both were decided by budgets passed years ago.
            </p>
          </Panel>
        );
      })}
    </div>
  );
}
