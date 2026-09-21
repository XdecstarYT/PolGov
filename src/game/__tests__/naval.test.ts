/**
 * naval.test.ts — built in decades, lost in an afternoon, and the option
 * that looks free.
 *
 * Three defects here were found by running campaigns rather than by
 * reading the code, and all three were the kind that a single-week test
 * passes happily:
 *
 * The fleet sailed once and never again. A ship reached its deployment
 * limit, came home, and nothing sent it back — so a government that
 * ordered twelve hulls to sea got twenty-six weeks of presence and then
 * nothing, silently, for the rest of the run. Behind that failure was a
 * much better mechanic: a standing commitment is kept by ROTATION, which
 * is why continuous presence costs three times the hulls anybody
 * expects.
 *
 * The air force kept bombing a country it was at peace with, because
 * effort was set once and never gated on there being a war.
 *
 * And aircrew quality sank below its opening value forever, because the
 * training standard was set to a number nobody had checked against what
 * an untouched country actually starts at.
 */

import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.ts';
import {
  afloat,
  buildNavy,
  describeNavy,
  fleetUpkeep,
  laneSecurity,
  orderShip,
  presenceAt,
  recallFleet,
  seaworthy,
  station,
  stepNavy,
  sustainablePresence,
  totalPresence,
  zoneControl,
  type NavyInputs,
} from '../systems/naval.ts';
import {
  aircrewQuality,
  availableSorties,
  buildAirForce,
  campaignWeight,
  describeAir,
  effortShares,
  orderSquadron,
  readyShare,
  setEffort,
  stepAir,
  type AirInputs,
} from '../systems/air.ts';
import { SEA_ZONES, findShip } from '../content/naval.ts';
import { AIRCRAFT_TEMPLATES, findAircraft, findCampaign } from '../content/air.ts';
import {
  AIRCREW_TRAINING_STANDARD,
  DEPLOYMENT_LIMIT,
  ROTATION_RATIO,
  SERVICEABILITY_AT_PEACE,
  SERVICEABILITY_AT_WAR,
  TURNS_PER_YEAR,
} from '../balance.ts';
import type { AirForce, Navy } from '../types.ts';

const seaQuiet = (turn: number, over: Partial<NavyInputs> = {}): NavyInputs => ({
  funding: 1,
  atWar: false,
  intensity: 0,
  opposition: 1,
  turn,
  rng: new Rng(turn + 7),
  moneyScale: 1,
  ...over,
});

const sail = (navy: Navy, weeks: number, over: Partial<NavyInputs> = {}) => {
  let n = navy;
  let lost = 0;
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepNavy(n, seaQuiet(t, over));
    n = tick.navy;
    lost += tick.lost.length;
  }
  return { navy: n, lost };
};

const airQuiet = (turn: number, over: Partial<AirInputs> = {}): AirInputs => ({
  funding: 1,
  atWar: false,
  intensity: 0,
  opposition: 1,
  trainingFunding: 1,
  turn,
  ...over,
});

const fly = (air: AirForce, weeks: number, over: Partial<AirInputs> = {}) => {
  let a = air;
  const totals = { interdiction: 0, closeSupport: 0, damage: 0, hardening: 0 };
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepAir(a, airQuiet(t, over));
    a = tick.air;
    totals.interdiction += tick.interdiction;
    totals.closeSupport += tick.closeSupport;
    totals.damage += tick.bombingDamage;
    totals.hardening += tick.bombingHardening;
  }
  return { air: a, ...totals };
};

/* ------------------------------------------------------------------ *
 * The fleet
 * ------------------------------------------------------------------ */

