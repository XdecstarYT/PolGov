/**
 * CastPanel.tsx — the people you are governing among.
 *
 * Every person here is invented, and every one of them has been in this
 * run since the first week. They have a temperament, a prior career, a
 * view of this government that has been moving all term, and a record of
 * what they have already said — which the player can read, and which they
 * can be held to.
 *
 * The panel shows standing as a figure because that is the honest way to
 * show it: it is a number in the engine, it moved for reasons the journal
 * records, and hiding it behind an adjective would be pretending the game
 * is less legible than it is.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import { leaderVoice, pressColumn } from '../../services/narrator.ts';
import {
  DISPOSITION_BLURBS,
  DISPOSITION_LABELS,
  REGISTER_LABELS,
  TEMPERAMENT_BLURBS,
  TEMPERAMENT_LABELS,
  averageSectorHealth,
  standingOf,
  type Persona,
} from '../../game/index.ts';
import { EmptyNote, Kicker, Panel, PartyMark, Tag } from './Primitives.tsx';
import { benchInk } from '../bench.ts';

const STANDING_TONE = (value: number): string =>
  value >= 40 ? 'text-gain' : value <= -40 ? 'text-loss' : 'text-ink-soft';

export function CastPanel() {
  const { game, dispatch } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState<string | null>(null);

  if (!game) return null;
  const { cast } = game;

  const facts = () => ({
    approval: Math.round(game.approval),
    week: game.turnNumber,
    term: game.termNumber,
    sectorHealth: Math.round(averageSectorHealth(game.sectors)),
    debtRatio: Number((game.debt / Math.max(1, game.economy.gdp)).toFixed(2)),
    billsPassed: game.career.billsPassed,
    billsFailed: game.career.billsFailed,
  });

  const ask = async (persona: Persona, kind: 'leader' | 'press') => {
    setAsking(persona.id);
    const party = game.parties.find((p) => p.id === persona.partyId);
    const fallback =
      kind === 'leader'
        ? `${persona.name} is ${standingOf(persona)} about the government's record, and said so again.`
        : `${persona.name} filed a column on ${persona.beat}, in terms the paper's readers would expect.`;

    const line =
      kind === 'leader'
        ? await leaderVoice(
            game,
            persona,
            party ? `the government's record, from the ${party.name} benches` : 'the record',
            facts(),
            fallback,
          )
        : await pressColumn(game, persona, facts(), fallback);

    setSaid((prev) => ({ ...prev, [persona.id]: line }));
    setAsking(null);

    /* On the record, so the next time somebody writes in this person's
       voice it is the same person. Prose only — what they THINK is
       standing, which game code moves and no model touches. */
    await dispatch({
      type: 'record_remark',
      personaId: persona.id,
      about: kind === 'leader' ? 'the government’s record' : `${persona.beat ?? 'the week'}`,
      text: line,
    });
  };

  return (
    <div className="space-y-5">
      <Panel title="The other benches">
        <p className="text-sm leading-relaxed text-ink-soft">
          Everybody here is invented, and everybody here has been in this run since the first
          week. What each of them makes of this government has been moving ever since, on the
          record rather than on anything they were told.
        </p>

        <ul className="mt-4 divide-y divide-rule">
          {cast.leaders
            .filter((leader) => leader.partyId !== 'player')
            .map((leader) => {
              const party = game.parties.find((p) => p.id === leader.partyId);
              const isOpen = open === leader.id;
              return (
                <li key={leader.id} className="py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
                    onClick={() => setOpen(isOpen ? null : leader.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="w-3 shrink-0 text-ink-faint">
                        {isOpen ? '–' : '+'}
                      </span>
                      {party && <PartyMark glyph={party.glyph} color={benchInk(party)} />}
                      <span className="font-serif text-sm font-semibold text-ink">
                        {leader.name}
                      </span>
                      <span className="text-xs text-ink-faint">
                        {leader.title}
                        {party ? `, ${party.shortName}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-3 text-xs">
                      <Tag>{TEMPERAMENT_LABELS[leader.temperament]}</Tag>
                      <span className={`tnum ${STANDING_TONE(leader.standing)}`}>
                        {leader.standing > 0 ? '+' : ''}
                        {leader.standing.toFixed(0)}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="ml-5 mt-2 space-y-2">
                      <p className="text-xs leading-relaxed text-ink-faint">
                        Was {leader.background}. {TEMPERAMENT_BLURBS[leader.temperament]}
                      </p>
                      <p className="text-xs text-ink-soft">
                        Currently {standingOf(leader)} about this government.
                      </p>

                      {leader.remarks.length > 0 && (
                        <div className="border-l-2 border-rule pl-2.5">
                          <Kicker>What they have said</Kicker>
                          <ul className="mt-1 space-y-1.5 text-xs leading-relaxed text-ink-soft">
                            {[...leader.remarks].reverse().map((remark) => (
                              <li key={`${remark.week}-${remark.about}`}>
                                <span className="text-ink-faint">week {remark.week} — </span>
                                {remark.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {said[leader.id] && (
                        <p className="border-l-2 border-ink pl-2.5 font-serif text-sm leading-relaxed text-ink">
                          {said[leader.id]}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={asking === leader.id}
                        onClick={() => void ask(leader, 'leader')}
                        className="border border-rule px-2 py-1 text-xs text-ink hover:border-ink disabled:opacity-50"
                      >
                        {asking === leader.id ? 'Asking…' : 'Ask them about the record'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      </Panel>

      <Panel title="The press">
        <p className="text-sm leading-relaxed text-ink-soft">
          Five papers, each with a disposition it does not hide. A hostile paper still reports
          what happened and a friendly one still notices when something has gone wrong; what
          the disposition decides is which paragraph goes first.
        </p>

        <ul className="mt-4 divide-y divide-rule">
          {cast.outlets.map((outlet) => {
            const columnist = cast.columnists.find((c) => c.outletId === outlet.id);
            const isOpen = open === outlet.id;
            return (
              <li key={outlet.id} className="py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
                  onClick={() => setOpen(isOpen ? null : outlet.id)}
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="w-3 shrink-0 text-ink-faint">
                      {isOpen ? '–' : '+'}
                    </span>
                    <span className="font-serif text-sm font-semibold text-ink">
                      {outlet.name}
                    </span>
                    <span className="text-xs text-ink-faint">
                      {REGISTER_LABELS[outlet.register]}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3 text-xs">
                    <Tag>{DISPOSITION_LABELS[outlet.disposition]}</Tag>
                    {columnist && (
                      <span className={`tnum ${STANDING_TONE(columnist.standing)}`}>
                        {columnist.standing > 0 ? '+' : ''}
                        {columnist.standing.toFixed(0)}
                      </span>
                    )}
                  </span>
                </button>

                {isOpen && columnist && (
                  <div className="ml-5 mt-2 space-y-2">
                    <p className="text-xs leading-relaxed text-ink-faint">
                      {DISPOSITION_BLURBS[outlet.disposition]}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {columnist.name} writes on {columnist.beat}. Was {columnist.background}.
                    </p>

                    {said[columnist.id] && (
                      <p className="border-l-2 border-ink pl-2.5 font-serif text-sm leading-relaxed text-ink">
                        {said[columnist.id]}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={asking === columnist.id}
                      onClick={() => void ask(columnist, 'press')}
                      className="border border-rule px-2 py-1 text-xs text-ink hover:border-ink disabled:opacity-50"
                    >
                      {asking === columnist.id ? 'Filing…' : 'Read this week’s column'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {cast.outlets.length === 0 && <EmptyNote>No press in this run.</EmptyNote>}
      </Panel>
    </div>
  );
}
