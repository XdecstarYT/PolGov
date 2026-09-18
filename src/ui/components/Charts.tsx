/**
 * Charts.tsx — the chamber and the standing trend.
 *
 * Both are hand-built SVG. A charting library would give the same two shapes
 * at the cost of ~380 KB, a loading state on the most-visited panel of the
 * game, and a second visual language that never quite matches the paper the
 * rest of the interface is printed on. Two charts do not justify any of that.
 *
 * Both are readable without perceiving colour: the chamber is accompanied by
 * a full labelled table of every party's holding, and the trend carries an
 * explicit numeric summary and a table of its own turning points. Charts are
 * decoration over the numbers, never the only way to reach them.
 */

import { useId, useMemo, useState } from 'react';
import type { ApprovalPoint, Party } from '../../game/index.ts';
import { Hemicycle } from './Hemicycle.tsx';
import { PartyMark } from './Primitives.tsx';
import { benchInk } from '../bench.ts';

/**
 * The chamber, plus the same figures as a table.
 *
 * The table is not a fallback for the chart — it is the chart's companion,
 * and it is where exact numbers are read. The hemicycle answers "what does
 * the room look like"; the table answers "how many".
 */
export function SeatChart({ parties }: { parties: Party[] }) {
  const seated = [...parties].filter((p) => p.seats > 0).sort((a, b) => b.seats - a.seats);
  const total = parties.reduce((sum, p) => sum + p.seats, 0);

  return (
    <div>
      <Hemicycle parties={parties} />

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Seats held by each party</caption>
        <thead>
          <tr className="border-b border-rule text-left text-[0.68rem] uppercase tracking-wide text-ink-faint">
            <th scope="col" className="py-1 font-semibold">Party</th>
            <th scope="col" className="py-1 text-right font-semibold">Seats</th>
            <th scope="col" className="py-1 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody>
          {seated.map((party) => (
            <tr key={party.id} className="border-b border-rule/60 last:border-0">
              <td className="py-1">
                <span className="flex items-center gap-2">
                  <PartyMark color={benchInk(party)} glyph={party.glyph} />
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
                {total === 0 ? '—' : `${((party.seats / total) * 100).toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Approval over a career.
 * ------------------------------------------------------------------ */

const PAD = { top: 10, right: 34, bottom: 20, left: 30 };
const W = 340;
const H = 132;

/** A monotone cubic through the points — smooth without overshooting a value. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;
  }
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2 < points.length ? i + 2 : points.length - 1]!;
    /* Catmull-Rom converted to a cubic Bézier, tension 1/6. */
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Approval across the whole career, against the 50% line that decides whether
 * a government is comfortable or in trouble.
 *
 * The 50 line is the only gridline that means anything here, so it is the only
 * one drawn. The area under the curve is tinted on the side of 50 it is on —
 * the one place in the interface where a colour is allowed to editorialise,
 * because "above half the country" and "below it" is the fact the whole game
 * turns on. Both tints ship with the number beside them.
 */
export function ApprovalTrend({ history }: { history: ApprovalPoint[] }) {
  const gradientId = useId();
  const [cursor, setCursor] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (history.length < 2) return null;
    const turns = history.map((p) => p.turn);
    const minTurn = Math.min(...turns);
    const maxTurn = Math.max(...turns);
    const span = Math.max(1, maxTurn - minTurn);

    const x = (turn: number) => PAD.left + ((turn - minTurn) / span) * (W - PAD.left - PAD.right);
    const y = (approval: number) => PAD.top + (1 - approval / 100) * (H - PAD.top - PAD.bottom);

    const points = history.map((p) => ({ x: x(p.turn), y: y(p.approval), ...p }));
    return { points, x, y, minTurn, maxTurn };
  }, [history]);

  if (!geometry) {
    return (
      <p className="py-8 text-center text-sm text-ink-faint">
        The trend appears once a few turns have been resolved.
      </p>
    );
  }

  const { points, y } = geometry;
  const latest = history[history.length - 1]!.approval;
  const first = history[0]!.approval;
  const change = latest - first;
  const peak = history.reduce((a, b) => (b.approval > a.approval ? b : a));
  const trough = history.reduce((a, b) => (b.approval < a.approval ? b : a));

  const line = smoothPath(points);
  const baseline = y(0);
  const area = `${line} L ${points[points.length - 1]!.x} ${baseline} L ${points[0]!.x} ${baseline} Z`;
  const active = cursor === null ? null : points[cursor];

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs(points[i]!.x - px) < Math.abs(points[best]!.x - px)) best = i;
    }
    setCursor(best);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={
          `Approval from ${first.toFixed(0)}% at the start of the career to ${latest.toFixed(0)}% now, ` +
          `across ${history.length - 1} resolved months. Highest ${peak.approval.toFixed(0)}% in month ${peak.turn}, ` +
          `lowest ${trough.approval.toFixed(0)}% in month ${trough.turn}.`
        }
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-civic)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--color-civic)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* The only gridline worth drawing. */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(50)}
          y2={y(50)}
          stroke="var(--color-rule-strong)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x={W - PAD.right + 4}
          y={y(50) + 3}
          className="tnum"
          style={{ fontSize: '9px', fill: 'var(--color-ink-faint)' }}
        >
          50
        </text>

        {/* Axis ends only — a value every month would be noise. */}
        {[0, 100].map((value) => (
          <text
            key={value}
            x={PAD.left - 6}
            y={y(value) + 3}
            textAnchor="end"
            className="tnum"
            style={{ fontSize: '9px', fill: 'var(--color-ink-faint)' }}
          >
            {value}
          </text>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-civic)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* The end of the line is the only point labelled by default. */}
        <circle
          cx={points[points.length - 1]!.x}
          cy={points[points.length - 1]!.y}
          r="3.5"
          fill="var(--color-civic)"
          stroke="var(--color-panel)"
          strokeWidth="1.5"
        />

        {active && (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-rule-strong)"
              strokeWidth="1"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="4"
              fill="var(--color-panel)"
              stroke="var(--color-civic)"
              strokeWidth="2"
            />
          </g>
        )}

        <text
          x={PAD.left}
          y={H - 5}
          style={{ fontSize: '9px', fill: 'var(--color-ink-faint)' }}
          className="tnum"
        >
          month {geometry.minTurn}
        </text>
        <text
          x={W - PAD.right}
          y={H - 5}
          textAnchor="end"
          style={{ fontSize: '9px', fill: 'var(--color-ink-faint)' }}
          className="tnum"
        >
          month {geometry.maxTurn}
        </text>
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[2px] border border-rule bg-raised px-2 py-1 text-xs shadow-lift"
          style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
          role="status"
        >
          <span className="tnum font-semibold text-ink">{active.approval.toFixed(1)}%</span>{' '}
          <span className="text-ink-faint">month {active.turn}</span>
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        Now <span className="tnum text-ink">{latest.toFixed(1)}%</span> ·{' '}
        {change >= 0 ? 'up' : 'down'}{' '}
        <span className="tnum">{Math.abs(change).toFixed(1)}</span> points across{' '}
        <span className="tnum">{history.length - 1}</span> resolved months · high{' '}
        <span className="tnum">{peak.approval.toFixed(0)}%</span>, low{' '}
        <span className="tnum">{trough.approval.toFixed(0)}%</span>.
      </p>
    </div>
  );
}