describe('navy: a standing commitment is kept by rotation', () => {
  it('keeps ships on station indefinitely instead of sailing once', () => {
    /*
     * The failure this replaced: a ship reached its deployment limit,
     * came home, and nothing sent it back. A government that ordered
     * twelve hulls to sea got twenty-six weeks of presence and then
     * nothing, for the rest of the run, with nothing said about it.
     */
    const posted = station(buildNavy(1), 'approaches', 10);
    const after = sail(posted, 208).navy;
    expect(afloat(after).filter((s) => s.station === 'approaches').length).toBeGreaterThan(6);
    expect(presenceAt(after, 'approaches')).toBeGreaterThan(0);
  });

  it('cycles individual ships home and out again', () => {
    const posted = station(buildNavy(1), 'approaches', 8);
    const after = sail(posted, 156).navy;
    /* Somebody has been home. Nobody has been out the whole time. */
    expect(after.ships.some((s) => s.weeksDeployed < DEPLOYMENT_LIMIT)).toBe(true);
    expect(after.ships.every((s) => s.weeksDeployed <= DEPLOYMENT_LIMIT)).toBe(true);
  });

  it('costs about three hulls for every one continuously present', () => {
    /*
     * One on station, one working up, one in refit. Every navy knows
     * this and no government has put it in a manifesto, because the
     * sentence is "we must triple the fleet to be present in one more
     * place" and nobody has won an argument with it.
     */
    const navy = buildNavy(1);
    const hulls = afloat(navy).length;
    const after = sail(station(navy, 'trade_route', hulls), 208).navy;
    const onStation = afloat(after).filter((s) => s.station === 'trade_route').length;
    expect(onStation).toBeLessThan(hulls * 0.55);
    expect(onStation).toBeGreaterThan(hulls * 0.15);
  });

  it('keeps the fleet out of phase with itself', () => {
    /*
     * Without this the whole fleet sails together, wears at the same
     * rate, comes home in the same month and refits in the same year,
     * and the country is at sea in pulses with nothing in between. It
     * was, and the rule-of-three test above was passing on an average
     * taken across a fleet that was either entirely out or entirely
     * alongside.
     */
    const navy = station(buildNavy(1), 'trade_route', 45);
    let n = navy;
    const counts: number[] = [];
    for (let t = 0; t < 416; t += 1) {
      n = stepNavy(n, seaQuiet(t)).navy;
      if (t > 100) counts.push(afloat(n).filter((s) => s.station !== null).length);
    }
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    /* On station about a third of the time — the rule of three, emerging
       from the wear and refit rates rather than asserted anywhere. */
    expect(mean / 45).toBeGreaterThan(1 / ROTATION_RATIO - 0.12);
    expect(mean / 45).toBeLessThan(1 / ROTATION_RATIO + 0.12);
    /* And never all of it, nor none of it. */
    expect(Math.min(...counts)).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBeLessThan(45);
  });

  it('holds nothing the moment the ships leave', () => {
    const posted = sail(station(buildNavy(1), 'approaches', 10), 52).navy;
    expect(zoneControl(posted, 'approaches')).toBeGreaterThan(0);
    const home = recallFleet(posted);
    /* There is no occupying the sea. Everything a navy achieves has to
       be achieved again next week. */
    expect(zoneControl(home, 'approaches')).toBe(0);
    expect(laneSecurity(home)).toBe(0);
  });

  it('cannot be present everywhere, and never says which it has left', () => {
    const navy = buildNavy(1);
    const demand = SEA_ZONES.reduce((s, z) => s + z.demand, 0);
    /*
     * Against the SUSTAINABLE figure, not the fleet list. A government
     * promising to be somewhere is promising continuous presence, and
     * only about a third of a fleet is ever on station.
     */
    expect(sustainablePresence(navy)).toBeLessThan(demand * 0.65);
    expect(totalPresence(navy)).toBeGreaterThan(sustainablePresence(navy));
  });
});

describe('navy: the fleet list is not the fleet', () => {
  it('hollows out under a maintenance economy while the hull count does not move', () => {
    const navy = station(buildNavy(1), 'approaches', 10);
    const starved = sail(navy, 416, { funding: 0.15 }).navy;
    /* The briefed figure is unchanged. */
    expect(afloat(starved).length).toBe(afloat(navy).length);
    /* And there is no navy. */
    expect(seaworthy(starved).length).toBeLessThan(afloat(navy).length * 0.2);
    expect(describeNavy(starved, 416)).toMatch(/could sail/);
  });

  it('holds its condition when the maintenance is funded', () => {
    const navy = station(buildNavy(1), 'approaches', 10);
    const kept = sail(navy, 416, { funding: 1 }).navy;
    expect(seaworthy(kept).length).toBe(afloat(kept).length);
  });
});

