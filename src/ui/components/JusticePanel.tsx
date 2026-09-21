/**
 * JusticePanel.tsx — the bench, and the force that feeds it cases.
 *
 * The one number this panel puts in front of a government that the
 * campaign trail never does: CLEARANCE DETERS MORE THAN SENTENCING. The
 * sentencing buttons are here because a government will use them
 * regardless, but the clearance rate — driven by capability and, more
 * than that, by cooperation — is what the deterrence figure actually
 * runs on. The panel shows both, so the trade is visible rather than
 * assumed.
 *
 * And beside enforcement posture, what it is actually trading: a harder
 * posture buys visible suppression this week and spends cooperation,
 * which is the input the clearance rate needs more of the two. Pushed
 * far enough, a government can watch its own clearance rate fall while
 * its arrest count rises, which is enforcement theatre and not a bug.
 */

import { useGame } from '../../state/store.ts';
import {
  ENFORCEMENT_POSTURES,
  JUDICIAL_STANCES,
  SENTENCING_TEMPLATES,
  clearanceRate,
  crimeDeterrence,
  describeCourts,
  describePolicing,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function JusticePanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const justice = game.justice;
  const courts = justice.courts;
  const policing = justice.policing;
  const clearance = clearanceRate(policing);
  const deterrence = crimeDeterrence(justice);

  return (
    <div className="space-y-4">
      <Panel title="The courts" aside={`independence ${courts.independence.toFixed(0)}`}>
        <Kicker>Independence is spent, not held</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Independence"
            value={courts.independence.toFixed(0)}
            detail="how free the bench is of what the government wants"
            tone={courts.independence < 35 ? 'loss' : courts.independence < 55 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Backlog"
            value={`${courts.backlog.toFixed(2)}×`}
            detail="cases waiting, against what a well-run system carries"
            tone={courts.backlog > 1.8 ? 'loss' : courts.backlog > 1.3 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Accuracy"
            value={`${(courts.accuracy * 100).toFixed(0)}%`}
            detail="right verdicts — trades against clearance speed"
            tone={courts.accuracy < 0.7 ? 'loss' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeCourts(courts)}</p>

        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Sentencing policy</p>
          {SENTENCING_TEMPLATES.map((t) => (
            <div key={t.key} className="border-t border-rule pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={courts.sentencing === t.key || game.politicalCapital < 3}
                  onClick={() => void dispatch({ type: 'set_sentencing', policy: t.key })}
                >
                  {t.label}
                </Button>
                {courts.sentencing === t.key && <Tag tone="accent">current</Tag>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Judicial stance</p>
          {JUDICIAL_STANCES.map((t) => (
            <div key={t.key} className="border-t border-rule pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={courts.stance === t.key || game.politicalCapital < 4}
                  onClick={() => void dispatch({ type: 'set_judicial_stance', stance: t.key })}
                >
                  {t.label}
                </Button>
                {courts.stance === t.key && <Tag tone="accent">current</Tag>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="The police" aside={policing.posture}>
        <Kicker>Certainty deters. Severity barely does</Kicker>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Clearance rate"
            value={`${(clearance * 100).toFixed(0)}%`}
            detail="capability and cooperation together — the real deterrent"
            tone={clearance < 0.35 ? 'loss' : clearance < 0.5 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Cooperation"
            value={policing.cooperation.toFixed(0)}
            detail="willingness to report and to help an investigation"
            tone={policing.cooperation < 35 ? 'loss' : policing.cooperation < 50 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Corruption"
            value={policing.corruption.toFixed(0)}
            detail="embedded, slow to move either way"
            tone={policing.corruption > 45 ? 'loss' : policing.corruption > 25 ? 'warn' : 'neutral'}
          />
        </div>
        <div className="mt-3">
          <Meter
            label="Deterrence"
            value={Math.min(100, deterrence * 40)}
            band="mostly clearance, a little sentencing severity"
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describePolicing(policing)}</p>

        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Enforcement posture</p>
          {ENFORCEMENT_POSTURES.map((t) => (
            <div key={t.key} className="border-t border-rule pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={policing.posture === t.key || game.politicalCapital < 3}
                  onClick={() => void dispatch({ type: 'set_enforcement_posture', posture: t.key })}
                >
                  {t.label}
                </Button>
                {policing.posture === t.key && <Tag tone="accent">current</Tag>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={game.politicalCapital < 8}
            onClick={() => void dispatch({ type: 'drive_anti_corruption' })}
          >
            Anti-corruption drive · 8 PC
          </Button>
          <span className="text-[0.7rem] text-ink-faint">
            Knocks it down now. It breeds back under the same posture and the same funding.
          </span>
        </div>
      </Panel>
    </div>
  );
}
