/**
 * diplomacy.test.ts — the asymmetry.
 *
 * One property runs through all of these: a large country's opinion costs
 * more to ignore than a small one's. If that ever stops being true, the
 * diplomacy becomes a puzzle with a solution rather than the uncomfortable
 * position every small and middling state is actually in.
 *
 * The second property, almost as important: a treaty is a commitment. If
 * withdrawing from one is cheap, the whole system degrades into a menu of
 * bonuses to collect.
 */

import { describe, expect, it } from 'vitest';
import {
  NATION_TEMPLATES,
  adversaries,
  applyDiplomaticAct,
  boundToDefend,
  breakAgreement,
  buildWorld,
  byWeight,
  canSummit,
  exposures,
  findNation,
  friends,
  keepAgreement,
  leverage,
  naturalRelations,
  obligationOf,
  standingWith,
  stepWorld,
  treatiesWith,
  treatyThreshold,
  willSign,
} from '../systems/diplomacy.ts';
import { buildIndustries } from '../systems/industry.ts';
import { makeIdeology } from '../ideology.ts';
import {
  RELATIONS_FRIENDLY,
  RELATIONS_HOSTILE,
  RELATIONS_MAX,
  RELATIONS_MIN,
  SUMMIT_COOLDOWN,
} from '../balance.ts';
import type { NationState, TreatyKind, World } from '../types.ts';

const centrist = makeIdeology(0, 0, 0);
const industries = buildIndustries();

function run(months: number, ideology = centrist, from = buildWorld()): World {
  let world = from;
  for (let t = 1; t <= months; t += 1) {
    world = stepWorld(world, { playerIdeology: ideology, industries, turn: t }).world;
  }
  return world;
}

const nationIn = (world: World, key: string): NationState =>
  world.nations.find((n) => n.key === key)!;

describe('the world as inherited', () => {
  it('has twelve countries, none of them real', () => {
    expect(NATION_TEMPLATES).toHaveLength(12);
    for (const template of NATION_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(2);
      expect(template.power).toBeGreaterThan(0);
    }
  });

  it('starts with friends the player did not make and quarrels they did not start', () => {
    const world = buildWorld();
    expect(friends(world).length).toBeGreaterThan(0);
    expect(world.nations.some((n) => n.relations < 0)).toBe(true);
    expect(world.treaties.length).toBeGreaterThan(0);
  });

  it('keeps missions where relations are not already hostile', () => {
    for (const nation of buildWorld().nations) {
      if (nation.relations > 0) expect(nation.embassy).toBe(true);
    }
  });

  it('tracks dependence in BOTH directions, because leverage is not exposure', () => {
    /* A country that buys half its energy from you is leverage. A country
       you buy half your energy from is exposure. Governments confuse them
       routinely and the model should not help. */
    const world = buildWorld();
    const differing = world.nations.filter(
      (n) => Math.abs(n.tradeDependence - n.ourDependence) > 0.02,
    );
    expect(differing.length).toBeGreaterThan(6);
  });

  it('names where the country is exposed', () => {
    const list = exposures(buildWorld());
    for (const nation of list) {
      expect(nation.ourDependence).toBeGreaterThan(nation.tradeDependence);
    }
  });
});

describe('the asymmetry', () => {
  it('makes a large country’s opinion worth more', () => {
    const astrun = findNation('astrun');
    const holm = findNation('holm');
    expect(leverage(astrun)).toBeGreaterThan(leverage(holm) * 4);
  });

  it('scales every act by who it is aimed at', () => {
    const world = buildWorld();
    const toAstrun = applyDiplomaticAct(nationIn(world, 'astrun'), 10, findNation('astrun'));
    const toHolm = applyDiplomaticAct(nationIn(world, 'holm'), 10, findNation('holm'));
    const gainAstrun = toAstrun.relations - nationIn(world, 'astrun').relations;
    const gainHolm = toHolm.relations - nationIn(world, 'holm').relations;
    /* Being heard by the powerful is expensive, and being principled
       cheaply is only available with the small. */
    expect(gainAstrun).toBeGreaterThan(gainHolm * 1.8);
  });

  it('weights the country’s overall standing the same way', () => {
    const base = run(1);
    /* Warmth toward Holm cannot offset coldness toward Astrun. */
    const warmSmall = run(1, centrist, {
      ...buildWorld(),
      nations: buildWorld().nations.map((n) =>
        n.key === 'holm' ? { ...n, relations: 100 } : n.key === 'astrun' ? { ...n, relations: -100 } : n,
      ),
    });
    const warmLarge = run(1, centrist, {
      ...buildWorld(),
      nations: buildWorld().nations.map((n) =>
        n.key === 'holm' ? { ...n, relations: -100 } : n.key === 'astrun' ? { ...n, relations: 100 } : n,
      ),
    });
    const standingOf = (w: World) => w.history[w.history.length - 1]!.standing;
    expect(standingOf(warmLarge)).toBeGreaterThan(standingOf(warmSmall));
    expect(Number.isFinite(standingOf(base))).toBe(true);
  });

  it('ranks countries by how much their opinion costs to ignore', () => {
    const ranked = byWeight(buildWorld());
    for (let i = 1; i < ranked.length; i += 1) {
      expect(findNation(ranked[i - 1]!.key).power).toBeGreaterThanOrEqual(
        findNation(ranked[i]!.key).power,
      );
    }
  });
});

