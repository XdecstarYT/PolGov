/**
 * news.ts — the fictional press of Verdana, and the offline newsroom.
 *
 * These outlets do not exist and are not modelled on any real publication.
 * Each has a stance expressed as an ideology vector, so coverage of the same
 * turn differs between them without any outlet being positioned as correct.
 *
 * The generator below produces the full news feed with no AI involvement at
 * all. `ai-narrator` replaces this prose when it is available; the game plays
 * identically when it is not.
 */

import type { Ideology, LogEntry, NewsItem } from '../types.ts';
import { makeIdeology } from '../ideology.ts';
import type { Rng } from '../rng.ts';

export interface Outlet {
  name: string;
  /** Editorial position, used to tint which stories it leads on. */
  stance: Ideology;
  /** How much this outlet moralises. Purely a prose-style hint. */
  register: 'broadsheet' | 'tabloid' | 'trade' | 'regional';
}

export const OUTLETS: Outlet[] = [
  { name: 'The Verdana Chronicle', stance: makeIdeology(0.1, 0.05, 0), register: 'broadsheet' },
  { name: 'The Halloway Post', stance: makeIdeology(-0.5, 0.15, 0), register: 'regional' },
  { name: 'Ternhill Financial Review', stance: makeIdeology(0.6, -0.05, -0.2), register: 'trade' },
  { name: 'The Daily Standard', stance: makeIdeology(0.2, -0.45, -0.15), register: 'tabloid' },
  { name: 'Ashmere Observer', stance: makeIdeology(-0.15, 0.55, 0.4), register: 'broadsheet' },
  { name: 'The Compass', stance: makeIdeology(-0.05, 0.1, 0.5), register: 'broadsheet' },
  { name: 'Estmoor Courier', stance: makeIdeology(-0.35, -0.2, -0.05), register: 'regional' },
];

/** Rounds for display without trailing noise. */
const n = (value: number, digits = 1) =>
  Math.abs(value) >= 10 ? Math.round(value).toString() : value.toFixed(digits);

interface StoryDraft {
  headline: string;
  body: string;
  sentiment: number;
  /** Higher runs first. */
  priority: number;
}

/**
 * Builds the turn's coverage from the turn log. Deterministic given the log
 * and the RNG cursor, so a replayed turn produces the same front page.
 */
export function generateNews(
  entries: LogEntry[],
  context: {
    turnNumber: number;
    countryName: string;
    approval: number;
    debt: number;
    playerPartyName: string;
  },
  rng: Rng,
): NewsItem[] {
  const drafts: StoryDraft[] = [];

  const approvalEntries = entries.filter((e) => e.kind === 'approval' && e.delta !== null);
  const netApproval = approvalEntries.reduce((sum, e) => sum + (e.delta ?? 0), 0);

  for (const entry of entries) {
    if (entry.kind === 'legislature' && entry.cause.includes('passed')) {
      drafts.push({
        headline: `${entry.label} clears the chamber`,
        body: `The government carried ${entry.label} on the floor this week. ${entry.cause}`,
        sentiment: 0.4,
        priority: 9,
      });
    } else if (entry.kind === 'legislature' && entry.cause.includes('failed')) {
      drafts.push({
        headline: `${entry.label} falls short`,
        body: `${entry.label} failed to carry. ${entry.cause}`,
        sentiment: -0.5,
        priority: 9,
      });
    } else if (entry.kind === 'event') {
      drafts.push({
        headline: entry.label,
        body: entry.cause,
        sentiment: (entry.delta ?? 0) >= 0 ? 0.2 : -0.4,
        priority: 8,
      });
    } else if (entry.kind === 'coalition' && (entry.delta ?? 0) <= -10) {
      drafts.push({
        headline: `Coalition strain: ${entry.label}`,
        body: `${entry.cause} Partners are briefing openly about the state of the agreement.`,
        sentiment: -0.6,
        priority: 7,
      });
    } else if (entry.kind === 'sector' && (entry.delta ?? 0) <= -3) {
      drafts.push({
        headline: `${entry.label} under visible pressure`,
        body: `${entry.cause} Service leaders have asked for a funding review.`,
        sentiment: -0.45,
        priority: 6,
      });
    } else if (entry.kind === 'election') {
      drafts.push({
        headline: entry.label,
        body: entry.cause,
        sentiment: 0,
        priority: 10,
      });
    }
  }

  if (Math.abs(netApproval) >= 1.5) {
    const rising = netApproval > 0;
    drafts.push({
      headline: rising
        ? `Polling firms up for ${context.playerPartyName}`
        : `${context.playerPartyName} slips in the weekly polling`,
      body: `Aggregated polling moved ${rising ? 'up' : 'down'} ${n(Math.abs(netApproval))} points this week, to ${n(context.approval, 0)}%.`,
      sentiment: rising ? 0.5 : -0.5,
      priority: 5,
    });
  }

  if (context.debt > 300) {
    drafts.push({
      headline: 'Debt service crowds the estimates',
      body: `Outstanding debt stands at ₡${n(context.debt, 0)}bn. Analysts note the interest line is now a structural claim on the budget.`,
      sentiment: -0.4,
      priority: 4,
    });
  }

  if (drafts.length === 0) {
    drafts.push({
      headline: 'A quiet week in the chamber',
      body: `No major division reached the floor. Attention in ${context.countryName} turned to committee work and the estimates.`,
      sentiment: 0,
      priority: 1,
    });
  }

  const ordered = drafts.sort((a, b) => b.priority - a.priority).slice(0, 4);
  const outlets = rng.shuffle(OUTLETS);

  return ordered.map((draft, index) => ({
    id: `news-${context.turnNumber}-${index}`,
    turnNumber: context.turnNumber,
    outlet: outlets[index % outlets.length]!.name,
    headline: draft.headline,
    body: draft.body,
    sentiment: draft.sentiment,
  }));
}

