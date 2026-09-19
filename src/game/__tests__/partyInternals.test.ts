import { describe, expect, it } from 'vitest';
import {
  authorityTarget,
  buildPartyInternals,
  cohesionTarget,
  driftAuthority,
  driftCohesion,
  driftMembers,
  facesLeadershipChallenge,
  factionSeats,
  leadershipChallengeSupport,
  membershipTarget,
  partyFinanceTick,
  rebellionRisks,
  resolveRebellions,
  surviveChallenge,
  type PartyInternals,
} from '../systems/partyInternals.ts';
import { FACTION_TEMPLATES, factionPosition } from '../content/factions.ts';
import { computePassChance } from '../systems/legislature.ts';
import { applyIntent } from '../turn.ts';
import { createStandardGame } from '../setup.ts';
import {
  AUTHORITY_CHALLENGE_THRESHOLD,
  AD_BUY_PARTY_COST,
  CHALLENGE_COOLDOWN_TURNS,
  MEMBERS_CEILING,
  MEMBERS_FLOOR,
  SECTOR_BASELINE_FUNDING,
  SECTOR_KEYS,
  CAMPAIGN_START_TURN,
} from '../balance.ts';
import { Rng } from '../rng.ts';
import { makeIdeology, normalisedDistance } from '../ideology.ts';
import type { Bill, GameState, Sector } from '../index.ts';

const leader = makeIdeology(-0.6, 0.4, 0.3);

const internals = (overrides: Partial<PartyInternals> = {}): PartyInternals => ({
  ...buildPartyInternals(leader),
  members: 180,
  funds: 40,
  cohesion: 68,
  authority: 70,
  ...overrides,
});

const sectors: Sector[] = SECTOR_KEYS.map((key) => ({
  key,
  health: 60,
  funding: SECTOR_BASELINE_FUNDING[key],
}));

const makeBill = (ideology = makeIdeology(0, 0, 0)): Bill => ({
  id: 'b',
  templateKey: 'b',
  title: 'Test Measure',
  summary: '',
  tradeoff: '',
  category: 'fiscal',
  magnitude: 'minor',
  ideology,
  effects: {},
  status: 'available',
  passChance: null,
  pcSpent: 0,
  whipSteps: 0,
  turnProposed: null,
  turnResolved: null,
  amendments: 0,
  committeeBonus: 0,
  committeeReturnsOn: null,
  crossbenchDeals: 0,
});

