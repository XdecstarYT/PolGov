/**
 * CampaignRoom.tsx — buying attention.
 *
 * The channels are the payoff for modelling twenty kinds of voter: each one
 * reaches a different set of them, so the question stops being "how much can I
 * spend" and becomes "who am I trying to reach, and are they even watching".
 *
 * Polling is deliberately uncomfortable. The player never sees the true
 * figure — only samples, with a margin of error wide enough to mislead.
 */

import { useGame } from '../../state/store.ts';
import {
  CHANNEL_TEMPLATES,
  PC_COSTS_MEDIA,
  RALLY_COST,
  TOWN_HALL_COST,
  SEGMENT_TEMPLATES,
  availableVolunteerPushes,
  persuasionBySegment,
} from '../../game/index.ts';
import { Button, Kicker, Panel, PartyMark, Tag, pct } from './Primitives.tsx';

export function CampaignRoom() {
  const { game, dispatch } = useGame();
  if (!game || !game.campaign) return null;

  const campaign = game.campaign;
  const internals = game.partyInternals;
  const reachEffect = persuasionBySegment(campaign.reach);

  const volunteers = availableVolunteerPushes(internals.members, campaign.volunteerPushesUsed);

  /* Who the campaign has actually got through to, most first. */
  const reached = Object.entries(reachEffect)
    .map(([key, value]) => ({
      key,
      label: SEGMENT_TEMPLATES.find((s) => s.key === key)?.label ?? key,
      value: value ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <Panel
        title="Campaign channels"
        aside={`₡${internals.funds.toFixed(1)}m in party funds`}
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Nothing reaches everybody. Television lands with people who watch scheduled broadcasts;
          social platforms reach people who will never see one. Door knocking is the most persuasive
          thing you can do and cannot be bought — it costs volunteers, and you have{' '}
          <span className="text-ink tnum">{volunteers}</span> left.
        </p>

        <ul className="mt-3 space-y-2">
          {CHANNEL_TEMPLATES.map((channel) => {
            const bought = campaign.channelPushes[channel.key] ?? 0;
            const blocked = channel.requiresVolunteers && volunteers <= 0;
            const unaffordable = internals.funds < channel.cost;

            return (
              <li key={channel.key} className="border border-rule p-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-sm font-semibold text-ink">{channel.label}</span>
                  <span className="flex items-center gap-2 text-xs tnum text-ink-faint">
                    {bought > 0 && <Tag tone="accent">{bought} bought</Tag>}
                    <span>
                      ₡{channel.cost}m + {channel.pcCost} PC
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">{channel.blurb}</p>
                <div className="mt-2">
                  <Button
                    variant="quiet"
                    disabled={blocked || unaffordable || game.politicalCapital < channel.pcCost}
                    onClick={() => void dispatch({ type: 'campaign_push', channel: channel.key })}
                  >
                    {blocked
                      ? 'No volunteers left'
                      : unaffordable
                        ? `Needs ₡${channel.cost}m`
                        : `Run a ${channel.label.toLowerCase()} push`}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {reached.length > 0 && (
          <div className="mt-4 border-t border-rule pt-3">
            <Kicker>Who you have actually reached</Kicker>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {reached.map((row) => (
                <li key={row.key} className="text-xs text-ink-faint">
                  {row.label} <span className="tnum text-ink-soft">+{(row.value * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title="Polling" aside={`${campaign.polls.length} commissioned`}>
        <p className="text-sm leading-relaxed text-ink-soft">
          A poll is a sample, not the truth. The margin of error is real, two polls the same week can
          disagree, and a campaign run off polling is a campaign run off noise.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={game.politicalCapital < PC_COSTS_MEDIA.pollSmall}
            onClick={() => void dispatch({ type: 'commission_poll', quality: 'small' })}
          >
            Quick poll · {PC_COSTS_MEDIA.pollSmall} PC
          </Button>
          <Button
            disabled={game.politicalCapital < PC_COSTS_MEDIA.pollStandard}
            onClick={() => void dispatch({ type: 'commission_poll', quality: 'standard' })}
          >
            Standard poll · {PC_COSTS_MEDIA.pollStandard} PC
          </Button>
          <Button
            disabled={game.politicalCapital < PC_COSTS_MEDIA.pollLarge}
            onClick={() => void dispatch({ type: 'commission_poll', quality: 'large' })}
          >
            Large sample · {PC_COSTS_MEDIA.pollLarge} PC
          </Button>
        </div>

        {campaign.polls.length > 0 && (
          <ul className="mt-4 space-y-3">
            {[...campaign.polls].reverse().slice(0, 4).map((poll, index) => (
              <li key={index} className="border border-rule p-2.5">
                <div className="flex items-baseline justify-between text-xs text-ink-faint">
                  <span>
                    Month {poll.turnNumber} · {poll.quality} sample
                  </span>
                  <span className="tnum">±{poll.marginOfError.toFixed(1)} pts</span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {[...game.parties]
                    .map((party) => ({ party, share: poll.shares[party.id] ?? 0 }))
                    .sort((a, b) => b.share - a.share)
                    .slice(0, 5)
                    .map(({ party, share }) => (
                      <li key={party.id} className="flex items-center gap-2 text-sm">
                        <PartyMark color={party.color} glyph={party.glyph} />
                        <span className="min-w-0 flex-1 truncate text-ink-soft">
                          {party.shortName}
                        </span>
                        <span className="tnum text-ink">{pct(share * 100, 1)}</span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="On the ground" aside={`${campaign.rallies} rallies · ${campaign.townHalls} town halls`}>
        <p className="text-sm leading-relaxed text-ink-soft">
          A rally fires up people already minded to vote for you and persuades nobody new. A town
          hall is small, unscripted, and unusually good at moving the undecided — if it goes well.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {game.regions.map((region) => (
            <div key={region.id} className="flex flex-wrap items-center justify-between gap-1.5 border border-rule p-2">
              <span className="text-sm text-ink">{region.name}</span>
              <span className="flex gap-1">
                <Button
                  variant="quiet"
                  disabled={
                    game.politicalCapital < PC_COSTS_MEDIA.rally || internals.funds < RALLY_COST
                  }
                  onClick={() => void dispatch({ type: 'hold_rally', regionId: region.id })}
                >
                  Rally · ₡{RALLY_COST}m
                </Button>
                <Button
                  variant="quiet"
                  disabled={
                    game.politicalCapital < PC_COSTS_MEDIA.townHall ||
                    internals.funds < TOWN_HALL_COST
                  }
                  onClick={() => void dispatch({ type: 'town_hall', regionId: region.id })}
                >
                  Town hall
                </Button>
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
