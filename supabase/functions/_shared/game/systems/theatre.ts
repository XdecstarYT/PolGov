/**
 * theatre.ts — the ground, and the government's picture of it.
 *
 * Two mechanics carry this file, and both are things political games
 * leave out because they make the player's decisions feel less
 * effective. That is precisely why they are here.
 *
 * THE CULMINATING POINT. An offensive that succeeds lengthens its own
 * supply line and shortens the enemy's. So the further it goes the
 * weaker it gets and the stronger they get, and somewhere out in front
 * of it is a line — never marked, never announced — where the two curves
 * cross and the advance stops whether or not anybody has decided to stop
 * it. Every advance carries the arithmetic of its own halt. A government
 * that keeps ordering the attack forward past that point is not being
 * determined; it is feeding an army into a place it cannot supply, and
 * the despatches will keep reporting progress for several weeks after it
 * has stopped being progress.
 *
 * FOG. The engine resolves the sector. The government reads the BELIEF,
 * which is a separate object that is updated only when somebody actually
 * looks. Belief does not become uncertain when it ages — it becomes OLD,
 * and old belief is briefed with exactly the same confidence as new
 * belief. There is no marker on the map saying this part is six weeks
 * stale. Reconnaissance is the only thing that closes the gap, it costs
 * formations that could be fighting, and the ground itself decides how
 * much of it is even possible: an army in forest is not hidden because
 * it is clever.
 *
 * Everything else here follows from terrain. An armoured division in
 * mountains is not a slightly worse armoured division. The composition a
 * country bought in peacetime, against a war it imagined, is usually
 * wrong for the war it gets, and this is the file where that bill
 * arrives.
 */

import {
  ATTACK_SUPPLY_FLOOR,
  ASSUMED_CONTROL,
  BREAKTHROUGH_PACE,
  BREAKTHROUGH_RATIO,
  CIVILIAN_TOLL,
  CONTROL_PACE,
  DEVASTATION_RATE,
  ENCIRCLEMENT_LOSS,
  RECON_RATE,
  REPORT_OPTIMISM,
  STAGNANT_THRESHOLD,
  SUPPLY_AT_BASE,
  SUPPLY_DECAY_PER_DEPTH,
  WEEKLY_CASUALTY_RATE,
} from '../balance.ts';
import {
  FORTIFICATION,
  FORTIFICATION_LABELS,
  STALE_WEEKS,
  TERRAIN_TEMPLATES,
  findTerrain,
  type FortificationLevel,
  type SectorPosture,
  type TerrainKey,
} from '../content/theatre.ts';
import { combatValue, commanderOf } from './orbat.ts';
import type { Rng } from '../rng.ts';
import type { FrontSector, Orbat, Theatre } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);

/* ------------------------------------------------------------------ *
 * Building a map
 * ------------------------------------------------------------------ */

const SECTOR_NAMES = [
  'the northern shoulder',
  'the river crossings',
  'the central sector',
  'the high ground',
  'the industrial belt',
  'the coastal road',
  'the southern approaches',
  'the forest line',
  'the border town',
  'the passes',
  'the plain',
  'the junction',
];

/**
 * A theatre, laid out as a line of sectors from our base outward.
 *
 * Depth is the whole geometry: sector zero is where the railheads are
 * and every sector after it is one more link in a chain that somebody
 * has to keep supplied. The map is a line rather than a grid because a
 * government does not manoeuvre brigades — it decides where the weight
 * goes, and a line is an honest picture of that decision.
 */
