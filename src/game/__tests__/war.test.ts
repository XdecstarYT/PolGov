/**
 * war.test.ts — losing a war you are winning.
 *
 * The claim this file exists to protect: a government can win every
 * engagement for three years and be destroyed by the war anyway. That is
 * not a quirk. It is the ordinary outcome of an expeditionary war with an
 * ambitious aim, and it happens through two mechanisms this engine
 * models explicitly.
 *
 * The first is EXHAUSTION. A war ends when one side's government can no
 * longer carry its own population, not when it runs out of soldiers. That
 * capacity depends on whose soil it is fought on, who started it, whether
 * anybody is sharing the burden, and — largest of all — whether anything
 * visible is being achieved.
 *
 * The second is that VICTORY IS NOT ONE THING. Surviving is cheap and
 * removing a foreign government is not, and the same score that wins one
 * war falls far short in another. Ambition cuts both ways: a country
 * fighting to survive is very hard to beat, and a country fighting to
 * remove somebody else's government is easy to beat, because falling
 * short of an enormous objective is failure and everybody can see it.
 */

import { describe, expect, it } from 'vitest';
import {
  availableOutcome,
  declareWar,
  losingTheRace,
  politicalReturn,
  scoreToLose,
  scoreToWin,
  stepWar,
  warYears,
  type WarInputs,
} from '../systems/war.ts';
import { WAR_TEMPLATES, findWarKind, type WarAim, type WarKind } from '../content/war.ts';
import { EXHAUSTION_BREAKS } from '../balance.ts';
import type { War } from '../types.ts';

const inputs = (over: Partial<WarInputs> = {}): WarInputs => ({
  battlefield: 0,
  ourCasualties: 0.6,
  theirCasualties: 0.6,
  costShare: 0.06,
  committed: 0.5,
  ourMateriel: 1,
  theirMateriel: 1,
  institutionalTrust: 52,
  publicSupport: 50,
  allyContribution: 0,
  intelligenceQuality: 0.6,
  turn: 1,
  noise: 0,
  ...over,
});

function fight(
  kind: WarKind,
  aim: WarAim,
  over: Partial<WarInputs> = {},
  initiator: 'us' | 'them' = 'us',
  maxYears = 15,
) {
  let war = declareWar({
    id: 'w',
    kind,
    against: 'somewhere',
    aim,
    initiator,
    allies: [],
    theirAllies: [],
    turn: 0,
    casus: 'a line that will not age well',
  });
  const events: string[] = [];
  let broke = false;
  let weeks = 0;
  /* The gap between what is happening and what is reported, averaged over
     the whole war. A single snapshot of it is wherever the noise happened
     to be that week and says nothing. */
  let gapTotal = 0;
  for (let t = 1; t <= 52 * maxYears; t += 1) {
    const tick = stepWar(war, { ...inputs(over), turn: t, noise: Math.sin(t * 0.7) });
    war = tick.war;
    weeks = t;
    gapTotal += Math.abs(war.reportedScore - war.score);
    events.push(...tick.events);
    if (tick.breaking) broke = true;
    if (tick.ended) break;
  }
  return {
    war,
    events,
    broke,
    weeks,
    years: warYears(war, weeks),
    meanGap: gapTotal / Math.max(1, weeks),
  };
}

describe('winning every battle and losing the war', () => {
  it('withdraws a government that is ahead on the battlefield', () => {
    /*
     * The headline case. An intervention that wins steadily for over a
     * year, is comfortably ahead when it ends, and ends in withdrawal —
     * because removing a foreign government needs a score it was never
     * going to reach, and the country ran out of patience first.
     */
    const { war, years } = fight('intervention', 'regime_change', { battlefield: 0.3 });

    expect(war.score).toBeGreaterThan(40);
    expect(war.score).toBeLessThan(scoreToWin(war));
    expect(war.outcome).toBe('withdrawal');
    expect(war.us.exhaustion).toBeGreaterThanOrEqual(EXHAUSTION_BREAKS);
    /* And they were nowhere near finished. */
    expect(war.them.exhaustion).toBeLessThan(war.us.exhaustion - 20);
    expect(years).toBeGreaterThan(0.6);
  });

  it('holds a government that is behind, when the war is on its own soil', () => {
    const away = fight('intervention', 'compel_settlement', { battlefield: -0.05 });
    const home = fight('defensive', 'survive', { battlefield: -0.05 }, 'them');
    /* Same losing battlefield. Very different capacity to carry it. */
    expect(home.war.us.exhaustion).toBeLessThan(away.war.us.exhaustion);
    expect(home.years).toBeGreaterThan(away.years);
  });
});

