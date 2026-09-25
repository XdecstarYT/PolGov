/**
 * DraftingDesk.tsx — write your own bill.
 *
 * The player describes a law in their own words; parliamentary counsel
 * turns it into a bill; the chamber decides what to do with it.
 *
 * The panel is written to make the division of labour visible rather than
 * to hide it. Before the bill is filed the player sees the effects the
 * draft proposes and every change the engine made on the way in — the
 * clamps, the dropped keys, the cut applied to a bill that asked for more
 * than it gave up. A drafting feature that quietly rewrote what somebody
 * typed would be worse than one that refused, and one that let a text box
 * buy approval would not be a game.
 *
 * With the AI unreachable the panel says so and does nothing else. Every
 * other way of passing a law is unaffected.
 */

import { useState } from 'react';
import { useGame } from '../../state/store.ts';
import { draftBill, lastDirectGroqStatus, type NarratorReason } from '../../services/narrator.ts';
import {
  BILL_CATEGORY_LABELS,
  DRAFT_BILL_LIMIT,
  DRAFT_BILL_PC_COST,
  ENVELOPE,
  describeDraft,
  readDraft,
  type BillMagnitude,
  type RawDraft,
} from '../../game/index.ts';
import { Button, EmptyNote, Panel, Tag } from './Primitives.tsx';
import { EffectSummary } from '../phases/EventsPhase.tsx';

type Stage =
  | { at: 'idle' }
  | { at: 'drafting' }
  | { at: 'ready'; raw: RawDraft; description: string; magnitude: BillMagnitude }
  | { at: 'unavailable'; reason: NarratorReason | null };

/**
 * Turn a failure reason into a sentence a player can act on, without a
 * console or a network tab. The direct-to-Groq path additionally knows the
 * HTTP status Groq itself sent back, which is the difference between "the
 * key is wrong" and "the request never arrived" — two problems that look
 * identical from "Counsel could not be reached" alone.
 */
function describeUnavailable(reason: NarratorReason | null): string {
  const status = lastDirectGroqStatus();

  switch (reason) {
    case 'not_configured':
      return 'AI is not configured for this deployment — no cloud account and no direct key are set up here.';
    case 'not_signed_in':
      return "You're not signed in. This deployment's AI needs an account — sign in from the title screen and try again.";
    case 'rate_limited':
      return "The hour's AI allowance has been used up. Try again shortly.";
    case 'upstream_error':
      if (status === 401 || status === 403) {
        return `The AI service rejected the key (HTTP ${status}) — it may be wrong, revoked, or not saved yet. Check it on the host's environment settings and redeploy.`;
      }
      if (status === 429) {
        return "The AI service's own rate limit was hit (HTTP 429). Try again shortly.";
      }
      if (status !== null) {
        return `The AI service returned an error (HTTP ${status}).`;
      }
      return 'The AI service returned an error. Try again in a moment.';
    case 'empty':
      return 'The AI responded with nothing usable. Try again.';
    case 'timeout':
      return 'The request timed out before getting a response. Try again.';
    case 'network_error':
      return 'The request never reached the AI service — a browser extension, ad blocker, or the network could be blocking it.';
    case 'invalid_response':
      return "The AI responded, but not in a form counsel could use. Try rephrasing what you're asking for.";
    default:
      return 'Counsel could not be reached.';
  }
}

