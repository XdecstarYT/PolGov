/**
 * organisations.test.ts — the vote the player cannot control.
 *
 * The thing being defended here is the absence of a lever. Every other
 * system in the engine answers to the player in the end; this one must not.
 * So these tests check that relationships decide the count, that the veto
 * beats the count, that membership costs more than it visibly returns, and
 * that leaving is read by everybody rather than by the body left.
 */

import { describe, expect, it } from 'vitest';
import {
  RESOLUTION_DEFEAT_INFLUENCE,
  TURNS_PER_YEAR,
  WITHDRAWAL_REPUTATION,
} from '../balance.ts';
import {
  ORGANISATION_TEMPLATES,
  RESOLUTION_TEMPLATES,
  findOrganisation,
} from '../content/organisations.ts';
import { NATION_TEMPLATES } from '../content/nations.ts';
import { Rng } from '../rng.ts';
import { buildWorld } from '../systems/diplomacy.ts';
import {
  admissionCheck,
  buildOrganisations,
  countTheRoom,
  describeOutcome,
  duesTotal,
  isMember,
  leanOf,
  stepOrganisations,
  voteOnResolution,
} from '../systems/organisations.ts';
import { applyIntent } from '../turn.ts';
import { createStandardGame } from '../setup.ts';
import type { GameState, World } from '../types.ts';

const world = (over: Partial<World> = {}): World => ({ ...buildWorld(), ...over });

/** Set every member of a room to the same relations figure. */
function withRelations(base: World, value: number): World {
  return { ...base, nations: base.nations.map((n) => ({ ...n, relations: value })) };
}

