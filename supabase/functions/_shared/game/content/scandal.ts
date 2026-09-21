/**
 * scandal.ts — what happens after the story breaks.
 *
 * THE COVER-UP COSTS MORE THAN THE CRIME, BUT ONLY IF IT'S FOUND. Denial
 * is a real bet, not a mistake dressed up as one: most denied stories
 * that do not immediately confirm simply fade, cheaply, because most
 * scandals do not have a second document behind them. The ones that do
 * cost far more once found under a denial than the same fact would have
 * cost admitted on day one — which is the entire, accurate reason
 * governments keep taking the bet anyway. Admitting caps the damage at
 * a known, moderate price immediately. Investigating is the slow,
 * honest middle: it costs more than a denial that works and less than
 * one that doesn't, and it is the only response that reliably brings
 * the risk down rather than leaving it to be found or not.
 */

/** What the government has said about a scandal, if anything. */
export type ScandalResponse = 'admit' | 'deny' | 'investigate';

export interface ResponseTemplate {
  key: ScandalResponse;
  label: string;
  blurb: string;
  /** Immediate approval cost of choosing this response. */
  immediateCost: number;
  /** What it does to the risk of the story getting worse, 0–1 multiplier applied to the current risk. */
  riskMultiplier: number;
}

export const SCANDAL_RESPONSES: ResponseTemplate[] = [
  {
    key: 'admit',
    label: 'Admit it',
    blurb: 'Say what happened before anyone else does. Costs the most today and the least afterwards.',
    immediateCost: 4,
    riskMultiplier: 0,
  },
  {
    key: 'deny',
    label: 'Deny it',
    blurb: 'Say it did not happen, or did not happen like that. Cheap this week. A real bet on there being nothing else to find.',
    immediateCost: 0.5,
    riskMultiplier: 1,
  },
  {
    key: 'investigate',
    label: 'Order an investigation',
    blurb: 'Neither confirm nor deny — commit to finding out. Slower and more expensive than a denial that works, cheaper than one that does not.',
    immediateCost: 1.5,
    riskMultiplier: 0.4,
  },
];

export function findResponse(key: ScandalResponse): ResponseTemplate {
  return SCANDAL_RESPONSES.find((r) => r.key === key) ?? SCANDAL_RESPONSES[1]!;
}

/** What kind of story it is, for the record. */
export type ScandalCause = 'leak' | 'corruption';

export const SCANDAL_CAUSE_LABELS: Record<ScandalCause, string> = {
  leak: 'A leak',
  corruption: 'A corruption story',
};
