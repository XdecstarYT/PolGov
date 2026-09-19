/**
 * personas.ts — the people, all of whom are invented.
 *
 * The countries in this game are real. Nobody in them is.
 *
 * That is the line, and this file is where it is held. A run needs named
 * people — a leader of the opposition who has said things before and will
 * be held to them, a columnist with a known disposition, a coalition
 * partner whose temper the player learns — and every one of them is
 * assembled here out of invented parts.
 *
 * ON THE NAMES
 *
 * They are built from syllables, by region, so that a chamber in Warsaw
 * does not read like a chamber in Wellington. They are not real names of
 * real people and they are not drawn from any list of them. With a few
 * hundred combinations in play some will inevitably resemble somebody
 * alive, the way invented names in any novel do; nothing here is about
 * that person, and the game says so wherever a name appears.
 *
 * ON WHAT THEY ARE FOR
 *
 * A game where the opposition is "the opposition" is a game where losing a
 * vote is arithmetic. A game where it is a named person with a temperament,
 * a prior career and a record of what they have already said is a game
 * where losing a vote is a relationship. The second is the one worth
 * building, and it costs a file of invented syllables.
 */

import type { WorldRegion } from './world/countries.ts';

/* ------------------------------------------------------------------ *
 * Names
 * ------------------------------------------------------------------ */

interface NameBank {
  given: string[];
  family: string[];
}

/**
 * Invented syllable sets, arranged by region so a name reads as belonging
 * somewhere. None of these is a real person's name and none is drawn from
 * a list of them.
 */
const NAMES: Record<WorldRegion, NameBank> = {
  north_america: {
    given: ['Marla', 'Dexter', 'Corin', 'Halden', 'Royce', 'Tamsin', 'Everett', 'Sable', 'Bram', 'Odell'],
    family: ['Quillard', 'Bexley', 'Marrowe', 'Haskin', 'Verrity', 'Dunmow', 'Prescot', 'Aldney', 'Corvish', 'Tarrant'],
  },
  south_america: {
    given: ['Nerio', 'Ysolde', 'Rafael', 'Marisol', 'Teodor', 'Anselma', 'Ciro', 'Lucinda', 'Obed', 'Valeria'],
    family: ['Quintanar', 'Verdejo', 'Almiron', 'Castrilho', 'Paredón', 'Solanas', 'Iriarte', 'Mendoral', 'Zubieta', 'Carvalhal'],
  },
  western_europe: {
    given: ['Edda', 'Roswell', 'Mireille', 'Anselm', 'Brigit', 'Lorcan', 'Hesper', 'Theobald', 'Maren', 'Ivo'],
    family: ['Vandermeer', 'Ashgrove', 'Lindqvist', 'Beaumarche', 'Holtmann', 'Ravelli', 'Duquesne', 'Ostergaard', 'Carrowe', 'Weisshaupt'],
  },
  eastern_europe: {
    given: ['Zofia', 'Kazimir', 'Danuta', 'Marek', 'Ilonka', 'Bohdan', 'Wanda', 'Stepan', 'Ludmila', 'Tomasz'],
    family: ['Wrzesinska', 'Kowalenko', 'Brzezicki', 'Malinowicz', 'Zaleski', 'Dombrowa', 'Hrytsenko', 'Warchol', 'Lisiecka', 'Gorniak'],
  },
  middle_east: {
    given: ['Rania', 'Faris', 'Dalia', 'Nadim', 'Yasmin', 'Karim', 'Layan', 'Sami', 'Noor', 'Tarek'],
    family: ['Al-Numani', 'Haddadin', 'Barghouti', 'Sarraf', 'Qassemi', 'Nashashibi', 'Tabrizian', 'Mansouri', 'Kheirallah', 'Zaydoun'],
  },
  north_africa: {
    given: ['Amina', 'Idris', 'Selma', 'Hakim', 'Nadia', 'Younes', 'Farida', 'Bilal', 'Sanaa', 'Omar'],
    family: ['Ben Ayada', 'Chedli', 'Ghannouchi', 'Mokrani', 'Sebti', 'Ouazzani', 'Belkacem', 'Fahmawi', 'Tazi', 'Dridi'],
  },
  sub_saharan_africa: {
    given: ['Adaeze', 'Thabo', 'Chidinma', 'Kwame', 'Nomvula', 'Obiora', 'Zanele', 'Tendai', 'Folake', 'Jabari'],
    family: ['Okonjuwa', 'Nkemelu', 'Mabaso', 'Adeyemo', 'Chikwendu', 'Dlamini-Roux', 'Oyelaran', 'Mwangaza', 'Ndlela', 'Achebeyi'],
  },
  south_asia: {
    given: ['Aarti', 'Vikram', 'Meher', 'Ranjit', 'Sunila', 'Devendra', 'Ishani', 'Kabir', 'Parvati', 'Anand'],
    family: ['Raghunathan', 'Chaudhari', 'Venkatesh', 'Bhandarkar', 'Sengupta', 'Mirchandani', 'Thakurdas', 'Iyengarh', 'Deshmukhe', 'Narlikar'],
  },
  east_asia: {
    given: ['Hiroe', 'Kenta', 'Mizuki', 'Sora', 'Rina', 'Daichi', 'Yuna', 'Haruto', 'Seina', 'Kaito'],
    family: ['Kurosawano', 'Mitsuhara', 'Nagasakae', 'Ishibayashi', 'Takamorio', 'Hoshizaki', 'Fujiwarano', 'Amagiri', 'Sakuranobe', 'Yamashiro'],
  },
  southeast_asia: {
    given: ['Intan', 'Rizal', 'Maya', 'Bayu', 'Sari', 'Thanh', 'Linh', 'Arif', 'Dewi', 'Nguyet'],
    family: ['Wijayanto', 'Sasongko', 'Hartadi', 'Purnomoaji', 'Nguyen-Vo', 'Suryaningrat', 'Tanuwijaya', 'Pramudita', 'Halimanto', 'Setiabudi'],
  },
  oceania: {
    given: ['Marlowe', 'Keira', 'Fletcher', 'Talia', 'Jarrah', 'Piper', 'Ruaridh', 'Sienna', 'Callum', 'Tamar'],
    family: ['Warrimoo', 'Kellaway', 'Braithwood', 'Tarakena', 'Millbourne', 'Waverleigh', 'Kaikoro', 'Fennimore', 'Oakhurst', 'Nguyen-Hale'],
  },
  nowhere: {
    given: ['Isolde', 'Rafe', 'Cordelia', 'Ambrose', 'Winifred', 'Gideon', 'Perdita', 'Caspar', 'Rosalind', 'Alaric'],
    family: ['Vandermeer', 'Ashgrove', 'Halloway', 'Ternbury', 'Estmoor', 'Caldwick', 'Ravensmere', 'Thornleigh', 'Marchbank', 'Stellingworth'],
  },
};