export function buildTheatre(
  warId: string,
  name: string,
  homeland: boolean,
  rng: Rng,
): Theatre {
  const count = 5 + rng.int(0, 2);
  const sectors: FrontSector[] = [];
  const names = [...SECTOR_NAMES];

  for (let i = 0; i < count; i += 1) {
    const terrain = TERRAIN_TEMPLATES[rng.int(0, TERRAIN_TEMPLATES.length - 1)]!.key;
    const pick = names.splice(rng.int(0, names.length - 1), 1)[0] ?? `sector ${i + 1}`;
    /*
     * A defensive war opens with the enemy already inside. An expedition
     * opens with everything still theirs. Neither is a balanced map, and
     * neither should be.
     */
    const control = homeland ? clamp100(88 - i * 13) : clamp100(62 - i * 16);
    sectors.push({
      id: `${warId}-s${i}`,
      name: pick,
      terrain,
      control,
      /* Whatever was already dug, which on a border is a great deal and
         in the middle of somebody else's country is nothing. */
      fortification: (homeland && i === 0 ? 2 : i < 2 ? 1 : 0) as FortificationLevel,
      works: 0,
      supply: supplyAtDepth(i),
      depth: i,
      garrison: [],
      enemyStrength: 0,
      posture: 'quiet',
      encircled: false,
      population: Math.round(40 + rng.range(0, 900)),
      devastation: 0,
      belief: {
        /*
         * Only the ground we are standing on has been looked at. For
         * everything else the map has to say something, so it says the
         * staff assumption — and it is briefed in exactly the same voice
         * as the parts somebody has actually seen.
         */
        control: i === 0 ? control : ASSUMED_CONTROL,
        enemyStrength: 0,
        supply: i === 0 ? supplyAtDepth(i) : ASSUMED_CONTROL,
        lastSeen: 0,
        everSeen: i === 0,
      },
    });
  }

  return {
    warId,
    name,
    sectors,
    baseSector: sectors[0]!.id,
    reconnaissance: 0.2,
    stagnantWeeks: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * The culminating point
 * ------------------------------------------------------------------ */

/**
 * What a sector this far from the railheads can be supplied at.
 *
 * The single arithmetic behind the culminating point. It is linear, it
 * is unforgiving, and it applies to both sides — which is why an
 * offensive gets weaker exactly as fast as the defence gets stronger,
 * and why the two curves always cross somewhere.
 */
export function supplyAtDepth(depth: number, terrainCost = 1): number {
  return clamp100(SUPPLY_AT_BASE - depth * SUPPLY_DECAY_PER_DEPTH * terrainCost);
}

/**
 * How far a sector really is from the people feeding it.
 *
 * Not its position on the map — the sum of what it costs to move
 * supplies through everything between it and the base. Ground we hold
 * securely is a cheap link; ground still being fought over is an
 * expensive one, and ground the enemy is sitting astride is not a link
 * at all.
 *
 * This is where the culminating point actually lives. Taking a sector
 * does not move our railheads forward: it adds a link to a chain that
 * somebody has to keep supplied, and the chain does not get shorter
 * because the attack is going well.
 */
export function effectiveDepth(sectors: FrontSector[], index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    const link = sectors[i]!;
    const terrain = findTerrain(link.terrain);
    /* A contested link costs more than twice what a secure one does,
       because everything through it moves at night and some of it does
       not arrive. */
    depth += terrain.supplyCost * (1 + 1.3 * (1 - clamp(link.control, 0, 100) / 100));
  }
  return depth;
}

/**
 * And the same arithmetic from the other side of the line.
 *
 * The mirror is the whole mechanic. Every sector we take is one further
 * from our base and one NEARER theirs, so as our supply falls theirs
 * rises, at the same rate, over the same ground. The two curves cross
 * somewhere, and where they cross is where the offensive ends —
 * whatever anybody at this desk has decided.
 */
export function enemyDepth(sectors: FrontSector[], index: number): number {
  let depth = 0;
  for (let i = sectors.length - 1; i > index; i -= 1) {
    const link = sectors[i]!;
    const terrain = findTerrain(link.terrain);
    depth += terrain.supplyCost * (1 + 1.3 * (clamp(link.control, 0, 100) / 100));
  }
  return depth;
}

/**
 * How far an attack can go before it stops supplying itself.
 *
 * Never marked on any map and never announced. A government that keeps
 * ordering the advance past it is feeding an army into a place it cannot
 * feed, and the despatches will report progress for weeks after the
 * progress has stopped.
 */
export function culminatingDepth(theatre: Theatre, from = 0): number {
  let reach = from;
  while (
    reach < theatre.sectors.length &&
    supplyAtDepth(effectiveDepth(theatre.sectors, reach)) >= ATTACK_SUPPLY_FLOOR
  ) {
    reach += 1;
  }
  return reach;
}

/** Whether a sector's advance has already outrun what can reach it. */
export function culminated(sector: FrontSector): boolean {
  return sector.posture === 'attacking' && sector.supply < ATTACK_SUPPLY_FLOOR;
}

/* ------------------------------------------------------------------ *
 * What a sector is worth to each side
 * ------------------------------------------------------------------ */

/** What our formations in a sector are worth, ground included. */
export function sectorStrength(
  sector: FrontSector,
  orbat: Orbat,
  mode: 'attack' | 'defence',
): number {
  const terrain = findTerrain(sector.terrain);
  return sector.garrison.reduce((sum, id) => {
    const formation = orbat.formations.find((f) => f.id === id);
    if (!formation) return sum;
    /*
     * Terrain is not a modifier, it is the argument. An armoured
     * division in mountains is not a slightly worse armoured division;
     * it is a traffic jam that can be shelled.
     */
    const suits = terrain.favours[formation.kind] ?? 1;
    const supplied = { ...formation, supply: Math.min(formation.supply, sector.supply) };
    return sum + combatValue(supplied, commanderOf(orbat, formation.parentId), mode) * suits;
  }, 0);
}

/** And what the defender gets for being dug into it. */
export function defensiveMultiplier(sector: FrontSector): number {
  return findTerrain(sector.terrain).attackRatio * FORTIFICATION[sector.fortification].defence;
}

/**
 * The ratio an attack is actually being made at.
 *
 * Below one it is not an attack, it is a casualty list. Around the
 * terrain's own ratio it grinds. Above the breakthrough ratio the front
 * stops being a front, which is why breakthroughs look sudden from the
 * outside: nothing for months, then a hundred miles in a fortnight, and
 * the same arithmetic throughout.
 */
export function assaultRatio(
  sector: FrontSector,
  orbat: Orbat,
  attacking: boolean,
): number {
  /*
   * Nought before contact, rather than a very large number. A sector
   * nobody has been shot at from has not been assessed, and the honest
   * answer to what the ratio is there is that nobody knows.
   */
  if (sector.enemyStrength <= 0) return 0;
  const ours = sectorStrength(sector, orbat, attacking ? 'attack' : 'defence');
  const ratio = ours / sector.enemyStrength;
  return attacking ? ratio / defensiveMultiplier(sector) : ratio;
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface TheatreInputs {
  orbat: Orbat;
  /** What the enemy is bringing, as a combat value across the theatre. */
  enemyStrength: number;
  /** How hard the war is being fought, 0–100. */
  intensity: number;
  /** What the logistics can push forward, 0–1. Engine 7F will set this. */
  logistics: number;
  /** Whether the other side is attacking us this week. */
  theyAttack: boolean;
  turn: number;
  rng: Rng;
}

export interface TheatreTick {
  theatre: Theatre;
  /** Our casualties this week, in thousands. */
  casualties: number;
  /** And theirs. */
  enemyCasualties: number;
  /** Civilians, in thousands. Counted separately because they are. */
  civilianCasualties: number;
  /** Sectors that changed hands this week. */
  taken: string[];
  lost: string[];
  /** Attacks that have outrun their own supply. */
  culminating: string[];
  /** Sectors cut off this week. */
  encircled: string[];
  /** True the week the front is formally going nowhere. */
  stagnant: boolean;
}

export function stepTheatre(theatre: Theatre, inputs: TheatreInputs): TheatreTick {
  const taken: string[] = [];
  const lost: string[] = [];
  const culminating: string[] = [];
  const encircled: string[] = [];
  let casualties = 0;
  let enemyCasualties = 0;
  let civilianCasualties = 0;
  let moved = 0;

  /*
   * The enemy is spread across the theatre in proportion to what is
   * being contested. They are not a pool of strength that appears
   * wherever it is needed; they are somewhere, and where they are is
   * decided by where the fighting is.
   */
  const contested = theatre.sectors.reduce(
    (sum, s) => sum + (s.control > 4 && s.control < 96 ? 1 : 0.25),
    0,
  );

  const sectors = theatre.sectors.map((sector, index) => {
    const terrain = findTerrain(sector.terrain);
    const weight = (sector.control > 4 && sector.control < 96 ? 1 : 0.25) / Math.max(1, contested);

    /* ---- Supply, and therefore everything. ---- */
    /*
     * Measured through the ground, not off the map. Taking a sector does
     * not move our railheads forward; it adds a link to a chain somebody
     * has to keep supplied. And the same chain, run the other way, is
     * getting SHORTER for them — which is the culminating point, and the
     * reason a successful offensive creates the conditions of its own
     * halt.
     */
    const depth = effectiveDepth(theatre.sectors, index);
    const theirDepth = enemyDepth(theatre.sectors, index);
    /* The ground's own cost is already in the depth, link by link.
       Applying it again here priced every deep sector at nothing and
       froze the whole map beyond the third sector. */
    const supply = clamp100(
      supplyAtDepth(depth) * clamp(inputs.logistics, 0.15, 1.25) - (sector.encircled ? 55 : 0),
    );
    const theirSupply = clamp100(supplyAtDepth(theirDepth));

    /*
     * What is in front of us, at what it is worth given how well THEY
     * are being fed. An enemy pushed back onto their own railheads is
     * not a beaten enemy; it is a fresher one.
     */
    const enemyStrength = inputs.enemyStrength * weight * (0.35 + (theirSupply / 100) * 0.9);

    /* ---- Is anything happening here. ---- */
    const contested_ = sector.control > 8 && sector.control < 92;
    const attacking = sector.posture === 'attacking' && contested_;
    const defending = inputs.theyAttack && contested_ && !attacking;
    /*
     * And the third case, which is most of every war: nobody has ordered
     * anything and both sides are still there. A contested sector costs
     * lives every week whether or not there is an operation on, and that
     * is the entire tragedy of a static front — it is still costing what
     * it cost in the first week, which is the fact that decides it.
     */
    const inContact = contested_ && sector.garrison.length > 0;
    const fighting = attacking || defending || inContact;

    if (!fighting) {
      /*
       * Quiet sectors dig, and whoever holds one digs it. Fortification
       * is weeks rather than money, which is the part that gets missed:
       * a government can fund a defensive line and still not have one,
       * because what the line needs is weeks nobody is shooting during —
       * and those are exactly the weeks a government spends deciding
       * whether the line is necessary.
       */
      const works = sector.works + 1;
      const next = FORTIFICATION[Math.min(4, sector.fortification + 1) as FortificationLevel];
      const upgrade =
        sector.fortification < 4 && works >= next.weeks / Math.max(0.2, terrain.fortifiable);
      /*
       * And ground that is nearly taken finishes being taken. A sector
       * nobody is contesting does not sit at ninety-four per cent for
       * three years; the last of them leave, or the last of us do.
       */
      const settling =
        sector.control > 92
          ? Math.min(100, sector.control + 2.5)
          : sector.control < 8
            ? Math.max(0, sector.control - 2.5)
            : sector.control;

      return {
        ...sector,
        control: settling,
        depth,
        supply,
        enemyStrength,
        works: upgrade ? 0 : works,
        fortification: (upgrade
          ? sector.fortification + 1
          : sector.fortification) as FortificationLevel,
      };
    }

    /* ---- The fight. ---- */
    const ours = sectorStrength(sector, inputs.orbat, attacking ? 'attack' : 'defence');
    const theirs = Math.max(1, enemyStrength);
    /* Works belong to whoever is holding the ground, not to whoever
       built them. Ground changes hands with its trenches attached. */
    const held = clamp(sector.control, 0, 100) / 100;
    const theirWorks = 1 + (FORTIFICATION[sector.fortification].defence - 1) * (1 - held);
    const ourWorks = 1 + (FORTIFICATION[sector.fortification].defence - 1) * held;

    const ratio = attacking
      ? ours / theirs / (terrain.attackRatio * theirWorks)
      : (ours * ourWorks) / (theirs / terrain.attackRatio);

    /*
     * Supply is not a penalty on an attack, it is permission for one. An
     * attack below the floor does not go more slowly; it does not go,
     * and it costs the same as one that does.
     */
    const canAttack = supply >= ATTACK_SUPPLY_FLOOR;
    if (attacking && !canAttack) culminating.push(sector.id);

    const pace = CONTROL_PACE / terrain.paceWeeks;
    let shift = 0;
    if (attacking && canAttack) {
      /*
       * An attack that is not strong enough does not lose ground. It
       * produces a casualty list and a despatch, and the line is where
       * it was. Losing ground is what happens when the other side
       * attacks, which is a different week.
       */
      shift =
        ratio >= BREAKTHROUGH_RATIO
          ? pace * BREAKTHROUGH_PACE * Math.min(2.5, ratio / BREAKTHROUGH_RATIO)
          : Math.max(0, pace * (ratio - 1));
    } else if (defending) {
      shift = ratio >= 1 ? 0 : -pace * Math.min(4, 1 / Math.max(0.15, ratio) - 1);
    }

    const control = clamp100(sector.control + shift);
    if (control > 92 && sector.control <= 92) taken.push(sector.id);
    if (control < 8 && sector.control >= 8) lost.push(sector.id);
    if (Math.abs(shift) > 0.4) moved += 1;

    /* ---- What it cost. ---- */
    /*
     * Attacking costs more than defending and the ratio is not close.
     * Holding a contested line with nobody attacking costs less than
     * either and never nothing, which is how a front nobody is fighting
     * over consumes an army over three years.
     *
     * Counted in PEOPLE. `ours` and `theirs` above are combat VALUES —
     * indices built from equipment, experience and command — and the
     * first version of this divided one of those by a million and
     * called the result thousands of soldiers, which produced a quarter
     * of a million casualties a year for an army of sixty-five thousand.
     */
    const engaged = sector.garrison.reduce((sum, id) => {
      const formation = inputs.orbat.formations.find((f) => f.id === id);
      return sum + (formation ? formation.personnel * (formation.strength / 100) : 0);
    }, 0);
    const effort = attacking ? 1.9 : defending ? 0.85 : 0.3;
    const heat = (inputs.intensity / 100) * terrain.attrition;
    const ourLoss = (engaged / 1000) * WEEKLY_CASUALTY_RATE * heat * effort;
    /* And theirs, in proportion to how the fighting is going, because
       the engine does not hold their order of battle. */
    const theirLoss =
      ourLoss *
      clamp(theirs / Math.max(1, ours), 0.35, 2.4) *
      (attacking ? 0.95 : defending ? 1.5 : 1);
    casualties += ourLoss;
    enemyCasualties += theirLoss;

    /* A sector is a place people live, and nobody asked them. */
    const civilians = sector.population * heat * CIVILIAN_TOLL * (1 + sector.devastation / 60);
    civilianCasualties += civilians;
    const devastation = clamp100(sector.devastation + heat * DEVASTATION_RATE);

    /*
     * Encirclement: a sector whose route home has gone. Not a formation
     * under pressure — a formation with a deadline, and the deadline is
     * measured in weeks.
     */
    const behind = theatre.sectors.filter((s) => s.depth < sector.depth);
    const cut = behind.length > 0 && behind.every((s) => s.control < 30) && sector.control > 20;
    if (cut && !sector.encircled) encircled.push(sector.id);

    return {
      ...sector,
      control,
      depth,
      supply: clamp100(supply - (cut ? ENCIRCLEMENT_LOSS : 0)),
      enemyStrength,
      encircled: cut,
      population: Math.max(0, sector.population - civilians),
      devastation,
      /* The player's order stands until the player changes it. The
         engine reports what happened; it does not quietly re-issue
         somebody else's instructions. */
      works: 0,
    };
  });

  /* ---- What the government has been told. ---- */
  const seen = sectors.map((sector) => observe(sector, theatre.reconnaissance, inputs));

  const stagnantWeeks = moved === 0 ? theatre.stagnantWeeks + 1 : 0;

  const next: Theatre = {
    ...theatre,
    sectors: seen,
    stagnantWeeks,
    history: [
      ...theatre.history,
      {
        turn: inputs.turn,
        line: seen.reduce((s, x) => s + x.control, 0) / Math.max(1, seen.length),
        fog:
          seen.reduce((s, x) => s + Math.abs(x.belief.control - x.control), 0) /
          Math.max(1, seen.length),
        supply: seen.reduce((s, x) => s + x.supply, 0) / Math.max(1, seen.length),
      },
    ].slice(-208),
  };

  return {
    theatre: next,
    casualties,
    enemyCasualties,
    civilianCasualties,
    taken,
    lost,
    culminating,
    encircled,
    stagnant:
      stagnantWeeks === STAGNANT_THRESHOLD,
  };
}

/* ------------------------------------------------------------------ *
 * Fog
 * ------------------------------------------------------------------ */

/**
 * What anybody could find out about a sector this week.
 *
 * Reconnaissance closes the gap between belief and the ground; the
 * ground decides how far it can close. A sector under observation is
 * briefed accurately. A sector nobody has looked at is briefed from the
 * last thing anybody confirmed, at the same volume and with the same
 * confidence, and there is no marker on the map saying which is which.
 */
function observe(
  sector: FrontSector,
  reconnaissance: number,
  inputs: TheatreInputs,
): FrontSector {
  const terrain = findTerrain(sector.terrain);
  /*
   * Fighting in a place is the best reconnaissance there is, which is
   * one of the ugliest facts in the subject: the cheapest way to find
   * out what is in a sector is to be shot at from it.
   */
  /*
   * Ground we are standing on is ground we know about. Ground we are in
   * contact with is ground we know something about, at the cost of being
   * shot at from it, which is one of the uglier facts in the subject.
   * Everything else is whatever the last patrol said.
   */
  const ours = sector.control > 88;
  const inContact = sector.garrison.length > 0 && sector.control > 8 && sector.control < 92;
  const contact = ours ? 0.9 : inContact ? 0.3 : 0;
  const effort = clamp(reconnaissance + contact, 0, 1) * terrain.visibility;
  const looked = effort > 0.1 && inputs.rng.chance(clamp(effort, 0, 0.95));

  if (!looked) {
    /*
     * Nobody looked. Belief does not become uncertain — it becomes OLD,
     * drifting very slightly toward whatever the staff last assumed, and
     * it is briefed exactly as confidently as it was the week it was
     * true.
     */
    /*
     * Nobody looked, so nothing changes. Belief does not decay into
     * uncertainty — it simply STOPS, and the ground carries on without
     * it. That is the whole of fog: not a haze over the map, but a map
     * that was accurate six weeks ago being briefed in the present
     * tense. There is no marker saying which parts are which, and the
     * briefing does not get quieter.
     */
    return sector;
  }

  const toward = (now: number, truth: number) =>
    now + (truth - now) * RECON_RATE * terrain.visibility;
  /*
   * Somebody looked, and what they sent back is a little better than
   * what they saw. It always is, in the same direction, at every
   * echelon it passes through — which is why a government with
   * excellent intelligence is still slightly more confident than the
   * ground warrants.
   */
  return {
    ...sector,
    belief: {
      control: clamp100(toward(sector.belief.control, sector.control + REPORT_OPTIMISM)),
      enemyStrength: toward(sector.belief.enemyStrength, sector.enemyStrength * 0.9),
      supply: clamp100(toward(sector.belief.supply, sector.supply + REPORT_OPTIMISM)),
      lastSeen: inputs.turn,
      everSeen: true,
    },
  };
}

/** How far the government's picture is from the ground, in points. */
export function fogOfWar(theatre: Theatre): number {
  return (
    theatre.sectors.reduce((s, x) => s + Math.abs(x.belief.control - x.control), 0) /
    Math.max(1, theatre.sectors.length)
  );
}

/** How stale a sector's briefing is, in weeks. */
export function staleness(sector: FrontSector, turn: number): number {
  return sector.belief.everSeen ? turn - sector.belief.lastSeen : Infinity;
}

/** Whether a sector is being briefed from a map rather than the ground. */
export function briefedFromMemory(sector: FrontSector, turn: number): boolean {
  return staleness(sector, turn) > STALE_WEEKS;
}

/* ------------------------------------------------------------------ *
 * What a government can do about it
 * ------------------------------------------------------------------ */

/** Put formations into a sector, or take them out of it. */
export function garrison(theatre: Theatre, sectorId: string, formationIds: string[]): Theatre {
  return {
    ...theatre,
    sectors: theatre.sectors.map((s) =>
      s.id === sectorId
        ? { ...s, garrison: formationIds }
        : { ...s, garrison: s.garrison.filter((id) => !formationIds.includes(id)) },
    ),
  };
}

/** Order a sector to attack, hold, or come back. */
export function setPosture(
  theatre: Theatre,
  sectorId: string,
  posture: SectorPosture,
): Theatre {
  return {
    ...theatre,
    sectors: theatre.sectors.map((s) => (s.id === sectorId ? { ...s, posture } : s)),
  };
}

/** Spend more on finding out what is there. It costs formations. */
export function setReconnaissance(theatre: Theatre, effort: number): Theatre {
  return { ...theatre, reconnaissance: clamp(effort, 0, 1) };
}

/** The front line, as one number, for anybody who wants one. */
export function frontLine(theatre: Theatre): number {
  return (
    theatre.sectors.reduce((s, x) => s + x.control, 0) / Math.max(1, theatre.sectors.length)
  );
}

/** And what the government thinks it is, which is the number it acts on. */
export function reportedLine(theatre: Theatre): number {
  return (
    theatre.sectors.reduce((s, x) => s + x.belief.control, 0) /
    Math.max(1, theatre.sectors.length)
  );
}

/** One line on the map, written from belief rather than from the ground. */
export function describeTheatre(theatre: Theatre, turn: number): string {
  const blind = theatre.sectors.filter((s) => briefedFromMemory(s, turn));
  const culminated_ = theatre.sectors.filter(culminated);
  const cut = theatre.sectors.filter((s) => s.encircled);

  if (cut.length > 0) {
    return `${cut[0]!.name} is cut off. That is not a sector under pressure, it is a sector with a deadline, and the deadline is measured in weeks.`;
  }
  if (culminated_.length > 0) {
    return `The attack on ${culminated_[0]!.name} has outrun what can reach it. It will be reported as progress for a while yet, because from the despatches it still looks like one.`;
  }
  if (blind.length > theatre.sectors.length / 2) {
    return `Over half the theatre is being briefed from the map rather than from the ground. Nothing in the briefing will say so, and it will be delivered at the same volume as the parts that are true.`;
  }
  if (theatre.stagnantWeeks > STAGNANT_THRESHOLD) {
    return `${theatre.stagnantWeeks} weeks and the line has not moved anywhere. It is still costing what it cost in the first week, which is the part that decides this.`;
  }
  const line = reportedLine(theatre);
  return `${theatre.name}: ${line.toFixed(0)}% of the theatre reported ours across ${theatre.sectors.length} sectors, ${theatre.sectors.filter((s) => s.posture === 'attacking').length} of them attacking.`;
}

/** What to call a sector's works, for the panel. */
export function fortificationLabel(sector: FrontSector): string {
  return FORTIFICATION_LABELS[sector.fortification];
}

/** Every terrain in the theatre, for anybody deciding what to buy next. */
export function terrainMix(theatre: Theatre): TerrainKey[] {
  return [...new Set(theatre.sectors.map((s) => s.terrain))];
}
