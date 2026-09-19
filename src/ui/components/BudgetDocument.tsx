/**
 * BudgetDocument.tsx — the paper the year turns on.
 *
 * Not a control panel. A document: a statement of the position at the top,
 * eight departments below it with the name of whoever runs each one, and a
 * line for every service the state provides. It is written in the first
 * quarter, it goes to the chamber once, and the government either has the
 * votes or does not.
 *
 * Three things the layout is trying to make unavoidable, because they are
 * the three things that decide the vote:
 *
 *   WHOSE DEPARTMENT IT IS. Every ministry header carries the holder's mark.
 *   The player never cuts "health"; they cut a named partner's department,
 *   and the minister's reaction is printed under the number before the
 *   player has finished reading it.
 *
 *   WHAT IS NOT A DECISION. Statutory lines sit in the document, greyed and
 *   locked, with the reason on them. A player who wants to know why there is
 *   no money should be able to see where it went without being told.
 *
 *   WHETHER IT PASSES. The whips' count is at the bottom, next to the button
 *   that spends it. It is an estimate — the engine draws the division around
 *   it — so a narrow count is a risk rather than a readout.
 */

import { useMemo, useState } from 'react';
import {
  BUDGET_LINE_PC_COST,
  BUDGET_PRESENT_PC_COST,
  BUDGET_TURN_INTERVAL,
  MINISTRY_TEMPLATES,
  TURNS_PER_YEAR,
  budgetDeadline,
  budgetSettled,
  cabinetReaction,
  capitalTotal,
  computeRevenue,
  describeBudget,
  discretionaryTotal,
  divideOnBudget,
  findService,
  isBudgetSeason,
  isStatutory,
  lineBounds,
  lineFor,
  ministryTotals,
  proposedTotal,
  statutoryTotal,
  supplyCost,
  TOTAL_SEATS,
} from '../../game/index.ts';
import type { GameState, MinistryKey, Party, ServiceKey } from '../../game/index.ts';
import { useGame } from '../../state/store.ts';
import { benchInk } from '../bench.ts';
import { Button, Delta, EmptyNote, Panel, PartyMark, Stat, Tag, money } from './Primitives.tsx';

export function BudgetDocument() {
  const { game } = useGame();
  if (!game) return null;
  return <Estimates game={game} />;
}

