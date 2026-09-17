/**
 * PartyRoom.tsx — the party you have to lead before you can lead a country.
 *
 * Shows the factions, what each of them controls, and how loyal they currently
 * are; the party's own money, membership and discipline; and the actions that
 * change any of it. The leadership-authority meter is the one to watch — fall
 * far enough on it and the party removes you regardless of what the country
 * thinks.
 */

import { useGame } from '../../state/store.ts';
import {
  AUTHORITY_CHALLENGE_THRESHOLD,
  FUNDRAISING_DRIVE_YIELD,
  HEADQUARTERS_COST,
  PC_COSTS_PARTY,
  affinityLabel,
  affinity,
  factionSeats,
  playerParty,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag, bandFor } from './Primitives.tsx';

export function PartyRoom() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const party = playerParty(game.parties);
  const internals = game.partyInternals;
  const atRisk = internals.authority < AUTHORITY_CHALLENGE_THRESHOLD + 12;

  return (
    <Panel
      title={`Inside ${party.name}`}
      aside={`${internals.members.toFixed(0)}k members · ₡${internals.funds.toFixed(1)}m`}
    >
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-rule pb-4">
        <Stat
          label="Your authority"
          value={internals.authority.toFixed(0)}
          detail={
            internals.authority < AUTHORITY_CHALLENGE_THRESHOLD
              ? 'a challenge is being organised'
              : atRisk
                ? 'the benches are restless'
                : 'secure for now'
          }
          tone={internals.authority < AUTHORITY_CHALLENGE_THRESHOLD ? 'loss' : atRisk ? 'warn' : 'neutral'}
        />
        <Stat
          label="Discipline"
          value={internals.cohesion.toFixed(0)}
          detail={bandFor(internals.cohesion)}
          tone={internals.cohesion < 35 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Party funds"
          value={`₡${internals.funds.toFixed(1)}m`}
          detail="separate from the treasury"
        />
        <Stat
          label="Membership"
          value={`${internals.members.toFixed(0)}k`}
          detail={`HQ level ${internals.headquarters}`}
        />
      </div>

      {atRisk && (
        <p className="mt-3 border border-warn p-2.5 text-sm leading-relaxed text-ink-soft">
          Your authority is low enough that a challenge is a live possibility. A government can
          survive the country turning on it; it cannot survive its own side doing so. Addressing the
          membership, or handing a wing the deputy leadership, both buy time.
        </p>
      )}

      <Kicker>
        <span className="mt-4 block">The factions</span>
      </Kicker>

      <ul className="space-y-3">
        {internals.factions.map((faction) => {
          const seats = factionSeats(faction, party.seats);
          const fit = affinity(party.ideology, faction.ideology);
          const isDeputy = internals.deputyFactionId === faction.id;

          return (
            <li key={faction.id} className="border border-rule p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-serif text-sm font-semibold text-ink">{faction.name}</span>
                <span className="flex items-center gap-2 text-xs tnum text-ink-faint">
                  <span>{seats} seats</span>
                  {isDeputy && <Tag tone="accent">deputy leader</Tag>}
                  {faction.rebelling && <Tag tone="loss">in rebellion</Tag>}
                </span>
              </div>

              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{faction.blurb}</p>

              <div className="mt-2">
                <Meter
                  label="Loyalty to you"
                  value={faction.loyalty}
                  band={bandFor(faction.loyalty)}
                  hint={`Position relative to your platform: ${affinityLabel(fit).toLowerCase()}`}
                />
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Button
                  variant="quiet"
                  disabled={isDeputy || game.politicalCapital < PC_COSTS_PARTY.appointDeputy}
                  onClick={() => void dispatch({ type: 'appoint_deputy', factionId: faction.id })}
                  title="Buys this wing's loyalty, and tells every other wing where they stand"
                >
                  Make deputy · {PC_COSTS_PARTY.appointDeputy} PC
                </Button>
                <Button
                  variant="quiet"
                  disabled={game.politicalCapital < PC_COSTS_PARTY.disciplineRebels}
                  onClick={() => void dispatch({ type: 'discipline_rebels', factionId: faction.id })}
                  title="Restores order across the party, at the cost of this wing's goodwill"
                >
                  Withdraw the whip · {PC_COSTS_PARTY.disciplineRebels} PC
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-4">
        <Button
          disabled={game.politicalCapital < PC_COSTS_PARTY.rallyParty}
          onClick={() => void dispatch({ type: 'rally_party' })}
        >
          Address the membership · {PC_COSTS_PARTY.rallyParty} PC
        </Button>
        <Button
          disabled={game.politicalCapital < PC_COSTS_PARTY.fundraisingDrive}
          onClick={() => void dispatch({ type: 'fundraising_drive' })}
          title={`Raises roughly ₡${FUNDRAISING_DRIVE_YIELD}m, more when the party is popular`}
        >
          Fundraising drive · {PC_COSTS_PARTY.fundraisingDrive} PC
        </Button>
        <Button
          disabled={
            game.politicalCapital < PC_COSTS_PARTY.investHeadquarters ||
            internals.funds < HEADQUARTERS_COST
          }
          onClick={() => void dispatch({ type: 'invest_headquarters' })}
          title="Better fundraising and campaign reach, and higher running costs"
        >
          Expand headquarters · {PC_COSTS_PARTY.investHeadquarters} PC + ₡{HEADQUARTERS_COST}m
        </Button>
      </div>
    </Panel>
  );
}
