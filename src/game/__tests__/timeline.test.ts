/**
 * timeline.test.ts — war touches everything, and the country remembers.
 *
 * The defect this file exists because of: TWO ENGINES WITH TWO CASUALTY
 * MODELS. Engine 3 was written when the military was an index and
 * produced a flat figure of up to six thousand casualties a week against
 * a force it had no number for. Engine 7 gave the army a real headcount.
 * Nobody reconciled them, so a war cost a quarter of a million casualties
 * a year in a country with an army of sixty-five thousand — and the
 * typechecker had nothing to say, because both numbers were numbers.
 *
 * Reconciling them then turned a war approval-POSITIVE, because the
 * rally outlived a casualty cost that had quietly become a twelfth of
 * what it was. So casualties are now charged as a share of the army
 * rather than as a count, which is also how a country feels them: five
 * thousand dead is a catastrophe in a country of five million and a news
 * item in one of a billion.
 */

import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  closeEntry,
  describeTimeline,
  lookBack,
  openEntryFor,
  record,
  stillMatters,
  warPressure,
  warSummary,
  weightOf,
  yearOf,
} from '../systems/timeline.ts';
import { stepConflicts } from '../systems/conflict.ts';
import { buildMilitary } from '../systems/military.ts';
import { buildWorld } from '../systems/diplomacy.ts';
import { Rng } from '../rng.ts';
import {
  CASUALTY_SHARE_APPROVAL,
  GENERATIONAL_CASUALTIES,
  START_YEAR,
  TURNS_PER_YEAR,
  WEEKLY_CASUALTY_RATE,
} from '../balance.ts';
import type { Crisis, Timeline } from '../types.ts';

const war = (over: Partial<Crisis> = {}): Crisis => ({
  id: 'w1',
  nation: 'verdana' as never,
  cause: 'A border incident nobody has explained',
  stage: 'war',
  startedTurn: 0,
  stageSince: 0,
  escalation: 62,
  rally: 10,
  casualties: 0,
  ourResolve: 70,
  theirResolve: 58,
  allies: [],
  settlement: null,
  ...over,
});

const fightFor = (weeks: number, forceThousands: number) => {
  let crises = [war()];
  const military = buildMilitary();
  const world = buildWorld();
  let approval = 0;
  for (let t = 0; t < weeks; t += 1) {
    const tick = stepConflicts(crises, {
      military,
      world,
      forceThousands,
      turn: t,
      rng: new Rng(t + 1),
    });
    crises = tick.crises;
    approval += tick.approval;
    if (crises[0]!.stage !== 'war') break;
  }
  return { casualties: crises[0]!.casualties, approval, weeks };
};

/* ------------------------------------------------------------------ *
 * The two engines agree about how many soldiers there are
 * ------------------------------------------------------------------ */

describe('war touches everything: the casualties are the same people', () => {
  it('costs a share of the army rather than a flat figure', () => {
    /*
     * The defect: a flat figure written against an abstract force. A
     * small army in the same war lost the same number of people as a
     * large one, which for a country of sixty-five thousand soldiers
     * meant national extinction inside a year.
     */
    const small = fightFor(52, 36);
    const large = fightFor(52, 1200);
    expect(large.casualties).toBeGreaterThan(small.casualties * 5);
    /* And neither loses more than it has. */
    expect(small.casualties).toBeLessThan(36);
    expect(large.casualties).toBeLessThan(1200);
  });

  it('never takes more than a fraction of the force in one week', () => {
    const forceThousands = 36;
    const out = fightFor(1, forceThousands);
    expect(out.casualties).toBeLessThan(forceThousands * 0.04);
    expect(out.casualties).toBeGreaterThan(0);
    expect(WEEKLY_CASUALTY_RATE).toBeLessThan(0.05);
  });

  it('keeps a war approval-negative at every scale', () => {
    /*
     * Which it was not, briefly: once the casualties were scaled to the
     * real force, the rally outlived a cost that had become a twelfth of
     * what it was, and a war came out approval-positive.
     */
    expect(CASUALTY_SHARE_APPROVAL).toBeLessThan(0);
    for (const forceThousands of [12, 36, 140, 1200]) {
      expect(fightFor(104, forceThousands).approval).toBeLessThan(0);
    }
  });

  it('charges a small country more per casualty than a large one', () => {
    /* Five thousand dead is a catastrophe in a country of five million
       and a news item in one of a billion. */
    const small = fightFor(104, 20);
    const large = fightFor(104, 900);
    const perCasualty = (out: { approval: number; casualties: number }) =>
      out.approval / Math.max(0.01, out.casualties);
    expect(perCasualty(small)).toBeLessThan(perCasualty(large));
  });
});

