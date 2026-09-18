/**
 * EconomyPanel.tsx — the economy, on the briefing.
 *
 * The organising idea: none of this is the government's to set. The panel is
 * written as a report on the country rather than as a control surface, and
 * the one thing a player can act on — the fiscal stance — is named explicitly
 * as the channel, so the chain from a budget slider to an unemployment rate
 * is legible rather than mysterious.
 *
 * The forecast is shown with its own limitation stated. It is produced by
 * running the same monthly step the turn resolution runs, with the month's
 * economic weather set to zero, which makes it the model's honest expectation
 * and guarantees it will be wrong. Saying so is the point: a government that
 * trusted its forecasts would be making a mistake the game wants the player
 * to be able to make knowingly.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  FORECAST_HORIZON,
  INFLATION_TARGET,
  NATURAL_UNEMPLOYMENT,
  describeCycle,
  fiscalImpulse,
  forecastEconomy,
  productivityTarget,
  resolveFiscalTurn,
} from '../../game/index.ts';
import type { EconomyPoint } from '../../game/index.ts';
import { Kicker, Panel, Stat, Tag } from './Primitives.tsx';
import { findSector } from '../../game/index.ts';

/* ------------------------------------------------------------------ *
 * A small line, drawn by hand
 * ------------------------------------------------------------------ */

const SPARK_W = 260;
const SPARK_H = 54;

/**
 * One indicator over time, with the level that counts as normal marked.
 *
 * Not a sparkline in the decorative sense: the reference line is the whole
 * point. "Unemployment is 6.1%" means nothing without knowing that 4.8% is
 * where this economy sits when it is working, so the chart draws that line
 * and the number is read against it.
 */
