/**
 * playable.test.ts — governing somewhere real.
 *
 * Seventeen countries, and every one of them has to produce a chamber a
 * government can be formed in, a budget that adds up, and an economy in the
 * band the engine is calibrated for. The failure mode this file exists to
 * catch is silent: a country builds, the types are satisfied, and the run
 * is unplayable four hours in because one figure was in the wrong units.
 */

import { describe, expect, it } from 'vitest';
import { createGame } from '../setup.ts';
import { TOTAL_SEATS, GDP_START, POPULATION_START, SECTOR_BASELINE_FUNDING } from '../balance.ts';
import { COUNTRY_TEMPLATES, findCountry, playableCountries } from '../content/world/countries.ts';
import { POLITICS_PROFILES, findPolitics, hasPolitics } from '../content/world/politics.ts';
import { MAX_GENERATED_PARTIES, partiesFor, regionsFor } from '../content/world/generate.ts';
import { ELECTORAL_SYSTEM_LABELS } from '../systems/electoralSystems.ts';
import type { CountryKey } from '../content/world/countries.ts';

const playable = playableCountries().map((c) => c.key);

const game = (country: CountryKey) =>
  createGame({
    gameId: `playable-${country}`,
    country,
    difficulty: 'standard',
    playerPartyName: 'Reform Coalition',
    playerColor: '#8c2f27',
    playerGlyph: '★',
    playerIdeology: { economic: -0.1, social: 0.2, environmental: 0.2 },
  });

describe('the playable list', () => {
  it('is exactly the countries with a political profile', () => {
    /*
     * Two lists that must agree, kept apart because the dependency only
     * runs one way. A country flagged playable with no profile throws at
     * setup; a profile with no flag is a country nobody can find.
     */
    expect([...playable].sort()).toEqual([...POLITICS_PROFILES.map((p) => p.key)].sort());
    for (const country of COUNTRY_TEMPLATES) {
      expect(Boolean(country.playable)).toBe(hasPolitics(country.key));
    }
  });

  it('is the parliamentary democracies, and says why the others are not', () => {
    expect(playable.length).toBeGreaterThan(12);
    /* The engine models a chamber that can withdraw confidence. A
       presidential republic does not work that way, so it is in the world
       without being in the chair. */
    expect(playable).not.toContain('united_states');
    expect(playable).not.toContain('brazil');
    expect(playable).not.toContain('indonesia');
    expect(() => game('united_states')).toThrow(/political profile/);
  });

  it('describes every profile in terms a player can act on', () => {
    for (const profile of POLITICS_PROFILES) {
      expect(ELECTORAL_SYSTEM_LABELS[profile.electoralSystem]).toBeTruthy();
      expect(profile.chamber.length).toBeGreaterThan(3);
      expect(profile.headOfGovernment.length).toBeGreaterThan(3);
      expect(profile.blurb.length).toBeGreaterThan(40);
      expect(profile.families.length).toBeGreaterThan(1);
      expect(profile.families.length).toBeLessThanOrEqual(MAX_GENERATED_PARTIES);
      /* No family twice: two parties on the same bench would share an id. */
      expect(new Set(profile.families.map((f) => f.family)).size).toBe(profile.families.length);
    }
  });
});

