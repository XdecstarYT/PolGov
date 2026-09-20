/**
 * ErrorBoundary.tsx — the run survives the bug.
 *
 * A sixteen-year run is hours of somebody's attention. A single render
 * throw anywhere in forty thousand lines of interface would otherwise
 * white-screen the page and take the session with it, and the player would
 * have no idea whether their save survived.
 *
 * So the boundary does three things, in order of what matters:
 *
 *   IT SAYS THE SAVE IS SAFE, because it is. Every run is written to
 *   storage as it is played, not at the end, and nothing here touches it.
 *
 *   IT HANDS BACK THE RUN. The last known good state is offered as a file
 *   before anything else is suggested, because the one thing a player
 *   cannot get back is the run itself.
 *
 *   IT SAYS WHAT HAPPENED, in full, with the stack. A player reporting a
 *   crash should not have to open a console to do it, and a report with a
 *   stack in it is worth twenty without one.
 *
 * What it deliberately does NOT do is offer to "continue anyway". The
 * component that threw is in an unknown state; rendering it again would
 * either throw again or, worse, not.
 */

import React from 'react';
import type { GameState } from '../game/index.ts';

interface Props {
  children: React.ReactNode;
  /** The run to hand back, read at the moment of the crash. */
  runAtCrash: () => GameState | null;
}

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
  saved: GameState | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null, saved: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    /* Grab the run immediately, before anything else can move. */
    let saved: GameState | null = null;
    try {
      saved = this.props.runAtCrash();
    } catch {
      saved = null;
    }
    this.setState({ info, saved });
    console.error('Statecraft crashed while rendering:', error, info.componentStack);
  }

  private download = (): void => {
    const { saved } = this.state;
    if (!saved) return;
    try {
      const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `statecraft-${saved.countryName.toLowerCase().replace(/\W+/g, '-')}-term${saved.termNumber}-week${saved.turnNumber}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      /* Nothing more to offer. The save in storage is still the save. */
    }
  };

  render(): React.ReactNode {
    const { error, info, saved } = this.state;
    if (!error) return this.props.children;

    const report =
      `${error.name}: ${error.message}\n\n` +
      `${error.stack ?? '(no stack)'}\n\n` +
      `Component stack:${info?.componentStack ?? ' (none)'}`;

    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <header className="border-b-2 border-ink pb-3">
          <p className="label text-ink-faint">Something in the interface failed</p>
          <h1 className="font-serif text-3xl font-bold text-ink">The page stopped</h1>
        </header>

        <p className="mt-5 font-serif text-lg leading-relaxed text-ink">
          Your run is safe. Every week is written to storage as it is played, and nothing
          that happened here touched it — reload and it will be where you left it.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          This is a bug in the interface rather than anything you did. If you would rather
          not rely on that first sentence, take a copy of the run before reloading.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {saved && (
            <button
              type="button"
              onClick={this.download}
              className="border-2 border-ink bg-ink px-3 py-2 text-sm font-semibold text-paper"
            >
              Download this run
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="border border-rule px-3 py-2 text-sm text-ink hover:border-ink"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(report)}
            className="border border-rule px-3 py-2 text-sm text-ink hover:border-ink"
          >
            Copy the error
          </button>
        </div>

        <details className="mt-6 border border-rule bg-paper-sunk px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-faint">
            What went wrong
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">
            {report}
          </pre>
        </details>
      </div>
    );
  }
}
