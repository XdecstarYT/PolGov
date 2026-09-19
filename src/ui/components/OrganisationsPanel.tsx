/**
 * OrganisationsPanel.tsx — the rooms where nobody is in charge.
 *
 * Every other screen in this game ends in a button that does the thing. This
 * one ends in a button that asks twelve other governments, and the layout is
 * built to make that difference legible before the player presses it.
 *
 * So the count comes first and the button comes after it, and the count is
 * broken out by country with the reason attached — because a resolution
 * lost is only instructive if the player can read which relationships they
 * did not build. And the veto is called out separately from the arithmetic,
 * because it is not arithmetic: one government can stop a resolution that
 * eleven others want, and no amount of counting changes that.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  ORGANISATION_KIND_LABELS,
  ORGANISATION_TEMPLATES,
  RESOLUTION_TEMPLATES,
  admissionCheck,
  countTheRoom,
  describeOutcome,
  findNation,
  findOrganisation,
  isMember,
  recentResolutions,
  type NationKey,
  type OrganisationKey,
  type ResolutionKind,
} from '../../game/index.ts';
import { Button, EmptyNote, Kicker, Panel, Tag, money } from './Primitives.tsx';

const VOTE_TONE = {
  for: 'text-gain',
  against: 'text-loss',
  abstain: 'text-ink-faint',
} as const;

export function OrganisationsPanel() {
  const { game, dispatch } = useGame();
  const [openRoom, setOpenRoom] = useState<OrganisationKey | null>(null);
  const [openVote, setOpenVote] = useState<ResolutionKind | null>(null);
  const [target, setTarget] = useState<NationKey | ''>('');

  if (!game) return null;
  const world = game.world;

  const available = RESOLUTION_TEMPLATES.filter((r) =>
    isMember(world.organisations, r.organisation),
  );

  return (
    <div className="space-y-5">
      <Panel
        title="The institutions"
        aside={`${world.organisations.filter((o) => o.member).length} of ${ORGANISATION_TEMPLATES.length}`}
      >
        <Kicker>Membership is not a bonus</Kicker>
        <p className="text-sm leading-relaxed text-ink-soft">
          Each of these costs money every year and constrains what the government may do. What
          they buy is a seat in a room, and a seat in a room is only worth what the country's
          relationships in it are worth.
        </p>

        <ul className="mt-4 divide-y divide-rule">
          {ORGANISATION_TEMPLATES.map((template) => {
            const state = world.organisations.find((o) => o.key === template.key)!;
            const admission = admissionCheck(template, world);
            const isOpen = openRoom === template.key;

            return (
              <li key={template.key} className="py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
                  onClick={() => setOpenRoom(isOpen ? null : template.key)}
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="w-3 shrink-0 text-ink-faint">
                      {isOpen ? '–' : '+'}
                    </span>
                    <span className="font-serif text-sm font-semibold text-ink">
                      {template.name}
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {ORGANISATION_KIND_LABELS[template.kind]}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {template.vetoHolders.length > 0 && (
                      <Tag tone="warn">{template.vetoHolders.length} vetoes</Tag>
                    )}
                    {state.member ? <Tag tone="gain">member</Tag> : <Tag>outside</Tag>}
                    <span className="tnum text-xs text-ink-soft">{money(template.dues)}/yr</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-5 mt-2 space-y-2">
                    <p className="text-sm leading-relaxed text-ink-soft">{template.blurb}</p>
                    <p className="text-xs leading-relaxed text-ink-faint">
                      <span className="label text-ink-faint">Obliges — </span>
                      {template.obligation}
                    </p>

                    <p className="text-xs leading-relaxed text-ink-faint">
                      {template.members.map((key) => findNation(key).name).join(', ')}
                      {template.vetoHolders.length > 0 && (
                        <>
                          {' '}
                          <span className="text-warn">
                            ({template.vetoHolders.map((k) => findNation(k).name).join(', ')} can
                            stop anything alone. Verdana cannot.)
                          </span>
                        </>
                      )}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {state.member ? (
                        <Button
                          onClick={() =>
                            void dispatch({
                              type: 'leave_organisation',
                              organisation: template.key,
                            })
                          }
                        >
                          Withdraw
                        </Button>
                      ) : (
                        <Button
                          disabled={
                            !admission.admissible ||
                            game.politicalCapital < template.applicationCost
                          }
                          onClick={() =>
                            void dispatch({
                              type: 'join_organisation',
                              organisation: template.key,
                            })
                          }
                        >
                          Apply · {template.applicationCost} PC
                        </Button>
                      )}
                      {!state.member && !admission.admissible && admission.blocker && (
                        <span className="text-xs text-ink-faint">
                          {findNation(admission.blocker).name} would refuse. Admission needs every
                          member at {template.entryRelations} or better; they are at{' '}
                          <span className="tnum">{admission.worst.toFixed(0)}</span>.
                        </span>
                      )}
                      {state.member && (
                        <span className="text-xs text-ink-faint">
                          Withdrawing is free, immediate, and read by every government in the
                          world as a statement about what this one's commitments are worth.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Resolutions">
        <p className="text-sm leading-relaxed text-ink-soft">
          You may put a resolution. You may not pass one. Every other government votes its own
          interests, and the count was decided over the preceding years rather than in the week
          of the vote.
        </p>

        {available.length === 0 ? (
          <EmptyNote>
            Verdana holds no seat in any room that hears resolutions. A country cannot put a
            question to a body it is not in.
          </EmptyNote>
        ) : (
          <ul className="mt-4 divide-y divide-rule">
            {available.map((template) => {
              const room = findOrganisation(template.organisation);
              const isOpen = openVote === template.kind;
              const named = target === '' ? null : (target as NationKey);
              const count = countTheRoom(template, world, isOpen ? named : null);

              return (
                <li key={template.kind} className="py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
                    onClick={() => setOpenVote(isOpen ? null : template.kind)}
                    aria-expanded={isOpen}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="w-3 shrink-0 text-ink-faint">
                        {isOpen ? '–' : '+'}
                      </span>
                      <span className="font-serif text-sm font-semibold text-ink">
                        {template.title}
                      </span>
                      <span className="shrink-0 text-xs text-ink-faint">{room.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {count.vetoedBy ? (
                        <Tag tone="loss">veto expected</Tag>
                      ) : count.passed ? (
                        <Tag tone="gain">would carry</Tag>
                      ) : (
                        <Tag tone="warn">would fail</Tag>
                      )}
                      <span className="tnum text-xs text-ink-soft">
                        {count.for}–{count.against}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="ml-5 mt-2 space-y-3">
                      <p className="text-sm leading-relaxed text-ink-soft">{template.blurb}</p>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-ink-faint">
                          About
                          <select
                            className="border border-rule-strong bg-raised px-2 py-1 text-xs text-ink"
                            value={target}
                            onChange={(e) => setTarget(e.target.value as NationKey | '')}
                          >
                            <option value="">no particular state</option>
                            {world.nations
                              .filter((n) => n.recognised)
                              .map((n) => (
                                <option key={n.key} value={n.key}>
                                  {findNation(n.key).name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {template.cost > 0 && (
                          <span className="text-xs text-ink-faint">
                            Costs {money(template.cost)} a year if it passes.
                          </span>
                        )}
                      </div>

                      <RoomCount outcome={count} />

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          variant="primary"
                          disabled={
                            game.politicalCapital < template.proposeCost ||
                            (Boolean(template.needsTarget) && named === null)
                          }
                          onClick={() =>
                            void dispatch({
                              type: 'propose_resolution',
                              kind: template.kind,
                              target: named,
                            })
                          }
                        >
                          Put it · {template.proposeCost} PC
                        </Button>
                        <span className="text-xs text-ink-faint">
                          {template.needsTarget && named === null
                            ? 'This one has to name a state.'
                            : `Needs ${Math.round(count.threshold * 100)}% of those voting, and at least ${count.quorum} governments with an opinion.`}
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {world.resolutions.length > 0 && (
        <Panel title="On the record" tone="quiet">
          <ul className="space-y-3">
            {recentResolutions(world.resolutions).map((resolution) => (
              <li key={resolution.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-sm text-ink">
                    {resolution.title}
                    {resolution.target && (
                      <span className="text-ink-faint"> — {findNation(resolution.target).name}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {resolution.vetoedBy ? (
                      <Tag tone="loss">vetoed</Tag>
                    ) : resolution.passed ? (
                      <Tag tone="gain">carried</Tag>
                    ) : (
                      <Tag>lost</Tag>
                    )}
                    <span className="tnum text-xs text-ink-faint">week {resolution.turn}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
                  {describeOutcome(resolution)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/**
 * The count, by country, with the reason.
 *
 * This is the part that makes losing instructive. A bar with a number on it
 * would tell the player they failed; a list with twelve reasons on it tells
 * them which four years they should have spent differently.
 */
