/**
 * manpower.ts — the distance between a population and an army.
 *
 * The mechanic this file exists for: A COUNTRY CAN HAVE TWO MILLION MEN
 * OF MILITARY AGE AND NO ARMY. The pool is not the force. Between them
 * sits a training pipeline measured in months that cannot be bought,
 * shortened only slightly by money and not at all by urgency, and a
 * government that discovers this in week one of a war has discovered it
 * too late.
 *
 * Four consequences follow and all four are the point.
 *
 * AN ARMY IS A FLOW, NOT A STOCK. People arrive, serve, and go home, and
 * the headcount only looks still because the three are in balance. Every
 * arrangement in this file is written so that an untouched country sits
 * exactly where it was found — the intake replaces the discharge and
 * nothing drifts. Which means that anything that disturbs the flow shows
 * up immediately and honestly, instead of being lost in a trend the
 * engine was producing anyway.
 *
 * LENGTH OF SERVICE DECIDES THE SHAPE OF THE ARMY, NOT ITS SIZE. A
 * ten-year career accumulates veterans; an eighteen-month term never
 * does, because the people it raises leave again before they are any
 * good. Two countries with identical headcounts under the two
 * arrangements are not fielding comparable armies, and the one with the
 * bigger number is usually the weaker.
 *
 * MOBILISATION IS A RATCHET. Raising it is an afternoon's decision.
 * Lowering it takes years: the people are still in uniform, the factories
 * are still built for it, and the constituency that formed around the
 * arrangement is still there. A government that conscripts to win a war
 * hands its successor a conscripting country.
 *
 * AND EVERY SOLDIER IS A WORKER WHO IS NOT AT WORK. Mobilisation strips
 * the civilian labour force, hardest under the arrangements that raise
 * the most people. The economy notices before the enemy does.
 */

import {
  CAPACITY_DECAY,
  CAPACITY_GROWTH,
  CASUALTY_CEILING,
  DEMOBILISATION_RATE,
  DESERTION_ALARM,
  DESERTION_BASE,
  ELIGIBLE_SHARE,
  MOBILISATION_RATCHET,
  MORALE_ADJUST_RATE,
  MORALE_BASE,
  QUALITY_RECRUIT_PENALTY,
  QUALITY_STRAIN_PENALTY,
  QUALITY_VETERAN_BONUS,
  RESERVE_CALL_RATE,
  RESERVE_RUST,
  TRAINING_HEADROOM,
  VETERAN_PEACE_RATE,
  WAR_REACH,
} from '../balance.ts';
import {
  MANPOWER_MODELS,
  TRAINING_WEEKS,
  findManpowerModel,
  type ManpowerModel,
} from '../content/manpower.ts';
import type { Manpower } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * The arithmetic of a standing army
 * ------------------------------------------------------------------ */

/**
 * How many people the country can put under arms under a given
 * arrangement, given the pool it draws from.
 *
 * At war the same rules reach further — deferments stop being granted,
 * the age band widens, the medical standard falls — but only so far.
 * Past that the government has to legislate, and the war arrives on the
 * domestic desk.
 */
export function establishment(pool: number, model: ManpowerModel, atWar: boolean): number {
  return pool * findManpowerModel(model).reach * (atWar ? WAR_REACH : 1);
}

/**
 * The weeks a soldier spends in the army, start to finish.
 *
 * Fourteen in training and then the arrangement's term. The sum is what
 * decides the intake a standing force needs: an army of E people with a
 * career of L weeks must take in E/L people every week merely to stay
 * the same size, and a government that cuts the recruiting budget has
 * not saved money, it has started shrinking the army with a lag of
 * several years.
 */
export function careerWeeks(model: ManpowerModel): number {
  return TRAINING_WEEKS.recruit + findManpowerModel(model).serviceWeeks;
}

/** What it takes each week to hold a force of this size still. */
export function replacementIntake(force: number, model: ManpowerModel): number {
  return force / careerWeeks(model);
}

