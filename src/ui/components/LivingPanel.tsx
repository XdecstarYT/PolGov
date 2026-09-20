/**
 * LivingPanel.tsx — what it is like to live here.
 *
 * The panel leads with the two numbers that disagree. Satisfaction tracks
 * how good the country is; the mood tracks how fast it is getting better.
 * They come apart constantly, and when they do it is the single most
 * useful thing on the screen — a player looking at good service figures
 * and bad polling is otherwise going to conclude the polling is broken.
 *
 * Below that, access rather than quality, because a service can be
 * excellent and unreachable. Each domain shows how far the bottom of the
 * distribution sits below the top, which is the part a national average
 * is incapable of showing.
 */

import { useGame } from '../../state/store.ts';
import {
  ACCESS_TEMPLATES,
  accessForBand,
  describeLiving,
  findAccess,
} from '../../game/index.ts';
import { Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function LivingPanel() {
  const { game } = useGame();
  if (!game) return null;

  const l = game.living;
  const momentum = l.happiness - 50;
  const flat = Math.abs(momentum) < 4;

  /* Sorted worst first: the panel is for finding what is wrong. */
  const domains = [...l.access].sort((a, b) => a.level - b.level);

  return (
    <div className="space-y-4">
      <Panel title="How it feels" aside={`quality of life ${l.qualityOfLife.toFixed(0)}`}>
        <Kicker>Two numbers that do not have to agree</Kicker>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Satisfaction"
            value={l.lifeSatisfaction.toFixed(0)}
            detail="tracks how good things are"
            size="large"
            tone={l.lifeSatisfaction > 68 ? 'gain' : l.lifeSatisfaction < 48 ? 'loss' : 'neutral'}
          />
          <Stat
            label="The mood"
            value={l.happiness.toFixed(0)}
            detail="tracks how fast they are improving"
            size="large"
            tone={momentum > 4 ? 'gain' : momentum < -4 ? 'loss' : 'warn'}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {flat && l.lifeSatisfaction > 68 ? (
            <>
              The country is in good order and the mood is at dead neutral. Nothing has got
              better lately, and improvement is the thing that is actually felt — a government
              that holds an excellent country steady is rewarded for it by nobody. This is not
              the polling being wrong.
            </>
          ) : momentum > 4 ? (
            <>
              Things are getting better fast enough that people have noticed, which is worth
              more than the level itself and lasts exactly as long as the improvement does.
            </>
          ) : momentum < -4 ? (
            <>
              The direction of travel has turned. People register a decline well before the
              level becomes bad, so this number moves first and the service figures follow.
            </>
          ) : (
            <>
              Steady. People adapt to whatever they have within a few years, which is why a
              poor country is not automatically an ungovernable one — and why an excellent one
              is not automatically a popular one.
            </>
          )}
        </p>
      </Panel>

      <Panel
        title="What households can actually get"
        aside={`standard of living ${l.standardOfLiving.toFixed(0)}`}
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Access, not quality. A hospital can be excellent and eighteen months away; a school
          system can be good on average and closed to the bottom fifth. The second figure on
          each line is how far the bottom of the distribution sits below the top.
        </p>

        <div className="mt-4 space-y-3">
          {domains.map((domain) => {
            const template = findAccess(domain.key);
            const bottom = accessForBand(l, domain.key, -0.5);
            const top = accessForBand(l, domain.key, 0.5);
            return (
              <div key={domain.key}>
                <Meter
                  label={
                    <span className="flex items-baseline justify-between gap-3">
                      <span>{template.label}</span>
                      {domain.gradient > 16 && (
                        <Tag tone="warn">rationed by price</Tag>
                      )}
                    </span>
                  }
                  value={domain.level}
                  band={domain.level.toFixed(0)}
                  hint={template.blurb}
                />
                <div className="mt-1 text-[0.7rem] text-ink-faint tnum">
                  {bottom.toFixed(0)} at the bottom · {top.toFixed(0)} at the top
                  {domain.gradient > 16 && ' — the shortage is not shared'}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Where you live">
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Best to worst region"
            value={`${l.regionalInequality.toFixed(0)}`}
            detail="points of standard of living"
            tone={l.regionalInequality > 20 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Cities ahead by"
            value={`${l.urbanAdvantage.toFixed(0)}`}
            detail="points"
          />
          <Stat
            label="Outside them, behind by"
            value={`${l.ruralGap.toFixed(0)}`}
            detail="points below the national figure"
            tone={l.ruralGap > 12 ? 'warn' : 'neutral'}
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeLiving(l)}</p>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          {ACCESS_TEMPLATES.filter((t) => t.geography > 0.7)
            .map((t) => t.label.toLowerCase())
            .join(', ')}{' '}
          are mostly decided by where a household is rather than what it earns. Those are the
          domains a national average conceals completely, and they are where regional politics
          comes from.
        </p>
      </Panel>
    </div>
  );
}
