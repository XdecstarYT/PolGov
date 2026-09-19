/**
 * budgetProcess.ts — the most important vote a government takes.
 *
 * Every other decision in this game is optional. A bill can be dropped, an
 * event can be ignored, a treaty can wait. The budget cannot: it has to be
 * written, it has to be fought over in cabinet, it has to be put to the
 * chamber, and it has to pass. A government that cannot pass a budget is not
 * a government having a difficult week; it is one that has run out of the
 * thing that makes it a government.
 *
 * So the whole system is built to make losing it possible. Four mechanisms
 * do that, and each one is a real feature of real budgets:
 *
 *   MINISTRIES ARE HELD BY PEOPLE. Every service sits under a ministry, and
 *   a ministry is held by a party. Cutting the health budget is not moving a
 *   slider any more; it is telling a coalition partner's Health Secretary
 *   that their department is being reduced, and they take it personally in
 *   a way that reaches coalition mood and then the division list.
 *
 *   BACKBENCHERS VOTE, NOT PARTIES. A partner whose ministry was cut hard
 *   votes for the budget — they are in the government. Their backbenchers do
 *   not, and that is where budgets are actually lost.
 *
 *   MOST OF IT IS NOT A DECISION. Pensions, welfare and disability are
 *   statutory: paid whether or not a budget passes, because they are law
 *   rather than appropriation. That is the single most important fact about
 *   public finance and almost no game says it. The argument is always about
 *   the remaining fifth.
 *
 *   NOTHING MOVES FAR IN ONE YEAR. Staff are on contracts, buildings are
 *   leased, and a minister told to find forty per cent resigns. A government
 *   that wants to change the shape of the state has to win twice.
 */

import {
  BUDGET_MAX_CUT,
  BUDGET_MAX_RISE,
  CAPITAL_COMMITMENT_YEARS,
  MINISTRY_CUT_MOOD,
  MINISTRY_REBELLION_PER_POINT,
  MINISTRY_RISE_MOOD,
  SECTOR_BASELINE_FUNDING,
  STATUTORY_SERVICES,
  SUPPLY_DISTANCE_COST,
  SUPPLY_PC_BASE,
  SUPPLY_PC_PER_SEAT,
  TURNS_PER_YEAR,
} from '../balance.ts';
import type { Rng } from '../rng.ts';
import {
  MINISTRY_TEMPLATES,
  findMinistry,
  ministryFor,
  type MinistryKey,
  type MinistryTemplate,
} from '../content/ministries.ts';
import {
  SERVICE_TEMPLATES,
  findService,
  type ServiceKey,
} from '../content/services.ts';
import { allocateToServices, serviceDemand } from './services.ts';
import type {
  Budget,
  BudgetLine,
  Demography,
  Economy,
  MinistryState,
  Party,
  Sector,
  SectorKey,
} from '../types.ts';


const STATUTORY = new Set<string>(STATUTORY_SERVICES);

/** Is this line paid whether or not a budget passes? */
export function isStatutory(service: ServiceKey): boolean {
  return STATUTORY.has(service);
}

/* ------------------------------------------------------------------ *
 * Building the first budget
 * ------------------------------------------------------------------ */

/**
 * The budget a new government inherits.
 *
 * Every line set to what the previous government was spending, which is what
 * every new government actually starts from. Nobody arrives with a blank
 * sheet; they arrive with somebody else's budget and a manifesto that
 * contradicts it.
 */
export function buildBudget(sectors: readonly Sector[], turn = 0): Budget {
  const allocations: Record<string, number> = {};
  for (const sector of sectors) {
    Object.assign(allocations, allocateToServices(sector.key, sector.funding));
  }

  const lines: BudgetLine[] = SERVICE_TEMPLATES.map((template) => {
    const enacted = allocations[template.key] ?? 0;
    return {
      service: template.key,
      enacted,
      proposed: enacted,
      capitalShare: ministryFor(template.key).capitalShare,
      committedYears: 0,
    };
  });

  return {
    /*
     * Year zero, enacted on turn zero: the previous government's budget,
     * passed before the player arrived. It funds the state until the
     * deadline and no longer, so the first budget of the term is the
     * player's to pass — which is the position a new government is in.
     */
    year: 0,
    stage: 'enacted',
    lines,
    ministries: MINISTRY_TEMPLATES.map((template) => ({
      key: template.key,
      heldBy: null,
      demand: 1,
    })),
    division: null,
    defeats: 0,
    supply: [],
    enactedTurn: turn,
  };
}

