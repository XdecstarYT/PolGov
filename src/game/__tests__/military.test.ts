/**
 * military.test.ts — deterrence is bought years before it is needed.
 *
 * The claim this engine makes is that defence policy has a shape in time:
 * every decision is slow, every consequence is late, and the number that
 * responds fastest to a cut is the one nobody can see. A model that did not
 * produce that shape would be a slider labelled "strong", which is the
 * version worth not building.
 *
 * So the tests here are mostly about the ORDER things happen in — readiness
 * before strength, equipment falling regardless, a programme collected by a
 * successor — because the ordering is the whole argument.
 */

import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_FLOOR,
  PROCUREMENT_COST_CAP,
  PROCUREMENT_SLIP,
  PROCUREMENT_SLIP_CAP,
  READINESS_FUNDING_PIVOT,
  TURNS_PER_TERM,
  TURNS_PER_YEAR,
} from '../balance.ts';
import { ARM_TEMPLATES, DOCTRINE_TEMPLATES, findProgramme } from '../content/forces.ts';
import { Rng } from '../rng.ts';
import { buildWorld } from '../systems/diplomacy.ts';
import {
  armPower,
  buildMilitary,
  cancelProgramme,
  combatPower,
  committedShare,
  deploy,
  deploymentTerms,
  describeForces,
  deterrence,
  findArmState,
  startProgramme,
  stepMilitary,
} from '../systems/military.ts';
import { createStandardGame } from '../setup.ts';
import { absoluteWeek, applyIntent } from '../turn.ts';
import type { Demography, GameState, Military } from '../index.ts';

const world = buildWorld();

function tick(
  military: Military,
  over: Partial<Parameters<typeof stepMilitary>[1]> = {},
): ReturnType<typeof stepMilitary> {
  return stepMilitary(military, {
    funding: 100,
    required: 100,
    demography: { workforce: 21, population: 42.6 } as Demography,
    unemployment: 5,
    turn: 1,
    week: 1,
    rng: new Rng(3),
    atWar: false,
    ...over,
  });
}

/** Run n weeks at a given level of funding, as a share of what upkeep costs. */
function years(military: Military, count: number, cover: number, startWeek = 1): Military {
  let current = military;
  for (let w = 0; w < count * TURNS_PER_YEAR; w += 1) {
    current = tick(current, {
      funding: 100 * cover,
      required: 100,
      week: startWeek + w,
      turn: (startWeek + w) % TURNS_PER_TERM,
      rng: new Rng(w + 1),
    }).military;
  }
  return current;
}

function inOffice(id = 'mil-test'): GameState {
  let state = createStandardGame(id);
  if (state.phase === 'coalition') {
    for (const candidate of state.negotiation!.candidates) {
      state = applyIntent(state, {
        type: 'negotiation_accept',
        partyId: candidate.partyId,
      }).state;
    }
    state = applyIntent(state, { type: 'negotiation_form_government' }).state;
  }
  return state;
}

