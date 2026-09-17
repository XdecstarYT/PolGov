/**
 * ChamberPanel.tsx — the second chamber, and the procedure available in both.
 *
 * The Senate is the thing most players will not expect: it is renewed by
 * halves, so half of it was elected by a previous electorate. A government
 * with a fresh mandate can still be stopped by the last one, and this panel
 * exists so that is visible rather than mysterious.
 */

import { useGame } from '../../state/store.ts';
import {
  MONEY_BILL_CATEGORIES,
  PC_COSTS_PROCEDURE,
  SENATE_SIZE,
  senateVerdict,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, PartyMark, Tag, pct } from './Primitives.tsx';

export function ChamberPanel() {
  const { game } = useGame();
  if (!game) return null;

  const senate = game.senate;
  const government = game.parties.filter((p) => p.isPlayer || p.inCoalition);
  const governmentSeats = government.reduce(
    (sum, party) => sum + (senate.seatsByParty[party.id] ?? 0),
    0,
  );
  const controls = governmentSeats > senate.size / 2;

  const ranked = [...game.parties]
    .map((party) => ({ party, seats: senate.seatsByParty[party.id] ?? 0 }))
    .filter((row) => row.seats > 0)
    .sort((a, b) => b.seats - a.seats);

  return (
    <Panel
      title="The Senate"
      aside={`${governmentSeats} of ${senate.size} with the government`}
    >
      <p className="text-sm leading-relaxed text-ink-soft">
        Half the Senate is renewed at each general election, so half of it still represents whoever
        was popular last time. Every bill except supply has to clear it.
        {controls
          ? ' You currently control it.'
          : ' You do not currently control it, which means bargaining for anything that is not a money bill.'}
      </p>

      <div className="mt-3">
        <Meter
          label="Government seats in the upper house"
          value={governmentSeats}
          max={senate.size}
          band={controls ? 'Control' : 'Minority'}
        />
      </div>

      <ul className="mt-3 space-y-1">
        {ranked.map(({ party, seats }) => (
          <li key={party.id} className="flex items-center gap-2 text-sm">
            <PartyMark color={party.color} glyph={party.glyph} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{party.name}</span>
            {(party.isPlayer || party.inCoalition) && (
              <span className="text-[0.65rem] uppercase tracking-wide text-civic">government</span>
            )}
            <span className="tnum text-ink">{seats}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        Supply is the lower house&apos;s alone —{' '}
        {MONEY_BILL_CATEGORIES.join(', ')} bills bypass the Senate entirely. An upper house that
        could block supply could starve a government it cannot remove.
      </p>
    </Panel>
  );
}

/** Procedural motions available on a bill already before the house. */
export function BillProcedure({ billId }: { billId: string }) {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const bill = game.bills.find((b) => b.id === billId);
  if (!bill || bill.status !== 'proposed') return null;

  const verdict = senateVerdict(bill, game.senate, game.parties);
  const partners = game.parties.filter((p) => p.inCoalition && !p.isPlayer);

  return (
    <div className="mt-2 border-t border-rule pt-2">
      <Kicker>Procedure</Kicker>

      <p className="mb-2 text-xs leading-relaxed text-ink-faint">
        {verdict.bypassed ? (
          <>Supply — this does not go to the Senate.</>
        ) : (
          <>
            Senate prospects:{' '}
            <span className="tnum text-ink-soft">{pct(verdict.chance * 100, 0)}</span> with{' '}
            {verdict.supportingSeats} of {SENATE_SIZE} senators behind the government.
            {bill.crossbenchDeals > 0 && ` ${bill.crossbenchDeals} crossbench arrangement(s) struck.`}
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="quiet"
          disabled={game.politicalCapital < PC_COSTS_PROCEDURE.sendToCommittee}
          onClick={() => void dispatch({ type: 'send_to_committee', billId })}
          title="Delayed a month; returns better drafted and less contentious"
        >
          Refer to committee · {PC_COSTS_PROCEDURE.sendToCommittee} PC
        </Button>

        {game.partyInternals.factions.map((faction) => (
          <Button
            key={faction.id}
            variant="quiet"
            disabled={game.politicalCapital < PC_COSTS_PROCEDURE.amendBill}
            onClick={() =>
              void dispatch({ type: 'amend_bill', billId, towardFactionId: faction.id })
            }
            title={`Moves the bill toward ${faction.name} to buy their votes, and waters it down`}
          >
            Amend toward {faction.name.replace(/^The /, '')} · {PC_COSTS_PROCEDURE.amendBill} PC
          </Button>
        ))}

        {partners.map((partner) => (
          <Button
            key={partner.id}
            variant="quiet"
            disabled={game.politicalCapital < PC_COSTS_PROCEDURE.amendBill}
            onClick={() => void dispatch({ type: 'amend_bill', billId, towardPartyId: partner.id })}
            title={`Moves the bill toward ${partner.name}`}
          >
            Amend toward {partner.shortName} · {PC_COSTS_PROCEDURE.amendBill} PC
          </Button>
        ))}

        {!verdict.bypassed && (
          <Button
            variant="quiet"
            disabled={game.politicalCapital < PC_COSTS_PROCEDURE.crossbenchDeal}
            onClick={() => void dispatch({ type: 'crossbench_deal', billId })}
          >
            Crossbench deal · {PC_COSTS_PROCEDURE.crossbenchDeal} PC
          </Button>
        )}

        <Button
          variant="quiet"
          disabled={game.politicalCapital < PC_COSTS_PROCEDURE.closeDebate}
          onClick={() => void dispatch({ type: 'close_debate', billId })}
          title="Forces a vote past obstruction, at a cost in public patience"
        >
          Close debate · {PC_COSTS_PROCEDURE.closeDebate} PC
        </Button>
      </div>

      {bill.amendments > 0 && (
        <p className="mt-1.5 text-xs text-ink-faint">
          <Tag tone="warn">amended {bill.amendments}×</Tag>{' '}
          Each concession took something out of the bill.
        </p>
      )}
    </div>
  );
}