/* ------------------------------------------------------------------ *
 * Reading the budget
 * ------------------------------------------------------------------ */

export function lineFor(budget: Budget, service: ServiceKey): BudgetLine {
  const found = budget.lines.find((l) => l.service === service);
  if (!found) throw new Error(`budget: no line for ${service}`);
  return found;
}

/** Everything the budget proposes, ₡bn a year. */
export function proposedTotal(budget: Budget): number {
  return budget.lines.reduce((sum, l) => sum + l.proposed, 0);
}

/** Everything currently being spent, ₡bn a year. */
export function enactedTotal(budget: Budget): number {
  return budget.lines.reduce((sum, l) => sum + l.enacted, 0);
}

/** The part of the budget that is actually a decision, ₡bn a year. */
export function discretionaryTotal(budget: Budget): number {
  return budget.lines
    .filter((l) => !isStatutory(l.service))
    .reduce((sum, l) => sum + l.proposed, 0);
}

/** The part paid whether or not anybody votes for it, ₡bn a year. */
export function statutoryTotal(budget: Budget): number {
  return budget.lines
    .filter((l) => isStatutory(l.service))
    .reduce((sum, l) => sum + l.proposed, 0);
}

/** Capital spending across the whole budget, ₡bn a year. */
export function capitalTotal(budget: Budget): number {
  return budget.lines.reduce((sum, l) => sum + l.proposed * l.capitalShare, 0);
}

/** A ministry's total, as proposed and as enacted. */
export function ministryTotals(
  budget: Budget,
  key: MinistryKey,
): { proposed: number; enacted: number; change: number } {
  const template = findMinistry(key);
  let proposed = 0;
  let enacted = 0;
  for (const service of template.services) {
    const line = lineFor(budget, service);
    proposed += line.proposed;
    enacted += line.enacted;
  }
  return { proposed, enacted, change: enacted > 0 ? (proposed - enacted) / enacted : 0 };
}

/** The furthest a line may be moved in one budget. */
export function lineBounds(line: BudgetLine): { min: number; max: number } {
  if (isStatutory(line.service)) {
    /* Not an appropriation. A pension is a promise in law to everyone who
       qualifies, so the figure is a headcount multiplied by a rate, and the
       only way to change it is to change the law. The budget cannot touch
       it, which is why it is the part that grows. */
    return { min: line.enacted, max: line.enacted };
  }
  if (line.committedYears > 0) {
    /* Contracted. The money is already spent in everything but fact. */
    return { min: line.enacted, max: line.enacted * (1 + BUDGET_MAX_RISE) };
  }
  return {
    min: line.enacted * (1 - BUDGET_MAX_CUT),
    max: line.enacted * (1 + BUDGET_MAX_RISE),
  };
}

/* ------------------------------------------------------------------ *
 * Ministries
 * ------------------------------------------------------------------ */

/**
 * Hand out the portfolios.
 *
 * Shares are proportional to the seats each party brings to the government,
 * which is not a simplification: portfolio allocation tracking seat share
 * almost one-for-one is one of the most robust findings in the study of
 * coalitions, and it holds across parliaments that agree on nothing else.
 * What was negotiated in Engine 1 still binds — a partner cannot hold more
 * departments than the cabinet posts they extracted — but it caps their
 * share rather than setting it, so a small party cannot walk off with the
 * state because it asked first.
 *
 * Seats are counted by the highest-averages method, the same one that turns
 * votes into seats elsewhere in this engine. Within its entitlement each
 * party takes the departments closest to the axis it campaigns on, largest
 * party choosing first. Whatever is left answers to the governing party,
 * which is what a null holder means.
 */
