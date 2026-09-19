/**
 * economy.test.ts — the macroeconomy.
 *
 * Two kinds of test here, and the second matters more than the first.
 *
 * The unit tests check that each equation does what its name says. The
 * stability tests check that the equations composed together do not blow up,
 * because a three-equation model with feedback between all three is perfectly
 * capable of oscillating to infinity while every individual term looks right.
 * A macro model that diverges over a career would destroy the game quietly —
 * fine for three turns, absurd by turn ninety — so it is checked over a full
 * career and then some, under stimulus, austerity, and shocks.
 */

import { describe, expect, it } from 'vitest';
import {
  buildEconomy,
  classifyCycle,
  costOfLivingScore,
  economyIssueScore,
  forecastEconomy,
  potentialGrowth,
  productivityTarget,
  realRate,
  stepEconomy,
  targetGrowth,
  targetInflation,
  taylorRate,
  applyShock,
  type EconomyInputs,
} from '../systems/economy.ts';
import {
  INFLATION_TARGET,
  NATURAL_UNEMPLOYMENT,
  POLICY_RATE_CEILING,
  POLICY_RATE_MAX_STEP,
  POLICY_RATE_NEUTRAL,
  PRODUCTIVITY_START,
  RECESSION_TURNS,
  TURNS_PER_YEAR,
} from '../balance.ts';
import { Rng } from '../rng.ts';
import type { Economy, EconomicShock } from '../types.ts';

const inputs = (overrides: Partial<EconomyInputs> = {}): EconomyInputs => ({
  fiscalImpulse: 0,
  approval: 50,
  productivityTarget: PRODUCTIVITY_START,
  turn: 1,
  ...overrides,
});

/** Run `months` months, returning the final state. */
function run(economy: Economy, months: number, overrides: Partial<EconomyInputs> = {}): Economy {
  let current = economy;
  for (let i = 1; i <= months; i += 1) {
    current = stepEconomy(current, inputs({ ...overrides, turn: i }));
  }
  return current;
}

const finite = (economy: Economy) => {
  for (const [key, value] of Object.entries(economy)) {
    if (typeof value !== 'number') continue;
    expect(Number.isFinite(value), `${key} is ${value}`).toBe(true);
  }
};

describe('a resting economy', () => {
  it('starts on trend, on target, at the natural rate', () => {
    const e = buildEconomy();
    expect(e.outputGap).toBeCloseTo(0, 10);
    expect(e.inflation).toBeCloseTo(INFLATION_TARGET, 10);
    expect(e.unemployment).toBeCloseTo(NATURAL_UNEMPLOYMENT, 10);
    expect(e.policyRate).toBeCloseTo(POLICY_RATE_NEUTRAL, 10);
  });

  it('stays there when nothing happens to it', () => {
    const after = run(buildEconomy(), 60);
    expect(after.outputGap).toBeGreaterThan(-1);
    expect(after.outputGap).toBeLessThan(1);
    expect(after.inflation).toBeGreaterThan(INFLATION_TARGET - 1.5);
    expect(after.inflation).toBeLessThan(INFLATION_TARGET + 1.5);
    expect(after.unemployment).toBeGreaterThan(NATURAL_UNEMPLOYMENT - 2);
    expect(after.unemployment).toBeLessThan(NATURAL_UNEMPLOYMENT + 2);
  });

  it('grows, so a do-nothing government still has more to tax each year', () => {
    const after = run(buildEconomy(), 12);
    expect(after.gdp).toBeGreaterThan(buildEconomy().gdp);
  });
});

describe('the IS curve', () => {
  it('slows the economy when the real rate is above neutral', () => {
    const tight = { ...buildEconomy(), policyRate: 9 };
    const easy = { ...buildEconomy(), policyRate: 1 };
    expect(targetGrowth(tight, 0)).toBeLessThan(targetGrowth(easy, 0));
  });

  it('treats a deficit as stimulus and a surplus as a drag', () => {
    const e = buildEconomy();
    expect(targetGrowth(e, 40)).toBeGreaterThan(targetGrowth(e, 0));
    expect(targetGrowth(e, -40)).toBeLessThan(targetGrowth(e, 0));
  });

  it('closes the output gap from either side', () => {
    const hot = run({ ...buildEconomy(), gdp: buildEconomy().gdp * 1.05 }, 48);
    const cold = run({ ...buildEconomy(), gdp: buildEconomy().gdp * 0.95 }, 48);
    expect(Math.abs(hot.outputGap)).toBeLessThan(5);
    expect(Math.abs(cold.outputGap)).toBeLessThan(5);
  });
});

