/**
 * cabinet.ts — the table, and the building behind it.
 *
 * A CABINET IS A COALITION YOU HAVE TO KEEP, NOT A TEAM YOU PICKED.
 * Almost nobody is there because they are the best person for the
 * department; they are there because of what they represent, and the
 * appointment is the payment. Sacking a minister is therefore not a
 * personnel decision but the withdrawal of a payment, and the person who
 * notices is not the minister.
 *
 * AMBITION IS THE THIRD AXIS. Competence and loyalty are drawn
 * independently, as for generals. Ministers have a third: how much they
 * want the job above them. The dangerous one is not the incompetent
 * minister or the disloyal one — it is the able, ambitious minister who
 * is loyal right up until the arithmetic changes, and a government needs
 * several of those because the able ones are ambitious and the
 * unambitious ones are usually unambitious for a reason.
 *
 * MINISTERS ARE CAPTURED BY THEIR DEPARTMENTS in about eighteen months.
 * They arrive to change it and end up arguing its case in cabinet,
 * because they now know things the rest of the cabinet does not and
 * because the officials are extremely good at their jobs. Every
 * government finds this surprising and every government causes it.
 *
 * AND THE CIVIL SERVICE OUTLASTS YOU AND KNOWS IT. It has its own view,
 * its own timescale, and the ability to do exactly what it was told in a
 * way that takes four years. A government that fights it wins on the day
 * and loses over the term. A government that replaces it gets compliance
 * immediately and loses the capability with the people who left — and
 * the next government inherits both. There is no correct setting, which
 * is why it is on the desk rather than resolved by the engine.
 */

import {
  CAPABILITY_GAIN,
  CAPABILITY_LOSS,
  CAPTURE_WEIGHT,
  COHESION_BASE,
  COHESION_BREAKS,
  COHESION_RATE,
  DEPARTURE_MORALE,
  DEPARTURE_RATE,
  MACHINE_CAPABILITY,
  MACHINE_MORALE_RATE,
  RESHUFFLE_DECAY,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  CAPTURE_WEEKS,
  LEADERSHIP_AMBITION,
  MINISTER_TRAITS,
  findBasis,
  findMinisterTrait,
  findPosture,
  type AppointmentBasis,
  type MachinePosture,
  type MinisterTrait,
} from '../content/cabinet.ts';
import { MINISTRY_TEMPLATES, type MinistryKey } from '../content/ministries.ts';
import { makeName } from './personas.ts';
import type { Rng } from '../rng.ts';
import type { CountryKey } from '../content/world/countries.ts';
import type { Cabinet, CivilService, Minister } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

/**
 * The table a leader puts together on the first morning.
 *
 * Mostly not the best people for the departments. A government that
 * wanted that would not have a party behind it, and the party is what
 * put it there.
 */
export function buildCabinet(country: CountryKey, rng: Rng, used: Set<string>): Cabinet {
  const bases: AppointmentBasis[] = [
    'loyalist',
    'faction',
    'technocrat',
    'rival',
    'regional',
    'reward',
    'loyalist',
    'faction',
  ];

  const ministers: Minister[] = MINISTRY_TEMPLATES.map((ministry, i) =>
    makeMinister(ministry.key, bases[i % bases.length]!, country, rng, used, 0),
  );

  return {
    ministers,
    cohesion: COHESION_BASE,
    reshuffles: 0,
    resignations: 0,
    history: [],
  };
}