export function assignMinistries(
  ministries: readonly MinistryState[],
  parties: readonly Party[],
): MinistryState[] {
  const partners = parties.filter((p) => p.inCoalition && !p.isPlayer && p.cabinetPosts > 0);
  const player = parties.find((p) => p.isPlayer);

  /* The governing party is in the division too: it holds the departments
     nobody else is entitled to, and its own seats are what entitle it. */
  const claims = new Map<string, { seats: number; cap: number; taken: number }>();
  for (const partner of partners) {
    claims.set(partner.id, { seats: partner.seats, cap: partner.cabinetPosts, taken: 0 });
  }

  const seatsInGovernment =
    (player?.seats ?? 0) + partners.reduce((sum, p) => sum + p.seats, 0);

  const entitlement = new Map<string, number>();
  if (seatsInGovernment > 0) {
    /* Highest averages, run over the departments rather than the seats. The
       governing party is included so that partners get their share of the
       cabinet and not the whole of it. */
    const divisors = new Map<string, number>([[player?.id ?? 'player', 1]]);
    for (const partner of partners) divisors.set(partner.id, 1);

    for (let seat = 0; seat < MINISTRY_TEMPLATES.length; seat += 1) {
      let bestId: string | null = null;
      let bestQuotient = -Infinity;

      for (const [id, divisor] of divisors) {
        const claim = claims.get(id);
        /* A partner that has already taken what it negotiated stops here.
           The governing party has no cap, because it is the government. */
        if (claim && claim.taken >= claim.cap) continue;
        const seats = claim ? claim.seats : (player?.seats ?? 0);
        const quotient = seats / divisor;
        if (quotient > bestQuotient) {
          bestQuotient = quotient;
          bestId = id;
        }
      }

      if (bestId === null) break;
      divisors.set(bestId, (divisors.get(bestId) ?? 1) + 1);
      entitlement.set(bestId, (entitlement.get(bestId) ?? 0) + 1);
      const claim = claims.get(bestId);
      if (claim) claim.taken += 1;
    }
  }

  /* Largest party picks first, and picks what it campaigns on. */
  const order = [...partners].sort((a, b) => b.seats - a.seats || a.id.localeCompare(b.id));
  const held = new Map<MinistryKey, string>();
  const taken = new Set<MinistryKey>();

  for (const partner of order) {
    const wanted = [...MINISTRY_TEMPLATES]
      .filter((m) => !taken.has(m.key))
      .sort(
        (a, b) =>
          Math.abs(partner.ideology[b.prize]) - Math.abs(partner.ideology[a.prize]) ||
          b.resistance - a.resistance,
      );
    const share = entitlement.get(partner.id) ?? 0;
    for (let i = 0; i < share && i < wanted.length; i += 1) {
      held.set(wanted[i]!.key, partner.id);
      taken.add(wanted[i]!.key);
    }
  }

  return ministries.map((ministry) => ({
    ...ministry,
    heldBy: held.get(ministry.key) ?? null,
    /* Every minister asks for more. Those running the departments that are
       hardest to cut ask for most, because they can. */
    demand: 1 + findMinistry(ministry.key).resistance * 0.06,
  }));
}

/** Which party holds a given service's ministry, if anyone. */
export function holderOf(budget: Budget, service: ServiceKey): string | null {
  const key = ministryFor(service).key;
  return budget.ministries.find((m) => m.key === key)?.heldBy ?? null;
}

/* ------------------------------------------------------------------ *
 * What the cabinet thinks of it
 * ------------------------------------------------------------------ */

export interface MinistryReaction {
  key: MinistryKey;
  name: string;
  /** The party whose minister runs it, or null for the governing party. */
  heldBy: string | null;
  /** Change as a share of what they had. Negative is a cut. */
  change: number;
  /** Coalition mood this costs the holding party. Negative is a cost. */
  mood: number;
  /** Share of that party's backbenchers who will not vote for it. */
  rebellion: number;
  /** What the minister says, in one line. */
  line: string;
}

/**
 * How every department takes it.
 *
 * Ministers resist cuts in proportion to how hard their department is to
 * cut, which is not the same as how important it is: defence and pensions
 * fight hardest because their costs are contractual and their constituencies
 * are certain to vote. Gratitude for a rise is worth about a third of the
 * resentment for a cut of the same size, which is the correct exchange rate
 * and the reason budgets ratchet upward.
 */
