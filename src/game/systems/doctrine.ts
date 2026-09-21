/**
 * doctrine.ts — what the army believes, and what it is buying for 2041.
 *
 * EVERY ARMY PREPARES FOR THE LAST WAR, AND IT IS RATIONAL TO. This is
 * usually told as a joke about stupidity and it is not one. The doctrine
 * that won the last war is the one with evidence behind it; the officers
 * who executed it are the ones promoted for executing it; the
 * alternative is a theory held by somebody junior about a war nobody has
 * fought. A government changing doctrine on a theory is betting against
 * the only data anybody has, in public, against every person with a
 * record — and is right about one time in three. The engine does not
 * reward the change; it prices it.
 *
 * DOCTRINE IS A BELIEF SYSTEM, NOT A SETTING. `ordered` and `current`
 * are separate fields on purpose. A government orders a change and the
 * army does not make one, because the people who would have to make it
 * are the people who hold the old belief and were promoted for holding
 * it. Adoption advances with OFFICER TURNOVER, which is years, and an
 * army halfway through is worse at both than it was at either.
 *
 * There is one way to make it fast, and it is in here because a
 * government should be able to see the price before it pays it: sack the
 * officer corps. It works. What it costs is every officer who knew what
 * they were doing.
 *
 * And RESEARCH DELIVERS AFTER THE WAR IT WAS FOR. Every programme
 * records the doctrine it was specified against, because it is an answer
 * to a question asked today and will arrive in a decade that may be
 * asking a different one. The question on the desk is never "what do we
 * need"; it is "what will we need in 2041, and how wrong are we willing
 * to be".
 */

import {
  ADOPTION_YEARS,
  DOCTRINE_FORCE_APPROVAL,
  PURGE_COMPETENCE_COST,
  REFUTED_SPEED,
  TURNS_PER_YEAR,
  VINDICATED_SPEED,
} from '../balance.ts';
import {
  HALF_ADOPTED_PENALTY,
  findResearch,
  findWarDoctrine,
  type ResearchField,
  type WarDoctrine,
} from '../content/doctrine.ts';
import type { TerrainKey } from '../content/theatre.ts';
import type { Doctrine, Orbat, ResearchProgramme } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

/**
 * What the army already believes, which nobody in this run decided.
 *
 * Fully adopted, because whatever the army believes it believes
 * completely — that is what makes changing it expensive.
 */