describe('navy: built in decades, lost in an afternoon', () => {
  it('takes years to order anything and delivers it to a successor', () => {
    const navy = buildNavy(1);
    const { dueTurn, cost } = orderShip(navy, 'carrier', 0, 1);
    expect(dueTurn).toBeGreaterThan(TURNS_PER_YEAR * 6);
    expect(cost).toBeGreaterThan(50);
    /* A term is 208 weeks. This is two of them. */
    expect(dueTurn).toBeGreaterThan(208);
  });

  it('commissions what a previous government ordered', () => {
    const ordered = orderShip(buildNavy(1), 'frigate', 0, 1).navy;
    const before = afloat(ordered).length;
    const after = sail(ordered, Math.round(4 * TURNS_PER_YEAR) + 2).navy;
    expect(afloat(after).length).toBe(before + 1);
  });

  it('loses ships in contested water and does not replace them', () => {
    const posted = station(buildNavy(1), 'contested', 14);
    const out = sail(posted, 156, { atWar: true, intensity: 70, opposition: 1.4 });
    expect(out.lost).toBeGreaterThan(0);
    expect(afloat(out.navy).length).toBe(afloat(posted).length - out.lost);
    expect(out.navy.prestigeLost).toBeGreaterThan(0);
  });

  it('charges more for losing something everybody had heard of', () => {
    expect(findShip('carrier').prestige).toBeGreaterThan(findShip('frigate').prestige * 4);
    expect(findShip('carrier').buildYears).toBeGreaterThan(findShip('corvette').buildYears * 2);
  });

  it('keeps ships out of the loss column when they stay at home', () => {
    const out = sail(buildNavy(1), 208, { atWar: true, intensity: 80, opposition: 2 });
    expect(out.lost).toBe(0);
  });

  it('costs what it costs whether or not it leaves harbour', () => {
    expect(fleetUpkeep(buildNavy(1), 1)).toBeGreaterThan(0);
    expect(fleetUpkeep(buildNavy(1, false), 1)).toBeLessThan(fleetUpkeep(buildNavy(1), 1));
  });
});

/* ------------------------------------------------------------------ *
 * The air force
 * ------------------------------------------------------------------ */

describe('air: a consumable that looks like an asset', () => {
  it('stays where it was found when nothing is asked of it', () => {
    const opening = buildAirForce(1);
    const after = fly(opening, 416).air;
    expect(readyShare(after) * 100).toBeCloseTo(SERVICEABILITY_AT_PEACE, 0);
    /* Two points of drift in eight years, from the handful of aircraft a
       peacetime air force loses anyway. Stated as a bound. */
    expect(Math.abs(aircrewQuality(after) - aircrewQuality(opening))).toBeLessThan(3);
  });

  it('loses a third of itself within two years of flying, without being shot down', () => {
    const working = setEffort(buildAirForce(1), { close_support: 1 });
    const after = fly(working, 104, { atWar: true, intensity: 60 }).air;
    expect(readyShare(after) * 100).toBeLessThan(SERVICEABILITY_AT_PEACE - 15);
    expect(readyShare(after) * 100).toBeCloseTo(SERVICEABILITY_AT_WAR, -1);
    /* And the missing part is mostly not losses. */
    expect(after.airframesLost).toBeLessThan(after.squadrons.length * 12);
  });

  it('recovers its aircraft and not its aircrew', () => {
    const working = setEffort(buildAirForce(1), { close_support: 1 });
    const fought = fly(working, 104, { atWar: true, intensity: 60 }).air;
    const rested = fly(fought, 208).air;
    /* The aircraft come back. */
    expect(readyShare(rested) * 100).toBeCloseTo(SERVICEABILITY_AT_PEACE, 0);
    /* The people do not, or not inside any war. */
    expect(aircrewQuality(fought)).toBeLessThan(50);
    expect(aircrewQuality(rested)).toBeLessThan(AIRCREW_TRAINING_STANDARD);
  });

  it('has more sorties behind it and worse people flying them', () => {
    const working = setEffort(buildAirForce(1), { close_support: 1 });
    const before = aircrewQuality(working);
    const after = fly(working, 104, { atWar: true, intensity: 60 }).air;
    expect(after.squadrons[0]!.sortiesFlown).toBeGreaterThan(0);
    expect(aircrewQuality(after)).toBeLessThan(before);
  });

  it('does not fly a campaign in a country it is at peace with', () => {
    /*
     * The failure this replaced: effort was set once and never gated on
     * there being a war, so a government that ordered a bombing campaign
     * carried on bombing for the rest of the run, and nothing in the log
     * mentioned it.
     */
    const bombing = setEffort(buildAirForce(1), { strategic: 1 });
    const out = fly(bombing, 208);
    expect(out.damage).toBe(0);
    expect(out.air.bombingResolve).toBe(0);
  });
});