export function nameBankFor(region: WorldRegion): NameBank {
  return NAMES[region] ?? NAMES.nowhere;
}

/* ------------------------------------------------------------------ *
 * Temperament
 * ------------------------------------------------------------------ */

/**
 * How somebody argues, which is not the same as what they believe.
 *
 * Two leaders with identical positions and different temperaments are
 * different problems, and a player learns to handle each of them. This is
 * the part that makes the opposition a relationship rather than a number.
 */
export type Temperament =
  | 'forensic'
  | 'pugnacious'
  | 'emollient'
  | 'ideological'
  | 'ambitious'
  | 'weary'
  | 'theatrical'
  | 'dogged';

export const TEMPERAMENT_LABELS: Record<Temperament, string> = {
  forensic: 'Forensic',
  pugnacious: 'Pugnacious',
  emollient: 'Emollient',
  ideological: 'Ideological',
  ambitious: 'Ambitious',
  weary: 'Weary',
  theatrical: 'Theatrical',
  dogged: 'Dogged',
};

export const TEMPERAMENT_BLURBS: Record<Temperament, string> = {
  forensic:
    'Reads the annexes. Attacks on a figure nobody expected them to have found, and is usually right about it.',
  pugnacious:
    'Goes for the person rather than the policy, which works until it does not and then stops working entirely.',
  emollient:
    'Reasonable in public and immovable in private. The hardest kind to be seen falling out with.',
  ideological:
    'Argues from first principles and will lose a winnable vote rather than concede one. Predictable, and therefore useful.',
  ambitious:
    'Positioning for the job after this one. Will support the government when it helps them and not a moment longer.',
  weary:
    'Has seen four of these. Lands the line about how this was tried before, because it usually was.',
  theatrical:
    'Plays to the gallery and to the clip. Wrong often enough to survive being right occasionally.',
  dogged:
    'Has one subject and will not be moved off it, for years, until something finally happens about it.',
};

