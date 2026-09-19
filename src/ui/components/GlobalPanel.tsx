/**
 * GlobalPanel.tsx — the world is not about you.
 *
 * Every other panel in this game is a list of things the player can do.
 * This one is mostly a list of things that happened, to other people, for
 * reasons nobody here was consulted about — and the layout says so by
 * leading with the headline rather than with the button.
 *
 * Each event carries its transmission line: how a thing that happened
 * somewhere else reaches here. That is the one piece of information a
 * player actually needs from this page and the one no game ever prints,
 * because it is the difference between a random modifier and a world.
 *
 * Most of them have no response at all. Where the response is absent the
 * panel says why rather than leaving an empty space, because "there is
 * nothing a government here can do" is a fact about the country's position
 * rather than a gap in the interface.
 */

import { useGame } from '../../state/store.ts';
import {
  GLOBAL_KIND_LABELS,
  absoluteWeek,
  describeWorld,
  findGlobalEvent,
  findNation,
  liveWars,
  TURNS_PER_YEAR,
} from '../../game/index.ts';
import { Button, EmptyNote, Kicker, Panel, Tag } from './Primitives.tsx';

export function GlobalPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const world = game.world;
  const wars = liveWars(world.wars);
  const events = world.globalEvents.filter((e) => !e.ended);
  const week = absoluteWeek(game);

  /* The pairs that have moved furthest from where they were drawn. */
  const notable = [...world.pairs]
    .sort((a, b) => Math.abs(b.standing) - Math.abs(a.standing))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <Panel title="The world" aside={`tension ${world.tension.toFixed(0)}`}>
        <p className="font-serif text-[1.02rem] leading-relaxed text-ink">
          {describeWorld(world.wars, world.globalEvents, world.tension)}
        </p>

        {wars.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-rule pt-3">
            {wars.map((war) => (
              <li
                key={`${war.a}-${war.b}`}
                className="flex flex-wrap items-baseline justify-between gap-2"
              >
                <span className="text-sm text-ink">
                  {findNation(war.a).name} and {findNation(war.b).name}
                </span>
                <span className="tnum text-xs text-ink-faint">
                  {((week - war.since) / TURNS_PER_YEAR).toFixed(1)} years so far
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Happening elsewhere">
        {events.length === 0 ? (
          <EmptyNote>
            Nothing much is going wrong anywhere. It will not last, and no government has ever
            been given credit for a quiet year.
          </EmptyNote>
        ) : (
          <ul className="space-y-4">
            {events.map((event) => {
              const template = findGlobalEvent(event.key);
              const weeksIn = week - event.startedTurn;
              const weeksLeft = Math.max(0, template.weeks - weeksIn);

              return (
                <li key={event.key} className="border-t border-rule pt-4 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-[0.98rem] font-semibold text-ink">
                      {template.headline}
                    </span>
                    <span className="flex items-center gap-2">
                      <Tag>{GLOBAL_KIND_LABELS[template.kind]}</Tag>
                      {event.respondedTurn !== null && <Tag tone="gain">answered</Tag>}
                      <span className="tnum text-xs text-ink-faint">
                        {weeksLeft} weeks left
                      </span>
                    </span>
                  </div>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{template.body}</p>

                  <p className="mt-2 border-l-2 border-rule-strong pl-3 text-sm leading-relaxed text-ink-soft">
                    <span className="label text-ink-faint">How it reaches here — </span>
                    {template.transmission}
                  </p>

                  <div className="mt-3">
                    {template.response ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          disabled={
                            event.respondedTurn !== null ||
                            game.politicalCapital < template.response.cost
                          }
                          onClick={() =>
                            void dispatch({ type: 'respond_globally', event: event.key })
                          }
                        >
                          {template.response.label} · {template.response.cost} PC
                        </Button>
                        <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink-faint">
                          {template.response.blurb}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed text-ink-faint">
                        There is nothing a government here can do about this. That is not a gap
                        in the options; it is the position the country is in.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Who gets on with whom" tone="quiet">
        <Kicker>None of this is about Verdana</Kicker>
        <ul className="space-y-2">
          {notable.map((pair) => {
            const standing = pair.standing;
            const tone =
              standing > 45 ? 'gain' : standing < -45 ? 'loss' : standing < -15 ? 'warn' : 'neutral';
            return (
              <li
                key={`${pair.a}-${pair.b}`}
                className="flex flex-wrap items-baseline justify-between gap-2"
              >
                <span className="text-sm text-ink">
                  {findNation(pair.a).name} and {findNation(pair.b).name}
                </span>
                <span className="flex items-center gap-2">
                  <Tag tone={tone}>
                    {standing > 45
                      ? 'close'
                      : standing > 15
                        ? 'warm'
                        : standing > -15
                          ? 'correct'
                          : standing > -45
                            ? 'strained'
                            : 'hostile'}
                  </Tag>
                  <span className="tnum text-xs text-ink-faint">{standing.toFixed(0)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          These move on their own, slowly, for reasons no briefing captures. Over a run they
          redraw the map — and every treaty, every vote and every balance of force is read off
          the map as it is rather than as it was when the government took office.
        </p>
      </Panel>
    </div>
  );
}
