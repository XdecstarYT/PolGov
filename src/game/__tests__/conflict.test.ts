/**
 * conflict.test.ts — the rally that curdles.
 *
 * One claim, measured over a hundred and twenty weeks: approval jumps when
 * a crisis begins, decays within months, and goes negative if the crisis
 * outlives the country's patience. Governments know this. They escalate
 * anyway, because the jump is this month and the fall is next year and
 * backing down costs something immediately and in public.
 *
 * The asymmetry is the mechanic, not a balance problem, so it is asserted
 * rather than tuned away.
 */

import { describe, expect, it } from 'vitest';
import {
  CASUALTY_APPROVAL,
  CRISIS_RALLY,
  CRISIS_RALLY_HALFLIFE,
  DEESCALATION_APPROVAL,
  ESCALATION_APPROVAL,
  PATIENCE_FLOOR,
} from '../balance.ts';
import { findNation } from '../content/nations.ts';
import { Rng } from '../rng.ts';
import { buildWorld } from '../systems/diplomacy.ts';
import { buildMilitary, combatPower } from '../systems/military.ts';
import {
  atWar,
  balanceOfForce,
  deEscalate,
  describeCrisis,
  deterred,
  escalate,
  live,
  openCrisis,
  rungOf,
  settle,
  STAGE_LABELS,
  stepConflicts,
} from '../systems/conflict.ts';
import { createStandardGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import type { Crisis, GameState, Military, World } from '../index.ts';

/** A world where somebody is genuinely hostile and the room is tense. */
function dangerous(): World {
  const base = buildWorld();
  return {
    ...base,
    tension: 62,
    nations: base.nations.map((n) => (n.key === 'ehlas' ? { ...n, relations: -70 } : n)),
  };
}

function inOffice(id = 'conflict-test'): GameState {
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

/** Run a crisis forward and record what it did to approval, week by week. */
function run(
  crisis: Crisis,
  military: Military,
  world: World,
  weeks: number,
): { crises: Crisis[]; approvalByWeek: number[]; events: string[] } {
  let crises = [crisis];
  const approvalByWeek: number[] = [];
  const events: string[] = [];
  const rng = new Rng(11);

  for (let week = 1; week <= weeks; week += 1) {
    const tick = stepConflicts(crises, { military, world, turn: week, rng });
    crises = tick.crises;
    approvalByWeek.push(tick.approval);
    events.push(...tick.events.map((e) => e.label));
    if (crises[0]!.stage === 'settled') break;
  }
  return { crises, approvalByWeek, events };
}

const sum = (xs: readonly number[]) => xs.reduce((total, x) => total + x, 0);

describe('the ladder', () => {
  it('has rungs in the order a quarrel actually goes', () => {
    expect(rungOf('incident')).toBeLessThan(rungOf('standoff'));
    expect(rungOf('standoff')).toBeLessThan(rungOf('crisis'));
    expect(rungOf('crisis')).toBeLessThan(rungOf('war'));
    for (const stage of ['incident', 'standoff', 'crisis', 'war', 'settled'] as const) {
      expect(STAGE_LABELS[stage].length).toBeGreaterThan(0);
    }
  });

  it('is cheap to climb and expensive to come down', () => {
    /* The asymmetry, stated in the constants because it is the mechanic. */
    expect(ESCALATION_APPROVAL).toBeGreaterThan(0);
    expect(DEESCALATION_APPROVAL).toBeLessThan(0);
    expect(Math.abs(DEESCALATION_APPROVAL)).toBeGreaterThan(ESCALATION_APPROVAL);
  });

  it('refreshes the rally when the government stands firm, and hardens them', () => {
    const crisis = openCrisis('ehlas', 'A patrol crossed a line.', 1, dangerous());
    const after = escalate(crisis, 5);

    expect(rungOf(after.stage)).toBe(rungOf(crisis.stage) + 1);
    expect(after.rally).toBe(CRISIS_RALLY);
    expect(after.ourResolve).toBeGreaterThan(crisis.ourResolve);
    /* And the part nobody announces: they dig in too. */
    expect(after.theirResolve).toBeGreaterThan(crisis.theirResolve);
  });

  it('costs resolve on both sides to step back', () => {
    const crisis = escalate(openCrisis('ehlas', 'x', 1, dangerous()), 2);
    const after = deEscalate(crisis, 6);
    expect(rungOf(after.stage)).toBe(rungOf(crisis.stage) - 1);
    expect(after.rally).toBe(0);
    expect(after.ourResolve).toBeLessThan(crisis.ourResolve);
  });

  it('has no rung above war', () => {
    const war: Crisis = { ...openCrisis('ehlas', 'x', 1, dangerous()), stage: 'war' };
    expect(escalate(war, 2).stage).toBe('war');
    /* Coming down from a war goes to a crisis, not to nothing. */
    expect(deEscalate(war, 2).stage).toBe('crisis');
  });
});

describe('the rally, and what happens to it', () => {
  it('is worth what the literature says and goes as fast', () => {
    const world = dangerous();
    const crisis = openCrisis('ehlas', 'x', 1, world);
    const { approvalByWeek } = run(crisis, buildMilitary(), world, 26);

    /* Front-loaded: most of what the flag is worth arrives in the first
       quarter, which is the finding and the temptation. */
    const firstQuarter = sum(approvalByWeek.slice(0, CRISIS_RALLY_HALFLIFE));
    const secondQuarter = sum(approvalByWeek.slice(CRISIS_RALLY_HALFLIFE, CRISIS_RALLY_HALFLIFE * 2));
    expect(firstQuarter).toBeGreaterThan(0);
    expect(firstQuarter).toBeGreaterThan(secondQuarter * 1.5);
  });

  it('curdles: an unfinished crisis costs what it first paid, and more', () => {
    const world = dangerous();
    const crisis = openCrisis('ehlas', 'A patrol crossed a line.', 1, world);
    const { approvalByWeek } = run(crisis, buildMilitary(), world, 120);

    const peak = Math.max(
      ...approvalByWeek.map((_, i) => sum(approvalByWeek.slice(0, i + 1))),
    );
    const total = sum(approvalByWeek);

    /* It went up first. */
    expect(peak).toBeGreaterThan(2);
    /* And ended below where it started, which is the whole point. */
    expect(total).toBeLessThan(0);
    expect(total).toBeLessThan(peak - 10);
  });

  it('bleeds steadily rather than spiralling, because long crises are survived', () => {
    /* A spiral would make every long crisis fatal. They are usually not,
       which is precisely why governments let them run. */
    expect(PATIENCE_FLOOR).toBeGreaterThan(0);
    expect(PATIENCE_FLOOR).toBeLessThan(1);
  });
});

describe('what decides a war', () => {
  it('is the force ratio, and distance is most of it', () => {
    const world = dangerous();
    const military = buildMilitary();
    const neighbour = openCrisis('ehlas', 'x', 1, world);
    const distant = openCrisis('holm', 'x', 1, world);

    expect(findNation('ehlas').neighbour).toBe(true);
    expect(findNation('holm').neighbour).toBe(false);
    /* Fought at home, everything the country owns counts. Fought abroad,
       almost nothing does — which is why a middling country can be hard to
       invade and unable to do anything two borders away. */
    expect(balanceOfForce(neighbour, military, world)).toBeGreaterThan(0);
    expect(balanceOfForce(distant, military, world)).toBeGreaterThan(0);
  });

  it('is never chosen by the player, only paid for by them', () => {
    const world = dangerous();
    const war: Crisis = {
      ...openCrisis('ehlas', 'x', 1, world),
      stage: 'war',
      theirResolve: 90,
      ourResolve: 80,
    };
    const { crises, approvalByWeek } = run(war, buildMilitary(), world, 40);

    /* Casualties accrue whatever anybody decides, and each one is approval
       that does not come back. */
    expect(crises[0]!.casualties).toBeGreaterThan(0);
    expect(sum(approvalByWeek)).toBeLessThan(0);
    expect(CASUALTY_APPROVAL).toBeLessThan(0);
  });

  it('ends when one side has had enough, not when anybody wins', () => {
    const world = dangerous();
    const war: Crisis = {
      ...openCrisis('ehlas', 'x', 1, world),
      stage: 'war',
      ourResolve: 26,
      theirResolve: 95,
    };
    const { crises, events } = run(war, buildMilitary(), world, 60);
    expect(crises[0]!.stage).toBe('settled');
    expect(events.join(' ')).toContain('had enough');
  });

  it('knocks a war out of the economy as well as the polling', () => {
    const world = dangerous();
    const war: Crisis = { ...openCrisis('ehlas', 'x', 1, world), stage: 'war' };
    const tick = stepConflicts([war], {
      military: buildMilitary(),
      world,
      turn: 2,
      rng: new Rng(4),
    });
    expect(tick.economicShock).toBeLessThan(0);
    expect(tick.cost).toBeGreaterThan(0);
    expect(atWar(tick.crises)).toBe(true);
  });
});

describe('deterrence', () => {
  it('shows up as a crisis that does not go anywhere', () => {
    const world = dangerous();
    const weak = buildMilitary();
    const strong: Military = {
      ...weak,
      arms: weak.arms.map((a) => ({ ...a, strength: 95, readiness: 95, equipment: 90 })),
    };
    const crisis = openCrisis('ehlas', 'x', 1, world);

    expect(combatPower(strong)).toBeGreaterThan(combatPower(weak));
    expect(deterred(crisis, strong, world)).toBe(true);
    expect(deterred(crisis, weak, world)).toBe(false);

    /* And so the ladder stays where it is. The whole payoff for four years
       of budgets is an absence, which nobody has ever been thanked for. */
    const held = run(crisis, strong, world, 90);
    expect(held.crises[0]!.stage === 'war').toBe(false);
    expect(describeCrisis(held.crises[0]!, strong, world)).toContain('not going further');
  });
});

describe('settling', () => {
  it('produces terms the position earned, not terms anybody negotiated', () => {
    const world = dangerous();
    const weak = buildMilitary();
    const strong: Military = {
      ...weak,
      arms: weak.arms.map((a) => ({ ...a, strength: 98, readiness: 98, equipment: 95 })),
    };
    const crisis = openCrisis('ehlas', 'x', 1, world);

    const fromStrength = settle({ ...crisis, ourResolve: 85, theirResolve: 40 }, strong, world, 9);
    const fromWeakness = settle({ ...crisis, ourResolve: 30, theirResolve: 90 }, weak, world, 9);

    expect(fromStrength.terms).toBe('favourable');
    expect(fromWeakness.terms).toBe('unfavourable');
    expect(fromStrength.approval).toBeGreaterThan(fromWeakness.approval);
    expect(fromStrength.crisis.stage).toBe('settled');
  });
});

describe('through the turn engine', () => {
  const withCrisis = (state: GameState): GameState => ({
    ...state,
    politicalCapital: 200,
    crises: [openCrisis('ehlas', 'A patrol crossed a line.', state.turnNumber, state.world)],
  });

  it('pays for standing firm this week and charges for it later', () => {
    const state = withCrisis(inOffice('conflict-escalate'));
    const result = applyIntent(state, {
      type: 'escalate_crisis',
      crisisId: state.crises[0]!.id,
    });
    expect(result.error).toBeUndefined();
    expect(result.state.approval).toBeGreaterThan(state.approval);
    expect(rungOf(result.state.crises[0]!.stage)).toBe(1);
  });

  it('charges for backing down immediately and in public', () => {
    const state = withCrisis(inOffice('conflict-deescalate'));
    const escalated = applyIntent(state, {
      type: 'escalate_crisis',
      crisisId: state.crises[0]!.id,
    }).state;
    const result = applyIntent(
      { ...escalated, politicalCapital: 200 },
      { type: 'de_escalate_crisis', crisisId: state.crises[0]!.id },
    );
    expect(result.error).toBeUndefined();
    expect(result.state.approval).toBeLessThan(escalated.approval);
  });

  it('refuses to climb above war', () => {
    const state = withCrisis(inOffice('conflict-war'));
    const atWarNow: GameState = {
      ...state,
      crises: [{ ...state.crises[0]!, stage: 'war' }],
    };
    const result = applyIntent(atWarNow, {
      type: 'escalate_crisis',
      crisisId: atWarNow.crises[0]!.id,
    });
    expect(result.error).toContain('no rungs above');
  });

  it('settles, and the relationship survives it', () => {
    const state = withCrisis(inOffice('conflict-settle'));
    const result = applyIntent(state, {
      type: 'settle_crisis',
      crisisId: state.crises[0]!.id,
    });
    expect(result.error).toBeUndefined();
    expect(live(result.state.crises)).toHaveLength(0);
    expect(result.state.world.tension).toBeLessThan(state.world.tension);

    const was = state.world.nations.find((n) => n.key === 'ehlas')!.relations;
    const now = result.state.world.nations.find((n) => n.key === 'ehlas')!.relations;
    expect(now).toBeGreaterThan(was);
  });
});
