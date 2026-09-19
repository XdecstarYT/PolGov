/**
 * Dossier.tsx — the briefing, in sections rather than in one scroll.
 *
 * The morning brief grew to thirteen panels and sixteen thousand pixels,
 * which is not a briefing; it is a filing cabinet that has fallen over. The
 * fix is the one every real red box uses: the brief itself on top, and the
 * supporting papers behind a divider, one section at a time.
 *
 * Three sections, chosen so that a player looking for something knows which
 * one it is in without having to remember: what the country is doing, what
 * the world is doing, and what could go wrong. Anything that is urgent —
 * a live crisis, an event running now — is flagged on its tab, because a
 * section behind a divider is a section a player will not open, and the one
 * thing a briefing must never do is hide the thing that matters this week.
 */

import { useState, type ReactNode } from 'react';

export interface DossierSection {
  key: string;
  label: string;
  /** One line under the tabs, so the section says what it is for. */
  blurb: string;
  /** A count of things that want attention, shown on the tab. */
  flag?: number;
  content: ReactNode;
}

export function Dossier({ sections }: { sections: DossierSection[] }) {
  const [open, setOpen] = useState(sections[0]?.key ?? '');
  const current = sections.find((s) => s.key === open) ?? sections[0];
  if (!current) return null;

  return (
    <section className="border border-rule bg-panel shadow-[var(--shadow-sheet)]">
      <header className="border-b border-rule px-5 pt-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="The papers">
          {sections.map((section) => {
            const active = section.key === current.key;
            return (
              <button
                key={section.key}
                type="button"
                role="tab"
                id={`dossier-tab-${section.key}`}
                aria-selected={active}
                aria-controls={`dossier-panel-${section.key}`}
                onClick={() => setOpen(section.key)}
                className={`label flex items-center gap-1.5 border-b-2 px-3 py-2 text-[0.68rem] transition-colors ${
                  active
                    ? 'border-seal text-ink'
                    : 'border-transparent text-ink-faint hover:text-ink-soft'
                }`}
              >
                {section.label}
                {section.flag !== undefined && section.flag > 0 && (
                  <span
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-seal px-1 text-[0.6rem] leading-none text-white"
                    aria-label={`${section.flag} needing attention`}
                  >
                    {section.flag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div
        role="tabpanel"
        id={`dossier-panel-${current.key}`}
        aria-labelledby={`dossier-tab-${current.key}`}
        className="p-5"
      >
        <p className="mb-4 text-sm leading-relaxed text-ink-soft">{current.blurb}</p>
        <div className="space-y-5">{current.content}</div>
      </div>
    </section>
  );
}
