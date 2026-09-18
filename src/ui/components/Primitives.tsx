/**
 * Primitives.tsx — the shared vocabulary of the interface.
 *
 * Direction: the dispatch box. State documents and engraved certificates
 * rather than dashboards — warm paper, dense ink, an oxblood seal, and brass
 * for the things that matter most. Serif for anything that speaks, sans for
 * anything that counts.
 *
 * Accessibility rule applied throughout: nothing is conveyed by colour alone.
 * Every meter carries its number and a band name, every party swatch is paired
 * with a glyph, and every signed figure carries an explicit sign.
 */

import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Panel({
  title,
  aside,
  children,
  className = '',
  tone = 'default',
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'quiet' | 'seal';
}) {
  const tones = {
    default: 'bg-panel border-rule shadow-[var(--shadow-sheet)]',
    quiet: 'bg-transparent border-rule',
    seal: 'bg-panel border-seal/40 shadow-[var(--shadow-sheet)]',
  };

  return (
    <section className={`border ${tones[tone]} ${className}`}>
      {(title || aside) && (
        <header className="flex items-baseline justify-between gap-4 border-b border-rule px-5 py-3">
          {title && <h2 className="title text-[0.98rem] text-ink">{title}</h2>}
          {aside && (
            <div className="shrink-0 text-[0.7rem] text-ink-faint tnum">{aside}</div>
          )}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="label mb-2 text-ink-faint">{children}</p>;
}

export function Rule() {
  return <hr className="my-4 border-0 border-t rule-hair" />;
}

/**
 * A pull-quote style lead paragraph. Used at the top of a screen where the
 * prose is doing real work rather than labelling a control.
 */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="prose-serif text-[1.02rem] text-ink-soft">{children}</p>;
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

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
    'inline-flex items-center justify-center gap-2 border px-3.5 py-2 text-[0.82rem] font-medium ' +
    'transition-all duration-150 active:translate-y-px ' +
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0';

  const variants: Record<ButtonVariant, string> = {
    primary:
      'border-seal bg-seal text-paper shadow-[var(--shadow-sheet)] hover:brightness-110 hover:shadow-[var(--shadow-lift)]',
    default:
      'border-rule-strong bg-raised text-ink shadow-[var(--shadow-sheet)] hover:bg-sunk hover:border-ink/40',
    quiet:
      'border-transparent bg-transparent text-ink-soft hover:bg-sunk hover:text-ink',
    danger: 'border-loss bg-transparent text-loss hover:bg-loss hover:text-paper',
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

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  detail,
  tone = 'neutral',
  size = 'default',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'neutral' | 'gain' | 'loss' | 'warn';
  size?: 'default' | 'large';
}) {
  const tones = {
    neutral: 'text-ink',
    gain: 'text-gain',
    loss: 'text-loss',
    warn: 'text-warn',
  };
  return (
    <div className="min-w-0">
      <div className="label text-ink-faint">{label}</div>
      <div
        className={`figure ${size === 'large' ? 'text-4xl' : 'text-[1.6rem]'} mt-0.5 ${tones[tone]}`}
      >
        {value}
      </div>
      {detail && (
        <div className="mt-0.5 truncate text-[0.7rem] text-ink-faint tnum">{detail}</div>
      )}
    </div>
  );
}

/**
 * A labelled bar. The numeric value and the band name are always rendered as
 * text, so the meter is fully readable without perceiving colour or the bar.
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
  const pctValue = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[0.82rem]">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="shrink-0 tnum text-ink-soft">
          {value.toFixed(0)}
          {band && <span className="text-ink-faint"> · {band}</span>}
        </span>
      </div>
      <div
        className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-sunk shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)]"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pctValue}%`, backgroundColor: accent ?? 'var(--color-civic)' }}
        />
      </div>
      {hint && <div className="mt-1 text-[0.7rem] leading-relaxed text-ink-faint">{hint}</div>}
    </div>
  );
}

/** A party's colour swatch, always paired with its glyph. */
export function PartyMark({
  color,
  glyph,
  size = 'default',
}: {
  color: string;
  glyph: string;
  size?: 'default' | 'large';
}) {
  const dimensions = size === 'large' ? 'h-5 w-5 text-[0.7rem]' : 'h-3.5 w-3.5 text-[0.55rem]';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${dimensions} shrink-0 items-center justify-center rounded-[2px] leading-none text-white shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]`}
      style={{ backgroundColor: color }}
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
  tone?: 'neutral' | 'gain' | 'loss' | 'warn' | 'accent' | 'brass';
}) {
  const tones = {
    neutral: 'border-rule-strong text-ink-soft',
    gain: 'border-gain/50 text-gain bg-gain/5',
    loss: 'border-loss/50 text-loss bg-loss/5',
    warn: 'border-warn/50 text-warn bg-warn/5',
    accent: 'border-civic/50 text-civic bg-civic/5',
    brass: 'border-brass/50 text-brass bg-brass/5',
  };
  return (
    <span
      className={`label inline-block rounded-[2px] border px-1.5 py-[3px] text-[0.58rem] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Signed number with an explicit sign, never colour alone. */
export function Delta({ value, unit = '' }: { value: number; unit?: string }) {
  const magnitude = Math.abs(value);
  const digits = magnitude >= 10 ? 0 : 1;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const tone = value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : 'text-ink-faint';
  return (
    <span className={`tnum font-medium ${tone}`}>
      {sign}
      {magnitude.toFixed(digits)}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-[0.82rem] text-ink-faint">{children}</p>;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export const money = (value: number) =>
  `${value < 0 ? '−' : ''}₡${Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}bn`;

export const pct = (value: number, digits = 0) => `${value.toFixed(digits)}%`;

/** Descriptive band for a 0–100 figure. Never evaluative of policy. */
export function bandFor(value: number): string {
  if (value >= 80) return 'Strong';
  if (value >= 62) return 'Sound';
  if (value >= 45) return 'Adequate';
  if (value >= 30) return 'Strained';
  if (value >= 15) return 'Failing';
  return 'Critical';
}