/* ------------------------------------------------------------------ *
 * The five chains
 * ------------------------------------------------------------------ */

describe('war touches everything: the five chains', () => {
  const pressure = (over: Partial<Parameters<typeof warPressure>[0]> = {}) =>
    warPressure({
      wars: [war()],
      theatres: [],
      weStarted: false,
      population: 62,
      casualties: 0.4,
      turn: 52,
      ...over,
    });

  it('does nothing at all when there is no war', () => {
    const quiet = warPressure({
      wars: [war({ stage: 'settled' })],
      theatres: [],
      weStarted: true,
      population: 62,
      casualties: 0,
      turn: 52,
    });
    expect(quiet.intensity).toBe(0);
    expect(quiet.growthDrag).toBe(0);
    expect(quiet.trustDrain).toBe(0);
    expect(quiet.newsCrowding).toBe(0);
  });

  it('takes growth out of the economy', () => {
    expect(pressure().growthDrag).toBeGreaterThan(0);
    /* And more of it the longer it goes on, without anything about the
       fighting having to change. */
    expect(pressure({ turn: 208 }).growthDrag).toBeGreaterThan(pressure({ turn: 4 }).growthDrag);
  });

  it('drains the belief that acting changes anything', () => {
    /* At exactly the moment the country most wants it to be true. */
    expect(pressure().efficacyDrain).toBeGreaterThan(0);
    expect(pressure({ turn: 260 }).efficacyDrain).toBeGreaterThan(
      pressure({ turn: 4 }).efficacyDrain,
    );
  });

  it('drains trust and the norms only as the war grinds', () => {
    /* A war in its third month is a different political object from the
       same war in its third year. */
    expect(pressure({ turn: 2 }).trustDrain).toBeLessThan(0.002);
    expect(pressure({ turn: 208 }).trustDrain).toBeGreaterThan(0.01);
    expect(pressure({ turn: 208 }).normsDrain).toBeGreaterThan(
      pressure({ turn: 2 }).normsDrain,
    );
  });

  it('crowds out every other story', () => {
    /* Which is why a government at war can do almost nothing else, and
       why everything it does do goes unreported. */
    expect(pressure().newsCrowding).toBeGreaterThan(0.5);
    expect(pressure().newsCrowding).toBeLessThan(1);
  });

  it('costs reputation only for whoever started it', () => {
    expect(pressure({ weStarted: false }).reputationDrain).toBe(0);
    expect(pressure({ weStarted: true }).reputationDrain).toBeGreaterThan(0);
  });

  it('makes veterans, who arrive later and vote', () => {
    expect(pressure({ casualties: 1 }).veterans).toBeGreaterThan(1);
    expect(pressure({ casualties: 0 }).veterans).toBe(0);
  });

  it('becomes a generational event past a point', () => {
    expect(pressure({ wars: [war({ casualties: 5 })] }).generational).toBe(false);
    expect(
      pressure({ wars: [war({ casualties: GENERATIONAL_CASUALTIES + 10 })] }).generational,
    ).toBe(true);
  });

  it('displaces people from ground that has been fought over', () => {
    const theatre = {
      warId: 'w1',
      name: 'the front',
      baseSector: 's0',
      reconnaissance: 0.3,
      stagnantWeeks: 0,
      history: [],
      sectors: [
        {
          id: 's0',
          name: 'the border town',
          terrain: 'urban' as const,
          control: 50,
          fortification: 0 as const,
          works: 0,
          supply: 60,
          depth: 0,
          garrison: [],
          enemyStrength: 0,
          posture: 'defending' as const,
          encircled: false,
          population: 800,
          devastation: 60,
          belief: { control: 50, enemyStrength: 0, supply: 60, lastSeen: 0, everSeen: true },
        },
      ],
    };
    expect(pressure({ theatres: [theatre] }).displaced).toBeGreaterThan(0);
    expect(pressure({ theatres: [] }).displaced).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * What the country remembers
 * ------------------------------------------------------------------ */

describe('the country remembers, and it outlives every government in it', () => {
  const timeline = (): Timeline => buildTimeline(START_YEAR);

  it('dates everything from the year the run began', () => {
    const t = timeline();
    expect(yearOf(t, 0)).toBe(START_YEAR);
    expect(yearOf(t, TURNS_PER_YEAR * 10)).toBe(START_YEAR + 10);
  });

  it('opens an entry while something is still happening and closes it after', () => {
    let t = record(timeline(), {
      kind: 'war',
      startYear: 2036,
      endYear: null,
      title: '2036 — the northern war',
      summary: 'A border incident nobody has explained',
      consequences: [],
      weight: weightOf('war'),
      warId: 'w1',
    });
    expect(openEntryFor(t, 'w1')).toBeDefined();
    t = closeEntry(t, t.entries[0]!.id, 2040, ['40k casualties over 4 years']);
    expect(openEntryFor(t, 'w1')).toBeUndefined();
    expect(t.entries[0]!.endYear).toBe(2040);
    expect(t.entries[0]!.consequences).toHaveLength(1);
  });

  it('writes the line a history would write', () => {
    const written = warSummary(
      {
        name: 'the Northern Continental War',
        startedTurn: 0,
        endedTurn: TURNS_PER_YEAR * 4,
        casualties: 140,
        outcome: 'Settled on their terms',
        governmentsFallen: 2,
        alliesInvolved: 2,
        territoryChanged: 2,
      },
      START_YEAR,
    );
    expect(written.title).toBe(`${START_YEAR}–${START_YEAR + 4} — the Northern Continental War`);
    expect(written.consequences).toContain('4 countries involved');
    expect(written.consequences).toContain('2 territorial changes');
    expect(written.consequences).toContain('The government changed 2 times');
    expect(written.summary).toMatch(/generation/);
  });

  it('lets a player look back fifty and a hundred years', () => {
    let t = timeline();
    for (const year of [2036, 2051, 2068, 2094, 2120]) {
      t = record(t, {
        kind: 'war',
        startYear: year,
        endYear: year + 2,
        title: `${year} — a war`,
        summary: 'It happened.',
        consequences: [],
        weight: weightOf('war'),
      });
    }
    expect(lookBack(t, 2120, 55)).toHaveLength(3);
    expect(lookBack(t, 2120, 100)).toHaveLength(5);
    /* Newest first, because that is how anybody reads one. */
    expect(lookBack(t, 2120, 100)[0]!.startYear).toBe(2120);
  });

  it('fades everything, and wars slowest', () => {
    let t = timeline();
    t = record(t, {
      kind: 'war',
      startYear: 2040,
      endYear: 2043,
      title: 'a war',
      summary: '',
      consequences: [],
      weight: weightOf('war', 120, 2),
    });
    t = record(t, {
      kind: 'election',
      startYear: 2118,
      endYear: 2118,
      title: 'an election',
      summary: '',
      consequences: [],
      weight: weightOf('election'),
    });
    /* Eighty years on, the war still explains more of the country than
       last year's election does. */
    expect(stillMatters(t, 2120)[0]!.kind).toBe('war');
  });

  it('weighs a war above an election and a constitutional change above both', () => {
    expect(weightOf('war')).toBeGreaterThan(weightOf('election'));
    expect(weightOf('constitutional')).toBeGreaterThan(weightOf('election'));
    expect(weightOf('war', 200, 3)).toBeGreaterThan(weightOf('war'));
    expect(weightOf('war', 10_000)).toBeLessThanOrEqual(100);
  });

  it('says one true thing about what the country is still carrying', () => {
    expect(describeTimeline(timeline(), START_YEAR)).toMatch(/Nothing yet/);
    const withWar: Timeline = {
      ...timeline(),
      wars: [
        {
          id: 'w1',
          name: 'the northern war',
          kind: 'limited',
          against: 'Verdana',
          aim: 'compel_settlement',
          outcome: 'status_quo',
          startedTurn: 0,
          endedTurn: TURNS_PER_YEAR * 3,
          casualties: 140,
          peakIntensity: 70,
          casus: '',
          governmentsFallen: 1,
          peakDebt: 0,
          deepestRecession: 0,
          territoryChanged: 0,
          alliesInvolved: 0,
        },
      ],
    };
    expect(describeTimeline(withWar, START_YEAR + 40)).toMatch(/40 years ago/);
  });
});