export function DraftingDesk() {
  const { game, dispatch } = useGame();
  const [description, setDescription] = useState('');
  const [magnitude, setMagnitude] = useState<BillMagnitude>('major');
  const [stage, setStage] = useState<Stage>({ at: 'idle' });

  if (!game) return null;

  const own = game.bills.filter(
    (b) => b.drafted && (b.status === 'available' || b.status === 'proposed'),
  );
  const atLimit = own.length >= DRAFT_BILL_LIMIT;
  const affordable = game.politicalCapital >= DRAFT_BILL_PC_COST;
  const longEnough = description.trim().length >= 12;

  /* Priced here exactly as the engine will price it, so the preview is the
     bill rather than an advertisement for it. */
  const preview =
    stage.at === 'ready'
      ? readDraft(stage.raw, 'preview', stage.description)
      : null;

  const send = async () => {
    setStage({ at: 'drafting' });
    const { draft, reason } = await draftBill(game, description.trim(), magnitude);
    if (!draft) {
      setStage({ at: 'unavailable', reason });
      return;
    }
    setStage({ at: 'ready', raw: draft, description: description.trim(), magnitude });
  };

  const file = async () => {
    if (stage.at !== 'ready') return;
    await dispatch({
      type: 'draft_bill',
      description: stage.description,
      draft: stage.raw,
    });
    setDescription('');
    setStage({ at: 'idle' });
  };

  return (
    <Panel
      title="Draft a bill"
      aside={`${own.length}/${DRAFT_BILL_LIMIT} on the paper`}
    >
      <p className="text-sm leading-relaxed text-ink-soft">
        Describe the law you want in your own words. Counsel will draft it in the terms this
        chamber understands, and will tell you what it had to change — a bill that asks for
        more than it gives up is cut back before it reaches the order paper, the same way a
        bill anybody else wrote would be.
      </p>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-faint" htmlFor="draft-request">
        What should it do?
      </label>
      <textarea
        id="draft-request"
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          if (stage.at !== 'idle') setStage({ at: 'idle' });
        }}
        rows={3}
        maxLength={600}
        placeholder="Free school meals for every primary pupil, paid for by ending the reduced rate on private tuition."
        className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-sm leading-relaxed text-ink"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="label text-ink-faint">Size</span>
        {(['minor', 'major'] as BillMagnitude[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMagnitude(option)}
            aria-pressed={magnitude === option}
            className={`border px-2 py-1 text-xs capitalize ${
              magnitude === option
                ? 'border-ink bg-ink text-paper'
                : 'border-rule bg-paper text-ink hover:border-ink'
            }`}
          >
            {option}
          </button>
        ))}
        <span className="text-xs text-ink-faint">
          A major bill may move approval by {ENVELOPE[magnitude].approval} points and spend up
          to ₡{ENVELOPE[magnitude].treasury}bn. Nothing it asks for beyond that is honoured.
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={!longEnough || atLimit || !affordable || stage.at === 'drafting'}
          onClick={() => void send()}
        >
          {stage.at === 'drafting' ? 'Counsel is drafting…' : 'Send to counsel'}
        </Button>
        {stage.at === 'ready' && (
          <Button variant="quiet" onClick={() => setStage({ at: 'idle' })}>
            Start again
          </Button>
        )}
      </div>

      {atLimit && (
        <p className="mt-2 text-xs text-ink-faint">
          There are already {DRAFT_BILL_LIMIT} bills of this government&rsquo;s own before the
          chamber. Get one of them through, or withdraw it.
        </p>
      )}
      {!affordable && !atLimit && (
        <p className="mt-2 text-xs text-ink-faint">
          Drafting costs {DRAFT_BILL_PC_COST} PC before the bill is tabled, and tabling costs
          again. Somebody has to write it.
        </p>
      )}

      {stage.at === 'unavailable' && (
        <EmptyNote>
          {describeUnavailable(stage.reason)} Every other way of passing a law is unaffected —
          the order paper is where it was.
        </EmptyNote>
      )}

      {preview && (
        <div className="mt-4 border-t border-rule pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-serif text-base font-semibold text-ink">
              {preview.bill.title}
            </h4>
            <span className="flex items-center gap-1.5">
              <Tag>{BILL_CATEGORY_LABELS[preview.bill.category]}</Tag>
              <Tag tone={preview.bill.magnitude === 'major' ? 'brass' : undefined}>
                {preview.bill.magnitude}
              </Tag>
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {preview.bill.summary}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-faint">
            {preview.bill.tradeoff}
          </p>

          <div className="mt-3">
            <EffectSummary effects={preview.bill.effects} />
          </div>

          <p className="mt-2 text-xs italic text-ink-faint">{describeDraft(preview.bill)}</p>

          {preview.notes.length > 0 && (
            <div className="mt-3 border border-rule bg-paper-sunk px-2.5 py-2">
              <span className="label text-ink-faint">What counsel changed</span>
              <ul className="mt-1 space-y-1 text-xs leading-relaxed text-ink-soft">
                {preview.notes.map((note) => (
                  <li key={note}>— {note}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3">
            <Button variant="primary" onClick={() => void file()}>
              File it · {DRAFT_BILL_PC_COST} PC
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
