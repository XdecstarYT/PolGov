/**
 * FinancePanel.tsx — the public finances, on the briefing.
 *
 * A debt total tells a player nothing they can act on. What they can act on
 * is what falls due and when, who is willing to lend and at what price, what
 * the government has promised about it, and what has been set aside. So this
 * panel leads with the rating and its stated reasons, and with the
 * refinancing cliff, rather than with a big number.
 *
 * The rating is shown with the review it is under, in the agencies' own
 * words. That is deliberate: a downgrade the player could not have seen
 * coming is a punishment, and one they watched approach for three months and
 * chose not to act on is a decision. The game wants the second kind.
 */

import { useMemo } from 'react';
import { useGame } from '../../state/store.ts';
import {
  FISCAL_RULE_LABELS,
  RATING_REVIEW_TURNS,
  averageCoupon,
  averageMaturity,
  borrowingCost,
  debtRatio,
  deficitRatio,
  describeRule,
  forecastFinance,
  maturingWithin,
  resolveFiscalTurn,
  ruleCredibility,
  ruleHolds,
} from '../../game/index.ts';
import { Kicker, Meter, Panel, Stat, Tag, money } from './Primitives.tsx';

/** A grade, with the tone its position in the scale earns. */
function Grade({ grade, muted = false }: { grade: string; muted?: boolean }) {
  const tone =
    grade === 'AAA' || grade === 'AA'
      ? 'text-gain'
      : grade === 'A' || grade === 'BBB'
        ? 'text-ink'
        : 'text-loss';
  return (
    <span className={`font-serif text-lg font-bold ${muted ? 'text-ink-faint' : tone}`}>
      {grade}
    </span>
  );
}