/** How much a temperament's standing moves on any given week. */
export const TEMPERAMENT_VOLATILITY: Record<Temperament, number> = {
  forensic: 0.8,
  pugnacious: 1.4,
  emollient: 0.6,
  ideological: 0.5,
  ambitious: 1.2,
  weary: 0.7,
  theatrical: 1.5,
  dogged: 0.4,
};

export const TEMPERAMENTS: Temperament[] = Object.keys(TEMPERAMENT_LABELS) as Temperament[];

/* ------------------------------------------------------------------ *
 * Where they came from
 * ------------------------------------------------------------------ */

/**
 * The prior career, which decides what they notice.
 *
 * A former auditor spots a missing line in the budget; a former nurse
 * spots a staffing figure. It is one string, and it does more for how a
 * person reads than a paragraph of description would.
 */
export const BACKGROUNDS: string[] = [
  'a public auditor, and still reads the accounts first',
  'a hospital consultant who came late to politics and has never stopped saying so',
  'a trade union organiser from a plant that closed',
  'a barrister, which shows in every question',
  'a schoolteacher for twenty years, and counts everything in class sizes',
  'a farmer, and the only member who has met the people the subsidies are for',
  'a local mayor who ran something before arguing about it',
  'a career official who crossed the floor into elected politics',
  'a small employer who still signs the payroll on Fridays',
  'an academic economist, which is a liability and an asset in the same sentence',
  'a soldier, and unsentimental about what force can and cannot do',
  'a journalist, who knows exactly which paragraph will be quoted',
];

/* ------------------------------------------------------------------ *
 * The press
 * ------------------------------------------------------------------ */

/**
 * How an outlet reads the government.
 *
 * Disposition is not agreement: a hostile paper still reports what
 * happened, and a loyal one still notices when something has gone wrong.
 * What it changes is which paragraph goes first.
 */
export type Disposition =
  | 'institutional'
  | 'hostile'
  | 'loyal'
  | 'sceptical'
  | 'populist'
  | 'commercial';

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  institutional: 'Institutional',
  hostile: 'Hostile',
  loyal: 'Supportive',
  sceptical: 'Sceptical',
  populist: 'Populist',
  commercial: 'Commercial',
};

export const DISPOSITION_BLURBS: Record<Disposition, string> = {
  institutional:
    'Believes in the process more than in any government. Will defend an unpopular decision taken properly and savage a popular one taken badly.',
  hostile:
    'Decided about this government some time ago and files accordingly. Still gets things right, which is what makes it a problem.',
  loyal:
    'Gives the government the benefit of the doubt for as long as that is tenable, and turns hard when it is not.',
  sceptical:
    'Assumes the announcement and the delivery are different documents, and goes looking for the second one.',
  populist:
    'Interested in what a decision does to a household this month, and uninterested in the ten-year case for it.',
  commercial:
    'Reads everything as a market signal. Bored by process, unforgiving about the deficit.',
};

/** How much weight this outlet's line carries, as a multiplier on reach. */
export const DISPOSITION_WEIGHT: Record<Disposition, number> = {
  institutional: 1.15,
  hostile: 1.0,
  loyal: 0.85,
  sceptical: 1.05,
  populist: 1.2,
  commercial: 0.9,
};

export const DISPOSITIONS: Disposition[] = Object.keys(DISPOSITION_LABELS) as Disposition[];

/** The beat a columnist writes to. Decides what they open on. */
export const BEATS: string[] = [
  'the public finances',
  'the health service',
  'schools and skills',
  'the chamber itself',
  'the regions',
  'foreign affairs',
  'work and wages',
  'the environment',
];

/**
 * Mastheads, assembled rather than listed.
 *
 * Two halves and a register, so a country gets its own papers without
 * anybody writing a masthead for every country — and so no masthead here
 * is the name of a publication that exists.
 */
export const MASTHEAD_FIRST: string[] = [
  'The Daily',
  'The Morning',
  'The Evening',
  'The National',
  'The Weekly',
  'The Independent',
  'The New',
];

export const MASTHEAD_SECOND: string[] = [
  'Chronicle',
  'Ledger',
  'Dispatch',
  'Standard',
  'Observer',
  'Register',
  'Herald',
  'Gazette',
  'Bulletin',
  'Inquirer',
];

export type Register = 'broadsheet' | 'tabloid' | 'trade' | 'regional' | 'broadcast';

export const REGISTER_LABELS: Record<Register, string> = {
  broadsheet: 'Broadsheet',
  tabloid: 'Tabloid',
  trade: 'Trade press',
  regional: 'Regional',
  broadcast: 'Broadcast',
};