describe('factions', () => {
  it('gives every faction a share, and the shares sum to one', () => {
    const total = FACTION_TEMPLATES.reduce((sum, f) => sum + f.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('puts the membership wing further out than the leader, and modernisers closer in', () => {
    const base = FACTION_TEMPLATES.find((f) => f.id === 'base')!;
    const mods = FACTION_TEMPLATES.find((f) => f.id === 'modernisers')!;

    const centre = makeIdeology(0, 0, 0);
    const leaderDistance = normalisedDistance(leader, centre);
    const baseDistance = normalisedDistance(factionPosition(base, leader), centre);
    const modsDistance = normalisedDistance(factionPosition(mods, leader), centre);

    expect(baseDistance).toBeGreaterThan(leaderDistance);
    expect(modsDistance).toBeLessThan(leaderDistance);
  });

  it('generates factions relative to whatever platform was chosen', () => {
    const left = buildPartyInternals(makeIdeology(-0.8, 0, 0));
    const right = buildPartyInternals(makeIdeology(0.8, 0, 0));
    expect(left.factions[0]!.ideology.economic).toBeLessThan(0);
    expect(right.factions[0]!.ideology.economic).toBeGreaterThan(0);
  });

  it('splits the party’s seats between the factions', () => {
    const party = internals();
    const total = party.factions.reduce((sum, f) => sum + factionSeats(f, 100), 0);
    expect(total).toBeGreaterThan(95);
    expect(total).toBeLessThanOrEqual(105);
  });
});

describe('rebellion risk', () => {
  it('is nil for a bill close to every wing', () => {
    const risks = rebellionRisks(internals(), 80, leader, 0);
    for (const risk of risks) expect(risk.probability).toBe(0);
  });

  it('rises the further a bill sits from a wing', () => {
    const near = rebellionRisks(internals(), 80, leader, 0);
    const far = rebellionRisks(internals(), 80, makeIdeology(0.9, -0.9, -0.9), 0);
    const max = (rs: typeof near) => Math.max(...rs.map((r) => r.probability));
    expect(max(far)).toBeGreaterThan(max(near));
  });

  it('is suppressed by whipping', () => {
    const bill = makeIdeology(0.9, -0.9, -0.9);
    const unwhipped = rebellionRisks(internals(), 80, bill, 0);
    const whipped = rebellionRisks(internals(), 80, bill, 4);
    const total = (rs: typeof unwhipped) => rs.reduce((s, r) => s + r.probability, 0);
    expect(total(whipped)).toBeLessThan(total(unwhipped));
  });

  it('is worse under poor discipline and a weak leader', () => {
    const bill = makeIdeology(0.9, -0.9, -0.9);
    const strong = rebellionRisks(internals({ cohesion: 95, authority: 95 }), 80, bill, 0);
    const weak = rebellionRisks(internals({ cohesion: 10, authority: 10 }), 80, bill, 0);
    const total = (rs: typeof strong) => rs.reduce((s, r) => s + r.probability, 0);
    expect(total(weak)).toBeGreaterThan(total(strong));
  });

  it('never exceeds 90%, so no bill is automatically doomed', () => {
    const risks = rebellionRisks(
      internals({ cohesion: 0, authority: 0 }),
      80,
      makeIdeology(1, -1, -1),
      0,
    );
    for (const risk of risks) expect(risk.probability).toBeLessThanOrEqual(0.9);
  });

  it('is deterministic when resolved from the same seed', () => {
    const risks = rebellionRisks(internals({ cohesion: 30 }), 80, makeIdeology(0.9, -0.9, 0), 0);
    const a = resolveRebellions(new Rng(5), risks);
    const b = resolveRebellions(new Rng(5), risks);
    expect(a.seatsLost).toBe(b.seatsLost);
    expect(a.rebelled.map((r) => r.factionId)).toEqual(b.rebelled.map((r) => r.factionId));
  });

  it('charges discipline for every wing that walks', () => {
    const risks = rebellionRisks(internals({ cohesion: 0, authority: 0 }), 80, makeIdeology(1, -1, -1), 0);
    const outcome = resolveRebellions(new Rng(3), risks);
    if (outcome.rebelled.length > 0) expect(outcome.cohesionCost).toBeLessThan(0);
  });
});

describe('your own benches can beat you', () => {
  const parties = [
    {
      id: 'player',
      name: 'You',
      shortName: 'You',
      color: '#000',
      glyph: '★',
      isPlayer: true,
      inCoalition: true,
      ideology: leader,
      seats: 130,
      coalitionMood: null,
      redLines: [],
      baseStrength: 1,
      cabinetPosts: 0,
      cabinetDemand: 0,
      leaderTitle: 'Leader',
    },
    {
      id: 'opp',
      name: 'Opposition',
      shortName: 'Opp',
      color: '#111',
      glyph: '●',
      isPlayer: false,
      inCoalition: false,
      ideology: makeIdeology(0.6, -0.3, -0.2),
      seats: 50,
      coalitionMood: null,
      redLines: [],
      baseStrength: 1,
      cabinetPosts: 0,
      cabinetDemand: 0,
      leaderTitle: 'Leader',
    },
  ];

  it('lowers pass chance for a bill the party hates, despite a large majority', () => {
    const loyal = computePassChance(makeBill(leader), parties, sectors, 0, internals());
    const hated = computePassChance(
      makeBill(makeIdeology(0.9, -0.9, -0.9)),
      parties,
      sectors,
      0,
      internals({ cohesion: 25, authority: 25 }),
    );
    expect(hated.chance).toBeLessThan(loyal.chance);
    expect(hated.expectedRebelSeats).toBeGreaterThan(0);
  });

  it('reports the risk per wing before the player commits', () => {
    const breakdown = computePassChance(
      makeBill(makeIdeology(0.9, -0.9, -0.9)),
      parties,
      sectors,
      0,
      internals({ cohesion: 20 }),
    );
    expect(breakdown.rebellionRisks.length).toBe(FACTION_TEMPLATES.length);
    for (const risk of breakdown.rebellionRisks) {
      expect(risk.factionName.length).toBeGreaterThan(0);
      expect(risk.seats).toBeGreaterThan(0);
    }
  });

  it('behaves exactly as before when no party internals are supplied', () => {
    const without = computePassChance(makeBill(leader), parties, sectors, 0);
    expect(without.expectedRebelSeats).toBe(0);
    expect(without.rebellionRisks).toHaveLength(0);
  });
});

describe('party finances', () => {
  it('collects subscriptions in proportion to membership', () => {
    const small = partyFinanceTick(internals({ members: 50 }), 50);
    const large = partyFinanceTick(internals({ members: 300 }), 50);
    expect(large.subscriptions).toBeGreaterThan(small.subscriptions);
  });

  it('attracts more donations when the party is doing well', () => {
    expect(partyFinanceTick(internals(), 90).donations).toBeGreaterThan(
      partyFinanceTick(internals(), 10).donations,
    );
  });

  it('charges overheads that rise with the size of the machine', () => {
    expect(partyFinanceTick(internals({ headquarters: 3 }), 50).overheads).toBeGreaterThan(
      partyFinanceTick(internals({ headquarters: 0 }), 50).overheads,
    );
  });

  it('can run a deficit when membership collapses', () => {
    expect(partyFinanceTick(internals({ members: 5 }), 5).net).toBeLessThan(0);
  });
});

describe('membership, discipline and authority', () => {
  it('targets more members when the party is popular and united', () => {
    expect(membershipTarget(90, 90)).toBeGreaterThan(membershipTarget(10, 10));
  });

  it('keeps the membership target inside its band', () => {
    expect(membershipTarget(0, 0)).toBeGreaterThanOrEqual(MEMBERS_FLOOR);
    expect(membershipTarget(100, 100)).toBeLessThanOrEqual(MEMBERS_CEILING);
  });

  it('drifts membership toward the target without overshooting', () => {
    expect(driftMembers(100, 200)).toBeGreaterThan(100);
    expect(driftMembers(100, 200)).toBeLessThan(200);
  });

  it('raises the discipline target with the leader’s authority', () => {
    expect(cohesionTarget(internals({ authority: 95 }))).toBeGreaterThan(
      cohesionTarget(internals({ authority: 5 })),
    );
  });

  it('erodes authority with each rebellion, compounding', () => {
    expect(authorityTarget(60, 0, 0)).toBeGreaterThan(authorityTarget(60, 3, 0));
    expect(authorityTarget(60, 3, 0)).toBeGreaterThan(authorityTarget(60, 6, 0));
  });

  it('rewards authority for winning seats and punishes losing them', () => {
    expect(authorityTarget(50, 0, 20)).toBeGreaterThan(authorityTarget(50, 0, -20));
  });

  it('keeps every drifted value inside 0..100', () => {
    expect(driftCohesion(0, -500)).toBeGreaterThanOrEqual(0);
    expect(driftAuthority(100, 500)).toBeLessThanOrEqual(100);
  });
});

describe('leadership challenges', () => {
  it('fires only below the threshold', () => {
    expect(facesLeadershipChallenge(internals({ authority: AUTHORITY_CHALLENGE_THRESHOLD + 1 }))).toBe(false);
    expect(facesLeadershipChallenge(internals({ authority: AUTHORITY_CHALLENGE_THRESHOLD - 1 }))).toBe(true);
  });

  it('counts support from the factions weighted by their seats', () => {
    const loyalParty = internals();
    loyalParty.factions = loyalParty.factions.map((f) => ({ ...f, loyalty: 95 }));
    const mutinous = internals();
    mutinous.factions = mutinous.factions.map((f) => ({ ...f, loyalty: 5 }));

    expect(leadershipChallengeSupport(loyalParty)).toBeGreaterThan(
      leadershipChallengeSupport(mutinous),
    );
  });

  it('counts the deputy’s wing as backing the leader — that is what the job is for', () => {
    const without = internals({ deputyFactionId: null });
    const with_ = internals({ deputyFactionId: 'base' });
    expect(leadershipChallengeSupport(with_)).toBeGreaterThan(leadershipChallengeSupport(without));
  });

  it('restores authority and clears the slate on survival', () => {
    const survived = surviveChallenge(internals({ authority: 10, rebellionsThisTerm: 4 }));
    expect(survived.authority).toBeGreaterThan(10);
    expect(survived.rebellionsThisTerm).toBe(0);
    expect(survived.factions.every((f) => !f.rebelling)).toBe(true);
  });
});

describe('the party pays for its own campaigning', () => {
  /**
   * A governing party billing the national treasury for its election
   * advertising would be a scandal, not a strategy. This is the regression
   * guard for that.
   */
  function campaigning(): GameState {
    const base = createStandardGame('party-funds');
    return {
      ...base,
      phase: 'agenda',
      negotiation: null,
      /* Inside the eight-week campaign, which now starts at week 201. */
      turnNumber: CAMPAIGN_START_TURN,
      politicalCapital: 100,
      campaign: {
      stopsMade: 0,
      adBuys: 0,
      debates: [],
      debateSwing: 0,
      reach: {},
      channelPushes: {},
      volunteerPushesUsed: 0,
      polls: [],
      rallies: 0,
      townHalls: 0,
    },
    };
  }

  it('takes advertising out of party funds and leaves the treasury alone', () => {
    const before = campaigning();
    const after = applyIntent(before, { type: 'ad_buy', regionId: 'halloway' }).state;

    expect(after.treasury).toBe(before.treasury);
    expect(after.partyInternals.funds).toBeCloseTo(before.partyInternals.funds - AD_BUY_PARTY_COST, 6);
  });

  it('refuses to advertise when the party is broke', () => {
    const broke: GameState = {
      ...campaigning(),
      partyInternals: { ...campaigning().partyInternals, funds: 1 },
    };
    const result = applyIntent(broke, { type: 'ad_buy', regionId: 'halloway' });
    expect(result.error).toMatch(/party has only/i);
  });

  it('raises money without touching the treasury', () => {
    const before = campaigning();
    const after = applyIntent(before, { type: 'fundraising_drive' }).state;
    expect(after.partyInternals.funds).toBeGreaterThan(before.partyInternals.funds);
    expect(after.treasury).toBe(before.treasury);
  });
});

describe('a challenge is a risk, not a guillotine', () => {
  /**
   * Regression guard. Tying authority tightly to approval, with no cooldown,
   * made every leader below about a third removable within a year: a stress
   * run of 42 games ended 42 collapses. Parties are far stickier than that.
   */
  it('restores enough authority on survival that the leader is not instantly challengeable', () => {
    const beaten = surviveChallenge(internals({ authority: 5 }), 10);
    expect(beaten.authority).toBeGreaterThanOrEqual(AUTHORITY_CHALLENGE_THRESHOLD);
    expect(facesLeadershipChallenge(beaten, 11)).toBe(false);
  });

  it('does not re-mount a challenge every single turn once authority falls again', () => {
    /* Authority back in the danger zone, but the plotters need time to regroup. */
    const sliding: PartyInternals = { ...surviveChallenge(internals(), 10), authority: 5 };

    expect(facesLeadershipChallenge(sliding, 11)).toBe(false);
    expect(facesLeadershipChallenge(sliding, 13)).toBe(false);
    expect(facesLeadershipChallenge(sliding, 10 + CHALLENGE_COOLDOWN_TURNS)).toBe(true);
  });

  it('keeps an ordinarily unpopular leader above the challenge threshold', () => {
    /* 35% approval is a bad patch, not a removal offence. */
    expect(authorityTarget(35, 0, 0)).toBeGreaterThan(AUTHORITY_CHALLENGE_THRESHOLD);
  });

  it('backs the incumbent by default when the party is not actively mutinous', () => {
    const ordinary = internals({ authority: 20 });
    expect(leadershipChallengeSupport(ordinary)).toBeGreaterThanOrEqual(50);
  });

  it('still removes a leader whose party has genuinely turned on them', () => {
    const mutinous = internals({ authority: 5 });
    mutinous.factions = mutinous.factions.map((f) => ({ ...f, loyalty: 8 }));
    expect(leadershipChallengeSupport(mutinous)).toBeLessThan(50);
  });
});
