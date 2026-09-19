/**
 * globalEvents.ts — the world is not about you.
 *
 * Most of what happens in the world has nothing to do with Verdana. A
 * harvest fails two continents away, a central bank somewhere else raises
 * rates, two countries who have never mentioned this one go to war. None of
 * it was aimed here and all of it arrives here, and the player's job is not
 * to prevent any of it — it is to notice which parts reach them and how.
 *
 * So every event in this file is written from the outside in. The headline
 * is about somewhere else. The effects run through channels that already
 * exist — the economy's shock list, the trade book, world tension, the
 * demography's migration figure — rather than through bespoke modifiers,
 * because an event that needs its own machinery is an event that will not
 * interact with anything.
 *
 * And most of them offer no response at all. A government that could act on
 * everything would be governing a world that revolved around it, which is
 * the fantasy this engine is specifically trying not to sell.
 */

import type { NationKey } from './nations.ts';

export type GlobalEventKind =
  | 'commodity'
  | 'financial'
  | 'pandemic'
  | 'conflict'
  | 'upheaval'
  | 'climate'
  | 'technology'
  | 'migration';

export interface GlobalEventTemplate {
  key: string;
  kind: GlobalEventKind;
  /** The headline, which is about somewhere else. */
  headline: string;
  /** What actually happened, in the terms the world would use. */
  body: string;
  /** How it reaches here, said plainly, because the player has to learn this. */
  transmission: string;
  /** How often it can happen, relative to the others. */
  weight: number;
  /** How long the effects last, in weeks. */
  weeks: number;
  effects: {
    /** Points off annual growth while it runs. */
    growth?: number;
    /** Points on annual inflation while it runs. */
    inflation?: number;
    /** Points on world tension. */
    tension?: number;
    /** Multiplier on trade flows while it runs. */
    trade?: number;
    /** Net migration, per thousand per year, while it runs. */
    migration?: number;
    /** Points off the health sector while it runs. */
    health?: number;
    /** Points on productivity's target, permanently. */
    productivity?: number;
  };
  /**
   * What a government can do about it, if anything.
   *
   * Most of these are null, deliberately. A government that could act on
   * everything would be governing a world that revolved around it.
   */
  response: { label: string; cost: number; blurb: string } | null;
}