function RoomCount({ outcome }: { outcome: ReturnType<typeof countTheRoom> }) {
  const total = Math.max(1, outcome.votes.length);
  const segments = [
    { label: 'For', value: outcome.for, ink: 'var(--color-gain)' },
    { label: 'Against', value: outcome.against, ink: 'var(--color-loss)' },
    { label: 'Abstaining', value: outcome.abstain, ink: 'var(--color-rule-strong)' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="label text-ink-faint">The count, before it is put</span>
        <span className="tnum text-sm text-ink">
          {outcome.for} for · {outcome.against} against · {outcome.abstain} abstaining
        </span>
      </div>

      <div
        className="mt-2 flex h-2 w-full gap-[2px] overflow-hidden"
        role="img"
        aria-label={`${outcome.for} for, ${outcome.against} against, ${outcome.abstain} abstaining`}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((segment) => (
            <div
              key={segment.label}
              className="h-full rounded-[2px]"
              style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.ink }}
            />
          ))}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-ink-faint">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-[1px]"
              style={{ backgroundColor: segment.ink }}
            />
            {segment.label} <span className="tnum">{segment.value}</span>
          </li>
        ))}
      </ul>

      {outcome.vetoedBy && (
        <p className="mt-2 border-l-2 border-loss/50 pl-2 text-sm text-ink-soft">
          {findNation(outcome.vetoedBy).name} would use the veto, and the arithmetic above would
          not matter. Verdana does not hold one.
        </p>
      )}

      <ul className="mt-3 space-y-1">
        {outcome.votes.map((vote) => (
          <li
            key={vote.nation}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"
          >
            <span className="text-ink">
              {findNation(vote.nation).name}
              {vote.veto && <span className="ml-1.5 text-warn">· veto</span>}
            </span>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-ink-faint">{vote.why}</span>
              <span className={`shrink-0 ${VOTE_TONE[vote.vote]}`}>{vote.vote}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