describe('where relations naturally sit', () => {
  it('makes a shared worldview cheap to maintain and an opposite one dear', () => {
    const world = buildWorld();
    const kestran = findNation('kestran');
    const market = naturalRelations(kestran, kestran.ideology, nationIn(world, 'kestran'));
    const opposite = naturalRelations(
      kestran,
      makeIdeology(-kestran.ideology.economic, -kestran.ideology.social, -kestran.ideology.environmental),
      nationIn(world, 'kestran'),
    );
    expect(market).toBeGreaterThan(opposite);
  });

  it('holds neighbours slightly against you, because neighbours argue', () => {
    const world = buildWorld();
    const neighbourly = NATION_TEMPLATES.filter((t) => t.neighbour);
    expect(neighbourly.length).toBeGreaterThan(1);
    for (const template of neighbourly) {
      const asNeighbour = naturalRelations(template, template.ideology, nationIn(world, template.key));
      const asDistant = naturalRelations(
        { ...template, neighbour: false },
        template.ideology,
        nationIn(world, template.key),
      );
      expect(asNeighbour).toBeLessThan(asDistant);
    }
  });

  it('drifts toward it slowly, over years rather than months', () => {
    const ideology = makeIdeology(0.7, -0.3, -0.5);
    const oneYear = nationIn(run(12, ideology), 'ehlas').relations;
    const tenYears = nationIn(run(120, ideology), 'ehlas').relations;
    const start = nationIn(buildWorld(), 'ehlas').relations;
    expect(Math.abs(oneYear - start)).toBeLessThan(Math.abs(tenYears - start));
  });

  it('keeps relations inside their bounds however long it runs', () => {
    for (const ideology of [makeIdeology(1, 1, 1), makeIdeology(-1, -1, -1), centrist]) {
      for (const nation of run(600, ideology).nations) {
        expect(nation.relations).toBeGreaterThanOrEqual(RELATIONS_MIN);
        expect(nation.relations).toBeLessThanOrEqual(RELATIONS_MAX);
      }
    }
  });
});

describe('embassies', () => {
  it('slow decay rather than improving anything', () => {
    /* The quiet and unglamorous argument for keeping a mission open in a
       country nobody likes. */
    const base = buildWorld();
    const hostileIdeology = makeIdeology(-1, -1, -1);
    const withMission = run(60, hostileIdeology, {
      ...base,
      nations: base.nations.map((n) => (n.key === 'kestran' ? { ...n, embassy: true } : n)),
    });
    const without = run(60, hostileIdeology, {
      ...base,
      nations: base.nations.map((n) => (n.key === 'kestran' ? { ...n, embassy: false } : n)),
    });
    const start = nationIn(base, 'kestran').relations;
    /* Both fall. The one with a mission falls less far. */
    expect(nationIn(withMission, 'kestran').relations).toBeLessThan(start);
    expect(nationIn(withMission, 'kestran').relations).toBeGreaterThan(
      nationIn(without, 'kestran').relations,
    );
  });

  it('give an ambassador something to sit in, and the ambassador takes months', () => {
    const base = buildWorld();
    const fresh = run(2, centrist, {
      ...base,
      nations: base.nations.map((n) =>
        n.key === 'garda' ? { ...n, embassy: true, ambassadorMonths: 0 } : n,
      ),
    });
    const settled = run(2, centrist, {
      ...base,
      nations: base.nations.map((n) =>
        n.key === 'garda' ? { ...n, embassy: true, ambassadorMonths: 30 } : n,
      ),
    });
    expect(nationIn(settled, 'garda').relations).toBeGreaterThan(
      nationIn(fresh, 'garda').relations,
    );
  });
});

