/**
 * Charts.tsx — the seat chart and the standing trend.
 *
 * Both are built so the data is readable without perceiving colour: the seat
 * chart is accompanied by a full labelled table of every party's holding, and
 * the trend line carries an explicit numeric summary. Charts are decoration
 * over the numbers, never the only way to reach them.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ApprovalPoint, Party } from '../../game/index.ts';
import { MAJORITY_SEATS } from '../../game/index.ts';
import { PartyMark } from './Primitives.tsx';

const axis = { fontSize: 11, fill: 'var(--color-ink-faint)' };

/**
 * Seats by party, descending, with the majority threshold marked. A table of
 * the same figures sits directly beneath it.
 */
export function SeatChart({ parties }: { parties: Party[] }) {
  const data = [...parties]
    .filter((p) => p.seats > 0)
    .sort((a, b) => b.seats - a.seats)
    .map((p) => ({
      name: p.shortName,
      seats: p.seats,
      color: p.color,
      isPlayer: p.isPlayer,
    }));

  return (
    <div>
      <div className="h-44 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="var(--color-rule)" vertical={false} />
            <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--color-rule)' }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={40} />
            <ReferenceLine
              y={MAJORITY_SEATS}
              stroke="var(--color-seal)"
              strokeDasharray="4 3"
              label={{ value: 'majority', fontSize: 10, fill: 'var(--color-seal)', position: 'right' }}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-sunk)' }}
              contentStyle={{
                background: 'var(--color-panel)',
                border: '1px solid var(--color-rule)',
                fontSize: 12,
                color: 'var(--color-ink)',
              }}
            />
            <Bar dataKey="seats" isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Seats held by each party</caption>
        <thead>
          <tr className="border-b border-rule text-left text-[0.68rem] uppercase tracking-wide text-ink-faint">
            <th scope="col" className="py-1 font-semibold">Party</th>
            <th scope="col" className="py-1 text-right font-semibold">Seats</th>
            <th scope="col" className="py-1 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody>
          {[...parties]
            .filter((p) => p.seats > 0)
            .sort((a, b) => b.seats - a.seats)
            .map((party) => {
              const total = parties.reduce((sum, p) => sum + p.seats, 0);
              return (
                <tr key={party.id} className="border-b border-rule/60 last:border-0">
                  <td className="py-1">
                    <span className="flex items-center gap-2">
                      <PartyMark color={party.color} glyph={party.glyph} />
                      <span className="truncate text-ink">{party.name}</span>
                      {party.isPlayer && (
                        <span className="text-[0.65rem] uppercase tracking-wide text-seal">you</span>
                      )}
                      {party.inCoalition && !party.isPlayer && (
                        <span className="text-[0.65rem] uppercase tracking-wide text-civic">
                          in government
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-1 text-right tnum text-ink">{party.seats}</td>
                  <td className="py-1 text-right tnum text-ink-faint">
                    {((party.seats / total) * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/** Approval over the whole career, with a 50% reference line. */
export function ApprovalTrend({ history }: { history: ApprovalPoint[] }) {
  if (history.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-ink-faint">
        The trend appears once a few turns have been resolved.
      </p>
    );
  }

  const latest = history[history.length - 1]!.approval;
  const first = history[0]!.approval;
  const change = latest - first;

  return (
    <div>
      <div className="h-36 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 4, right: 8, bottom: 4, left: -22 }}>
            <CartesianGrid stroke="var(--color-rule)" vertical={false} />
            <XAxis dataKey="turn" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--color-rule)' }} />
            <YAxis domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} width={40} />
            <ReferenceLine y={50} stroke="var(--color-rule-strong)" strokeDasharray="4 3" />
            <Tooltip
              contentStyle={{
                background: 'var(--color-panel)',
                border: '1px solid var(--color-rule)',
                fontSize: 12,
                color: 'var(--color-ink)',
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Approval']}
              labelFormatter={(label) => `Month ${label}`}
            />
            <Line
              type="monotone"
              dataKey="approval"
              stroke="var(--color-civic)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-faint tnum">
        Now {latest.toFixed(1)}% · {change >= 0 ? 'up' : 'down'} {Math.abs(change).toFixed(1)} points
        across {history.length - 1} resolved months.
      </p>
    </div>
  );
}
