/**
 * ForcesPanel.tsx — the army, as a government sees it.
 *
 * Three things this panel exists to put on the desk, none of which any
 * player would infer from a strength figure.
 *
 * THE POOL IS NOT THE FORCE. The eligible population is shown beside
 * what is actually under arms, and the gap between them is measured in
 * months of training rather than in money. A government looking at
 * fourteen million eligible people and an army of a hundred thousand
 * should be able to see, before it needs to, that the second number
 * cannot be turned into the first.
 *
 * THE RESERVE IS THE ONLY FAST SOURCE OF SOLDIERS, AND IT IS FINITE.
 * Shown as depth rather than a count, because what matters is how long
 * it would last, and the week it empties is the week a war changes
 * character.
 *
 * AND THE CHOICE BETWEEN COMPETENCE AND LOYALTY IS NOT RESOLVED HERE.
 * Every commander is listed with both, side by side, and the panel never
 * ranks them or recommends a sacking. A government that appoints only
 * people it trusts gets an army run by people who are trusted; one that
 * appoints only the capable gets an army it does not fully control. The
 * panel's job is to make sure the choice is visible, not to make it.
 */

import { useGame } from '../../state/store.ts';
import {
  ARMY_SHARE,
  MANPOWER_MODELS,
  committedFormationShare,
  demobilisationLockWeeks,
  describeManpower,
  describeOrbat,
  findEchelon,
  findFormation,
  findManpowerModel,
  findTrait,
  mobilisationChange,
  orderLag,
  orderOfBattle,
  reliability,
  reserveDepth,
  restShares,
  serving,
  underArms,
  unreliableShare,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

const thousands = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : `${Math.round(n / 1000)}k`;

export function ForcesPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const m = game.manpower;
  const o = game.orbat;
  const week = game.turnNumber;
  const force = underArms(m);
  const rest = restShares(m.model);
  const template = findManpowerModel(m.model);
  const doubtful = unreliableShare(o);
  const lag = orderLag(o, 0.5);
  const locked = demobilisationLockWeeks(m, week);

  return (
    <div className="space-y-4">
      <Panel title="Who is under arms" aside={template.label.toLowerCase()}>
        <Kicker>The pool is not the force</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Under arms"
            value={thousands(force)}
            detail={`${((force / Math.max(1, m.pool)) * 100).toFixed(2)}% of those eligible`}
          />
          <Stat
            label="Eligible"
            value={thousands(m.pool)}
            detail="and months of training away from being soldiers"
          />
          <Stat
            label="Reserve"
            value={`${reserveDepth(m).toFixed(2)}×`}
            detail="the standing force, already trained"
            tone={reserveDepth(m) < 0.15 ? 'loss' : reserveDepth(m) < 0.5 ? 'warn' : 'neutral'}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <Stat label="Morale" value={m.morale.toFixed(0)} tone={m.morale < 45 ? 'loss' : 'neutral'} />
          <Stat
            label="Quality"
            value={m.quality.toFixed(0)}
            detail="what they are worth as soldiers"
            tone={m.quality < 45 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Looking for a way out"
            value={`${(m.resistance * 100).toFixed(0)}%`}
            tone={m.resistance > 0.35 ? 'loss' : m.resistance > 0.12 ? 'warn' : 'neutral'}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeManpower(m)}</p>

        <div className="mt-4 border-t border-rule pt-3">
          <p className="label mb-2 text-ink-faint">The shape of it</p>
          <Meter
            label="In training"
            value={(m.recruits / Math.max(1, force)) * 100}
            band={`${((m.recruits / Math.max(1, force)) * 100).toFixed(1)}% · ${(rest.recruits * 100).toFixed(1)}% is ordinary here`}
          />
          <Meter
            label="Trained"
            value={(m.trained / Math.max(1, force)) * 100}
            band={`${((m.trained / Math.max(1, force)) * 100).toFixed(1)}%`}
          />
          <Meter
            label="Have been in a war"
            value={(m.veterans / Math.max(1, force)) * 100}
            band={`${((m.veterans / Math.max(1, force)) * 100).toFixed(1)}% · ${(rest.veterans * 100).toFixed(1)}% is ordinary here`}
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Length of service decides this, not spending. A ten-year career accumulates
            veterans and an eighteen-month term never does, because the people it raises
            leave again before they are any good.
          </p>
        </div>
      </Panel>

      <Panel
        title="How the country fills an army"
        aside={locked > 0 ? `locked ${Math.ceil(locked / 4)} months` : 'open'}
      >
        <Kicker>A ratchet, not a dial</Kicker>
        <div className="space-y-2">
          {MANPOWER_MODELS.map((key) => {
            const option = findManpowerModel(key);
            const change = mobilisationChange(m, key, week);
            const current = key === m.model;
            return (
              <div key={key} className="border-t border-rule pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={
                      current ||
                      !change.allowed ||
                      game.politicalCapital < change.politicalCapital
                    }
                    onClick={() => void dispatch({ type: 'set_mobilisation', model: key })}
                  >
                    {option.label}
                  </Button>
                  {current && <Tag tone="accent">current</Tag>}
                  {!current && change.allowed && (
                    <span className="text-[0.7rem] text-ink-faint tnum">
                      {change.politicalCapital} PC
                      {change.approvalCost > 0 && ` · −${change.approvalCost.toFixed(1)} approval`}
                      {change.normsCost > 0 && ` · −${change.normsCost.toFixed(1)} norms`}
                      {` · ${Math.round(option.demobilisationWeeks / 52)}yr to undo`}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{option.blurb}</p>
                {!current && !change.allowed && change.reason && (
                  <p className="mt-1 text-xs leading-relaxed text-loss/80">{change.reason}</p>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="The order of battle"
        aside={`${findEchelon(o.topLevel).label.toLowerCase()} at the top`}
      >
        <Kicker>Orders take time to arrive</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="An order takes"
            value={`${lag.toFixed(1)} wk`}
            detail={`through ${o.chainDepth} headquarters`}
            tone={lag > 2.2 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Formations"
            value={`${o.formations.length}`}
            detail={`${Math.round(committedFormationShare(o) * 100)}% committed`}
          />
          <Stat
            label="Under doubtful command"
            value={`${(doubtful * 100).toFixed(0)}%`}
            detail="would not necessarily carry out an order"
            tone={doubtful > 0.25 ? 'loss' : doubtful > 0.12 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeOrbat(o, 0.5)}</p>

        <div className="mt-4 border-t border-rule pt-3">
          <p className="label mb-2 text-ink-faint">What there is</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs tnum">
            {orderOfBattle(o).map((row) => (
              <div key={row.kind} className="flex justify-between border-b border-rule/40 py-0.5">
                <span className="text-ink-soft">{findFormation(row.kind).label}</span>
                <span className="text-ink">
                  {row.count} · {thousands(row.personnel)}
                  {row.committed > 0 && (
                    <span className="text-warn"> · {row.committed} in the line</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            The army is {Math.round(ARMY_SHARE * 100)}% of everybody under arms; the rest are
            at sea, in the air, or somewhere nobody will confirm.
          </p>
        </div>
      </Panel>

      <Panel title="Who is commanding them" aside={`${serving(o).length} in post`}>
        <Kicker>Competence and loyalty are drawn separately</Kicker>
        <p className="mb-3 text-xs leading-relaxed text-ink-faint">
          There is no arrangement that gives a government both. Appointing only people you
          trust gets an army run by people who are trusted; appointing only the capable gets
          an army you do not fully control. This panel will not tell you which of these to do.
        </p>
        <div className="space-y-3">
          {serving(o).map((c) => {
            const reliable = reliability(c);
            const own = o.formations.filter((f) => f.parentId === c.id);
            return (
              <div key={c.id} className="border-t border-rule pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{c.name}</span>
                  <span className="text-[0.7rem] text-ink-faint tnum">
                    {findEchelon(c.echelon).label} · {own.length} formations ·{' '}
                    {thousands(own.reduce((s, f) => s + f.personnel, 0))}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-3 text-[0.7rem] tnum">
                  <span className="text-ink-soft">
                    competence <span className="text-ink">{c.competence.toFixed(0)}</span>
                  </span>
                  <span className={reliable < 55 ? 'text-loss' : 'text-ink-soft'}>
                    reliability <span className="text-ink">{reliable.toFixed(0)}</span>
                  </span>
                  <span className="text-ink-soft">
                    standing <span className="text-ink">{c.standing.toFixed(0)}</span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {c.traits.map((t) => (
                    <Tag key={t} tone="neutral">
                      {findTrait(t).label}
                    </Tag>
                  ))}
                  {c.competence > 72 && reliable < 55 && <Tag tone="warn">able, not certain</Tag>}
                  {c.battlesFought > 0 && (
                    <span className="text-[0.7rem] text-ink-faint tnum">
                      {c.battlesFought} weeks in command of a fight
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  {findTrait(c.traits[0]!).blurb}
                </p>
                <div className="mt-2">
                  <Button
                    disabled={serving(o).length < 2 || game.politicalCapital < 14}
                    onClick={() => void dispatch({ type: 'dismiss_commander', commander: c.id })}
                    title={
                      c.standing > 45
                        ? 'The army thinks they are doing well. Every officer who has been handed a difficult sector will draw a conclusion.'
                        : 'The army had reached the same view some time ago.'
                    }
                  >
                    Relieve of command · 14 PC
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