export function cabinetReaction(budget: Budget, parties: readonly Party[]): MinistryReaction[] {
  return budget.ministries.map((ministry) => {
    const template = findMinistry(ministry.key);
    const { change } = ministryTotals(budget, ministry.key);
    const points = change * 100;

    const mood =
      points < 0
        ? points * MINISTRY_CUT_MOOD * template.resistance
        : points * MINISTRY_RISE_MOOD;

    const rebellion =
      points < 0 ? Math.min(0.6, -points * MINISTRY_REBELLION_PER_POINT * template.resistance) : 0;

    const party = parties.find((p) => p.id === ministry.heldBy);
    const who = party ? party.shortName : 'the government';

    return {
      key: ministry.key,
      name: template.name,
      heldBy: ministry.heldBy,
      change,
      mood,
      rebellion,
      line: describeReaction(template, points, who, ministry.demand),
    };
  });
}

function describeReaction(
  template: MinistryTemplate,
  points: number,
  who: string,
  demand: number,
): string {
  const asked = Math.round((demand - 1) * 100);
  if (points <= -12) {
    return `${template.title} (${who}) asked for ${asked}% more and is being cut ${Math.abs(points).toFixed(0)}%. This will be said out loud.`;
  }
  if (points < -1) {
    return `${template.title} (${who}) is down ${Math.abs(points).toFixed(0)}% and has noticed.`;
  }
  if (points > 8) {
    return `${template.title} (${who}) is up ${points.toFixed(0)}% and will not mention it again.`;
  }
  if (points > 1) return `${template.title} (${who}) is up ${points.toFixed(0)}%. Adequate.`;
  return `${template.title} (${who}) is held flat, which after inflation is a cut and they know it.`;
}

/* ------------------------------------------------------------------ *
 * The division
 * ------------------------------------------------------------------ */

export interface BudgetDivision {
  for: number;
  against: number;
  abstain: number;
  passed: boolean;
  /** Seats lost to rebellion, by party, for the report. */
  rebels: { partyId: string; seats: number }[];
}

/**
 * Put the budget to the chamber.
 *
 * The government's own seats are the starting point, minus whatever its
 * partners' backbenchers will not wear. Opposition parties vote against a
 * budget as a matter of course — that is what an opposition is — except
 * where a crossbench deal has been struck.
 *
 * Note what is NOT modelled: the government cannot whip its way out of this.
 * A budget is a confidence matter and everybody already knows how they are
 * voting. What decides it is what was done to the departments in the weeks
 * before, which is the whole point.
 */
export function divideOnBudget(
  budget: Budget,
  parties: readonly Party[],
  totalSeats: number,
  rng?: Rng,
): BudgetDivision {
  const reactions = cabinetReaction(budget, parties);
  const rebels: { partyId: string; seats: number }[] = [];
  const supply = new Set(budget.supply);

  let ayes = 0;
  let noes = 0;

  for (const party of parties) {
    const inGovernment = party.isPlayer || party.inCoalition;
    if (!inGovernment) {
      /* A party that has agreed supply walks out rather than votes. That is
         what confidence and supply buys: not their votes, their absence. */
      if (!supply.has(party.id)) noes += party.seats;
      continue;
    }

    /* The worst thing done to any department this party holds is what its
       backbenchers will actually be voting on. */
    const worst = reactions
      .filter((r) => r.heldBy === party.id || (party.isPlayer && r.heldBy === null))
      .reduce((max, r) => Math.max(max, r.rebellion), 0);

    /*
     * Without a generator this returns the central estimate — which is what
     * the whips' count is, and what the player is shown before the vote.
     * The division itself is drawn around it, because a whips' count is an
     * estimate made by people asking other people how they intend to vote.
     */
    const share = worst > 0 && rng ? Math.max(0, worst + jitter(rng) * REBELLION_NOISE) : worst;
    const rebelSeats = Math.round(party.seats * share);
    if (rebelSeats > 0) rebels.push({ partyId: party.id, seats: rebelSeats });
    ayes += party.seats - rebelSeats;
    noes += rebelSeats;
  }

  const abstain = Math.max(0, totalSeats - ayes - noes);
  return { for: ayes, against: noes, abstain, passed: ayes > noes, rebels };
}

/** How far a whips' count can be out, as a share of the seats in question. */
const REBELLION_NOISE = 0.22;

/** Symmetric in [-1, 1], concentrated near nothing much happening. */
function jitter(rng: Rng): number {
  return rng.next() + rng.next() - 1;
}