function inOffice(id = 'org-test'): GameState {
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

describe('the bodies themselves', () => {
  it('names only real states as members', () => {
    for (const template of ORGANISATION_TEMPLATES) {
      for (const member of [...template.members, ...template.vetoHolders]) {
        expect(NATION_TEMPLATES.some((n) => n.key === member)).toBe(true);
      }
      /* A veto holder that is not in the room could never use it. */
      for (const holder of template.vetoHolders) {
        expect(template.members).toContain(holder);
      }
    }
  });

  it('hears every resolution in a room that exists', () => {
    for (const template of RESOLUTION_TEMPLATES) {
      expect(() => findOrganisation(template.organisation)).not.toThrow();
    }
  });

  it('starts inside some rooms and outside others', () => {
    const built = buildOrganisations();
    expect(built.some((o) => o.member)).toBe(true);
    expect(built.some((o) => !o.member)).toBe(true);
    /* Nothing the player did. Both are inherited. */
    for (const state of built) {
      expect(state.joinedTurn === null || state.joinedTurn === 0).toBe(true);
    }
  });
});

describe('what belonging costs', () => {
  it('bills dues every week whether or not the room was used', () => {
    const tick = stepOrganisations(buildOrganisations());
    expect(tick.dues).toBeGreaterThan(0);
    expect(tick.dues * TURNS_PER_YEAR).toBeCloseTo(duesTotal(buildOrganisations()), 4);
  });

  it('returns less than it costs in any one week, and compounds', () => {
    const tick = stepOrganisations(buildOrganisations());
    /* Membership is a long position. A government that joins one to fix
       this year's problem has misunderstood what it bought. */
    expect(tick.influence).toBeLessThan(1);
    expect(tick.influence * TURNS_PER_YEAR).toBeGreaterThan(1);
  });

  it('gives a suspended member the obligations and not the benefits', () => {
    const suspended = buildOrganisations().map((o) => ({ ...o, suspended: true }));
    const tick = stepOrganisations(suspended);
    expect(tick.dues).toBeGreaterThan(0);
    expect(tick.influence).toBe(0);
    expect(tick.reputation).toBe(0);
  });
});

describe('getting in', () => {
  it('is decided by the member who likes you least', () => {
    const council = findOrganisation('council');
    const warm = withRelations(world(), 60);
    expect(admissionCheck(council, warm).admissible).toBe(true);

    /* One cold relationship in a room of six is a closed door, however warm
       the other five are. Admission is by consent, not by average. */
    const oneCold: World = {
      ...warm,
      nations: warm.nations.map((n) =>
        n.key === council.members[0] ? { ...n, relations: -40 } : n,
      ),
    };
    const check = admissionCheck(council, oneCold);
    expect(check.admissible).toBe(false);
    expect(check.blocker).toBe(council.members[0]);
  });

  it('refuses an application the room would not hear', () => {
    const state = inOffice();
    const cold: GameState = {
      ...state,
      politicalCapital: 100,
      world: withRelations(state.world, -60),
    };
    const attempt = applyIntent(cold, { type: 'join_organisation', organisation: 'council' });
    expect(attempt.error).toBeTruthy();
    expect(attempt.state).toBe(cold);
  });

  it('admits a government that spent the years on it, and starts billing', () => {
    const state = inOffice();
    const warm: GameState = {
      ...state,
      politicalCapital: 100,
      world: withRelations(state.world, 70),
    };
    const joined = applyIntent(warm, { type: 'join_organisation', organisation: 'council' });
    expect(joined.error).toBeUndefined();
    expect(isMember(joined.state.world.organisations, 'council')).toBe(true);
    expect(duesTotal(joined.state.world.organisations)).toBeGreaterThan(
      duesTotal(warm.world.organisations),
    );
    expect(joined.state.politicalCapital).toBeLessThan(warm.politicalCapital);
  });
});

describe('getting out', () => {
  it('is read by every government, not by the body left', () => {
    const state = inOffice();
    const before = state.world.reputation;
    const left = applyIntent(state, { type: 'leave_organisation', organisation: 'assembly' });

    expect(left.error).toBeUndefined();
    expect(isMember(left.state.world.organisations, 'assembly')).toBe(false);
    expect(left.state.world.reputation).toBeCloseTo(before + WITHDRAWAL_REPUTATION, 4);

    /* And every member of the room takes it personally. */
    const members = findOrganisation('assembly').members;
    for (const key of members) {
      const was = state.world.nations.find((n) => n.key === key)!.relations;
      const now = left.state.world.nations.find((n) => n.key === key)!.relations;
      expect(now).toBeLessThan(was);
    }
  });

  it('stops the dues immediately', () => {
    const state = inOffice();
    const left = applyIntent(state, { type: 'leave_organisation', organisation: 'assembly' });
    expect(duesTotal(left.state.world.organisations)).toBeLessThan(
      duesTotal(state.world.organisations),
    );
  });
});

describe('the vote', () => {
  it('turns on relationships rather than on the merits', () => {
    /* A contested question: two postures want it, two do not. */
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'climate')!;
    const friendless = countTheRoom(template, withRelations(world(), -70), null);
    const middling = countTheRoom(template, withRelations(world(), 0), null);
    const befriended = countTheRoom(template, withRelations(world(), 80), null);

    /*
     * The same resolution, unchanged, three times. The only thing that
     * differs is four years of embassies, summits and agreements kept — and
     * it is the difference between losing six to three and carrying nine to
     * nothing. A government can be entirely right and lose.
     */
    expect(friendless.passed).toBe(false);
    expect(friendless.against).toBeGreaterThan(friendless.for);

    /* The instructive middle: a majority, and not enough of one. */
    expect(middling.for).toBeGreaterThan(middling.against);
    expect(middling.passed).toBe(false);

    expect(befriended.passed).toBe(true);
    expect(befriended.for).toBeGreaterThan(friendless.for);
  });

  it('carries the uncontroversial thing even for a friendless government', () => {
    /*
     * Relief, access and a corridor: four postures out of five are disposed
     * toward it and nobody is against it in principle. A model where a
     * government with no friends could not pass even this would be modelling
     * punishment rather than diplomacy.
     */
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'humanitarian')!;
    expect(countTheRoom(template, withRelations(world(), -70), null).passed).toBe(true);
  });

  it('treats a room that will not engage as a result in itself', () => {
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'climate')!;
    const outcome = countTheRoom(template, world(), null);
    expect(outcome.quorum).toBeGreaterThan(1);

    /* Abstentions are not votes — that is real practice — but indifference
       still defeats a resolution rather than waving it through. */
    const indifferent = { ...outcome, for: 1, against: 0, abstain: 11 };
    expect(describeOutcome({ ...indifferent, passed: false })).toContain('declined to have an opinion');
  });

  it('explains every vote in the country’s own terms', () => {
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'climate')!;
    const outcome = countTheRoom(template, world(), null);
    expect(outcome.votes.length).toBeGreaterThan(0);
    for (const vote of outcome.votes) {
      expect(vote.why.length).toBeGreaterThan(0);
    }
  });

  it('lets one permanent member stop what the room wants', () => {
    const council = findOrganisation('council');
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'peacekeeping')!;

    /* Everybody warm except one of the three who can stop it alone. */
    const hostileVeto: World = {
      ...withRelations(world(), 85),
      nations: withRelations(world(), 85).nations.map((n) =>
        n.key === council.vetoHolders[0] ? { ...n, relations: -95 } : n,
      ),
    };

    const outcome = countTheRoom(template, hostileVeto, null);
    expect(outcome.vetoedBy).toBe(council.vetoHolders[0]);
    expect(outcome.passed).toBe(false);
    /* The arithmetic was never the point. */
    expect(outcome.for).toBeGreaterThan(outcome.against);
    expect(describeOutcome(outcome)).toContain('veto');
  });

  it('asks an assembly for two thirds and a council for a majority', () => {
    const assembly = RESOLUTION_TEMPLATES.find((r) => r.organisation === 'assembly')!;
    const council = RESOLUTION_TEMPLATES.find((r) => r.organisation === 'council')!;
    expect(countTheRoom(assembly, world(), null).threshold).toBeCloseTo(2 / 3, 4);
    expect(countTheRoom(council, world(), null).threshold).toBeCloseTo(0.5, 4);
  });

  it('does not ask a state to condemn itself, or its bloc to do it', () => {
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'condemnation')!;
    const named = findOrganisation('assembly').members[0]!;
    const warm = withRelations(world(), 70);

    const itself = leanOf(named, template, warm, named);
    const anybody = leanOf(named, template, warm, null);
    expect(itself.lean).toBeLessThan(anybody.lean);
    expect(itself.why).toContain('about them');
  });

  it('is an estimate the foreign ministry can be wrong about', () => {
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'investigation')!;
    const w = withRelations(world(), 20);
    const drawn = Array.from({ length: 60 }, (_, i) =>
      voteOnResolution(template, w, null, new Rng(i + 1)).for,
    );
    expect(new Set(drawn).size).toBeGreaterThan(1);

    const count = countTheRoom(template, w, null);
    const mean = drawn.reduce((sum, x) => sum + x, 0) / drawn.length;
    expect(Math.abs(mean - count.for)).toBeLessThan(2);
  });

  it('is the same room twice for the same seed', () => {
    const template = RESOLUTION_TEMPLATES.find((r) => r.kind === 'aid')!;
    const a = voteOnResolution(template, world(), null, new Rng(7));
    const b = voteOnResolution(template, world(), null, new Rng(7));
    expect(a).toEqual(b);
  });
});

