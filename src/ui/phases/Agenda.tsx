/**
 * Agenda.tsx — phase 3. Where political capital is spent.
 *
 * Everything that costs capital is here: tabling legislation, whipping it,
 * addressing the country, buying off partners, and — in the final two months
 * of a term — campaigning.
 *
 * The Policy Desk shows the full pass-chance arithmetic and any red line the
 * bill would cross BEFORE the player commits, which is the point of the
 * "consequences are legible" pillar.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  BILL_CATEGORY_LABELS,
  MOOD_RED_LINE_VIOLATION,
  PC_COSTS,
  PC_REDRAW_BOUNDARIES,
  meanDistortion,
  WHIP_MAX_STEPS,
  billPcCost,
  coalitionPartners,
  computePassChance,
  isCampaignTurn,
  type Bill,
  type BillCategory,
} from '../../game/index.ts';
import {
  Button,
  Delta,
  EmptyNote,
  Kicker,
  Panel,
  PartyMark,
  Tag,
  money,
} from '../components/Primitives.tsx';
import { EffectSummary } from './EventsPhase.tsx';
import { RegionElectorate } from '../components/ElectoratePanel.tsx';

export function Agenda() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const campaign = isCampaignTurn(game.turnNumber);

  return (
    <div className="space-y-5">
      <Panel title="The agenda" aside={`${game.politicalCapital.toFixed(0)} PC available`}>
        <p className="text-sm leading-relaxed text-ink-soft">
          Spend what you have. Capital regenerates each month in proportion to your standing, so a
          popular government can do more — and an unpopular one finds every door heavier.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void dispatch({ type: 'public_address' })}
            disabled={game.politicalCapital < PC_COSTS.publicAddress}
            title="A direct appeal to the country"
          >
            Address the nation · {PC_COSTS.publicAddress} PC
          </Button>
          <Button
            variant="primary"
            onClick={() => void dispatch({ type: 'advance_phase' })}
          >
            Continue to the budget →
          </Button>
        </div>
        {game.addressesThisTerm > 0 && (
          <p className="mt-2 text-xs text-ink-faint">
            {game.addressesThisTerm} address{game.addressesThisTerm === 1 ? '' : 'es'} made this
            term. Each one lands softer than the last.
          </p>
        )}
      </Panel>

      {campaign && <CampaignPanel />}

      <PolicyDesk />
      <CoalitionActions />
      <BoundaryReview />
      <ExtraordinaryActions />
    </div>
  );
}

/* --------------------------- Policy Desk --------------------------- */

