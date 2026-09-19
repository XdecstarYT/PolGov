/**
 * ServicesPanel.tsx — the twenty things the state does, and who is waiting.
 *
 * The panel leads with the gap between what is being asked for and what is
 * being paid, because that gap is the whole mechanic and it is not something
 * the government set. A service under strain here was not cut by anyone: the
 * country simply started asking more of it, and the budget that met it last
 * year does not meet it this one.
 *
 * Waiting times get their own column because a queue is the visible,
 * arguable, headline-generating form of a funding decision, and the rest of
 * the interface deals in scores rather than in months of somebody's life.
 */

import { useGame } from '../../state/store.ts';
import {
  SECTOR_LABELS,
  coverage,
  findService,
  longestWaits,
  strained,
  totalDemand,
  totalServiceFunding,
} from '../../game/index.ts';
import { Kicker, Panel, Stat, Tag, money } from './Primitives.tsx';

export function ServicesPanel() {
  const { game } = useGame();
  if (!game) return null;

  const services = game.services;
  const demand = totalDemand(services);
  const funding = totalServiceFunding(services);
  const short = strained(services);
  const waits = longestWaits(services, 5);

  const bySector = game.sectors.map((sector) => ({
    sector,
    services: services.filter((s) => findService(s.key).sector === sector.key),
  }));

  return (
    <Panel title="What the state does" aside={`${services.length} services`}>
      <Kicker>Demand you did not set</Kicker>
      <p className="text-sm leading-relaxed text-ink-soft">
        Every service here is driven by a number of people — the retired, the young, the
        unemployed — and those numbers move on their own. As the country ages, the demand on
        healthcare and pensions rises every week whether or not anybody decides anything.
        Holding a budget flat is a cut, and nobody has to take it.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <Stat
          label="Being asked for"
          value={money(demand)}
          detail="a year, to meet demand in full"
          size="large"
        />
        <Stat
          label="Being paid"
          value={money(funding)}
          detail={`${((funding / Math.max(1, demand)) * 100).toFixed(0)}% of it`}
          tone={funding < demand * 0.92 ? 'loss' : funding < demand * 0.99 ? 'warn' : 'gain'}
          size="large"
        />
        <Stat
          label="Under strain"
          value={short.length}
          detail={`of ${services.length} services`}
          tone={short.length > 6 ? 'loss' : short.length > 0 ? 'warn' : 'gain'}
          size="large"
        />
      </div>

      {waits.length > 0 && (
        <div className="mt-4">
          <div className="label text-ink-faint">The longest queues</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {waits.map((service) => (
              <Tag key={service.key} tone={service.waitMonths > 8 ? 'loss' : 'warn'}>
                {findService(service.key).name} · {service.waitMonths.toFixed(1)} months
              </Tag>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-5">
        {bySector.map(({ sector, services: inSector }) => (
          <div key={sector.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="label text-ink-faint">{SECTOR_LABELS[sector.key]}</span>
              <span className="text-xs tnum text-ink-faint">
                {money(sector.funding)} across {inSector.length}
              </span>
            </div>
            <table className="mt-1.5 w-full text-sm">
              <caption className="sr-only">
                {SECTOR_LABELS[sector.key]} services, funding against demand
              </caption>
              <tbody>
                {[...inSector]
                  .sort((a, b) => coverage(a) - coverage(b))
                  .map((service) => {
                    const template = findService(service.key);
                    const cover = coverage(service);
                    return (
                      <tr key={service.key} className="border-b border-rule/60 last:border-0">
                        <td className="py-1.5">
                          <span className="text-ink">{template.name}</span>
                          {service.waitMonths > 2 && (
                            <span className="ml-2 text-[0.65rem] tnum text-warn">
                              {service.waitMonths.toFixed(1)}mo wait
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tnum text-ink-faint">
                          {money(service.funding)} of {money(service.demand)}
                        </td>
                        <td
                          className={`w-16 py-1.5 text-right tnum ${
                            cover < 0.8 ? 'text-loss' : cover < 0.97 ? 'text-warn' : 'text-ink'
                          }`}
                        >
                          {(cover * 100).toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {short.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Nobody cut {findService(short[0]!.key).name.toLowerCase()}. It is being asked for{' '}
          <span className="tnum">{money(short[0]!.demand)}</span> a year and receiving{' '}
          <span className="tnum">{money(short[0]!.funding)}</span>, because the country changed
          and the budget did not.
        </p>
      )}
    </Panel>
  );
}
