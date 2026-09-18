/**
 * ChartsLazy.tsx — kept as the import site for the charts.
 *
 * It used to defer Recharts, which was the largest thing in the bundle by a
 * wide margin. The charts are hand-built SVG now: a few kilobytes, no second
 * chunk, and no "Drawing…" placeholder on the panel the player looks at most.
 * The module stays so the call sites that import from here keep working, and
 * so there is one obvious place to put a code split back if a chart ever
 * needs a real dependency again.
 */

export { ApprovalTrend, SeatChart } from './Charts.tsx';
