/**
 * TaxPanel.tsx — setting the rates.
 *
 * The thing this panel exists to make visible is that raising a rate is not
 * a volume knob. Each instrument shows three numbers the player needs and
 * that a simple "tax level" slider could never express:
 *
 *   what it raises now         so they can see which instruments matter
 *   what the next point raises so they can see the elasticity biting
 *   where the peak is          so that going past it is a choice
 *
 * And under each one, the segments who actually pay it — because that is the
 * decision. The money is fungible; the people are not, and they vote.
 *
 * Nothing here recommends a level. Every rate raises real money and costs
 * real people, and the panel does not indicate which trade is correct.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  SEGMENT_TEMPLATES,
  TAX_CHANGE_PC_COST,
  changeRawness,
  incidenceBySegment,
  marginalYield,
  monthlyReceipts,
  receiptsBreakdown,
  revenuePeak,
  taxEffects,
  type TaxKey,
} from '../../game/index.ts';
import { Button, Panel, Tag, money } from './Primitives.tsx';

const segmentName = (key: string) =>
  SEGMENT_TEMPLATES.find((s) => s.key === key)?.label ?? key;

const pct = (value: number, places = 1) => `${(value * 100).toFixed(places)}%`;

export function TaxPanel() {
  const { game, dispatch } = useGame();
  const [draft, setDraft] = useState<Partial<Record<TaxKey, number>>>({});
  const [open, setOpen] = useState<TaxKey | null>(null);

  if (!game) return null;

  const gdp = game.economy.gdp;
  const rows = receiptsBreakdown(game.taxes, gdp);
  const total = monthlyReceipts(game.taxes, gdp);
  const burden = incidenceBySegment(game.taxes, gdp);
  const effects = taxEffects(game.taxes);

  const raisedOn = Object.entries(burden)
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const easedFor = Object.entries(burden)
    .filter(([, v]) => v < -0.05)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4);

  return (
    <Panel title="The rates" aside={`${money(total)} a month`}>
      <p className="text-sm leading-relaxed text-ink-soft">
        Seventeen instruments, each with its own base, its own revenue peak, and its own set of
        people who pay it. The decision is almost never how much to raise — it is who to raise it
        from, and what they will do about it.
      </p>

      {(raisedOn.length > 0 || easedFor.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {raisedOn.map(([key]) => (
            <Tag key={key} tone="loss">
              {segmentName(key)} paying more
            </Tag>
          ))}
          {easedFor.map(([key]) => (
            <Tag key={key} tone="gain">
              {segmentName(key)} paying less
            </Tag>
          ))}
        </div>
      )}

      <ul className="mt-4 divide-y divide-rule">
        {rows.map(({ template, rate, monthly, pastPeak }) => {
          const pending = draft[template.key] ?? rate;
          const dirty = Math.abs(pending - rate) > 1e-9;
          const peak = revenuePeak(template);
          const next = marginalYield(template, pending, gdp);
          const raw = changeRawness(game.taxes, template.key, game.turnNumber);
          const isOpen = open === template.key;

          return (
            <li key={template.key} className="py-2.5">
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : template.key)}
              >
                <span className="font-serif text-sm font-semibold text-ink">{template.name}</span>
                <span className="flex items-baseline gap-3 text-xs">
                  <span className="tnum text-ink">{pct(rate, 1)}</span>
                  <span className="tnum text-ink-faint">{money(monthly)}/mo</span>
                  {pastPeak && <Tag tone="warn">past its peak</Tag>}
                  {raw > 0 && <Tag tone="brass">recently changed</Tag>}
                </span>
              </button>

              {isOpen && (
                <div className="mt-2 pl-0.5">
                  <p className="text-xs leading-relaxed text-ink-soft">{template.blurb}</p>

                  <input
                    type="range"
                    min={0}
                    max={template.maxRate}
                    step={template.maxRate / 100}
                    value={pending}
                    aria-label={`${template.name} rate`}
                    onChange={(e) =>
                      setDraft({ ...draft, [template.key]: Number(e.target.value) })
                    }
                    className="mt-2 w-full"
                  />

                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="tnum text-ink">
                      {pct(pending, 1)}
                      {dirty && <span className="text-ink-faint"> from {pct(rate, 1)}</span>}
                    </span>
                    <span className="tnum text-ink-faint">
                      next point: {next >= 0 ? '+' : '−'}
                      {money(Math.abs(next))}/mo · peak at {pct(peak, 0)}
                    </span>
                  </div>

                  <p className="mt-1.5 text-[0.7rem] leading-relaxed text-ink-faint">
                    Paid by{' '}
                    {Object.entries(template.incidence)
                      .filter(([, w]) => w > 0)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([key]) => segmentName(key).toLowerCase())
                      .join(', ')}
                    .
                    {Object.entries(template.incidence).some(([, w]) => w < 0) && (
                      <>
                        {' '}
                        Shelters{' '}
                        {Object.entries(template.incidence)
                          .filter(([, w]) => w < 0)
                          .map(([key]) => segmentName(key).toLowerCase())
                          .join(', ')}
                        .
                      </>
                    )}
                  </p>

                  {dirty && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => {
                          void dispatch({
                            type: 'set_tax_rate',
                            tax: template.key,
                            rate: pending,
                          });
                          setDraft({ ...draft, [template.key]: undefined });
                        }}
                        disabled={game.politicalCapital < TAX_CHANGE_PC_COST}
                      >
                        Legislate · {TAX_CHANGE_PC_COST} PC
                      </Button>
                      <Button
                        variant="quiet"
                        onClick={() => setDraft({ ...draft, [template.key]: undefined })}
                      >
                        Discard
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* The income tax dials */}
      <div className="mt-5 rule-engraved border-t pt-4">
        <div className="label text-ink-faint">The shape of the income tax</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          Progressivity collects the same total from different people. Deductions and credits
          both cost money — the first is worth most to whoever has the most to deduct, the second
          is paid straight back out to the people with the least.
        </p>
        <div className="mt-3 space-y-3">
          {(
            [
              ['progressivity', 'Progressivity', 'flat', 'steep'],
              ['deductions', 'Deductions', 'none', 'generous'],
              ['credits', 'Credits', 'none', 'generous'],
            ] as const
          ).map(([dial, label, low, high]) => (
            <div key={dial}>
              <div className="flex items-baseline justify-between text-xs">
                <label className="text-ink-soft" htmlFor={`dial-${dial}`}>
                  {label}
                </label>
                <span className="tnum text-ink-faint">
                  {low} — {high}
                </span>
              </div>
              <input
                id={`dial-${dial}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={game.taxes[dial]}
                onChange={(e) =>
                  void dispatch({
                    type: 'set_tax_dial',
                    dial,
                    value: Number(e.target.value),
                  })
                }
                className="mt-1 w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Consequences beyond the money */}
      {(Math.abs(effects.investment) > 0.01 ||
        Math.abs(effects.prices) > 0.01 ||
        Object.keys(effects.sectors).length > 0) && (
        <div className="mt-5 rule-engraved border-t pt-4">
          <div className="label text-ink-faint">What the code is doing besides raising money</div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
            {Math.abs(effects.investment) > 0.01 && (
              <li>
                Business investment {effects.investment > 0 ? 'encouraged' : 'discouraged'} by{' '}
                <span className="tnum">{Math.abs(effects.investment).toFixed(2)}</span> points
              </li>
            )}
            {Math.abs(effects.prices) > 0.01 && (
              <li>
                Prices {effects.prices > 0 ? 'pushed up' : 'pulled down'} by{' '}
                <span className="tnum">{Math.abs(effects.prices).toFixed(2)}</span> points a year
              </li>
            )}
            {Object.entries(effects.sectors).map(([sector, value]) => (
              <li key={sector}>
                {sector} {value > 0 ? 'helped' : 'hurt'} by{' '}
                <span className="tnum">{Math.abs(value).toFixed(1)}</span> points
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
