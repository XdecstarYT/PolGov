/**
 * TheatrePanel.tsx — the war map, drawn from the despatches.
 *
 * The single most important thing about this panel: EVERY NUMBER ON IT
 * IS A BELIEF. It reads `sector.belief`, never `sector.control`, because
 * that is what a government has. The engine knows where the front is;
 * this screen does not, and neither does the player.
 *
 * It follows that the panel must not quietly help. There is no shading
 * for "this is stale", no confidence interval, no asterisk on the
 * sectors nobody has looked at in six weeks. A briefing does not get
 * quieter when it is out of date. What the panel DOES do is print the
 * date it was last confirmed, in the same small grey type as everything
 * else, and leave the player to notice — which is exactly the failure
 * mode being modelled, and the only honest way to render it.
 *
 * The other thing it puts on the desk is the supply figure beside the
 * attack button. Ordering an attack past the culminating point is not a
 * bolder decision than ordering one short of it; it is the same decision
 * taken without reading the number that was already on the screen.
 */

import { useGame } from '../../state/store.ts';
import {
  ATTACK_SUPPLY_FLOOR,
  SECTOR_POSTURE_LABELS,
  culminatingDepth,
  describeTheatre,
  findTerrain,
  fortificationLabel,
  reportedLine,
  staleness,
} from '../../game/index.ts';
import type { SectorPosture } from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

const ORDERS: { key: SectorPosture; label: string }[] = [
  { key: 'attacking', label: 'Attack' },
  { key: 'holding', label: 'Hold' },
  { key: 'withdrawing', label: 'Withdraw' },
];

export function TheatrePanel() {
  const { game, dispatch } = useGame();
  if (!game || game.theatres.length === 0) return null;
  const week = game.turnNumber;

  return (
    <div className="space-y-4">
      {game.theatres.map((theatre) => {
        const reach = culminatingDepth(theatre);
        const unassigned = game.orbat.formations.filter(
          (f) => !theatre.sectors.some((s) => s.garrison.includes(f.id)),
        );
        return (
          <div key={theatre.warId} className="space-y-4">
            <Panel title={theatre.name} aside={`${theatre.sectors.length} sectors`}>
              <Kicker>Everything here is what has been reported</Kicker>
              <div className="grid grid-cols-3 gap-4">
                <Stat
                  label="Reported ours"
                  value={`${reportedLine(theatre).toFixed(0)}%`}
                  detail="of the theatre, according to the despatches"
                />
                <Stat
                  label="Supply reaches"
                  value={`${reach} of ${theatre.sectors.length}`}
                  detail="sectors. Beyond that an attack does not go"
                  tone={reach < theatre.sectors.length / 2 ? 'warn' : 'neutral'}
                />
                <Stat
                  label="Reconnaissance"
                  value={`${Math.round(theatre.reconnaissance * 100)}%`}
                  detail="of the effort spent finding out"
                  tone={theatre.reconnaissance < 0.15 ? 'warn' : 'neutral'}
                />
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                {describeTheatre(theatre, week)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="label text-ink-faint">Spend on seeing</span>
                {[0, 0.2, 0.45, 0.75].map((effort) => (
                  <Button
                    key={effort}
                    disabled={Math.abs(theatre.reconnaissance - effort) < 0.01}
                    onClick={() =>
                      void dispatch({
                        type: 'set_reconnaissance',
                        theatre: theatre.warId,
                        effort,
                      })
                    }
                  >
                    {effort === 0 ? 'Nothing' : `${Math.round(effort * 100)}%`}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                It comes out of formations that could be fighting. What it buys is the
                difference between the map and the ground.
              </p>
            </Panel>

            {theatre.sectors.map((sector) => {
              const terrain = findTerrain(sector.terrain);
              const stale = staleness(sector, week);
              const canSupply = sector.belief.supply >= ATTACK_SUPPLY_FLOOR;
              return (
                <Panel
                  key={sector.id}
                  title={sector.name}
                  aside={`${terrain.label} · ${fortificationLabel(sector)}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={sector.posture === 'attacking' ? 'warn' : 'neutral'}>
                      {SECTOR_POSTURE_LABELS[sector.posture]}
                    </Tag>
                    {sector.encircled && <Tag tone="loss">Cut off</Tag>}
                    <span className="text-[0.7rem] text-ink-faint tnum">
                      {sector.belief.everSeen
                        ? stale === 0
                          ? 'confirmed this week'
                          : `last confirmed ${stale} ${stale === 1 ? 'week' : 'weeks'} ago`
                        : 'never observed'}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">{terrain.blurb}</p>

                  <div className="mt-3">
                    <Meter
                      label="Reported ours"
                      value={sector.belief.control}
                      band={`${sector.belief.control.toFixed(0)}%`}
                    />
                    <Meter
                      label="Reported supply"
                      value={sector.belief.supply}
                      band={
                        canSupply
                          ? `${sector.belief.supply.toFixed(0)}`
                          : `${sector.belief.supply.toFixed(0)} — below the floor for an attack`
                      }
                    />
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-3 text-[0.7rem] tnum text-ink-soft">
                    <span>
                      attacking here costs{' '}
                      <span className="text-ink">{terrain.attackRatio.toFixed(1)}:1</span>
                    </span>
                    <span>
                      formations <span className="text-ink">{sector.garrison.length}</span>
                    </span>
                    <span>
                      {sector.population > 0
                        ? `${Math.round(sector.population)}k civilians`
                        : 'nobody left here'}
                      {sector.devastation > 8 && ` · ${sector.devastation.toFixed(0)}% wrecked`}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {ORDERS.map(({ key, label }) => (
                      <Button
                        key={key}
                        disabled={sector.posture === key}
                        onClick={() =>
                          void dispatch({
                            type: 'set_sector_posture',
                            theatre: theatre.warId,
                            sector: sector.id,
                            posture: key,
                          })
                        }
                      >
                        {label}
                      </Button>
                    ))}
                    {unassigned.length > 0 && (
                      <Button
                        onClick={() =>
                          void dispatch({
                            type: 'garrison_sector',
                            theatre: theatre.warId,
                            sector: sector.id,
                            formations: [
                              ...sector.garrison,
                              ...unassigned.slice(0, 4).map((f) => f.id),
                            ],
                          })
                        }
                      >
                        Send {Math.min(4, unassigned.length)} more
                      </Button>
                    )}
                  </div>

                  {sector.posture === 'attacking' && !canSupply && (
                    <p className="mt-2 border-l-2 border-loss/50 pl-3 text-xs leading-relaxed text-ink-soft">
                      The attack here is past what can reach it. It will not go, and it will
                      cost what an attack costs. Every mile forward has been a mile further
                      from the railheads and a mile nearer theirs.
                    </p>
                  )}
                </Panel>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