describe('the three numbers mean different things', () => {
  it('opens with readiness below strength, which is nobody’s achievement', () => {
    const military = buildMilitary();
    /*
     * True of every arm that has existed long enough to be neglected:
     * somebody protected the headline figure and did not protect the one
     * that decides anything. Cyber is the exception, for a reason worth
     * stating — it is small, new, and has not had time to acquire a
     * maintenance backlog.
     */
    for (const arm of military.arms.filter((a) => a.key !== 'cyber')) {
      expect(arm.readiness).toBeLessThan(arm.strength);
    }
    expect(findArmState(military, 'cyber').readiness).toBeGreaterThan(
      findArmState(military, 'cyber').strength,
    );
  });

  it('opens with an air force whose flying hours went first', () => {
    /* The easiest line in the whole budget to cut without anybody
       noticing, and the one that decides how fast anything happens. */
    const military = buildMilitary();
    expect(findArmState(military, 'air').readiness).toBe(
      Math.min(...military.arms.map((a) => a.readiness)),
    );
  });

  it('needs all three, because none of them substitutes for another', () => {
    const base = { key: 'army' as const, strength: 80, readiness: 80, equipment: 80, personnel: 0 };
    /* A large unready force with old kit is a budget line, not a capability
       — which is only true if these multiply rather than add. */
    expect(armPower({ ...base, readiness: 10 })).toBeLessThan(armPower(base) * 0.2);
    expect(armPower({ ...base, strength: 10 })).toBeLessThan(armPower(base) * 0.2);
  });

  it('moves readiness within months and strength over years', () => {
    /*
     * The mechanic, stated as a measurement. A year of generous funding
     * transforms readiness and barely touches strength — which is why
     * readiness is the first thing cut and the first thing missed.
     */
    const start = buildMilitary();
    const after = years(start, 1, 1.4);

    const r0 = findArmState(start, 'army').readiness;
    const r1 = findArmState(after, 'army').readiness;
    const s0 = findArmState(start, 'army').strength;
    const s1 = findArmState(after, 'army').strength;

    expect(r1 - r0).toBeGreaterThan(20);
    expect(Math.abs(s1 - s0)).toBeLessThan(10);
  });

  it('starves readiness below the pivot however loudly anybody insists otherwise', () => {
    const lean = years(buildMilitary(), 3, READINESS_FUNDING_PIVOT - 0.05);
    for (const arm of lean.arms) expect(arm.readiness).toBeLessThan(12);
    /* And the headline figure barely moves, which is the whole trap. */
    expect(findArmState(lean, 'army').strength).toBeGreaterThan(30);
  });

  it('ages the equipment whatever anybody does', () => {
    const generous = years(buildMilitary(), 4, 1.6);
    for (const arm of generous.arms) {
      expect(arm.equipment).toBeLessThan(findArmState(buildMilitary(), arm.key).equipment);
      expect(arm.equipment).toBeGreaterThanOrEqual(EQUIPMENT_FLOOR);
    }
    /* Fastest where the technology moves fastest, which is a claim about
       the RATE rather than about where anybody ends up. */
    const start = buildMilitary();
    const lost = (key: 'army' | 'cyber') =>
      findArmState(start, key).equipment - findArmState(generous, key).equipment;
    expect(lost('cyber')).toBeGreaterThan(lost('army'));
  });
});

describe('what a force can actually do', () => {
  it('is smaller away from home, because getting there is most of the problem', () => {
    const military = buildMilitary();
    const territorial: Military = { ...military, doctrine: 'territorial' };
    const expeditionary: Military = { ...military, doctrine: 'expeditionary' };

    expect(combatPower(territorial, true)).toBeLessThan(combatPower(territorial));
    expect(combatPower(expeditionary, true)).toBeGreaterThan(combatPower(territorial, true));
    /* And the trade is real in both directions. */
    expect(combatPower(expeditionary)).toBeLessThan(combatPower(territorial));
  });

  it('counts nothing that is already somewhere else', () => {
    const military = buildMilitary();
    const terms = deploymentTerms('combat', 1.2);
    const committed = deploy(
      military,
      {
        nation: 'ehlas',
        kind: 'combat',
        commitment: terms.commitment,
        cost: terms.cost,
        startedTurn: 1,
        mandate: 'x',
      },
      1,
    );
    expect(committedShare(committed)).toBeGreaterThan(0);
    expect(combatPower(committed)).toBeLessThan(combatPower(military));
  });

  it('counts alliances as heavily as forces, which is the argument for having any', () => {
    const military = buildMilitary();
    const alone = deterrence(military, { ...world, treaties: [] });
    const allied = deterrence(military, {
      ...world,
      treaties: [
        ...world.treaties,
        {
          id: 't1',
          kind: 'mutual_defence' as const,
          parties: ['holm' as const],
          signedTurn: 0,
          signedTerm: 0,
          obligation: 'x',
          dividend: 0,
        },
      ],
    });
    expect(allied).toBeGreaterThan(alone);
  });

  it('wears a deployed force out faster than money repairs it', () => {
    const terms = deploymentTerms('combat', 1.4);
    const home = years(buildMilitary(), 2, 1.3);
    const away = years(
      deploy(
        buildMilitary(),
        { nation: 'ehlas', kind: 'combat', commitment: terms.commitment, cost: terms.cost, startedTurn: 1, mandate: 'x' },
        1,
      ),
      2,
      1.3,
    );
    expect(findArmState(away, 'army').readiness).toBeLessThan(
      findArmState(home, 'army').readiness,
    );
    /* And produces veterans, who are a constituency rather than a statistic. */
    expect(away.veterans).toBeGreaterThan(home.veterans);
  });
});

