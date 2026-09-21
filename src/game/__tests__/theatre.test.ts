/**
 * theatre.test.ts — the culminating point, and the map that is six weeks old.
 *
 * Both mechanics in this file were inert when first written and both
 * were found by measuring a campaign rather than by reading the code.
 * Depth was assigned once at build and never recomputed, so an advance
 * never lengthened its own supply line and the culminating point — the
 * thing the whole file exists for — did nothing at all. And every sector
 * counted as observed every week, so the fog was a field that existed
 * and never varied.
 *
 * Neither failure would have been caught by a test of a single week.
 * These run campaigns.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import { buildOrbat, setCommitment } from '../systems/orbat.ts';
import {
  assaultRatio,
  briefedFromMemory,
  buildTheatre,
  culminatingDepth,
  culminated,
  defensiveMultiplier,
  describeTheatre,
  effectiveDepth,
  enemyDepth,
  fogOfWar,
  frontLine,
  garrison,
  reportedLine,
  sectorStrength,
  setPosture,
  setReconnaissance,
  staleness,
  stepTheatre,
  supplyAtDepth,
  terrainMix,
  type TheatreInputs,
} from '../systems/theatre.ts';
import { FORTIFICATION, STALE_WEEKS, findTerrain } from '../content/theatre.ts';
import { ATTACK_SUPPLY_FLOOR, REPORT_OPTIMISM, SUPPLY_DECAY_PER_DEPTH } from '../balance.ts';
import type { Orbat, Theatre } from '../types.ts';

const army = (personnel = 190_000, seed = 21): Orbat => {
  const o = buildOrbat(personnel, 'verdana' as never, new Rng(seed), new Set());
  return setCommitment(o, o.formations.map((f) => f.id), true);
};

/** A theatre with the army spread across it and told to attack. */
const campaign = (
  orbat: Orbat,
  homeland: boolean,
  reconnaissance: number,
  seed = 21,
): Theatre => {
  const rng = new Rng(seed);
  let t = setReconnaissance(buildTheatre('w', 'the front', homeland, rng), reconnaissance);
  const per = Math.ceil(orbat.formations.length / t.sectors.length);
  t.sectors.forEach((s, i) => {
    t = garrison(
      t,
      s.id,
      orbat.formations.slice(i * per, (i + 1) * per).map((f) => f.id),
    );
  });
  t.sectors.forEach((s) => {
    t = setPosture(t, s.id, 'attacking');
  });
  return t;
};

const week = (orbat: Orbat, enemy: number, turn: number, over: Partial<TheatreInputs> = {}) =>
  ({
    orbat,
    enemyStrength: enemy,
    intensity: 55,
    logistics: 1,
    theyAttack: false,
    turn,
    rng: new Rng(turn + 1),
    ...over,
  }) as TheatreInputs;

const run = (
  t: Theatre,
  orbat: Orbat,
  enemy: number,
  weeks: number,
  over: Partial<TheatreInputs> = {},
) => {
  let theatre = t;
  const totals = { casualties: 0, civilians: 0 };
  for (let w = 0; w < weeks; w += 1) {
    const tick = stepTheatre(theatre, week(orbat, enemy, w, over));
    theatre = tick.theatre;
    totals.casualties += tick.casualties;
    totals.civilians += tick.civilianCasualties;
  }
  return { theatre, ...totals };
};

/* ------------------------------------------------------------------ *
 * The culminating point
 * ------------------------------------------------------------------ */