describe('air: the sky is a precondition, not a victory', () => {
  it('loses the sky to an opponent when nobody is contesting it', () => {
    const bombing = setEffort(buildAirForce(1), { strategic: 1 });
    const after = fly(bombing, 104, { atWar: true, intensity: 60 }).air;
    expect(after.superiority).toBeLessThan(-40);
  });

  it('multiplies everything else and achieves nothing on its own', () => {
    const only = setEffort(buildAirForce(1), { superiority: 1 });
    const out = fly(only, 104, { atWar: true, intensity: 60 });
    expect(out.air.superiority).toBeGreaterThan(-20);
    /* Owning the sky delivers no interdiction and no support by itself. */
    expect(out.interdiction).toBe(0);
    expect(out.closeSupport).toBe(0);
  });

  it('divides finite effort, so ordering everything orders nothing', () => {
    const focused = setEffort(buildAirForce(1), { close_support: 1 });
    const spread = setEffort(buildAirForce(1), {
      superiority: 1,
      interdiction: 1,
      close_support: 1,
      strategic: 1,
    });
    const a = fly(focused, 104, { atWar: true, intensity: 60 }).closeSupport;
    const b = fly(spread, 104, { atWar: true, intensity: 60 }).closeSupport;
    expect(b).toBeLessThan(a * 0.5);
    expect(Object.values(effortShares(spread)).reduce((s, v) => s + (v ?? 0), 0)).toBeCloseTo(1, 6);
  });
});

describe('air: the option that looks free', () => {
  it('destroys a great deal and hardens the people it is aimed at', () => {
    const bombing = setEffort(buildAirForce(1), { strategic: 1 });
    const out = fly(bombing, 208, { atWar: true, intensity: 60 });
    expect(out.damage).toBeGreaterThan(0);
    /*
     * The cost is a cost, not a diminishing return, because a
     * diminishing return would still be a return. An engine in which
     * bombing works is modelling the brochure.
     */
    expect(out.air.bombingResolve).toBeGreaterThan(0);
    expect(describeAir(out.air)).toMatch(/hardened/);
  });

  it('hardens them more the harder it is pressed', () => {
    const light = fly(setEffort(buildAirForce(1), { strategic: 0.25, close_support: 0.75 }), 208, {
      atWar: true,
      intensity: 60,
    });
    const heavy = fly(setEffort(buildAirForce(1), { strategic: 1 }), 208, {
      atWar: true,
      intensity: 60,
    });
    expect(heavy.air.bombingResolve).toBeGreaterThan(light.air.bombingResolve);
  });

  it('leaves the hardening behind after the campaign ends', () => {
    const bombed = fly(setEffort(buildAirForce(1), { strategic: 1 }), 104, {
      atWar: true,
      intensity: 60,
    }).air;
    const later = fly(bombed, 104).air;
    expect(later.bombingResolve).toBeGreaterThan(bombed.bombingResolve * 0.5);
  });

  it('says out loud what each campaign actually achieves', () => {
    for (const campaign of ['superiority', 'interdiction', 'close_support', 'strategic'] as const) {
      expect(findCampaign(campaign).honest.length).toBeGreaterThan(40);
    }
  });
});

describe('air: aircrew are the constraint', () => {
  it('takes years to make one and orders squadrons faster than people', () => {
    const { dueTurn } = orderSquadron(buildAirForce(1), 'multirole', 0, 1);
    expect(dueTurn).toBeGreaterThan(TURNS_PER_YEAR * 3);
    expect(dueTurn).toBeLessThan(TURNS_PER_YEAR * 5);
  });

  it('runs a training pipeline that settles rather than runs away', () => {
    const rested = fly(buildAirForce(1), 416).air;
    expect(rested.trainees).toBeGreaterThan(0);
    const longer = fly(rested, 208).air;
    expect(Math.abs(longer.trainees - rested.trainees)).toBeLessThan(rested.trainees * 0.2);
  });

  it('counts uncrewed squadrons as losing airframes and not people', () => {
    expect(findAircraft('drone').crewed).toBe(false);
    expect(findAircraft('drone').attrition).toBeGreaterThan(findAircraft('fighter').attrition);
    const drones = setEffort(
      { ...buildAirForce(1), squadrons: buildAirForce(1).squadrons.filter((s) => s.kind === 'drone') },
      { interdiction: 1 },
    );
    const out = fly(drones, 104, { atWar: true, intensity: 60 });
    expect(out.air.airframesLost).toBeGreaterThan(0);
    expect(out.air.aircrewLost).toBe(0);
  });

  it('gives every aircraft a job and a price for it', () => {
    for (const template of AIRCRAFT_TEMPLATES) {
      expect(template.cost).toBeGreaterThan(0);
      expect(template.buildYears).toBeGreaterThan(1);
      expect(template.blurb.length).toBeGreaterThan(20);
    }
    expect(availableSorties(buildAirForce(1))).toBeGreaterThan(0);
    expect(campaignWeight(setEffort(buildAirForce(1), { superiority: 1 }), 'superiority')).toBeGreaterThan(0);
  });
});