describe('procurement', () => {
  it('is already late on the day it is announced', () => {
    const started = startProgramme(buildMilitary(), 'frigates', 100);
    const programme = started.programmes[0]!;
    const template = findProgramme('frigates');

    expect(programme.dueTurn).toBe(100 + template.years * TURNS_PER_YEAR);
    expect(programme.slippedTo).toBeGreaterThan(programme.dueTurn);
    expect(programme.slippedTo - programme.dueTurn).toBeCloseTo(
      template.years * TURNS_PER_YEAR * PROCUREMENT_SLIP,
      0,
    );
  });

  it('slips and overruns, and then lands', () => {
    const template = findProgramme('combat_air');
    let military = startProgramme(buildMilitary(), 'combat_air', 1);
    let delivered = false;

    for (let week = 2; week <= 20 * TURNS_PER_YEAR && !delivered; week += 1) {
      const result = tick(military, { week, turn: week % TURNS_PER_TERM, rng: new Rng(week) });
      military = result.military;
      if (result.delivered.length > 0) delivered = true;
    }

    /* Bounded, because a programme that never arrives teaches nothing and
       is not what happens. It runs about half again as long, most of the
       way again as expensive, and then it is there. */
    expect(delivered).toBe(true);
    const programme = military.programmes[0]!;
    expect(programme.slippedTo - programme.dueTurn).toBeLessThanOrEqual(
      Math.round(template.years * TURNS_PER_YEAR * PROCUREMENT_SLIP_CAP) + months(6),
    );
    expect(programme.cost).toBeLessThanOrEqual(template.cost * PROCUREMENT_COST_CAP + 0.01);
    expect(programme.cost).toBeGreaterThan(template.cost);
  });

  it('is collected by a successor, because the clock does not reset', () => {
    /*
     * The turn number resets at every election. Procurement runs on a clock
     * that does not, which is what makes "a successor finishes it" mean
     * something rather than "it is delivered to whoever ordered it".
     */
    const state = inOffice('mil-clock');
    expect(absoluteWeek(state)).toBe(state.turnNumber);

    const laterTerm: GameState = { ...state, termNumber: 3, turnNumber: 4 };
    expect(absoluteWeek(laterTerm)).toBe(2 * TURNS_PER_TERM + 4);
    expect(absoluteWeek(laterTerm)).toBeGreaterThan(laterTerm.turnNumber);
  });

  it('is cheapest to cancel and hardest, because the jobs are in somebody’s seat', () => {
    const started = startProgramme(buildMilitary(), 'frigates', 1);
    const id = started.programmes[0]!.id;
    const stopped = cancelProgramme(started, id);
    expect(stopped.programmes[0]!.cancelled).toBe(true);

    /* It stops costing money immediately. The seats are the other half. */
    const template = findProgramme('frigates');
    expect(template.regions.length).toBeGreaterThan(0);
  });

  it('is a treadmill: a programme buys back what the years took', () => {
    let running = startProgramme(buildMilitary(), 'cyber_capability', 1);
    let idle = buildMilitary();
    let landed = 0;

    for (let week = 2; week <= 12 * TURNS_PER_YEAR; week += 1) {
      const step = { week, turn: week % TURNS_PER_TERM, rng: new Rng(week) };
      const result = tick(running, step);
      running = result.military;
      idle = tick(idle, step).military;
      if (result.delivered.length > 0) {
        landed = week;
        break;
      }
    }

    expect(landed).toBeGreaterThan(0);
    const bought = findArmState(running, 'cyber');
    const skipped = findArmState(idle, 'cyber');

    /* Far better than having skipped the cycle. */
    expect(bought.equipment).toBeGreaterThan(skipped.equipment + 20);
    expect(bought.strength).toBeGreaterThan(skipped.strength);

    /*
     * And barely better than where it started, which is the point and the
     * reason procurement is a treadmill rather than a decision: the most an
     * on-time programme buys is standing still.
     */
    expect(bought.equipment).toBeLessThan(buildMilitary().arms[0]!.equipment + 25);
  });
});