describe('Okun’s law', () => {
  it('puts people out of work when output falls below capacity', () => {
    const slump = run({ ...buildEconomy(), gdp: buildEconomy().gdp * 0.94 }, 6);
    expect(slump.unemployment).toBeGreaterThan(NATURAL_UNEMPLOYMENT);
  });

  it('keeps employment and unemployment as two halves of one number', () => {
    const after = run(buildEconomy(), 10);
    expect(after.employment + after.unemployment).toBeCloseTo(100, 10);
  });
});

describe('the Phillips curve', () => {
  it('raises inflation when the labour market is tight', () => {
    const tight = { ...buildEconomy(), unemployment: 2.5 };
    const slack = { ...buildEconomy(), unemployment: 9 };
    expect(targetInflation(tight)).toBeGreaterThan(targetInflation(slack));
  });

  it('is sticky — expectations carry most of last month into this one', () => {
    const entrenched = { ...buildEconomy(), inflation: 9, inflationExpectation: 9 };
    /* One month of slack does not undo it. That is why it is worth fearing. */
    const after = stepEconomy({ ...entrenched, unemployment: 7 }, inputs());
    expect(after.inflation).toBeGreaterThan(5);
  });
});

describe('the central bank', () => {
  it('raises rates by more than a point per point of inflation', () => {
    /* The Taylor principle: anything less and inflation is self-reinforcing. */
    const base = buildEconomy();
    const hot = { ...base, inflation: INFLATION_TARGET + 1 };
    expect(taylorRate(hot) - taylorRate(base)).toBeGreaterThan(1);
  });

  it('moves in steps rather than jumps', () => {
    const shocked = { ...buildEconomy(), inflation: 14, inflationExpectation: 14 };
    const after = stepEconomy(shocked, inputs());
    expect(Math.abs(after.policyRate - shocked.policyRate)).toBeLessThanOrEqual(
      POLICY_RATE_MAX_STEP + 1e-9,
    );
  });

  it('never goes below zero or above its ceiling', () => {
    const deflating = run({ ...buildEconomy(), inflation: -6, inflationExpectation: -6 }, 60);
    expect(deflating.policyRate).toBeGreaterThanOrEqual(0);
    const burning = run({ ...buildEconomy(), inflation: 30, inflationExpectation: 30 }, 200);
    expect(burning.policyRate).toBeLessThanOrEqual(POLICY_RATE_CEILING);
  });

  it('takes back what a spending government gives', () => {
    /*
     * The mechanism the whole fiscal side of the game rests on: sustained
     * stimulus closes the output gap, which lifts inflation, which the bank
     * answers with rates — and the government pays for its own stimulus in
     * debt service it does not control.
     */
    const stimulated = run(buildEconomy(), 36, { fiscalImpulse: 60 });
    const neutral = run(buildEconomy(), 36, { fiscalImpulse: 0 });
    expect(stimulated.policyRate).toBeGreaterThan(neutral.policyRate);
    expect(stimulated.inflation).toBeGreaterThan(neutral.inflation);
  });
});

describe('the cycle', () => {
  it('calls a recession only after the stated run of contracting months', () => {
    expect(classifyCycle(-1, -1, RECESSION_TURNS - 1)).not.toBe('recession');
    expect(classifyCycle(-1, -1, RECESSION_TURNS)).toBe('recession');
  });

  it('counts a contraction run and resets it on any growing month', () => {
    let e: Economy = { ...buildEconomy(), growth: -3 };
    e = stepEconomy(e, inputs({ fiscalImpulse: -400 }));
    expect(e.contractionRun).toBeGreaterThan(0);
    const recovered = stepEconomy({ ...e, growth: 2 }, inputs({ fiscalImpulse: 400 }));
    expect(recovered.contractionRun).toBe(0);
  });
});

