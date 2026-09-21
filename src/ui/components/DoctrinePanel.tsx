/**
 * DoctrinePanel.tsx — what the army believes, and the decade nobody sees.
 *
 * Two things this panel puts in front of a government that no briefing
 * would.
 *
 * Beside every doctrine it could order, the number of YEARS before the
 * army would actually be doing it — because a government reading a list
 * of doctrines will assume it is choosing one, and it is not. It is
 * starting a process that finishes under a successor, at the speed
 * officers retire, and the interval in between is one where the army is
 * worse at both than it was at either.
 *
 * And beside every research programme, the doctrine it was specified
 * against. A programme is an answer to a question asked today, delivered
 * into a decade that may be asking a different one. The panel does not
 * warn about this in a tooltip; it prints the assumption next to the
 * thing, because the assumption IS the decision.
 *
 * The panel does not recommend changing doctrine. Every army prepares
 * for the last war and it is rational to — the doctrine that won it is
 * the one with evidence behind it, and the alternative is a theory.
 */

import { useGame } from '../../state/store.ts';
import {
  RESEARCH_TEMPLATES,
  WAR_DOCTRINE_TEMPLATES,
  describeDoctrine,
  describeResearch,
  doctrineChange,
  effectiveness,
  findResearch,
  findWarDoctrine,
  researchCost,
  running,
  yearsToAdopt,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function DoctrinePanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const doctrine = game.doctrine;
  const current = findWarDoctrine(doctrine.current);
  const changing = doctrine.ordered !== null && doctrine.ordered !== doctrine.current;
  const live = running(doctrine);

  return (
    <div className="space-y-4">
      <Panel title="What the army believes" aside={current.label.toLowerCase()}>
        <Kicker>A belief system, not a setting</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Doctrine" value={current.label} detail={`learned from ${current.learnedFrom}`} />
          <Stat
            label="Delivering"
            value={`${(effectiveness(doctrine) * 100).toFixed(0)}%`}
            detail={changing ? 'of what either doctrine would' : 'of what it should'}
            tone={effectiveness(doctrine) < 0.85 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Last war suggested"
            value={
              doctrine.lastWarLesson ? findWarDoctrine(doctrine.lastWarLesson).label : 'nothing yet'
            }
            detail="which is the only evidence anybody has"
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeDoctrine(doctrine)}</p>
        {changing && (
          <div className="mt-3">
            <Meter
              label={`Adopting ${findWarDoctrine(doctrine.ordered!).label.toLowerCase()}`}
              value={doctrine.adoption * 100}
              band={`${(doctrine.adoption * 100).toFixed(0)}% · about ${yearsToAdopt(doctrine).toFixed(0)} years to go`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                disabled={game.politicalCapital < 28}
                onClick={() => void dispatch({ type: 'force_doctrine' })}
              >
                Replace the officer corps · 28 PC
              </Button>
              <span className="text-[0.7rem] text-ink-faint">
                It works, immediately, and costs every officer who knew what they were doing.
              </span>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="How wars are won" aside="years, not weeks">
        <Kicker>Every army prepares for the last war, and it is rational to</Kicker>
        <p className="mb-3 text-xs leading-relaxed text-ink-faint">
          The doctrine that won the last war is the one with evidence behind it, and the officers
          who executed it are the ones who were promoted for executing it. The alternative is a
          theory held by somebody junior about a war nobody has fought. A government that changes
          doctrine on a theory is betting against the only data anybody has, and is right about
          one time in three.
        </p>
        <div className="space-y-2">
          {WAR_DOCTRINE_TEMPLATES.map((template) => {
            const change = doctrineChange(doctrine, template.key);
            const isCurrent = doctrine.current === template.key && !changing;
            return (
              <div key={template.key} className="border-t border-rule pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={
                      isCurrent ||
                      !change.allowed ||
                      game.politicalCapital < change.politicalCapital
                    }
                    onClick={() =>
                      void dispatch({ type: 'set_doctrine_belief', doctrine: template.key })
                    }
                  >
                    {template.label}
                  </Button>
                  {isCurrent && <Tag tone="accent">what the army does</Tag>}
                  {change.vindicated && <Tag tone="gain">the last war suggested this</Tag>}
                  {!isCurrent && change.allowed && (
                    <span className="text-[0.7rem] text-ink-faint tnum">
                      {change.politicalCapital} PC · about {change.years.toFixed(0)} years before
                      the army does it
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{template.blurb}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  Learned from {template.learnedFrom}. Good on{' '}
                  {template.favours.join(', ').replace(/_/g, ' ')}; wrong on{' '}
                  {template.poorIn.join(', ').replace(/_/g, ' ')}.
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="What the country is developing"
        aside={live.length === 0 ? 'nothing' : `₡${researchCost(doctrine, game.moneyScale).toFixed(1)}bn a year`}
      >
        <Kicker>An answer to a question asked today, delivered in a decade</Kicker>
        <p className="mb-3 text-sm leading-relaxed text-ink-soft">
          {describeResearch(doctrine, game.turnNumber)}
        </p>

        {live.length > 0 && (
          <div className="mb-4 border-t border-rule pt-2 text-xs tnum">
            {live.map((programme) => {
              const template = findResearch(programme.field);
              const stale = programme.specifiedFor !== doctrine.current;
              return (
                <div key={programme.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1">
                  <span className="text-ink-soft">
                    {template.label}
                    <span className={stale ? 'text-loss' : 'text-ink-faint'}>
                      {' '}
                      · specified against {findWarDoctrine(programme.specifiedFor).label.toLowerCase()}
                      {stale && ' — which the army no longer holds'}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-ink-faint">
                      {Math.max(0, Math.round((programme.dueTurn - game.turnNumber) / 52))} years
                    </span>
                    <Button onClick={() => void dispatch({ type: 'cancel_research', id: programme.id })}>
                      Cancel
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          {RESEARCH_TEMPLATES.map((template) => (
            <div key={template.key} className="flex flex-wrap items-center gap-2 border-t border-rule pt-2">
              <Button
                disabled={game.politicalCapital < 7}
                onClick={() => void dispatch({ type: 'start_research', field: template.key })}
              >
                {template.label}
              </Button>
              <span className="text-[0.7rem] text-ink-faint tnum">
                ₡{(template.annualCost * game.moneyScale).toFixed(1)}bn/yr · {template.leadYears}{' '}
                years
              </span>
              {template.specificity > 0.6 && <Tag tone="warn">dates badly</Tag>}
              {!template.visible && <Tag tone="neutral">nothing to show for it</Tag>}
            </div>
          ))}
        </div>
        {doctrine.capability > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-faint tnum">
            {doctrine.capability.toFixed(0)} points of capability delivered so far, by programmes
            started under governments that did not collect any of it.
          </p>
        )}
      </Panel>
    </div>
  );
}