export function FinancePanel() {
  const { game } = useGame();

  const view = useMemo(() => {
    if (!game) return null;
    const fiscal = resolveFiscalTurn(
      game.sectors,
      game.economy,
      game.revenueModifier,
      game.debt,
      game.finance.bonds,
    );
    return {
      fiscal,
      forecast: forecastFinance(
        game.finance,
        game.debt,
        game.economy,
        fiscal.balance,
        fiscal.spending,
      ),
    };
  }, [game]);

  if (!game || !view) return null;

  const f = game.finance;
  const { fiscal, forecast } = view;
  const ratio = debtRatio(game.debt, game.economy.gdp);
  const deficit = deficitRatio(fiscal.balance, game.economy.gdp);
  const onReview = f.rating.pending !== f.rating.grade;
  const cliff = maturingWithin(f.bonds, 12);
  const credibility = ruleCredibility(f.rules);

  return (
    <Panel title="The public finances" aside={f.rating.grade}>
      <Kicker>Who is lending, and on what terms</Kicker>

      {!f.marketAccess && (
        <div className="mb-4 border-2 border-loss/60 bg-loss/5 p-3">
          <p className="font-serif text-[0.98rem] font-semibold text-ink">
            Nobody is lending to this country.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            The auctions are not clearing. The deficit has to be closed out of receipts, this
            week, whatever the chamber thinks of that — so every department not protected by
            statute is being reduced pro rata each quarter until it is. A government that cannot
            borrow for two years is a government that is replaced by one which will accept the
            terms; this one has been shut out for{' '}
            <span className="tnum">{f.weeksShutOut}</span> weeks.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            The way back is a surplus. The market is not asking whether the debt is large; it is
            asking which direction it is going.
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <div className="label text-ink-faint">Rating</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <Grade grade={f.rating.grade} />
            {onReview && (
              <>
                <span className="text-ink-faint">→</span>
                <Grade grade={f.rating.pending} muted />
              </>
            )}
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">
            {onReview
              ? `on review, week ${f.rating.reviewTurns} of ${RATING_REVIEW_TURNS}`
              : 'not under review'}
          </div>
        </div>
        <Stat
          label="Debt"
          value={`${(ratio * 100).toFixed(0)}%`}
          detail={`of output · ${money(game.debt)}`}
          tone={ratio > 0.9 ? 'loss' : ratio > 0.65 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Deficit"
          value={`${deficit >= 0 ? '' : '−'}${Math.abs(deficit * 100).toFixed(1)}%`}
          detail={deficit >= 0 ? 'of output, a year' : 'in surplus'}
          tone={deficit > 0.05 ? 'loss' : deficit > 0 ? 'warn' : 'gain'}
        />
        <Stat
          label="Next issue at"
          value={`${borrowingCost(game.economy.policyRate, f.spread).toFixed(2)}%`}
          detail={`${game.economy.policyRate.toFixed(2)}% policy + ${f.spread.toFixed(2)} spread`}
        />
      </div>

      {f.rating.reasons.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-ink-faint">
          {f.rating.reasons.map((reason) => (
            <li key={reason}>— {reason}</li>
          ))}
        </ul>
      )}

      {/* The book */}
      <div className="mt-5">
        <div className="label text-ink-faint">The book</div>
        <table className="mt-1.5 w-full text-sm">
          <caption className="sr-only">The government's borrowing</caption>
          <tbody>
            {[
              ['Carried at', `${averageCoupon(f.bonds).toFixed(2)}% on average`],
              [
                'Average life',
                `${(averageMaturity(f.bonds) / 12).toFixed(1)} years — ${
                  averageMaturity(f.bonds) < 30
                    ? 'short, and cheap until it is not'
                    : 'long enough to be durable'
                }`,
              ],
              [
                'Due inside a year',
                `${money(cliff)} — refinanced at whatever the market charges then`,
              ],
              ['Interest this week', money(fiscal.debtService)],
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
      </div>

      {/* Rules */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="label text-ink-faint">Your own rules</span>
          {f.rules.length > 0 && (
            <span className="text-xs text-ink-faint tnum">
              {(credibility * 100).toFixed(0)}% believed
            </span>
          )}
        </div>
        {f.rules.length === 0 ? (
          <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
            None adopted. A fiscal rule costs political capital to legislate and buys a cheaper
            cost of borrowing — but only after a year of actually keeping it, because the market
            prices behaviour rather than announcements. The whole payoff arrives after the
            election that could remove the government that adopted it.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {f.rules.map((rule) => {
              const holds = ruleHolds(
                rule,
                game.debt,
                game.economy.gdp,
                fiscal.balance,
                fiscal.spending,
              );
              return (
                <li key={rule.kind} className="text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-ink">{FISCAL_RULE_LABELS[rule.kind]}</span>
                    {holds ? (
                      <Tag tone="gain">kept {rule.complianceTurns}mo</Tag>
                    ) : (
                      <Tag tone="loss">broken {rule.breachTurns}mo</Tag>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint">{describeRule(rule)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Funds */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Meter
            label="Emergency fund"
            value={f.emergencyFund}
            max={60}
            hint={`${money(f.emergencyFund)} available — refills only out of surplus, and slowly`}
          />
        </div>
        <div>
          <div className="label text-ink-faint">Reserve fund</div>
          <div className="figure mt-0.5 text-xl text-ink">{money(f.reserveFund)}</div>
          <p className="text-xs leading-relaxed text-ink-faint">
            {f.reserveContribution > 0
              ? `Paying in ${money(f.reserveContribution)} a year. `
              : 'Nothing being paid in. '}
            It returns more than the debt costs, which makes funding it correct on a long horizon
            and wrong on a short one.
          </p>
        </div>
      </div>

      {/* The regions */}
      <div className="mt-5">
        <div className="label text-ink-faint">The regions</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          Regions deliver services and raise almost nothing themselves. Trim the grant and the
          cut appears in their accounts, not yours — and at the next election, in their results.
        </p>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Regional budgets and service quality</caption>
          <thead>
            <tr className="border-b border-rule text-left text-[0.68rem] uppercase tracking-wide text-ink-faint">
              <th scope="col" className="py-1 font-semibold">Region</th>
              <th scope="col" className="py-1 text-right font-semibold">Grant</th>
              <th scope="col" className="py-1 text-right font-semibold">Services</th>
              <th scope="col" className="py-1 text-right font-semibold">Their debt</th>
            </tr>
          </thead>
          <tbody>
            {f.regional.map((budget) => {
              const region = game.regions.find((r) => r.id === budget.regionId);
              return (
                <tr key={budget.regionId} className="border-b border-rule/60 last:border-0">
                  <td className="py-1 text-ink">{region?.name ?? budget.regionId}</td>
                  <td className="py-1 text-right tnum text-ink-soft">{money(budget.grant)}</td>
                  <td
                    className={`py-1 text-right tnum ${
                      budget.serviceQuality < 45 ? 'text-loss' : 'text-ink'
                    }`}
                  >
                    {budget.serviceQuality.toFixed(0)}
                  </td>
                  <td className="py-1 text-right tnum text-ink-faint">
                    {budget.debt > 0.5 ? money(budget.debt) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Forecast */}
      <div className="mt-5 rule-engraved border-t pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label text-ink-faint">If nothing changes · a year</span>
          <div className="flex flex-wrap gap-1.5">
            {forecast.downgradeInHorizon && <Tag tone="loss">Downgrade in the horizon</Tag>}
            {forecast.breachInHorizon.map((kind) => (
              <Tag key={kind} tone="warn">
                {FISCAL_RULE_LABELS[kind]} breached
              </Tag>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          Debt reaches{' '}
          <span className="tnum text-ink">{(forecast.endDebtRatio * 100).toFixed(0)}%</span> of
          output on this budget, against{' '}
          <span className="tnum">{(ratio * 100).toFixed(0)}%</span> today.
        </p>
      </div>
    </Panel>
  );
}
