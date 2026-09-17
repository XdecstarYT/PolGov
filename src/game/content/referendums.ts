/**
 * referendums.ts — questions a government can put to the country.
 *
 * Each is written so that both answers are defensible. A referendum in this
 * game is a genuine gamble: the electorate model decides it, the government
 * does not control the result, and losing one you called yourself is worse
 * than never having asked.
 */

import type { Effects, Ideology } from '../types.ts';
import { makeIdeology } from '../ideology.ts';

export interface ReferendumTemplate {
  id: string;
  question: string;
  /** The politics of a Yes. */
  ideology: Ideology;
  effects: Effects;
  /** The case against, stated as plainly as the case for. */
  tradeoff: string;
}

export const REFERENDUM_TEMPLATES: ReferendumTemplate[] = [
  {
    id: 'fiscal-rule',
    question: 'Should the state be bound by law to balance its budget over each five-year period?',
    ideology: makeIdeology(0.55, -0.1, -0.1),
    effects: { revenueDelta: 3, approval: -1 },
    tradeoff:
      'Binds every future government to the same discipline — including the ones that need to borrow in a crisis.',
  },
  {
    id: 'carbon-mandate',
    question: 'Should emissions targets be written into law with binding annual limits?',
    ideology: makeIdeology(-0.2, 0.1, 0.85),
    effects: { sectorDeltas: { environment: 7, economy: -3 } },
    tradeoff:
      'Removes the question from politics permanently, and removes the flexibility to slow down when the cost lands badly.',
  },
  {
    id: 'devolution',
    question: 'Should the outer regions be granted their own taxing and spending powers?',
    ideology: makeIdeology(0.15, 0.35, 0.05),
    effects: { revenueDelta: -4, approval: 2, sectorDeltas: { infrastructure: 3 } },
    tradeoff:
      'Decisions land closer to the people affected, and the centre loses both the money and the leverage.',
  },
  {
    id: 'voting-age',
    question: 'Should the voting age be lowered?',
    ideology: makeIdeology(-0.15, 0.6, 0.3),
    effects: { approval: 1 },
    tradeoff:
      'Widens the franchise, and changes who every future government has to please — permanently, and not necessarily in your favour.',
  },
  {
    id: 'upper-house',
    question: 'Should the Senate lose its power to block legislation?',
    ideology: makeIdeology(0, 0.25, 0),
    effects: { politicalCapital: 14 },
    tradeoff:
      'Lets a government govern, and removes the only check that survives a landslide. You will not always be the government.',
  },
  {
    id: 'resource-fund',
    question: 'Should resource revenues be placed in a sovereign fund closed to ordinary spending?',
    ideology: makeIdeology(0.2, 0, 0.3),
    effects: { revenueDelta: -3, debt: -40 },
    tradeoff:
      'Protects the windfall from being frittered away, and locks it away from the services that need it now.',
  },
];
