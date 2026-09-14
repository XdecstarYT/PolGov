/**
 * Primitives.tsx — the shared vocabulary of the interface.
 *
 * Visual direction: broadsheet newspaper and government briefing folder.
 * Serif headlines, hairline rules, dense data panels, tabular figures so
 * numbers do not jitter as they change.
 *
 * Accessibility rule applied throughout: nothing is conveyed by colour alone.
 * Every meter carries its number, every status carries a word, and every
 * party swatch is paired with a glyph.
 */

import type { ReactNode } from 'react';

/* ----------------------------- layout ----------------------------- */

export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border border-rule bg-panel ${className}`}
    >
      {(title || aside) && (
        <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
          {title && (
            <h2 className="font-serif text-[0.95rem] font-semibold tracking-tight text-ink">
              {title}
            </h2>
          )}
          {aside && <div className="text-xs text-ink-faint tnum">{aside}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </p>
  );
}

export function Rule() {
  return <hr className="my-3 border-0 border-t border-rule" />;
}

/* ----------------------------- controls --------------------------- */

type ButtonVariant = 'primary' | 'default' | 'quiet' | 'danger';

export function Button({
  children,
  onClick,
  disabled,
  variant = 'default',
  type = 'button',
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  className?: string;
  title?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45';
  const variants: Record<ButtonVariant, string> = {
    primary:
      'border-seal bg-seal text-paper hover:opacity-90 font-medium',
    default: 'border-rule-strong bg-panel text-ink hover:bg-sunk',
    quiet: 'border-transparent bg-transparent text-ink-soft hover:text-ink hover:bg-sunk',
    danger: 'border-loss text-loss bg-transparent hover:bg-sunk',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------ data ------------------------------ */

export function Stat({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'neutral' | 'gain' | 'loss' | 'warn';
}) {
  const tones = {
    neutral: 'text-ink',
    gain: 'text-gain',
    loss: 'text-loss',
    warn: 'text-warn',
  };
  return (
    <div className="min-w-0">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </div>
      <div className={`font-serif text-xl leading-tight tnum ${tones[tone]}`}>{value}</div>
      {detail && <div className="truncate text-xs text-ink-faint tnum">{detail}</div>}
    </div>
  );
}

/**
 * A labelled bar. The numeric value is always rendered as text beside it, and
 * the band name ("Strained", "Steady") is rendered too, so the meter is fully
 * readable without perceiving colour or the bar itself.
 */
export function Meter({
  label,
  value,
  max = 100,
  band,
  accent,
  hint,
}: {
  label: ReactNode;
  value: number;
  max?: number;
  band?: string;
  accent?: string;
  hint?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="shrink-0 tnum text-ink-soft">
          {value.toFixed(0)}
          {band ? ` · ${band}` : ''}
        </span>
      </div>
      <div
        className="mt-1 h-2 w-full border border-rule bg-sunk"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div
          className="h-full"
          style={{ width: `${pct}%`, backgroundColor: accent ?? 'var(--color-civic)' }}
        />
      </div>
      {hint && <div className="mt-1 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

/** A party's colour swatch, always paired with its glyph. */
export function PartyMark({ color, glyph }: { color: string; glyph: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center border border-rule text-[0.6rem] leading-none"
      style={{ backgroundColor: color, color: '#fff' }}
    >
      {glyph}
    </span>
  );
}

export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gain' | 'loss' | 'warn' | 'accent';
}) {
  const tones = {
    neutral: 'border-rule text-ink-soft',
    gain: 'border-gain text-gain',
    loss: 'border-loss text-loss',
    warn: 'border-warn text-warn',
    accent: 'border-civic text-civic',
  };
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Signed number with an explicit sign and a word, never colour alone. */
export function Delta({ value, unit = '' }: { value: number; unit?: string }) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const tone = value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : 'text-ink-faint';
  return (
    <span className={`tnum font-medium ${tone}`}>
      {sign}
      {Math.abs(Number(rounded)).toFixed(Math.abs(value) >= 10 ? 0 : 1)}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-faint">{children}</p>;
}

/* ------------------------------ money ----------------------------- */

export const money = (value: number) =>
  `${value < 0 ? '−' : ''}₡${Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}bn`;

export const pct = (value: number, digits = 0) => `${value.toFixed(digits)}%`;

/** Descriptive band for a 0–100 health/mood figure. Never evaluative of policy. */
export function bandFor(value: number): string {
  if (value >= 80) return 'Strong';
  if (value >= 62) return 'Sound';
  if (value >= 45) return 'Adequate';
  if (value >= 30) return 'Strained';
  if (value >= 15) return 'Failing';
  return 'Critical';
}
