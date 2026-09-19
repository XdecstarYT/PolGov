/**
 * IntelligencePanel.tsx — the paper, and what is not on it.
 *
 * Every other panel in this game shows the player a number that means what
 * it says. This one shows an estimate and a confidence, and the confidence
 * is itself an estimate. So the layout does two things no other panel does.
 *
 * It prints the confidence beside the number rather than under it, at the
 * same weight, because the two are one claim and a player who reads only
 * the first half is making the mistake the system is about.
 *
 * And it keeps the track record — how often the agencies have turned out
 * to be right — permanently visible. A single assessment cannot tell you
 * anything about whether to believe it. Twenty of them, judged after the
 * fact, can, and that is the only honest way a player ever learns how much
 * weight this page deserves.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import {
  CONFIDENCE_LABELS,
  OPERATION_TEMPLATES,
  OVERSIGHT_PC_COST,
  POSTURE_PC_COST,
  POWER_TEMPLATES,
  SUBJECT_TEMPLATES,
  absoluteWeek,
  collectionFor,
  describeIntelligence,
  findNation,
  findOperation,
  findPower,
  operationOdds,
  scandalRisk,
  trackRecord,
  type AssessmentSubject,
  type NationKey,
  type OperationKey,
} from '../../game/index.ts';
import { Button, EmptyNote, Kicker, Meter, Panel, Stat, Tag } from './Primitives.tsx';

const CONFIDENCE_TONE = {
  low: 'text-ink-faint',
  moderate: 'text-warn',
  high: 'text-ink',
} as const;

const VERDICT_TONE = { sound: 'gain', wrong: 'loss', unknown: 'neutral' } as const;

export function IntelligencePanel() {
  const { game, dispatch } = useGame();
  const [nation, setNation] = useState<NationKey | ''>('');

  if (!game) return null;
  const intel = game.intelligence;
  const record = trackRecord(intel.assessments);
  const powers = findPower(intel.powers);
  const running = intel.operations.filter((o) => o.status === 'running');
  const week = absoluteWeek(game);

  const recent = [...intel.assessments].sort((a, b) => b.turn - a.turn).slice(0, 8);

  return (
    <div className="space-y-5">
      <Panel title="The agencies" aside={powers.name.toLowerCase()}>
        <p className="font-serif text-[1.02rem] leading-relaxed text-ink">
          {describeIntelligence(intel)}
        </p>

        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3 border-t border-rule pt-4">
          <Stat
            label="Collection"
            value={intel.capability.toFixed(0)}
            detail="people and relationships, not equipment"
          />
          <Stat
            label="Penetration"
            value={intel.penetration.toFixed(0)}
            detail="how much of what we do is known"
            tone={intel.penetration > 45 ? 'loss' : 'neutral'}
          />
          <Stat
            label="Track record"
            value={record === null ? '—' : `${Math.round(record * 100)}%`}
            detail={record === null ? 'nothing judged yet' : 'of assessments sound, after the fact'}
            tone={record !== null && record < 0.5 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Oversight"
            value={intel.oversight.toFixed(0)}
            detail={scandalRisk(intel) > 0 ? 'below what keeps them in bounds' : 'adequate'}
            tone={scandalRisk(intel) > 0 ? 'warn' : 'neutral'}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {(['human', 'signals', 'analysis'] as const).map((arm) => (
            <Meter
              key={arm}
              label={
                arm === 'human'
                  ? 'People'
                  : arm === 'signals'
                    ? 'Signals'
                    : 'Analysis'
              }
              value={intel.posture[arm] * 100}
              accent={arm === 'analysis' ? 'var(--color-brass)' : 'var(--color-civic)'}
              hint={
                arm === 'analysis'
                  ? 'The one that gets cut, and the one that decides whether the rest was worth having'
                  : undefined
              }
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: 'Toward people', human: 0.5, signals: 0.3, analysis: 0.2 },
            { label: 'Toward signals', human: 0.2, signals: 0.6, analysis: 0.2 },
            { label: 'Toward analysis', human: 0.3, signals: 0.3, analysis: 0.4 },
          ].map((preset) => (
            <Button
              key={preset.label}
              disabled={game.politicalCapital < POSTURE_PC_COST}
              onClick={() =>
                void dispatch({
                  type: 'set_collection',
                  human: preset.human,
                  signals: preset.signals,
                  analysis: preset.analysis,
                })
              }
            >
              {preset.label} · {POSTURE_PC_COST} PC
            </Button>
          ))}
        </div>
      </Panel>

      <Panel title="Assessments">
        <Kicker>The confidence describes the spread, not the answer</Kicker>
        <p className="text-sm leading-relaxed text-ink-soft">
          What comes back is the truth plus however much the agencies cannot see. Nobody is
          lying, the process worked, and the number can still be wrong — most often on exactly
          the questions where an answer is most wanted.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
          <label className="flex items-center gap-2 text-xs text-ink-faint">
            About
            <select
              className="border border-rule-strong bg-raised px-2 py-1 text-xs text-ink"
              value={nation}
              onChange={(e) => setNation(e.target.value as NationKey | '')}
            >
              <option value="">choose a country</option>
              {game.world.nations
                .filter((n) => n.recognised)
                .map((n) => (
                  <option key={n.key} value={n.key}>
                    {findNation(n.key).name}
                  </option>
                ))}
            </select>
          </label>
          {SUBJECT_TEMPLATES.map((subject) => (
            <Button
              key={subject.key}
              disabled={nation === '' || game.politicalCapital < subject.cost}
              onClick={() =>
                nation !== '' &&
                void dispatch({
                  type: 'commission_assessment',
                  subject: subject.key as AssessmentSubject,
                  nation: nation as NationKey,
                })
              }
            >
              {subject.name} · {subject.cost} PC
            </Button>
          ))}
        </div>

        {nation !== '' && (
          <ul className="mt-3 space-y-1 text-[0.7rem] text-ink-faint">
            {SUBJECT_TEMPLATES.map((subject) => (
              <li key={subject.key}>
                <span className="text-ink-soft">{subject.name}</span> — {subject.question} We can
                see this one at{' '}
                <span className="tnum">{collectionFor(intel, subject.key).toFixed(0)}</span> of
                100.
              </li>
            ))}
          </ul>
        )}

        {recent.length === 0 ? (
          <EmptyNote>Nothing has been asked. Nothing has been answered.</EmptyNote>
        ) : (
          <ul className="mt-4 divide-y divide-rule">
            {recent.map((assessment) => {
              const subject = SUBJECT_TEMPLATES.find((s) => s.key === assessment.subject)!;
              return (
                <li key={assessment.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ink">
                      {subject.name} · {findNation(assessment.nation).name}
                    </span>
                    <span className="flex items-center gap-2">
                      {assessment.verdict !== 'unknown' && (
                        <Tag tone={VERDICT_TONE[assessment.verdict]}>
                          {assessment.verdict === 'sound' ? 'turned out sound' : 'turned out wrong'}
                        </Tag>
                      )}
                      <span className="figure text-[1.1rem] text-ink">
                        {assessment.estimate.toFixed(0)}
                      </span>
                      <span className={`label ${CONFIDENCE_TONE[assessment.confidence]}`}>
                        {CONFIDENCE_LABELS[assessment.confidence]}
                      </span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.7rem] text-ink-faint">
                    {subject.question} Week {assessment.turn}.
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Operations" aside={running.length > 0 ? `${running.length} running` : undefined}>
        {running.length > 0 && (
          <ul className="mb-4 space-y-2">
            {running.map((operation) => {
              const template = findOperation(operation.kind);
              return (
                <li
                  key={operation.id}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span className="text-sm text-ink">
                    {template.name} · {findNation(operation.nation).name}
                  </span>
                  <span className="tnum text-xs text-ink-faint">
                    {Math.max(0, operation.dueTurn - week)} weeks ·{' '}
                    {Math.round(operation.exposure * 100)}% to surface
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <ul className="space-y-2 border-t border-rule pt-3">
          {OPERATION_TEMPLATES.map((template) => {
            const odds = operationOdds(template.key as OperationKey, intel);
            return (
              <li key={template.key} className="flex items-start justify-between gap-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm text-ink">{template.name}</span>
                  <span className="text-[0.7rem] leading-relaxed text-ink-faint">
                    {template.blurb}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tnum text-xs text-ink-faint">
                    {Math.round(odds.success * 100)}% / {Math.round(odds.exposure * 100)}%
                  </span>
                  <Button
                    disabled={nation === '' || game.politicalCapital < template.cost}
                    onClick={() =>
                      nation !== '' &&
                      void dispatch({
                        type: 'launch_operation',
                        operation: template.key as OperationKey,
                        nation: nation as NationKey,
                      })
                    }
                  >
                    Authorise · {template.cost} PC
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          The two figures are the chance it works and the chance it surfaces, and the second is
          fixed at the moment it is authorised rather than when it lands. An operation ordered by
          a careless government surfaces under a careful one, and it is the careful one that
          pays.
        </p>
      </Panel>

      <Panel title="At home">
        <Kicker>The only lever here with a constituency on both sides</Kicker>
        <ul className="space-y-3">
          {POWER_TEMPLATES.map((template) => {
            const current = intel.powers === template.level;
            return (
              <li
                key={template.level}
                className="border-t border-rule pt-3 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-sm font-semibold text-ink">
                    {template.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {current && <Tag tone="accent">in force</Tag>}
                    {template.approval !== 0 && (
                      <span className="tnum text-xs text-loss">{template.approval} approval</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{template.blurb}</p>
                {!current && (
                  <div className="mt-2">
                    <Button
                      onClick={() =>
                        void dispatch({ type: 'set_surveillance', level: template.level })
                      }
                    >
                      {template.level > intel.powers ? 'Legislate' : 'Repeal to this'} ·{' '}
                      {template.level > intel.powers
                        ? template.cost
                        : Math.round(template.cost * 0.4)}{' '}
                      PC
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-5 border-t border-rule pt-4">
          <Kicker>How closely they are watched</Kicker>
          <p className="text-sm leading-relaxed text-ink-soft">
            An agency nobody is watching is harder to catch, which is a real advantage, and more
            likely to do something nobody asked for, which is a real cost. Nobody gets to have
            only one of those.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {[20, 50, 80].map((level) => (
              <Button
                key={level}
                disabled={
                  Math.abs(intel.oversight - level) < 1 ||
                  game.politicalCapital < OVERSIGHT_PC_COST
                }
                onClick={() => void dispatch({ type: 'set_oversight', level })}
              >
                {level === 20 ? 'Light touch' : level === 50 ? 'Conventional' : 'Close'} ·{' '}
                {OVERSIGHT_PC_COST} PC
              </Button>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