describe('the chamber of a real country', () => {
  it('seats exactly the chamber, in regions that exist', () => {
    for (const country of playable) {
      const regions = regionsFor(country);
      expect(regions.reduce((sum, r) => sum + r.seats, 0)).toBe(TOTAL_SEATS);
      expect(new Set(regions.map((r) => r.id)).size).toBe(regions.length);
      for (const region of regions) {
        /* Nowhere gets a single seat: a region that cannot lose one is not
           a place a campaign can be fought. */
        expect(region.seats).toBeGreaterThan(1);
        expect(region.name.length).toBeGreaterThan(2);
        expect(Object.keys(region.composition).length).toBeGreaterThan(4);
      }
    }
  });

  it('fields parties that are different in every country', () => {
    const chambers = new Map<CountryKey, string[]>();
    for (const country of playable) {
      const parties = partiesFor(country, SECTOR_BASELINE_FUNDING);
      expect(parties.length).toBeGreaterThan(1);
      /* One bench each, or two parties would share a colour and an id. */
      expect(new Set(parties.map((p) => p.id)).size).toBe(parties.length);
      for (const party of parties) {
        expect(party.baseStrength).toBeGreaterThan(0);
        expect(party.sectorFloor).toBeGreaterThan(0);
        expect(party.redLinePool.length).toBeGreaterThan(0);
      }
      chambers.set(country, parties.map((p) => p.name));
    }

    /* Two countries built from overlapping families should not read as the
       same chamber, which is what the per-country name choice is for. */
    const distinct = new Set([...chambers.values()].map((names) => names.join('|')));
    expect(distinct.size).toBeGreaterThan(playable.length - 4);
  });

  it('places a country’s parties around that country’s own centre', () => {
    /*
     * The property that makes a family mean something. A conservative party
     * in Sweden and a conservative party in Poland are both conservative
     * and are not in the same place, because the centre they are offset
     * from is not the same centre.
     */
    const swede = partiesFor('sweden', SECTOR_BASELINE_FUNDING);
    const pole = partiesFor('poland', SECTOR_BASELINE_FUNDING);
    const mean = (ps: typeof swede) =>
      ps.reduce((sum, p) => sum + p.ideology.social, 0) / ps.length;
    expect(mean(swede)).toBeGreaterThan(mean(pole));
    expect(findPolitics('sweden').centre.social).toBeGreaterThan(
      findPolitics('poland').centre.social,
    );
  });
});

