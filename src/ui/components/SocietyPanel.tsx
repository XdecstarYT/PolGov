/**
 * SocietyPanel.tsx — who the country's money belongs to.
 *
 * The panel is built around one comparison and gives it the most space:
 * what each band has left after tax, housing and energy, against where it
 * stood the week this government took office. That number can fall while
 * growth is positive and while every headline figure on the economy panel
 * is green, and when it does, it is the thing the country is actually
 * responding to.
 *
 * Income and net worth are shown side by side rather than combined,
 * because they move for different reasons and a government can push hard
 * on one for a full term without touching the other. The gap between the
 * two Ginis is called out directly for the same reason.
 *
 * Nothing here is framed as a problem to be solved or a target to be hit.
 * It reports a distribution and what happened to it.
 */

import { useGame } from '../../state/store.ts';
import {
  CLASS_TEMPLATES,
  burdenByBand,
  decileRatio,
  describeSociety,
  homeownership,
  mortgagedShare,
  rentingShare,
} from '../../game/index.ts';
import { Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

/** A share of the whole, as a percentage with one place. */
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function SocietyPanel() {
  const { game } = useGame();
  if (!game) return null;

  const s = game.society;
  const burden = burdenByBand(game.taxes);
  const owned = homeownership(s.bands);

  /* The band that has lost most ground, which is the one being talked about. */
  const worst = s.bands.reduce((a, b) => (b.disposableIndex < a.disposableIndex ? b : a));
  const best = s.bands.reduce((a, b) => (b.disposableIndex > a.disposableIndex ? b : a));
  const spread = best.disposableIndex - worst.disposableIndex;

  return (
    <div className="space-y-4">
      <Panel title="What households have left" aside={`indexed to 100 at week one`}>
        <Kicker>The figure the headline figures do not contain</Kicker>
        <p className="text-sm leading-relaxed text-ink-soft">
          Income after tax, after housing and after energy, for each band, against where it
          stood when you took office. This is what a household experiences. It can fall while
          output rises, and when it does, no amount of being right about the growth rate helps.
        </p>

        <div className="mt-4 space-y-3">
          {s.bands.map((band) => {
            const template = CLASS_TEMPLATES.find((t) => t.key === band.key)!;
            const delta = band.disposableIndex - 100;
            return (
              <div key={band.key}>
                <Meter
                  label={
                    <span className="flex items-baseline justify-between gap-3">
                      <span>{template.label}</span>
                      <span className="tnum text-[0.7rem] text-ink-faint">
                        {pct(band.households)} of households
                      </span>
                    </span>
                  }
                  value={Math.min(160, band.disposableIndex)}
                  max={160}
                  band={`${band.disposableIndex.toFixed(0)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`}
                  hint={template.blurb}
                />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-ink-faint tnum">
                  <span>{pct(band.incomeShare)} of income</span>
                  <span aria-hidden>·</span>
                  <span>{pct(band.wealthShare)} of net worth</span>
                  <span aria-hidden>·</span>
                  <span>
                    {pct(band.tenure.owned + band.tenure.mortgaged)} own, {pct(band.tenure.renting)}{' '}
                    rent
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    saving {band.savingsRate.toFixed(1)}%, debt {band.debtToIncome.toFixed(1)}×
                    income
                  </span>
                  {burden[band.key] > 1.25 && <Tag tone="warn">carries more than its share</Tag>}
                  {burden[band.key] < 0.8 && <Tag tone="neutral">carries less than its share</Tag>}
                </div>
              </div>
            );
          })}
        </div>

        {spread > 4 && (
          <p className="mt-4 border-l-2 border-warn/50 pl-3 text-xs leading-relaxed text-ink-soft">
            The gap between the band that has done best and the band that has done worst under
            this government is {spread.toFixed(1)} points. A national average would show neither
            of them.
          </p>
        )}
      </Panel>

      <Panel title="How concentrated it is">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Income Gini"
            value={s.incomeGini.toFixed(3)}
            detail="0 is everybody the same"
          />
          <Stat
            label="Net worth Gini"
            value={s.wealthGini.toFixed(3)}
            detail={`${(s.wealthGini - s.incomeGini).toFixed(2)} wider than income`}
            tone={s.wealthGini > 0.72 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Top tenth to bottom"
            value={`${decileRatio(s.bands).toFixed(1)}×`}
            detail="by income"
          />
          <Stat
            label="Inherited"
            value={`${s.inheritedWealthShare.toFixed(0)}%`}
            detail="of net worth, not earned"
          />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Income and net worth move for different reasons: income follows wages, employment and
          the tax code; net worth follows asset prices, which follow the interest rate and the
          housing shortage. Neither of those last two is yours to set, which is why a government
          can spend four years raising wages at the bottom and hand on a more unequal country.
        </p>
      </Panel>

      <Panel title="The cost of getting by">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Cost of living"
            value={s.costOfLiving.toFixed(0)}
            detail="100 at week one"
            tone={s.costOfLiving > 135 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Housing takes"
            value={`${s.housingCostBurden.toFixed(0)}%`}
            detail="of a typical income"
            tone={s.housingCostBurden > 38 ? 'loss' : s.housingCostBurden > 30 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Below the line"
            value={`${s.povertyRate.toFixed(1)}%`}
            detail="under 60% of the median"
            tone={s.povertyRate > 20 ? 'loss' : s.povertyRate > 17 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Bottom to top"
            value={`${s.socialMobility.toFixed(0)}%`}
            detail="reach the top two bands"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Own a home" value={`${owned.toFixed(0)}%`} detail={`${mortgagedShare(s.bands).toFixed(0)}% on a mortgage`} />
          <Stat label="Renting" value={`${rentingShare(s.bands).toFixed(0)}%`} />
          <Stat
            label="Household debt"
            value={`${s.householdDebt.toFixed(0)}%`}
            detail="of annual output"
            tone={s.householdDebt > 160 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Household saving"
            value={`${s.householdSavings.toFixed(1)}%`}
            detail="of disposable income"
            tone={s.householdSavings < 0 ? 'loss' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeSociety(s)}</p>
      </Panel>
    </div>
  );
}