describe('shocks', () => {
  const crash: EconomicShock = {
    id: 'crash',
    label: 'Banking crisis',
    kind: 'financial',
    growthImpulse: -6,
    inflationImpulse: -0.6,
    confidenceImpulse: -22,
    remaining: 9,
    duration: 9,
    startedTurn: 1,
  };

  it('bites hardest in its first month and fades from there', () => {
    const hit = applyShock(buildEconomy(), crash);
    const first = stepEconomy(hit, inputs());
    expect(first.growth).toBeLessThan(buildEconomy().growth);
    /* Nine months later it has run its course and is gone from the state. */
    expect(run(hit, 9).shocks.length).toBe(0);
  });

  it('lets a one-month shock actually land', () => {
    /* It is aged at the end of the month it is felt in, not the start, so a
       sharp short crisis is a crisis rather than a no-op. */
    const brief: EconomicShock = { ...crash, remaining: 1, duration: 1 };
    const after = stepEconomy(applyShock(buildEconomy(), brief), inputs());
    expect(after.growth).toBeLessThan(buildEconomy().growth);
    expect(after.shocks.length).toBe(0);
  });

  it('is recovered from, rather than being permanent', () => {
    const recovered = run(applyShock(buildEconomy(), crash), 72);
    expect(recovered.unemployment).toBeLessThan(NATURAL_UNEMPLOYMENT + 2);
    expect(Math.abs(recovered.outputGap)).toBeLessThan(3);
  });

  it('replaces an earlier shock with the same id rather than stacking it', () => {
    const once = applyShock(buildEconomy(), crash);
    const twice = applyShock(once, { ...crash, remaining: 3 });
    expect(twice.shocks.length).toBe(1);
    expect(twice.shocks[0]!.remaining).toBe(3);
  });
});

describe('forecasting', () => {
  it('runs the same step the turn runs, so it cannot disagree with it', () => {
    const start = buildEconomy();
    const forecast = forecastEconomy(start, inputs({ turn: 0 }), 6);
    const actual = run(start, 6);
    const last = forecast.months[forecast.months.length - 1]!;
    expect(last.gdp).toBeCloseTo(actual.gdp, 6);
    expect(last.unemployment).toBeCloseTo(actual.unemployment, 6);
    expect(last.inflation).toBeCloseTo(actual.inflation, 6);
  });

  it('sees a recession coming when one is coming', () => {
    const sinking = applyShock(buildEconomy(), {
      id: 'collapse',
      label: 'Demand collapse',
      kind: 'demand',
      growthImpulse: -9,
      inflationImpulse: -1,
      confidenceImpulse: -30,
      remaining: TURNS_PER_YEAR,
      duration: TURNS_PER_YEAR,
      startedTurn: 1,
    });
    expect(forecastEconomy(sinking, inputs(), TURNS_PER_YEAR).recessionInHorizon).toBe(true);
  });

  it('does not see one when the economy is at rest', () => {
    expect(forecastEconomy(buildEconomy(), inputs(), TURNS_PER_YEAR).recessionInHorizon).toBe(false);
  });
});

describe('productivity', () => {
  it('holds at the baseline when schools and infrastructure are merely adequate', () => {
    expect(productivityTarget(60, 60)).toBeCloseTo(PRODUCTIVITY_START, 10);
  });

  it('raises the country’s speed limit when they are better than adequate', () => {
    const better = productivityTarget(85, 80);
    expect(better).toBeGreaterThan(PRODUCTIVITY_START);
    expect(potentialGrowth(better)).toBeGreaterThan(potentialGrowth(PRODUCTIVITY_START));
  });

  it('is slow — a term of good funding is not a decade of it', () => {
    const oneTerm = run(buildEconomy(), 12, { productivityTarget: 130 });
    const three = run(buildEconomy(), 36, { productivityTarget: 130 });
    expect(oneTerm.productivity).toBeLessThan(three.productivity);
    /* Nowhere near arrived after a single term. */
    expect(oneTerm.productivity).toBeLessThan(PRODUCTIVITY_START + 6);
  });
});

