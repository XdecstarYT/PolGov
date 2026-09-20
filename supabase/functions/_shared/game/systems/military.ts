/**
 * military.ts — deterrence is bought years before it is needed.
 *
 * The design problem with armed forces in a political game is that the
 * interesting decisions are all invisible at the moment they are taken. A
 * government that cuts readiness this year changes nothing anybody can see;
 * it changes what is possible in four years, under a government that will
 * not be this one. So the system is built so that every number here is slow,
 * every consequence is late, and the player is never asked to fight a
 * battle — only to decide, years early, what the country will be able to do.
 *
 * Four mechanics carry it.
 *
 *   READINESS IS THE FIRST THING CUT. Strength is what gets announced and
 *   readiness is what gets spent, so a budget that holds strength and starves
 *   readiness produces a parade rather than a deterrent. Nothing visible
 *   happens for years. Then something happens.
 *
 *   EQUIPMENT AGES WHETHER OR NOT ANYBODY DECIDES ANYTHING. Every arm loses
 *   modernity every week, which makes procurement a treadmill rather than a
 *   choice, and makes skipping one cycle a decision whose bill arrives two
 *   governments later.
 *
 *   PROCUREMENT IS LATE AND OVER BUDGET, ON PURPOSE. Because it is, always,
 *   everywhere. The interesting question is never which to buy; it is
 *   whether to start something that will be finished by a successor, in a
 *   region whose jobs make it impossible to cancel.
 *
 *   DEPLOYMENT COSTS WHAT IT USES. Forces committed abroad are not available
 *   at home, wear out faster, and produce veterans — who are a constituency
 *   rather than a statistic, and who remember.
 */

import {
  DEPLOYMENT_WEAR,
  EQUIPMENT_FLOOR,
  PROCUREMENT_OVERRUN,
  PROCUREMENT_COST_CAP,
  PROCUREMENT_SLIP,
  PROCUREMENT_SLIP_CAP,
  READINESS_FUNDING_PIVOT,
  READINESS_FUNDING_SPAN,
  STRENGTH_ADJUST_RATE,
  TURNS_PER_YEAR,
  VETERANS_PER_DEPLOYMENT_YEAR,
  months,
} from '../balance.ts';
import {
  ARM_TEMPLATES,
  DOCTRINE_TEMPLATES,
  findArm,
  findDoctrine,
  findProgramme,
  type ArmKey,
} from '../content/forces.ts';
import type { Rng } from '../rng.ts';
import type {
  ArmState,
  Deployment,
  Demography,
  Military,
  Programme,
  World,
} from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * What the country starts with
 * ------------------------------------------------------------------ */

/**
 * The forces a new government inherits.
 *
 * Adequate, ageing, and nobody's achievement. Readiness slightly below
 * strength because that is the shape every peacetime force drifts into: the
 * part that shows has been protected and the part that does not has not.
 */
export function buildMilitary(peopleScale = 1): Military {
  /*
   * Not identical across the arms, because no country's are. The army is
   * the one that was protected, the air force is the one whose readiness
   * went first because flying hours are the easiest line to cut without
   * anybody noticing, and cyber is small and new and therefore modern.
   */
  const opening: Record<string, { strength: number; readiness: number; equipment: number }> = {
    army: { strength: 62, readiness: 51, equipment: 48 },
    navy: { strength: 54, readiness: 47, equipment: 55 },
    air: { strength: 49, readiness: 38, equipment: 44 },
    cyber: { strength: 38, readiness: 58, equipment: 71 },
  };

  const arms: ArmState[] = ARM_TEMPLATES.map((template) => {
    const start = opening[template.key]!;
    return {
      key: template.key,
      /* The gap is the inheritance. Somebody protected the headline figure
         and did not protect the one that decides anything. */
      ...start,
      personnel: Math.round(openingPersonnel(template.key, start.strength) * peopleScale),
    };
  });

  return {
    arms,
    doctrine: 'professional',
    programmes: [],
    deployments: [],
    /* A country that never built one, and for which building one would be
       the single most consequential decision available to it. */
    deterrent: 'none',
    veterans: Math.round(240 * peopleScale),
    history: [],
  };
}

