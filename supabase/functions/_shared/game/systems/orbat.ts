/**
 * orbat.ts — the army as a structure, and the people who run it.
 *
 * Two mechanics, and neither is about moving units.
 *
 * ORDERS TAKE TIME TO ARRIVE. A decision taken at the top passes through
 * every echelon between there and the people who carry it out, and each
 * one costs days. The lag is real, it is a property of the structure
 * rather than of anybody's competence, and it means a government
 * responding to this week's despatch is acting on a battlefield that has
 * already moved. It is also why LARGE ARMIES ARE SLOW: a country with
 * two million soldiers has army groups, and an order from its capital
 * passes through seven headquarters before it reaches a rifle company,
 * where the same order in a country with thirty thousand passes through
 * four. Shortening the chain — better communications, a doctrine that
 * pushes decisions downward — is worth as much as any equipment
 * programme and is resisted by everybody whose job is one of the
 * echelons.
 *
 * COMPETENCE AND LOYALTY DO NOT CORRELATE. Every commander has both, and
 * the best officer in a country is not reliably the one its government
 * can depend on. A government that appoints only people it trusts gets
 * an army run by people who are trusted; one that appoints only the
 * capable gets an army it does not fully control. Both are ways to lose,
 * and there is no arrangement that avoids the choice — which is why it
 * is on the desk rather than resolved by the engine. And sacking the
 * general who lost the battle is the obvious thing to do, costs nothing
 * on the day, and is watched very closely by everybody who did not lose
 * a battle this week.
 *
 * The country manoeuvres at whatever ECHELON its army is big enough to
 * need. A small state gives orders to battalions; a superpower gives
 * them to corps. Both get a list of about the same length, because the
 * list is how a government sees its army and there is a limit to how
 * much of one anybody can hold in their head — which is, not by
 * coincidence, the reason armies are arranged in echelons at all.
 */

import {
  COMMAND_LAG_SCALE,
  FORMATION_TARGET_COUNT,
  RELIABILITY_PIVOT,
  RELIABILITY_SPAN,
  UNRELIABLE_ALARM,
} from '../balance.ts';
import {
  COMMANDER_TRAITS,
  ECHELON_ORDER,
  FORMATION_TEMPLATES,
  findEchelon,
  findFormation,
  findTrait,
  type CommanderTrait,
  type EchelonKey,
  type FormationKind,
} from '../content/orbat.ts';
import { makeName } from './personas.ts';
import type { Rng } from '../rng.ts';
import type { CountryKey } from '../content/world/countries.ts';
import type { Commander, Formation, Orbat, PendingOrder } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

/** The mix of formations an ordinary peacetime army is built out of. */
const PEACETIME_MIX: { kind: FormationKind; share: number }[] = [
  { kind: 'infantry', share: 0.3 },
  { kind: 'mechanised', share: 0.16 },
  { kind: 'armoured', share: 0.1 },
  { kind: 'artillery', share: 0.11 },
  { kind: 'air_defence', share: 0.06 },
  { kind: 'reconnaissance', share: 0.05 },
  { kind: 'engineer', share: 0.06 },
  { kind: 'logistics', share: 0.1 },
  { kind: 'special_forces', share: 0.02 },
  { kind: 'marine', share: 0.02 },
  { kind: 'airborne', share: 0.02 },
];

/**
 * The highest headquarters the country actually fields.
 *
 * Sized to the force rather than asserted, because the difference in how
 * many headquarters sit between a government and a rifle company is most
 * of why large armies are slow, and it is not a thing anybody chose.
 */
export function topEchelonFor(personnel: number): EchelonKey {
  if (personnel > 900_000) return 'army_group';
  if (personnel > 250_000) return 'field_army';
  if (personnel > 80_000) return 'corps';
  if (personnel > 8_000) return 'division';
  return 'brigade';
}

/** The echelon a body of this size honestly is, whatever it is called. */
export function echelonForSize(personnel: number): EchelonKey {
  for (const key of ECHELON_ORDER) {
    if (personnel >= findEchelon(key).personnel * 0.6) return key;
  }
  return 'battalion';
}

/**
 * The echelon the country gives orders at.
 *
 * The largest one that still leaves the government a list it can read.
 * A superpower manoeuvres corps and a small state manoeuvres battalions,
 * and neither is a choice: it falls straight out of how much army there
 * is.
 */
