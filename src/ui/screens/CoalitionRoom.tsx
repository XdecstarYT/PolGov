/**
 * CoalitionRoom.tsx — forming a government.
 *
 * Partners are ranked by ideological distance. Each states what it wants:
 * cabinet posts, a funding floor for its priority sector, and one or two red
 * lines. Red lines are never negotiable — a counter-offer moves the numbers
 * only — because a line you can buy off is not a line.
 *
 * Governing in a minority is a legitimate option and is offered plainly.
 */

import { useGame } from '../../state/store.ts';
import {
  COALITION_MAX_ATTEMPTS,
  COUNTER_OFFER_PC_COST,
  MAJORITY_SEATS,
  SECTOR_LABELS,
  affinity,
  affinityLabel,
  playerParty,
  projectedSeats,
} from '../../game/index.ts';
import {
  Button,
  Kicker,
  Panel,
  PartyMark,
  Stat,
  Tag,
  money,
} from '../components/Primitives.tsx';

export function CoalitionRoom() {
  const { game, dispatch } = useGame();
  if (!game || !game.negotiation) return null;

  const negotiation = game.negotiation;
  const player = playerParty(game.parties);
  const committed = projectedSeats(game.parties, negotiation.accepted);
  const short = MAJORITY_SEATS - committed;
  const viable = committed >= MAJORITY_SEATS;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="border-b-2 border-ink pb-3">
        <Kicker>
          Government formation · attempt {negotiation.attempt} of {COALITION_MAX_ATTEMPTS}
        </Kicker>
        <h1 className="font-serif text-3xl font-bold text-ink">The coalition room</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          No single party commands the chamber. To govern you need {MAJORITY_SEATS} of{' '}
          {game.parties.reduce((sum, p) => sum + p.seats, 0)} seats behind you. Everything a partner
          asks for is a real commitment — their funding floor binds your budget, and their red lines
          will cost you dearly if you cross them later.
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-3 border-b border-rule pb-4">
        <Stat label="Your seats" value={player.seats} detail={player.name} />
        <Stat
          label="Committed"
          value={committed}
          detail={viable ? 'commands a majority' : `${short} short of a majority`}
          tone={viable ? 'gain' : 'warn'}
        />
        <Stat label="Capital" value={`${game.politicalCapital.toFixed(0)} PC`} detail="for counter-offers" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {negotiation.candidates.map((demand) => {
            const party = game.parties.find((p) => p.id === demand.partyId);
            if (!party) return null;
            const accepted = negotiation.accepted.includes(party.id);
            const fit = affinity(player.ideology, party.ideology);

            return (
              <Panel
                key={party.id}
                title={
                  <span className="flex items-center gap-2">
                    <PartyMark color={party.color} glyph={party.glyph} />
                    {party.name}
                  </span>
                }
                aside={`${party.seats} seats`}
                className={accepted ? 'border-ink' : ''}
              >
                <p className="text-sm leading-relaxed text-ink-soft">{demand.dialogue}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Tag tone={fit > 0.25 ? 'gain' : fit < -0.25 ? 'loss' : 'neutral'}>
                    {affinityLabel(fit)}
                  </Tag>
                  {accepted && <Tag tone="accent">in the provisional agreement</Tag>}
                  {demand.concessionsWon > 0 && (
                    <Tag>{(demand.concessionsWon * 100).toFixed(0)}% conceded</Tag>
                  )}
                </div>

                <dl className="mt-4 space-y-2 border-t border-rule pt-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-faint">Cabinet posts</dt>
                    <dd className="tnum text-ink">{demand.cabinetPosts}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-faint">
                      {SECTOR_LABELS[demand.sectorFloor.sector]} funding floor
                    </dt>
                    <dd className="tnum text-ink">{money(demand.sectorFloor.amount)}/mo</dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <Kicker>Red lines — not negotiable</Kicker>
                  <ul className="space-y-1">
                    {demand.redLines.map((line) => (
                      <li key={line.id} className="text-sm leading-relaxed text-ink-soft">
                        — {line.description}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {accepted ? (
                    <Button
                      onClick={() =>
                        void dispatch({ type: 'negotiation_remove', partyId: party.id })
                      }
                    >
                      Remove from the agreement
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() =>
                        void dispatch({ type: 'negotiation_accept', partyId: party.id })
                      }
                    >
                      Accept their terms
                    </Button>
                  )}
                  <Button
                    disabled={
                      game.politicalCapital < COUNTER_OFFER_PC_COST ||
                      demand.concessionsWon >= 0.85
                    }
                    onClick={() =>
                      void dispatch({ type: 'negotiation_counter', partyId: party.id })
                    }
                    title="Push back on the numbers. Red lines will not move."
                  >
                    Counter-offer · {COUNTER_OFFER_PC_COST} PC
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Panel title="Form a government">
            <p className="text-sm leading-relaxed text-ink-soft">
              {viable
                ? `Your provisional agreement commands ${committed} seats. That is enough to govern.`
                : `You are ${short} seats short. Accepting more partners — or pressing the ones you have — is the only way through.`}
            </p>
            <div className="mt-4 space-y-2">
              <Button
                variant="primary"
                disabled={negotiation.accepted.length === 0}
                onClick={() => void dispatch({ type: 'negotiation_form_government' })}
                className="w-full"
              >
                Present this government
              </Button>
              <Button
                onClick={() => void dispatch({ type: 'negotiation_abandon' })}
                className="w-full"
              >
                Govern in a minority
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              A minority government is legitimate and sometimes correct — but every bill will have
              to find its majority on the floor, vote by vote, without a partner obliged to help.
            </p>
            {negotiation.attempt > 1 && (
              <p className="mt-2 text-xs leading-relaxed text-warn">
                Attempt {negotiation.attempt} of {COALITION_MAX_ATTEMPTS}. Failing all of them
                forces a fresh election, and the country will judge the instability.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