/**
 * Roughly who is in uniform on day one.
 *
 * Stated rather than left at zero, because a panel that opened showing an
 * army of nobody would be reporting a modelling artefact as a fact about
 * the country.
 */
function openingPersonnel(key: ArmKey, strength: number): number {
  const template = findArm(key);
  /* A fifth of a per cent of the population, split the way the budget is. */
  return 420 * template.manpowerShare * template.budgetShare * (strength / 55);
}

export function findArmState(military: Military, key: ArmKey): ArmState {
  const found = military.arms.find((a) => a.key === key);
  if (!found) throw new Error(`military: no state for ${key}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Reading the forces
 * ------------------------------------------------------------------ */

/**
 * What the country could actually do, as distinct from what it owns.
 *
 * Strength times readiness times equipment, because all three are required
 * and none of them substitutes for another. A large unready force with old
 * kit is a budget line, not a capability — and the reason to compute it this
 * way rather than adding the three is that adding them would let a
 * government buy its way out of neglect, which is the one thing it cannot do.
 */
export function armPower(arm: ArmState): number {
  return (arm.strength / 100) * (arm.readiness / 100) * (0.55 + (arm.equipment / 100) * 0.45) * 100;
}

/**
 * Total combat power, at home or away.
 *
 * Away is a different number, and much smaller, because getting somewhere is
 * most of the problem and almost nothing a country owns helps with it.
 */
export function combatPower(military: Military, away = false): number {
  const doctrine = findDoctrine(military.doctrine);
  const multiplier = away ? doctrine.expeditionary : doctrine.defensive;

  const raw = military.arms.reduce((sum, arm) => {
    const template = findArm(arm.key);
    return sum + armPower(arm) * (away ? template.expeditionary : template.defensive);
  }, 0);

  /* Forces already committed elsewhere are not available. This is the
     entire argument against the deployment a government wants to announce. */
  return raw * multiplier * (1 - committedShare(military));
}

/** How much of the force is already somewhere else. */
export function committedShare(military: Military): number {
  return Math.min(0.75, military.deployments.reduce((sum, d) => sum + d.commitment, 0));
}

/** ₡bn a year every deployment is costing. */
export function deploymentCost(military: Military): number {
  return military.deployments.reduce((sum, d) => sum + d.cost, 0);
}

/** ₡bn a year the doctrine adds to, or takes off, the defence line. */
export function doctrineCost(military: Military, moneyScale = 1): number {
  return findDoctrine(military.doctrine).surcharge * moneyScale;
}

/**
 * What a programme costs the country that is buying it, ₡bn.
 *
 * The template price is written at Verdana's scale. Every other price in
 * the game is carried to the national one, and a frigate is not an
 * exception: the same hull is a rounding error to one treasury and a
 * decade of argument to another.
 */
export function programmeCost(template: { cost: number }, moneyScale = 1): number {
  return template.cost * moneyScale;
}

/** ₡bn a year currently going into programmes under construction. */
export function programmeSpend(military: Military): number {
  return military.programmes
    .filter((p) => !p.delivered && !p.cancelled)
    .reduce((sum, p) => sum + p.cost / Math.max(1, findProgramme(p.key).years), 0);
}

/**
 * Whether anybody is deterred.
 *
 * Deterrence is not strength; it is strength somebody else has noticed and
 * believes will be used. Alliances count for as much as forces do, which is
 * the entire strategic argument for having any, and a nuclear deterrent
 * counts for more than everything else combined — which is the entire
 * argument about whether to build one.
 */
export function deterrence(military: Military, world: World): number {
  const forces = combatPower(military) * 0.75;
  const allies = world.treaties.filter(
    (t) => t.kind === 'mutual_defence' || t.kind === 'defence',
  ).length;
  const alliance = allies * 9;
  const nuclear = military.deterrent === 'held' ? 45 : 0;
  return clamp(forces + alliance + nuclear, 0, 200);
}

/**
 * Whether the country could meet the obligations it has signed.
 *
 * A government that has promised to defend three countries with a force
 * that could defend one has written a cheque somebody else will present.
 */
export function overcommitted(military: Military, world: World): boolean {
  const promises = world.treaties.filter((t) => t.kind === 'mutual_defence').length;
  return promises > 0 && combatPower(military, true) < promises * 18;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface MilitaryInputs {
  /** ₡bn a year the defence line is funded at. */
  funding: number;
  /** ₡bn a year full upkeep of the current force would cost. */
  required: number;
  demography: Demography;
  /** Unemployment, which is what actually fills a volunteer force. */
  unemployment: number;
  turn: number;
  /**
   * Weeks since the run began, which does not reset at an election.
   *
   * Procurement is measured on this clock and nothing else is, because a
   * programme collected by a successor is the entire point of modelling
   * one — and a clock that reset every term would deliver everything to
   * the government that ordered it.
   */
  week: number;
  rng: Rng;
  /** True while the country is fighting, which changes everything. */
  atWar: boolean;
  /** National money against Verdana's, so a quoted price means something. */
  moneyScale?: number;
}

export interface MilitaryTick {
  military: Military;
  /** Programmes that finally arrived this week. */
  delivered: Programme[];
  /** Programmes that slipped again this week. */
  slipped: { programme: Programme; weeks: number }[];
}

/**
 * Advance the forces by one week.
 *
 * Nothing here is fast. Strength moves toward what the money supports over
 * years; readiness responds within months; equipment only ever falls unless
 * a programme lands. That ordering is the mechanic: the number that responds
 * fastest to a cut is the one nobody can see.
 */
export function stepMilitary(military: Military, inputs: MilitaryInputs): MilitaryTick {
  const doctrine = findDoctrine(military.doctrine);
  const cover = inputs.required > 0 ? inputs.funding / inputs.required : 1;
  const committed = committedShare(military);

  const arms = military.arms.map((arm) => {
    const template = findArm(arm.key);

    /*
     * Strength follows the money, slowly. A force cannot be grown faster
     * than it can be recruited and trained, and cannot be cut faster than
     * people can be let go — which is why defence budgets are sticky in
     * both directions and why the savings never arrive when promised.
     */
    const supported = clamp(45 + (cover - 1) * 55, 5, 100) * doctrine.manpower;
    const strength = clamp(
      arm.strength + (Math.min(100, supported) - arm.strength) * STRENGTH_ADJUST_RATE,
      0,
      100,
    );

    /*
     * Readiness responds within months rather than years, which is exactly
     * why it is the first thing cut: the saving is immediate and nothing
     * visible happens. Spending above the pivot builds it; below, it decays
     * at a rate the arm sets — an air force loses it fastest, because
     * flying hours are the whole of it.
     */
    /*
     * The curve is deliberately gentle. Level funding buys a force that is
     * about half ready, and a genuinely ready one costs a third again on
     * top of upkeep — which is the real number and the reason almost no
     * country has one. A steeper curve would let a government reach full
     * readiness by not cutting, and then readiness would not be a decision.
     */
    const readinessTarget =
      clamp(((cover - READINESS_FUNDING_PIVOT) / READINESS_FUNDING_SPAN) * 100, 0, 100) *
      doctrine.readiness;
    const readinessRate =
      readinessTarget > arm.readiness
        ? 0.06
        : template.readinessDecay / 100 / TURNS_PER_YEAR + 0.02;
    let readiness = arm.readiness + (Math.min(100, readinessTarget) - arm.readiness) * readinessRate;

    /* Deployment wears a force out faster than any amount of money repairs. */
    readiness -= committed * DEPLOYMENT_WEAR;
    /* And a war consumes readiness at a rate no peacetime budget matches. */
    if (inputs.atWar) readiness -= 0.35;

    /*
     * Equipment only falls. Every week, whatever anybody does, at a rate
     * the arm sets — which is what makes procurement a treadmill rather
     * than a decision, and makes skipping a cycle a bill for a successor.
     */
    const equipment = Math.max(
      EQUIPMENT_FLOOR,
      arm.equipment - template.obsolescence / TURNS_PER_YEAR,
    );

    /*
     * Who is actually in uniform. A volunteer force competes with the
     * labour market and recruits best when the economy is worst, which is
     * an uncomfortable fact that no recruiting campaign has ever changed.
     */
    const pool = inputs.demography.workforce * 1000 * 0.02;
    const pull = 1 + (inputs.unemployment - 5) * 0.035;
    const personnel =
      pool * template.manpowerShare * template.budgetShare * doctrine.manpower * pull * (strength / 55);

    return {
      ...arm,
      strength,
      readiness: clamp(readiness, 0, 100),
      equipment,
      personnel,
    };
  });

  /* Programmes: progress, slip, or finally arrive. */
  const delivered: Programme[] = [];
  const slipped: { programme: Programme; weeks: number }[] = [];

  const programmes = military.programmes.map((programme) => {
    if (programme.delivered || programme.cancelled) return programme;
    const template = findProgramme(programme.key);

    const spent =
      programme.spent + programme.cost / Math.max(1, template.years * TURNS_PER_YEAR);

    /*
     * The slip. Every quarter there is a chance the estimate moves right
     * and the cost moves up, weighted by how complicated the thing is.
     * Nothing here is a punishment for a bad decision; it is what building
     * something complicated is like, and a game where it ran to time would
     * be modelling a world nobody has ever governed in.
     */
    /*
     * Bounded, because unbounded slip is not realism — it is a programme
     * that never arrives, which teaches nothing and is not what happens.
     * Big projects run half again as long and most of the way again as
     * expensive, and then they land.
     */
    const maxSlip = Math.round(template.years * TURNS_PER_YEAR * PROCUREMENT_SLIP_CAP);
    const maxCost = programmeCost(template, inputs.moneyScale) * PROCUREMENT_COST_CAP;
    const canSlip = programme.slippedTo - programme.dueTurn < maxSlip;

    if (canSlip && inputs.week % months(3) === 0 && inputs.rng.chance(template.risk * 0.4)) {
      const weeks = months(inputs.rng.int(2, 5));
      const next = {
        ...programme,
        spent,
        slippedTo: programme.slippedTo + weeks,
        cost: Math.min(maxCost, programme.cost * (1 + PROCUREMENT_OVERRUN)),
      };
      slipped.push({ programme: next, weeks });
      return next;
    }

    if (inputs.week >= programme.slippedTo) {
      const done = { ...programme, spent, delivered: true };
      delivered.push(done);
      return done;
    }

    return { ...programme, spent };
  });

  /* What a delivered programme actually does. */
  const withDeliveries = arms.map((arm) => {
    const landed = delivered.filter((p) => findProgramme(p.key).arm === arm.key);
    if (landed.length === 0) return arm;
    return landed.reduce((state, programme) => {
      const template = findProgramme(programme.key);
      return {
        ...state,
        strength: clamp(state.strength + template.strength, 0, 100),
        equipment: clamp(state.equipment + template.equipment, 0, 100),
      };
    }, arm);
  });

  /*
   * Veterans. Deployment produces them at a rate nobody plans for, and they
   * are a constituency rather than a statistic — they vote, they are
   * organised, and they remember which government sent them.
   */
  const veterans =
    military.veterans + committed * VETERANS_PER_DEPLOYMENT_YEAR / TURNS_PER_YEAR;

  const next: Military = {
    ...military,
    arms: withDeliveries,
    programmes,
    veterans,
    history: [
      ...military.history,
      {
        turn: inputs.turn,
        power: combatPower({ ...military, arms: withDeliveries }),
        readiness:
          withDeliveries.reduce((sum, a) => sum + a.readiness, 0) / Math.max(1, withDeliveries.length),
        committed,
      },
    ].slice(-TURNS_PER_YEAR * 8),
  };

  return { military: next, delivered, slipped };
}

/* ------------------------------------------------------------------ *
 * Acting
 * ------------------------------------------------------------------ */

/** Start something that a successor will finish. */
export function startProgramme(
  military: Military,
  key: string,
  turn: number,
  moneyScale = 1,
): Military {
  const template = findProgramme(key);
  return {
    ...military,
    programmes: [
      ...military.programmes,
      {
        id: `prog-${key}-${turn}`,
        key,
        startedTurn: turn,
        /* What was announced. */
        dueTurn: turn + template.years * TURNS_PER_YEAR,
        /* And what it will actually be, which already is not the same. */
        slippedTo: turn + Math.round(template.years * TURNS_PER_YEAR * (1 + PROCUREMENT_SLIP)),
        spent: 0,
        cost: programmeCost(template, moneyScale),
        cancelled: false,
        delivered: false,
      },
    ],
  };
}

/**
 * Stop something, and lose what was spent on it.
 *
 * Cancellation is the cheapest decision on this page and the hardest one,
 * because the money is gone either way and the jobs are in somebody's seat.
 */
export function cancelProgramme(military: Military, id: string): Military {
  return {
    ...military,
    programmes: military.programmes.map((p) => (p.id === id ? { ...p, cancelled: true } : p)),
  };
}

/** Send forces somewhere. */
export function deploy(
  military: Military,
  deployment: Omit<Deployment, 'id'>,
  turn: number,
): Military {
  return {
    ...military,
    deployments: [
      ...military.deployments,
      { ...deployment, id: `dep-${deployment.nation}-${turn}` },
    ],
  };
}

export function withdraw(military: Military, id: string): Military {
  return { ...military, deployments: military.deployments.filter((d) => d.id !== id) };
}

/** What a deployment of a given size costs and ties up. */
export function deploymentTerms(
  kind: Deployment['kind'],
  scale: number,
  moneyScale = 1,
): { commitment: number; cost: number } {
  const base = { peacekeeping: 1.0, alliance: 1.2, combat: 1.8, training: 0.4 }[kind];
  return {
    commitment: clamp(scale * 0.25, 0.02, 0.4),
    /* A brigade costs what a brigade costs in the country paying for it.
       The constant is written at Verdana's scale, so it is carried to the
       national one like every other price in the game. */
    cost: scale * base * 34 * moneyScale,
  };
}

/** A one-line account of what the forces could actually do. */
export function describeForces(military: Military, world: World): string {
  const power = combatPower(military);
  const away = combatPower(military, true);
  const committed = committedShare(military);

  if (committed > 0.4) {
    return `Most of the force is committed. ${Math.round(committed * 100)}% is somewhere else, and what is left at home would be enough for a quiet decade rather than an interesting one.`;
  }
  if (deterrence(military, world) > 90) {
    return 'Capable, modern and allied. Nobody in the region is planning anything that involves Verdana, which is what the money was for.';
  }
  if (power < 25) {
    return 'The forces exist on paper. What is on the paper has not been ready for years, and a government that needed them would find that out in the first week.';
  }
  if (away < power * 0.4) {
    return 'Adequate at home and unable to go anywhere. A defensible position, and a decision — it means every obligation abroad is one the country cannot actually meet.';
  }
  return 'A middling force, ageing at the usual rate, able to do one thing at a time.';
}

export { ARM_TEMPLATES, DOCTRINE_TEMPLATES, findArm, findDoctrine, findProgramme };
