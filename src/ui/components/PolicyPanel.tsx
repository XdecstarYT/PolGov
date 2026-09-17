/**
 * PolicyPanel.tsx — the life of a law, and the country's opinion of it.
 *
 * Two surfaces. `PolicyOpinionSummary` sits inside each bill on the Policy
 * Desk and answers the question the player actually has: who wants this, and
 * who will hate me for it. `PolicyLifecycle` covers everything that happens
 * around legislation — laws in force, laws about to lapse, the manifesto, the
 * referendums, and governing by decree.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  MANIFESTO_SIZE,
  PC_COSTS_POLICY,
  REFERENDUM_TEMPLATES,
  computeIssueScores,
  policyOpinion,
  type Bill,
} from '../../game/index.ts';
import { Button, Kicker, Panel, Tag, pct } from './Primitives.tsx';

/** Who is for this and who is against, before the player commits. */
export function PolicyOpinionSummary({ bill }: { bill: Bill }) {
  const { game } = useGame();
  const opinion = useMemo(() => {
    if (!game) return null;
    const scores = computeIssueScores(game.sectors, game.debt, game.revenueModifier);
    return policyOpinion(bill, game.regions, scores);
  }, [game, bill]);

  if (!opinion) return null;

  const mood =
    opinion.net > 0.12 ? 'popular' : opinion.net < -0.12 ? 'unpopular' : 'finely balanced';

  return (
    <div>
      <Kicker>What the country makes of it</Kicker>
      <p className="text-sm leading-relaxed text-ink-soft">
        Weighted by who actually turns out, this is{' '}
        <span className="text-ink">{mood}</span>
        {opinion.controversy > 0.45 && ' and genuinely divisive'}.
      </p>
      <div className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {opinion.supporters.length > 0 && (
          <div className="text-xs">
            <span className="text-gain">For: </span>
            <span className="text-ink-faint">
              {opinion.supporters.map((s) => s.label).join(', ')}
            </span>
          </div>
        )}
        {opinion.opponents.length > 0 && (
          <div className="text-xs">
            <span className="text-loss">Against: </span>
            <span className="text-ink-faint">
              {opinion.opponents.map((s) => s.label).join(', ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PolicyLifecycle() {
  const { game, dispatch } = useGame();
  const [manifesto, setManifesto] = useState<string[]>([]);
  if (!game) return null;

  const inForce = game.bills.filter((b) => b.status === 'passed');
  const lapsing = inForce.filter(
    (b) => b.lapsesOn !== null && b.lapsesOn !== undefined && b.lapsesOn - game.turnNumber <= 3,
  );
  const pending = inForce.filter((b) => !b.inEffect);
  const outstanding = game.promises.filter((p) => p.status === 'outstanding');
  const available = game.bills.filter((b) => b.status === 'available');
  const asked = new Set(game.referendums.map((r) => r.question));

  return (
    <div className="space-y-5">
      <Panel title="Laws in force" aside={`${inForce.length} on the books`}>
        {inForce.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing enacted yet.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {inForce.map((bill) => (
              <li key={bill.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="text-sm text-ink">{bill.title}</span>
                  {!bill.inEffect && (
                    <span className="ml-2 text-xs text-ink-faint">
                      takes effect month {bill.takesEffectOn}
                    </span>
                  )}
                  {bill.lapsesOn && (
                    <span className="ml-2 text-xs text-warn">lapses month {bill.lapsesOn}</span>
                  )}
                </span>
                <span className="flex gap-1.5">
                  {bill.lapsesOn && (
                    <Button
                      variant="quiet"
                      disabled={game.politicalCapital < PC_COSTS_POLICY.renewSunset}
                      onClick={() => void dispatch({ type: 'renew_sunset', billId: bill.id })}
                    >
                      Renew · {PC_COSTS_POLICY.renewSunset} PC
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    disabled={game.politicalCapital < PC_COSTS_POLICY.repealBill}
                    onClick={() => void dispatch({ type: 'repeal_bill', billId: bill.id })}
                    title="Unwinds the standing arrangements. The money already spent stays spent."
                  >
                    Repeal · {PC_COSTS_POLICY.repealBill} PC
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {(pending.length > 0 || lapsing.length > 0) && (
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            {pending.length > 0 && `${pending.length} not yet being felt. `}
            {lapsing.length > 0 &&
              `${lapsing.length} due to lapse within three months unless renewed.`}
          </p>
        )}
      </Panel>

      <Panel title="Manifesto" aside={`${outstanding.length} outstanding`}>
        {game.promises.length === 0 ? (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              Commit to up to {MANIFESTO_SIZE} bills for this term. Keeping a promise is worth
              something; breaking one is worth more, the other way — so promising less is often the
              stronger play.
            </p>
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {available.slice(0, 14).map((bill) => {
                const chosen = manifesto.includes(bill.templateKey);
                return (
                  <button
                    key={bill.id}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() =>
                      setManifesto(
                        chosen
                          ? manifesto.filter((k) => k !== bill.templateKey)
                          : manifesto.length < MANIFESTO_SIZE
                            ? [...manifesto, bill.templateKey]
                            : manifesto,
                      )
                    }
                    className={`block w-full border px-2 py-1 text-left text-sm ${
                      chosen ? 'border-ink bg-sunk/50 text-ink' : 'border-rule text-ink-soft'
                    }`}
                  >
                    {bill.title}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <Button
                variant="primary"
                disabled={manifesto.length === 0}
                onClick={() => void dispatch({ type: 'set_manifesto', billKeys: manifesto })}
              >
                Publish the manifesto ({manifesto.length}/{MANIFESTO_SIZE})
              </Button>
            </div>
          </>
        ) : (
          <ul className="space-y-1.5">
            {game.promises.map((promise) => (
              <li key={promise.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink-soft">{promise.title}</span>
                <Tag
                  tone={
                    promise.status === 'kept' ? 'gain' : promise.status === 'broken' ? 'loss' : 'neutral'
                  }
                >
                  {promise.status}
                </Tag>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Referendums" aside={`${game.referendums.length} held`}>
        <p className="text-sm leading-relaxed text-ink-soft">
          The country decides, not you. Winning one settles an argument permanently; losing one you
          called yourself is worse than never having asked.
        </p>

        {game.referendums.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-b border-rule pb-3">
            {game.referendums.map((held, index) => (
              <li key={index} className="text-sm">
                <span className="text-ink-soft">{held.question}</span>{' '}
                <Tag tone={held.passed ? 'gain' : 'loss'}>
                  {held.passed ? 'carried' : 'defeated'} {pct(held.yesShare * 100, 1)}
                </Tag>
              </li>
            ))}
          </ul>
        )}

        <ul className="mt-3 space-y-2">
          {REFERENDUM_TEMPLATES.filter((q) => !asked.has(q.question)).map((question) => (
            <li key={question.id} className="border border-rule p-2.5">
              <p className="text-sm text-ink">{question.question}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">{question.tradeoff}</p>
              <div className="mt-2">
                <Button
                  variant="quiet"
                  disabled={game.politicalCapital < PC_COSTS_POLICY.callReferendum}
                  onClick={() => void dispatch({ type: 'call_referendum', questionId: question.id })}
                >
                  Put it to the country · {PC_COSTS_POLICY.callReferendum} PC
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
