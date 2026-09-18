/**
 * FiscalRulesRoom.tsx — binding your own hands, at the budget.
 *
 * The two controls here are the only ones in the game whose payoff arrives
 * after the election that could remove the government using them. A fiscal
 * rule buys cheaper borrowing, but only after a year of being kept. The
 * reserve fund compounds at more than the debt costs, which makes paying
 * into it correct on a long horizon and wrong on a short one.
 *
 * Both are presented with that trade stated rather than hidden, because the
 * interesting decision is not "is this good" — it obviously is — but "is it
 * good enough to be worth the twelve months of looking like you are doing
 * nothing".
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  FISCAL_RULE_LABELS,
  FISCAL_RULE_PC_COST,
  FISCAL_RULE_REPEAL_PC_COST,
  RESERVE_CONTRIBUTION_MAX,
  RESERVE_CONTRIBUTION_PC_COST,
  debtRatio,
  describeRule,
  resolveFiscalTurn,
  ruleHolds,
  type FiscalRuleKind,
} from '../../game/index.ts';
import { Button, Panel, Tag, money } from './Primitives.tsx';

/**
 * What each rule would be set at, and what it means to adopt it.
 *
 * The thresholds are defaults rather than choices, because a rule the player
 * sets the number on is a rule they will set loosely enough to never bind,
 * and a constraint that never binds is not a constraint.
 */
const OFFERS: {
  kind: FiscalRuleKind;
  threshold: number;
  pitch: string;
  cost: string;
}[] = [
  {
    kind: 'deficit_cap',
    threshold: 0.03,
    pitch: 'The deficit stays under 3% of output.',
    cost: 'Binds hardest in a recession, which is exactly when you will want to borrow.',
  },
  {
    kind: 'debt_ceiling',
    threshold: 0.7,
    pitch: 'Debt stays under 70% of output.',
    cost: 'A long rule. If you are already near it, you have adopted a crisis.',
  },
  {
    kind: 'spending_cap',
    threshold: 110,
    pitch: 'Programme spending stays under ₡110bn a month.',
    cost: 'Caps the total, so every new programme has to come out of an old one.',
  },
  {
    kind: 'balanced_budget',
    threshold: 0,
    pitch: 'The budget balances, every month.',
    cost: 'The strictest thing you can promise. Almost nobody keeps it.',
  },
];

export function FiscalRulesRoom() {
  const { game, dispatch } = useGame();
  const [contribution, setContribution] = useState<number | null>(null);

  if (!game) return null;

  const f = game.finance;
  const fiscal = resolveFiscalTurn(
    game.sectors,
    game.economy,
    game.revenueModifier,
    game.debt,
    f.bonds,
  );
  const held = new Set(f.rules.map((r) => r.kind));
  const available = OFFERS.filter((offer) => !held.has(offer.kind));
  const pending = contribution ?? f.reserveContribution;

  return (
    <Panel title="Rules and reserves" aside="the long horizon">
      <p className="text-sm leading-relaxed text-ink-soft">
        Everything on this panel pays out after the next election. That is not a warning — it is
        the decision. A government that funds the reserve and keeps its own rules is handing a
        stronger position to whoever wins next, and spending its own term looking like it did
        nothing with the money.
      </p>

      {f.rules.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {f.rules.map((rule) => {
            const holds = ruleHolds(
              rule,
              game.debt,
              game.economy.gdp,
              fiscal.balance,
              fiscal.spending,
            );
            return (
              <li key={rule.kind} className="rule-engraved border-t pt-2.5 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-sm font-semibold text-ink">
                    {FISCAL_RULE_LABELS[rule.kind]}
                  </span>
                  {holds ? (
                    <Tag tone="gain">kept for {rule.complianceMonths} months</Tag>
                  ) : (
                    <Tag tone="loss">broken for {rule.breachMonths} months</Tag>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-faint">{describeRule(rule)}</p>
                <div className="mt-1.5">
                  <Button
                    variant="quiet"
                    onClick={() =>
                      void dispatch({ type: 'repeal_fiscal_rule', kind: rule.kind })
                    }
                    disabled={game.politicalCapital < FISCAL_RULE_REPEAL_PC_COST}
                  >
                    Repeal · {FISCAL_RULE_REPEAL_PC_COST} PC
                  </Button>
                  <span className="ml-2 text-[0.7rem] text-ink-faint">
                    Cheaper than adopting it was. The market has been watching, and every month of
                    credibility it earned goes with it.
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="mt-5">
          <div className="label text-ink-faint">Available to legislate</div>
          <ul className="mt-2 space-y-3">
            {available.map((offer) => (
              <li key={offer.kind}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{FISCAL_RULE_LABELS[offer.kind]}</span>
                  <Button
                    onClick={() =>
                      void dispatch({
                        type: 'adopt_fiscal_rule',
                        kind: offer.kind,
                        threshold: offer.threshold,
                      })
                    }
                    disabled={game.politicalCapital < FISCAL_RULE_PC_COST}
                  >
                    Adopt · {FISCAL_RULE_PC_COST} PC
                  </Button>
                </div>
                <p className="text-xs text-ink-soft">{offer.pitch}</p>
                <p className="text-[0.7rem] text-ink-faint">{offer.cost}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 rule-engraved border-t pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label text-ink-faint">Reserve fund</span>
          <span className="text-xs tnum text-ink-faint">
            {money(f.reserveFund)} held · debt at {(debtRatio(game.debt, game.economy.gdp) * 100).toFixed(0)}% of output
          </span>
        </div>
        <label className="mt-2 block text-sm text-ink-soft" htmlFor="reserve-contribution">
          Pay in <span className="tnum text-ink">{money(pending)}</span> a month
        </label>
        <input
          id="reserve-contribution"
          type="range"
          min={0}
          max={RESERVE_CONTRIBUTION_MAX}
          step={1}
          value={pending}
          onChange={(e) => setContribution(Number(e.target.value))}
          className="mt-1 w-full"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              void dispatch({ type: 'set_reserve_contribution', amount: pending });
              setContribution(null);
            }}
            disabled={
              pending === f.reserveContribution ||
              game.politicalCapital < RESERVE_CONTRIBUTION_PC_COST
            }
          >
            Commit · {RESERVE_CONTRIBUTION_PC_COST} PC
          </Button>
          <span className="text-[0.7rem] leading-relaxed text-ink-faint">
            Every credit paid in is a credit not spent on a service anyone will thank you for.
          </span>
        </div>
      </div>

      {f.emergencyFund > 0 && (
        <div className="mt-5 rule-engraved border-t pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="label text-ink-faint">Emergency fund</span>
            <span className="text-xs tnum text-ink-faint">{money(f.emergencyFund)} available</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            Free to draw. It refills only out of surplus, and only a sixth of one, so the usual
            way this goes wrong is arriving at the second crisis having spent it on the first.
          </p>
          <div className="mt-2">
            <Button
              variant="quiet"
              onClick={() =>
                void dispatch({
                  type: 'draw_emergency_fund',
                  amount: Math.min(20, f.emergencyFund),
                })
              }
            >
              Draw {money(Math.min(20, f.emergencyFund))} into the treasury
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
