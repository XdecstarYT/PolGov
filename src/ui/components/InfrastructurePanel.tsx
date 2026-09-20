/**
 * InfrastructurePanel.tsx — the maintenance dial, and what it is doing.
 *
 * The dial at the top of this panel is the most consequential control in the
 * game that nobody will ever thank a government for setting correctly. The
 * panel states that plainly, along with what cutting it saves this week and
 * what the work not done will cost later, because the decision is only
 * interesting if the player can see both halves of it.
 *
 * It does not say which choice is right. Funding maintenance in full is the
 * responsible thing and it buys nothing anyone can point at; cutting it
 * funds something visible and hands a worse problem to a successor. Both are
 * defensible and the game takes no view.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  CONDITION_CRITICAL,
  CONDITION_FAILING,
  FULL_MAINTENANCE_COST,
  MAINTENANCE_LEVEL_MAX,
  PROJECT_PC_COST,
  buildCostOf,
  canStartProject,
  findInfrastructure,
  maintenanceSpend,
  projectSpend,
  termsAway,
  totalBacklog,
  utilisation,
  type InfrastructureKey,
} from '../../game/index.ts';
import { Button, Kicker, Panel, Stat, Tag, money } from './Primitives.tsx';

export function InfrastructurePanel() {
  const { game, dispatch } = useGame();
  const [level, setLevel] = useState<number | null>(null);
  const [building, setBuilding] = useState<InfrastructureKey | null>(null);

  if (!game) return null;

  const infra = game.infrastructure;
  const population = game.demography.population;
  const pending = level ?? infra.maintenanceLevel;
  const backlog = totalBacklog(infra);
  const upkeep = maintenanceSpend(infra);
  const projects = projectSpend(infra);
  const saving = FULL_MAINTENANCE_COST - FULL_MAINTENANCE_COST * pending;

  const assets = [...infra.assets].sort((a, b) => a.condition - b.condition);
  const worst = assets.filter((a) => a.condition < CONDITION_FAILING);

  return (
    <Panel title="What the country is built out of" aside={money(upkeep + projects)}>
      <Kicker>The bill nobody notices you paying</Kicker>
      <p className="text-sm leading-relaxed text-ink-soft">
        Maintaining a road costs money now and produces nothing anyone notices. Not maintaining it
        costs nothing now and produces nothing anyone notices either — for about nine years. The
        work not done is owed at more than it was avoided for, and the bill lands on whoever is in
        office when the bridge shuts.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <Stat
          label="Upkeep"
          value={money(upkeep)}
          detail={`${(infra.maintenanceLevel * 100).toFixed(0)}% of what full repair costs`}
          tone={infra.maintenanceLevel < 0.85 ? 'warn' : 'neutral'}
          size="large"
        />
        <Stat
          label="Work owed"
          value={money(backlog)}
          detail="deferred, and compounding"
          tone={backlog > 120 ? 'loss' : backlog > 25 ? 'warn' : 'neutral'}
          size="large"
        />
        <Stat
          label="Under construction"
          value={money(projects)}
          detail={`${infra.projects.length} project${infra.projects.length === 1 ? '' : 's'}`}
          size="large"
        />
        <Stat
          label="Failing"
          value={worst.length}
          detail={`of ${infra.assets.length} assets`}
          tone={worst.length > 0 ? 'loss' : 'gain'}
          size="large"
        />
      </div>

      {/* The dial */}
      <div className="mt-5 rule-engraved border-t pt-4">
        <label className="label text-ink-faint" htmlFor="maintenance">
          Maintenance
        </label>
        <input
          id="maintenance"
          type="range"
          min={0}
          max={MAINTENANCE_LEVEL_MAX}
          step={0.05}
          value={pending}
          onChange={(e) => setLevel(Number(e.target.value))}
          className="mt-1.5 w-full"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="tnum text-ink">
            {(pending * 100).toFixed(0)}% · {money(FULL_MAINTENANCE_COST * pending)} a year
          </span>
          <span className={`tnum ${saving > 0 ? 'text-warn' : 'text-ink-faint'}`}>
            {saving > 0.05
              ? `frees ${money(saving)} a year, owes ${money(saving * 1.45)}`
              : saving < -0.05
                ? `costs ${money(-saving)} a year extra, works the backlog off`
                : 'holding everything where it is'}
          </span>
        </div>
        {pending !== infra.maintenanceLevel && (
          <div className="mt-2">
            <Button
              onClick={() => {
                void dispatch({ type: 'set_maintenance', level: pending });
                setLevel(null);
              }}
            >
              Set it
            </Button>
          </div>
        )}
      </div>

      {/* The assets */}
      <div className="mt-5">
        <div className="label text-ink-faint">Condition and capacity</div>
        <table className="mt-1.5 w-full text-sm">
          <caption className="sr-only">Every asset, worst first</caption>
          <thead>
            <tr className="border-b border-rule text-left text-[0.68rem] uppercase tracking-wide text-ink-faint">
              <th scope="col" className="py-1 font-semibold">Asset</th>
              <th scope="col" className="py-1 text-right font-semibold">Condition</th>
              <th scope="col" className="py-1 text-right font-semibold">In use</th>
              <th scope="col" className="py-1 text-right font-semibold">Owed</th>
              <th scope="col" className="py-1 text-right font-semibold" />
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const template = findInfrastructure(asset.key);
              const use = utilisation(asset, population);
              const under = infra.projects.filter((p) => p.key === asset.key);
              return (
                <tr key={asset.key} className="border-b border-rule/60 last:border-0">
                  <td className="py-1.5 text-ink">
                    {template.name}
                    {under.length > 0 && (
                      <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-civic">
                        building
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-1.5 text-right tnum ${
                      asset.condition < CONDITION_CRITICAL
                        ? 'text-loss'
                        : asset.condition < CONDITION_FAILING
                          ? 'text-warn'
                          : 'text-ink'
                    }`}
                  >
                    {asset.condition.toFixed(0)}
                  </td>
                  <td
                    className={`py-1.5 text-right tnum ${use > 1.08 ? 'text-warn' : 'text-ink-faint'}`}
                  >
                    {(use * 100).toFixed(0)}%
                  </td>
                  <td className="py-1.5 text-right tnum text-ink-faint">
                    {asset.backlog > 0.5 ? money(asset.backlog) : '—'}
                  </td>
                  <td className="py-1.5 text-right">
                    <Button
                      variant="quiet"
                      onClick={() =>
                        setBuilding(building === asset.key ? null : asset.key)
                      }
                    >
                      Build
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {building && (
        <div className="mt-4 rule-engraved border-t pt-4">
          {(() => {
            const template = findInfrastructure(building);
            const units = 5;
            const opensIn = Math.round(template.buildTurns / 12);
            return (
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-sm font-semibold text-ink">
                    Commission {template.name.toLowerCase()}
                  </span>
                  <span className="text-xs tnum text-ink-faint">
                    {money(buildCostOf(template, units, game.moneyScale))} over {opensIn} years
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{template.blurb}</p>
                <p className="mt-1 text-[0.7rem] text-ink-faint">
                  {units} units of capacity, opening in {opensIn} years — about{' '}
                  {Math.ceil(template.buildTurns / 48)} election
                  {Math.ceil(template.buildTurns / 48) === 1 ? '' : 's'} from now. The credit
                  will go to whoever cuts the ribbon.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      void dispatch({ type: 'start_project', asset: building, units });
                      setBuilding(null);
                    }}
                    disabled={
                      !canStartProject(infra) || game.politicalCapital < PROJECT_PC_COST
                    }
                  >
                    Commission · {PROJECT_PC_COST} PC
                  </Button>
                  <Button variant="quiet" onClick={() => setBuilding(null)}>
                    Not now
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {infra.projects.length > 0 && (
        <div className="mt-5">
          <div className="label text-ink-faint">Under construction</div>
          <ul className="mt-1.5 space-y-1.5">
            {infra.projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-ink-soft">
                  {findInfrastructure(project.key).name} · {project.units} units
                </span>
                <span className="flex items-baseline gap-3 text-xs tnum">
                  <span className="text-ink-faint">
                    {Math.round(project.remainingTurns / 12)}y left ·{' '}
                    {money(project.remainingCost)} to pay
                  </span>
                  {termsAway(project) > 1 && (
                    <Tag tone="brass">{termsAway(project)} elections away</Tag>
                  )}
                  <Button
                    variant="quiet"
                    onClick={() => void dispatch({ type: 'cancel_project', projectId: project.id })}
                  >
                    Cancel
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[0.7rem] text-ink-faint">
            Cancelling refunds nothing. The money already spent is gone, which is what makes it
            such a bad decision and such a common one.
          </p>
        </div>
      )}
    </Panel>
  );
}