describe('what the electorate reads', () => {
  it('scores the economy on jobs first', () => {
    const working = economyIssueScore(buildEconomy());
    const idle = economyIssueScore({ ...buildEconomy(), unemployment: 12 });
    expect(idle).toBeLessThan(working);
  });

  it('separates a cost-of-living crisis from a high CPI print', () => {
    const squeeze = costOfLivingScore({ ...buildEconomy(), inflation: 2, wageGrowth: -1 }, 0);
    const nominal = costOfLivingScore({ ...buildEconomy(), inflation: 7, wageGrowth: 9 }, 0);
    expect(nominal).toBeGreaterThan(squeeze);
  });

  it('keeps both scores inside 0..100 at any extreme', () => {
    const extremes: Partial<Economy>[] = [
      { unemployment: 40, growth: -30, wageGrowth: -20, inflation: 60 },
      { unemployment: 0.2, growth: 25, wageGrowth: 40, inflation: -15 },
    ];
    for (const overrides of extremes) {
      const e = { ...buildEconomy(), ...overrides };
      for (const score of [economyIssueScore(e), costOfLivingScore(e, 40)]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('stability', () => {
  /*
   * The tests that actually protect the game. Three equations feeding each
   * other can oscillate or diverge while every individual term reads
   * correctly, and it would not show up until a career was long enough to
   * notice — by which point the run is unplayable.
   */

  it('stays finite and plausible over ten careers of doing nothing', () => {
    const after = run(buildEconomy(), 12 * 4 * 10);
    finite(after);
    expect(after.unemployment).toBeGreaterThan(0);
    expect(after.unemployment).toBeLessThan(30);
    expect(after.inflation).toBeGreaterThan(-10);
    expect(after.inflation).toBeLessThan(25);
  });

  it('survives permanent stimulus without running away', () => {
    const after = run(buildEconomy(), 240, { fiscalImpulse: 120 });
    finite(after);
    expect(after.inflation).toBeLessThan(40);
    expect(after.unemployment).toBeGreaterThan(0);
  });

  it('survives permanent austerity without collapsing to nothing', () => {
    /* A surplus worth about 8% of GDP, every month, for twenty years. Brutal,
       and just about conceivable — unlike the figure this test used to pass,
       which was a third of national output and merely proved the clamp works. */
    const after = run(buildEconomy(), 240, { fiscalImpulse: -25 });
    finite(after);
    expect(after.gdp).toBeGreaterThan(0);
    expect(after.unemployment).toBeLessThan(20);
  });

  it('clamps rather than explodes even under a policy nobody could run', () => {
    const absurd = run(buildEconomy(), 240, { fiscalImpulse: -400 });
    finite(absurd);
    expect(absurd.unemployment).toBeLessThanOrEqual(35);
    expect(absurd.gdp).toBeGreaterThan(0);
  });

  it('does not oscillate — the swings get smaller, not bigger', () => {
    const shocked = applyShock(buildEconomy(), {
      id: 'oil',
      label: 'Energy shock',
      kind: 'supply',
      growthImpulse: -5,
      inflationImpulse: 4,
      confidenceImpulse: -18,
      remaining: 6,
      duration: 6,
      startedTurn: 1,
    });
    const settled = run(shocked, 780);
    const recent = settled.history.slice(-104);
    const early = settled.history.slice(0, 104);
    const spread = (xs: { outputGap: number }[]) =>
      Math.max(...xs.map((x) => x.outputGap)) - Math.min(...xs.map((x) => x.outputGap));
    expect(spread(recent)).toBeLessThan(spread(early));
  });

  it('keeps the history bounded so a long career cannot grow without limit', () => {
    const after = run(buildEconomy(), 400);
    expect(after.history.length).toBeLessThanOrEqual(120);
  });

  it('is deterministic — there is no randomness in here at all', () => {
    const a = run(buildEconomy(), 50, { fiscalImpulse: 33 });
    const b = run(buildEconomy(), 50, { fiscalImpulse: 33 });
    expect(a).toEqual(b);
  });
});

describe('realRate', () => {
  it('is the policy rate net of what people expect prices to do', () => {
    const e = { ...buildEconomy(), policyRate: 6, inflationExpectation: 2 };
    expect(realRate(e)).toBeCloseTo(4, 10);
  });
});

describe('the cycle has a character, and it is the right one', () => {
  /*
   * These are the tuning decisions, written down as assertions.
   *
   * Everything above checks that each equation does what its name says. This
   * block checks the thing that actually matters and that no unit test can
   * see: that forty years of this model feels like forty years of a country.
   * A model can be individually correct in every term and still produce an
   * economy that never has a bad year — the first version of this one did,
   * across sixty simulated careers — and that failure is invisible until
   * somebody plays a long game and notices nothing ever happens.
   *
   * The bands are wide on purpose. They are not a claim that these are the
   * right numbers; they are a tripwire for the next person who retunes a
   * constant and quietly flattens the cycle or blows it up.
   */

  /** Forty years of an economy nobody governs, across many seeds. */
  function careers(runs = 40, months = TURNS_PER_YEAR * 40) {
    const out = [];
    for (let seed = 1; seed <= runs; seed += 1) {
      const rng = new Rng(seed * 7919);
      let e = buildEconomy();
      let recessionMonths = 0;
      let minGrowth = Infinity;
      let maxGrowth = -Infinity;
      let minUnemployment = Infinity;
      let maxUnemployment = -Infinity;
      for (let t = 1; t <= months; t += 1) {
        e = stepEconomy(
          e,
          inputs({ turn: t, noise: { demand: rng.range(-1, 1), supply: rng.range(-1, 1) } }),
        );
        if (e.phase === 'recession') recessionMonths += 1;
        minGrowth = Math.min(minGrowth, e.growth);
        maxGrowth = Math.max(maxGrowth, e.growth);
        minUnemployment = Math.min(minUnemployment, e.unemployment);
        maxUnemployment = Math.max(maxUnemployment, e.unemployment);
      }
      out.push({
        end: e,
        recessionMonths,
        minGrowth,
        maxGrowth,
        minUnemployment,
        maxUnemployment,
      });
    }
    return out;
  }

  const runs = careers();
  const mean = (pick: (r: (typeof runs)[number]) => number) =>
    runs.reduce((s, r) => s + pick(r), 0) / runs.length;

  it('has recessions — enough to be feared, not so many as to be routine', () => {
    /*
     * Counted in WEEKS now. Forty years is 2,080 of them, and a country
     * that spends two to eight per cent of four decades formally in
     * recession is behaving like a real one. Zero would make the model
     * decorative; a quarter of the time would make it unplayable.
     */
    const weeks = mean((r) => r.recessionMonths);
    expect(weeks).toBeGreaterThan(TURNS_PER_YEAR * 40 * 0.02);
    expect(weeks).toBeLessThan(TURNS_PER_YEAR * 40 * 0.08);
  });

  it('gives almost every career a bad year', () => {
    /* Not EVERY one. A government can be lucky, and a model in which forty
       years without a downturn is impossible is as wrong as one in which it
       is routine. */
    expect(runs.filter((r) => r.recessionMonths === 0).length).toBeLessThan(runs.length * 0.15);
  });

  it('moves unemployment by points, not by decimals', () => {
    /* The first version of this model swung unemployment by 0.8 points across
       forty years. Voters would not have noticed it, so neither would the
       game. */
    const swing = mean((r) => r.maxUnemployment - r.minUnemployment);
    expect(swing).toBeGreaterThan(1.4);
    expect(swing).toBeLessThan(9);
  });

  it('is asymmetric — downturns are sharper than upswings are euphoric', () => {
    /* Above capacity an economy runs out of people and parts. Below it, the
       people simply stay idle. */
    const worst = mean((r) => r.minGrowth);
    const best = mean((r) => r.maxGrowth);
    expect(worst).toBeLessThan(0);
    expect(best).toBeLessThan(9);
  });

  it('comes back to earth — no career ends somewhere absurd', () => {
    for (const r of runs) {
      finite(r.end);
      expect(r.end.gdp).toBeGreaterThan(0);
      expect(r.end.unemployment).toBeGreaterThan(0);
      expect(r.end.unemployment).toBeLessThan(30);
      expect(Math.abs(r.end.inflation)).toBeLessThan(30);
    }
  });
});
