/**
 * ProblemsPanel.tsx — what the budget did to people.
 *
 * Sorted by how far each problem has moved from ordinary rather than by
 * its raw number, because the readings are in different units and a
 * homelessness figure of forty and a crime figure of forty are not
 * comparable quantities.
 *
 * Two things are said in words because a player will not infer them from
 * a list. Each problem comes back more slowly than it went — the
 * multiplier is on the line. And several at once is worse than the sum,
 * because grievances find each other.
 *
 * Underneath, the electorate replacing itself: the one force acting on
 * where the votes are that no campaign can address.
 */

import { useGame } from '../../state/store.ts';
import {
  acute,
  centreDrift,
  describeGenerations,
  describeProblems,
  findProblem,
  problemOf,
  severity,
} from '../../game/index.ts';
import { Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function ProblemsPanel() {
  const { game } = useGame();
  if (!game) return null;

  const p = game.problems;
  const bad = acute(p);
  const drift = centreDrift(game.generations);

  /* Worst-first by severity, which is the only footing they share. */
  const ordered = [...p.problems]
    .filter((x) => x.key !== 'unrest')
    .sort((a, b) => severity(p, b.key) - severity(p, a.key));

  return (
    <div className="space-y-4">
      <Panel title="What is going wrong" aside={`stability ${p.stability.toFixed(0)}`}>
        <Kicker>Every one of these is something the budget did</Kicker>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Unrest"
            value={problemOf(p, 'unrest').toFixed(0)}
            detail="the composite"
            size="large"
            tone={
              severity(p, 'unrest') > 0.6 ? 'loss' : severity(p, 'unrest') > 0.35 ? 'warn' : 'neutral'
            }
          />
          <Stat
            label="Running seriously"
            value={`${bad.length}`}
            detail="of fifteen"
            tone={bad.length > 4 ? 'loss' : bad.length > 1 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Social exclusion"
            value={`${problemOf(p, 'social_exclusion').toFixed(1)}%`}
            detail="outside all of it at once"
          />
          <Stat
            label="Stability"
            value={p.stability.toFixed(0)}
            detail="capacity to absorb it"
            tone={p.stability < 35 ? 'loss' : p.stability < 55 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeProblems(p)}</p>
        {bad.length > 3 && (
          <p className="mt-3 border-l-2 border-loss/50 pl-3 text-xs leading-relaxed text-ink-soft">
            Several at once is worse than the sum of them. Grievances find each other: people
            with one complaint stay home, and people with one complaint who meet people with
            three others do not.
          </p>
        )}
      </Panel>

      <Panel title="The register">
        <div className="space-y-3">
          {ordered.map((state) => {
            const template = findProblem(state.key);
            const sev = severity(p, state.key);
            return (
              <div key={state.key}>
                <Meter
                  label={
                    <span className="flex items-baseline justify-between gap-3">
                      <span>{template.label}</span>
                      <span className="tnum text-[0.7rem] text-ink-faint">
                        {state.level.toFixed(1)} {template.unit}
                      </span>
                    </span>
                  }
                  value={Math.min(100, sev * 100)}
                  band={sev > 0.5 ? 'serious' : sev > 0.2 ? 'rising' : 'ordinary'}
                  hint={template.blurb}
                />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-ink-faint tnum">
                  <span>ordinary is {template.opening}</span>
                  <span aria-hidden>·</span>
                  <span>comes back {template.stickiness.toFixed(1)}× slower than it arrives</span>
                  {sev > 0.5 && <Tag tone="loss">serious</Tag>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="The ground underneath" aside="nobody is changing their mind">
        <p className="text-sm leading-relaxed text-ink-soft">
          Four cohorts, each formed by the country it grew up in and each keeping that for
          life. The oldest is replaced by the youngest at about one and a quarter per cent a
          year — eight per cent a term — so the centre of the electorate moves whether or not
          anybody is persuaded of anything. It is the only force acting on where the votes are
          that no campaign can address.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Stat
            label="Economic drift"
            value={`${drift.economic >= 0 ? '+' : ''}${(drift.economic * 100).toFixed(0)}`}
            detail="since you took office"
          />
          <Stat
            label="Social drift"
            value={`${drift.social >= 0 ? '+' : ''}${(drift.social * 100).toFixed(0)}`}
          />
          <Stat
            label="Environmental drift"
            value={`${drift.environmental >= 0 ? '+' : ''}${(drift.environmental * 100).toFixed(0)}`}
          />
        </div>

        <div className="mt-4 space-y-2">
          {game.generations.cohorts.map((cohort) => (
            <div
              key={cohort.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2 text-xs last:border-0"
            >
              <span className="text-ink-soft">{cohort.label}</span>
              <span className="tnum text-ink-faint">
                {(cohort.share * 100).toFixed(0)}% of the electorate · turns out{' '}
                {cohort.turnout.toFixed(2)}×
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {describeGenerations(game.generations)}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          The cohort being formed right now is being formed by the country as you are running
          it — what a house costs, whether the state works, what is left of the environment. It
          will still be voting in sixty years, and you will not be here to answer for it.
        </p>
      </Panel>
    </div>
  );
}
