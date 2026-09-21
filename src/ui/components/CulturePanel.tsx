/**
 * CulturePanel.tsx — what the country is, as distinct from what it has.
 *
 * Everything on this panel is slow enough that the government reading it
 * will not see the result of its own decisions about it, which is the
 * same argument the population panel makes and is stated as plainly.
 *
 * The norms get the largest number because they are the only thing here
 * that decides whether the rest of the game still works: a country whose
 * politics has stopped being conducted by rules is one where the
 * institutions in every other engine begin to fail, and nothing has to be
 * repealed for that to happen.
 *
 * Communities are shown as positions, never as identities. This game does
 * not record who anybody is.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  CULTURAL_INSTITUTION_TEMPLATES,
  belongingGap,
  cohesion,
  culturalReach,
  describeCulture,
  excludedShare,
  findCulturalInstitution,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function CulturePanel() {
  const { game, dispatch } = useGame();
  const [policy, setPolicy] = useState<number | null>(null);

  if (!game) return null;
  const c = game.culture;
  const pending = policy ?? c.languagePolicy;
  const gap = belongingGap(c);
  const excluded = excludedShare(c);

  return (
    <div className="space-y-4">
      <Panel title="What holds it together" aside={`reaching ${culturalReach(c).toFixed(0)}%`}>
        <Kicker>None of it is yours to legislate and all of it is yours to spend</Kicker>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="The norms"
            value={c.politicalCulture.toFixed(0)}
            detail="conceding, resigning, obeying a court"
            size="large"
            tone={c.politicalCulture < 45 ? 'loss' : c.politicalCulture < 60 ? 'warn' : 'neutral'}
          />
          <Stat
            label="National identity"
            value={c.nationalIdentity.toFixed(0)}
            detail="how tellable a shared story is"
            tone={c.nationalIdentity < 45 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Pride"
            value={c.nationalPride.toFixed(0)}
            detail="in how it is doing — moves fast"
          />
          <Stat
            label="Patriotism"
            value={c.patriotism.toFixed(0)}
            detail="attachment to it — barely moves"
          />
        </div>
        {c.politicalCulture < 55 && (
          <p className="mt-4 border-l-2 border-loss/50 pl-3 text-xs leading-relaxed text-ink-soft">
            Nothing enforces any of the norms — that is what makes them culture rather than law,
            and it is what makes them possible to lose without repealing anything. They fall a
            great deal faster than they come back.
          </p>
        )}
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeCulture(c)}</p>
      </Panel>

      <Panel title="Who feels part of it" aside={`cohesion ${cohesion(c).toFixed(0)}`}>
        <p className="text-sm leading-relaxed text-ink-soft">
          Positions in a distribution, not identities — this game does not record who anybody
          is. What it records is whether the state conducts itself in a way that includes them,
          which costs almost nothing and is worth more than money.
        </p>

        <div className="mt-4 space-y-3">
          {c.communities.map((community) => (
            <div key={community.id}>
              <Meter
                label={
                  <span className="flex items-baseline justify-between gap-3">
                    <span>{community.label}</span>
                    <span className="tnum text-[0.7rem] text-ink-faint">
                      {(community.share * 100).toFixed(0)}% of the country
                    </span>
                  </span>
                }
                value={community.belonging}
                band={community.belonging.toFixed(0)}
              />
              <div className="mt-1 text-[0.7rem] text-ink-faint tnum">
                recognised {community.recognition.toFixed(0)}
              </div>
            </div>
          ))}
        </div>

        {gap > 22 && excluded > 0.08 && (
          <p className="mt-4 border-l-2 border-warn/50 pl-3 text-xs leading-relaxed text-ink-soft">
            A {gap.toFixed(0)}-point gap covering {(excluded * 100).toFixed(0)}% of the country. A
            nation holds together at its weakest attachment rather than its average, and the
            average here is {cohesion(c).toFixed(0)}.
          </p>
        )}

        <div className="mt-5 border-t border-rule pt-4">
          <div className="label text-ink-faint">The language settlement</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Signage, forms, schooling, courts, broadcast hours. Among the cheapest things on the
            desk and among the slowest to be felt: recognition follows this over years and
            belonging follows recognition, so whoever is sitting here in two terms gets the
            result.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pending}
              aria-label="Language settlement"
              onChange={(e) => setPolicy(Number(e.target.value))}
              className="h-1 w-52 accent-civic"
            />
            <span className="tnum text-sm text-ink">{pending.toFixed(0)}</span>
            <Button
              disabled={Math.abs(pending - c.languagePolicy) < 1}
              onClick={() => {
                void dispatch({ type: 'set_language_policy', level: pending });
                setPolicy(null);
              }}
            >
              Settle it
            </Button>
            {pending > c.languagePolicy && <Tag tone="accent">wider</Tag>}
            {pending < c.languagePolicy && <Tag tone="warn">narrower</Tag>}
          </div>
        </div>
      </Panel>

      <Panel title="The institutions" aside={`${culturalReach(c).toFixed(0)}% of the country`}>
        <p className="text-sm leading-relaxed text-ink-soft">
          Cheap, slow, invisible when they work, and the first line cut in every budget in
          history. A country that stops funding them does not notice for a decade and then
          cannot get them back: a disbanded ensemble is not re-formed by restoring its grant.
        </p>
        <div className="mt-4 space-y-3">
          {[...c.institutions]
            .sort((a, b) => a.vitality - b.vitality)
            .map((institution) => {
              const template = findCulturalInstitution(institution.key);
              return (
                <div key={institution.key}>
                  <Meter
                    label={
                      <span className="flex items-baseline justify-between gap-3">
                        <span>{template.label}</span>
                        {institution.vitality < 35 && <Tag tone="loss">hollowed out</Tag>}
                      </span>
                    }
                    value={institution.vitality}
                    band={institution.vitality.toFixed(0)}
                    hint={template.blurb}
                  />
                  <div className="mt-1 text-[0.7rem] text-ink-faint tnum">
                    reaching {institution.reach.toFixed(0)}% of the country
                  </div>
                </div>
              );
            })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          {CULTURAL_INSTITUTION_TEMPLATES.filter((t) => t.fragility > 0.12)
            .map((t) => t.label.toLowerCase())
            .join(', ')}{' '}
          are the fragile ones: the people who trained for a decade to work in them take other
          work, and the ones who would have trained next stop training. Buildings survive
          neglect for far longer, which is why heritage looks fine long after the rest has gone.
        </p>
      </Panel>
    </div>
  );
}