export const GLOBAL_EVENT_TEMPLATES: GlobalEventTemplate[] = [
  {
    key: 'oil_shock',
    kind: 'commodity',
    headline: 'Energy prices double after a producers’ agreement',
    body:
      'Six countries that between them sell most of the world’s crude have agreed to sell less of it. None of them is Verdana, none of them consulted anybody, and the price moved before the communiqué was finished.',
    transmission:
      'It arrives at every petrol station and in every delivery cost within a month, which makes it an inflation problem before it is an energy problem.',
    weight: 1.0,
    weeks: 40,
    effects: { inflation: 2.6, growth: -0.9, tension: 5 },
    response: {
      label: 'Release the strategic reserve',
      cost: 14,
      blurb:
        'Weeks of supply, released into a market that will notice and price it in. It buys time rather than a solution, and the reserve is then not there.',
    },
  },
  {
    key: 'foreign_banking_crisis',
    kind: 'financial',
    headline: 'A banking system fails somewhere else',
    body:
      'A lender nobody here had heard of turned out to be holding what several lenders here are also holding. The phrase being used is "contained", by people who have used it before.',
    transmission:
      'Through credit. Nothing physical changes; borrowing simply becomes harder for everybody at once, and investment is the first thing to notice.',
    weight: 0.8,
    weeks: 34,
    effects: { growth: -1.8, tension: 3 },
    response: {
      label: 'Guarantee deposits',
      cost: 22,
      blurb:
        'It stops the run. It also tells every bank in the country what happens if they get this wrong, which is a lesson they will remember in the wrong direction.',
    },
  },
  {
    key: 'pandemic',
    kind: 'pandemic',
    headline: 'A new respiratory illness, spreading',
    body:
      'It began somewhere with a functioning health system and a slow reporting chain. It is already in nine countries, and the figure being argued about is how many of the cases are being counted.',
    transmission:
      'Through everything at once — the hospitals first, then the workforce, then every business that needs people in a room together.',
    weight: 0.35,
    weeks: 78,
    effects: { growth: -2.4, health: -14, migration: -1.2, tension: 2 },
    response: {
      label: 'Close the borders',
      cost: 26,
      blurb:
        'It buys weeks rather than immunity, it costs the trade the country lives on, and every government that has done it has been criticised both for doing it and for not doing it sooner.',
    },
  },
  {
    key: 'foreign_war',
    kind: 'conflict',
    headline: 'Two countries have gone to war, and neither is this one',
    body:
      'A border that has been argued about for sixty years is now being fought over. Nobody involved has asked Verdana for anything, which will not last.',
    transmission:
      'Through the price of everything they both export, through the shipping that used to go past them, and through every alliance that touches either of them.',
    weight: 0.9,
    weeks: 60,
    effects: { tension: 16, trade: 0.92, inflation: 1.1, migration: 1.8 },
    response: null,
  },
  {
    key: 'coup',
    kind: 'upheaval',
    headline: 'A government has been removed overnight',
    body:
      'The army is on the state broadcaster and the previous administration is described as having resigned. Every embassy in the capital is writing the same cable with a different verb in it.',
    transmission:
      'Through recognition, which is a decision rather than an observation, and through every agreement the previous government signed.',
    weight: 0.7,
    weeks: 26,
    effects: { tension: 9, trade: 0.97 },
    response: {
      label: 'Recognise the new government',
      cost: 12,
      blurb:
        'Early recognition buys influence with people who will remember it. It also says something about this country that other people will remember for longer.',
    },
  },
  {
    key: 'drought',
    kind: 'climate',
    headline: 'A failed harvest across three exporting countries',
    body:
      'The same weather system sat over the same three breadbaskets for the same eleven weeks. The yield figures are not in dispute; what they mean for the price is.',
    transmission:
      'Through food, which is the part of inflation that everybody notices and nobody can substitute away from.',
    weight: 0.85,
    weeks: 46,
    effects: { inflation: 1.9, migration: 1.1, tension: 4 },
    response: null,
  },
  {
    key: 'flooding',
    kind: 'climate',
    headline: 'Record flooding somewhere that had not planned for it',
    body:
      'A river that has a hundred-year flood level reached it for the third time in a decade. The sentence "once in a century" is being retired quietly.',
    transmission:
      'Through insurance, reconstruction demand and a long argument at home about whether this country is any better prepared.',
    weight: 0.7,
    weeks: 30,
    effects: { growth: -0.4, tension: 2 },
    response: null,
  },
  {
    key: 'technology_shift',
    kind: 'technology',
    headline: 'A process nobody here invented has made an industry cheaper',
    body:
      'It was published, it works, and it halves the cost of something this country makes. Every competitor has read the same paper.',
    transmission:
      'Through productivity, permanently and unevenly: whoever adopts it first is more productive and whoever employed the people it replaces is not.',
    weight: 0.8,
    weeks: 52,
    effects: { productivity: 1.6, growth: 0.5 },
    response: {
      label: 'Fund adoption',
      cost: 16,
      blurb:
        'Public money to get it into firms faster. Whether that is industrial strategy or subsidising what would have happened anyway is the argument, and both sides are partly right.',
    },
  },
  {
    key: 'refugee_movement',
    kind: 'migration',
    headline: 'A large movement of people, arriving',
    body:
      'They are leaving somewhere that has become impossible and arriving wherever will have them. The number is not knowable and every number being published is wrong.',
    transmission:
      'Through the ports, the housing, the schools and an argument that will outlast the movement by a decade.',
    weight: 0.75,
    weeks: 60,
    effects: { migration: 3.4, growth: 0.3, tension: 3 },
    response: {
      label: 'Establish a reception programme',
      cost: 18,
      blurb:
        'Housing, processing and language teaching. Expensive, effective, and precisely the thing an opposition will cost out in front of a camera.',
    },
  },
  {
    key: 'sovereign_default',
    kind: 'financial',
    headline: 'A government somewhere else has stopped paying',
    body:
      'The finance ministry statement runs to four paragraphs and the word "restructuring" appears in the third. Every holder of that paper is now working out what else they hold.',
    transmission:
      'Through the price of risk. Nothing about this country changed, and this country now borrows more expensively.',
    weight: 0.65,
    weeks: 36,
    effects: { growth: -0.7, tension: 4 },
    response: null,
  },
  {
    key: 'shipping_disruption',
    kind: 'conflict',
    headline: 'A strait is closed',
    body:
      'Nobody has called it a blockade. Ships are going the long way round, which adds eleven days and a great deal of fuel to a route most of the world depends on.',
    transmission:
      'Through every imported thing, arriving later and costing more, and through the insurance that decides whether anything sails at all.',
    weight: 0.7,
    weeks: 28,
    effects: { trade: 0.88, inflation: 1.4, tension: 8 },
    response: null,
  },
  {
    key: 'trade_bloc',
    kind: 'technology',
    headline: 'A trading bloc has been formed without this country in it',
    body:
      'Six economies have agreed terms with each other that they have not offered anybody else. The announcement was polite about Verdana and did not mention it.',
    transmission:
      'Through every exporter who now competes on worse terms than a competitor who did nothing differently.',
    weight: 0.6,
    weeks: 104,
    effects: { trade: 0.94, growth: -0.4 },
    response: {
      label: 'Seek accession talks',
      cost: 20,
      blurb:
        'Years of negotiation for terms somebody else wrote. It is very often the right thing to do and it is never a popular sentence to say out loud.',
    },
  },
];

export function findGlobalEvent(key: string): GlobalEventTemplate {
  const found = GLOBAL_EVENT_TEMPLATES.find((e) => e.key === key);
  if (!found) throw new Error(`globalEvents: unknown event ${key}`);
  return found;
}

export const GLOBAL_KIND_LABELS: Record<GlobalEventKind, string> = {
  commodity: 'Commodities',
  financial: 'Finance',
  pandemic: 'Public health',
  conflict: 'Conflict',
  upheaval: 'Upheaval',
  climate: 'Climate',
  technology: 'Technology',
  migration: 'Movement of people',
};

export type { NationKey };