export function workingEchelonFor(personnel: number): EchelonKey {
  for (const key of ECHELON_ORDER) {
    if (personnel / findEchelon(key).personnel >= FORMATION_TARGET_COUNT * 0.55) return key;
  }
  return 'battalion';
}

/**
 * How many headquarters an order passes through on its way down.
 *
 * From the top of the army to the bottom of it. The number that makes a
 * superpower slow, and the one thing about its own army that no
 * government can legislate away in a single term.
 */
export function chainDepthFor(top: EchelonKey): number {
  return ECHELON_ORDER.length - ECHELON_ORDER.indexOf(top);
}

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildOrbat(
  personnel: number,
  country: CountryKey,
  rng: Rng,
  used: Set<string>,
  normsStanding = 70,
): Orbat {
  const topLevel = topEchelonFor(personnel);
  const working = workingEchelonFor(personnel);
  const unit = findEchelon(working).personnel;

  /* The top commands: one per top-echelon formation, up to a number a
     government can plausibly know the names of. */
  const commandCount = clamp(Math.round(personnel / findEchelon(topLevel).personnel), 1, 6);

  const commanders: Commander[] = [];
  const formations: Formation[] = [];

  for (let i = 0; i < commandCount; i += 1) {
    const commander = makeCommander(topLevel, country, rng, used, 0, normsStanding);
    commanders.push(commander);

    const slice = personnel / commandCount;
    for (const { kind, share } of PEACETIME_MIX) {
      /*
       * Every arm of service exists even in an army too big to give it
       * its own corps, and the headcount has to add up: a country does
       * not stop having engineers because its working echelon has grown
       * past them. So the count rounds, the size divides exactly into
       * it, and each formation is then called whatever it actually is.
       */
      const count = Math.max(1, Math.round((slice * share) / unit));
      const size = (slice * share) / count;
      for (let n = 0; n < count; n += 1) {
        formations.push({
          id: `f-${i}-${kind}-${n}`,
          kind,
          echelon: echelonForSize(size),
          parentId: commander.id,
          strength: 100,
          /* Nobody starts a run with a battle-hardened army. */
          experience: 22,
          /* Equipment is inherited and is nobody in this government's doing. */
          equipment: 62,
          supply: 100,
          personnel: size,
          committed: false,
        });
      }
    }
  }

  /* A country too small for a single working formation still has an army. */
  if (formations.length === 0) {
    formations.push({
      id: 'f-0-infantry-0',
      kind: 'infantry',
      echelon: working,
      parentId: commanders[0]!.id,
      strength: 100,
      experience: 22,
      equipment: 62,
      supply: 100,
      personnel: Math.max(200, personnel),
      committed: false,
    });
  }

  return {
    topLevel,
    commanders,
    formations,
    orders: [],
    chainDepth: chainDepthFor(topLevel),
    history: [],
  };
}

/** Where an officer corps' loyalty settles, given how the state is run. */
export function loyaltyAnchor(normsStanding: number): number {
  return clamp100(30 + normsStanding * 0.6);
}

/**
 * An officer, with a name, two traits, and no correlation between how
 * good they are and how far they can be relied on.
 */
