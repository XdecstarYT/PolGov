/**
 * economy.ts — the macroeconomy.
 *
 * The government does not set growth, inflation, unemployment or the policy
 * rate. It sets a budget and a tax code, and then lives in the economy those
 * produce. That gap is the whole point of the module: the most consequential
 * numbers on the player's own briefing are ones they can only influence,
 * slowly, at a cost, and with a lag long enough that the credit or the blame
 * often lands on somebody else.
 *
 * The model is the standard three-equation one:
 *
 *   IS curve       output responds to the real interest rate, confidence and
 *                  the fiscal stance
 *   Phillips curve inflation responds to how tight the labour market is, plus
 *                  what people already expect inflation to be
 *   Taylor rule    the central bank moves the policy rate against inflation
 *                  and the output gap — and it moves against the government
 *                  as readily as with it
 *
 * That last one is the mechanism that makes fiscal policy feel real. Stimulus
 * works. It also closes the output gap, which raises inflation, which raises
 * the policy rate, which raises debt service and slows the economy back down.
 * Nothing in here punishes the player for spending; the model simply charges
 * for it, later, the way the world does.
 *
 * Okun's law joins output to jobs, and jobs are what the electorate actually
 * feels, so the chain from a budget decision to a vote is: funding → deficit
 * → output gap → unemployment → issue score → satisfaction → seats. Every
 * link is inspectable and every link has a lag.
 *
 * Everything here is pure. `stepEconomy` takes a state and returns a new one,
 * which is what lets `forecastEconomy` run the identical function twelve
 * times to produce a Treasury forecast that cannot disagree with the month
 * it is forecasting — it can only be wrong about what the world does next,
 * which is the only thing forecasts are ever wrong about.
 */

import {
  BOOM_OUTPUT_GAP,
  CONFIDENCE_ADJUST_RATE,
  CONFIDENCE_APPROVAL_WEIGHT,
  CONFIDENCE_GROWTH_WEIGHT,
  CONFIDENCE_INFLATION_WEIGHT,
  CONFIDENCE_START,
  CONFIDENCE_UNEMPLOYMENT_WEIGHT,
  CONTRACTION_THRESHOLD,
  CYCLE_DEMAND_NOISE,
  CYCLE_PERSISTENCE,
  CYCLE_SUPPLY_NOISE,
  ECONOMY_HISTORY_LIMIT,
  FORECAST_HORIZON,
  GDP_START,
  GROWTH_ADJUST_RATE,
  HOUSEHOLD_INCOME_SHARE,
  INFLATION_PERSISTENCE,
  INFLATION_TARGET,
  INVESTMENT_CONFIDENCE_WEIGHT,
  INVESTMENT_RATE_WEIGHT,
  INVESTMENT_SHARE_BASE,
  IS_CONFIDENCE_WEIGHT,
  IS_FISCAL_MULTIPLIER,
  IS_TRADE_WEIGHT,
  IS_REAL_RATE_WEIGHT,
  NATURAL_UNEMPLOYMENT,
  NEUTRAL_REAL_RATE,
  OKUN_COEFFICIENT,
  OUTPUT_GAP_BOOM_DAMPING,
  OUTPUT_GAP_CLOSE_RATE,
  PHILLIPS_SLACK_DAMPING,
  PHILLIPS_SLOPE,
  POLICY_RATE_CEILING,
  POLICY_RATE_FLOOR,
  POLICY_RATE_MAX_STEP,
  POLICY_RATE_NEUTRAL,
  POTENTIAL_GROWTH_BASE,
  PRODUCTIVITY_DRIFT_RATE,
  PRODUCTIVITY_START,
  PRODUCTIVITY_TO_GROWTH,
  RECESSION_TURNS,
  REVENUE_GDP_SHARE,
  SAVINGS_CONFIDENCE_WEIGHT,
  SAVINGS_RATE_BASE,
  SAVINGS_RATE_MAX,
  SAVINGS_RATE_MIN,
  SAVINGS_RATE_WEIGHT,
  SLUMP_OUTPUT_GAP,
  TAYLOR_INFLATION_WEIGHT,
  TAYLOR_OUTPUT_WEIGHT,
  UNEMPLOYMENT_ADJUST_RATE,
  WAGE_ADJUST_RATE,
  WAGE_TIGHTNESS_WEIGHT,
  TURNS_PER_YEAR,
} from '../balance.ts';
import type {
  CyclePhase,
  Economy,
  EconomyForecast,
  EconomyPoint,
  EconomicShock,
} from '../types.ts';

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/* ------------------------------------------------------------------ *
 * Starting state
 * ------------------------------------------------------------------ */