describe('what victory costs, by aim', () => {
  it('prices surviving cheaply and regime change dearly', () => {
    const survive = declareWar({
      id: 'a', kind: 'defensive', against: 'x', aim: 'survive', initiator: 'them',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    const regime = declareWar({
      id: 'b', kind: 'intervention', against: 'x', aim: 'regime_change', initiator: 'us',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    expect(scoreToWin(survive)).toBeLessThan(scoreToWin(regime) / 3);
  });

  it('makes ambition cut both ways', () => {
    /*
     * The error the first draft made: losing was written as the mirror of
     * winning, so a defensive war was LOST by being twenty points down.
     * That is not how a country is conquered. A cheap aim is hard to
     * beat; an enormous one is easy to fall short of.
     */
    const survive = declareWar({
      id: 'a', kind: 'defensive', against: 'x', aim: 'survive', initiator: 'them',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    const regime = declareWar({
      id: 'b', kind: 'intervention', against: 'x', aim: 'regime_change', initiator: 'us',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    expect(scoreToLose(survive)).toBeGreaterThan(scoreToWin(survive));
    expect(scoreToLose(regime)).toBeLessThan(scoreToWin(regime));
  });

  it('does not hand a defeat to a country merely doing badly', () => {
    const { war } = fight('defensive', 'survive', { battlefield: -0.12 }, 'them', 4);
    /* Two years of losing ground, and the country is still there. */
    expect(war.outcome).not.toBe('defeat');
  });
});

describe('exhaustion', () => {
  it('is spent fastest where nothing can be seen to be achieved', () => {
    /* Identical casualties and cost. The only difference is whether the
       kind of war produces anything anybody can point at. */
    const legible = fight('defensive', 'restore_border', { battlefield: 0 }, 'them', 3);
    const not = fight('insurgency', 'restore_order', { battlefield: 0 }, 'us', 3);
    expect(politicalReturn(not.war)).toBeLessThan(politicalReturn(legible.war));
    expect(not.war.us.exhaustion).toBeGreaterThan(legible.war.us.exhaustion);
  });

  it('is carried further by allies, by trust, and by not having started it', () => {
    const alone = fight('coalition', 'compel_settlement', { battlefield: 0.05 }, 'us', 3);
    const shared = fight(
      'coalition',
      'compel_settlement',
      { battlefield: 0.05, allyContribution: 0.8 },
      'us',
      3,
    );
    expect(shared.war.us.exhaustion).toBeLessThan(alone.war.us.exhaustion);

    const distrusted = fight('limited', 'deny_objective', { institutionalTrust: 10 }, 'us', 3);
    const trusted = fight('limited', 'deny_objective', { institutionalTrust: 92 }, 'us', 3);
    expect(trusted.war.us.exhaustion).toBeLessThan(distrusted.war.us.exhaustion);

    const started = fight('border', 'restore_border', {}, 'us', 3);
    const attacked = fight('border', 'restore_border', {}, 'them', 3);
    expect(attacked.war.us.exhaustion).toBeLessThan(started.war.us.exhaustion);
  });

  it('warns once, before it is too late to settle', () => {
    const { events, broke, war } = fight('intervention', 'regime_change', { battlefield: 0.1 });
    expect(broke).toBe(true);
    expect(war.us.exhaustion).toBeGreaterThan(70);
    /* And the rally being spent is reported, once. */
    const rallyNotes = events.filter((e) => e.includes('rally is over'));
    expect(rallyNotes.length).toBeLessThanOrEqual(1);
  });

  it('gives the other side a capacity to outlast us too', () => {
    /*
     * Denied relief entirely, they exhausted three times faster than we
     * did and every war in the game was won by outlasting an opponent who
     * had been given no capacity to outlast anybody.
     */
    const { war } = fight('border', 'restore_border', { battlefield: 0 }, 'us', 2);
    expect(war.them.exhaustion).toBeLessThan(war.us.exhaustion * 3);
    expect(war.them.exhaustion).toBeGreaterThan(0);
  });
});

describe('the rally', () => {
  it('is granted on the first day and spent from it', () => {
    const declared = declareWar({
      id: 'a', kind: 'total', against: 'x', aim: 'survive', initiator: 'them',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    expect(declared.rally).toBe(findWarKind('total').rally);

    const { war } = fight('total', 'survive', { battlefield: 0 }, 'them', 3);
    expect(war.rally).toBeLessThan(declared.rally);
  });

  it('is larger and lasts longer in a war nobody chose', () => {
    const invaded = declareWar({
      id: 'a', kind: 'defensive', against: 'x', aim: 'survive', initiator: 'them',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    const chosen = declareWar({
      id: 'b', kind: 'intervention', against: 'x', aim: 'regime_change', initiator: 'us',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    expect(invaded.rally).toBeGreaterThan(chosen.rally);
    expect(findWarKind('defensive').rallyDecay).toBeLessThan(
      findWarKind('intervention').rallyDecay,
    );
  });
});

describe('what the government is told', () => {
  it('is never quite what is happening, and is closer with better intelligence', () => {
    const blind = fight('limited', 'compel_settlement', {
      battlefield: 0.2,
      intelligenceQuality: 0.05,
    }, 'us', 2);
    const clear = fight('limited', 'compel_settlement', {
      battlefield: 0.2,
      intelligenceQuality: 0.98,
    }, 'us', 2);

    expect(clear.meanGap).toBeLessThan(blind.meanGap);
    /* And even perfect intelligence lags, because a despatch describes
       last week. */
    expect(clear.meanGap).toBeGreaterThan(0);
  });
});

describe('every kind of war', () => {
  it('ends, and ends in something that could have happened', () => {
    for (const template of WAR_TEMPLATES) {
      for (const aim of template.aims) {
        for (const battlefield of [-0.25, 0, 0.25]) {
          const { war, years } = fight(template.kind, aim, { battlefield }, 'us', 40);
          const where = `${template.kind}/${aim} at ${battlefield}`;

          expect(war.ended, `${where} never ended`).toBe(true);
          expect(war.outcome, where).not.toBeNull();
          expect(years, where).toBeGreaterThan(0.1);
          expect(years, where).toBeLessThan(40);

          for (const side of [war.us, war.them]) {
            expect(side.exhaustion, where).toBeGreaterThanOrEqual(0);
            expect(side.exhaustion, where).toBeLessThanOrEqual(100);
            expect(side.casualties, where).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(side.casualties), where).toBe(true);
          }
          expect(war.score, where).toBeGreaterThanOrEqual(-100);
          expect(war.score, where).toBeLessThanOrEqual(100);
          expect(war.intensity, where).toBeGreaterThanOrEqual(0);
          expect(war.intensity, where).toBeLessThanOrEqual(100);
          expect(war.history.length, where).toBeLessThanOrEqual(416);
        }
      }
    }
  });

  it('produces a spread of endings rather than one', () => {
    const outcomes = new Set<string>();
    for (const template of WAR_TEMPLATES) {
      for (const aim of template.aims) {
        for (const battlefield of [-0.3, -0.05, 0.05, 0.3]) {
          const { war } = fight(template.kind, aim, { battlefield }, 'us', 40);
          outcomes.add(String(war.outcome));
        }
      }
    }
    /*
     * The first draft ended nine wars in ten the same way, in four months,
     * because resolve was a second accumulator measuring exhaustion and
     * disagreeing with it about how fast it moved.
     */
    expect(outcomes.size).toBeGreaterThanOrEqual(4);
  });

  it('never ends a war it has already ended', () => {
    const { war } = fight('border', 'restore_border', { battlefield: 0.3 });
    expect(war.ended).toBe(true);
    const after = stepWar(war, inputs({ turn: 9999 }));
    expect(after.ended).toBe(false);
    expect(after.war).toBe(war);
  });
});

describe('reading a war in progress', () => {
  it('says which side is closer to being unable to go on', () => {
    const { war } = fight('intervention', 'regime_change', { battlefield: 0.1 });
    expect(losingTheRace(war)).toBe('us');
  });

  it('offers the terms actually available rather than the ones hoped for', () => {
    const winning = fight('border', 'restore_border', { battlefield: 0.14 }, 'us', 1);
    const losing = fight('border', 'restore_border', { battlefield: -0.14 }, 'us', 1);
    const options: string[] = [
      availableOutcome(winning.war),
      availableOutcome(losing.war),
    ];
    expect(options[0]).not.toBe(options[1]);
  });
});

/** A war is a value; nothing here should be mutating one in place. */
describe('determinism', () => {
  it('replays a week identically', () => {
    const a = fight('limited', 'compel_settlement', { battlefield: 0.1 }, 'us', 3);
    const b = fight('limited', 'compel_settlement', { battlefield: 0.1 }, 'us', 3);
    expect(a.war.score).toBe(b.war.score);
    expect(a.war.us.exhaustion).toBe(b.war.us.exhaustion);
    expect(a.war.outcome).toBe(b.war.outcome);
  });

  it('leaves the war it was given untouched', () => {
    const before: War = declareWar({
      id: 'a', kind: 'border', against: 'x', aim: 'restore_border', initiator: 'us',
      allies: [], theirAllies: [], turn: 0, casus: '',
    });
    const snapshot = JSON.stringify(before);
    stepWar(before, inputs({ battlefield: 0.5 }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
