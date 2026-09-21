/**
 * LogisticsPanel.tsx — the arithmetic, put where a government can see it.
 *
 * The whole reason this panel exists is one number: how many weeks of
 * ammunition there are at the present rate. It is a division — the stock
 * is a number and the consumption is a number — it is available on the
 * first afternoon of any war, and it never appears in a briefing,
 * because briefings are about capability and this is about arithmetic.
 *
 * So it is the first thing on the panel, in the largest type, before
 * anything about capability. Next to it is how long it takes to raise
 * production, which is nearly always longer — and was longer on the
 * first day too, which is the part that makes it a decision rather than
 * a misfortune.
 *
 * The second half is the war economy, where the only figure that matters
 * is how many months before any of it produces anything. A government
 * that orders a war economy pays for all of it now and collects none of
 * it, and the panel says so beside the button rather than afterwards.
 */

import { useGame } from '../../state/store.ts';
import {
  SUPPLY_TEMPLATES,
  WAR_FINANCE,
  WAR_FOOTINGS,
  bindingConstraint,
  civilianCost,
  describeLogistics,
  describeWarEconomy,
  findSupply,
  footingChange,
  militaryOutput,
  monthsToConversion,
  stockOf,
  weeksRemaining,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

const weeks = (value: number) => (Number.isFinite(value) ? `${value.toFixed(0)}w` : 'steady');

export function LogisticsPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const logistics = game.logistics;
  const economy = game.warEconomy;
  const binding = bindingConstraint(logistics);
  const left = weeksRemaining(binding);
  const atWar = game.crises.some((c) => c.stage === 'war');
  const months = monthsToConversion(economy);

  return (
    <div className="space-y-4">
      <Panel title="The depots" aside={findSupply(binding.key).label.toLowerCase()}>
        <Kicker>A division anybody can do, and nobody does</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Runs out first"
            value={weeks(left)}
            detail={findSupply(binding.key).label.toLowerCase()}
            size="large"
            tone={Number.isFinite(left) && left < 8 ? 'loss' : Number.isFinite(left) && left < 20 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Takes to raise production"
            value={`${findSupply(binding.key).leadMonths}mo`}
            detail="which is longer, and was on day one too"
            tone={
              Number.isFinite(left) && findSupply(binding.key).leadMonths * 4.3 > left
                ? 'warn'
                : 'neutral'
            }
          />
          <Stat
            label="Behind the front"
            value={`${logistics.tail.toFixed(1)}:1`}
            detail="for every one at it"
            tone={logistics.tail > 3.4 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {describeLogistics(logistics, atWar)}
        </p>

        <div className="mt-4 border-t border-rule pt-3">
          {SUPPLY_TEMPLATES.map((template) => {
            const stock = stockOf(logistics, template.key);
            const remaining = weeksRemaining(stock);
            return (
              <div key={template.key} className="mt-2">
                <Meter
                  label={template.label}
                  value={Math.min(100, (stock.weeks / (template.peacetimeWeeks * 1.5)) * 100)}
                  band={`${stock.weeks.toFixed(0)} weeks held · ${weeks(remaining)} at this rate`}
                />
                {Number.isFinite(remaining) && remaining < 10 && (
                  <p className="mt-1 text-xs leading-relaxed text-loss/90">{template.outcome}</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Stocks are stated in weeks of sustained full combat, because that is the war the
          country is planning. In peacetime the same stock lasts years, which is why nobody
          develops the habit of asking.
        </p>
      </Panel>

      <Panel
        title="What the country is making"
        aside={months > 1 ? `${months.toFixed(0)} months away` : `${militaryOutput(economy).toFixed(1)}× peacetime`}
      >
        <Kicker>Nothing arrives for eighteen months, and it arrives under somebody else</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Producing"
            value={`${militaryOutput(economy).toFixed(1)}×`}
            detail="of peacetime, right now"
          />
          <Stat
            label="Converted"
            value={`${(economy.converted * 100).toFixed(0)}%`}
            detail={months > 0 ? `${months.toFixed(0)} months to go` : 'complete'}
            tone={months > 12 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Out of the civilian economy"
            value={`${(civilianCost(economy) * 100).toFixed(1)}%`}
            detail="of GDP, which also shrinks the tax base"
            tone={civilianCost(economy) > 0.04 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {describeWarEconomy(economy, game.turnNumber)}
        </p>

        <div className="mt-4 space-y-2">
          {WAR_FOOTINGS.map((footing) => {
            const change = footingChange(economy, footing.key, game.turnNumber);
            const current = economy.footing === footing.key;
            return (
              <div key={footing.key} className="border-t border-rule pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={
                      current || !change.allowed || game.politicalCapital < change.politicalCapital
                    }
                    onClick={() => void dispatch({ type: 'set_war_footing', footing: footing.key })}
                  >
                    {footing.label}
                  </Button>
                  {current && <Tag tone="accent">current</Tag>}
                  {!current && change.allowed && (
                    <span className="text-[0.7rem] text-ink-faint tnum">
                      {change.politicalCapital} PC · {change.months} months before anything ·
                      {` ${footing.unwindMonths} months to undo`}
                    </span>
                  )}
                  {!current && change.months >= 20 && <Tag tone="warn">a successor collects it</Tag>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{footing.blurb}</p>
                {!current && !change.allowed && change.reason && (
                  <p className="mt-1 text-xs leading-relaxed text-loss/80">{change.reason}</p>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Who pays for it" aside={economy.finance}>
        <Kicker>Three ways, three sets of people, three delays</Kicker>
        <div className="space-y-2">
          {WAR_FINANCE.map((option) => (
            <div key={option.key} className="border-t border-rule pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={economy.finance === option.key}
                  onClick={() => void dispatch({ type: 'set_war_finance', finance: option.key })}
                >
                  {option.label}
                </Button>
                {economy.finance === option.key && <Tag tone="accent">current</Tag>}
                <span className="text-[0.7rem] text-ink-faint tnum">
                  noticed in about {Math.round(option.delayWeeks / 4)} months
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{option.blurb}</p>
              <p className="mt-1 border-l-2 border-rule pl-2 text-xs leading-relaxed text-ink-faint">
                {option.victim}
              </p>
            </div>
          ))}
        </div>
        {economy.spent > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-faint tnum">
            ₡{economy.spent.toFixed(0)}bn spent on the war so far, and ₡
            {economy.civilianForegone.toFixed(0)}bn of civilian output not made. The second
            figure is the one that does not appear in any account.
          </p>
        )}
      </Panel>
    </div>
  );
}
