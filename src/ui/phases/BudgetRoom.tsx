/**
 * BudgetRoom.tsx — phase 4.
 *
 * The estimates come first, because they are the only decision in the game a
 * government cannot avoid, delay past the year, or lose without the whole
 * thing coming apart. Everything else on this screen — tax, infrastructure,
 * the fiscal rules — is a lever on one side or other of the same equation,
 * and sits underneath it.
 *
 * The five sector sliders that used to be here are gone. They are still a
 * legitimate coarse control and the engine still accepts one, but a chart of
 * five numbers cannot say whose department it is, and that turned out to be
 * the only part of a budget that matters.
 */

import { useGame } from '../../state/store.ts';
import {
  PC_COSTS,
  TURNS_PER_YEAR,
  budgetPromiseKept,
  canEditBudget,
  coalitionPartners,
  computeDebtService,
  computeRevenue,
  isBudgetSeason,
  proposedTotal,
} from '../../game/index.ts';
import { Button, Panel, PartyMark, Stat, Tag, money } from '../components/Primitives.tsx';
import { benchInk } from '../bench.ts';
import { BudgetDocument } from '../components/BudgetDocument.tsx';
import { FiscalRulesRoom } from '../components/FiscalRulesRoom.tsx';
import { TaxPanel } from '../components/TaxPanel.tsx';
import { InfrastructurePanel } from '../components/InfrastructurePanel.tsx';

export function BudgetRoom() {
  const { game, dispatch, endTurn, resolvingRemotely } = useGame();
  if (!game) return null;

  const inSeason = isBudgetSeason(game.turnNumber);
  const editable = canEditBudget(game);

  /* Everything in the document is annual. Debt service is what this week
     costs, because that is a bill that arrives every week regardless. */
  const revenue =
    computeRevenue(game.economy.gdp, game.revenueModifier, game.taxes) * TURNS_PER_YEAR;
  const spending = proposedTotal(game.budget);
  const debtService = computeDebtService(game.debt) * TURNS_PER_YEAR;
  const balance = revenue - spending - debtService;

  const partners = coalitionPartners(game.parties);

  return (
    <div className="space-y-5">
      {!inSeason && (
        <Panel title="Supplementary estimates" tone="quiet">
          <p className="text-sm leading-relaxed text-ink-soft">
            The budget is settled for the year. A government that needs money it did not ask
            for has to go back to the chamber for it, out of order and in public, and everybody
            will want to know what changed.
          </p>
          <div className="mt-3">
            <Button
              disabled={editable || game.politicalCapital < PC_COSTS.emergencyBudget}
              onClick={() => void dispatch({ type: 'emergency_budget' })}
            >
              {editable
                ? 'Supplementary estimates are open'
                : `Call an emergency budget · ${PC_COSTS.emergencyBudget} PC`}
            </Button>
          </div>
        </Panel>
      )}

      <Panel title="The position" tone="quiet">
        <div className="flex flex-wrap gap-x-7 gap-y-3">
          <Stat label="Receipts" value={money(revenue)} detail="a year, at current rates" />
          <Stat label="Estimates" value={money(spending)} detail="a year, across twenty lines" />
          <Stat
            label="Debt service"
            value={money(debtService)}
            detail="a year, on paper already issued"
          />
          <Stat
            label="Balance"
            value={money(balance)}
            detail={balance < 0 ? 'deficit — financed by borrowing' : 'surplus — pays down debt'}
            tone={balance < 0 ? 'loss' : 'gain'}
          />
        </div>
      </Panel>

      <BudgetDocument />

      {partners.length > 0 && (
        <Panel title="Commitments to partners">
          <ul className="space-y-2">
            {partners.map((partner) => {
              const kept = budgetPromiseKept(partner, game.sectors);
              if (kept === null) return null;
              return (
                <li key={partner.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <PartyMark color={benchInk(partner)} glyph={partner.glyph} />
                    {partner.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {partner.redLines
                      .filter((r) => r.kind === 'sector_floor')
                      .map((r) => (
                        <span key={r.id} className="text-xs text-ink-faint">
                          {r.description}
                        </span>
                      ))}
                    <Tag tone={kept ? 'gain' : 'loss'}>{kept ? 'honoured' : 'broken'}</Tag>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <InfrastructurePanel />

      <TaxPanel />

      <FiscalRulesRoom />

      <Panel title="End the week">
        <p className="text-sm leading-relaxed text-ink-soft">
          The chamber divides on everything you have tabled, the week is applied, and the report
          tells you exactly what moved and why.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={() => void endTurn()} disabled={resolvingRemotely}>
            {resolvingRemotely ? 'Resolving…' : 'End turn →'}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
