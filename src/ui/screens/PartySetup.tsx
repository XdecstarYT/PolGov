/**
 * PartySetup.tsx — found a party.
 *
 * The ideology sliders drive a live compatibility preview, so the player can
 * see the coalition arithmetic their position implies before committing to it.
 * The preview describes relationships; it never suggests a position is better.
 */

import { useMemo, useState } from 'react';
import { useGame, type NewGameForm } from '../../state/store.ts';
import {
  DIFFICULTY,
  ELECTORAL_SYSTEM_BLURBS,
  ELECTORAL_SYSTEM_LABELS,
  PARTY_TEMPLATES,
  PLAYER_COLORS,
  affinity,
  affinityLabel,
  axisLabel,
  type Difficulty,
  type ElectoralSystem,
  type IdeologyAxis,
} from '../../game/index.ts';
import { Button, Kicker, Panel, PartyMark, Rule } from '../components/Primitives.tsx';

const AXIS_META: { axis: IdeologyAxis; title: string; low: string; high: string }[] = [
  {
    axis: 'economic',
    title: 'Economic',
    low: 'Collective provision',
    high: 'Market provision',
  },
  {
    axis: 'social',
    title: 'Social',
    low: 'Traditional order',
    high: 'Individual latitude',
  },
  {
    axis: 'environmental',
    title: 'Environmental',
    low: 'Industrial priority',
    high: 'Ecological priority',
  },
];

export function PartySetup() {
  const { startGame, setScreen, busy } = useGame();

  const [form, setForm] = useState<NewGameForm>({
    partyName: '',
    color: PLAYER_COLORS[0].color,
    glyph: PLAYER_COLORS[0].glyph,
    ideology: { economic: 0, social: 0, environmental: 0 },
    difficulty: 'standard',
    countryName: 'Verdana',
    electoralSystem: 'proportional',
  });

  const compatibility = useMemo(
    () =>
      PARTY_TEMPLATES.map((template) => ({
        template,
        value: affinity(form.ideology, template.ideology),
      })).sort((a, b) => b.value - a.value),
    [form.ideology],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="border-b-2 border-ink pb-3">
        <Kicker>Registration of a new political party</Kicker>
        <h1 className="font-serif text-3xl font-bold text-ink">Found a party</h1>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Panel title="Identity">
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-faint" htmlFor="party-name">
              Party name
            </label>
            <input
              id="party-name"
              value={form.partyName}
              onChange={(e) => setForm({ ...form, partyName: e.target.value })}
              placeholder="Reform Coalition"
              maxLength={40}
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 font-serif text-lg text-ink"
            />

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-faint" htmlFor="country-name">
              Country name
            </label>
            <input
              id="country-name"
              value={form.countryName}
              onChange={(e) => setForm({ ...form, countryName: e.target.value })}
              maxLength={30}
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-ink"
            />

            <fieldset className="mt-4">
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Party colour
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {PLAYER_COLORS.map((option) => {
                  const selected = form.color === option.color;
                  return (
                    <button
                      key={option.color}
                      type="button"
                      onClick={() => setForm({ ...form, color: option.color, glyph: option.glyph })}
                      aria-pressed={selected}
                      className={`flex items-center gap-2 border px-2 py-1 text-xs ${
                        selected ? 'border-ink text-ink' : 'border-rule text-ink-faint'
                      }`}
                    >
                      <PartyMark color={option.color} glyph={option.glyph} />
                      {option.name}
                      {selected && <span className="sr-only">(selected)</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Panel>

          <Panel title="Platform">
            <p className="text-sm text-ink-soft">
              These axes are mechanical. They decide which parties will work with you and which
              electorates warm to you — nothing more.
            </p>
            <div className="mt-4 space-y-5">
              {AXIS_META.map(({ axis, title, low, high }) => (
                <div key={axis}>
                  <div className="flex items-baseline justify-between">
                    <label className="text-sm font-medium text-ink" htmlFor={`axis-${axis}`}>
                      {title}
                    </label>
                    <span className="text-xs text-ink-faint tnum">
                      {form.ideology[axis].toFixed(2)} · {axisLabel(axis, form.ideology[axis])}
                    </span>
                  </div>
                  <input
                    id={`axis-${axis}`}
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={form.ideology[axis]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ideology: { ...form.ideology, [axis]: Number(e.target.value) },
                      })
                    }
                    className="mt-2 w-full accent-[var(--color-civic)]"
                  />
                  <div className="flex justify-between text-[0.68rem] text-ink-faint">
                    <span>{low}</span>
                    <span>{high}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Who would work with you" aside="Live">
            <p className="text-sm text-ink-soft">
              Ranked by ideological distance from your platform. Closer parties are cheaper to keep
              in a coalition; distant ones extract more for the same seats.
            </p>
            <Rule />
            <ul className="space-y-2.5">
              {compatibility.map(({ template, value }) => (
                <li key={template.id} className="flex items-start gap-2.5">
                  <PartyMark color={template.color} glyph={template.glyph} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-ink">{template.name}</span>
                      <span className="shrink-0 text-xs text-ink-faint tnum">
                        {value >= 0 ? '+' : '−'}
                        {Math.abs(value).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-ink-faint">{affinityLabel(value)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="How votes become seats">
            <p className="text-sm leading-relaxed text-ink-soft">
              The counting rules are not neutral machinery. The same votes produce a different
              parliament under each of these, and a government elected under one would not
              necessarily exist under another. Fixed for the run once chosen.
            </p>
            <div className="mt-3 space-y-2">
              {(Object.keys(ELECTORAL_SYSTEM_LABELS) as ElectoralSystem[]).map((key) => {
                const selected = form.electoralSystem === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, electoralSystem: key })}
                    aria-pressed={selected}
                    className={`block w-full border p-2.5 text-left ${
                      selected ? 'border-ink bg-sunk/50' : 'border-rule'
                    }`}
                  >
                    <div className="font-serif text-sm font-semibold text-ink">
                      {ELECTORAL_SYSTEM_LABELS[key]}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
                      {ELECTORAL_SYSTEM_BLURBS[key]}
                    </p>
                    {selected && <span className="sr-only">(selected)</span>}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Difficulty">
            <div className="space-y-2">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => {
                const selected = form.difficulty === key;
                const profile = DIFFICULTY[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, difficulty: key })}
                    aria-pressed={selected}
                    className={`block w-full border p-3 text-left ${
                      selected ? 'border-ink bg-sunk/50' : 'border-rule'
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-serif text-sm font-semibold text-ink">
                        {profile.label}
                      </span>
                      <span className="text-xs text-ink-faint tnum">
                        opening debt ₡{profile.startingDebt}bn
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-faint">{profile.blurb}</p>
                    {selected && <span className="sr-only">(selected)</span>}
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void startGame(form)} disabled={busy}>
              {busy ? 'Preparing…' : 'Contest the election'}
            </Button>
            <Button variant="quiet" onClick={() => setScreen('title')}>
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
