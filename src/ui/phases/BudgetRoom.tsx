/**
 * BudgetRoom.tsx — phase 4.
 *
 * Five sliders, a live projection of what each setting sustains, and an
 * honest deficit readout. The projection runs the same drift function the
 * resolution phase will run, so the preview cannot disagree with the outcome.
 *
 * Editable only on budget months unless an emergency budget is bought.
 */

import { useGame } from '../../state/store.ts';
import {
  PC_COSTS,
  SECTOR_LABELS,
  budgetPromiseKept,
  canEditBudget,
  coalitionPartners,
  computeDebtService,
  computeRevenue,
  findSector,
  isBudgetTurn,
  projectBudget,
  totalFunding,
} from '../../game/index.ts';
import {
  Button,
  Delta,
  Panel,
  PartyMark,
  Stat,
  Tag,
  bandFor,
  money,
} from '../components/Primitives.tsx';
import { benchInk } from '../bench.ts';
import { FiscalRulesRoom } from '../components/FiscalRulesRoom.tsx';

export function BudgetRoom() {
  const { game, dispatch, endTurn, resolvingRemotely } = useGame();
  if (!game) return null;

  const editable = canEditBudget(game);
  const projections = projectBudget(game.sectors, game.difficulty);
  const spending = totalFunding(game.sectors);
  const revenue = computeRevenue(findSector(game.sectors, 'economy').health, game.revenueModifier);
  const debtService = computeDebtService(game.debt);
  const balance = revenue - spending - debtService;

  const partners = coalitionPartners(game.parties);

  return (
    <div className="space-y-5">
      <Panel
        title="Budget room"
        aside={editable ? 'open for revision' : `fixed — reopens on month ${nextBudgetTurn(game.turnNumber)}`}
      >
        {!editable && (
          <div className="mb-4 border border-rule-strong bg-sunk/40 p-3">
            <p className="text-sm text-ink-soft">
              The estimates are settled for this month. You can force them open, but it costs
              capital and the chamber will notice.
            </p>
            <div className="mt-2">
              <Button
                disabled={game.politicalCapital < PC_COSTS.emergencyBudget}
                onClick={() => void dispatch({ type: 'emergency_budget' })}
              >
                Call an emergency budget · {PC_COSTS.emergencyBudget} PC
              </Button>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-3 border-b border-rule pb-4">
          <Stat label="Revenue" value={money(revenue)} detail="per month" />
          <Stat label="Spending" value={money(spending)} detail="across five sectors" />
          <Stat label="Debt service" value={money(debtService)} detail="interest this month" />
          <Stat
            label="Balance"
            value={money(balance)}
            detail={balance < 0 ? 'deficit — financed by borrowing' : 'surplus — pays down debt'}
            tone={balance < 0 ? 'loss' : 'gain'}
          />
        </div>

        <ul className="space-y-5">
          {projections.map((projection) => {
            const drift = projection.projectedHealth - projection.currentHealth;
            return (
              <li key={projection.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label
                    className="font-serif text-sm font-semibold text-ink"
                    htmlFor={`funding-${projection.key}`}
                  >
                    {SECTOR_LABELS[projection.key]}
                  </label>
                  <span className="text-xs tnum text-ink-faint">
                    health {projection.currentHealth.toFixed(0)} ·{' '}
                    {bandFor(projection.currentHealth)}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <input
                    id={`funding-${projection.key}`}
                    type="range"
                    min={0}
                    max={60}
                    step={0.5}
                    value={projection.funding}
                    disabled={!editable}
                    onChange={(e) =>
                      void dispatch({
                        type: 'set_funding',
                        sector: projection.key,
                        amount: Number(e.target.value),
                      })
                    }
                    className="w-56 max-w-full accent-[var(--color-civic)] disabled:opacity-50"
                    aria-describedby={`projection-${projection.key}`}
                  />
                  <span className="text-sm tnum text-ink">{money(projection.funding)}/mo</span>
                </div>

                <p id={`projection-${projection.key}`} className="mt-1 text-xs text-ink-faint">
                  This level sustains a health of{' '}
                  <span className="tnum text-ink-soft">{projection.equilibrium.toFixed(0)}</span>.
                  Next month it moves <Delta value={drift} unit="pts" /> to{' '}
                  <span className="tnum text-ink-soft">
                    {projection.projectedHealth.toFixed(0)}
                  </span>
                  .
                </p>
              </li>
            );
          })}
        </ul>
      </Panel>

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

      <FiscalRulesRoom />

      <Panel title="End the month">
        <p className="text-sm leading-relaxed text-ink-soft">
          The chamber divides on everything you have tabled, the month is applied, and the report
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

function nextBudgetTurn(turn: number): number {
  let next = turn + 1;
  while (!isBudgetTurn(next)) next += 1;
  return next;
}