function Estimates({ game }: { game: GameState }) {
  const { dispatch } = useGame();
  const [open, setOpen] = useState<MinistryKey | null>('treasury');

  const budget = game.budget;
  const inSeason = isBudgetSeason(game.turnNumber);
  const revenue = computeRevenue(game.economy.gdp, game.revenueModifier, game.taxes) * TURNS_PER_YEAR;

  const reactions = useMemo(
    () => cabinetReaction(budget, game.parties),
    [budget, game.parties],
  );
  /* No generator: this is the whips' count, not the division. */
  const count = useMemo(
    () => divideOnBudget(budget, game.parties, TOTAL_SEATS),
    [budget, game.parties],
  );

  const holder = (id: string | null): Party | null =>
    id === null ? null : (game.parties.find((p) => p.id === id) ?? null);

  const weeksLeft = budgetDeadline(game.turnNumber) - game.turnNumber + 1;
  /* Whether THIS year's budget has been carried — the engine's predicate,
     so the button and the rule that governs it cannot disagree. */
  const settled = budgetSettled(game);

  return (
    <div className="space-y-5">
      <Panel
        title={`Estimates for year ${budget.year + 1}`}
        aside={
          settled
            ? 'carried'
            : inSeason
              ? `${weeksLeft} week${weeksLeft === 1 ? '' : 's'} to the deadline`
              : 'no budget was passed'
        }
        tone="seal"
      >
        <p className="font-serif text-[1.02rem] leading-relaxed text-ink">
          {describeBudget(budget, revenue)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {budget.stage === 'rejected'
            ? 'The chamber would not have it. Last year’s appropriation rolls on, which after a year of inflation is a cut nobody voted for.'
            : !settled
              ? 'These are the figures in force, which somebody else set. Nothing on this page is next year’s money until the chamber divides on it.'
              : budget.stage === 'enacted'
                ? 'Carried. This is what the state is spending.'
                : 'A draft. Nothing here is money until the chamber divides on it.'}
        </p>

        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3 border-t border-rule pt-4">
          <Stat label="Total" value={money(proposedTotal(budget))} detail="a year" />
          <Stat
            label="Receipts"
            value={money(revenue)}
            detail="at the rates now set"
          />
          <Stat
            label="Balance"
            value={money(revenue - proposedTotal(budget))}
            detail={revenue >= proposedTotal(budget) ? 'surplus' : 'borrowed'}
            tone={revenue >= proposedTotal(budget) ? 'gain' : 'loss'}
          />
          <Stat
            label="Not voted on"
            value={money(statutoryTotal(budget))}
            detail={`${((statutoryTotal(budget) / proposedTotal(budget)) * 100).toFixed(0)}% — set in law`}
          />
          <Stat
            label="Yours to argue about"
            value={money(discretionaryTotal(budget))}
            detail="the rest is somebody else’s promise"
          />
          <Stat label="Capital" value={money(capitalTotal(budget))} detail="builds something" />
        </div>
      </Panel>

      <Panel title="The departments">
        {!inSeason && (
          <p className="mb-4 border border-rule-strong bg-sunk/40 p-3 text-sm text-ink-soft">
            The estimates are settled. The document reopens in the first week of the next
            financial year, which is week {budgetDeadline(game.turnNumber) + TURNS_PER_YEAR - BUDGET_TURN_INTERVAL + 1}.
          </p>
        )}

        <ul className="divide-y divide-rule">
          {MINISTRY_TEMPLATES.map((template) => {
            const state = budget.ministries.find((m) => m.key === template.key)!;
            const totals = ministryTotals(budget, template.key);
            const reaction = reactions.find((r) => r.key === template.key)!;
            const party = holder(state.heldBy);
            const isOpen = open === template.key;

            return (
              <li key={template.key} className="py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
                  onClick={() => setOpen(isOpen ? null : template.key)}
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="w-3 shrink-0 text-ink-faint">
                      {isOpen ? '–' : '+'}
                    </span>
                    <span className="font-serif text-sm font-semibold text-ink">
                      {template.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <PartyMark
                        color={party ? benchInk(party) : 'var(--color-bench-you)'}
                        glyph={party ? party.glyph : '★'}
                      />
                      <span className="text-xs text-ink-faint">
                        {party ? party.shortName : 'you'}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3 tnum text-sm">
                    <span className="text-ink">{money(totals.proposed)}</span>
                    <Delta value={totals.change * 100} unit="%" />
                  </span>
                </button>

                {Math.abs(totals.change) > 0.005 && (
                  <p className="ml-5 mt-1 text-xs italic leading-relaxed text-ink-faint">
                    {reaction.line}
                  </p>
                )}

                {isOpen && (
                  <ul className="ml-5 mt-3 space-y-3">
                    {template.services.map((service) => (
                      <LineItem
                        key={service}
                        game={game}
                        service={service}
                        editable={inSeason && budget.stage !== 'presented'}
                        onAmount={(amount) =>
                          void dispatch({ type: 'set_budget_line', service, amount })
                        }
                        onCapital={(share) =>
                          void dispatch({ type: 'set_capital_share', service, share })
                        }
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-4 border-t border-rule pt-3 text-xs leading-relaxed text-ink-faint">
          Moving a line costs {BUDGET_LINE_PC_COST} PC. Nothing may fall by more than a quarter
          or rise by more than two fifths in one year — staff are on contracts, buildings are
          leased, and a minister told to find forty per cent resigns.
        </p>
      </Panel>

      <SupplyPanel />

      <Panel title="The division" tone="seal">
        <WhipsCount count={count} parties={game.parties} />

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          A budget is a confidence matter. There is no whipping it through: everybody already
          knows how they are voting, and what decided it was what you did to their departments
          in the weeks above. The count is an estimate — it is people asking other people what
          they intend to do.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={
              !inSeason ||
              settled ||
              budget.stage === 'presented' ||
              game.politicalCapital < BUDGET_PRESENT_PC_COST
            }
            onClick={() => void dispatch({ type: 'present_budget' })}
          >
            {settled
              ? 'The year is appropriated'
              : `Put it to the chamber · ${BUDGET_PRESENT_PC_COST} PC`}
          </Button>
          {budget.defeats > 0 && (
            <Tag tone="loss">
              {budget.defeats} budget{budget.defeats === 1 ? '' : 's'} lost in a row
            </Tag>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One line of the estimates
 * ------------------------------------------------------------------ */

function LineItem({
  game,
  service,
  editable,
  onAmount,
  onCapital,
}: {
  game: GameState;
  service: ServiceKey;
  editable: boolean;
  onAmount: (amount: number) => void;
  onCapital: (share: number) => void;
}) {
  const line = lineFor(game.budget, service);
  const template = findService(service);
  const bounds = lineBounds(line);
  const statutory = isStatutory(service);
  const delivered = game.services.find((s) => s.key === service);
  const change = line.enacted > 0 ? (line.proposed - line.enacted) / line.enacted : 0;

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label className="text-[0.82rem] text-ink" htmlFor={`line-${service}`}>
          {template.name}
        </label>
        <span className="flex items-center gap-2">
          {statutory && <Tag>set in law</Tag>}
          {line.committedYears > 0 && <Tag tone="brass">contracted {line.committedYears}y</Tag>}
          <span className="tnum text-[0.82rem] text-ink-soft">{money(line.proposed)}</span>
          {Math.abs(change) > 0.001 && <Delta value={change * 100} unit="%" />}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <input
          id={`line-${service}`}
          type="range"
          min={bounds.min}
          max={Math.max(bounds.max, bounds.min + 0.1)}
          step={0.1}
          value={line.proposed}
          disabled={!editable || statutory}
          onChange={(e) => onAmount(Number(e.target.value))}
          className="w-48 max-w-full accent-[var(--color-civic)] disabled:opacity-40"
          aria-describedby={`line-note-${service}`}
        />
        {!statutory && (
          <label className="flex items-center gap-1.5 text-[0.7rem] text-ink-faint">
            capital
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={line.capitalShare}
              disabled={!editable}
              onChange={(e) => onCapital(Number(e.target.value))}
              className="w-20 accent-[var(--color-brass)] disabled:opacity-40"
              aria-label={`${template.name} capital share`}
            />
            <span className="tnum">{(line.capitalShare * 100).toFixed(0)}%</span>
          </label>
        )}
      </div>

      <p id={`line-note-${service}`} className="mt-1 text-[0.7rem] leading-relaxed text-ink-faint">
        {statutory ? (
          <>
            A rate in law times the number of people who qualify. The budget cannot move it;
            a bill can.
          </>
        ) : delivered ? (
          <>
            The country is asking for {money(delivered.demand)}. This funds{' '}
            <span className="tnum">{((line.proposed / delivered.demand) * 100).toFixed(0)}%</span>{' '}
            of it.
          </>
        ) : (
          <>Between {money(bounds.min)} and {money(bounds.max)} this year.</>
        )}
      </p>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Confidence and supply
 * ------------------------------------------------------------------ */

function SupplyPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const player = game.parties.find((p) => p.isPlayer)!;
  const opposition = game.parties.filter((p) => !p.isPlayer && !p.inCoalition && p.seats > 0);
  if (opposition.length === 0) return null;

  const governmentSeats = game.parties
    .filter((p) => p.isPlayer || p.inCoalition)
    .reduce((sum, p) => sum + p.seats, 0);
  const short = governmentSeats <= TOTAL_SEATS / 2;

  return (
    <Panel title="Confidence and supply">
      <p className="text-sm leading-relaxed text-ink-soft">
        {short
          ? 'The government does not command the chamber. A budget passes only if somebody on the other side agrees to be elsewhere when the division is called.'
          : 'The government has the seats. Buying an abstention is insurance against its own backbenches.'}
      </p>

      <ul className="mt-3 space-y-2">
        {opposition.map((party) => {
          const cost = supplyCost(party, player);
          const agreed = game.budget.supply.includes(party.id);
          return (
            <li key={party.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                <PartyMark color={benchInk(party)} glyph={party.glyph} />
                <span className="truncate">{party.name}</span>
                <span className="shrink-0 tnum text-xs text-ink-faint">{party.seats} seats</span>
              </span>
              {agreed ? (
                <Tag tone="gain">standing aside</Tag>
              ) : (
                <Button
                  disabled={
                    game.politicalCapital < cost || !isBudgetSeason(game.turnNumber)
                  }
                  onClick={() => void dispatch({ type: 'secure_supply', partyId: party.id })}
                >
                  Secure supply · {cost} PC
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        They do not join the government, they do not endorse a word of it, and they will say so
        at length. The agreement lasts one budget, and your own benches will notice what it cost.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * The whips' count
 * ------------------------------------------------------------------ */

function WhipsCount({
  count,
  parties,
}: {
  count: ReturnType<typeof divideOnBudget>;
  parties: readonly Party[];
}) {
  const total = Math.max(1, count.for + count.against + count.abstain);
  const margin = count.for - count.against;

  const segments = [
    { label: 'For', value: count.for, ink: 'var(--color-gain)' },
    { label: 'Against', value: count.against, ink: 'var(--color-loss)' },
    { label: 'Absent', value: count.abstain, ink: 'var(--color-rule-strong)' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="label text-ink-faint">The whips’ count</span>
        <span className="tnum text-sm text-ink">
          {count.for} to {count.against}
          {count.abstain > 0 && (
            <span className="text-ink-faint"> · {count.abstain} absent</span>
          )}
        </span>
      </div>

      <div
        className="mt-2 flex h-2 w-full gap-[2px] overflow-hidden"
        role="img"
        aria-label={`${count.for} for, ${count.against} against, ${count.abstain} absent`}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((segment) => (
            <div
              key={segment.label}
              className="h-full rounded-[2px]"
              style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.ink }}
            />
          ))}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-ink-faint">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-[1px]"
              style={{ backgroundColor: segment.ink }}
            />
            {segment.label} <span className="tnum">{segment.value}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-ink-soft">
        {margin > 20
          ? 'Comfortable. Nobody is going to have to be found.'
          : margin > 0
            ? `Carried by ${margin}. That is not a majority, it is a rounding error with a name.`
            : 'It does not pass as written.'}
      </p>

      {count.rebels.length > 0 && (
        <ul className="mt-2 space-y-1">
          {count.rebels.map((rebel) => {
            const party = parties.find((p) => p.id === rebel.partyId);
            if (!party) return null;
            return (
              <li key={rebel.partyId} className="flex items-center gap-2 text-xs text-ink-soft">
                <PartyMark color={benchInk(party)} glyph={party.glyph} />
                {rebel.seats} of {party.shortName}’s own will vote against it
              </li>
            );
          })}
        </ul>
      )}

      {count.rebels.length === 0 && (
        <EmptyNote>Nobody on the government benches has said they will not wear it.</EmptyNote>
      )}
    </div>
  );
}
