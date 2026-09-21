/**
 * IntegrityPanel.tsx — the body of law, and what keeps power honest.
 *
 * ONE WELL, MANY TAPS. This is not the police-corruption panel — that
 * one is on the courts and policing dossier, because a beat officer
 * taking money is a different failure from a minister steering a
 * contract. This is the well both draw on: patronage, oversight, and
 * whether anybody with subpoena power is actually checking.
 *
 * NOTHING HERE SETS RULE OF LAW DIRECTLY, because nothing should — it is
 * shown as a read-out of judicial independence, this corruption index,
 * and the state of the statute book, so a government reads it as the
 * composite it is rather than as another dial to turn.
 */

import { useGame } from '../../state/store.ts';
import {
  ANTICORRUPTION_POSTURES,
  TRANSPARENCY_REGIMES,
  auditValue,
  describeIntegrity,
  regulatoryQuality,
} from '../../game/index.ts';
import { Button, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

export function IntegrityPanel() {
  const { game, dispatch } = useGame();
  if (!game) return null;

  const integrity = game.integrity;

  return (
    <Panel title="The body of law" aside={`corruption ${integrity.corruptionIndex.toFixed(0)}`}>
      <Kicker>One well. Policing has its own tap; this is everything else</Kicker>
      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="Corruption"
          value={integrity.corruptionIndex.toFixed(0)}
          detail="patronage, procurement, permits — the ordinary kind"
          tone={
            integrity.corruptionIndex > 60
              ? 'loss'
              : integrity.corruptionIndex > 35
                ? 'warn'
                : 'neutral'
          }
        />
        <Stat
          label="Rule of law"
          value={integrity.ruleOfLaw.toFixed(0)}
          detail="a composite — nothing here sets it directly"
          tone={integrity.ruleOfLaw < 40 ? 'loss' : integrity.ruleOfLaw < 55 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Regulatory quality"
          value={regulatoryQuality(integrity).toFixed(0)}
          detail={`stock ${integrity.regulatoryStock.toFixed(2)}× a manageable rulebook`}
          tone={integrity.regulatoryStock > 1.8 ? 'warn' : 'neutral'}
        />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeIntegrity(integrity)}</p>

      <div className="mt-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-ink-faint">Disclosure regime</p>
        {TRANSPARENCY_REGIMES.map((t) => (
          <div key={t.key} className="border-t border-rule pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={integrity.transparency === t.key || game.politicalCapital < 5}
                onClick={() => void dispatch({ type: 'set_transparency', regime: t.key })}
              >
                {t.label}
              </Button>
              {integrity.transparency === t.key && <Tag tone="accent">current</Tag>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-ink-faint">Anti-corruption machinery</p>
        {ANTICORRUPTION_POSTURES.map((t) => (
          <div key={t.key} className="border-t border-rule pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={integrity.anticorruption === t.key || game.politicalCapital < 6}
                onClick={() => void dispatch({ type: 'set_anticorruption_posture', posture: t.key })}
              >
                {t.label}
              </Button>
              {integrity.anticorruption === t.key && <Tag tone="accent">current</Tag>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t.blurb}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={game.politicalCapital < 6} onClick={() => void dispatch({ type: 'launch_audit' })}>
          Launch an audit · 6 PC
        </Button>
        <span className="text-[0.7rem] text-ink-faint">
          Worth {auditValue(integrity).toFixed(1)} points this time. Less next time.
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          disabled={game.politicalCapital < 7 || integrity.regulatoryStock <= 1}
          onClick={() => void dispatch({ type: 'simplify_law' })}
        >
          Simplify the statute book · 7 PC
        </Button>
        <span className="text-[0.7rem] text-ink-faint">
          The book only shrinks when someone deliberately goes back through it.
        </span>
      </div>

      <div className="mt-3">
        <Meter
          label="Regulatory quality"
          value={regulatoryQuality(integrity)}
          band={`stock ${integrity.regulatoryStock.toFixed(2)}×`}
        />
      </div>
    </Panel>
  );
}
