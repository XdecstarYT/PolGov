/**
 * Hemicycle.tsx — the chamber, drawn as a chamber.
 *
 * A bar chart tells you how many seats each party has. A hemicycle tells you
 * what the room looks like: who sits next to whom, and how much of it is
 * behind you. For a game whose central tension is legislative arithmetic,
 * that is the difference between reading a number and seeing a problem.
 *
 * Two encodings, deliberately separate:
 *
 *   · Where a seat sits is IDEOLOGY. Parties are seated left to right by
 *     economic position, the way a chamber is arranged, so neighbours on the
 *     arc are neighbours in politics. This is also what makes the bench
 *     palette's guarantee hold: it is validated for adjacent pairs in exactly
 *     this order, so the only colours that ever touch are ones proven to
 *     separate — in both themes, and under protan and deutan simulation.
 *
 *   · Whether a seat is filled or hollow is CONFIDENCE. Government benches
 *     are solid, opposition benches are outlines. Support is scattered across
 *     the arc rather than contiguous, so it cannot be read as an angle; it is
 *     read as a shape, which is also the second channel that keeps the
 *     chamber legible without colour.
 *
 * The majority is NOT drawn as a line through the chamber. It is a count, not
 * a direction, and a radial line implying otherwise would be a lie about the
 * geometry. It gets a linear gauge underneath, where a threshold can be read
 * off honestly.
 */

import { useMemo, useState } from 'react';
import { MAJORITY_SEATS, type Party } from '../../game/index.ts';
import { benchInk } from '../bench.ts';

interface Seat {
  x: number;
  y: number;
  angle: number;
  row: number;
}

/**
 * Lay out `total` seats across concentric arcs.
 *
 * Seats per row are proportional to that row's radius, so the spacing between
 * neighbours stays even across the whole chamber rather than bunching up on
 * the inside.
 */
