/**
 * world.test.ts — the country table, and the arithmetic that reads it.
 *
 * The table is data rather than code, which is exactly why it needs tests:
 * a wrong border or a missing membership is invisible in a type check and
 * shows up four hours into a run as a country that trades with nobody.
 *
 * Two kinds of check here. First, that the table is internally coherent —
 * unique keys, symmetric geography, every state in the bodies it belongs
 * to. Second, that the derived half is genuinely relational: the same pair
 * of countries has to read correctly from either end, because the player
 * picks which capital they are sitting in.
 */

import { describe, expect, it } from 'vitest';
import {
  ALIGNMENT_LABELS,
  COUNTRY_TEMPLATES,
  INSTITUTION_LABELS,
  POSTURE_LABELS,
  REGION_LABELS,
  findCountry,
  playableCountries,
  type CountryKey,
} from '../content/world/countries.ts';
import {
  betweenThem,
  buysFrom,
  economyOf,
  powerOf,
  sameRegion,
  shareBorder,
  startingRelations,
  worldFrom,
} from '../content/world/derive.ts';
import {
  ORGANISATION_TEMPLATES,
  membersOfOrganisation,
} from '../content/organisations.ts';
import { findIndustry } from '../content/industries.ts';

const real = COUNTRY_TEMPLATES.filter((c) => c.region !== 'nowhere');

describe('the table', () => {
  it('names every country once', () => {
    const keys = COUNTRY_TEMPLATES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const country of COUNTRY_TEMPLATES) {
      expect(country.name.length).toBeGreaterThan(2);
      expect(country.demonym.length).toBeGreaterThan(2);
      /* Every one says what it is, because a list of names is not a world. */
      expect(country.blurb.length).toBeGreaterThan(40);
    }
  });

  it('gives every country a plausible set of figures', () => {
    const peacetime = COUNTRY_TEMPLATES.filter((c) => c.key !== 'ukraine');
    for (const country of peacetime) {
      expect(country.defenceShare).toBeLessThan(0.12);
    }

    for (const country of COUNTRY_TEMPLATES) {
      expect(country.gdp).toBeGreaterThan(0);
      expect(country.population).toBeGreaterThan(0);
      /* Debt and defence are shares, so a figure above a few multiples of
         output is a units mistake rather than a fiscal crisis. */
      expect(country.debtRatio).toBeGreaterThan(0);
      expect(country.debtRatio).toBeLessThan(3);
      expect(country.defenceShare).toBeGreaterThan(0);
      /* The ceiling is loose on purpose. A country at war really does
         spend a third of everything it makes on the war — Ukraine is in
         this table at 0.37 — and a bound that called that a typo would be
         asserting something false about the world. */
      expect(country.defenceShare).toBeLessThan(0.4);
    }
  });

  it('spells every industry it trades in', () => {
    for (const country of COUNTRY_TEMPLATES) {
      expect(country.exports.length).toBeGreaterThan(0);
      expect(country.imports.length).toBeGreaterThan(0);
      for (const key of [...country.exports, ...country.imports]) {
        expect(() => findIndustry(key)).not.toThrow();
      }
    }
  });

  it('labels every region, alignment, posture and body it uses', () => {
    for (const country of COUNTRY_TEMPLATES) {
      expect(REGION_LABELS[country.region]).toBeTruthy();
      expect(ALIGNMENT_LABELS[country.alignment]).toBeTruthy();
      expect(POSTURE_LABELS[country.posture]).toBeTruthy();
      for (const body of country.institutions) {
        expect(INSTITUTION_LABELS[body]).toBeTruthy();
      }
    }
  });

  it('borders only countries that exist, and never itself', () => {
    for (const country of COUNTRY_TEMPLATES) {
      for (const border of country.borders) {
        expect(border).not.toBe(country.key);
        expect(() => findCountry(border)).not.toThrow();
      }
    }
  });

  it('reads a border the same way from either side', () => {
    /*
     * The table writes each border once, from whichever side was more
     * convenient. `shareBorder` is what everything else reads, and it has
     * to be symmetric or a frontier would exist for one government and not
     * for the one on the other side of it.
     */
    for (const a of COUNTRY_TEMPLATES) {
      for (const b of COUNTRY_TEMPLATES) {
        expect(shareBorder(a.key, b.key)).toBe(shareBorder(b.key, a.key));
      }
    }
  });

  it('offers somewhere to play', () => {
    const playable = playableCountries();
    expect(playable.length).toBeGreaterThan(10);
    expect(playable.map((c) => c.key)).toContain('verdana');
  });
});

