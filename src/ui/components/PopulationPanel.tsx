/**
 * PopulationPanel.tsx — the people.
 *
 * Everything on this panel moves too slowly for the government reading it to
 * see the result of its own decisions. That is the panel's whole argument,
 * and it is stated rather than hidden: the twenty-year forecast is given
 * more space than the current figures, because the current figures were
 * settled by governments that are no longer here and the forecast is the
 * only thing this one can affect.
 *
 * The dependency ratio is given the largest number on the panel. It is the
 * figure that decides whether the pension and health bills are payable, and
 * it is the one a player can do least about inside a term.
 */

import { useMemo } from 'react';
import { useGame } from '../../state/store.ts';
import {
  averageSectorHealth,
  dependencyRatio,
  findSector,
  forecastDemography,
  regionalEmployment,
  skillsShortage,
} from '../../game/index.ts';
import { Kicker, Panel, Stat, Tag } from './Primitives.tsx';

const YEARS_AHEAD = 20;

export function PopulationPanel() {
  const { game } = useGame();

  const forecast = useMemo(() => {
    if (!game) return null;
    return forecastDemography(
      game.demography,
      {
        unemployment: game.economy.unemployment,
        healthQuality: findSector(game.sectors, 'health').health,
        educationQuality: findSector(game.sectors, 'education').health,
        serviceQuality: averageSectorHealth(game.sectors),
        regionalJobs: regionalEmployment(game.industries),
        turn: game.turnNumber,
      },
      YEARS_AHEAD * 12,
    );
  }, [game]);

  if (!game || !forecast) return null;
  const d = game.demography;
  const ratio = dependencyRatio(d);
  const shortage = skillsShortage(d);

  return (
    <Panel title="The people" aside={`${d.population.toFixed(1)}m`}>
      <Kicker>Somebody else's problem, if you want it to be</Kicker>
      <p className="text-sm leading-relaxed text-ink-soft">
        Nothing here moves fast enough for you to see the result of your own decisions about it.
        A birth rate that shifts this year changes the workforce in twenty and the pension bill
        in sixty-five. It is the only part of governing that is honestly about somebody else, and
        the game will not make you care about it.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <Stat
          label="Workers per retiree"
          value={ratio.toFixed(2)}
          detail="what decides if the bills are payable"
          tone={ratio < 2.4 ? 'loss' : ratio < 3 ? 'warn' : 'neutral'}
          size="large"
        />
        <Stat
          label="Workforce"
          value={`${d.workforce.toFixed(1)}m`}
          detail={`${(d.participation * 100).toFixed(1)}% of working age`}
          size="large"
        />
        <Stat
          label="Life expectancy"
          value={`${d.lifeExpectancy.toFixed(1)}`}
          detail="years"
          size="large"
        />
        <Stat
          label="Net migration"
          value={`${d.netMigration >= 0 ? '+' : '−'}${Math.abs(d.netMigration).toFixed(1)}`}
          detail="per thousand, a year"
          tone={d.netMigration < 0 ? 'warn' : 'neutral'}
          size="large"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {shortage > 0.01 && (
          <Tag tone="warn">Skills shortage · {(shortage * 100).toFixed(1)} points</Tag>
        )}
        {d.netMigration < 0 && <Tag tone="loss">More leaving than arriving</Tag>}
        {ratio < 2.6 && <Tag tone="loss">Ageing faster than it is replacing</Tag>}
      </div>

      {/* The age structure, as one bar */}
      <div className="mt-5">
        <div className="label text-ink-faint">Who the country is</div>
        <div className="mt-1.5 flex h-6 w-full overflow-hidden rounded-[2px]">
          {(
            [
              ['Under 18', d.youthShare, 'var(--color-civic)'],
              ['Working age', d.workingShare, 'var(--color-brass)'],
              ['Retired', d.retiredShare, 'var(--color-seal)'],
            ] as const
          ).map(([label, share, colour]) => (
            <div
              key={label}
              className="flex items-center justify-center text-[0.65rem] text-paper"
              style={{ width: `${share * 100}%`, backgroundColor: colour }}
              title={`${label}: ${(share * 100).toFixed(1)}%`}
            >
              {share > 0.12 && `${(share * 100).toFixed(0)}%`}
            </div>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 text-[0.7rem] text-ink-faint">
          <span>Under 18 {(d.youthShare * 100).toFixed(1)}%</span>
          <span>Working age {(d.workingShare * 100).toFixed(1)}%</span>
          <span>Retired {(d.retiredShare * 100).toFixed(1)}%</span>
        </div>
      </div>

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Population in detail</caption>
        <tbody>
          {[
            ['Births', `${d.birthRate.toFixed(1)} per thousand a year`],
            ['Deaths', `${d.deathRate.toFixed(1)} per thousand a year`],
            [
              'Arrivals and departures',
              `${d.immigration.toFixed(1)} in, ${d.emigration.toFixed(1)} out, per thousand`,
            ],
            ['In towns and cities', `${(d.urbanisation * 100).toFixed(1)}%`],
            ['People per household', d.householdSize.toFixed(2)],
            [
              'Trained for the work available',
              `${(d.skills * 100).toFixed(1)}% — moved by schools, and by nothing else that is fast`,
            ],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-rule/60 last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-soft">
                {label}
              </th>
              <td className="py-1.5 text-right tnum text-ink">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Where the people are going */}
      <div className="mt-5">
        <div className="label text-ink-faint">Where people are moving</div>
        <ul className="mt-1.5 space-y-1">
          {[...d.regional]
            .sort((a, b) => a.netFlow - b.netFlow)
            .map((entry) => {
              const region = game.regions.find((r) => r.id === entry.regionId);
              return (
                <li
                  key={entry.regionId}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="text-ink-soft">{region?.name ?? entry.regionId}</span>
                  <span className="flex items-baseline gap-3 tnum text-xs">
                    <span className="text-ink-faint">
                      {entry.population.toFixed(2)}m · {region?.seats ?? 0} seats
                    </span>
                    <span
                      className={
                        entry.netFlow < -0.15
                          ? 'text-loss'
                          : entry.netFlow > 0.15
                            ? 'text-gain'
                            : 'text-ink-faint'
                      }
                    >
                      {entry.netFlow >= 0 ? '+' : '−'}
                      {Math.abs(entry.netFlow).toFixed(2)}k/yr
                    </span>
                  </span>
                </li>
              );
            })}
        </ul>
        <p className="mt-1.5 text-[0.7rem] leading-relaxed text-ink-faint">
          Seats follow people once a term. A government that presides over a region emptying will
          fight the next election on a map it did not draw.
        </p>
      </div>

      {/* The only thing this government can actually affect */}
      <div className="mt-5 rule-engraved border-t pt-4">
        <div className="label text-ink-faint">In {YEARS_AHEAD} years, on today's decisions</div>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
          <Stat
            label="Population"
            value={`${forecast.endPopulation.toFixed(1)}m`}
            detail={`from ${d.population.toFixed(1)}m`}
          />
          <Stat
            label="Retired"
            value={`${(forecast.endRetiredShare * 100).toFixed(1)}%`}
            detail={`from ${(d.retiredShare * 100).toFixed(1)}%`}
            tone={forecast.endRetiredShare > d.retiredShare + 0.03 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Workers per retiree"
            value={forecast.endDependencyRatio.toFixed(2)}
            detail={`from ${ratio.toFixed(2)}`}
            tone={forecast.endDependencyRatio < 2.4 ? 'loss' : 'neutral'}
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          Five elections away. Whoever is answering for this will not be you, and the decisions
          that settle it are being taken now, at this desk, by a government that will never be
          asked about them.
        </p>
      </div>
    </Panel>
  );
}