function layout(total: number, rows: number, innerR: number, outerR: number): Seat[] {
  if (total <= 0) return [];

  const radii = Array.from({ length: rows }, (_, i) =>
    rows === 1 ? outerR : innerR + ((outerR - innerR) * i) / (rows - 1),
  );
  const weightTotal = radii.reduce((a, b) => a + b, 0);

  /* Distribute seats across rows by largest remainder, so none are lost. */
  const quotas = radii.map((r) => (total * r) / weightTotal);
  const counts = quotas.map((q) => Math.floor(q));
  let assigned = counts.reduce((a, b) => a + b, 0);
  const remainders = quotas
    .map((q, i) => ({ i, frac: q - Math.floor(q) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; assigned < total; k += 1, assigned += 1) {
    counts[remainders[k % remainders.length]!.i] += 1;
  }

  const seats: Seat[] = [];
  radii.forEach((radius, row) => {
    const n = counts[row]!;
    for (let i = 0; i < n; i += 1) {
      /* π (far left) to 0 (far right). Single-seat rows sit at the apex. */
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = Math.PI - t * Math.PI;
      seats.push({ x: Math.cos(angle) * radius, y: -Math.sin(angle) * radius, angle, row });
    }
  });

  /* Sweep the whole chamber left to right so party wedges come out contiguous. */
  return seats.sort((a, b) => b.angle - a.angle || a.row - b.row);
}

export function Hemicycle({
  parties,
  className = '',
  height = 'md',
}: {
  parties: Party[];
  className?: string;
  /** `sm` drops the gauge and the hover layer — for a card, not a headline. */
  height?: 'sm' | 'md';
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const seated = useMemo(() => {
    const total = parties.reduce((sum, p) => sum + p.seats, 0);
    if (total === 0) return null;

    const rows = total > 120 ? 8 : total > 60 ? 6 : 4;
    const positions = layout(total, rows, 46, 100);

    /* Seat parties left to right by economic position, as a chamber is. */
    const ordered = [...parties]
      .filter((p) => p.seats > 0)
      .sort((a, b) => a.ideology.economic - b.ideology.economic || a.id.localeCompare(b.id));

    const filled: { seat: Seat; party: Party }[] = [];
    let cursor = 0;
    for (const party of ordered) {
      for (let i = 0; i < party.seats && cursor < positions.length; i += 1, cursor += 1) {
        filled.push({ seat: positions[cursor]!, party });
      }
    }
    return { filled, total, ordered };
  }, [parties]);

  if (!seated) return null;

  const governmentSeats = parties
    .filter((p) => p.isPlayer || p.inCoalition)
    .reduce((sum, p) => sum + p.seats, 0);
  const hasMajority = governmentSeats >= MAJORITY_SEATS;
  const shortBy = MAJORITY_SEATS - governmentSeats;

  /* Seat radius scales with how crowded the chamber is. */
  const r = seated.total > 150 ? 2.4 : seated.total > 80 ? 3.1 : 4.1;
  const focus = hovered ? seated.ordered.find((p) => p.id === hovered) ?? null : null;

  return (
    <figure className={className}>
      <svg
        viewBox="-110 -110 220 116"
        className="w-full select-none"
        role="img"
        aria-label={
          `Chamber of ${seated.total} seats, arranged left to right by economic position. ` +
          `The government holds ${governmentSeats}: ` +
          (hasMajority ? `a working majority of ${governmentSeats - MAJORITY_SEATS + 1}.` : `${shortBy} short of the ${MAJORITY_SEATS} needed.`)
        }
        onMouseLeave={() => setHovered(null)}
      >
        {seated.filled.map(({ seat, party }, index) => {
          const inGovernment = party.isPlayer || party.inCoalition;
          const ink = benchInk(party);
          const dimmed = focus !== null && focus.id !== party.id;
          return (
            <circle
              key={index}
              cx={seat.x}
              cy={seat.y}
              r={focus?.id === party.id ? r + 0.5 : r}
              /* Solid = supports the government. Hollow = does not. Shape
                 carries the division so colour never has to. */
              fill={inGovernment ? ink : 'var(--color-panel)'}
              stroke={ink}
              strokeWidth={inGovernment ? 0.5 : 1.3}
              /* A surface-coloured hairline keeps neighbouring seats from
                 merging into one mass at small radii. */
              paintOrder="stroke"
              opacity={dimmed ? 0.22 : 1}
              style={{ transition: 'opacity 140ms ease, r 140ms ease' }}
              onMouseEnter={height === 'md' ? () => setHovered(party.id) : undefined}
            >
              <title>
                {party.name} — {party.seats} {party.seats === 1 ? 'seat' : 'seats'},{' '}
                {inGovernment ? 'in government' : 'in opposition'}
              </title>
            </circle>
          );
        })}
      </svg>

      {height === 'md' && (
        <>
          {/*
            The division. A threshold is a length, so it is drawn on a length:
            the government's total against the line it has to clear.
          */}
          <div className="mt-2">
            <div className="relative h-2.5 w-full overflow-hidden rounded-[2px] bg-sunk shadow-[inset_0_1px_2px_rgb(20_19_15/0.12)]">
              <div
                className="h-full rounded-r-[2px] transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (governmentSeats / seated.total) * 100)}%`,
                  backgroundColor: 'var(--color-bench-you)',
                }}
              />
              <div
                className="absolute inset-y-0 w-[1.5px] bg-seal"
                style={{ left: `${(MAJORITY_SEATS / seated.total) * 100}%` }}
                aria-hidden
              />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-xs text-ink-faint">
                <span className="tnum text-ink">{governmentSeats}</span> of{' '}
                <span className="tnum">{seated.total}</span> behind the government
              </span>
              <span className={`text-xs tnum ${hasMajority ? 'text-gain' : 'text-warn'}`}>
                {hasMajority
                  ? `majority of ${governmentSeats - MAJORITY_SEATS + 1}`
                  : `${shortBy} short of ${MAJORITY_SEATS}`}
              </span>
            </div>
          </div>

          {/*
            Legend. Always present, always direct-labelled with the party's
            name, its glyph and its count, so the chamber can be read with no
            colour perception at all.
          */}
          <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {[...seated.ordered]
              .sort((a, b) => b.seats - a.seats)
              .map((party) => {
                const inGovernment = party.isPlayer || party.inCoalition;
                const dimmed = focus !== null && focus.id !== party.id;
                return (
                  <button
                    key={party.id}
                    type="button"
                    onMouseEnter={() => setHovered(party.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(party.id)}
                    onBlur={() => setHovered(null)}
                    className="flex items-baseline gap-1.5 text-xs transition-opacity"
                    style={{ opacity: dimmed ? 0.4 : 1 }}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 translate-y-px rounded-full"
                      style={{
                        backgroundColor: inGovernment ? benchInk(party) : 'transparent',
                        boxShadow: `inset 0 0 0 ${inGovernment ? 0.5 : 1.25}px ${benchInk(party)}`,
                      }}
                      aria-hidden
                    />
                    <span className={party.isPlayer ? 'font-semibold text-ink' : 'text-ink-soft'}>
                      {party.shortName}
                    </span>
                    <span className="tnum text-ink-faint">{party.seats}</span>
                  </button>
                );
              })}
          </figcaption>
          <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-faint">
            Seated by economic position, left to right. Filled benches back the government;
            outlined benches do not.
          </p>
        </>
      )}
    </figure>
  );
}