describe('putting one', () => {
  it('cannot be done in a room the country is not in', () => {
    const state = inOffice();
    expect(isMember(state.world.organisations, 'council')).toBe(false);
    const attempt = applyIntent(state, { type: 'propose_resolution', kind: 'peacekeeping' });
    expect(attempt.error).toContain('no seat');
  });

  it('will not let a condemnation name nobody', () => {
    const state = inOffice();
    const attempt = applyIntent(
      { ...state, politicalCapital: 100 },
      { type: 'propose_resolution', kind: 'condemnation' },
    );
    expect(attempt.error).toContain('press release');
  });

  it('keeps the bar the room set, so the record reads back without it', () => {
    const state = inOffice();
    const put = applyIntent(
      { ...state, politicalCapital: 100 },
      { type: 'propose_resolution', kind: 'humanitarian' },
    );
    const resolution = put.state.world.resolutions[0]!;
    expect(resolution.threshold).toBeGreaterThan(0);
    expect(resolution.quorum).toBeGreaterThan(0);
    expect(describeOutcome(resolution).length).toBeGreaterThan(0);
  });

  it('records how every government voted, so a loss can be read back', () => {
    const state = inOffice();
    const put = applyIntent(
      { ...state, politicalCapital: 100 },
      { type: 'propose_resolution', kind: 'humanitarian' },
    );
    expect(put.error).toBeUndefined();

    const resolution = put.state.world.resolutions[0]!;
    expect(resolution.votes.length).toBeGreaterThan(0);
    expect(resolution.for + resolution.against + resolution.abstain).toBe(
      resolution.votes.length,
    );
  });

  it('costs influence to put one and lose it', () => {
    const state = inOffice();
    const friendless: GameState = {
      ...state,
      politicalCapital: 100,
      world: withRelations(state.world, -80),
    };
    const put = applyIntent(friendless, { type: 'propose_resolution', kind: 'climate' });
    expect(put.error).toBeUndefined();

    const resolution = put.state.world.resolutions[0]!;
    if (resolution.passed) return;
    /* The room has formally declined, and anybody can cite that. */
    expect(put.state.world.influence).toBeCloseTo(
      friendless.world.influence + RESOLUTION_DEFEAT_INFLUENCE,
      4,
    );
  });

  it('is remembered by the state it names', () => {
    const state = inOffice();
    const warm: GameState = {
      ...state,
      politicalCapital: 100,
      world: withRelations(state.world, 85),
    };
    const target = findOrganisation('assembly').members[2]!;
    const put = applyIntent(warm, {
      type: 'propose_resolution',
      kind: 'condemnation',
      target,
    });
    expect(put.error).toBeUndefined();

    const resolution = put.state.world.resolutions[0]!;
    if (!resolution.passed) return;
    const was = warm.world.nations.find((n) => n.key === target)!.relations;
    const now = put.state.world.nations.find((n) => n.key === target)!.relations;
    expect(now).toBeLessThan(was);
  });
});