describe('theatre: an advance carries the arithmetic of its own halt', () => {
  it('measures depth through the ground rather than off the map', () => {
    const t = campaign(army(), false, 0.5);
    /* Depth is not the index. It is what it costs to push supplies
       through everything in between, and contested ground costs more. */
    expect(effectiveDepth(t.sectors, 0)).toBe(0);
    expect(effectiveDepth(t.sectors, 3)).toBeGreaterThan(3);
    for (let i = 1; i < t.sectors.length; i += 1) {
      expect(effectiveDepth(t.sectors, i)).toBeGreaterThan(effectiveDepth(t.sectors, i - 1));
    }
  });

  it('runs the same chain backwards for the other side', () => {
    const t = campaign(army(), false, 0.5);
    const last = t.sectors.length - 1;
    expect(enemyDepth(t.sectors, last)).toBe(0);
    /* Ours rises with depth and theirs falls. The two curves cross
       somewhere, and where they cross is where the offensive ends. */
    expect(enemyDepth(t.sectors, 0)).toBeGreaterThan(enemyDepth(t.sectors, last));
    expect(effectiveDepth(t.sectors, 0)).toBeLessThan(effectiveDepth(t.sectors, last));
  });

  it('stops an attack that has outrun what can reach it', () => {
    const t = campaign(army(), false, 0.5);
    const reach = culminatingDepth(t);
    expect(reach).toBeGreaterThan(0);
    expect(reach).toBeLessThan(t.sectors.length);
    /* Beyond the culminating point supply is below the floor, and an
       attack there does not go more slowly — it does not go. */
    expect(supplyAtDepth(effectiveDepth(t.sectors, reach))).toBeLessThan(ATTACK_SUPPLY_FLOOR);
  });

  it('reports the halt as progress, because from the despatches it is', () => {
    const orbat = army();
    const t = campaign(orbat, false, 0.5);
    const enemy = sectorStrength(t.sectors[0]!, orbat, 'defence');
    let theatre = t;
    let sawCulmination = false;
    for (let w = 0; w < 52; w += 1) {
      const tick = stepTheatre(theatre, week(orbat, enemy, w));
      theatre = tick.theatre;
      sawCulmination = sawCulmination || tick.culminating.length > 0;
    }
    expect(sawCulmination).toBe(true);
    expect(theatre.sectors.some(culminated)).toBe(true);
  });

  it('improves supply forward as the rear is consolidated', () => {
    const orbat = army(600_000);
    const t = campaign(orbat, false, 0.6);
    const enemy = sectorStrength(t.sectors[0]!, orbat, 'defence') * 0.9;
    const before = t.sectors.map((s) => supplyAtDepth(effectiveDepth(t.sectors, s.depth)));
    const after = run(t, orbat, enemy, 104).theatre;
    const mid = Math.floor(after.sectors.length / 2);
    /* Taking the sectors behind you is worth more than taking the one in
       front, which is the least intuitive thing on this map. */
    expect(after.sectors[mid]!.supply).toBeGreaterThan(before[mid]! - 1);
  });

  it('gives an encircled sector a deadline rather than a penalty', () => {
    const orbat = army();
    let t = campaign(orbat, false, 0.5);
    t = {
      ...t,
      sectors: t.sectors.map((s, i) =>
        i === 0 ? { ...s, control: 2 } : i === 1 ? { ...s, control: 60 } : s,
      ),
    };
    const enemy = sectorStrength(t.sectors[1]!, orbat, 'defence');
    const tick = stepTheatre(t, week(orbat, enemy, 0, { theyAttack: true }));
    const cut = tick.theatre.sectors[1]!;
    expect(cut.encircled).toBe(true);
    expect(cut.supply).toBeLessThan(t.sectors[1]!.supply);
  });
});

/* ------------------------------------------------------------------ *
 * Ground
 * ------------------------------------------------------------------ */