/**
 * An economy at rest: on trend, on target, at the natural rate.
 *
 * Deliberately boring. A run should start with nothing wrong that the player
 * did not cause or inherit through an event, so that the first thing that
 * goes wrong is legible as a consequence rather than as the initial
 * conditions catching up.
 */
export function buildEconomy(): Economy {
  return {
    gdp: GDP_START,
    potentialGdp: GDP_START,
    growth: POTENTIAL_GROWTH_BASE,
    potentialGrowth: POTENTIAL_GROWTH_BASE,
    outputGap: 0,
    productivity: PRODUCTIVITY_START,

    inflation: INFLATION_TARGET,
    inflationExpectation: INFLATION_TARGET,
    unemployment: NATURAL_UNEMPLOYMENT,
    employment: 100 - NATURAL_UNEMPLOYMENT,
    wageGrowth: INFLATION_TARGET + POTENTIAL_GROWTH_BASE * 0.5,
    policyRate: POLICY_RATE_NEUTRAL,

    consumerConfidence: CONFIDENCE_START,
    businessConfidence: CONFIDENCE_START,

    householdSpending: GDP_START * HOUSEHOLD_INCOME_SHARE * (1 - SAVINGS_RATE_BASE / 100),
    householdSavingsRate: SAVINGS_RATE_BASE,
    investment: GDP_START * INVESTMENT_SHARE_BASE,

    phase: 'expansion',
    cycleMomentum: 0,
    priceMomentum: 0,
    contractionRun: 0,
    expansionRun: 0,

    shocks: [],
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Shocks
 * ------------------------------------------------------------------ */

/**
 * How much of a shock is still biting.
 *
 * Linear decay from full weight on arrival to nothing on expiry. A shock's
 * worst month is its first, which is both true to life and the right shape
 * for play: the crisis is loudest when you have least information about it.
 */
export function shockWeight(shock: EconomicShock): number {
  if (shock.duration <= 0) return 0;
  return clamp(shock.remaining / shock.duration, 0, 1);
}

function shockTotals(shocks: readonly EconomicShock[]) {
  let growth = 0;
  let inflation = 0;
  let confidence = 0;
  for (const shock of shocks) {
    const w = shockWeight(shock);
    growth += shock.growthImpulse * w;
    inflation += shock.inflationImpulse * w;
    confidence += shock.confidenceImpulse * w;
  }
  return { growth, inflation, confidence };
}

/** Age every shock by a month and drop the spent ones. */
function ageShocks(shocks: readonly EconomicShock[]): EconomicShock[] {
  return shocks
    .map((s) => ({ ...s, remaining: s.remaining - 1 }))
    .filter((s) => s.remaining > 0);
}

/** Add a shock, replacing any earlier one with the same id. */
export function applyShock(economy: Economy, shock: EconomicShock): Economy {
  return {
    ...economy,
    shocks: [...economy.shocks.filter((s) => s.id !== shock.id), shock],
  };
}

/* ------------------------------------------------------------------ *
 * The three equations
 * ------------------------------------------------------------------ */

/** The real interest rate: what borrowing actually costs after inflation. */
export function realRate(economy: Economy): number {
  return economy.policyRate - economy.inflationExpectation;
}

/**
 * Trend growth.
 *
 * Productivity is the only thing that raises a country's speed limit, and it
 * is raised by education and infrastructure, which are budget lines with a
 * payoff measured in years. This is the game's one genuinely long lever, and
 * it is deliberately the slowest.
 */
export function potentialGrowth(productivity: number, workforceGrowth = 0): number {
  return (
    POTENTIAL_GROWTH_BASE +
    (productivity - PRODUCTIVITY_START) * PRODUCTIVITY_TO_GROWTH +
    workforceGrowth
  );
}

/**
 * The IS curve: the growth rate the economy is being pushed toward.
 *
 * Four terms, in the order they matter:
 *   · trend, which is where it ends up absent everything else
 *   · the output gap closing, because booms and slumps both exhaust
 *   · the real rate against neutral, which is the central bank's grip
 *   · confidence and the fiscal stance, which are the two things a
 *     government can actually move
 */
export function targetGrowth(
  economy: Economy,
  fiscalImpulse: number,
  workforceGrowth = 0,
  demandNoise = 0,
  tradeImpulse = 0,
): number {
  const trend = potentialGrowth(economy.productivity, workforceGrowth);
  /* A boom exhausts faster than a slump heals: above capacity you run out of
     people and parts, below it you merely have people sitting idle. */
  const gapDamping =
    OUTPUT_GAP_CLOSE_RATE * (economy.outputGap > 0 ? OUTPUT_GAP_BOOM_DAMPING : 1);
  const gapTerm = -economy.outputGap * gapDamping * 12;
  const rateTerm = -(realRate(economy) - NEUTRAL_REAL_RATE) * IS_REAL_RATE_WEIGHT;
  const confidence = (economy.consumerConfidence + economy.businessConfidence) / 2;
  const confidenceTerm = (confidence - 50) * IS_CONFIDENCE_WEIGHT;
  /* Deficit as a share of output, annualised, in percentage points. */
  const deficitShare =
    economy.gdp > 0 ? ((fiscalImpulse * TURNS_PER_YEAR) / economy.gdp) * 100 : 0;
  const fiscalTerm = deficitShare * IS_FISCAL_MULTIPLIER;
  const { growth: shockTerm } = shockTotals(economy.shocks);

  /* NX. A small term in a normal year and the whole story in a trade war. */
  const tradeTerm = tradeImpulse * IS_TRADE_WEIGHT;

  return (
    trend + gapTerm + rateTerm + confidenceTerm + fiscalTerm + tradeTerm + shockTerm + demandNoise
  );
}

/**
 * The Phillips curve: the inflation rate prices are heading for.
 *
 * Expectations do most of the work, which is why inflation is hard to get
 * out of once it is in — and why the central bank reacts to it as sharply as
 * it does.
 */
export function targetInflation(economy: Economy, supplyNoise = 0): number {
  /* Slack pushes prices down far more weakly than tightness pushes them up:
     firms stop hiring long before they cut wages, and cut wages long before
     they cut prices. The flat bottom of the curve. */
  const gap = NATURAL_UNEMPLOYMENT - economy.unemployment;
  const tightness = gap < 0 ? gap * PHILLIPS_SLACK_DAMPING : gap;
  const { inflation: shockTerm } = shockTotals(economy.shocks);
  return (
    economy.inflationExpectation * INFLATION_PERSISTENCE +
    INFLATION_TARGET * (1 - INFLATION_PERSISTENCE) +
    tightness * PHILLIPS_SLOPE +
    shockTerm +
    supplyNoise
  );
}

/**
 * The Taylor rule: what the central bank wants the policy rate to be.
 *
 * It is not the government's instrument and the government cannot argue with
 * it. A player who stimulates into a closed output gap will watch this number
 * climb, and will pay for it twice — once in growth and once in debt service.
 */
export function taylorRate(economy: Economy): number {
  return clamp(
    POLICY_RATE_NEUTRAL +
      (economy.inflation - INFLATION_TARGET) * TAYLOR_INFLATION_WEIGHT +
      economy.outputGap * TAYLOR_OUTPUT_WEIGHT,
    POLICY_RATE_FLOOR,
    POLICY_RATE_CEILING,
  );
}

/* ------------------------------------------------------------------ *
 * The cycle
 * ------------------------------------------------------------------ */

/**
 * Name the phase of the cycle.
 *
 * A recession is a quarter of consecutive contraction — an explicit rule,
 * stated the way a statistician would state it, rather than a vibe. The
 * player can see the run building before it is declared, which is the whole
 * tension of the thing.
 */
export function classifyCycle(
  growth: number,
  outputGap: number,
  contractionRun: number,
): CyclePhase {
  if (contractionRun >= RECESSION_TURNS) return 'recession';
  if (growth <= CONTRACTION_THRESHOLD) return 'slowdown';
  if (outputGap <= SLUMP_OUTPUT_GAP) return 'recovery';
  if (outputGap >= BOOM_OUTPUT_GAP) return 'peak';
  return 'expansion';
}

export function isRecession(economy: Economy): boolean {
  return economy.phase === 'recession';
}

export function isBoom(economy: Economy): boolean {
  return economy.outputGap >= BOOM_OUTPUT_GAP;
}

/* ------------------------------------------------------------------ *
 * One month
 * ------------------------------------------------------------------ */

export interface EconomyInputs {
  /**
   * The deficit this month, ₡bn. Positive is a deficit, which is stimulus;
   * negative is a surplus, which is a drag. Passed in rather than derived so
   * the forecast can hold it constant and ask "what if we changed nothing".
   */
  fiscalImpulse: number;
  /** Government approval, which business confidence reads as stability. */
  approval: number;
  /**
   * Where productivity is being pulled, 0–100 style index. Education and
   * infrastructure set this; it is the slow lever.
   */
  productivityTarget: number;
  /** Annual growth in the workforce, %. Engine 2E supplies this. */
  workforceGrowth?: number;
  /**
   * What the tax code does beyond raising money.
   *
   * Separate from the fiscal impulse on purpose: the impulse is about how
   * much the government is injecting, and this is about what the shape of
   * the code does to the people it falls on. A revenue-neutral shift from
   * corporate tax to land tax has no impulse at all and still moves
   * investment, which is exactly the kind of decision worth making.
   */
  taxEffects?: { investment: number; consumption: number; prices: number };
  /**
   * What the industry mix is doing to jobs, in points, beyond what the
   * output gap alone implies.
   *
   * Okun's law cannot tell a downturn concentrated in retail — a ninth of
   * the workforce — from the same downturn in mining, which is a sixtieth of
   * it. Engine 2D can, and this is how it says so.
   */
  employmentGap?: number;
  /**
   * Net exports as a share of output, in points of annual growth.
   *
   * The open-economy term the textbooks put at the end of Y = C + I + G + NX
   * and most games leave out entirely. It is here because a trade war is a
   * contractionary policy that no chancellor announced and no chamber voted
   * for, and the player should be able to watch it arrive.
   */
  tradeImpulse?: number;
  /**
   * What tariffs are doing to the price level, in points of annual
   * inflation. Paid at the border, felt at the till.
   */
  importPrices?: number;
  /** The turn being resolved, for the history record. */
  turn: number;
  /**
   * This month's weather, each roughly in [-1, 1].
   *
   * Drawn from the game's seeded RNG by the turn resolution, so a replayed
   * turn produces the identical month. Left at zero by `forecastEconomy`,
   * which is what makes a forecast the model's honest expectation rather
   * than a prediction: it says where things go if nothing unusual happens,
   * and something unusual always happens.
   */
  noise?: { demand: number; supply: number };
}

/**
 * Advance the economy by one month.
 *
 * Order matters and is deliberate: productivity and potential first (they are
 * the slowest and everything else is measured against them), then output,
 * then jobs, then prices, then the central bank's response, then the
 * household and business aggregates that follow from all of it. Each step
 * reads the values the previous one produced, so a single month is internally
 * consistent rather than a set of independent nudges.
 */
export function stepEconomy(economy: Economy, inputs: EconomyInputs): Economy {
  /*
   * This month is lived at the shocks' CURRENT weight; they are aged at the
   * end of it. Ageing first would silently discard any one-month shock — it
   * would decay to nothing before it had been felt, and a sharp, short crisis
   * is precisely the kind the game most wants to be able to deliver.
   */
  const active = economy.shocks;
  const shocks = ageShocks(active);

  /* 1. Productivity drifts toward what the country's schools and
        infrastructure support. Slowly — this is a decade-long lever. */
  const productivity =
    economy.productivity +
    (inputs.productivityTarget - economy.productivity) * PRODUCTIVITY_DRIFT_RATE;

  const workforceGrowth = inputs.workforceGrowth ?? 0;
  const trend = potentialGrowth(productivity, workforceGrowth);

  /* 2. Output. Growth eases toward what the IS curve implies rather than
        jumping to it, because real economies have momentum. */
  /* The cycle carries, then this month's weather is added to it. */
  const cycleMomentum =
    economy.cycleMomentum * CYCLE_PERSISTENCE + (inputs.noise?.demand ?? 0) * CYCLE_DEMAND_NOISE;
  const priceMomentum =
    economy.priceMomentum * CYCLE_PERSISTENCE + (inputs.noise?.supply ?? 0) * CYCLE_SUPPLY_NOISE;
  const wanted = targetGrowth(
    economy,
    inputs.fiscalImpulse,
    workforceGrowth,
    cycleMomentum,
    inputs.tradeImpulse ?? 0,
  );
  /*
   * Clamped because nothing real goes past here, and because without it an
   * absurd input runs away: a fiscal impulse of several times national
   * output drove growth so far negative that output went negative, the
   * output gap went to infinity and every figure downstream became NaN. A
   * guard rather than a mechanic — no reachable policy gets near it.
   */
  const growth = clamp(
    economy.growth + (wanted - economy.growth) * GROWTH_ADJUST_RATE,
    -40,
    40,
  );

  const gdp = Math.max(1, economy.gdp * (1 + growth / 100 / TURNS_PER_YEAR));
  const potentialGdp = Math.max(
    1,
    economy.potentialGdp * (1 + trend / 100 / TURNS_PER_YEAR),
  );
  const outputGap = clamp(((gdp - potentialGdp) / potentialGdp) * 100, -60, 60);

  /* 3. Jobs. Okun's law, with stickiness — hiring and firing both lag. */
  const impliedUnemployment =
    NATURAL_UNEMPLOYMENT - outputGap * OKUN_COEFFICIENT - (inputs.employmentGap ?? 0) * 0.55;
  const unemployment = clamp(
    economy.unemployment +
      (impliedUnemployment - economy.unemployment) * UNEMPLOYMENT_ADJUST_RATE,
    0.4,
    35,
  );

  /* 4. Prices. Computed against the labour market we just produced. */
  const priced: Economy = { ...economy, unemployment, outputGap };
  const wantedInflation = targetInflation(
    priced,
    /* Tariffs are a supply shock a government chose. They sit here with the
       weather and the tax code, because that is what they are. */
    priceMomentum + (inputs.taxEffects?.prices ?? 0) + (inputs.importPrices ?? 0),
  );
  const inflation = economy.inflation + (wantedInflation - economy.inflation) * 0.45;
  /* Expectations follow realised inflation, which is why it is sticky. */
  const inflationExpectation =
    economy.inflationExpectation * INFLATION_PERSISTENCE +
    inflation * (1 - INFLATION_PERSISTENCE);

  /* 5. Wages chase prices plus productivity, faster when labour is scarce. */
  const tightness = NATURAL_UNEMPLOYMENT - unemployment;
  const wantedWages =
    inflation + (productivity - PRODUCTIVITY_START) * 0.02 + tightness * WAGE_TIGHTNESS_WEIGHT;
  const wageGrowth = economy.wageGrowth + (wantedWages - economy.wageGrowth) * WAGE_ADJUST_RATE;

  /* 6. The central bank. It moves in steps and it is not asking. */
  const banked: Economy = { ...priced, inflation, outputGap };
  const wantedRate = taylorRate(banked);
  const policyRate = clamp(
    economy.policyRate +
      clamp(wantedRate - economy.policyRate, -POLICY_RATE_MAX_STEP, POLICY_RATE_MAX_STEP),
    POLICY_RATE_FLOOR,
    POLICY_RATE_CEILING,
  );

  /* 7. Confidence, which reads everything above and feeds back into it
        next month — the loop that turns a bad quarter into a bad year. */
  const { confidence: confidenceShock } = shockTotals(active);
  const consumerTarget = clamp(
    50 -
      (unemployment - NATURAL_UNEMPLOYMENT) * CONFIDENCE_UNEMPLOYMENT_WEIGHT -
      Math.abs(inflation - INFLATION_TARGET) * CONFIDENCE_INFLATION_WEIGHT +
      confidenceShock,
    0,
    100,
  );
  const businessTarget = clamp(
    50 +
      growth * CONFIDENCE_GROWTH_WEIGHT -
      (realRate({ ...banked, policyRate } as Economy) - NEUTRAL_REAL_RATE) * 2.1 +
      (inputs.approval - 50) * CONFIDENCE_APPROVAL_WEIGHT +
      confidenceShock,
    0,
    100,
  );
  const consumerConfidence =
    economy.consumerConfidence +
    (consumerTarget - economy.consumerConfidence) * CONFIDENCE_ADJUST_RATE;
  const businessConfidence =
    economy.businessConfidence +
    (businessTarget - economy.businessConfidence) * CONFIDENCE_ADJUST_RATE;

  /* 8. Households and firms. Saving rises when people are frightened or
        when it pays to; investment falls when borrowing costs more. */
  const householdSavingsRate = clamp(
    SAVINGS_RATE_BASE +
      (50 - consumerConfidence) * SAVINGS_CONFIDENCE_WEIGHT +
      (policyRate - inflationExpectation - NEUTRAL_REAL_RATE) * SAVINGS_RATE_WEIGHT,
    SAVINGS_RATE_MIN,
    SAVINGS_RATE_MAX,
  );
  const householdIncome = gdp * HOUSEHOLD_INCOME_SHARE;
  const householdSpending =
    householdIncome * (1 - householdSavingsRate / 100) * (1 + (inputs.taxEffects?.consumption ?? 0) / 100);
  const investmentShare = clamp(
    INVESTMENT_SHARE_BASE +
      (businessConfidence - 50) * INVESTMENT_CONFIDENCE_WEIGHT -
      (policyRate - inflationExpectation - NEUTRAL_REAL_RATE) * INVESTMENT_RATE_WEIGHT +
      (inputs.taxEffects?.investment ?? 0) / 100,
    0.08,
    0.38,
  );
  const investment = gdp * investmentShare;

  /* 9. Name the phase, after everything that decides it has settled. */
  const contractionRun = growth <= CONTRACTION_THRESHOLD ? economy.contractionRun + 1 : 0;
  const expansionRun = outputGap >= BOOM_OUTPUT_GAP ? economy.expansionRun + 1 : 0;
  const phase = classifyCycle(growth, outputGap, contractionRun);

  const point: EconomyPoint = {
    turn: inputs.turn,
    gdp,
    growth,
    inflation,
    unemployment,
    policyRate,
    outputGap,
  };

  return {
    gdp,
    potentialGdp,
    growth,
    potentialGrowth: trend,
    outputGap,
    productivity,
    inflation,
    inflationExpectation,
    unemployment,
    employment: 100 - unemployment,
    wageGrowth,
    policyRate,
    consumerConfidence,
    businessConfidence,
    householdSpending,
    householdSavingsRate,
    investment,
    phase,
    cycleMomentum,
    priceMomentum,
    contractionRun,
    expansionRun,
    shocks,
    history: [...economy.history, point].slice(-ECONOMY_HISTORY_LIMIT),
  };
}

/* ------------------------------------------------------------------ *
 * Forecasting
 * ------------------------------------------------------------------ */

/**
 * Where the economy goes if nothing new happens.
 *
 * This runs `stepEconomy` — the same function the turn resolution runs, not a
 * simplified copy of it — so the forecast is exactly the model's own belief.
 * It will still be wrong, because shocks arrive and the player changes the
 * budget, and that is the correct behaviour: a forecast that came true would
 * be a promise, and the game does not make promises.
 */
export function forecastEconomy(
  economy: Economy,
  inputs: EconomyInputs,
  horizon = FORECAST_HORIZON,
): EconomyForecast {
  const months: EconomyPoint[] = [];
  let current = economy;
  for (let i = 1; i <= horizon; i += 1) {
    current = stepEconomy(current, { ...inputs, turn: inputs.turn + i });
    months.push(current.history[current.history.length - 1]!);
  }

  const averageGrowth = months.reduce((s, m) => s + m.growth, 0) / Math.max(1, months.length);
  const averageInflation =
    months.reduce((s, m) => s + m.inflation, 0) / Math.max(1, months.length);

  return {
    months,
    averageGrowth,
    averageInflation,
    endUnemployment: months[months.length - 1]?.unemployment ?? economy.unemployment,
    recessionInHorizon: months.some((m) => m.growth <= CONTRACTION_THRESHOLD),
  };
}

/* ------------------------------------------------------------------ *
 * What the rest of the game reads off the economy
 * ------------------------------------------------------------------ */

/**
 * Tax revenue this month, ₡bn.
 *
 * A share of output rather than a flat figure, which is what makes a slump
 * compound: the month unemployment rises is also the month revenue falls and
 * the deficit widens on its own, before the government has decided anything.
 */
export function computeRevenueFromGdp(gdp: number, revenueModifier: number): number {
  return (gdp / TURNS_PER_YEAR) * REVENUE_GDP_SHARE + revenueModifier;
}

/**
 * The 0–100 "jobs and the economy" score the electorate judges.
 *
 * Voters do not read GDP. They read whether there is work, whether wages are
 * keeping up with prices, and whether things feel like they are getting
 * better — so that is what this is made of, in that order of weight.
 */
export function economyIssueScore(economy: Economy): number {
  const jobs = 50 - (economy.unemployment - NATURAL_UNEMPLOYMENT) * 7.5;
  const realWages = (economy.wageGrowth - economy.inflation) * 6;
  const direction = economy.growth * 4;
  return clamp(jobs * 0.55 + (50 + realWages) * 0.25 + (50 + direction) * 0.2, 0, 100);
}

/**
 * The 0–100 cost-of-living score.
 *
 * Inflation is felt as the gap between what wages do and what prices do, not
 * as the CPI print — a country with 6% inflation and 8% wage growth is not
 * having a cost-of-living crisis, and one with 2% and 0% is.
 */
export function costOfLivingScore(economy: Economy, taxBurden: number): number {
  const realWageGrowth = economy.wageGrowth - economy.inflation;
  return clamp(
    55 + realWageGrowth * 7 - Math.max(0, economy.inflation - INFLATION_TARGET) * 3.5 - taxBurden,
    0,
    100,
  );
}

/**
 * Where productivity is being pulled, given how good the schools and the
 * infrastructure are.
 *
 * Both at 60 — the level baseline funding buys — holds productivity at 100.
 * Getting it meaningfully above that means sustained over-funding of two
 * sectors whose payoff arrives years after the election that funded them,
 * which is exactly the trade the game wants to put in front of the player.
 */
export function productivityTarget(educationHealth: number, infrastructureHealth: number): number {
  return PRODUCTIVITY_START + (educationHealth - 60) * 0.32 + (infrastructureHealth - 60) * 0.24;
}

/** A plain-language read of the cycle, for the briefing. */
export function describeCycle(economy: Economy): string {
  switch (economy.phase) {
    case 'recession':
      return `In recession — ${economy.contractionRun} straight weeks of contraction.`;
    case 'slowdown':
      return economy.contractionRun > 0
        ? `Contracting. ${RECESSION_TURNS - economy.contractionRun} more weeks like this and it is a recession.`
        : 'Growth has stalled.';
    case 'recovery':
      return 'Recovering, but still well below capacity.';
    case 'peak':
      return 'Running hot. The bank will be watching this.';
    default:
      return 'Growing at about its normal rate.';
  }
}