function Trace({
  points,
  pick,
  reference,
  label,
  invert = false,
}: {
  points: readonly EconomyPoint[];
  pick: (p: EconomyPoint) => number;
  reference: number;
  label: string;
  /** True when a HIGHER number is the bad one. */
  invert?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);


  const values = points.map(pick);
  const lo = Math.min(...values, reference);
  const hi = Math.max(...values, reference);
  const pad = Math.max(0.3, (hi - lo) * 0.18);
  const top = hi + pad;
  const bottom = lo - pad;

  const x = (i: number) => (i / (points.length - 1)) * (SPARK_W - 2) + 1;
  const y = (v: number) => SPARK_H - ((v - bottom) / (top - bottom)) * (SPARK_H - 6) - 3;

  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const latest = values[values.length - 1]!;
  const off = invert ? latest > reference : latest < reference;
  const active = hover === null ? null : { point: points[hover]!, value: values[hover]! };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label text-ink-faint">{label}</span>
        <span className={`tnum text-sm ${off ? 'text-warn' : 'text-ink'}`}>
          {latest.toFixed(1)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        className="mt-1 w-full touch-none"
        role="img"
        aria-label={`${label}: ${latest.toFixed(1)} against a normal level of ${reference.toFixed(1)}, over ${points.length} months.`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * SPARK_W;
          let best = 0;
          for (let i = 1; i < points.length; i += 1) {
            if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          }
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line
          x1="0"
          x2={SPARK_W}
          y1={y(reference)}
          y2={y(reference)}
          stroke="var(--color-rule-strong)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <path d={d} fill="none" stroke="var(--color-civic)" strokeWidth="2" strokeLinejoin="round" />
        <circle
          cx={x(points.length - 1)}
          cy={y(latest)}
          r="3"
          fill="var(--color-civic)"
          stroke="var(--color-panel)"
          strokeWidth="1.5"
        />
        {active && (
          <>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1="0"
              y2={SPARK_H}
              stroke="var(--color-rule-strong)"
              strokeWidth="1"
            />
            <circle
              cx={x(hover!)}
              cy={y(active.value)}
              r="3.5"
              fill="var(--color-panel)"
              stroke="var(--color-civic)"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
      <p className="text-[0.7rem] text-ink-faint tnum">
        {active
          ? `month ${active.point.turn}: ${active.value.toFixed(1)}`
          : `normal is ${reference.toFixed(1)}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The panel
 * ------------------------------------------------------------------ */

export function EconomyPanel() {
  const { game } = useGame();

  const forecast = useMemo(() => {
    if (!game) return null;
    /*
     * Forecast the stance the government is ACTUALLY running, not a neutral
     * one — the honest question is "where does this budget take us", and the
     * fiscal impulse is recomputed from the same function the turn uses.
     */
    const fiscal = resolveFiscalTurn(game.sectors, game.economy, game.revenueModifier, game.debt);
    return forecastEconomy(
      game.economy,
      {
        fiscalImpulse: fiscalImpulse(fiscal),
        approval: game.approval,
        productivityTarget: productivityTarget(
          findSector(game.sectors, 'education').health,
          findSector(game.sectors, 'infrastructure').health,
        ),
        turn: game.turnNumber,
      },
      FORECAST_HORIZON,
    );
  }, [game]);

  if (!game || !forecast) return null;
  const e = game.economy;

  const tone = (good: boolean) => (good ? 'gain' : 'loss');

  return (
    <Panel title="The economy" aside={e.phase}>
      <Kicker>What the country is doing</Kicker>
      <p className="text-sm leading-relaxed text-ink-soft">
        {describeCycle(e)} None of the figures below are yours to set. The one channel you have is
        the budget: a deficit is a push on the accelerator, a surplus is a foot on the brake, and
        the central bank will answer either of them with the rate your debt is carried at.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <Stat
          label="Growth"
          value={`${e.growth >= 0 ? '' : '−'}${Math.abs(e.growth).toFixed(1)}%`}
          detail="a year, real"
          tone={tone(e.growth > 0)}
          size="large"
        />
        <Stat
          label="Unemployment"
          value={`${e.unemployment.toFixed(1)}%`}
          detail={`natural rate ${NATURAL_UNEMPLOYMENT}%`}
          tone={tone(e.unemployment <= NATURAL_UNEMPLOYMENT + 0.5)}
          size="large"
        />
        <Stat
          label="Inflation"
          value={`${e.inflation.toFixed(1)}%`}
          detail={`target ${INFLATION_TARGET}%`}
          tone={tone(Math.abs(e.inflation - INFLATION_TARGET) < 1.5)}
          size="large"
        />
        <Stat
          label="Policy rate"
          value={`${e.policyRate.toFixed(2)}%`}
          detail="set by the bank, not by you"
          size="large"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {e.phase === 'recession' && <Tag tone="loss">Recession</Tag>}
        {e.contractionRun > 0 && e.phase !== 'recession' && (
          <Tag tone="warn">{e.contractionRun} month{e.contractionRun === 1 ? '' : 's'} contracting</Tag>
        )}
        {e.outputGap > 1.8 && <Tag tone="warn">Running above capacity</Tag>}
        {e.outputGap < -1.8 && <Tag tone="warn">Well below capacity</Tag>}
        {e.wageGrowth < e.inflation && <Tag tone="loss">Real wages falling</Tag>}
        {e.shocks.map((shock) => (
          <Tag key={shock.id} tone="loss">
            {shock.label} · {shock.remaining}mo
          </Tag>
        ))}
      </div>

      {e.history.length < 2 ? (
        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          The charts appear once a few months have been resolved. There is nothing to plot from a
          single reading, and a chart of one point would only be pretending otherwise.
        </p>
      ) : (
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Trace
          points={e.history}
          pick={(p) => p.growth}
          reference={e.potentialGrowth}
          label="Growth"
        />
        <Trace
          points={e.history}
          pick={(p) => p.unemployment}
          reference={NATURAL_UNEMPLOYMENT}
          label="Unemployment"
          invert
        />
        <Trace
          points={e.history}
          pick={(p) => p.inflation}
          reference={INFLATION_TARGET}
          label="Inflation"
          invert
        />
        <Trace
          points={e.history}
          pick={(p) => p.policyRate}
          reference={e.inflationExpectation}
          label="Policy rate"
          invert
        />
      </div>
      )}

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">The economy in full</caption>
        <tbody>
          {[
            ['Output', `₡${Math.round(e.gdp).toLocaleString()}bn a year`],
            [
              'Against capacity',
              `${e.outputGap >= 0 ? '+' : '−'}${Math.abs(e.outputGap).toFixed(1)}% — ${
                Math.abs(e.outputGap) < 0.25
                  ? 'running at about what it can sustain'
                  : e.outputGap > 0
                    ? 'above what it can sustain'
                    : 'below what it could produce'
              }`,
            ],
            ['Trend growth', `${e.potentialGrowth.toFixed(2)}% — the country's speed limit`],
            [
              'Productivity',
              `${e.productivity.toFixed(1)} — moved only by schools and infrastructure, over years`,
            ],
            [
              'Wages',
              `${e.wageGrowth.toFixed(1)}% a year, against ${e.inflation.toFixed(1)}% prices — ` +
                `real pay ${e.wageGrowth >= e.inflation ? 'rising' : 'falling'}`,
            ],
            ['Consumer confidence', e.consumerConfidence.toFixed(0)],
            ['Business confidence', e.businessConfidence.toFixed(0)],
            ['Household spending', `₡${Math.round(e.householdSpending).toLocaleString()}bn a year`],
            ['Household saving', `${e.householdSavingsRate.toFixed(1)}% of income`],
            ['Business investment', `₡${Math.round(e.investment).toLocaleString()}bn a year`],
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

      <div className="mt-5 rule-engraved border-t pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label text-ink-faint">Treasury forecast · {FORECAST_HORIZON} months</span>
          {forecast.recessionInHorizon && <Tag tone="warn">Recession in the horizon</Tag>}
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          On the budget as it currently stands: growth averaging{' '}
          <span className="tnum text-ink">{forecast.averageGrowth.toFixed(1)}%</span>, inflation{' '}
          <span className="tnum text-ink">{forecast.averageInflation.toFixed(1)}%</span>, and
          unemployment at{' '}
          <span className="tnum text-ink">{forecast.endUnemployment.toFixed(1)}%</span> by the end
          of it.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          This is produced by running the same month the turn resolution runs, twelve times, with
          nothing unusual happening. Something unusual always happens. Treat it as what the model
          believes rather than as what will occur — governments that have confused the two are the
          reason the distinction is printed here.
        </p>
      </div>
    </Panel>
  );
}