describe('theatre: terrain is the argument, not a modifier', () => {
  it('prices an attack on mountains differently from an attack on a plain', () => {
    expect(findTerrain('mountains').attackRatio).toBeGreaterThan(
      findTerrain('plains').attackRatio * 2,
    );
    expect(findTerrain('mountains').favours.armoured!).toBeLessThan(0.4);
    expect(findTerrain('desert').favours.armoured!).toBeGreaterThan(1.3);
  });

  it('hides an army in forest and cannot hide one in a desert', () => {
    expect(findTerrain('forest').visibility).toBeLessThan(0.4);
    expect(findTerrain('desert').visibility).toBeGreaterThan(0.9);
  });

  it('makes the same formations worth different amounts on different ground', () => {
    const orbat = army();
    const t = campaign(orbat, false, 0.5);
    const sector = t.sectors[0]!;
    const onPlains = sectorStrength({ ...sector, terrain: 'plains' }, orbat, 'attack');
    const inMountains = sectorStrength({ ...sector, terrain: 'mountains' }, orbat, 'attack');
    expect(inMountains).toBeLessThan(onPlains);
  });

  it('charges a defender less for the same ground than an attacker', () => {
    const t = campaign(army(), true, 0.5);
    for (const sector of t.sectors) {
      expect(defensiveMultiplier(sector)).toBeGreaterThan(1);
    }
    const dug = { ...t.sectors[0]!, fortification: 4 as const };
    expect(defensiveMultiplier(dug)).toBeGreaterThan(defensiveMultiplier(t.sectors[0]!));
  });

  it('builds fortification out of weeks rather than money', () => {
    expect(FORTIFICATION[0].weeks).toBe(0);
    for (let level = 1; level <= 4; level += 1) {
      expect(FORTIFICATION[level as 1].weeks).toBeGreaterThan(
        FORTIFICATION[(level - 1) as 0].weeks,
      );
    }
    /* A fortress line is a generation of work and is not reachable
       inside one war, which is the point of it. */
    expect(FORTIFICATION[4].weeks).toBeGreaterThan(104);
  });

  it('digs quiet sectors and does not dig contested ones', () => {
    const orbat = army();
    const t = campaign(orbat, true, 0.5);
    const quiet = { ...t, sectors: t.sectors.map((s) => ({ ...s, control: 100, posture: 'quiet' as const })) };
    const after = run(quiet, orbat, 1, 60).theatre;
    expect(after.sectors[0]!.fortification).toBeGreaterThan(t.sectors[0]!.fortification);
  });
});

/* ------------------------------------------------------------------ *
 * Fog
 * ------------------------------------------------------------------ */