export function makeCommander(
  echelon: EchelonKey,
  country: CountryKey,
  rng: Rng,
  used: Set<string>,
  turn: number,
  normsStanding = 70,
): Commander {
  const traits: CommanderTrait[] = [];
  for (let attempt = 0; attempt < 12 && traits.length < 2; attempt += 1) {
    const pick = COMMANDER_TRAITS[rng.int(0, COMMANDER_TRAITS.length - 1)]!.key;
    if (!traits.includes(pick)) traits.push(pick);
  }

  /*
   * Drawn independently, and that is the point. The most capable officer
   * in a country is not reliably the one its government can depend on,
   * and a government that wants both has to be lucky rather than clever.
   *
   * Loyalty runs wider than competence because it has further to fall:
   * an officer can be indifferent to a government without being bad at
   * their job, and the combination is common enough that most countries
   * have one and every country's government is surprised by theirs.
   */
  const competence = clamp100(38 + rng.range(0, 48));
  /*
   * Loyalty is centred on what the norms sustain and competence is not
   * centred on anything, which is where the dilemma comes from. It also
   * means a government that lets the constitution go is appointing a
   * different officer corps within a few years without having changed
   * its appointments policy at all — and finds out the first time it
   * needs the army to do something it would rather not.
   */
  const loyalty = clamp100(loyaltyAnchor(normsStanding) - 32 + rng.range(0, 64));

  return {
    id: `cmd-${echelon}-${turn}-${Math.round(rng.range(100000, 999999))}`,
    name: makeName(rng, country, used),
    echelon,
    traits,
    competence,
    loyalty,
    /* Nobody has commanded anything yet in this run. */
    experience: clamp100(18 + rng.range(0, 30)),
    standing: 50,
    battlesFought: 0,
    appointedTurn: turn,
    dismissed: false,
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

export function commanderOf(orbat: Orbat, id: string): Commander | undefined {
  return orbat.commanders.find((c) => c.id === id && !c.dismissed);
}

/** The officers still in post. */
export function serving(orbat: Orbat): Commander[] {
  return orbat.commanders.filter((c) => !c.dismissed);
}

/**
 * How many weeks an order takes to reach the people who carry it out.
 *
 * The sum of the delays at every headquarters between the top of the
 * army and the bottom of it. A property of the structure rather than of
 * anybody's ability, which is why a government acting on this week's
 * despatch is acting on a battlefield that has already moved, and why a
 * superpower is slower than a small state fielding a tenth as much.
 */
export function orderLag(orbat: Orbat, communications: number): number {
  const from = ECHELON_ORDER.indexOf(orbat.topLevel);
  let lag = 0;
  for (let i = from; i < ECHELON_ORDER.length; i += 1) {
    lag += findEchelon(ECHELON_ORDER[i]!).orderLag;
  }
  /* Better communications shorten it. They never remove it: somebody
     still has to understand the order, and somebody still has to agree. */
  return Math.max(0.5, lag * COMMAND_LAG_SCALE * (1.4 - clamp(communications, 0, 1) * 0.55));
}

/** What a commander's traits do to a given quantity. */
export function traitEffect(
  commander: Commander,
  field: 'attack' | 'defence' | 'supply' | 'casualties' | 'loyalty' | 'morale',
): number {
  return commander.traits.reduce((sum, key) => sum + findTrait(key)[field], 0);
}

/**
 * What a formation is worth in the field.
 *
 * Its own strength and experience, its equipment, whether it has been
 * fed, and whoever is commanding it — in roughly that order of
 * importance, except that the last term is the only one the government
 * chose.
 */
export function combatValue(
  formation: Formation,
  commander: Commander | undefined,
  mode: 'attack' | 'defence',
): number {
  const template = findFormation(formation.kind);
  const base = mode === 'attack' ? template.attack : template.defence;
  const condition =
    (formation.strength / 100) *
    (0.55 + (formation.experience / 100) * 0.6) *
    (0.5 + (formation.equipment / 100) * 0.7) *
    /* An unsupplied formation is not a weak formation. It is not a
       formation: this term goes to nearly nothing rather than to a
       modest penalty, because that is what happens. */
    Math.max(0.08, (formation.supply / 100) ** 1.6);

  const led = commander
    ? 0.7 + (commander.competence / 100) * 0.5 + traitEffect(commander, mode)
    : /* Nobody in command. Formations do not simply stop, but they stop
         being an army and become a number of units in a place. */
      0.55;

  return base * condition * Math.max(0.3, led) * formation.personnel;
}

/** Everything committed, on one side, in one mode. */
export function forceValue(orbat: Orbat, mode: 'attack' | 'defence'): number {
  return orbat.formations
    .filter((f) => f.committed)
    .reduce((sum, f) => sum + combatValue(f, commanderOf(orbat, f.parentId), mode), 0);
}

/** How much of the army is in the fight rather than in barracks. */
export function committedFormationShare(orbat: Orbat): number {
  const total = orbat.formations.reduce((s, f) => s + f.personnel, 0) || 1;
  return orbat.formations.filter((f) => f.committed).reduce((s, f) => s + f.personnel, 0) / total;
}

/** How far an officer can be relied on, traits included. */
export function reliability(commander: Commander): number {
  return clamp100(commander.loyalty + traitEffect(commander, 'loyalty') * 100);
}

/**
 * Whether the army is a danger to the government it serves.
 *
 * Not a coup counter, and not a count of disloyal generals either. It is
 * the share of the FORCE under commanders who would not necessarily
 * carry out an order they disagreed with, weighted by how far below
 * certain each of them is — which is the thing that matters, moves by
 * degrees as the norms go, and is the thing a government finds out late.
 */
export function unreliableShare(orbat: Orbat): number {
  const total = orbat.formations.reduce((s, f) => s + f.personnel, 0) || 1;
  const doubtful = orbat.formations.reduce((s, f) => {
    const commander = commanderOf(orbat, f.parentId);
    /* A formation nobody is commanding is not loyal. It is unattended. */
    if (!commander) return s + f.personnel;
    const doubt = clamp((RELIABILITY_PIVOT - reliability(commander)) / RELIABILITY_SPAN, 0, 1);
    return s + f.personnel * doubt;
  }, 0);
  return doubtful / total;
}

/**
 * How many people the army could absorb this week, if there were any.
 *
 * Not the size of the hole — the size of the hole is much larger and the
 * army could not take them all at once anyway. This is what could
 * usefully arrive, and the ratio between it and what the manpower
 * pipeline actually produces is the whole join between the two systems.
 */
export function replacementDemand(orbat: Orbat): number {
  return orbat.formations.reduce((sum, f) => {
    const ceiling = f.committed ? 0.16 : 0.5;
    return sum + (Math.min(100 - f.strength, ceiling) / 100) * f.personnel;
  }, 0);
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface OrbatInputs {
  /** Whether there is a war on. */
  atWar: boolean;
  warIntensity: number;
  /** How it is going, which is what commanders' standing follows. */
  battlefield: number;
  /** Quality of the communications network, 0–1. Shortens the chain. */
  communications: number;
  /** What the force is being supplied at, 0–100. */
  supply: number;
  /** Equipment arriving from industry, as an index change per week. */
  equipmentDelta: number;
  /**
   * Replacements available, as a share of those asked for.
   *
   * Comes from the manpower engine, and is the reason a formation ground
   * down in March is still at two-thirds strength in September: the
   * bodies to rebuild it are fourteen weeks from being soldiers.
   */
  replacements: number;
  /** Whether the government is trusted by its own officers. */
  normsStanding: number;
  turn: number;
}

export interface OrbatTick {
  orbat: Orbat;
  /** Orders that have finally reached the people who carry them out. */
  executed: PendingOrder[];
  /** Commanders whose standing has collapsed. A government may act. */
  failing: string[];
  /** True the week a meaningful share of the force becomes unreliable. */
  unreliable: boolean;
  /** Replacements the army asked for this week, in people. */
  replacementsWanted: number;
}

export function stepOrbat(orbat: Orbat, inputs: OrbatInputs): OrbatTick {
  const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

  /* ---- 1. Orders in transit. ---- */
  const executed: PendingOrder[] = [];
  const orders = orbat.orders
    .map((order) => ({ ...order, weeksRemaining: order.weeksRemaining - 1 }))
    .filter((order) => {
      if (order.weeksRemaining > 0) return true;
      executed.push(order);
      return false;
    });

  /* ---- 2. The formations. ---- */
  let replacementsWanted = 0;
  const formations: Formation[] = orbat.formations.map((formation) => {
    const template = findFormation(formation.kind);
    const fighting = formation.committed && inputs.atWar;

    /*
     * Experience is made by fighting and by nothing else. A peacetime
     * army trains; it does not become experienced, which is the reason
     * the first six months of every war are so expensive.
     */
    const learning = fighting ? (inputs.warIntensity / 100) * 0.35 : 0.015;
    const experience = clamp100(formation.experience + learning);

    /*
     * Equipment is destroyed by use and replaced by industry. The delta
     * that arrives here is NET of ordinary peacetime replacement — zero
     * means the procurement budget is covering exactly what wears out,
     * which is what an untouched country does, and is why an untouched
     * country's equipment index does not move.
     *
     * Combat is not covered by any peacetime budget. A formation in
     * heavy fighting loses materiel several times faster than a
     * procurement programme written in peacetime replaces it, which is
     * the whole reason the war economy exists and the whole reason it is
     * always too late.
     */
    const wear = fighting ? (inputs.warIntensity / 100) * 0.42 : 0;
    const equipment = clamp100(formation.equipment + inputs.equipmentDelta - wear);

    /* Supply reaches a formation at whatever rate the logistics allow,
       and a committed formation consumes far more of it. */
    const draw = formation.committed ? template.supplyDraw : template.supplyDraw * 0.25;
    const supply = clamp100(
      toward(formation.supply, clamp100(inputs.supply - (draw - 1) * 7), 0.15),
    );

    /*
     * Strength falls under fire and is rebuilt out of it — but only as
     * fast as there are people to rebuild it with. A formation ground
     * down in March is still at two-thirds strength in September,
     * because the bodies to fill it are fourteen weeks from being
     * soldiers and everybody's fourteen weeks started at the same time.
     */
    const attrition = fighting ? (inputs.warIntensity / 100) * 0.55 : 0;
    const ceiling = formation.committed ? 0.16 : 0.5;
    const shortfall = 100 - formation.strength;
    const recovery = Math.min(shortfall, ceiling * clamp(inputs.replacements, 0, 1.4));
    replacementsWanted += (Math.min(shortfall, ceiling) / 100) * formation.personnel;
    const strength = clamp100(formation.strength - attrition + recovery);

    return { ...formation, experience, equipment, supply, strength };
  });

  /* ---- 3. The commanders. ---- */
  const failing: string[] = [];
  const commanders: Commander[] = orbat.commanders.map((commander) => {
    if (commander.dismissed) return commander;

    const own = formations.filter((f) => f.parentId === commander.id);
    const fighting = inputs.atWar && own.some((f) => f.committed);
    const condition = own.length
      ? own.reduce((s, f) => s + f.strength, 0) / own.length
      : 100;

    /*
     * Standing follows results, and results are attributed to whoever is
     * in charge whether or not they had anything to do with them. A
     * commander in a losing sector is a bad commander, that is how it is
     * reported and that is how it is believed — and the state of their
     * own formations is the part of it anybody can actually see.
     */
    const standingTarget = clamp100(
      50 + inputs.battlefield * 55 + (commander.competence - 55) * 0.35 + (condition - 100) * 0.5,
    );
    const standing = clamp100(toward(commander.standing, standingTarget, 0.06));

    const experience = clamp100(
      commander.experience + (fighting ? (inputs.warIntensity / 100) * 0.22 : 0.008),
    );

    /*
     * Loyalty drifts with how the government is regarded, and with how
     * the officer is being treated. An officer corps watching the norms
     * come apart concludes something about the government; an officer
     * being blamed for a theatre they did not choose concludes something
     * more specific. Neither conclusion is reported upward.
     */
    const loyaltyTarget = clamp100(loyaltyAnchor(inputs.normsStanding) + (standing - 50) * 0.25);
    const loyalty = clamp100(toward(commander.loyalty, loyaltyTarget, 0.004));

    if (standing < 25 && commander.standing >= 25) failing.push(commander.id);

    return {
      ...commander,
      standing,
      experience,
      loyalty,
      battlesFought: commander.battlesFought + (fighting ? 1 : 0),
    };
  });

  const next: Orbat = {
    ...orbat,
    commanders,
    formations,
    orders,
    history: [
      ...orbat.history,
      {
        turn: inputs.turn,
        strength: forceValue({ ...orbat, formations, commanders }, 'defence'),
        committed: formations.filter((f) => f.committed).length,
        lag: orderLag(orbat, inputs.communications),
      },
    ].slice(-208),
  };

  return {
    orbat: next,
    executed,
    failing,
    unreliable:
      unreliableShare(next) > UNRELIABLE_ALARM && unreliableShare(orbat) <= UNRELIABLE_ALARM,
    replacementsWanted,
  };
}

/* ------------------------------------------------------------------ *
 * What a government can do about it
 * ------------------------------------------------------------------ */

/** Issue an order, which will arrive when it arrives. */
export function issueOrder(
  orbat: Orbat,
  order: Omit<PendingOrder, 'weeksRemaining' | 'issuedTurn'>,
  communications: number,
  turn: number,
): Orbat {
  return {
    ...orbat,
    orders: [
      ...orbat.orders,
      {
        ...order,
        issuedTurn: turn,
        weeksRemaining: Math.ceil(orderLag(orbat, communications)),
      },
    ],
  };
}

/**
 * Sack a general and appoint another.
 *
 * The obvious thing to do, costing nothing on the day, and watched very
 * closely by every officer who did not lose a battle this week. The
 * replacement is drawn the same way everybody else was — which is to
 * say the government is not choosing a better commander, it is choosing
 * again — and the officers who remain draw their own conclusions about
 * what happens to people who are handed a losing sector.
 *
 * The one case where it is unambiguously right is an officer the
 * government cannot rely on, and that is also the case where the cost of
 * doing it is highest.
 */
export function dismissCommander(
  orbat: Orbat,
  id: string,
  country: CountryKey,
  rng: Rng,
  used: Set<string>,
  turn: number,
): { orbat: Orbat; replacement: Commander | undefined; loyaltyCost: number } {
  const going = commanderOf(orbat, id);
  if (!going) return { orbat, replacement: undefined, loyaltyCost: 0 };

  const replacement = makeCommander(going.echelon, country, rng, used, turn);

  /*
   * What it costs with the rest of them. Sacking somebody the army
   * thought was doing well costs a great deal; sacking somebody it had
   * also given up on costs almost nothing. The government does not get
   * to decide which of those it is doing.
   */
  const loyaltyCost = clamp((going.standing - 35) / 12, 0, 5);

  const commanders = orbat.commanders.map((c) => {
    if (c.id === id) return { ...c, dismissed: true };
    if (c.dismissed) return c;
    return { ...c, loyalty: clamp100(c.loyalty - loyaltyCost) };
  });

  return {
    orbat: {
      ...orbat,
      commanders: [...commanders, replacement],
      formations: orbat.formations.map((f) =>
        f.parentId === id ? { ...f, parentId: replacement.id } : f,
      ),
    },
    replacement,
    loyaltyCost,
  };
}

/** Put formations into the fight, or take them out of it. */
export function setCommitment(orbat: Orbat, ids: string[], committed: boolean): Orbat {
  const wanted = new Set(ids);
  return {
    ...orbat,
    formations: orbat.formations.map((f) => (wanted.has(f.id) ? { ...f, committed } : f)),
  };
}

/* ------------------------------------------------------------------ *
 * Describing it
 * ------------------------------------------------------------------ */

/** One line on the army and who is running it. */
export function describeOrbat(orbat: Orbat, communications: number): string {
  const lag = orderLag(orbat, communications);
  const unreliable = unreliableShare(orbat);
  const post = serving(orbat);
  const best = [...post].sort((a, b) => b.competence - a.competence)[0];

  if (unreliable > UNRELIABLE_ALARM) {
    return `${(unreliable * 100).toFixed(0)}% of the force is under officers who would not necessarily carry out an order they disagreed with. That is not a coup; it is the thing a government finds out about late.`;
  }
  if (lag > 2.2) {
    return `An order from this desk takes ${lag.toFixed(1)} weeks to reach the people who carry it out — ${orbat.chainDepth} headquarters, each of which has to read it. Whatever you decide on today's despatch will be executed on a battlefield that has moved twice since.`;
  }
  if (best && best.competence > 78 && reliability(best) < 45) {
    return `${best.name} is the ablest officer in the army and among the least reliable. There is no arrangement that gives a government both; there is only the choice, and it has to be made before it matters.`;
  }
  return `${orbat.formations.length} ${findEchelon(orbat.formations[0]?.echelon ?? 'brigade').label.toLowerCase()}s under ${post.length} commanders, ${findEchelon(orbat.topLevel).label.toLowerCase()} at the top, and ${lag.toFixed(1)} weeks between an order and its execution.`;
}

/** The formations, by kind, for the panel. */
export function orderOfBattle(
  orbat: Orbat,
): { kind: FormationKind; count: number; personnel: number; committed: number }[] {
  return FORMATION_TEMPLATES.map((template) => {
    const own = orbat.formations.filter((f) => f.kind === template.kind);
    return {
      kind: template.kind,
      count: own.length,
      personnel: own.reduce((s, f) => s + f.personnel, 0),
      committed: own.filter((f) => f.committed).length,
    };
  }).filter((row) => row.count > 0);
}
