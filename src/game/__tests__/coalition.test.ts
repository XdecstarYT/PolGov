import { describe, expect, it } from 'vitest';
import {
  applyCounterOffer,
  blocLacksMajority,
  budgetPromiseKept,
  buildNegotiation,
  clampMood,
  computeMoodTarget,
  driftMood,
  hasMajority,
  isThreateningExit,
  noConfidenceTriggered,
  partnersWalkingOut,
} from '../systems/coalition.ts';
import { MAJORITY_SEATS, MOOD_THREATEN_EXIT, SECTOR_BASELINE_FUNDING, SECTOR_KEYS } from '../balance.ts';
import { makeIdeology } from '../ideology.ts';
import { createStandardGame } from '../setup.ts';
import type { Party, RedLine, Sector } from '../types.ts';

const sectors: Sector[] = SECTOR_KEYS.map((key) => ({
  key,
  health: 60,
  funding: SECTOR_BASELINE_FUNDING[key],
}));

const makeParty = (overrides: Partial<Party> = {}): Party => ({
  id: 'p',
  name: 'Party',
  shortName: 'P',
  color: '#000',
  glyph: '●',
  isPlayer: false,
  inCoalition: false,
  ideology: makeIdeology(0, 0, 0),
  seats: 0,
  coalitionMood: null,
  redLines: [],
  baseStrength: 1,
  cabinetPosts: 0,
  cabinetDemand: 0,
  leaderTitle: 'Leader',
  ...overrides,
});

const healthFloor: RedLine = {
  id: 'floor',
  kind: 'sector_floor',
  sector: 'health',
  threshold: 28,
  description: 'Health stays at or above ₡28bn.',
};

describe('majority arithmetic', () => {
  it('counts the player plus coalition partners only', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 60 }),
      makeParty({ id: 'ally', inCoalition: true, seats: 40 }),
      makeParty({ id: 'opp', seats: 80 }),
    ];
    expect(hasMajority(parties)).toBe(100 >= MAJORITY_SEATS);
    expect(blocLacksMajority(parties)).toBe(!hasMajority(parties));
  });

  it('does not count an opposition party’s seats', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 50 }),
      makeParty({ id: 'opp', seats: 130 }),
    ];
    expect(hasMajority(parties)).toBe(false);
  });
});

describe('mood target', () => {
  const player = makeParty({ id: 'player', isPlayer: true, ideology: makeIdeology(0, 0, 0) });

  it('rises with ideological closeness', () => {
    const close = computeMoodTarget(
      makeParty({ inCoalition: true, ideology: makeIdeology(0.1, 0, 0), redLines: [healthFloor] }),
      player,
      50,
      sectors,
      'standard',
    ).target;
    const distant = computeMoodTarget(
      makeParty({ inCoalition: true, ideology: makeIdeology(-0.9, 0.9, -0.9), redLines: [healthFloor] }),
      player,
      50,
      sectors,
      'standard',
    ).target;
    expect(close).toBeGreaterThan(distant);
  });

  it('punishes failure harder than it rewards success', () => {
    const partner = makeParty({ inCoalition: true, redLines: [healthFloor] });
    const neutral = computeMoodTarget(partner, player, 50, sectors, 'standard').target;
    const good = computeMoodTarget(partner, player, 70, sectors, 'standard').target;
    const bad = computeMoodTarget(partner, player, 30, sectors, 'standard').target;
    expect(good - neutral).toBeLessThan(neutral - bad);
  });

  it('drops sharply when a budget promise is broken', () => {
    const partner = makeParty({ inCoalition: true, redLines: [healthFloor] });
    const starved = sectors.map((s) => (s.key === 'health' ? { ...s, funding: 10 } : s));
    const kept = computeMoodTarget(partner, player, 50, sectors, 'standard').target;
    const broken = computeMoodTarget(partner, player, 50, starved, 'standard').target;
    expect(broken).toBeLessThan(kept);
  });

  it('drops when the partner holds fewer cabinet posts than it demanded', () => {
    const honoured = computeMoodTarget(
      makeParty({ inCoalition: true, cabinetDemand: 3, cabinetPosts: 3 }),
      player,
      50,
      sectors,
      'standard',
    ).target;
    const short = computeMoodTarget(
      makeParty({ inCoalition: true, cabinetDemand: 3, cabinetPosts: 1 }),
      player,
      50,
      sectors,
      'standard',
    ).target;
    expect(short).toBeLessThan(honoured);
  });

  it('amplifies swings on higher volatility difficulties', () => {
    const partner = makeParty({ inCoalition: true, redLines: [healthFloor] });
    const starved = sectors.map((s) => (s.key === 'health' ? { ...s, funding: 5 } : s));
    const stable = computeMoodTarget(partner, player, 25, starved, 'stable').target;
    const fractured = computeMoodTarget(partner, player, 25, starved, 'fractured').target;
    expect(fractured).toBeLessThan(stable);
  });

  it('stays inside 0..100', () => {
    const partner = makeParty({ inCoalition: true, cabinetDemand: 40, redLines: [healthFloor] });
    const starved = sectors.map((s) => ({ ...s, funding: 0 }));
    const result = computeMoodTarget(partner, partner, 0, starved, 'fractured');
    expect(result.target).toBeGreaterThanOrEqual(0);
    expect(result.target).toBeLessThanOrEqual(100);
  });
});

