/**
 * AirPanel.tsx — squadrons, and what is actually on the line.
 *
 * Two things this panel refuses to do.
 *
 * It does not lead with the squadron count. An air force is briefed as a
 * stock and behaves as a rate, and the number that decides anything is
 * what is serviceable — which is a third lower than the list within six
 * months of a war, mostly from wear rather than losses, and appears in
 * no figure anybody is given.
 *
 * And it does not recommend a bombing campaign. It prints what the
 * campaign actually achieves, in the same type as everything else, next
 * to the button that starts it. That option is the most politically
 * attractive thing on this desk — none of our people are on the ground,
 * the destruction is measurable, the footage is excellent — and the
 * honest sentence about it belongs where the decision is taken rather
 * than in a turn report afterwards.
 */

import { useGame } from '../../state/store.ts';
import {
  AIRCRAFT_TEMPLATES,
  AIR_CAMPAIGNS,
  aircrewQuality,
  availableSorties,
  describeAir,
  effortShares,
  findAircraft,
  readyShare,
} from '../../game/index.ts';
import type { AirCampaign } from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

const PLANS: { label: string; effort: Partial<Record<AirCampaign, number>> }[] = [
  { label: 'Take the sky first', effort: { superiority: 1 } },
  { label: 'Sky, then the front', effort: { superiority: 0.5, close_support: 0.5 } },
  { label: 'Cut their supply', effort: { interdiction: 1 } },
  { label: 'Support the army', effort: { close_support: 1 } },
  { label: 'Bomb the country', effort: { strategic: 1 } },
  { label: 'All of it', effort: { superiority: 1, interdiction: 1, close_support: 1, strategic: 1 } },
];

export function AirPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const air = game.airForce;
  const ready = readyShare(air);
  const crew = aircrewQuality(air);
  const shares = effortShares(air);
  const byKind = AIRCRAFT_TEMPLATES.map((t) => ({
    template: t,
    own: air.squadrons.filter((s) => s.kind === t.key),
  })).filter((row) => row.own.length > 0);

  return (
    <div className="space-y-4">
      <Panel title="The air force" aside={`${(ready * 100).toFixed(0)}% on the line`}>
        <Kicker>A consumable that looks like an asset</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="On the line"
            value={`${(ready * 100).toFixed(0)}%`}
            detail={`of ${air.squadrons.length} squadrons`}
            tone={ready < 0.65 ? 'loss' : ready < 0.78 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Sorties a week"
            value={`${availableSorties(air).toFixed(0)}`}
            detail="what it can actually fly"
          />
          <Stat
            label="Aircrew"
            value={crew.toFixed(0)}
            detail="two years each, and not replaceable inside a war"
            tone={crew < 45 ? 'loss' : crew < 55 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeAir(air)}</p>
        <div className="mt-3">
          <Meter
            label="Who owns the sky"
            value={(air.superiority + 100) / 2}
            band={
              air.superiority > 20
                ? `ours, ${air.superiority.toFixed(0)}`
                : air.superiority < -20
                  ? `theirs, ${Math.abs(air.superiority).toFixed(0)}`
                  : 'contested'
            }
            hint="A precondition rather than a victory. It makes things possible and does none of them."
          />
        </div>
        {(air.airframesLost > 1 || air.aircrewLost > 1) && (
          <p className="mt-3 text-xs leading-relaxed text-ink-faint tnum">
            {air.airframesLost.toFixed(0)} airframes and {air.aircrewLost.toFixed(0)} aircrew
            lost. The first number can be bought back in three years. The second cannot be
            bought back at all.
          </p>
        )}
      </Panel>

      <Panel title="What it is for this week" aside={Object.keys(shares).length === 0 ? 'nothing' : `${Object.keys(shares).length} campaigns`}>
        <Kicker>Effort is finite, and every campaign subtracts from the others</Kicker>
        <div className="space-y-3">
          {AIR_CAMPAIGNS.filter((c) => c.key !== 'transport').map((campaign) => {
            const share = shares[campaign.key] ?? 0;
            return (
              <div key={campaign.key} className="border-t border-rule pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{campaign.label}</span>
                  {share > 0 && (
                    <Tag tone={campaign.key === 'strategic' ? 'warn' : 'accent'}>
                      {Math.round(share * 100)}% of the effort
                    </Tag>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{campaign.blurb}</p>
                <p className="mt-1 border-l-2 border-rule pl-2 text-xs leading-relaxed text-ink-faint">
                  {campaign.honest}
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PLANS.map((plan) => (
            <Button
              key={plan.label}
              onClick={() => void dispatch({ type: 'set_air_effort', effort: plan.effort })}
            >
              {plan.label}
            </Button>
          ))}
        </div>
        {air.bombingResolve > 4 && (
          <p className="mt-3 border-l-2 border-loss/50 pl-3 text-xs leading-relaxed text-ink-soft">
            The bombing has hardened them by {air.bombingResolve.toFixed(0)} points. It has also
            destroyed a great deal, which is real and measurable and is most of why it is still
            on this desk. Nothing separates a population from its government less reliably than
            being bombed by somebody else's.
          </p>
        )}
      </Panel>

      <Panel title="Squadrons" aside={`${air.building.length} ordered`}>
        <div className="grid grid-cols-1 gap-1 text-xs tnum">
          {byKind.map(({ template, own }) => {
            const serviceable =
              own.reduce((s, sq) => s + (sq.strength / 100) * (sq.serviceable / 100), 0) /
              own.length;
            return (
              <div
                key={template.key}
                className="flex items-baseline justify-between border-b border-rule/40 py-1"
              >
                <span className="text-ink-soft">{template.label}</span>
                <span className="text-ink">
                  {own.length}
                  <span className={serviceable < 0.7 ? 'text-loss' : 'text-ink-faint'}>
                    {' '}
                    · {(serviceable * 100).toFixed(0)}% on the line
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['multirole', 'fighter', 'strike', 'drone', 'trainer'] as const).map((key) => (
            <Button
              key={key}
              disabled={game.politicalCapital < 9}
              onClick={() => void dispatch({ type: 'order_squadron', aircraft: key })}
              title={`₡${(findAircraft(key).cost * game.moneyScale).toFixed(0)}bn · ${findAircraft(key).buildYears} years`}
            >
              {findAircraft(key).label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          The training establishment is the line cut first in every economy drive since aircraft
          existed, and it is where aircrew come from at two years each.
        </p>
      </Panel>
    </div>
  );
}
