/**
 * DefencePanel.tsx — what the country could actually do.
 *
 * Three numbers per arm, laid out so that the gap between them is the first
 * thing read. Strength is what gets announced; readiness is what gets spent
 * and what decides anything; equipment falls every week whatever anybody
 * does. A government that has funded strength and starved readiness has a
 * parade rather than a deterrent, and the only way the player will ever see
 * that coming is if the two numbers sit next to each other.
 *
 * Programmes carry both dates — the one that was announced and the one the
 * department actually expects — because the gap between them is the whole
 * subject, and because a panel that showed only the second would be kinder
 * to governments than any real department has ever been.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  ARM_TEMPLATES,
  DEPLOY_PC_COST,
  DOCTRINE_TEMPLATES,
  PROGRAMME_PC_COST,
  PROGRAMME_TEMPLATES,
  TURNS_PER_YEAR,
  absoluteWeek,
  armPower,
  combatPower,
  committedShare,
  deploymentCost,
  deploymentTerms,
  programmeCost,
  describeForces,
  deterrence,
  findArmState,
  findNation,
  findProgramme,
  overcommitted,
  type ArmKey,
  type DoctrineKey,
  type NationKey,
} from '../../game/index.ts';
import { Button, EmptyNote, Kicker, Meter, Panel, Stat, Tag, money } from './Primitives.tsx';

export function DefencePanel() {
  const { game, dispatch } = useGame();
  const [target, setTarget] = useState<NationKey | ''>('');

  if (!game) return null;
  const military = game.military;
  const running = military.programmes.filter((p) => !p.cancelled && !p.delivered);
  const week = absoluteWeek(game);

  return (
    <div className="space-y-5">
      <Panel title="The forces" aside={`${Math.round(committedShare(military) * 100)}% committed`}>
        <p className="font-serif text-[1.02rem] leading-relaxed text-ink">
          {describeForces(military, game.world)}
        </p>

        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3 border-t border-rule pt-4">
          <Stat label="At home" value={combatPower(military).toFixed(0)} detail="combat power" />
          <Stat
            label="Abroad"
            value={combatPower(military, true).toFixed(0)}
            detail="what could actually go somewhere"
          />
          <Stat
            label="Deterrence"
            value={deterrence(military, game.world).toFixed(0)}
            detail="forces, alliances and what others believe"
          />
          <Stat
            label="Veterans"
            value={`${(military.veterans / 1000).toFixed(1)}m`}
            detail="a constituency, and they remember"
          />
        </div>

        {overcommitted(military, game.world) && (
          <p className="mt-4 border border-warn/40 bg-warn/5 p-3 text-sm text-ink-soft">
            The country has promised to defend more places than it could reach. That cheque was
            written by a previous government and will be presented to this one.
          </p>
        )}

        <ul className="mt-5 space-y-4">
          {ARM_TEMPLATES.map((template) => {
            const arm = findArmState(military, template.key);
            return (
              <li key={template.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-sm font-semibold text-ink">{template.name}</span>
                  <span className="tnum text-xs text-ink-faint">
                    {arm.personnel.toFixed(0)}k in uniform · power{' '}
                    <span className="text-ink-soft">{armPower(arm).toFixed(0)}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-[0.7rem] leading-relaxed text-ink-faint">
                  {template.blurb}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Meter
                    label="Strength"
                    value={arm.strength}
                    accent="var(--color-civic)"
                    hint="What gets announced"
                  />
                  <Meter
                    label="Readiness"
                    value={arm.readiness}
                    accent={arm.readiness < arm.strength - 15 ? 'var(--color-loss)' : 'var(--color-gain)'}
                    hint="Whether it could go tomorrow"
                  />
                  <Meter
                    label="Equipment"
                    value={arm.equipment}
                    accent="var(--color-brass)"
                    hint="Falls every week regardless"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Doctrine">
        <Kicker>None of these is better than another</Kicker>
        <ul className="space-y-3">
          {DOCTRINE_TEMPLATES.map((doctrine) => {
            const current = military.doctrine === doctrine.key;
            return (
              <li key={doctrine.key} className="border-t border-rule pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-sm font-semibold text-ink">{doctrine.name}</span>
                  <span className="flex items-center gap-2">
                    {current && <Tag tone="accent">in force</Tag>}
                    <span className="tnum text-xs text-ink-faint">
                      {doctrine.surcharge === 0
                        ? 'no change to the line'
                        : `${doctrine.surcharge > 0 ? '+' : '−'}${money(Math.abs(doctrine.surcharge))}/yr`}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{doctrine.blurb}</p>
                {!current && (
                  <div className="mt-2">
                    <Button
                      disabled={game.politicalCapital < doctrine.cost}
                      onClick={() =>
                        void dispatch({ type: 'set_doctrine', doctrine: doctrine.key as DoctrineKey })
                      }
                    >
                      Adopt · {doctrine.cost} PC
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Procurement" aside={`${running.length} under way`}>
        <p className="text-sm leading-relaxed text-ink-soft">
          Every one of these is already late on the day it is announced, because the announced
          date was never the expected one. The question is not which to buy. It is whether to
          begin something a successor will collect, in a region whose jobs will make cancelling
          it a political decision rather than a financial one.
        </p>

        {running.length > 0 && (
          <ul className="mt-4 space-y-3">
            {running.map((programme) => {
              const template = findProgramme(programme.key);
              const late = (programme.slippedTo - programme.dueTurn) / TURNS_PER_YEAR;
              const left = Math.max(0, (programme.slippedTo - week) / TURNS_PER_YEAR);
              return (
                <li key={programme.id} className="border-t border-rule pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-sm font-semibold text-ink">
                      {template.name}
                    </span>
                    <span className="flex items-center gap-2">
                      {late > 0.1 && <Tag tone="warn">{late.toFixed(1)}y late</Tag>}
                      <span className="tnum text-xs text-ink-soft">
                        {money(programme.cost)}
                        {programme.cost > programmeCost(template, game.moneyScale) && (
                          <span className="text-loss">
                            {' '}
                            +{money(programme.cost - programmeCost(template, game.moneyScale))}
                          </span>
                        )}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                    Announced for {(template.years).toFixed(0)} years; the department expects{' '}
                    <span className="tnum">{left.toFixed(1)}</span> more. Work in{' '}
                    {template.regions.join(' and ')}.
                  </p>
                  <div className="mt-2">
                    <Button
                      onClick={() => void dispatch({ type: 'cancel_programme', id: programme.id })}
                    >
                      Cancel
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <ul className="mt-4 space-y-2 border-t border-rule pt-3">
          {PROGRAMME_TEMPLATES.filter(
            (t) => !running.some((p) => p.key === t.key),
          ).map((template) => (
            <li key={template.key} className="flex items-start justify-between gap-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm text-ink">{template.name}</span>
                <span className="text-[0.7rem] leading-relaxed text-ink-faint">
                  {template.blurb}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tnum text-xs text-ink-faint">
                  {money(programmeCost(template, game.moneyScale))} · {template.years}y
                </span>
                <Button
                  disabled={game.politicalCapital < PROGRAMME_PC_COST}
                  onClick={() => void dispatch({ type: 'start_programme', programme: template.key })}
                >
                  Begin · {PROGRAMME_PC_COST} PC
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Deployments"
        aside={deploymentCost(military) > 0 ? `${money(deploymentCost(military))}/yr` : undefined}
      >
        {military.deployments.length === 0 ? (
          <EmptyNote>Nothing is committed anywhere. The whole force is available.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {military.deployments.map((deployment) => (
              <li key={deployment.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm text-ink">{findNation(deployment.nation).name}</span>
                  <span className="text-[0.7rem] leading-relaxed text-ink-faint">
                    {deployment.mandate}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tnum text-xs text-ink-faint">
                    {Math.round(deployment.commitment * 100)}% · {money(deployment.cost)}/yr
                  </span>
                  <Button
                    onClick={() => void dispatch({ type: 'withdraw_force', id: deployment.id })}
                  >
                    Bring them home
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
          <label className="flex items-center gap-2 text-xs text-ink-faint">
            Send forces to
            <select
              className="border border-rule-strong bg-raised px-2 py-1 text-xs text-ink"
              value={target}
              onChange={(e) => setTarget(e.target.value as NationKey | '')}
            >
              <option value="">nowhere</option>
              {game.world.nations
                .filter((n) => n.recognised)
                .map((n) => (
                  <option key={n.key} value={n.key}>
                    {findNation(n.key).name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            disabled={target === '' || game.politicalCapital < DEPLOY_PC_COST}
            onClick={() =>
              target !== '' &&
              void dispatch({
                type: 'deploy_force',
                nation: target as NationKey,
                kind: 'peacekeeping',
                scale: 0.8,
              })
            }
          >
            Peacekeeping · {DEPLOY_PC_COST} PC
          </Button>
          {target !== '' && (
            <span className="text-xs text-ink-faint">
              {Math.round(deploymentTerms('peacekeeping', 0.8, game.moneyScale).commitment * 100)}% of the force and{' '}
              {money(deploymentTerms('peacekeeping', 0.8, game.moneyScale).cost)} a year, and what
              goes is not
              available for anything else.
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}

/** Kept for the arm-key type to stay referenced where the panel is imported. */
export type { ArmKey };
