/**
 * PeacePanel.tsx — what the country thinks they have, and the sentence
 * that will not let it stop.
 *
 * Two things this panel does that a briefing would not.
 *
 * It prints the declared war aim at the top, with how firmly it was
 * said, above everything about how the war is going. That sentence was
 * spoken in week one on the strength of a rally, before anybody knew
 * whether it was achievable, and by the time terms are on the table it
 * is a condition of the government's survival. The panel treats it as
 * the most important fact on the screen because it is.
 *
 * And it shows the estimate of the enemy WITH the direction of its bias
 * named — not as a confidence interval, because the error is not noise.
 * It is one-directional, it does not shrink with effort, and nobody in
 * the chain producing it is lying. A government is entitled to know
 * which way the paper in front of it leans, and normally is not told.
 */

import { useGame } from '../../state/store.ts';
import {
  MEDIATORS,
  blockedByAim,
  describeNegotiation,
  domesticCost,
  estimateDiscredited,
  findBias,
  findMediator,
  findTerm,
  offerValue,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function PeacePanel() {
  const { game, dispatch } = useGame();
  if (!game || game.negotiations.length === 0) return null;

  return (
    <div className="space-y-4">
      {game.negotiations.map((talks) => {
        const bias = findBias(talks.estimate.bias);
        const found = estimateDiscredited(talks.estimate);
        return (
          <div key={talks.warId} className="space-y-4">
            <Panel
              title="What was said in week one"
              aside={talks.talking ? findMediator(talks.mediator).label.toLowerCase() : 'not talking'}
            >
              <Kicker>The sentence that will not let it stop</Kicker>
              <p className="text-sm leading-relaxed text-ink">“{talks.declaredAim}”</p>
              <div className="mt-3">
                <Meter
                  label="How firmly it was said"
                  value={talks.declaredFirmness}
                  band={
                    talks.declaredFirmness > 70
                      ? 'firmly enough that most settlements cannot be signed'
                      : talks.declaredFirmness > 40
                        ? 'firmly enough to matter'
                        : 'loosely enough to leave room'
                  }
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                It was said on the strength of a rally, before anybody knew whether it was
                achievable. It is now a condition of this government's survival, and the war is
                the thing keeping it true.
              </p>
              {talks.declaredFirmness >= 30 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    disabled={game.politicalCapital < 22}
                    onClick={() => void dispatch({ type: 'revise_war_aim', war: talks.warId })}
                  >
                    Take it back · 22 PC
                  </Button>
                  <span className="text-[0.7rem] text-ink-faint">
                    Standing up and saying that what you said you would never accept is
                    something you will now accept. Several have not survived it.
                  </span>
                </div>
              )}
            </Panel>

            <Panel title="What they have" aside={found ? 'the estimate was wrong' : bias.label.toLowerCase()}>
              <Kicker>Biased, not noisy</Kicker>
              <div className="grid grid-cols-3 gap-4">
                <Stat
                  label="Estimated strength"
                  value={talks.estimate.estimated.toFixed(0)}
                  detail="what the papers say"
                />
                <Stat
                  label="Estimated resolve"
                  value={talks.estimate.estimatedResolve.toFixed(0)}
                  detail="how long they will keep going"
                />
                <Stat
                  label="Confidence"
                  value={`${(talks.estimate.confidence * 100).toFixed(0)}%`}
                  detail="which is not the same as being right"
                  tone={found ? 'loss' : 'neutral'}
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{bias.blurb}</p>
              <p className="mt-2 border-l-2 border-rule pl-3 text-xs leading-relaxed text-ink-faint">
                It serves {bias.serves}. Looking harder does not fix it — that is what makes it a
                bias rather than noise, and it is found out by being wrong about something
                specific, always after the decision that rested on it.
              </p>
            </Panel>

            <Panel title="The table" aside={`${talks.offers.length} on it`}>
              <p className="text-sm leading-relaxed text-ink-soft">
                {describeNegotiation(talks)}
              </p>

              {talks.offers.map((offer) => {
                const blocked = blockedByAim(offer, talks);
                return (
                  <div key={offer.id} className="mt-3 border-t border-rule pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone={offerValue(offer) >= 0 ? 'gain' : 'loss'}>
                        {offerValue(offer) >= 0 ? 'on balance ours' : 'on balance theirs'}
                      </Tag>
                      {blocked && <Tag tone="loss">cannot be signed</Tag>}
                      <span className="text-[0.7rem] text-ink-faint tnum">
                        {Math.max(0, offer.expiresTurn - game.turnNumber)} weeks before it is
                        withdrawn
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink">
                      We give up{' '}
                      <strong>
                        {offer.weConcede.map((t) => findTerm(t).label.toLowerCase()).join(', ')}
                      </strong>
                      . They give up{' '}
                      <strong>
                        {offer.theyConcede.map((t) => findTerm(t).label.toLowerCase()).join(', ')}
                      </strong>
                      .
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-faint tnum">
                      Costs {domesticCost(offer).toFixed(0)} at home, remembered for{' '}
                      {Math.max(...offer.weConcede.map((t) => findTerm(t).memoryYears), 10)} years.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        disabled={blocked}
                        onClick={() =>
                          void dispatch({
                            type: 'accept_terms',
                            war: talks.warId,
                            offer: offer.id,
                          })
                        }
                      >
                        Sign it
                      </Button>
                      <Button
                        onClick={() =>
                          void dispatch({
                            type: 'refuse_terms',
                            war: talks.warId,
                            offer: offer.id,
                          })
                        }
                      >
                        Refuse
                      </Button>
                      {blocked && (
                        <span className="text-[0.7rem] text-loss/90">
                          Not while week one is on the record.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="mt-4 border-t border-rule pt-3">
                <p className="label mb-2 text-ink-faint">Who holds the pen</p>
                <div className="space-y-2">
                  {MEDIATORS.map((mediator) => (
                    <div key={mediator.key} className="flex flex-wrap items-center gap-2">
                      <Button
                        disabled={talks.talking && talks.mediator === mediator.key}
                        onClick={() =>
                          void dispatch({
                            type: 'open_talks',
                            war: talks.warId,
                            mediator: mediator.key,
                          })
                        }
                      >
                        {mediator.label}
                      </Button>
                      <span className="text-[0.7rem] text-ink-faint">{mediator.blurb}</span>
                    </div>
                  ))}
                  {talks.talking && (
                    <Button
                      onClick={() => void dispatch({ type: 'break_off_talks', war: talks.warId })}
                    >
                      Break off talks
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                  A mediator does not make a settlement fairer. It makes one possible, by giving
                  both governments somebody else to blame for the terms — which is why the choice
                  of mediator is argued about more than the terms are.
                </p>
              </div>

              {talks.refused.length > 0 && (
                <p className="mt-3 text-xs leading-relaxed text-ink-faint tnum">
                  {talks.refused.length} offers refused so far. For whoever is losing, the terms
                  available are worst at the end.
                </p>
              )}
            </Panel>
          </div>
        );
      })}
    </div>
  );
}