/* ------------------------------------------------------------------ *
 * Offline prose for the other AI surfaces
 * ------------------------------------------------------------------ */

/** Opposition reaction used when ai-narrator is unavailable. */
export function fallbackOppositionQuote(
  leaderTitle: string,
  partyName: string,
  passed: boolean,
  billTitle: string,
): string {
  return passed
    ? `The ${leaderTitle} of the ${partyName} said the government "has the votes and will own the consequences" of ${billTitle}.`
    : `The ${leaderTitle} of the ${partyName} called the defeat of ${billTitle} "an entirely avoidable failure of arithmetic".`;
}

/**
 * Negotiating line used when ai-narrator is unavailable.
 *
 * Varies on ideological affinity as well as mood. At the moment a coalition is
 * being formed nobody has a mood yet, so affinity is the only thing that
 * distinguishes one partner from another — keying on mood alone gave every
 * party at the table the same opening sentence.
 */
export function fallbackCoalitionLine(
  partyName: string,
  mood: number,
  sectorLabel: string,
  amount: number,
  affinityValue = 0,
): string {
  const terms = `₡${amount}bn for ${sectorLabel}`;

  if (mood < 40) {
    return `${partyName} is briefing that it can do without government. ${terms} is presented as a minimum, not an opening.`;
  }

  if (affinityValue >= 0.55) {
    return `${partyName} sees a natural fit and says so publicly. They expect ${terms} and a cabinet share proportionate to what they bring.`;
  }
  if (affinityValue >= 0.2) {
    return `${partyName} is willing to be constructive, within limits. ${terms} is where their conversation starts, and the cabinet question comes after it.`;
  }
  if (affinityValue >= -0.15) {
    return `${partyName} will deal, but they are candid that this is arithmetic rather than agreement. ${terms}, and the red lines are not for discussion.`;
  }
  if (affinityValue >= -0.5) {
    return `${partyName} makes no pretence of enthusiasm. They will support a government that funds ${terms} and concedes them the posts — and not one that does less.`;
  }
  return `${partyName} regards an arrangement with you as a last resort, and prices it accordingly: ${terms}, the posts in full, and no movement on either.`;
}

/** Debate attack used when ai-narrator is unavailable. */
export function fallbackDebateAttack(partyName: string, approval: number): string {
  if (approval < 40) {
    return `The ${partyName} spokesperson opens on the record: "Ask whether anything you were promised has actually arrived."`;
  }
  if (approval < 55) {
    return `The ${partyName} spokesperson opens on cost: "Every improvement claimed tonight was paid for by borrowing against people who cannot vote yet."`;
  }
  return `The ${partyName} spokesperson opens on complacency: "A comfortable government is not the same thing as a competent one."`;
}