/** Somebody for a department, on whatever basis they came. */
export function makeMinister(
  ministry: MinistryKey,
  basis: AppointmentBasis,
  country: CountryKey,
  rng: Rng,
  used: Set<string>,
  turn: number,
): Minister {
  const template = findBasis(basis);
  const traits: MinisterTrait[] = [];
  for (let attempt = 0; attempt < 10 && traits.length < 2; attempt += 1) {
    const pick = MINISTER_TRAITS[rng.int(0, MINISTER_TRAITS.length - 1)]!.key;
    if (!traits.includes(pick)) traits.push(pick);
  }

  /*
   * Centred on what the basis usually produces, and spread widely
   * around it, because a faction's candidate is sometimes excellent and
   * a technocrat is sometimes a disaster. What does not vary is what
   * removing them costs.
   */
  const around = (centre: number) => clamp100(centre - 18 + rng.range(0, 36));

  return {
    id: `min-${ministry}-${turn}-${Math.round(rng.range(1000, 9999))}`,
    name: makeName(rng, country, used),
    ministry,
    basis,
    traits,
    competence: around(template.competence),
    loyalty: around(template.loyalty),
    ambition: around(template.ambition),
    standing: 50,
    /* Nobody has gone native on their first morning. */
    capture: 0,
    appointedTurn: turn,
    owes: basis === 'faction' || basis === 'coalition' ? basis : null,
    resigned: false,
  };
}

