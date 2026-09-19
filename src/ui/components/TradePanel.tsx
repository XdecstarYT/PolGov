/**
 * TradePanel.tsx — what the country sells, what it buys, and who it needs.
 *
 * Trade is the half of foreign policy with a domestic constituency on both
 * sides of every decision, so the panel is built around the two things a
 * player will otherwise fail to notice.
 *
 * The first is the retaliation clock. A tariff laid this week is answered in
 * six, and the announcement lands long before the bill does. Any partner
 * with an answer coming is called out by name with the number of weeks on
 * it, because a mechanic whose whole point is a delay has to have the delay
 * visible or it is just a random punishment.
 *
 * The second is exposure. A large flow and an irreplaceable one look
 * identical on a trade figure and are completely different things. The
 * exposure list is what a trade minister actually needs and the list most
 * likely to be ignored until the week it matters.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  SURCHARGE_MAX,
  TARIFF_PC_COST,
  TRADE_COMPLAINT_PC_COST,
  describeTrade,
  effectiveTariff,
  findIndustry,
  findNation,
  importExposures,
  isMember,
  netExports,
  totalExports,
  totalImports,
  type IndustryKey,
  type NationKey,
} from '../../game/index.ts';
import { Button, EmptyNote, Kicker, Panel, Stat, Tag, money } from './Primitives.tsx';

export function TradePanel() {
  const { game, dispatch } = useGame();
  const [open, setOpen] = useState<NationKey | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});

  if (!game) return null;
  const trade = game.trade;
  const gdp = game.economy.gdp;

  const agreements = new Set<NationKey>(
    game.world.treaties
      .filter((t) => t.kind === 'trade' || t.kind === 'partnership')
      .flatMap((t) => t.parties),
  );
  const nationalRate = game.taxes.rates.import_tariff;
  const exposed = importExposures(trade, game.world);
  const answering = trade.flows.filter((f) => f.retaliationDue !== null);

  /* Largest relationships first: the ones a decision here actually moves. */
  const ordered = [...trade.flows].sort(
    (a, b) => b.exports + b.imports - (a.exports + a.imports),
  );

  return (
    <div className="space-y-5">
      <Panel title="Trade" aside={`${((totalExports(trade) / gdp) * 100).toFixed(0)}% of output`}>
        <p className="font-serif text-[1.02rem] leading-relaxed text-ink">
          {describeTrade(trade, gdp)}
        </p>

        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3 border-t border-rule pt-4">
          <Stat label="Exports" value={money(totalExports(trade))} detail="a year" />
          <Stat label="Imports" value={money(totalImports(trade))} detail="a year" />
          <Stat
            label="Balance"
            value={money(netExports(trade))}
            detail={netExports(trade) >= 0 ? 'surplus' : 'deficit'}
            tone={netExports(trade) >= 0 ? 'gain' : 'loss'}
          />
          <Stat
            label="National tariff"
            value={`${(nationalRate * 100).toFixed(1)}%`}
            detail="set in the tax code, charged to everyone without an agreement"
          />
        </div>

        {answering.length > 0 && (
          <div className="mt-4 border border-warn/40 bg-warn/5 p-3">
            <Kicker>Answers on their way</Kicker>
            <ul className="space-y-1">
              {answering.map((flow) => (
                <li key={flow.nation} className="text-sm text-ink-soft">
                  <span className="text-ink">{findNation(flow.nation).name}</span> will respond in{' '}
                  <span className="tnum">{flow.retaliationDue}</span> week
                  {flow.retaliationDue === 1 ? '' : 's'}. The industry this sheltered has already
                  thanked you; whoever exports to them has not been told yet.
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title="Who the country cannot afford to fall out with">
        {exposed.length === 0 ? (
          <EmptyNote>No single partner supplies enough to be a lever.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {exposed.map((entry) => (
              <li key={entry.nation} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="text-ink">{findNation(entry.nation).name}</span>
                  <span className="truncate text-xs text-ink-faint">
                    {entry.industries.map((k) => findIndustry(k).name).join(', ')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {entry.hostile && <Tag tone="loss">and hostile</Tag>}
                  <span className="tnum text-sm text-ink-soft">
                    {(entry.share * 100).toFixed(0)}% of imports
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          A large flow and an irreplaceable one look identical on a trade figure and are not the
          same thing. Being right about something does not take a lever back.
        </p>
      </Panel>

      <Panel title="The schedule">
        <ul className="divide-y divide-rule">
          {ordered.map((flow) => {
            const template = findNation(flow.nation);
            const nation = game.world.nations.find((n) => n.key === flow.nation);
            const hasAgreement = agreements.has(flow.nation);
            const ours = effectiveTariff(flow, nationalRate, hasAgreement);
            const isOpen = open === flow.nation;
            const proposed = draft[flow.nation] ?? flow.surcharge;

            return (
              <li key={flow.nation} className="py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
                  onClick={() => setOpen(isOpen ? null : flow.nation)}
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="w-3 shrink-0 text-ink-faint">
                      {isOpen ? '–' : '+'}
                    </span>
                    <span className="font-serif text-sm font-semibold text-ink">
                      {template.name}
                    </span>
                    {hasAgreement && <Tag tone="gain">agreement</Tag>}
                    {flow.dispute !== 'none' && (
                      <Tag tone="warn">
                        {flow.dispute === 'ours' ? 'we have filed' : 'they have filed'}
                      </Tag>
                    )}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3 tnum text-xs">
                    <span className="text-ink-faint">
                      out {money(flow.exports)} · in {money(flow.imports)}
                    </span>
                    <span className="text-ink-soft">
                      {ours.toFixed(0)}% / {flow.theirTariff.toFixed(0)}%
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-5 mt-3 space-y-3">
                    <p className="text-xs leading-relaxed text-ink-faint">
                      They buy {(nation?.buys ?? []).map((k: IndustryKey) => findIndustry(k).name).join(', ')}{' '}
                      and sell us{' '}
                      {(nation?.sells ?? []).map((k: IndustryKey) => findIndustry(k).name).join(', ')}.
                      {hasAgreement
                        ? ' An agreement holds, so the national rate does not apply to them.'
                        : ` The national rate of ${(nationalRate * 100).toFixed(1)}% applies.`}
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        className="flex items-center gap-2 text-xs text-ink-faint"
                        htmlFor={`tariff-${flow.nation}`}
                      >
                        Surcharge
                        <input
                          id={`tariff-${flow.nation}`}
                          type="range"
                          min={0}
                          max={SURCHARGE_MAX}
                          step={1}
                          value={proposed}
                          onChange={(e) =>
                            setDraft({ ...draft, [flow.nation]: Number(e.target.value) })
                          }
                          className="w-40 accent-[var(--color-seal)]"
                        />
                        <span className="tnum text-ink-soft">{proposed.toFixed(0)} pts</span>
                      </label>
                      <Button
                        disabled={
                          Math.abs(proposed - flow.surcharge) < 0.5 ||
                          game.politicalCapital < TARIFF_PC_COST
                        }
                        onClick={() =>
                          void dispatch({
                            type: 'set_tariff',
                            nation: flow.nation,
                            points: proposed,
                          })
                        }
                      >
                        {Math.abs(proposed - flow.surcharge) < 0.5
                          ? 'No change'
                          : `${proposed > flow.surcharge ? 'Raise' : 'Lower'} · ${TARIFF_PC_COST} PC`}
                      </Button>
                      {flow.theirTariff >= 1 && flow.dispute !== 'ours' && (
                        <Button
                          disabled={
                            !isMember(game.world.organisations, 'wto') ||
                            game.politicalCapital < TRADE_COMPLAINT_PC_COST
                          }
                          onClick={() =>
                            void dispatch({ type: 'file_trade_complaint', nation: flow.nation })
                          }
                        >
                          File a complaint · {TRADE_COMPLAINT_PC_COST} PC
                        </Button>
                      )}
                    </div>

                    {proposed > flow.surcharge && (
                      <p className="text-xs leading-relaxed text-warn">
                        They will answer in about six weeks, and the answer is paid by whoever
                        exports to them — which is not the same people, or the same regions, as
                        the ones this shelters.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