/**
 * The shape a given arrangement settles into, as shares of the force.
 *
 * Solved rather than asserted, from the three rates that govern the
 * pipeline: fourteen weeks of training, a discharge rate of one over the
 * term, and a peacetime promotion to veteran so slow it barely counts.
 * The result is the whole argument against conscription in three
 * numbers — a conscript army is a sixth recruits and a twentieth
 * veterans, and a professional one is the other way round.
 *
 * Everything downstream is written as a deviation from these, so an
 * untouched country sits exactly at its arrangement's own quality
 * instead of drifting toward whichever end of the scale the formulas
 * happen to favour.
 */
export function restShares(model: ManpowerModel): {
  recruits: number;
  trained: number;
  veterans: number;
} {
  const discharge = 1 / findManpowerModel(model).serviceWeeks;
  const blooding = VETERAN_PEACE_RATE;
  const career = careerWeeks(model);
  return {
    recruits: TRAINING_WEEKS.recruit / career,
    trained: 1 / (discharge + blooding) / career,
    veterans: blooding / (discharge * (discharge + blooding)) / career,
  };
}

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

/**
 * The army the government inherits.
 *
 * Built from the same expressions the weekly step uses, which is not
 * fastidiousness: if the opening state is not a fixed point of the step,
 * then every country starts drifting on turn one and every measurement
 * taken afterwards is measuring the drift rather than the government.
 */