describe('treaties are commitments', () => {
  const kinds: TreatyKind[] = [
    'trade',
    'defence',
    'mutual_defence',
    'non_aggression',
    'peace',
    'partnership',
  ];

  it('state what they oblige, in words', () => {
    for (const kind of kinds) {
      const text = obligationOf(kind, 'Astrun');
      expect(text.length).toBeGreaterThan(20);
    }
    /* And the one that matters most says so plainly. */
    expect(obligationOf('mutual_defence', 'Holm')).toMatch(/not a figure of speech/);
  });

  it('ask more of a relationship the more they promise', () => {
    expect(treatyThreshold('mutual_defence')).toBeGreaterThan(treatyThreshold('defence'));
    expect(treatyThreshold('defence')).toBeGreaterThan(treatyThreshold('trade'));
    /* Except peace, which is made with people you do not like. That is
       what it is for. */
    expect(treatyThreshold('peace')).toBeLessThan(treatyThreshold('trade'));
  });

  it('are refused by a government whose word is not good', () => {
    const nation: NationState = { ...nationIn(buildWorld(), 'jorvik'), relations: 45 };
    expect(willSign(nation, 'partnership', 80)).toBe(true);
    expect(willSign(nation, 'partnership', 20)).toBe(false);
  });

  it('are refused by anyone under sanction, at any relations', () => {
    const nation: NationState = {
      ...nationIn(buildWorld(), 'dunmarch'),
      relations: 95,
      sanctioned: true,
    };
    expect(willSign(nation, 'trade', 100)).toBe(false);
  });

  it('bind the country to somebody else’s war, when that is what was signed', () => {
    const world = buildWorld();
    expect(boundToDefend(world, 'holm')).toBe(false);
    const bound: World = {
      ...world,
      treaties: [
        ...world.treaties,
        {
          id: 'md-holm',
          kind: 'mutual_defence',
          parties: ['holm'],
          signedTurn: 1,
          signedTerm: 1,
          obligation: obligationOf('mutual_defence', 'Holm'),
          dividend: 0.5,
        },
      ],
    };
    expect(boundToDefend(bound, 'holm')).toBe(true);
    expect(treatiesWith(bound, 'holm')).toHaveLength(2);
  });

  it('pay a standing dividend while they hold', () => {
    const world = buildWorld();
    const withTreaty = run(24, centrist, world);
    const stripped = run(24, centrist, { ...world, treaties: [] });
    expect(nationIn(withTreaty, 'belhaven').relations).toBeGreaterThan(
      nationIn(stripped, 'belhaven').relations,
    );
  });
});

describe('reputation is enforced by people who were not involved', () => {
  it('costs relations with every country, not just the one let down', () => {
    const world = buildWorld();
    const after = breakAgreement(world, 16);
    expect(after.reputation).toBeLessThan(world.reputation);
    for (const nation of after.nations) {
      const was = nationIn(world, nation.key).relations;
      /* Every one of them marked it, including countries with no interest
         in the agreement at all. */
      expect(nation.relations).toBeLessThanOrEqual(was);
    }
  });

  it('is slower to earn than to lose', () => {
    const world = buildWorld();
    const broken = breakAgreement(world, 16).reputation;
    const kept = keepAgreement(world, 16).reputation;
    expect(world.reputation - broken).toBeCloseTo(16, 6);
    expect(kept - world.reputation).toBeCloseTo(16, 6);
    /* The asymmetry is in the relations, which only breaking touches. */
    expect(keepAgreement(world, 16).nations).toEqual(world.nations);
  });

  it('never leaves reputation outside 0..100', () => {
    expect(breakAgreement(buildWorld(), 500).reputation).toBe(0);
    expect(keepAgreement(buildWorld(), 500).reputation).toBe(100);
  });
});

describe('standing and influence', () => {
  it('names the relationship in words a player can act on', () => {
    expect(standingWith({ relations: 90 } as NationState)).toBe('allied');
    expect(standingWith({ relations: RELATIONS_FRIENDLY } as NationState)).toBe('friendly');
    expect(standingWith({ relations: 10 } as NationState)).toBe('neutral');
    expect(standingWith({ relations: -10 } as NationState)).toBe('strained');
    expect(standingWith({ relations: RELATIONS_HOSTILE } as NationState)).toBe('hostile');
  });

  it('grows influence with agreements and standing', () => {
    const isolated = run(1, centrist, { ...buildWorld(), treaties: [] });
    const connected = run(1, centrist, buildWorld());
    expect(connected.influence).toBeGreaterThan(isolated.influence);
    expect(connected.influence).toBeLessThanOrEqual(100);
  });

  it('holds a summit only once in a while', () => {
    const nation = nationIn(buildWorld(), 'jorvik');
    expect(canSummit(nation, 10)).toBe(true);
    const recent = { ...nation, lastSummitTurn: 10 };
    expect(canSummit(recent, 10 + SUMMIT_COOLDOWN - 1)).toBe(false);
    expect(canSummit(recent, 10 + SUMMIT_COOLDOWN)).toBe(true);
  });

  it('will not sit down with a country under sanction', () => {
    const nation = { ...nationIn(buildWorld(), 'jorvik'), sanctioned: true };
    expect(canSummit(nation, 100)).toBe(false);
  });

  it('reports friends and adversaries', () => {
    const world = buildWorld();
    for (const nation of friends(world)) expect(nation.relations).toBeGreaterThanOrEqual(RELATIONS_FRIENDLY);
    for (const nation of adversaries(world)) expect(nation.relations).toBeLessThanOrEqual(RELATIONS_HOSTILE);
  });

  it('is deterministic — there is no randomness in a relationship', () => {
    expect(run(60)).toEqual(run(60));
  });
});