/**
 * What an opposition party wants for staying out of the division.
 *
 * Their seats, because that is what they are selling, and their distance
 * from you, because a party that agrees with you is cheaper to buy than one
 * that has spent the year saying you are ruining the country.
 */
export function supplyCost(party: Party, player: Party): number {
  const distance =
    Math.abs(party.ideology.economic - player.ideology.economic) +
    Math.abs(party.ideology.social - player.ideology.social) +
    Math.abs(party.ideology.environmental - player.ideology.environmental);

  return Math.round(
    SUPPLY_PC_BASE +
      party.seats * SUPPLY_PC_PER_SEAT * (1 + distance * SUPPLY_DISTANCE_COST),
  );
}

/* ------------------------------------------------------------------ *
 * Enacting it
 * ------------------------------------------------------------------ */

/**
 * Turn a passed budget into the money actually being spent.
 *
 * Capital lines become committed for three years, because capital spending
 * is contracted and a successor who wants the money back has to break a
 * contract. That is why so much of any government's budget was decided by
 * somebody else — and why a government that wants to bind its successors
 * builds things rather than funding them.
 */
export function enactBudget(budget: Budget, turn: number): Budget {
  return {
    ...budget,
    year: budget.year + 1,
    stage: 'enacted',
    enactedTurn: turn,
    defeats: 0,
    /* The agreement was for one budget. Next year they will want paying again. */
    supply: [],
    lines: budget.lines.map((line) => ({
      ...line,
      enacted: line.proposed,
      committedYears:
        line.capitalShare > 0.15 && line.proposed > line.enacted
          ? CAPITAL_COMMITMENT_YEARS
          : Math.max(0, line.committedYears - 1),
    })),
  };
}

/** A budget the chamber would not have. */
export function rejectBudget(budget: Budget): Budget {
  return {
    ...budget,
    stage: 'rejected',
    defeats: budget.defeats + 1,
    /* The lines go back to what was already in force. A rejected budget does
       not stop the state: last year's appropriation rolls on, which is what
       actually happens and is worse than it sounds, because it is a real cut
       once inflation has had a year at it. */
    lines: budget.lines.map((line) => ({ ...line, proposed: line.enacted })),
  };
}

/**
 * What the law already owes, before anybody decides anything.
 *
 * Statutory lines are re-priced off the population once a year, because
 * that is what they are: a rate in law multiplied by the number of people
 * who qualify for it. Nobody votes for the increase. As the country ages,
 * the pensions line grows every single year of every single term, and every
 * bn it grows by is a bn that is no longer available for anything a
 * government might actually want to do.
 *
 * This is the slowest and most consequential mechanic in the budget: a
 * player who never looks at demography will find, three terms in, that the
 * argument they are having about schools is about a fifth of the money it
 * used to be.
 */
export function indexEntitlements(
  budget: Budget,
  demography: Demography,
  economy: Economy,
  costScale = 1,
): { budget: Budget; changes: { service: ServiceKey; from: number; to: number }[] } {
  const changes: { service: ServiceKey; from: number; to: number }[] = [];

  const lines = budget.lines.map((line) => {
    if (!isStatutory(line.service)) return line;
    const owed = serviceDemand(findService(line.service), demography, economy, costScale);
    if (Math.abs(owed - line.enacted) < 0.05) return line;
    changes.push({ service: line.service, from: line.enacted, to: owed });
    return { ...line, enacted: owed, proposed: owed };
  });

  return { budget: { ...budget, lines }, changes };
}

/**
 * The budget nobody got round to.
 *
 * A government that never puts a budget to the chamber before the deadline
 * does not get a pause: the state goes on spending at last year's cash
 * figures. That is a continuing resolution, and it is a cut, because the
 * demands on every service grew while the appropriation did not. It counts
 * as a defeat — a government that could not find the votes and a government
 * that never dared look for them are in the same position.
 */