function PolicyDesk() {
  const { game, dispatch } = useGame();
  const [category, setCategory] = useState<BillCategory | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [whip, setWhip] = useState<Record<string, number>>({});

  if (!game) return null;

  const tabled = game.bills.filter((b) => b.status === 'proposed');
  const available = useMemo(
    () =>
      game.bills.filter(
        (b) => b.status === 'available' && (category === 'all' || b.category === category),
      ),
    [game.bills, category],
  );

  const categories = Object.keys(BILL_CATEGORY_LABELS) as BillCategory[];

  return (
    <Panel
      title="Policy desk"
      aside={`${tabled.length} on the order paper`}
    >
      {tabled.length > 0 && (
        <div className="mb-4 border border-rule-strong bg-sunk/40 p-3">
          <Kicker>Tabled for this month&apos;s divisions</Kicker>
          <ul className="space-y-2">
            {tabled.map((bill) => (
              <li key={bill.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{bill.title}</span>
                <span className="flex items-center gap-3 text-xs text-ink-faint tnum">
                  <span>{((bill.passChance ?? 0) * 100).toFixed(0)}% to pass</span>
                  <Button
                    variant="quiet"
                    onClick={() => void dispatch({ type: 'withdraw_bill', billId: bill.id })}
                  >
                    Withdraw
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1">
        <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
          All
        </FilterChip>
        {categories.map((key) => (
          <FilterChip key={key} active={category === key} onClick={() => setCategory(key)}>
            {BILL_CATEGORY_LABELS[key]}
          </FilterChip>
        ))}
      </div>

      {available.length === 0 ? (
        <EmptyNote>Nothing left in this category — everything here has been enacted.</EmptyNote>
      ) : (
        <ul className="divide-y divide-rule">
          {available.map((bill) => (
            <BillRow
              key={bill.id}
              bill={bill}
              expanded={expanded === bill.id}
              onToggle={() => setExpanded(expanded === bill.id ? null : bill.id)}
              whipSteps={whip[bill.id] ?? 0}
              onWhip={(steps) => setWhip({ ...whip, [bill.id]: steps })}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border px-2 py-0.5 text-xs ${
        active ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-soft hover:bg-sunk'
      }`}
    >
      {children}
    </button>
  );
}

function BillRow({
  bill,
  expanded,
  onToggle,
  whipSteps,
  onWhip,
}: {
  bill: Bill;
  expanded: boolean;
  onToggle: () => void;
  whipSteps: number;
  onWhip: (steps: number) => void;
}) {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const breakdown = computePassChance(bill, game.parties, game.sectors, whipSteps);
  const cost = billPcCost(bill, whipSteps);
  const affordable = game.politicalCapital >= cost;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <span className="font-serif text-[0.95rem] font-semibold text-ink">{bill.title}</span>
          <span className="ml-2 text-xs text-ink-faint">
            {BILL_CATEGORY_LABELS[bill.category]} ·{' '}
            {bill.magnitude === 'major' ? 'major' : 'minor'}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-2 text-xs tnum text-ink-faint">
          {breakdown.breaches.length > 0 && <Tag tone="loss">red line</Tag>}
          <span>{(breakdown.chance * 100).toFixed(0)}%</span>
          <span>{cost} PC</span>
        </span>
      </div>

      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{bill.summary}</p>

      {expanded && (
        <div className="mt-3 space-y-3 border-l-2 border-rule-strong pl-3">
          <div>
            <Kicker>The case against</Kicker>
            <p className="text-sm leading-relaxed text-ink-soft">{bill.tradeoff}</p>
          </div>

          <div>
            <Kicker>Effects if enacted</Kicker>
            <EffectSummary effects={bill.effects} />
          </div>

          <div>
            <Kicker>How the {(breakdown.chance * 100).toFixed(0)}% is reached</Kicker>
            <ul className="divide-y divide-rule text-sm">
              {breakdown.terms.map((term) => (
                <li key={term.label} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="min-w-0">
                    <span className="text-ink-soft">{term.label}</span>{' '}
                    <span className="text-xs text-ink-faint">— {term.detail}</span>
                  </span>
                  <Delta value={term.value * 100} unit="%" />
                </li>
              ))}
            </ul>
          </div>

          {breakdown.breaches.length > 0 && (
            <div className="border border-loss bg-sunk/40 p-2.5">
              <Kicker>Coalition warning</Kicker>
              {breakdown.breaches.map((breach) => (
                <p key={breach.party.id} className="text-sm leading-relaxed text-ink-soft">
                  <span className="inline-flex items-center gap-1.5 align-middle">
                    <PartyMark color={breach.party.color} glyph={breach.party.glyph} />
                    <span className="text-ink">{breach.party.name}</span>
                  </span>{' '}
                  treats this as crossing a red line — {breach.redLine.description} Their{' '}
                  {breach.party.seats} seats will be withheld on the division, and passing it anyway
                  costs them <Delta value={MOOD_RED_LINE_VIOLATION} unit="mood" />.
                </p>
              ))}
            </div>
          )}

          <div>
            <Kicker>Whip the vote</Kicker>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={0}
                max={WHIP_MAX_STEPS}
                step={1}
                value={whipSteps}
                onChange={(e) => onWhip(Number(e.target.value))}
                aria-label={`Whip steps for ${bill.title}`}
                className="w-40 accent-[var(--color-civic)]"
              />
              <span className="text-xs text-ink-faint tnum">
                {whipSteps} step{whipSteps === 1 ? '' : 's'} · +
                {(whipSteps * 5).toFixed(0)}% · {whipSteps * PC_COSTS.whipStep} PC
              </span>
            </div>
          </div>

          <Button
            variant={affordable ? 'primary' : 'default'}
            disabled={!affordable}
            onClick={() =>
              void dispatch({ type: 'propose_bill', billId: bill.id, whipSteps })
            }
          >
            {affordable
              ? `Table this bill · ${cost} PC`
              : `Needs ${cost} PC (you have ${game.politicalCapital.toFixed(0)})`}
          </Button>
        </div>
      )}
    </li>
  );
}

/* ------------------------ coalition management --------------------- */

function CoalitionActions() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const partners = coalitionPartners(game.parties);
  if (partners.length === 0) return null;

  return (
    <Panel title="Coalition room">
      <p className="text-sm text-ink-soft">
        Partners drift on whether their red lines hold, whether their budget floor is funded,
        whether they have the cabinet weight they were promised, and how the government is doing
        overall. Success is forgiven quickly; failure is not.
      </p>
      <ul className="mt-4 space-y-3">
        {partners.map((partner) => {
          const mood = partner.coalitionMood ?? 0;
          return (
            <li key={partner.id} className="border border-rule p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2">
                  <PartyMark color={partner.color} glyph={partner.glyph} />
                  <span className="font-serif text-sm font-semibold text-ink">{partner.name}</span>
                </span>
                <span className="text-xs tnum text-ink-faint">
                  mood {mood.toFixed(0)}/100 · {partner.seats} seats · {partner.cabinetPosts} of{' '}
                  {partner.cabinetDemand} posts
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  disabled={game.politicalCapital < PC_COSTS.coalitionConcession}
                  onClick={() =>
                    void dispatch({ type: 'coalition_concession', partyId: partner.id })
                  }
                >
                  Grant a concession · {PC_COSTS.coalitionConcession} PC
                </Button>
                <Button
                  disabled={game.politicalCapital < PC_COSTS.reshuffleCabinet}
                  onClick={() => void dispatch({ type: 'reshuffle_cabinet', partyId: partner.id })}
                  title="Hand this partner an extra cabinet post"
                >
                  Give a cabinet post · {PC_COSTS.reshuffleCabinet} PC
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ---------------------------- campaign ---------------------------- */

function CampaignPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const debates = game.campaign?.debates.filter((d) => d.chosenIndex === null) ?? [];

  return (
    <Panel
      title="Campaign"
      aside={`${game.campaign?.stopsMade ?? 0} stops · ${game.campaign?.adBuys ?? 0} ad buys`}
    >
      <p className="text-sm leading-relaxed text-ink-soft">
        The election is close. Effort spent in a region lifts your support there specifically;
        advertising costs the treasury rather than your diary.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {game.regions.map((region) => (
          <div key={region.id} className="border border-rule p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-serif text-sm font-semibold text-ink">{region.name}</span>
              <span className="text-xs tnum text-ink-faint">{region.seats} seats</span>
            </div>
            <p className="mt-0.5 text-xs leading-snug text-ink-faint">{region.character}</p>
            <p className="mt-1 text-xs tnum text-ink-faint">
              effort invested: {region.campaignInvestment.toFixed(1)}
            </p>
            <RegionElectorate regionId={region.id} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="quiet"
                disabled={game.politicalCapital < PC_COSTS.campaignStop}
                onClick={() => void dispatch({ type: 'campaign_stop', regionId: region.id })}
              >
                Visit · {PC_COSTS.campaignStop} PC
              </Button>
              <Button
                variant="quiet"
                disabled={game.politicalCapital < PC_COSTS.adBuy}
                onClick={() => void dispatch({ type: 'ad_buy', regionId: region.id })}
              >
                Advertise · {PC_COSTS.adBuy} PC + {money(6)}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {debates.map((debate) => {
        const opponent = game.parties.find((p) => p.id === debate.opponentPartyId);
        return (
          <div key={debate.id} className="mt-5 border-t border-rule pt-4">
            <Kicker>Televised debate</Kicker>
            <p className="font-serif text-[0.95rem] leading-relaxed text-ink">{debate.attack}</p>
            <ul className="mt-3 space-y-2">
              {debate.responses.map((response, index) => (
                <li key={response.label}>
                  <Button
                    className="w-full justify-start text-left"
                    onClick={() =>
                      void dispatch({
                        type: 'answer_debate',
                        debateId: debate.id,
                        choiceIndex: index,
                      })
                    }
                  >
                    {response.label}
                  </Button>
                </li>
              ))}
            </ul>
            {opponent && (
              <p className="mt-2 text-xs text-ink-faint">
                Your answer is judged on the record you actually have — a claim the numbers do not
                support lands badly against {opponent.name}.
              </p>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

/* ------------------------- extraordinary --------------------------- */

/**
 * Boundary reviews. Only shown where boundaries decide anything — under
 * proportional counting there are no districts to redraw.
 */
function BoundaryReview() {
  const { game, dispatch } = useGame();
  if (!game || game.electoralSystem === 'proportional' || game.districts.length === 0) return null;

  return (
    <Panel title="Boundary commission" aside={`${game.districts.length} seats`}>
      <p className="text-sm leading-relaxed text-ink-soft">
        Redrawing a region&apos;s boundaries concedes one seat outright so that the rest become
        winnable — hostile voters packed into a district you were losing anyway, your own supporters
        spread across the marginals. It is legal, it works, and it is never free: the more distorted
        a map becomes, the more it costs you when the public notices.
      </p>
      <ul className="mt-3 space-y-2">
        {game.regions.map((region) => {
          const inRegion = game.districts.filter((d) => d.regionId === region.id);
          if (inRegion.length < 2) return null;
          const distortion = meanDistortion(inRegion);
          return (
            <li
              key={region.id}
              className="flex flex-wrap items-center justify-between gap-2 border border-rule p-2.5"
            >
              <span className="min-w-0">
                <span className="font-serif text-sm font-semibold text-ink">{region.name}</span>
                <span className="ml-2 text-xs tnum text-ink-faint">
                  {inRegion.length} seats · map {(distortion * 100).toFixed(0)}% distorted
                </span>
              </span>
              <span className="flex items-center gap-2">
                {distortion > 0.5 && <Tag tone="loss">heavily redrawn</Tag>}
                <Button
                  disabled={game.politicalCapital < PC_REDRAW_BOUNDARIES}
                  onClick={() => void dispatch({ type: 'redraw_boundaries', regionId: region.id })}
                >
                  Commission review · {PC_REDRAW_BOUNDARIES} PC
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ExtraordinaryActions() {
  const { game, dispatch } = useGame();
  const [confirming, setConfirming] = useState<'election' | 'retire' | null>(null);
  if (!game) return null;

  return (
    <Panel title="Extraordinary measures">
      <p className="text-sm text-ink-soft">
        Both of these end the current state of affairs. Neither can be undone.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {confirming === 'election' ? (
          <>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(null);
                void dispatch({ type: 'call_early_election' });
              }}
            >
              Confirm: dissolve and go to the country
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            disabled={game.politicalCapital < PC_COSTS.callEarlyElection}
            onClick={() => setConfirming('election')}
          >
            Call an early election · {PC_COSTS.callEarlyElection} PC
          </Button>
        )}

        {confirming === 'retire' ? (
          <>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(null);
                void dispatch({ type: 'retire' });
              }}
            >
              Confirm: stand down and end the run
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="quiet" onClick={() => setConfirming('retire')}>
            Stand down
          </Button>
        )}
      </div>
    </Panel>
  );
}
