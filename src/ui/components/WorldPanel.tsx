/**
 * WorldPanel.tsx — the twelve countries that are not yours.
 *
 * The panel is ordered by how much each country's opinion costs to ignore,
 * not alphabetically and not by how much the player likes them. That
 * ordering is the argument: a warm relationship with Holm does not offset a
 * cold one with Astrun, and a foreign policy that treats every country as
 * equally worth attending to is not a foreign policy.
 *
 * Exposure gets its own callout because it is the list a foreign minister
 * actually needs and the one most likely to be ignored until the week it
 * matters. Leverage and exposure look identical on a relations number and
 * are opposite things.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  BLOC_LABELS,
  DIPLOMACY_PC_COSTS,
  EMBASSY_TIERS,
  POSTURE_LABELS,
  RECALL_AMBASSADOR_PC,
  SET_EMBASSY_TIER_PC,
  TREATY_LABELS,
  ambassadorDividend,
  byWeight,
  canSummit,
  describeGrievance,
  exposures,
  findNation,
  obligationOf,
  standingWith,
  treatiesWith,
  treatyThreshold,
  willSign,
  type NationKey,
  type TreatyKind,
} from '../../game/index.ts';
import { Button, Kicker, Panel, Stat, Tag } from './Primitives.tsx';

const STANDING_TONE = {
  allied: 'text-gain',
  friendly: 'text-gain',
  neutral: 'text-ink-faint',
  strained: 'text-warn',
  hostile: 'text-loss',
} as const;

const OFFERABLE: TreatyKind[] = [
  'trade',
  'non_aggression',
  'partnership',
  'defence',
  'mutual_defence',
  'peace',
];

export function WorldPanel() {
  const { game, dispatch } = useGame();
  const [open, setOpen] = useState<NationKey | null>(null);

  if (!game) return null;
  const world = game.world;
  const exposed = exposures(world);

  return (
    <Panel title="The world" aside={`${world.nations.length} states`}>
      <Kicker>Ordered by how much their opinion costs to ignore</Kicker>
      <p className="text-sm leading-relaxed text-ink-soft">
        A large country's opinion is worth more than a small one's, and there is no mechanic
        anywhere that lets you opt out of that. You can afford to be principled with Holm. You
        cannot afford to be principled with Astrun. That is not a puzzle with a solution; it is
        the position the country is in.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <Stat
          label="Reputation"
          value={world.reputation.toFixed(0)}
          detail="whether your word is good"
          tone={world.reputation < 45 ? 'loss' : world.reputation > 70 ? 'gain' : 'neutral'}
          size="large"
        />
        <Stat
          label="Influence"
          value={world.influence.toFixed(0)}
          detail="what you can get done in a room"
          size="large"
        />
        <Stat
          label="Agreements"
          value={world.treaties.length}
          detail="in force, each a commitment"
          size="large"
        />
      </div>

      {exposed.length > 0 && (
        <div className="mt-4 rule-engraved border-t pt-3">
          <div className="label text-ink-faint">Where you are exposed</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            Countries you depend on more than they depend on you. Sanctions against any of these
            would hurt you first, which is the distinction most often missed.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {exposed.slice(0, 5).map((nation) => (
              <Tag key={nation.key} tone="warn">
                {findNation(nation.key).name} · {(nation.ourDependence * 100).toFixed(0)}% of our
                trade
              </Tag>
            ))}
          </div>
        </div>
      )}

      <ul className="mt-5 divide-y divide-rule">
        {byWeight(world).map((nation) => {
          const template = findNation(nation.key);
          const status = standingWith(nation);
          const isOpen = open === nation.key;
          const held = treatiesWith(world, nation.key);

          return (
            <li key={nation.key} className="py-2.5">
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : nation.key)}
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-serif text-sm font-semibold text-ink">
                    {template.name}
                  </span>
                  <span className="text-[0.7rem] text-ink-faint">
                    {BLOC_LABELS[template.bloc]} · {POSTURE_LABELS[template.posture]}
                    {nation.neighbour && ' · neighbour'}
                  </span>
                </span>
                <span className="flex items-baseline gap-3 text-xs">
                  {nation.sanctioned && <Tag tone="loss">sanctioned</Tag>}
                  {held.length > 0 && <Tag tone="brass">{held.length} treaty</Tag>}
                  {!nation.embassy && <Tag>no mission</Tag>}
                  <span className={`tnum ${STANDING_TONE[status]}`}>
                    {nation.relations >= 0 ? '+' : '−'}
                    {Math.abs(nation.relations).toFixed(0)}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="mt-2">
                  <p className="text-xs leading-relaxed text-ink-soft">{template.blurb}</p>
                  <p className="mt-1 text-[0.7rem] text-ink-faint">
                    Weight {template.power.toFixed(1)}× ours. They send{' '}
                    {(nation.tradeDependence * 100).toFixed(0)}% of their trade here; we send{' '}
                    {(nation.ourDependence * 100).toFixed(0)}% of ours there
                    {nation.ourDependence > nation.tradeDependence
                      ? ' — which means the leverage is theirs.'
                      : ' — which means the leverage is ours.'}
                  </p>
                  {nation.grievance > 5 && (
                    <p className="mt-1 text-[0.7rem] text-warn">
                      Grievance {nation.grievance.toFixed(0)} — {describeGrievance(nation.grievance)}
                    </p>
                  )}

                  {nation.embassy && (
                    <div className="mt-2 text-[0.7rem] text-ink-faint">
                      {nation.ambassador ? (
                        <span>
                          {nation.ambassador.name}, skill {nation.ambassador.skill.toFixed(0)} —
                          worth {ambassadorDividend(nation.ambassador) >= 0 ? '+' : ''}
                          {ambassadorDividend(nation.ambassador).toFixed(2)}/month on top of the
                          settled dividend.{' '}
                          <button
                            type="button"
                            className="underline"
                            disabled={game.politicalCapital < RECALL_AMBASSADOR_PC}
                            onClick={() =>
                              void dispatch({ type: 'recall_ambassador', nation: nation.key })
                            }
                          >
                            Recall · {RECALL_AMBASSADOR_PC} PC
                          </button>
                        </span>
                      ) : (
                        <span>No named ambassador — appointing one below sends a career posting only.</span>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {EMBASSY_TIERS.map((t) => (
                          <Button
                            key={t.key}
                            variant="quiet"
                            disabled={
                              nation.embassyTier === t.key ||
                              game.politicalCapital < SET_EMBASSY_TIER_PC
                            }
                            title={t.blurb}
                            onClick={() =>
                              void dispatch({
                                type: 'set_embassy_tier',
                                nation: nation.key,
                                tier: t.key,
                              })
                            }
                          >
                            {t.label}
                            {nation.embassyTier === t.key && ' ✓'}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {held.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {held.map((treaty) => (
                        <li key={treaty.id} className="text-xs">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-ink">{TREATY_LABELS[treaty.kind]}</span>
                            <Button
                              variant="quiet"
                              onClick={() =>
                                void dispatch({ type: 'withdraw_treaty', treatyId: treaty.id })
                              }
                            >
                              Withdraw · {DIPLOMACY_PC_COSTS.withdrawTreaty} PC
                            </Button>
                          </div>
                          <p className="text-ink-faint">{treaty.obligation}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(
                      [
                        [nation.embassy ? 'close_embassy' : 'open_embassy',
                          nation.embassy ? 'Close the mission' : 'Open a mission',
                          nation.embassy ? DIPLOMACY_PC_COSTS.closeEmbassy : DIPLOMACY_PC_COSTS.openEmbassy],
                        ['appoint_ambassador', 'Send an ambassador', DIPLOMACY_PC_COSTS.appointAmbassador],
                        ['meeting', 'Meet at official level', DIPLOMACY_PC_COSTS.meeting],
                        ['state_visit', 'State visit', DIPLOMACY_PC_COSTS.stateVisit],
                        ['summit', 'Convene a summit', DIPLOMACY_PC_COSTS.summit],
                        ['protest', 'Lodge a protest', DIPLOMACY_PC_COSTS.protest],
                        ['expel_diplomats', 'Expel their diplomats', DIPLOMACY_PC_COSTS.expelDiplomats],
                        [nation.sanctioned ? 'lift_sanction' : 'sanction',
                          nation.sanctioned ? 'Lift sanctions' : 'Impose sanctions',
                          nation.sanctioned ? DIPLOMACY_PC_COSTS.liftSanction : DIPLOMACY_PC_COSTS.sanction],
                      ] as const
                    ).map(([act, label, cost]) => {
                      const blocked =
                        (act === 'appoint_ambassador' && !nation.embassy) ||
                        (act === 'summit' && !canSummit(nation, game.turnNumber));
                      return (
                        <Button
                          key={act}
                          variant="quiet"
                          disabled={blocked || game.politicalCapital < cost}
                          onClick={() =>
                            void dispatch({
                              type: 'diplomatic_act',
                              nation: nation.key,
                              act: act as never,
                            })
                          }
                        >
                          {label} · {cost}
                        </Button>
                      );
                    })}
                  </div>

                  <div className="mt-2">
                    <div className="label text-ink-faint">Propose</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {OFFERABLE.filter(
                        (kind) => !held.some((t) => t.kind === kind),
                      ).map((kind) => {
                        const would = willSign(nation, kind, world.reputation);
                        return (
                          <Button
                            key={kind}
                            variant="quiet"
                            disabled={
                              !would || game.politicalCapital < DIPLOMACY_PC_COSTS.proposeTreaty
                            }
                            title={
                              would
                                ? obligationOf(kind, template.name)
                                : `They want relations of at least ${treatyThreshold(kind)} for that.`
                            }
                            onClick={() =>
                              void dispatch({ type: 'propose_treaty', nation: nation.key, kind })
                            }
                          >
                            {TREATY_LABELS[kind]}
                            {!would && ' ✕'}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