export function lapseBudget(budget: Budget, turn: number): Budget {
  return {
    ...budget,
    year: budget.year + 1,
    stage: 'rejected',
    enactedTurn: turn,
    defeats: budget.defeats + 1,
    division: null,
    supply: [],
    lines: budget.lines.map((line) => ({
      ...line,
      proposed: line.enacted,
      committedYears: Math.max(0, line.committedYears - 1),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Feeding the rest of the engine
 * ------------------------------------------------------------------ */

/**
 * What each of the five sectors is funded at, from the line items.
 *
 * The sectors have not gone away — every other system reads them — but they
 * are a SUMMARY of the budget now rather than the budget itself. The player
 * sets twenty lines; the five figures follow.
 */
export function sectorsFromBudget(budget: Budget): Record<SectorKey, number> {
  const out = {
    economy: 0,
    health: 0,
    education: 0,
    infrastructure: 0,
    environment: 0,
  } as Record<SectorKey, number>;

  for (const line of budget.lines) {
    out[findService(line.service).sector] += line.enacted;
  }
  return out;
}

/**
 * Move a whole sector at once, and let the lines follow.
 *
 * The five sector figures are still a legitimate control — a chancellor does
 * say "health goes up four per cent" before anybody works out what that
 * means for each service — but they are not a separate account. Setting one
 * scales the lines underneath it, pro rata and only the ones that are
 * actually a decision, so the document and the summary cannot disagree.
 */
export function setSectorFunding(
  budget: Budget,
  sector: SectorKey,
  amount: number,
  /*
   * Which column it lands in. A change made while the budget is being
   * written is a proposal and waits for the chamber; a supplementary
   * estimate voted out of season is money being spent today, which is what
   * makes an emergency budget worth what it costs.
   */
  into: 'proposed' | 'enacted' = 'proposed',
): Budget {
  const inSector = budget.lines.filter((l) => findService(l.service).sector === sector);
  const fixed = inSector
    .filter((l) => isStatutory(l.service))
    .reduce((sum, l) => sum + l.enacted, 0);
  const movable = inSector
    .filter((l) => !isStatutory(l.service))
    .reduce((sum, l) => sum + l.enacted, 0);

  /* Statutory spending in this sector is already owed, so only what is left
     can be moved — and if there is nothing movable, nothing moves. */
  const target = Math.max(fixed, amount);
  if (movable <= 0) return budget;
  const scale = (target - fixed) / movable;

  return {
    ...budget,
    stage: into === 'proposed' ? 'drafting' : budget.stage,
    lines: budget.lines.map((line) => {
      if (findService(line.service).sector !== sector) return line;
      if (isStatutory(line.service)) return line;
      const next = line.enacted * scale;
      return into === 'enacted'
        ? { ...line, enacted: next, proposed: next }
        : { ...line, proposed: next };
    }),
  };
}

/** Service funding straight off the budget, rather than by fixed weight. */
export function serviceFunding(budget: Budget): Record<string, number> {
  return Object.fromEntries(budget.lines.map((l) => [l.service, l.enacted]));
}

/**
 * How much capital spending reaches the country's infrastructure each turn.
 *
 * Capital spending is the only line in the budget that leaves something
 * behind. It is also the first thing cut, because the thing it leaves behind
 * is not finished until somebody else is in office.
 */
export function capitalToInfrastructure(budget: Budget): number {
  return (capitalTotal(budget) * CAPITAL_TO_CONDITION_SHARE) / TURNS_PER_YEAR;
}

const CAPITAL_TO_CONDITION_SHARE = 0.03;

/** Is the budget balanced against what it claims to have? */
export function budgetBalance(budget: Budget, revenue: number): number {
  return revenue - proposedTotal(budget);
}

/** A one-line statement of the position, for the document. */
export function describeBudget(budget: Budget, revenue: number): string {
  const balance = budgetBalance(budget, revenue);
  const total = proposedTotal(budget);
  const share = revenue > 0 ? (total / revenue) * 100 : 0;

  if (balance > total * 0.02) {
    return `A surplus of ₡${balance.toFixed(0)}bn. Spending is ${share.toFixed(0)}% of receipts.`;
  }
  if (balance > -total * 0.02) {
    return `Broadly balanced. Spending is ${share.toFixed(0)}% of receipts.`;
  }
  return `A deficit of ₡${Math.abs(balance).toFixed(0)}bn — ${share.toFixed(0)}% of receipts, and the difference is borrowed.`;
}

export { MINISTRY_TEMPLATES, findMinistry, ministryFor, SECTOR_BASELINE_FUNDING };
export type { MinistryKey, MinistryTemplate };
