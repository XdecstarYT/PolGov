/**
 * FleetPanel.tsx — the fleet list, and the fleet.
 *
 * The panel puts two numbers next to each other that are never next to
 * each other in a briefing: hulls, and hulls that could sail. The first
 * is what a government is told it has. The second is what it has. The
 * gap between them opens over years of ordinary budgets rather than
 * suddenly in a war, which is why nobody notices it until they need the
 * navy, and why it is the first thing on this screen.
 *
 * The second thing it puts on the desk is the rule of three. Committing
 * twelve hulls to a station does not put twelve hulls there; it puts
 * four there, continuously, and the panel says so beside the button
 * rather than in a footnote — because a government that learns this
 * after promising to be somewhere has learned it too late.
 */

import { useGame } from '../../state/store.ts';
import {
  ROTATION_RATIO,
  SEA_ZONES,
  SEA_ZONE_LABELS,
  SHIP_TEMPLATES,
  afloat,
  describeNavy,
  findShip,
  laneSecurity,
  seaworthy,
  sustainablePresence,
  totalPresence,
  zoneControl,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function FleetPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const navy = game.navy;
  const hulls = afloat(navy);
  const able = seaworthy(navy);
  const hollow = hulls.length > 0 && able.length / hulls.length < 0.85;

  const byClass = SHIP_TEMPLATES.map((t) => ({
    template: t,
    all: hulls.filter((s) => s.shipClass === t.key),
    ready: able.filter((s) => s.shipClass === t.key),
    atSea: hulls.filter((s) => s.shipClass === t.key && s.station !== null),
  })).filter((row) => row.all.length > 0);

  return (
    <div className="space-y-4">
      <Panel title="The fleet" aside={`${able.length} of ${hulls.length} could sail`}>
        <Kicker>The fleet list is not the fleet</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="On the list" value={`${hulls.length}`} detail="the figure this desk is briefed" />
          <Stat
            label="Could sail"
            value={`${able.length}`}
            detail="the figure that matters"
            tone={hollow ? 'loss' : 'neutral'}
          />
          <Stat
            label="Trade routes held"
            value={`${(laneSecurity(navy) * 100).toFixed(0)}%`}
            detail="invisible until something stops arriving"
            tone={laneSecurity(navy) < 0.4 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeNavy(navy, game.turnNumber)}</p>
        {navy.hullsLost > 0 && (
          <p className="mt-3 border-l-2 border-loss/50 pl-3 text-xs leading-relaxed text-ink-soft">
            {navy.hullsLost} {navy.hullsLost === 1 ? 'ship has' : 'ships have'} been lost and
            none replaced. An order placed today commissions under a government two elections
            from here, which everybody involved knew when the order to sail was given.
          </p>
        )}
      </Panel>

      <Panel title="Where the fleet is" aside={`${Math.round(sustainablePresence(navy))} sustainable`}>
        <Kicker>One on station, one working up, one in refit</Kicker>
        <p className="mb-3 text-xs leading-relaxed text-ink-faint">
          Committing hulls to a station does not put them there. It puts about a third of them
          there, continuously, and the rest are working up or in refit. Every water the country
          says it cares about therefore costs three times what the list suggests, and every one
          is a subtraction from all the others.
        </p>
        <div className="space-y-2">
          {SEA_ZONES.map((zone) => {
            const committed = navy.stations[zone.key] ?? 0;
            const control = zoneControl(navy, zone.key);
            return (
              <div key={zone.key} className="border-t border-rule pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{SEA_ZONE_LABELS[zone.key]}</span>
                  <span className="text-[0.7rem] text-ink-faint tnum">
                    {committed} committed · about {Math.round(committed / ROTATION_RATIO)} there
                  </span>
                </div>
                <Meter
                  label="Held"
                  value={Math.min(100, control * 100)}
                  band={`${(control * 100).toFixed(0)}%`}
                />
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{zone.blurb}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {[0, 6, 12, 20].map((hullCount) => (
                    <Button
                      key={hullCount}
                      disabled={committed === hullCount || hullCount > able.length}
                      onClick={() =>
                        void dispatch({ type: 'station_fleet', zone: zone.key, hulls: hullCount })
                      }
                    >
                      {hullCount === 0 ? 'Leave' : `${hullCount} hulls`}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="What there is" aside={`${totalPresence(navy).toFixed(0)} presence, if it all sailed`}>
        <div className="grid grid-cols-1 gap-1 text-xs tnum">
          {byClass.map(({ template, all, ready, atSea }) => (
            <div
              key={template.key}
              className="flex items-baseline justify-between border-b border-rule/40 py-1"
            >
              <span className="text-ink-soft">{template.label}</span>
              <span className="text-ink">
                {all.length} on the list
                {ready.length < all.length && (
                  <span className="text-loss"> · {ready.length} able</span>
                )}
                {atSea.length > 0 && <span className="text-ink-faint"> · {atSea.length} at sea</span>}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Lay something down" aside={`${navy.building.length} building`}>
        <Kicker>A successor will commission it</Kicker>
        <div className="space-y-2">
          {(['carrier', 'destroyer', 'frigate', 'submarine', 'auxiliary'] as const).map((key) => {
            const template = findShip(key);
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 border-t border-rule pt-2">
                <Button
                  disabled={game.politicalCapital < 16}
                  onClick={() => void dispatch({ type: 'order_ship', shipClass: key })}
                >
                  {template.label}
                </Button>
                <span className="text-[0.7rem] text-ink-faint tnum">
                  ₡{(template.cost * game.moneyScale).toFixed(0)}bn · {template.buildYears} years ·
                  16 PC
                </span>
                {template.buildYears >= 6 && <Tag tone="warn">two elections away</Tag>}
              </div>
            );
          })}
        </div>
        {navy.building.length > 0 && (
          <div className="mt-3 border-t border-rule pt-2 text-xs tnum text-ink-soft">
            {navy.building.map((order) => (
              <div key={order.id} className="flex justify-between py-0.5">
                <span>{findShip(order.shipClass).label}</span>
                <span className="text-ink-faint">
                  {Math.max(0, Math.round((order.dueTurn - game.turnNumber) / 52))} years to go
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
