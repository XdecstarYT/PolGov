/**
 * OpinionPanel.tsx — what the country makes of its arrangements.
 *
 * Approval is on the top bar. This is the thing underneath it, and it
 * decides more.
 *
 * The panel leads with the two numbers whose PRODUCT decides whether
 * anything happens: how angry the country is, and whether it believes
 * acting changes anything. A government that has driven the second one
 * down will see the streets go quiet and read it as having won. It is
 * the most important thing on the screen and the least likely to be
 * believed, so it is said in plain words rather than implied by a chart.
 *
 * Compliance is shown as a percentage of revenue because that is what it
 * is. Trust is not a mood here; it is a line in the accounts.
 */

import { useGame } from '../../state/store.ts';
import {
  TRUST_TEMPLATES,
  complianceFactor,
  describeOpinion,
  findTrust,
  institutionalTrust,
  mobilisation,
} from '../../game/index.ts';
import { Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function OpinionPanel() {
  const { game } = useGame();
  if (!game) return null;

  const o = game.opinion;
  const drive = mobilisation(o);
  const compliance = complianceFactor(o);
  const withdrawn = o.frustration > 52 && drive <= 0.05;

  return (
    <div className="space-y-4">
      <Panel title="Anger, and whether it goes anywhere" aside={`efficacy ${o.efficacy.toFixed(0)}`}>
        <Kicker>Two numbers that multiply rather than add</Kicker>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Frustration"
            value={o.frustration.toFixed(0)}
            detail="how angry the country is"
            size="large"
            tone={o.frustration > 60 ? 'loss' : o.frustration > 48 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Does acting work?"
            value={o.efficacy.toFixed(0)}
            detail="whether anybody believes it does"
            size="large"
            tone={o.efficacy < 35 ? 'loss' : o.efficacy < 48 ? 'warn' : 'neutral'}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {withdrawn ? (
            <>
              <strong className="text-loss">The country has stopped bothering.</strong> It is
              angrier than it was and it has stopped acting on it, because it no longer believes
              acting changes anything. The marches stop, the petitions dry up, and every measure
              you would be judged by improves. This is not the anger going away and it is a great
              deal harder to come back from than the anger was.
            </>
          ) : drive > 0.2 ? (
            <>
              Angry and convinced that acting works. {o.protestParticipation.toFixed(1)}% of the
              country has been out in the last year and {o.activism.toFixed(0)}% is organised
              about something. This is a problem you can still answer — which is more than can
              be said for the quiet version of it.
            </>
          ) : o.frustration < 40 ? (
            <>
              Little to march about. Participation follows anger, and there is not much of it.
            </>
          ) : (
            <>
              Some anger, and some belief that it can be acted on. Both numbers matter and
              neither alone does anything: a furious country that has given up does not march,
              and a contented one has no reason to.
            </>
          )}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <Stat
            label="Out in the last year"
            value={`${o.protestParticipation.toFixed(1)}%`}
          />
          <Stat label="Signed something" value={`${o.petitionParticipation.toFixed(0)}%`} />
          <Stat label="Organised about it" value={`${o.activism.toFixed(0)}%`} />
        </div>
      </Panel>

      <Panel
        title="Trust in the institutions"
        aside={`${institutionalTrust(o).toFixed(0)} overall`}
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Each is judged on its own performance rather than on yours. Distrust spreads between
          them and confidence does not, which is why this is so much cheaper to destroy than to
          build.
        </p>
        <div className="mt-4 space-y-3">
          {[...o.trust]
            .sort((a, b) => a.level - b.level)
            .map((state) => {
              const template = findTrust(state.key);
              return (
                <Meter
                  key={state.key}
                  label={
                    <span className="flex items-baseline justify-between gap-3">
                      <span>{template.label}</span>
                      {state.level < 28 && <Tag tone="loss">gone</Tag>}
                    </span>
                  }
                  value={state.level}
                  band={state.level.toFixed(0)}
                  hint={template.blurb}
                />
              );
            })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          {TRUST_TEMPLATES.filter((t) => t.volatility < 0.8)
            .map((t) => t.label.toLowerCase())
            .join(' and ')}{' '}
          move slowest of all: a decade to build and most of one to lose. Nothing replaces
          either of them.
        </p>
      </Panel>

      <Panel title="What it costs" aside={`${(compliance * 100).toFixed(0)}% of what is owed`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Tax actually collected"
            value={`${(compliance * 100).toFixed(0)}%`}
            detail="of what the rates imply"
            tone={compliance < 0.82 ? 'loss' : compliance < 0.9 ? 'warn' : 'gain'}
          />
          <Stat label="Confidence" value={o.confidence.toFixed(0)} detail="complies, pays, waits" />
          <Stat label="Optimism" value={o.optimism.toFixed(0)} detail="spends and invests" />
          <Stat
            label="Fear"
            value={o.fear.toFixed(0)}
            detail="votes for security"
            tone={o.fear > 55 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Tax that is owed is not tax that is collected, and the gap between them is trust rather
          than enforcement. Raising rates does not reach the part that has stopped paying,
          because that is precisely the part that depends on people deciding to.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{describeOpinion(o)}</p>
      </Panel>
    </div>
  );
}