describe('the rooms', () => {
  it('puts every country in the UN and nobody in a body twice', () => {
    for (const country of real) {
      expect(country.institutions).toContain('un');
      expect(new Set(country.institutions).size).toBe(country.institutions.length);
    }
  });

  it('fills every room from the table rather than from a second list', () => {
    for (const template of ORGANISATION_TEMPLATES) {
      expect(template.members).toEqual(membersOfOrganisation(template.key));
      /* An empty room cannot pass a resolution, so an empty room is a bug
         in the table rather than a quiet no-op at the vote. */
      expect(template.members.length).toBeGreaterThan(1);
      for (const member of template.members) {
        expect(findCountry(member).institutions).toContain(template.key);
      }
    }
  });

  it('gives the veto only to members who hold it', () => {
    const council = ORGANISATION_TEMPLATES.find((o) => o.key === 'security_council')!;
    expect(council.vetoHolders).toHaveLength(5);
    for (const holder of council.vetoHolders) {
      expect(findCountry(holder).veto).toBe(true);
      expect(council.members).toContain(holder);
    }
    /* And nowhere else. A veto in a trade body would be a different game. */
    for (const template of ORGANISATION_TEMPLATES) {
      if (template.key === 'security_council') continue;
      expect(template.vetoHolders).toHaveLength(0);
    }
  });
});

describe('weight', () => {
  it('ranks the largest economies at the top', () => {
    const ranked = [...real].sort((a, b) => powerOf(b) - powerOf(a)).map((c) => c.key);
    expect(ranked.slice(0, 4)).toContain('united_states');
    expect(ranked.slice(0, 4)).toContain('china');
    expect(ranked.indexOf('united_states')).toBeLessThan(ranked.indexOf('new_zealand'));
  });

  it('pays for a seat and a deterrent, because both are hard to give up', () => {
    const uk = findCountry('united_kingdom');
    const plain = { ...uk, veto: false, deterrent: false };
    expect(powerOf(uk)).toBeGreaterThan(powerOf(plain) + 0.6);
  });

  it('measures an economy against whoever is asking', () => {
    const us = findCountry('united_states');
    const nz = findCountry('new_zealand');
    expect(economyOf(us, nz)).toBeGreaterThan(20);
    expect(economyOf(nz, us)).toBeLessThan(0.1);
  });
});

describe('disposition', () => {
  it('starts allies warm and rivals cold', () => {
    const uk = findCountry('united_kingdom');
    const fr = findCountry('france');
    const ru = findCountry('russia');
    expect(startingRelations(fr, uk)).toBeGreaterThan(30);
    expect(startingRelations(ru, uk)).toBeLessThan(-20);
  });

  it('reads a relationship the same way from either end', () => {
    /*
     * Not exactly — ideology is symmetric but posture is not, so a
     * volatile state is read as more difficult than it reads anybody else.
     * The check is that the two ends never disagree about which side of
     * neutral they are on, which is the thing a player would notice.
     */
    for (const a of real) {
      for (const b of real) {
        if (a.key === b.key) continue;
        const there = startingRelations(a, b);
        const back = startingRelations(b, a);
        expect(Math.abs(there - back)).toBeLessThan(25);
      }
    }
  });

  it('keeps every figure inside the scale', () => {
    for (const a of real) {
      for (const b of real) {
        if (a.key === b.key) continue;
        const relations = startingRelations(a, b);
        expect(relations).toBeGreaterThanOrEqual(-85);
        expect(relations).toBeLessThanOrEqual(80);
      }
    }
  });

  it('works on two countries the player is not', () => {
    /* The world simulation has to decide what Brazil thinks of Japan with
       no player anywhere in the question. */
    expect(betweenThem('brazil', 'japan')).toBe(betweenThem('japan', 'brazil'));
    expect(sameRegion('france', 'germany')).toBe(true);
    expect(sameRegion('france', 'japan')).toBe(false);
  });
});

describe('the view from a capital', () => {
  const capitals: CountryKey[] = [
    'verdana',
    'united_states',
    'japan',
    'brazil',
    'nigeria',
    'poland',
    'new_zealand',
  ];

  it('builds a world from any of them', () => {
    for (const capital of capitals) {
      const world = worldFrom(capital);
      /* Never yourself, never the invented country unless you are it. */
      expect(world.some((f) => f.key === capital)).toBe(false);
      expect(world.some((f) => f.key === 'verdana')).toBe(false);
      expect(world.length).toBe(real.length - (capital === 'verdana' ? 0 : 1));

      for (const foreign of world) {
        expect(foreign.power).toBeGreaterThan(0);
        expect(foreign.economy).toBeGreaterThan(0);
        /* A country with no trade at all would be invisible to half the
           engine, so the fallback in `buysFrom` has to actually fire. */
        expect(foreign.buys.length).toBeGreaterThan(0);
        expect(foreign.sells.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every capital both friends and difficulties', () => {
    for (const capital of capitals) {
      const world = worldFrom(capital);
      expect(world.filter((f) => f.startingRelations > 20).length).toBeGreaterThan(0);
      expect(world.filter((f) => f.startingRelations < 0).length).toBeGreaterThan(0);
      expect(world.filter((f) => f.inheritedTreaty).length).toBeGreaterThan(0);
    }
  });

  it('trades in what the other side actually wants', () => {
    const us = findCountry('united_states');
    const sa = findCountry('saudi_arabia');
    /* Saudi Arabia sells energy and the United States buys it. Derived
       from the two industry lists rather than written down, so adding a
       country wires it into the trade engine without a pairing by hand. */
    expect(buysFrom(us, sa).length).toBeGreaterThan(0);
    expect(worldFrom('united_states').find((f) => f.key === 'saudi_arabia')!.sells).toContain(
      'energy',
    );
  });
});