describe('doctrine', () => {
  it('offers no strictly better option', () => {
    /* Every one of them is worse than another at something. If one were
       dominant it would not be a decision, it would be a tutorial. */
    for (const doctrine of DOCTRINE_TEMPLATES) {
      const others = DOCTRINE_TEMPLATES.filter((d) => d.key !== doctrine.key);
      const beatenAtSomething = others.some(
        (other) =>
          other.defensive > doctrine.defensive ||
          other.expeditionary > doctrine.expeditionary ||
          other.readiness > doctrine.readiness ||
          other.manpower > doctrine.manpower ||
          other.surcharge < doctrine.surcharge,
      );
      expect(beatenAtSomething).toBe(true);
    }
  });

  it('charges for national service in the one currency governments care about', () => {
    const conscript = DOCTRINE_TEMPLATES.find((d) => d.key === 'conscript')!;
    expect(conscript.manpower).toBeGreaterThan(1.5);
    /* And an argument with everybody under twenty-five and their parents. */
    expect(conscript.approval).toBeLessThan(0);
    expect(conscript.readiness).toBeLessThan(1);
  });

  it('describes the forces without flattering them', () => {
    const neglected = years(buildMilitary(), 4, 0.6);
    expect(describeForces(neglected, world).length).toBeGreaterThan(0);
    expect(combatPower(neglected)).toBeLessThan(combatPower(buildMilitary()));
  });
});

describe('through the turn engine', () => {
  it('will not send forces that are already somewhere else', () => {
    const state = inOffice('mil-deploy');
    let current: GameState = { ...state, politicalCapital: 200 };
    for (const nation of ['holm', 'lorne', 'garda'] as const) {
      const result = applyIntent(current, {
        type: 'deploy_force',
        nation,
        kind: 'peacekeeping',
        scale: 1.2,
      });
      if (result.error) {
        expect(result.error).toContain('come home first');
        return;
      }
      current = { ...result.state, politicalCapital: 200 };
    }
    expect(committedShare(current.military)).toBeLessThanOrEqual(0.75);
  });

  it('charges the treasury for a doctrine nobody has costed', () => {
    const state: GameState = { ...inOffice('mil-doctrine'), politicalCapital: 200 };
    const result = applyIntent(state, { type: 'set_doctrine', doctrine: 'conscript' });
    expect(result.error).toBeUndefined();
    expect(result.state.military.doctrine).toBe('conscript');
    /* It is unpopular the day it is announced, which is the honest part. */
    expect(result.state.approval).toBeLessThan(state.approval);
  });

  it('refuses a programme already under way', () => {
    const state: GameState = { ...inOffice('mil-prog'), politicalCapital: 200 };
    const first = applyIntent(state, { type: 'start_programme', programme: 'armour' });
    expect(first.error).toBeUndefined();
    const again = applyIntent(
      { ...first.state, politicalCapital: 200 },
      { type: 'start_programme', programme: 'armour' },
    );
    expect(again.error).toContain('already under way');
  });
});

/** Local helper so the test file can talk in months without importing one. */
function months(n: number): number {
  return Math.max(1, Math.round((n * TURNS_PER_YEAR) / 12));
}

describe('the arms themselves', () => {
  it('describes four arms that are good at different things', () => {
    expect(ARM_TEMPLATES).toHaveLength(4);
    const defensive = [...ARM_TEMPLATES].sort((a, b) => b.defensive - a.defensive)[0]!;
    const expeditionary = [...ARM_TEMPLATES].sort((a, b) => b.expeditionary - a.expeditionary)[0]!;
    expect(defensive.key).toBe('army');
    expect(expeditionary.key).toBe('navy');
    /* And the budget shares add up to the whole of it. */
    expect(ARM_TEMPLATES.reduce((sum, a) => sum + a.budgetShare, 0)).toBeCloseTo(1, 2);
  });
});