describe('mood drift and exit', () => {
  it('converges on the target', () => {
    let mood = 60;
    /* Four hundred weeks — nearly eight years of the same treatment. Mood
       eases at the same real-time speed it always did, which now takes more
       turns to get there. */
    for (let i = 0; i < 400; i += 1) mood = driftMood(mood, 20);
    expect(mood).toBeCloseTo(20, 4);
  });

  it('clamps to 0..100', () => {
    expect(clampMood(-30)).toBe(0);
    expect(clampMood(160)).toBe(100);
  });

  it('flags a partner below the exit threshold as threatening to leave', () => {
    expect(
      isThreateningExit(makeParty({ inCoalition: true, coalitionMood: MOOD_THREATEN_EXIT - 1 })),
    ).toBe(true);
    expect(
      isThreateningExit(makeParty({ inCoalition: true, coalitionMood: MOOD_THREATEN_EXIT + 1 })),
    ).toBe(false);
  });

  it('walks out only at zero', () => {
    const parties = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 50 }),
      makeParty({ id: 'angry', inCoalition: true, seats: 30, coalitionMood: 0 }),
      makeParty({ id: 'sour', inCoalition: true, seats: 20, coalitionMood: 5 }),
    ];
    const out = partnersWalkingOut(parties);
    expect(out.map((p) => p.id)).toEqual(['angry']);
  });
});

describe('confidence crisis', () => {
  it('fires only when a walkout actually costs the majority', () => {
    const stillMajority = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 120 }),
    ];
    const lostMajority = [
      makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 50 }),
    ];
    const walked = [makeParty({ id: 'gone', seats: 45 })];

    expect(noConfidenceTriggered(stillMajority, walked)).toBe(false);
    expect(noConfidenceTriggered(lostMajority, walked)).toBe(true);
  });

  it('does not fire for a deliberately-assembled minority government', () => {
    const minority = [makeParty({ id: 'player', isPlayer: true, inCoalition: true, seats: 50 })];
    expect(noConfidenceTriggered(minority, [])).toBe(false);
  });
});

describe('budget promises', () => {
  it('reports null when a partner has no funding floor', () => {
    expect(budgetPromiseKept(makeParty({ inCoalition: true }), sectors)).toBeNull();
  });

  it('reports kept and broken correctly', () => {
    const partner = makeParty({ inCoalition: true, redLines: [healthFloor] });
    expect(budgetPromiseKept(partner, sectors)).toBe(true);
    const starved = sectors.map((s) => (s.key === 'health' ? { ...s, funding: 12 } : s));
    expect(budgetPromiseKept(partner, starved)).toBe(false);
  });
});

describe('negotiation', () => {
  it('ranks candidates by ideological distance from the player', () => {
    const state = createStandardGame('negotiation-test');
    const negotiation = buildNegotiation(state.parties, 1);
    expect(negotiation.candidates.length).toBeGreaterThan(0);
    const player = state.parties.find((p) => p.isPlayer)!;
    const distances = negotiation.candidates.map((c) => {
      const party = state.parties.find((p) => p.id === c.partyId)!;
      return (
        (party.ideology.economic - player.ideology.economic) ** 2 +
        (party.ideology.social - player.ideology.social) ** 2 +
        (party.ideology.environmental - player.ideology.environmental) ** 2
      );
    });
    expect([...distances]).toEqual([...distances].sort((a, b) => a - b));
  });

  it('gives every candidate a cabinet demand, a funding floor, and red lines', () => {
    const state = createStandardGame('negotiation-demands');
    for (const candidate of buildNegotiation(state.parties, 1).candidates) {
      expect(candidate.cabinetPosts).toBeGreaterThan(0);
      expect(candidate.sectorFloor.amount).toBeGreaterThan(0);
      expect(candidate.redLines.length).toBeGreaterThan(0);
      expect(candidate.redLines.length).toBeLessThanOrEqual(2);
    }
  });

  it('softens demands on a counter-offer, with diminishing relief', () => {
    const state = createStandardGame('counter-offer');
    const original = buildNegotiation(state.parties, 1).candidates[0]!;
    const once = applyCounterOffer(original);
    const twice = applyCounterOffer(once);

    expect(once.concessionsWon).toBeGreaterThan(0);
    expect(twice.concessionsWon).toBeGreaterThan(once.concessionsWon);
    expect(twice.sectorFloor.amount).toBeLessThanOrEqual(once.sectorFloor.amount);
    expect(once.sectorFloor.amount).toBeLessThanOrEqual(original.sectorFloor.amount);
  });

  it('never negotiates away a red line', () => {
    const state = createStandardGame('red-lines-fixed');
    const original = buildNegotiation(state.parties, 1).candidates[0]!;
    let demand = original;
    for (let i = 0; i < 6; i += 1) demand = applyCounterOffer(demand);
    expect(demand.redLines).toEqual(original.redLines);
  });
});