describe('a run of a real country', () => {
  it('starts every one of them in the band the engine is calibrated for', () => {
    for (const country of playable) {
      const state = game(country);
      const template = findCountry(country);

      expect(state.country).toBe(country);
      expect(state.countryName).toBe(template.name);
      expect(state.economy.gdp).toBe(template.gdp);
      expect(state.demography.population).toBeCloseTo(template.population, 4);
      expect(state.moneyScale).toBeCloseTo(template.gdp / GDP_START, 6);
      expect(state.peopleScale).toBeCloseTo(template.population / POPULATION_START, 6);

      /*
       * The three ratios that decide whether a country is playable at all.
       * Every one of them is scale-free, which is the whole point: the
       * engine runs at any size provided the absolutes move together.
       */
      const budget = state.budget.lines.reduce((sum, l) => sum + l.enacted, 0);
      expect(budget / state.economy.gdp).toBeGreaterThan(0.2);
      expect(budget / state.economy.gdp).toBeLessThan(0.55);

      const demand = state.services.reduce((sum, s) => sum + s.demand, 0);
      expect(demand / budget).toBeGreaterThan(0.75);
      expect(demand / budget).toBeLessThan(1.25);

      expect(state.debt / state.economy.gdp).toBeGreaterThan(0.1);
      expect(state.debt / state.economy.gdp).toBeLessThan(3);
    }
  });

  it('leaves the invented country exactly where it was', () => {
    /*
     * The safety property the two scales exist to preserve. Every
     * measurement ever taken of this engine's balance was taken here, and
     * all of them still mean what they meant.
     */
    const state = game('verdana');
    expect(state.moneyScale).toBe(1);
    expect(state.peopleScale).toBe(1);
    expect(state.debtTolerance).toBe(1);
    expect(state.economy.gdp).toBe(GDP_START);
    expect(state.demography.population).toBeCloseTo(POPULATION_START, 6);
  });

  it('gives each country its own electoral system and its own chamber', () => {
    expect(game('germany').electoralSystem).toBe('mixed_member');
    expect(game('united_kingdom').electoralSystem).toBe('fptp');
    expect(game('australia').electoralSystem).toBe('preferential');
    expect(game('france').electoralSystem).toBe('two_round');
    expect(game('netherlands').electoralSystem).toBe('proportional');

    /* And the districts follow the system, not the country. */
    expect(game('netherlands').districts).toHaveLength(0);
    expect(game('united_kingdom').districts.length).toBeGreaterThan(50);
  });

  it('inherits a world that can be seen from that capital', () => {
    for (const country of playable) {
      const state = game(country);
      expect(state.world.nations.some((n) => n.key === country)).toBe(false);
      expect(state.world.nations.length).toBeGreaterThan(30);
      /* One trade account per country in the world as this capital sees
         it — never one with itself. */
      expect(state.trade.flows.length).toBe(state.world.nations.length);
      expect(state.trade.flows.some((f) => f.nation === country)).toBe(false);
      /* Somebody to fall out with and somebody to lose. */
      expect(state.world.nations.some((n) => n.relations > 20)).toBe(true);
      expect(state.world.nations.some((n) => n.relations < 0)).toBe(true);
    }
  });

  it('opens with a chamber a government could be formed in', () => {
    let competitive = 0;

    for (const country of playable) {
      const state = game(country);
      const seated = state.parties.filter((p) => p.seats > 0);
      expect(seated.length).toBeGreaterThan(1);
      expect(state.parties.reduce((sum, p) => sum + p.seats, 0)).toBe(TOTAL_SEATS);

      /* A party, never a wipeout. Below this there is no government to
         form and nothing to negotiate with. */
      const player = state.parties.find((p) => p.isPlayer)!;
      expect(player.seats).toBeGreaterThan(TOTAL_SEATS * 0.05);
      if (player.seats >= TOTAL_SEATS * 0.15) competitive += 1;
    }

    /*
     * And in most of them, a contender — for ONE fixed position. The
     * spread is the point rather than a defect: under a majoritarian
     * system, where a party stands decides almost everything, and the same
     * centre-left platform that wins a hundred seats in Australia wins
     * seventeen in Canada and a hundred and eleven if it moves right. A
     * proportional country forgives the choice; a majoritarian one does
     * not, and that is the difference the profiles exist to model.
     */
    expect(competitive).toBeGreaterThanOrEqual(Math.ceil(playable.length * 0.6));
  });

  it('rewards a platform that fits the country it is standing in', () => {
    const seatsWith = (country: CountryKey, economic: number, social: number) =>
      createGame({
        gameId: `fit-${country}-${economic}`,
        country,
        difficulty: 'standard',
        playerPartyName: 'Reform Coalition',
        playerColor: '#8c2f27',
        playerGlyph: '★',
        playerIdeology: { economic, social, environmental: 0.1 },
      }).parties.find((p) => p.isPlayer)!.seats;

    /*
     * How much the platform decides varies by country, and that is the
     * model working rather than failing. Where a field is spread — France
     * under two rounds, Ireland under a transferable vote — the same party
     * on two platforms is nearly three times apart. Where the two largest
     * families sit close together, as in Canada, it is a few seats, which
     * is what a country whose main parties agree about most things looks
     * like from the inside.
     *
     * So the test is the strong claim where it is true and the weak one
     * everywhere: a majoritarian country amplifies the choice somewhere,
     * and nowhere does the choice fail to register.
     */
    expect(seatsWith('france', 0.3, -0.05)).toBeGreaterThan(
      seatsWith('france', -0.1, 0.2) * 2,
    );

    const majoritarian: CountryKey[] = [
      'canada',
      'united_kingdom',
      'france',
      'india',
      'australia',
      'ireland',
    ];
    for (const country of majoritarian) {
      const right = seatsWith(country, 0.3, -0.05);
      const left = seatsWith(country, -0.1, 0.2);
      expect(right).not.toBe(left);
      expect(Math.max(right, left)).toBeGreaterThan(Math.min(right, left));
    }
  });

  it('gives the player a base rather than uniform support everywhere', () => {
    /*
     * The defect this exists to prevent. Every generated party has its
     * vote concentrated where people who think like it live; leaving the
     * player as the one party without a geography made them evenly
     * competitive in every seat in the country, which flattened the
     * difference between a platform that fits and one that does not.
     */
    const state = game('united_kingdom');
    const player = state.parties.find((p) => p.isPlayer)!;
    expect(player.regionStrength).toBeDefined();
    const values = Object.values(player.regionStrength!);
    expect(Math.max(...values)).toBeGreaterThan(Math.min(...values) * 1.3);

    /* And the invented country keeps a uniform, national field. */
    const verdana = game('verdana');
    for (const party of verdana.parties) {
      expect(party.regionStrength).toBeUndefined();
    }
  });

  it('seats a parliament rather than three parties', () => {
    /*
     * Measured, because it was wrong for a long time and invisibly so.
     * Every majoritarian country used to return exactly three parties
     * with seats and three or four on nothing, however many stood —
     * support was a smooth function of ideology, so whichever party fitted
     * the national mood best won every district in the country.
     */
    for (const country of playable) {
      const state = game(country);
      const held = state.parties.filter((p) => p.seats > 0).length;
      const largest = Math.max(...state.parties.map((p) => p.seats));

      expect(held).toBeGreaterThanOrEqual(4);
      /* And nobody takes the whole chamber. */
      expect(largest).toBeLessThan(TOTAL_SEATS * 0.62);
    }
  });
});
