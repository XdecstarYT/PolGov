// @vitest-environment jsdom
/**
 * errorBoundary.test.tsx — the run survives the bug.
 *
 * The one piece of interface that only runs when something else has
 * already gone wrong, which means it is the one piece nobody exercises by
 * hand. If it throws, or if it loses the run it was supposed to hand back,
 * nobody finds out until a player has already lost hours.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary.tsx';
import { createStandardGame } from '../../game/setup.ts';
import type { GameState } from '../../game/types.ts';

const run = createStandardGame('boundary');

function Throws(): never {
  throw new Error('the chamber exploded');
}

/** React logs a caught error; that is expected here and not a failure. */
const silence = () => vi.spyOn(console, 'error').mockImplementation(() => {});

afterEach(cleanup);

describe('when the interface fails', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary runAtCrash={() => run}>
        <p>the desk</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('the desk')).toBeTruthy();
  });

  it('says the run is safe, before anything else', () => {
    const spy = silence();
    render(
      <ErrorBoundary runAtCrash={() => run}>
        <Throws />
      </ErrorBoundary>,
    );
    /* The first thing a player reads, because it is the thing they are
       actually worried about and it happens to be true. */
    expect(screen.getByText(/Your run is safe/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download this run/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reload/ })).toBeTruthy();
    spy.mockRestore();
  });

  it('shows the error and its stack, so a report can carry one', () => {
    const spy = silence();
    render(
      <ErrorBoundary runAtCrash={() => run}>
        <Throws />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/the chamber exploded/)).toBeTruthy();
    spy.mockRestore();
  });

  it('does not offer to carry on, because the tree is in an unknown state', () => {
    const spy = silence();
    render(
      <ErrorBoundary runAtCrash={() => run}>
        <Throws />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('button', { name: /Continue|Try again|Dismiss/ })).toBeNull();
    spy.mockRestore();
  });

  it('survives a crash that happens while it is reaching for the run', () => {
    /*
     * The failure mode that would turn one bug into two. Whatever went
     * wrong may have gone wrong in the store, so reading the run can throw
     * as well — and the boundary still has to render.
     */
    const spy = silence();
    render(
      <ErrorBoundary
        runAtCrash={() => {
          throw new Error('and the store with it');
        }}
      >
        <Throws />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Your run is safe/)).toBeTruthy();
    /* Nothing to hand back, so nothing is offered. */
    expect(screen.queryByRole('button', { name: /Download this run/ })).toBeNull();
    spy.mockRestore();
  });

  it('offers nothing to download when there is no run yet', () => {
    const spy = silence();
    render(
      <ErrorBoundary runAtCrash={() => null as GameState | null}>
        <Throws />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('button', { name: /Download this run/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Reload/ })).toBeTruthy();
    spy.mockRestore();
  });
});