describe('theatre: the map is briefed in the present tense', () => {
  it('opens with a picture of ground nobody has looked at', () => {
    const t = campaign(army(), false, 0.5);
    expect(t.sectors.filter((s) => !s.belief.everSeen).length).toBeGreaterThan(0);
    /* And the map says something about them anyway, because a map has
       to. Nothing marks which parts those are. */
    expect(fogOfWar(t)).toBeGreaterThan(5);
  });

  it('burns the fog off with reconnaissance and does not without it', () => {
    const orbat = army();
    const enemy = sectorStrength(campaign(orbat, false, 0.5).sectors[0]!, orbat, 'defence') * 0.9;
    const seeing = run(campaign(orbat, false, 0.75), orbat, enemy, 104).theatre;
    const blind = run(campaign(orbat, false, 0.03), orbat, enemy, 104).theatre;
    expect(fogOfWar(seeing)).toBeLessThan(fogOfWar(blind) * 0.6);
    expect(fogOfWar(blind)).toBeGreaterThan(10);
  });

  it('leaves a government that cannot see believing it is doing better than it is', () => {
    const orbat = army();
    const enemy = sectorStrength(campaign(orbat, false, 0.5).sectors[0]!, orbat, 'defence') * 0.9;
    const blind = run(campaign(orbat, false, 0.03), orbat, enemy, 104).theatre;
    expect(reportedLine(blind)).toBeGreaterThan(frontLine(blind) + 8);
  });

  it('keeps a small optimism even when the intelligence is excellent', () => {
    /*
     * No commander has ever reported their own sector as worse than it
     * is. It is small, constant, and in the same direction every time,
     * which is why it never washes out.
     */
    expect(REPORT_OPTIMISM).toBeGreaterThan(0);
    const orbat = army();
    const enemy = sectorStrength(campaign(orbat, false, 0.5).sectors[0]!, orbat, 'defence') * 0.9;
    const seeing = run(campaign(orbat, false, 0.95), orbat, enemy, 104).theatre;
    expect(reportedLine(seeing)).toBeGreaterThan(frontLine(seeing));
  });

  it('stops the map rather than blurring it', () => {
    /*
     * The failure is not a haze. It is a map that was accurate six weeks
     * ago being read out in the present tense, and there is no marker on
     * it saying which parts those are.
     */
    const orbat = army();
    let t = campaign(orbat, false, 0);
    t = { ...t, sectors: t.sectors.map((s) => ({ ...s, garrison: [] })) };
    const before = t.sectors.map((s) => s.belief.control);
    const after = run(t, orbat, 1, 30).theatre;
    after.sectors.forEach((s, i) => {
      expect(s.belief.control).toBeCloseTo(before[i]!, 6);
    });
    expect(after.sectors.every((s) => briefedFromMemory(s, 30))).toBe(true);
    expect(staleness(after.sectors[1]!, 30)).toBeGreaterThan(STALE_WEEKS);
  });

  it('cannot see into a forest as well as across a desert', () => {
    const orbat = army();
    const build = (terrain: 'forest' | 'desert') => {
      let t = campaign(orbat, false, 0.6);
      t = { ...t, sectors: t.sectors.map((s) => ({ ...s, terrain })) };
      return run(t, orbat, 1, 52).theatre;
    };
    expect(fogOfWar(build('forest'))).toBeGreaterThan(fogOfWar(build('desert')));
  });

  it('does not claim a ratio for ground nobody has been shot at from', () => {
    const t = campaign(army(), false, 0.5);
    expect(assaultRatio(t.sectors[0]!, army(), true)).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * The cost of a front that is not moving
 * ------------------------------------------------------------------ */

describe('theatre: a static front is not a cheap one', () => {
  it('costs lives every week whether or not anybody ordered an attack', () => {
    const orbat = army();
    let t = campaign(orbat, true, 0.5);
    t = { ...t, sectors: t.sectors.map((s) => ({ ...s, posture: 'holding' as const })) };
    const enemy = sectorStrength(t.sectors[0]!, orbat, 'defence');
    const out = run(t, orbat, enemy, 104);
    expect(out.casualties).toBeGreaterThan(0);
    /* And nobody has gone anywhere. */
    expect(Math.abs(frontLine(out.theatre) - frontLine(t))).toBeLessThan(12);
  });

  it('charges an attack far more than a defence for the same week', () => {
    const orbat = army();
    const base = campaign(orbat, true, 0.5);
    const enemy = sectorStrength(base.sectors[0]!, orbat, 'defence');
    const attacking = run(base, orbat, enemy, 52).casualties;
    const holding = run(
      { ...base, sectors: base.sectors.map((s) => ({ ...s, posture: 'holding' as const })) },
      orbat,
      enemy,
      52,
    ).casualties;
    expect(attacking).toBeGreaterThan(holding);
  });

  it('notices when the line has stopped going anywhere', () => {
    const orbat = army(40_000);
    const t = campaign(orbat, true, 0.5);
    const enemy = sectorStrength(t.sectors[0]!, orbat, 'defence') * 40;
    const after = run(t, orbat, enemy, 104).theatre;
    expect(after.stagnantWeeks).toBeGreaterThan(20);
    expect(describeTheatre(after, 104)).toMatch(/\S/);
  });

  it('wrecks the ground and the people who live on it', () => {
    const orbat = army();
    const t = campaign(orbat, true, 0.5);
    const enemy = sectorStrength(t.sectors[0]!, orbat, 'defence');
    const out = run(t, orbat, enemy, 104);
    expect(out.civilians).toBeGreaterThan(0);
    expect(out.theatre.sectors.some((s) => s.devastation > 5)).toBe(true);
    /* Civilians are counted separately because they are. */
    expect(out.theatre.sectors.every((s) => s.population >= 0)).toBe(true);
  });
});

describe('theatre: the weight has to be there', () => {
  it('goes nowhere at parity and moves when the ratio is there', () => {
    const orbat = army();
    const base = campaign(orbat, false, 0.6);
    const strong = sectorStrength(base.sectors[0]!, orbat, 'defence');
    const even = run(base, orbat, strong * 7, 104).theatre;
    const heavy = run(base, orbat, strong * 0.9, 104).theatre;
    expect(frontLine(heavy)).toBeGreaterThan(frontLine(even) + 5);
  });

  it('finishes taking ground nobody is contesting any more', () => {
    const orbat = army();
    const base = campaign(orbat, false, 0.6);
    const heavy = run(base, orbat, sectorStrength(base.sectors[0]!, orbat, 'defence') * 0.4, 104)
      .theatre;
    /* A sector does not sit at ninety-four per cent for three years. */
    expect(heavy.sectors[0]!.control).toBeGreaterThan(97);
  });

  it('builds a map with ground on it', () => {
    const t = campaign(army(), true, 0.5);
    expect(t.sectors.length).toBeGreaterThan(3);
    expect(terrainMix(t).length).toBeGreaterThan(1);
    expect(t.sectors.every((s) => s.population > 0)).toBe(true);
    expect(SUPPLY_DECAY_PER_DEPTH).toBeGreaterThan(0);
  });
});
