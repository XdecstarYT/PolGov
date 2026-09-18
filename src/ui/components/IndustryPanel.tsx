/**
 * IndustryPanel.tsx — what the economy is made of, and where.
 *
 * This panel exists to answer one question the national figures cannot: why
 * is a decision taken in the capital arriving as a job loss somewhere the
 * government has never visited. So it leads with the regions that have a
 * jobs problem, then names the industries causing it, then — when the player
 * opens one — the specific, signed reasons that industry is in trouble.
 *
 * Every number traces. An industry in difficulty always names what is doing
 * it, including the central bank, which the player does not control and will
 * be blamed for anyway.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  byOutput,
  findIndustry,
  industryExtremes,
  industryPressure,
  regionalEmployment,
  type IndustryKey,
} from '../../game/index.ts';
import { Kicker, Panel, Tag } from './Primitives.tsx';

export function IndustryPanel() {
  const { game } = useGame();
  const [open, setOpen] = useState<IndustryKey | null>(null);

  if (!game) return null;

  const jobs = regionalEmployment(game.industries);
  const { struggling, thriving } = industryExtremes(game.industries);
  const ranked = byOutput(game.industries);

  const regionRows = game.regions
    .map((region) => ({ region, gap: jobs[region.id] ?? 0 }))
    .sort((a, b) => a.gap - b.gap);
  const worst = regionRows.filter((r) => r.gap < -1.5);

  return (
    <Panel title="Industry and the regions" aside={`${game.industries.length} industries`}>
      <Kicker>Where a national decision actually lands</Kicker>
      <p className="text-sm leading-relaxed text-ink-soft">
        Output is one number and it cannot tell you why a rate rise ruins Sable Reach and barely
        touches Ternhill. Every industry sits somewhere, employs a different number of people than
        its output would suggest, and responds differently to the same decision.
      </p>

      {(struggling.length > 0 || thriving.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {struggling.map((i) => (
            <Tag key={i.key} tone="loss">
              {findIndustry(i.key).name} {(i.health - 100).toFixed(0)}
            </Tag>
          ))}
          {thriving.map((i) => (
            <Tag key={i.key} tone="gain">
              {findIndustry(i.key).name} +{(i.health - 100).toFixed(0)}
            </Tag>
          ))}
        </div>
      )}

      {/* Where the jobs problem is */}
      <div className="mt-5">
        <div className="label text-ink-faint">Jobs by region, against normal</div>
        {worst.length === 0 && (
          <p className="mt-1 text-xs text-ink-faint">
            No region is materially short of work. That is the easiest political weather there is,
            and it will not last.
          </p>
        )}
        <ul className="mt-2 space-y-1.5">
          {regionRows.map(({ region, gap }) => {
            const scale = Math.min(1, Math.abs(gap) / 12);
            return (
              <li key={region.id} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 truncate text-ink-soft">{region.name}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-[2px] bg-sunk">
                  <span
                    className="absolute inset-y-0 rounded-[2px]"
                    style={{
                      left: gap < 0 ? `${50 - scale * 50}%` : '50%',
                      width: `${scale * 50}%`,
                      backgroundColor: gap < 0 ? 'var(--color-loss)' : 'var(--color-gain)',
                    }}
                  />
                  <span className="absolute inset-y-0 left-1/2 w-px bg-rule-strong" />
                </span>
                <span
                  className={`w-12 shrink-0 text-right tnum text-xs ${
                    gap < -1.5 ? 'text-loss' : gap > 1.5 ? 'text-gain' : 'text-ink-faint'
                  }`}
                >
                  {gap >= 0 ? '+' : '−'}
                  {Math.abs(gap).toFixed(1)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The industries themselves */}
      <div className="mt-5">
        <div className="label text-ink-faint">The industries, by size</div>
        <ul className="mt-1.5 divide-y divide-rule">
          {ranked.map((industry) => {
            const template = findIndustry(industry.key);
            const isOpen = open === industry.key;
            const pressure = industryPressure(
              industry,
              game.economy,
              game.taxes,
              game.sectors,
            );
            const off = industry.health - 100;

            return (
              <li key={industry.key} className="py-2">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : industry.key)}
                >
                  <span className="text-sm text-ink">{template.name}</span>
                  <span className="flex items-baseline gap-3 text-xs tnum">
                    <span className="text-ink-faint">
                      {(industry.outputShare * 100).toFixed(1)}% of output
                    </span>
                    <span
                      className={
                        off < -2 ? 'text-loss' : off > 2 ? 'text-gain' : 'text-ink-faint'
                      }
                    >
                      {off >= 0 ? '+' : '−'}
                      {Math.abs(off).toFixed(1)}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-1.5">
                    <p className="text-xs leading-relaxed text-ink-soft">{template.blurb}</p>
                    <p className="mt-1 text-[0.7rem] text-ink-faint">
                      {(template.employmentShare * 100).toFixed(1)}% of the workforce ·
                      concentrated in{' '}
                      {Object.entries(template.regions)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 2)
                        .map(
                          ([id]) =>
                            game.regions.find((r) => r.id === id)?.name.toLowerCase() ?? id,
                        )
                        .join(' and ')}
                    </p>
                    {pressure.reasons.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {pressure.reasons.map((reason) => (
                          <li
                            key={reason.label}
                            className="flex items-baseline justify-between gap-2 text-xs"
                          >
                            <span className="text-ink-soft">{reason.label}</span>
                            <span
                              className={`tnum ${
                                reason.value >= 0 ? 'text-gain' : 'text-loss'
                              }`}
                            >
                              {reason.value >= 0 ? '+' : '−'}
                              {Math.abs(reason.value).toFixed(1)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-xs text-ink-faint">
                        Nothing is being done to it. It is drifting back to normal.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
