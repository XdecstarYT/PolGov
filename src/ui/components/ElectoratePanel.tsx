/**
 * ElectoratePanel.tsx — who the country actually is.
 *
 * Shows the twenty voter segments: how big each is, how reliably it votes,
 * what it cares about, and how it currently judges the government. This is the
 * teaching surface for the whole demographic model — a player who reads it
 * should understand why funding health wins retirees and why winning students
 * is worth less than winning them.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  ISSUE_LABELS,
  SEGMENT_TEMPLATES,
  computeIssueScores,
  regionBreakdown,
  segmentSatisfaction,
  segmentTurnout,
  topIssues,
} from '../../game/index.ts';
import { Kicker, Meter, Panel, Tag, bandFor, pct } from './Primitives.tsx';

export function ElectoratePanel() {
  const { game } = useGame();
  const [expanded, setExpanded] = useState<string | null>(null);

  const scores = useMemo(
    () => (game ? computeIssueScores(game.sectors, game.debt, game.revenueModifier, game.economy) : null),
    [game],
  );

  /** National weight of each segment, summed across every region. */
  const weights = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const region of game?.regions ?? []) {
      for (const [key, weight] of Object.entries(region.composition ?? {})) {
        totals[key] = (totals[key] ?? 0) + (weight ?? 0) * region.seats;
      }
    }
    return totals;
  }, [game]);

  if (!game || !scores) return null;

  const rows = SEGMENT_TEMPLATES.map((segment) => ({
    segment,
    weight: weights[segment.key] ?? 0,
    satisfaction: segmentSatisfaction(segment, scores),
    turnout: segmentTurnout(segment),
  }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.weight * b.turnout - a.weight * a.turnout);

  const totalWeighted = rows.reduce((sum, r) => sum + r.weight * r.turnout, 0);

  return (
    <div className="space-y-5">
      <Panel title="The issues, as the country sees them" aside="scored from the record">
        <p className="mb-3 text-sm leading-relaxed text-ink-soft">
          Every voter judges you on these eight, weighted by how much they personally care. Nothing
          here is an opinion poll — each score is derived directly from the state of the country.
        </p>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {(Object.keys(ISSUE_LABELS) as (keyof typeof ISSUE_LABELS)[]).map((issue) => (
            <li key={issue}>
              <Meter
                label={ISSUE_LABELS[issue]}
                value={scores[issue]}
                band={bandFor(scores[issue])}
              />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="The electorate"
        aside={`${rows.length} segments · ordered by votes cast`}
      >
        <p className="mb-3 text-sm leading-relaxed text-ink-soft">
          Influence is size multiplied by turnout, which is why a segment can be large and still
          barely matter. Segments overlap — a graduate may also be a renter — so the shares below
          describe weight in the electorate, not slices of a pie.
        </p>

        <ul className="divide-y divide-rule">
          {rows.map(({ segment, weight, satisfaction, turnout }) => {
            const influence = totalWeighted > 0 ? (weight * turnout) / totalWeighted : 0;
            const open = expanded === segment.key;
            return (
              <li key={segment.key} className="py-2.5">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : segment.key)}
                  aria-expanded={open}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-serif text-sm font-semibold text-ink">
                      {segment.label}
                    </span>
                    <span className="flex items-center gap-2 text-xs tnum text-ink-faint">
                      <span>{pct(influence * 100, 1)} of votes cast</span>
                      <span>·</span>
                      <span>{pct(turnout * 100, 0)} turnout</span>
                      <Tag
                        tone={
                          satisfaction > 0.58 ? 'gain' : satisfaction < 0.42 ? 'loss' : 'neutral'
                        }
                      >
                        {satisfaction > 0.58
                          ? 'with you'
                          : satisfaction < 0.42
                            ? 'against you'
                            : 'undecided'}
                      </Tag>
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="mt-2 space-y-2 border-l-2 border-rule-strong pl-3">
                    <p className="text-sm leading-relaxed text-ink-soft">{segment.blurb}</p>
                    <div>
                      <Kicker>What they judge you on</Kicker>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1">
                        {topIssues(segment, 4).map((issue) => (
                          <li key={issue} className="text-xs text-ink-faint">
                            {ISSUE_LABELS[issue]}{' '}
                            <span className="tnum text-ink-soft">
                              {scores[issue].toFixed(0)}/100
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Meter
                      label="Verdict on the government"
                      value={satisfaction * 100}
                      band={
                        satisfaction > 0.58
                          ? 'Favourable'
                          : satisfaction < 0.42
                            ? 'Unfavourable'
                            : 'Undecided'
                      }
                    />
                    <p className="text-xs text-ink-faint">
                      {segment.volatility >= 1.3
                        ? 'Swings hard on performance — winnable, and losable, in a single year.'
                        : segment.volatility <= 0.8
                          ? 'Votes on identity more than on record. Slow to win and slow to lose.'
                          : 'Moves at an ordinary pace on the government’s record.'}
                    </p>
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

/** Regional segment detail, used on the campaign map. */
export function RegionElectorate({ regionId }: { regionId: string }) {
  const { game } = useGame();
  if (!game) return null;

  const region = game.regions.find((r) => r.id === regionId);
  if (!region) return null;

  const scores = computeIssueScores(game.sectors, game.debt, game.revenueModifier, game.economy);
  const player = game.parties.find((p) => p.isPlayer);
  const breakdown = regionBreakdown(region, game.parties, {
    scores,
    incumbentId: player?.id ?? 'player',
  });

  const ranked = [...game.parties]
    .map((party) => ({ party, share: breakdown.shares[party.id] ?? 0 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 4);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="text-[0.68rem] uppercase tracking-wide text-ink-faint tnum">
        projected turnout {pct(breakdown.turnout * 100, 0)}
      </div>
      <ul className="space-y-0.5">
        {ranked.map(({ party, share }) => (
          <li key={party.id} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink-soft">
              {party.shortName}
              {party.isPlayer && <span className="ml-1 text-seal">(you)</span>}
            </span>
            <span className="tnum text-ink">{pct(share * 100, 1)}</span>
          </li>
        ))}
      </ul>
      <div className="text-[0.68rem] leading-snug text-ink-faint">
        Largest groups here:{' '}
        {breakdown.segments
          .slice(0, 3)
          .map((s) => s.label)
          .join(', ')}
        .
      </div>
    </div>
  );
}
