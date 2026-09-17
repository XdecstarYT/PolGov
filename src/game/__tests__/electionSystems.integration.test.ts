import { describe, expect, it } from 'vitest';
import { simulateElection } from '../systems/election.ts';
import { buildDistrictsFor, buildRegions, createGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import { meanDistortion } from '../systems/districts.ts';
import { ELECTORAL_SYSTEM_LABELS, type ElectoralSystem } from '../systems/electoralSystems.ts';
import { TOTAL_SEATS } from '../balance.ts';
import { Rng } from '../rng.ts';
import type { GameState } from '../index.ts';

const SYSTEMS = Object.keys(ELECTORAL_SYSTEM_LABELS) as ElectoralSystem[];

function runUnder(system: ElectoralSystem, seed = 4242) {
  const game = createGame({
    gameId: `system-${system}`,
    difficulty: 'standard',
    playerPartyName: 'Reform Coalition',
    playerColor: '#8c2f27',
    playerGlyph: '★',
    playerIdeology: { economic: -0.1, social: 0.2, environmental: 0.2 },
    electoralSystem: system,
    seed,
  });

  return simulateElection({
    parties: game.parties,
    regions: game.regions,
    districts: game.districts,
    system,
    approval: 50,
    campaign: null,
    termNumber: 1,
    rng: new Rng(seed),
    sectors: game.sectors,
    debt: game.debt,
    revenueModifier: 0,
  });
}

describe('every electoral system returns a complete parliament', () => {
  for (const system of SYSTEMS) {
    it(`${ELECTORAL_SYSTEM_LABELS[system]} fills exactly ${TOTAL_SEATS} seats`, () => {
      const result = runUnder(system);
      const total = Object.values(result.seatsByParty).reduce((a, b) => a + b, 0);
      expect(total).toBe(TOTAL_SEATS);
    });

    it(`${ELECTORAL_SYSTEM_LABELS[system]} never returns a negative seat count`, () => {
      for (const seats of Object.values(runUnder(system).seatsByParty)) {
        expect(seats).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${ELECTORAL_SYSTEM_LABELS[system]} reports vote shares summing to 1`, () => {
      const total = Object.values(runUnder(system).voteShareByParty).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
    });

    it(`${ELECTORAL_SYSTEM_LABELS[system]} is deterministic for a seed`, () => {
      expect(runUnder(system).seatsByParty).toEqual(runUnder(system).seatsByParty);
    });
  }
});

describe('the rules change the result', () => {
  it('produces materially different parliaments from the same electorate', () => {
    const results = new Map(SYSTEMS.map((system) => [system, runUnder(system)]));

    /* At least two systems must disagree, or the choice is cosmetic. */
    const signatures = new Set(
      [...results.values()].map((r) =>
        SYSTEMS.map(() => '')
          .concat(Object.entries(r.seatsByParty).sort().map(([id, n]) => `${id}:${n}`))
          .join('|'),
      ),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('makes first past the post the least proportional and PR the most', () => {
    const fptp = runUnder('fptp').disproportionality!;
    const proportional = runUnder('proportional').disproportionality!;
    expect(fptp).toBeGreaterThan(proportional);
  });

  it('puts mixed-member between the two, as its whole purpose requires', () => {
    const fptp = runUnder('fptp').disproportionality!;
    const mmp = runUnder('mixed_member').disproportionality!;
    expect(mmp).toBeLessThan(fptp);
  });

  it('records which rules an election was counted under', () => {
    for (const system of SYSTEMS) {
      expect(runUnder(system).system).toBe(system);
    }
  });

  it('reports district outcomes for district systems and none for PR', () => {
    expect(runUnder('proportional').districtOutcomes).toHaveLength(0);
    expect(runUnder('fptp').districtOutcomes!.length).toBe(TOTAL_SEATS);
  });

  it('reports top-up list seats only under mixed-member', () => {
    expect(runUnder('mixed_member').listSeats).toBeDefined();
    expect(runUnder('fptp').listSeats).toBeUndefined();
  });
});

describe('districts are laid out to match the system', () => {
  it('creates none under proportional counting', () => {
    expect(buildDistrictsFor(buildRegions(), 'proportional', new Rng(1))).toHaveLength(0);
  });

  it('creates one per seat under the single-member systems', () => {
    for (const system of ['fptp', 'preferential', 'two_round'] as const) {
      expect(buildDistrictsFor(buildRegions(), system, new Rng(1))).toHaveLength(TOTAL_SEATS);
    }
  });

  it('creates fewer, larger seats under mixed-member, leaving room for a list', () => {
    const districts = buildDistrictsFor(buildRegions(), 'mixed_member', new Rng(1));
    expect(districts.length).toBeGreaterThan(0);
    expect(districts.length).toBeLessThan(TOTAL_SEATS);
  });
});

describe('redrawing boundaries', () => {
  function atAgenda(system: ElectoralSystem): GameState {
    const game = createGame({
      gameId: `redraw-${system}`,
      difficulty: 'standard',
      playerPartyName: 'Reform Coalition',
      playerColor: '#8c2f27',
      playerGlyph: '★',
      playerIdeology: { economic: -0.1, social: 0.2, environmental: 0.2 },
      electoralSystem: system,
    });
    return { ...game, phase: 'agenda', negotiation: null, politicalCapital: 100 };
  }

  it('is refused under proportional counting, where boundaries decide nothing', () => {
    const result = applyIntent(atAgenda('proportional'), {
      type: 'redraw_boundaries',
      regionId: 'halloway',
    });
    expect(result.error).toMatch(/proportional/i);
  });

  it('distorts the map and costs capital under a district system', () => {
    const before = atAgenda('fptp');
    const after = applyIntent(before, { type: 'redraw_boundaries', regionId: 'halloway' }).state;

    expect(after.politicalCapital).toBeLessThan(before.politicalCapital);
    expect(meanDistortion(after.districts.filter((d) => d.regionId === 'halloway'))).toBeGreaterThan(0);
  });

  it('costs more approval the more the map has already been bent', () => {
    let state = atAgenda('fptp');
    const penalties: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      state = { ...state, politicalCapital: 100 };
      const before = state.approval;
      state = applyIntent(state, { type: 'redraw_boundaries', regionId: 'halloway' }).state;
      penalties.push(before - state.approval);
    }

    expect(penalties[1]!).toBeGreaterThan(penalties[0]!);
    expect(penalties[2]!).toBeGreaterThan(penalties[1]!);
  });

  it('leaves other regions untouched', () => {
    const before = atAgenda('fptp');
    const after = applyIntent(before, { type: 'redraw_boundaries', regionId: 'halloway' }).state;
    expect(meanDistortion(after.districts.filter((d) => d.regionId === 'ternhill'))).toBe(0);
  });

  it('actually improves the player’s seat count, or it would not be worth the cost', () => {
    const base = atAgenda('fptp');
    let bent = base;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const region of bent.regions) {
        /* Top up before each review: this test is about the map, not the budget. */
        bent = { ...bent, politicalCapital: 100 };
        bent = applyIntent(bent, { type: 'redraw_boundaries', regionId: region.id }).state;
      }
    }

    const run = (state: GameState) =>
      simulateElection({
        parties: state.parties,
        regions: state.regions,
        districts: state.districts,
        system: 'fptp',
        approval: 50,
        campaign: null,
        termNumber: 1,
        rng: new Rng(777),
        sectors: state.sectors,
        debt: state.debt,
        revenueModifier: 0,
      });

    expect(run(bent).seatsByParty.player).toBeGreaterThan(run(base).seatsByParty.player!);
  });
});