export function buildDoctrine(current: WarDoctrine = 'combined_arms'): Doctrine {
  return {
    current,
    ordered: null,
    orderedTurn: 0,
    adoption: 1,
    /* No war in living memory, which is its own problem: nothing has
       been tested and everybody is confident. */
    lastWarLesson: null,
    programmes: [],
    capability: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/**
 * How much of the army's strength the doctrine is actually delivering.
 *
 * One when the army believes what it is doing. Less while it is being
 * asked to do something it does not, and the worst point is the middle —
 * an army halfway through a doctrinal change is worse at both than it
 * was at either, which is the cost nobody prices when ordering one.
 */
export function effectiveness(doctrine: Doctrine): number {
  if (!doctrine.ordered || doctrine.ordered === doctrine.current) return 1;
  const distance = 1 - Math.abs(doctrine.adoption - 0.5) * 2;
  return 1 - distance * (1 - HALF_ADOPTED_PENALTY);
}

/** What the army is worth on a given piece of ground, doctrine included. */
export function doctrineFit(doctrine: Doctrine, terrain: TerrainKey): number {
  const template = findWarDoctrine(doctrine.current);
  if (template.favours.includes(terrain)) return 1.2;
  if (template.poorIn.includes(terrain)) return 0.72;
  return 1;
}

/** What it does to an attack, a defence, and the speed of both. */
export function doctrineEffect(
  doctrine: Doctrine,
  field: 'attack' | 'defence' | 'tempo' | 'casualties' | 'consumption',
): number {
  const template = findWarDoctrine(doctrine.current);
  return 1 + (template[field] - 1) * effectiveness(doctrine);
}

/**
 * How fast a doctrine is being taken up, per week.
 *
 * Officer turnover, modified by whether the last war appeared to
 * vindicate it. Evidence is persuasive and an officer corps is not being
 * unreasonable in wanting some.
 */
export function adoptionRate(doctrine: Doctrine): number {
  if (!doctrine.ordered) return 0;
  const template = findWarDoctrine(doctrine.ordered);
  const base = 1 / (ADOPTION_YEARS * TURNS_PER_YEAR * template.adoptionDifficulty);

  if (doctrine.lastWarLesson === doctrine.ordered) return base * VINDICATED_SPEED;
  if (doctrine.lastWarLesson === doctrine.current) return base * REFUTED_SPEED;
  return base;
}

/** Years before the ordered doctrine is what the army actually does. */
export function yearsToAdopt(doctrine: Doctrine): number {
  const rate = adoptionRate(doctrine);
  if (rate <= 0) return 0;
  return (1 - doctrine.adoption) / rate / TURNS_PER_YEAR;
}

/** Research still running, and what it will be worth if it arrives. */
export function running(doctrine: Doctrine): ResearchProgramme[] {
  return doctrine.programmes.filter((p) => !p.delivered);
}

/** What a year of the present research bill costs. */
export function researchCost(doctrine: Doctrine, moneyScale: number): number {
  return running(doctrine).reduce((sum, p) => sum + findResearch(p.field).annualCost, 0) * moneyScale;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface DoctrineInputs {
  orbat: Orbat;
  /** How much of the officer corps has been replaced since last week. */
  turnover: number;
  /** Whether there is a war on. Wars teach faster than staff colleges. */
  atWar: boolean;
  /** How it is going, -1 to 1. What the army concludes from. */
  battlefield: number;
  /**
   * What the other side is doing.
   *
   * The thing an army actually learns from a war it is losing. Nobody
   * adopts the doctrine of the army they beat.
   */
  opposing: WarDoctrine | null;
  /** What the research line is funded at, relative to what was promised. */
  funding: number;
  turn: number;
}

export interface DoctrineTick {
  doctrine: Doctrine;
  /** True the week the army finally does what it was told to. */
  adopted: boolean;
  /** Programmes that delivered, with what the decade did to them. */
  delivered: { programme: ResearchProgramme; dated: boolean }[];
  /** True the week a war teaches the army something. */
  learned: boolean;
}

export function stepDoctrine(doctrine: Doctrine, inputs: DoctrineInputs): DoctrineTick {
  const delivered: { programme: ResearchProgramme; dated: boolean }[] = [];
  let adopted = false;
  let learned = false;

  /* ---- 1. Whether the army has come round. ---- */
  let current = doctrine.current;
  let ordered = doctrine.ordered;
  let adoption = doctrine.adoption;

  if (ordered && ordered !== current) {
    /*
     * Adoption advances with officer turnover and with nothing else. A
     * government can restate the order every week; the people who would
     * have to carry it out are the people who believe the old one, and
     * they will believe it until they are replaced.
     */
    adoption = clamp(
      adoption + adoptionRate(doctrine) * (1 + inputs.turnover * 40),
      0,
      1,
    );
    if (adoption >= 1) {
      current = ordered;
      ordered = null;
      adopted = true;
    }
  }

  /* ---- 2. What a war teaches. ---- */
  /*
   * A war going well is the strongest argument for the doctrine that is
   * winning it. A war going badly is not an argument for anything the
   * army is already doing — it is an argument for whatever the other
   * side is doing, because that is where the evidence is. Armies adopt
   * the doctrine of whoever beat them, and nobody has ever adopted the
   * doctrine of an army they beat.
   *
   * Both conclusions are drawn from one war, which is the sample size
   * every army in history has worked from and the reason every army
   * prepares for the last one.
   */
  let lastWarLesson = doctrine.lastWarLesson;
  if (inputs.atWar && Math.abs(inputs.battlefield) > 0.55) {
    const lesson =
      inputs.battlefield > 0 ? current : (inputs.opposing ?? lastWarLesson);
    if (lesson && lastWarLesson !== lesson) {
      lastWarLesson = lesson;
      learned = true;
    }
  }

  /* ---- 3. What a previous government ordered. ---- */
  const programmes = doctrine.programmes.map((programme) => {
    if (programme.delivered || inputs.turn < programme.dueTurn) return programme;

    const template = findResearch(programme.field);
    /*
     * And the decade has its say. A programme specified against a
     * doctrine the army no longer holds delivers a fraction of what was
     * promised — the more specific the thing, the less of it survives.
     * A better radio is a better radio; a weapon built for an engagement
     * that stopped happening is a museum piece.
     */
    const dated = programme.specifiedFor !== current;
    const realised = template.benefit * (dated ? 1 - template.specificity : 1);
    const done = { ...programme, delivered: true, realised };
    delivered.push({ programme: done, dated });
    return done;
  });

  const next: Doctrine = {
    ...doctrine,
    current,
    ordered,
    adoption,
    lastWarLesson,
    programmes,
    capability:
      doctrine.capability + delivered.reduce((sum, d) => sum + (d.programme.realised ?? 0), 0),
    history: [
      ...doctrine.history,
      { turn: inputs.turn, adoption, effectiveness: effectiveness({ ...doctrine, adoption, ordered }) },
    ].slice(-208),
  };

  return { doctrine: next, adopted, delivered, learned };
}

/* ------------------------------------------------------------------ *
 * What a government can do about it
 * ------------------------------------------------------------------ */

/** Whether a doctrine can be ordered, and what it will cost. */
export function doctrineChange(
  doctrine: Doctrine,
  to: WarDoctrine,
): {
  allowed: boolean;
  reason: string;
  years: number;
  approvalCost: number;
  politicalCapital: number;
  /** The last war vindicated the doctrine being ordered. */
  vindicated: boolean;
  /** The last war vindicated the one the army already has. */
  currentVindicated: boolean;
} {
  if (to === doctrine.current && !doctrine.ordered) {
    return {
      allowed: false,
      reason: 'That is what the army does already.',
      years: 0,
      approvalCost: 0,
      politicalCapital: 0,
      vindicated: false,
      currentVindicated: false,
    };
  }

  const vindicated = doctrine.lastWarLesson === to;
  const currentVindicated =
    doctrine.lastWarLesson !== null && doctrine.lastWarLesson === doctrine.current;
  const template = findWarDoctrine(to);
  const projected: Doctrine = { ...doctrine, ordered: to, adoption: 0 };

  return {
    allowed: true,
    reason: '',
    years: yearsToAdopt(projected),
    /*
     * Ordering a doctrine the last war refuted costs almost nothing.
     * Ordering one it did not is an argument with everybody who has a
     * record, conducted in public.
     */
    approvalCost: vindicated ? 1 : DOCTRINE_FORCE_APPROVAL * template.adoptionDifficulty,
    politicalCapital: Math.round(10 + template.adoptionDifficulty * 9),
    vindicated,
    currentVindicated,
  };
}

/** Order it. Whether the army does it is a separate question. */
export function orderDoctrine(doctrine: Doctrine, to: WarDoctrine, turn: number): Doctrine {
  if (to === doctrine.current) return { ...doctrine, ordered: null, adoption: 1 };
  return { ...doctrine, ordered: to, orderedTurn: turn, adoption: 0 };
}

/**
 * Force it through by replacing the people who disagree.
 *
 * It works, and it is the only thing that works quickly. What it costs
 * is every officer who knew what they were doing — the competence goes
 * and the loyalty does not come back with it, because the officers who
 * remain have just watched what happens to people who held the previous
 * view in good faith.
 */
export function forceDoctrine(
  doctrine: Doctrine,
  orbat: Orbat,
): { doctrine: Doctrine; orbat: Orbat; competenceLost: number } {
  if (!doctrine.ordered) return { doctrine, orbat, competenceLost: 0 };

  const before = orbat.commanders.reduce((s, c) => s + c.competence, 0);
  const commanders = orbat.commanders.map((c) =>
    c.dismissed
      ? c
      : {
          ...c,
          competence: c.competence * PURGE_COMPETENCE_COST,
          /* And the ones who remain draw a conclusion about what this
             government does to people who were right at the time. */
          loyalty: Math.max(0, c.loyalty - 9),
        },
  );
  const after = commanders.reduce((s, c) => s + c.competence, 0);

  return {
    doctrine: { ...doctrine, current: doctrine.ordered, ordered: null, adoption: 1 },
    orbat: { ...orbat, commanders },
    competenceLost: before - after,
  };
}

/**
 * Start a research programme.
 *
 * It records the doctrine it was specified against, because that is what
 * it is an answer to. Eight years from now the army may be doing
 * something else, and then this is a museum piece that a previous
 * government is remembered for.
 */
export function startResearch(
  doctrine: Doctrine,
  field: ResearchField,
  turn: number,
): { doctrine: Doctrine; dueTurn: number; annualCost: number } {
  const template = findResearch(field);
  const dueTurn = turn + Math.round(template.leadYears * TURNS_PER_YEAR);
  return {
    doctrine: {
      ...doctrine,
      programmes: [
        ...doctrine.programmes,
        {
          id: `res-${field}-${turn}`,
          field,
          startedTurn: turn,
          dueTurn,
          specifiedFor: doctrine.ordered ?? doctrine.current,
          spent: 0,
          delivered: false,
          realised: null,
        },
      ],
    },
    dueTurn,
    annualCost: template.annualCost,
  };
}

/** Cancel one. The years already spent do not come back either. */
export function cancelResearch(doctrine: Doctrine, id: string): Doctrine {
  return { ...doctrine, programmes: doctrine.programmes.filter((p) => p.id !== id) };
}

/* ------------------------------------------------------------------ *
 * Describing it
 * ------------------------------------------------------------------ */

/** One line on what the army believes and what it is buying. */
export function describeDoctrine(doctrine: Doctrine): string {
  const template = findWarDoctrine(doctrine.current);

  if (doctrine.ordered && doctrine.ordered !== doctrine.current) {
    const to = findWarDoctrine(doctrine.ordered);
    return `The army has been told to adopt ${to.label.toLowerCase()} and is ${(doctrine.adoption * 100).toFixed(0)}% of the way there, which will take about ${yearsToAdopt(doctrine).toFixed(0)} more years. Until it arrives the army is worse at both than it was at either, because the people who have to make the change are the people who were promoted for the old one.`;
  }
  if (doctrine.lastWarLesson && doctrine.lastWarLesson !== doctrine.current) {
    const lesson = findWarDoctrine(doctrine.lastWarLesson);
    return `The last war suggested ${lesson.label.toLowerCase()}. The army does ${template.label.toLowerCase()}. That gap closes on its own eventually, by retirement, and there is no faster way that does not cost the officer corps.`;
  }
  const stale = running(doctrine).filter((p) => p.specifiedFor !== doctrine.current);
  if (stale.length > 0) {
    return `${stale.length} of the research programmes were specified against a doctrine the army no longer holds. They will arrive anyway, on time, and be worth a fraction of what was promised for them.`;
  }
  return `${template.label}: ${template.blurb} Learned from ${template.learnedFrom}, which is also where its blind spots are.`;
}

/** What the research is buying, and when somebody else collects it. */
export function describeResearch(doctrine: Doctrine, turn: number): string {
  const live = running(doctrine);
  if (live.length === 0) {
    return 'Nothing is being developed. The question on this desk is never what the country needs; it is what it will need in twelve years, and not asking it is also an answer.';
  }
  const soonest = [...live].sort((a, b) => a.dueTurn - b.dueTurn)[0]!;
  const years = (soonest.dueTurn - turn) / TURNS_PER_YEAR;
  return `${live.length} programmes running. The first arrives in ${years.toFixed(0)} years, specified against ${findWarDoctrine(soonest.specifiedFor).label.toLowerCase()} — which is what the army believed on the day it was written and may not be what it believes on the day it lands.`;
}