export function buildManpower(workforce: number, peopleScale: number): Manpower {
  const model: ManpowerModel = 'professional';
  const template = findManpowerModel(model);
  const pool = Math.max(0, workforce * 1_000_000 * ELIGIBLE_SHARE);
  const force = establishment(pool, model, false);
  const rest = restShares(model);

  return {
    model,
    pool,
    recruits: force * rest.recruits,
    trained: force * rest.trained,
    veterans: force * rest.veterans,
    /* Where the time-served have gone. The only fast source of soldiers
       the country has, and it is finite. */
    reserves: force * template.reserveRatio,
    /* Enough to replace the people leaving, and some headroom. Nobody
       builds a training establishment for a war they are not in. */
    trainingCapacity: replacementIntake(force, model) * TRAINING_HEADROOM,
    morale: MORALE_BASE,
    quality: template.baseQuality,
    desertion: 0,
    resistance: 0,
    mobilisedSince: 0,
    peopleScale,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/** Everybody currently under arms. */
export function underArms(manpower: Manpower): number {
  return manpower.recruits + manpower.trained + manpower.veterans;
}

/** And everybody who could be, if the war went on long enough. */
export function mobilisableForce(manpower: Manpower): number {
  return establishment(manpower.pool, manpower.model, true) + manpower.reserves;
}

/**
 * What the force is actually worth, as an index.
 *
 * Recruits are not soldiers and veterans are worth several of them. An
 * army that doubles its headcount does not double its strength, and an
 * army that has been fighting for three years is worth more than its
 * numbers suggest right up until the veterans are gone.
 */
export function effectiveStrength(manpower: Manpower): number {
  const bodies = manpower.recruits * 0.35 + manpower.trained * 1 + manpower.veterans * 1.55;
  return bodies * (manpower.morale / MORALE_BASE) * (manpower.quality / 60);
}

/** How much of the civilian labour force is in uniform instead. */
export function labourDrawn(manpower: Manpower): number {
  return underArms(manpower) * findManpowerModel(manpower.model).labourDraw;
}

/**
 * The army's share of everybody under arms.
 *
 * The manpower engine counts the whole armed forces, because the
 * training pipeline, the reserve and the pool are shared: a country does
 * not have a separate population of military age for its navy. The order
 * of battle is the army's part of that, and this is where the two
 * numbers are reconciled rather than each being asserted separately.
 *
 * Stated flatly rather than derived from the arms' manpower shares,
 * which are a measure of how many people a unit of each arm's STRENGTH
 * costs and are not a headcount split. Deriving one from the other looks
 * tidier and gives a country a cyber command the size of its army.
 */
export const ARMY_SHARE = 0.55;

/** Weeks before the current arrangement could be wound back down. */
export function demobilisationLockWeeks(manpower: Manpower, turn: number): number {
  const template = findManpowerModel(manpower.model);
  return Math.max(0, template.demobilisationWeeks - (turn - manpower.mobilisedSince));
}

/**
 * How much of the force the reserve could still add.
 *
 * Falls to nothing over the first year of a serious war, and the week it
 * does is the week the war changes character: up to then the country has
 * been calling up soldiers, and after it the country is training
 * civilians.
 */
export function reserveDepth(manpower: Manpower): number {
  return manpower.reserves / Math.max(1, underArms(manpower));
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface ManpowerInputs {
  /** Working-age population, in millions. The pool is drawn from this. */
  workforce: number;
  /** Unemployment. A volunteer force recruits best when the economy is worst. */
  unemployment: number;
  /** What the defence line is funding training at, relative to need. */
  trainingFunding: number;
  /** Casualties this week, in thousands, as the war engine counts them. */
  casualties: number;
  /** Whether there is a war on, and how hard it is. */
  atWar: boolean;
  warIntensity: number;
  /** Public support for the war, which decides whether anybody turns up. */
  publicSupport: number;
  /** And the norms, which decide whether refusing is thinkable. */
  norms: number;
  /** What the force is being fed at, 0–100. The largest term in morale. */
  supply: number;
  turn: number;
}

export interface ManpowerTick {
  manpower: Manpower;
  /** True the week the training pipeline becomes the binding constraint. */
  pipelineBound: boolean;
  /** True the week the reserve runs out and the country starts training civilians. */
  reserveExhausted: boolean;
  /** True the week desertion becomes a visible problem. */
  desertionAlarm: boolean;
  /** People who left the army this week and went back to work. */
  discharged: number;
  /**
   * Soldiers who became available this week — out of training, or called
   * back off the reserve.
   *
   * The number the order of battle is actually rebuilt out of, and the
   * reason a formation ground down in March is still short in September.
   */
  arrivals: number;
}

export function stepManpower(manpower: Manpower, inputs: ManpowerInputs): ManpowerTick {
  const template = findManpowerModel(manpower.model);
  const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;
  const force = underArms(manpower);

  /* ---- 1. The pool, and what the arrangement reaches. ---- */
  const pool = Math.max(0, inputs.workforce * 1_000_000 * ELIGIBLE_SHARE);
  const peacetimeEstablishment = establishment(pool, manpower.model, false);
  const wanted = establishment(pool, manpower.model, inputs.atWar);

  /* ---- 2. Out. ---- */
  /*
   * Discharge. The term ends and people go home, and they go home in
   * the middle of wars as readily as out of them, because the
   * alternative is a decision somebody has to take and defend.
   */
  const dischargeRate = 1 / template.serviceWeeks;

  /*
   * And once the shooting stops, the emergency extensions lapse — all of
   * them, more or less at once, because every one of them needs somebody
   * to sign it and nobody will. A country that mobilised to two and a
   * half times its establishment is back down inside a year, which is
   * why demobilisation is remembered as a summer rather than a policy.
   *
   * It is not the ratchet coming undone. The ratchet is the ARRANGEMENT,
   * which is a law and stays on the books, and which is exactly why the
   * next government inherits a country that can do all of this again at
   * a fortnight's notice.
   */
  const surplus = Math.max(0, force - wanted);
  const releaseRate = inputs.atWar ? 0 : DEMOBILISATION_RATE;
  const served = manpower.trained + manpower.veterans;
  const release = Math.min(surplus, served * releaseRate);

  const dischargedTrained =
    manpower.trained * dischargeRate + (release * manpower.trained) / Math.max(1, served);
  const dischargedVeterans =
    manpower.veterans * dischargeRate + (release * manpower.veterans) / Math.max(1, served);
  const discharged = dischargedTrained + dischargedVeterans;
  /* What the army has to replace to stay the size it is. The release is
     deliberately not in here: replacing the people you have just let go
     is how an army fails to demobilise. */
  const ordinaryDischarge = served * dischargeRate;

  /*
   * Desertion. Rises with bad morale, with a war the country does not
   * support, and with an arrangement people resent being under. It is
   * the quiet way an army stops existing without losing a battle.
   */
  /*
   * Morale enters faster than linearly, because that is how it goes. An
   * army at forty is unhappy and an army at fifteen is dissolving, and
   * the distance between those two is not the same as the distance
   * between sixty and forty-five.
   */
  const moraleFactor = 1 + Math.max(0, (MORALE_BASE - manpower.morale) / 22) ** 1.8;
  const desertionRate = clamp(
    DESERTION_BASE * moraleFactor * (1 + manpower.resistance) * (inputs.atWar ? 1.6 : 0.3),
    0,
    0.02,
  );
  const deserters = force * desertionRate;

  /*
   * Casualties fall disproportionately on the experienced, because they
   * are the ones sent where it matters. An army that fights for three
   * years is a different army by the end of it, and worse, which is the
   * thing attritional arithmetic always misses.
   */
  const casualties = Math.min(force * CASUALTY_CEILING, inputs.casualties * 1000);
  const weights =
    (manpower.veterans / Math.max(1, force)) * 1.5 +
    (manpower.trained / Math.max(1, force)) * 1.05 +
    (manpower.recruits / Math.max(1, force)) * 0.6;
  const share = (stage: number, weight: number) =>
    weights > 0 ? (casualties * (stage / Math.max(1, force)) * weight) / weights : 0;

  /* ---- 3. In. ---- */
  /*
   * The intake a standing army needs is not the gap; it is the outflow.
   * A force at its establishment still has to recruit its whole strength
   * over a career or it shrinks, and a government that cuts recruiting
   * has not saved money — it has started shrinking the army with a lag
   * of several years, which is long enough to be somebody else's problem.
   */
  const outflow = ordinaryDischarge + deserters + casualties;
  const gap = Math.max(0, wanted - force);
  const soughtIntake = surplus > 0 ? 0 : outflow + gap * template.intakeRate;

  /*
   * A volunteer force recruits best when the economy is worst, which is
   * an uncomfortable fact that no recruiting campaign has ever changed.
   * Conscription does not care about the labour market at all — it cares
   * whether refusing it is thinkable, which is a different question and
   * a worse one for the government.
   */
  const marketPull = template.resistance < 0.1 ? 1 + (inputs.unemployment - 5) * 0.04 : 1;
  const willingness =
    template.resistance < 0.1
      ? clamp(0.55 + (inputs.publicSupport / 50) * 0.45, 0.3, 1.5)
      : clamp(1 - manpower.resistance * 0.6, 0.35, 1);

  const intake = soughtIntake * marketPull * willingness;

  /*
   * The pipeline, and the constraint nobody plans for. Training capacity
   * is a building with instructors in it; it grows over years and cannot
   * be conjured by urgency. When the intake a war demands exceeds it,
   * the war is being fought by whoever is already in uniform, however
   * many people are volunteering.
   */
  const capacity = Math.max(
    manpower.trainingCapacity * 0.25,
    manpower.trainingCapacity * clamp(inputs.trainingFunding, 0.2, 2.2),
  );
  const admitted = Math.min(intake, capacity);
  const pipelineBound = intake > capacity * 1.02;

  /*
   * The reserve. Already trained, so they skip the fourteen weeks and
   * arrive as soldiers — which is why the first months of a war produce
   * an army and the months after that produce recruits. It is finite,
   * and the week it empties is the week the war changes character.
   */
  const reserveCall =
    inputs.atWar && gap > 0 ? Math.min(manpower.reserves, gap * RESERVE_CALL_RATE) : 0;

  const graduating = manpower.recruits / TRAINING_WEEKS.recruit;

  /*
   * And veterans. Made by fighting and, at a rate so slow it barely
   * registers, by serving long enough to have seen everything twice. A
   * peacetime army promotes people; it does not produce veterans.
   */
  const blooding = inputs.atWar
    ? manpower.trained * (inputs.warIntensity / 100) * (1 / TRAINING_WEEKS.trained)
    : manpower.trained * VETERAN_PEACE_RATE;

  const recruits = Math.max(
    0,
    manpower.recruits + admitted - graduating - share(manpower.recruits, 0.6) - deserters * 0.5,
  );
  const trained = Math.max(
    0,
    manpower.trained +
      graduating +
      reserveCall -
      blooding -
      dischargedTrained -
      share(manpower.trained, 1.05) -
      deserters * 0.35,
  );
  const veterans = Math.max(
    0,
    manpower.veterans +
      blooding -
      dischargedVeterans -
      share(manpower.veterans, 1.5) -
      deserters * 0.15,
  );
  const nextForce = recruits + trained + veterans;

  /*
   * The reserve receives the discharged and loses people to age at the
   * rate that holds it at its arrangement's own depth. A country that
   * has just fought a war has a large reserve for a decade afterwards,
   * which is most of why the decade after a war is so dangerous.
   */
  const reserveHold = template.reserveRatio * careerWeeks(manpower.model);
  const reserves = Math.max(
    0,
    manpower.reserves + discharged - reserveCall - manpower.reserves / reserveHold,
  );

  /* ---- 4. Morale, quality, resistance. ---- */
  /*
   * Morale is written as a deviation from an ordinary peacetime army:
   * being fed, being supported at home, not being at war, and not being
   * held somewhere people resent. Supply is the largest of the four and
   * is the one the government has the least direct control over.
   */
  const moraleTarget = clamp100(
    MORALE_BASE +
      /*
       * Whether the country is behind them matters when they are being
       * asked to do something. It is not why a peacetime army's morale
       * moves, and wiring it in unconditionally had every army in the
       * world slowly demoralising because its government was unpopular,
       * which is not a thing that happens.
       */
      (inputs.atWar ? (inputs.publicSupport - 50) * 0.3 : 0) +
      (inputs.supply - 100) * 0.3 -
      (inputs.atWar ? 6 + (inputs.warIntensity / 100) * 10 : 0) -
      manpower.resistance * 22,
  );
  const morale = clamp100(toward(manpower.morale, moraleTarget, MORALE_ADJUST_RATE));

  /*
   * Quality falls as the numbers rise. The first hundred thousand are
   * volunteers; the last are whoever is left, trained for a third as
   * long and led by officers promoted twice in a year.
   *
   * Written against the arrangement's own rest shape, so an untouched
   * country sits at its own standard rather than drifting toward
   * whichever end of the scale the formula happens to favour.
   */
  const rest = restShares(manpower.model);
  const strain = clamp(nextForce / Math.max(1, peacetimeEstablishment), 0, 4);
  const qualityTarget = clamp100(
    template.baseQuality -
      Math.max(0, strain - 1) * template.baseQuality * QUALITY_STRAIN_PENALTY +
      (veterans / Math.max(1, nextForce) - rest.veterans) * QUALITY_VETERAN_BONUS * 100 * 0.01 -
      (recruits / Math.max(1, nextForce) - rest.recruits) * QUALITY_RECRUIT_PENALTY * 100 * 0.01 -
      /* Recalled reservists are soldiers, but they have been out. */
      (reserveCall / Math.max(1, nextForce)) * (1 - RESERVE_RUST) * 100,
  );
  const quality = clamp100(toward(manpower.quality, qualityTarget, 0.02));

  /*
   * Resistance to being called. Builds where the arrangement asks a lot,
   * the war is unpopular, and the norms are thin enough that refusing is
   * thinkable. It does not fall quickly, because the arrangement that
   * produced it is still on the statute book.
   */
  const resistanceTarget = clamp(
    template.resistance *
      (1 + (50 - inputs.publicSupport) / 60) *
      (1 + (70 - inputs.norms) / 140),
    0,
    1,
  );
  const resistance = clamp(
    manpower.resistance +
      (resistanceTarget - manpower.resistance) *
        (resistanceTarget > manpower.resistance ? 0.02 : 0.004),
    0,
    1,
  );

  /*
   * Training capacity follows what the country is funding, slowly. Its
   * resting value is exactly the headroom over replacement, so a country
   * left alone neither builds nor loses the establishment — and a
   * country that wants to expand one discovers it takes years.
   */
  const capacityTarget =
    replacementIntake(wanted, manpower.model) *
    TRAINING_HEADROOM *
    clamp(inputs.trainingFunding, 0.3, 2);
  const trainingCapacity = Math.max(
    0,
    toward(
      manpower.trainingCapacity,
      capacityTarget,
      capacityTarget > manpower.trainingCapacity ? CAPACITY_GROWTH : CAPACITY_DECAY,
    ),
  );

  const next: Manpower = {
    ...manpower,
    pool,
    recruits,
    trained,
    veterans,
    reserves,
    trainingCapacity,
    morale,
    quality,
    desertion: deserters,
    resistance,
    history: [
      ...manpower.history,
      {
        turn: inputs.turn,
        underArms: nextForce,
        strength: effectiveStrength({ ...manpower, recruits, trained, veterans, morale, quality }),
        morale,
        quality,
      },
    ].slice(-208),
  };

  return {
    manpower: next,
    pipelineBound,
    reserveExhausted: reserves < force * 0.05 && manpower.reserves >= force * 0.05,
    desertionAlarm:
      desertionRate > DESERTION_ALARM &&
      manpower.desertion / Math.max(1, force) <= DESERTION_ALARM,
    discharged,
    arrivals: graduating + reserveCall,
  };
}

/* ------------------------------------------------------------------ *
 * Changing the arrangement
 * ------------------------------------------------------------------ */

/** Whether the country can move to a given arrangement, and what it costs. */
export function mobilisationChange(
  manpower: Manpower,
  to: ManpowerModel,
  turn: number,
): {
  allowed: boolean;
  reason: string;
  approvalCost: number;
  normsCost: number;
  politicalCapital: number;
} {
  const from = MANPOWER_MODELS.indexOf(manpower.model);
  const target = MANPOWER_MODELS.indexOf(to);
  const step = target - from;

  if (step === 0) {
    return {
      allowed: false,
      reason: 'That is the arrangement already.',
      approvalCost: 0,
      normsCost: 0,
      politicalCapital: 0,
    };
  }

  /*
   * The ratchet. Going up is an afternoon's decision; coming down is
   * not, because the people are still in uniform, the factories are
   * still built for it, and the constituency that formed around the
   * arrangement is still there.
   */
  if (step < 0) {
    const locked = demobilisationLockWeeks(manpower, turn);
    if (locked > 0) {
      return {
        allowed: false,
        reason: `Not for another ${Math.ceil(locked / 4)} months. Winding this down is not a decision, it is a programme: the people are still in uniform and the arrangements around them are still standing.`,
        approvalCost: 0,
        normsCost: 0,
        politicalCapital: 0,
      };
    }
  }

  const upward = Math.max(0, step);
  const to_ = findManpowerModel(to);
  return {
    allowed: true,
    reason: '',
    /* Raising it costs standing immediately and in proportion to how far
       up it goes. Lowering it returns a little. */
    approvalCost: upward * 4.5 - Math.max(0, -step) * 1.5,
    /* And conscription against a country that does not want it is a
       constitutional act as much as a military one. */
    normsCost: upward * to_.resistance * 3.5 * MOBILISATION_RATCHET,
    politicalCapital: 6 + upward * 7,
  };
}

/** Move the country to a new arrangement. The ratchet is set from here. */
export function applyMobilisation(
  manpower: Manpower,
  to: ManpowerModel,
  turn: number,
): Manpower {
  return { ...manpower, model: to, mobilisedSince: turn };
}

/** One line on what the country has under arms. */
export function describeManpower(manpower: Manpower): string {
  const template = findManpowerModel(manpower.model);
  const force = underArms(manpower);
  const rest = restShares(manpower.model);
  const veteranShare = manpower.veterans / Math.max(1, force);

  if (manpower.resistance > 0.45) {
    return `${template.label}, and ${(manpower.resistance * 100).toFixed(0)}% of those eligible are looking for a way out of it. An arrangement the country has stopped consenting to does not raise the numbers on paper.`;
  }
  if (reserveDepth(manpower) < 0.08) {
    return `${(force / 1000).toFixed(0)}k under arms and a reserve that is effectively gone. From here the country is not calling up soldiers, it is training civilians, and that takes fourteen weeks before anybody is any use.`;
  }
  if (manpower.recruits > manpower.trained) {
    return `${(force / 1000).toFixed(0)}k under arms, and more of them are recruits than trained soldiers. The pool is not the force: what stands between them is months that cannot be bought.`;
  }
  if (veteranShare < rest.veterans * 0.5) {
    return `${(force / 1000).toFixed(0)}k under arms, of whom ${(veteranShare * 100).toFixed(1)}% have ever been in a war. Length of service is not experience, and the first six months of any war are the price of finding that out.`;
  }
  return `${(force / 1000).toFixed(0)}k under arms — ${((force / Math.max(1, manpower.pool)) * 100).toFixed(2)}% of those eligible — at quality ${manpower.quality.toFixed(0)} and morale ${manpower.morale.toFixed(0)}. ${template.blurb}`;
}