/** The building, as it was left by whoever was here before. */
export function buildCivilService(): CivilService {
  return {
    posture: 'partnership',
    capability: MACHINE_CAPABILITY,
    /* Written as the step writes it, so an untouched government neither
       gains nor loses compliance on its first week. */
    compliance:
      findPosture('partnership').compliance *
      (1 - (1 - 62 / 100) * findPosture('partnership').moraleWeight),
    morale: 62,
    /* What the building knows that nobody wrote down. An inheritance,
       and nobody in this run built it. */
    memory: 72,
    departures: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

export function sittingMinisters(cabinet: Cabinet): Minister[] {
  return cabinet.ministers.filter((m) => !m.resigned);
}

export function ministerFor(cabinet: Cabinet, ministry: MinistryKey): Minister | undefined {
  return sittingMinisters(cabinet).find((m) => m.ministry === ministry);
}

/** What a minister's traits do to a given quantity. */
export function ministerTraitEffect(
  minister: Minister,
  field: 'delivery' | 'machine' | 'presentation' | 'cohesion',
): number {
  return minister.traits.reduce((sum, key) => sum + findMinisterTrait(key)[field], 0);
}

/**
 * How much of what the government decided actually happens at a
 * department.
 *
 * The minister's competence, what the officials will do for them, and
 * what the machine is capable of — in that order of visibility and the
 * reverse order of importance.
 */
export function delivery(
  minister: Minister | undefined,
  machine: CivilService,
): number {
  const capable = (machine.capability / 100) * machine.compliance;
  if (!minister) {
    /* Nobody in post. The department runs itself, which it is perfectly
       able to do and which is not the same as being governed — so it
       sits below what even a poor minister delivers, because a poor
       minister is at least pointing it somewhere. */
    return capable * 0.62;
  }
  return clamp(
    capable * (0.55 + (minister.competence / 100) * 0.7 + ministerTraitEffect(minister, 'delivery')),
    0.1,
    1.5,
  );
}

/**
 * Whose case a minister argues in cabinet.
 *
 * Zero on the first morning and most of the way to the department's by
 * eighteen months. It is not disloyalty; it is knowing things the rest
 * of the table does not.
 */
export function arguesFor(minister: Minister): 'government' | 'department' {
  return minister.capture > CAPTURE_WEIGHT ? 'department' : 'government';
}

/** Ministers who are counting rather than sittingMinisters. */
export function plotting(cabinet: Cabinet): Minister[] {
  return sittingMinisters(cabinet).filter(
    (m) => m.ambition > LEADERSHIP_AMBITION && m.loyalty < 50,
  );
}

/**
 * What removing a minister costs, beyond the person.
 *
 * The appointment was a payment. Removing it is a withdrawal, and the
 * person who notices is whoever the payment was to.
 */
export function removalCost(minister: Minister): number {
  const template = findBasis(minister.basis);
  /* And a minister the public rates is much more expensive to remove
     than one nobody can name, regardless of what they are like to work
     with. */
  return template.removalCost * (0.6 + (minister.standing / 100) * 0.9);
}

/** What a reshuffle is worth now, which is less each time. */
export function reshuffleValue(cabinet: Cabinet): number {
  return RESHUFFLE_DECAY ** cabinet.reshuffles;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface CabinetInputs {
  /** The leader's standing, which is what holds a table together. */
  approval: number;
  /** And whether the party thinks it is going to win. */
  polling: number;
  /** How the government is doing at what it said it would do. */
  delivery: number;
  /** Whether there is a crisis on, which suspends ordinary arithmetic. */
  crisis: boolean;
  turn: number;
}

export interface CabinetTick {
  cabinet: Cabinet;
  /** Ministers who have gone native this week. */
  captured: string[];
  /** Ministers who have resigned. */
  resigned: Minister[];
  /** True the week collective responsibility stops being collective. */
  brokeDown: boolean;
  /** Ministers now counting rather than sittingMinisters. */
  plotters: string[];
}

export function stepCabinet(cabinet: Cabinet, inputs: CabinetInputs): CabinetTick {
  const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;
  const captured: string[] = [];
  const resigned: Minister[] = [];
  const plotters: string[] = [];

  const ministers = cabinet.ministers.map((minister) => {
    if (minister.resigned) return minister;

    /*
     * Capture. They arrive to change the department and end up arguing
     * its case, on a clock of about eighteen months that runs the same
     * for everybody and is not affected by anything the leader does.
     */
    const capture = clamp(minister.capture + 1 / CAPTURE_WEEKS, 0, 1);
    if (capture > CAPTURE_WEIGHT && minister.capture <= CAPTURE_WEIGHT) {
      captured.push(minister.id);
    }

    /* Standing follows the department, and the department's results are
       attributed to whoever is in the chair. */
    const standing = clamp100(
      toward(minister.standing, 50 + (inputs.delivery - 0.6) * 60 + ministerTraitEffect(minister, 'presentation') * 30, 0.05),
    );

    /*
     * And loyalty follows the arithmetic. A minister's loyalty is not a
     * character trait; it is a calculation about whether this leader is
     * going to win, and the able ambitious ones do it most carefully.
     */
    const prospects = (inputs.approval + inputs.polling) / 2;
    const loyaltyTarget = clamp100(
      30 + prospects * 0.75 - (minister.ambition - 50) * 0.35 + (inputs.crisis ? 12 : 0),
    );
    const loyalty = clamp100(toward(minister.loyalty, loyaltyTarget, 0.02));

    if (minister.ambition > LEADERSHIP_AMBITION && loyalty < 50) plotters.push(minister.id);

    return { ...minister, capture, standing, loyalty };
  });

  /*
   * Cohesion. Not loyalty to the leader — whether collective
   * responsibility is actually collective, which is a different and more
   * fragile thing. It follows the leader's standing, what the table is
   * made of, and how many people at it are counting.
   */
  const post = ministers.filter((m) => !m.resigned);
  const traitPull = post.reduce((sum, m) => sum + ministerTraitEffect(m, 'cohesion'), 0);
  const counting = post.filter((m) => m.ambition > LEADERSHIP_AMBITION && m.loyalty < 50).length;
  const cohesionTarget = clamp100(
    COHESION_BASE +
      (inputs.approval - 50) * 0.55 +
      traitPull * 22 -
      counting * 9 +
      (inputs.crisis ? 8 : 0),
  );
  const cohesion = clamp100(toward(cabinet.cohesion, cohesionTarget, COHESION_RATE));

  const next: Cabinet = {
    ...cabinet,
    ministers,
    cohesion,
    history: [
      ...cabinet.history,
      { turn: inputs.turn, cohesion, delivery: inputs.delivery, plotting: counting },
    ].slice(-208),
  };

  return {
    cabinet: next,
    captured,
    resigned,
    brokeDown: cohesion < COHESION_BREAKS && cabinet.cohesion >= COHESION_BREAKS,
    plotters,
  };
}

export interface MachineInputs {
  /** What the administration line is funded at. */
  funding: number;
  /** How much the government is asking of the machine this week. */
  demands: number;
  turn: number;
}

export interface MachineTick {
  machine: CivilService;
  /** Officials lost this week. Capability goes with them. */
  departures: number;
  /** True the week the building stops being able to do what it is told. */
  hollowed: boolean;
  /** True the week institutional memory drops below usable. */
  forgot: boolean;
}

export function stepCivilService(
  machine: CivilService,
  inputs: MachineInputs,
): MachineTick {
  const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;
  const posture = findPosture(machine.posture);

  /*
   * Morale moves fastest of the three, which is why a government that
   * has decided to fight the machine sees no effect for a year and then
   * a great deal of effect for the rest of its term.
   */
  const morale = clamp100(
    toward(machine.morale, clamp100(62 + posture.moraleEffect * 180), MACHINE_MORALE_RATE),
  );

  /*
   * Departures. Officials do not resign in protest; they take the other
   * job, quietly, and the capability goes with them because it was never
   * written down.
   */
  const departures =
    morale < DEPARTURE_MORALE
      ? machine.capability * DEPARTURE_RATE * ((DEPARTURE_MORALE - morale) / 20)
      : 0;

  /*
   * Capability. Built over decades and lost in a term — the asymmetry
   * that makes it worth protecting and the reason nobody does.
   */
  const capabilityTarget = clamp100(
    MACHINE_CAPABILITY * posture.capability * clamp(inputs.funding, 0.5, 1.25),
  );
  const capability = clamp100(
    toward(
      machine.capability,
      capabilityTarget,
      capabilityTarget > machine.capability ? CAPABILITY_GAIN : CAPABILITY_LOSS,
    ) - departures,
  );

  /*
   * And memory, which is not capability. It is what the building knows
   * that nobody wrote down: which things have been tried, why they
   * failed, and who to ring. It is lost with the people and cannot be
   * recovered by hiring more.
   */
  /*
   * Memory only falls. A government does not build institutional memory;
   * it inherits it, spends it, or leaves it alone — which is why the
   * ordinary posture holds it exactly still and every other one does
   * not.
   */
  const memory = clamp100(machine.memory - posture.memoryLoss * 100 * 0.01 - departures * 0.8);

  /*
   * Compliance is how much of a decision actually happens. High under
   * politicisation and worth less than it looks, because what is being
   * complied with is being done by people who cannot do it.
   */
  /*
   * Officials appointed to comply do comply, whatever they think, which
   * is why politicisation buys the highest compliance in the file. What
   * it buys is compliance from people who cannot do the job — and for a
   * while this engine had it buying LESS compliance than partnership,
   * because morale was applied to every posture equally and inverted the
   * one mechanic the posture exists for.
   */
  const moraleFactor = 1 - (1 - morale / 100) * posture.moraleWeight;
  const compliance = clamp(
    posture.compliance * moraleFactor * clamp(1.1 - inputs.demands * 0.1, 0.6, 1.1),
    0.25,
    1,
  );

  const next: CivilService = {
    ...machine,
    capability,
    compliance,
    morale,
    memory,
    departures: machine.departures + departures,
    history: [
      ...machine.history,
      { turn: inputs.turn, capability, compliance, morale },
    ].slice(-208),
  };

  return {
    machine: next,
    departures,
    hollowed: capability < MACHINE_CAPABILITY * 0.75 && machine.capability >= MACHINE_CAPABILITY * 0.75,
    forgot: memory < 45 && machine.memory >= 45,
  };
}

/* ------------------------------------------------------------------ *
 * What a government can do about it
 * ------------------------------------------------------------------ */

/** Put somebody in a department. The appointment is the payment. */
export function appoint(
  cabinet: Cabinet,
  ministry: MinistryKey,
  basis: AppointmentBasis,
  country: CountryKey,
  rng: Rng,
  used: Set<string>,
  turn: number,
): { cabinet: Cabinet; minister: Minister; cost: number } {
  const going = ministerFor(cabinet, ministry);
  const cost = going ? removalCost(going) : 0;
  const minister = makeMinister(ministry, basis, country, rng, used, turn);

  return {
    cabinet: {
      ...cabinet,
      ministers: [
        ...cabinet.ministers.map((m) =>
          m.id === going?.id ? { ...m, resigned: true } : m,
        ),
        minister,
      ],
      /*
       * And the table notices. Everybody round it has just watched what
       * happens to somebody who was there on the same basis they are.
       */
      cohesion: clamp100(cabinet.cohesion - cost * 0.35),
    },
    minister,
    cost,
  };
}

/**
 * Move everybody at once.
 *
 * Worth less every time. The first reshuffle is a government taking
 * charge; the third is a government saying in public, on the front
 * pages, that it cannot make its ministers work.
 */
export function reshuffle(
  cabinet: Cabinet,
  country: CountryKey,
  rng: Rng,
  used: Set<string>,
  turn: number,
): { cabinet: Cabinet; moved: number; value: number } {
  const value = reshuffleValue(cabinet);
  const worst = sittingMinisters(cabinet)
    .slice()
    .sort((a, b) => a.competence + a.standing - (b.competence + b.standing))
    .slice(0, 3);

  let next = cabinet;
  for (const going of worst) {
    next = appoint(next, going.ministry, 'loyalist', country, rng, used, turn).cabinet;
  }

  return {
    cabinet: { ...next, reshuffles: cabinet.reshuffles + 1 },
    moved: worst.length,
    value,
  };
}

/** Decide how to treat the people who will still be here afterwards. */
export function setMachinePosture(machine: CivilService, posture: MachinePosture): CivilService {
  return { ...machine, posture };
}

/* ------------------------------------------------------------------ *
 * Describing it
 * ------------------------------------------------------------------ */

/** One line on the table. */
export function describeCabinet(cabinet: Cabinet, turn: number): string {
  const post = sittingMinisters(cabinet);
  const counting = plotting(cabinet);
  const captured = post.filter((m) => arguesFor(m) === 'department');

  if (cabinet.cohesion < COHESION_BREAKS) {
    return `Collective responsibility is not collective any more. Every unattributable quote in the weekend papers comes from one of these offices, and the government's position on anything is now whatever the last minister to be asked said it was.`;
  }
  if (counting.length > 1) {
    return `${counting.length} people at this table are counting rather than sittingMinisters. That is not disloyalty yet; it is arithmetic, and it is being done carefully by the ablest people in the room.`;
  }
  if (captured.length > post.length / 2) {
    return `Most of the cabinet now argues its department's case rather than the government's. They arrived to change those departments, they know things the rest of the table does not, and the officials are extremely good at their jobs.`;
  }
  const longest = [...post].sort((a, b) => a.appointedTurn - b.appointedTurn)[0];
  return `${post.length} ministers, cohesion ${cabinet.cohesion.toFixed(0)}${
    longest ? `, the longest-sittingMinisters in post ${Math.round((turn - longest.appointedTurn) / TURNS_PER_YEAR)} years` : ''
  }. ${cabinet.reshuffles > 0 ? `${cabinet.reshuffles} reshuffles so far, each worth less than the last.` : ''}`;
}

/** And one on the building. */
export function describeCivilService(machine: CivilService): string {
  const posture = findPosture(machine.posture);

  if (machine.memory < 45) {
    return `The building has forgotten. Not lost capacity — forgotten: which things have been tried, why they failed, and who to ring. That went with the people, it was never written down, and it cannot be recovered by hiring more.`;
  }
  if (machine.capability < MACHINE_CAPABILITY * 0.75) {
    return `Compliance is ${(machine.compliance * 100).toFixed(0)}% and capability is ${machine.capability.toFixed(0)}. The machine does what it is told and can no longer do it well, which is the trade that was made and is now permanent.`;
  }
  if (machine.morale < DEPARTURE_MORALE) {
    return `Officials are leaving. Not resigning in protest — taking the other job, quietly, and the capability goes with them because it was never written down anywhere.`;
  }
  return `${posture.label}: ${posture.blurb} Capability ${machine.capability.toFixed(0)}, and ${(machine.compliance * 100).toFixed(0)}% of any decision actually happens.`;
}
