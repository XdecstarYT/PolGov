/**
 * ChartsLazy.tsx — defer the charting library.
 *
 * Recharts is by far the largest dependency and nothing on the title or setup
 * screens needs it. Loading it on demand keeps first paint small; the fallback
 * reserves the same height so nothing jumps when it arrives.
 */

import { Suspense, lazy } from 'react';
import type { ApprovalPoint, Party } from '../../game/index.ts';

const SeatChartImpl = lazy(() =>
  import('./Charts.tsx').then((m) => ({ default: m.SeatChart })),
);
const ApprovalTrendImpl = lazy(() =>
  import('./Charts.tsx').then((m) => ({ default: m.ApprovalTrend })),
);

function Placeholder({ height }: { height: number }) {
  return (
    <div
      style={{ height }}
      className="flex items-center justify-center text-xs text-ink-faint"
    >
      Drawing…
    </div>
  );
}

export function SeatChart({ parties }: { parties: Party[] }) {
  return (
    <Suspense fallback={<Placeholder height={176} />}>
      <SeatChartImpl parties={parties} />
    </Suspense>
  );
}

export function ApprovalTrend({ history }: { history: ApprovalPoint[] }) {
  return (
    <Suspense fallback={<Placeholder height={144} />}>
      <ApprovalTrendImpl history={history} />
    </Suspense>
  );
}
