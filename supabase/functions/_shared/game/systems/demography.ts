/**
 * demography.ts — the people.
 *
 * The slowest system in the game and the one with the longest reach. A birth
 * rate that moves now changes the workforce in twenty years and the pension
 * bill in sixty-five. No government serving a four-year term will see the
 * result of anything in this file.
 *
 * That is exactly why it is here. Every other system in the game pays out
 * inside a term or two, which means every other decision can be made
 * selfishly and still come out right. This one cannot. A player who funds
 * schools for the skills they produce, or who lets a region empty out
 * because its voters were never going to back them anyway, is making a
 * decision whose consequences land on somebody else entirely — and the game
 * should let them make it knowingly rather than hide the trade.
 *
 * The one place it bites inside a career is apportionment. Seats are
 * redistributed between regions once a term, so a government that presides
 * over people leaving Estmoor for Ternhill will find the electoral map it
 * won on is not the one it has to defend. That is slow enough to be fair and
 * fast enough to matter.
 */

import {
  AGE_RETIRED_START,
  IMPLIED_DEATH_RATE_START,
  AGE_WORKING_START,
  AGE_YOUTH_START,
  APPORTIONMENT_INTERVAL,
  BIRTH_RATE_PER_SERVICE,
  BIRTH_RATE_START,
  MIGRANT_RETIRED_SHARE,
  MIGRANT_WORKING_SHARE,
  MIGRANT_YOUTH_SHARE,
  PREMATURE_DEATH_RATE,
  YEARS_AS_YOUTH,
  YEARS_AT_WORK,
  DEMOGRAPHY_HISTORY_LIMIT,
  HOUSEHOLD_SIZE_START,
  LIFE_EXPECTANCY_PER_HEALTH,
  LIFE_EXPECTANCY_START,
  MIGRATION_ADJUST_RATE,
  MIGRATION_BASE,
  MIGRATION_JOBS_WEIGHT,
  MIGRATION_SERVICES_WEIGHT,
  MIN_REGION_SEATS,
  NATURAL_UNEMPLOYMENT,
  PARTICIPATION_ADJUST_RATE,
  PARTICIPATION_JOBS_WEIGHT,
  PARTICIPATION_START,
  POPULATION_START,
  SKILLS_ADJUST_RATE,
  SKILLS_SHORTAGE_WEIGHT,
  SKILLS_START,
  URBANISATION_DRIFT,
  URBANISATION_START,
  VITAL_RATE_ADJUST,
} from '../balance.ts';
import type {
  Demography,
  DemographyForecast,
  DemographyPoint,
  Region,
  RegionalPopulation,
} from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ *
 * Starting state
 * ------------------------------------------------------------------ */

export function buildDemography(regions: readonly Region[]): Demography {
  const totalSeats = regions.reduce((sum, r) => sum + r.seats, 0) || 1;
  const regional: RegionalPopulation[] = regions.map((region) => ({
    regionId: region.id,
    /* People are distributed as the seats are, because the seats were drawn
       to match them. Apportionment is what keeps that true. */
    population: POPULATION_START * (region.seats / totalSeats),
    netFlow: 0,
    urban: URBANISATION_START,
  }));

  const workforce = POPULATION_START * AGE_WORKING_START * PARTICIPATION_START;

  return {
    population: POPULATION_START,
    birthRate: BIRTH_RATE_START,
    deathRate: IMPLIED_DEATH_RATE_START,
    lifeExpectancy: LIFE_EXPECTANCY_START,
    youthShare: AGE_YOUTH_START,
    workingShare: AGE_WORKING_START,
    retiredShare: AGE_RETIRED_START,
    netMigration: MIGRATION_BASE,
    immigration: MIGRATION_BASE + 2.4,
    emigration: 2.4,
    urbanisation: URBANISATION_START,
    density: POPULATION_START / 0.42,
    householdSize: HOUSEHOLD_SIZE_START,
    participation: PARTICIPATION_START,
    workforce,
    skills: SKILLS_START,
    regional,
    history: [],
    lastApportionment: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Derived figures
 * ------------------------------------------------------------------ */

/**
 * Working-age people per retired person.
 *
 * The number that decides whether the pension and health bills are payable.
 * It is the single most consequential figure in this file and the one a
 * government can do least about inside a term.
 */
export function dependencyRatio(demography: Demography): number {
  return demography.retiredShare > 0
    ? demography.workingShare / demography.retiredShare
    : Infinity;
}

/** Annual growth in the labour force, %. What the economy's speed limit reads. */
export function workforceGrowth(previous: Demography, current: Demography): number {
  if (previous.workforce <= 0) return 0;
  return ((current.workforce - previous.workforce) / previous.workforce) * 100 * 12;
}

/**
 * How short the country is of the skills it needs, 0–1.
 *
 * Zero when the workforce has the training the economy is asking for.
 * Positive is a shortage, and it drags on exactly the industries that need
 * trained people — which is how a schools budget cut eight years ago becomes
 * a technology problem today.
 */
export function skillsShortage(demography: Demography): number {
  return Math.max(0, SKILLS_START - demography.skills);
}

/** Points of industry health lost to the shortage, for skill-hungry industries. */
export function skillsDrag(demography: Demography): number {
  const shortage = skillsShortage(demography);
  /* Guarded rather than computed straight, so a country with no shortage
     reports 0 and not -0. Negative zero compares equal to zero and prints
     as "-0", which is exactly the sort of thing that ends up on a panel. */
  return shortage > 0 ? -shortage * 100 * SKILLS_SHORTAGE_WEIGHT : 0;
}

/* ------------------------------------------------------------------ *
 * The month
 * ------------------------------------------------------------------ */

export interface DemographyInputs {
  /** Unemployment. People go where the work is. */
  unemployment: number;
  /** Health-sector health, which is what moves life expectancy. */
  healthQuality: number;
  /** Education-sector health, which is what moves skills. */
  educationQuality: number;
  /** Average public service quality, which moves births and arrivals. */
  serviceQuality: number;
  /** Jobs by region, from Engine 2D. People leave regions without work. */
  regionalJobs: Record<string, number>;
  turn: number;
}

/**
 * Advance the population by one month.
 *
 * Every rate here moves at a generational pace, deliberately. A player who
 * doubles the schools budget will see the skills figure move by hundredths
 * and will be out of office long before it arrives anywhere. The forecast is
 * the only way to see what they have actually done, which is the honest
 * shape of the thing.
 */
export function stepDemography(demography: Demography, inputs: DemographyInputs): Demography {
  /* 1. Vital rates, which follow the country's condition across decades. */
  const birthTarget =
    BIRTH_RATE_START + (inputs.serviceQuality - 60) * BIRTH_RATE_PER_SERVICE;
  const birthRate =
    demography.birthRate + (birthTarget - demography.birthRate) * VITAL_RATE_ADJUST;

  const lifeTarget =
    LIFE_EXPECTANCY_START + (inputs.healthQuality - 60) * LIFE_EXPECTANCY_PER_HEALTH * 12;
  const lifeExpectancy =
    demography.lifeExpectancy + (lifeTarget - demography.lifeExpectancy) * VITAL_RATE_ADJUST;

  /* 2. Migration. People go where there is work and where the services are. */
  const migrationTarget =
    MIGRATION_BASE +
    (NATURAL_UNEMPLOYMENT - inputs.unemployment) * MIGRATION_JOBS_WEIGHT +
    (inputs.serviceQuality - 60) * MIGRATION_SERVICES_WEIGHT;
  const netMigration =
    demography.netMigration + (migrationTarget - demography.netMigration) * MIGRATION_ADJUST_RATE;
  /* Arrivals and departures are tracked separately because they are argued
     about separately: a country can have record arrivals and record
     departures at once, and the net figure conceals the whole argument. */
  const emigration = Math.max(0.3, demography.emigration + (2.4 - demography.emigration) * 0.05);
  const immigration = Math.max(0, netMigration + emigration);

  /*
   * 3. The three cohorts, as a compartment model.
   *
   * Children become workers after eighteen years, workers become retired
   * after forty-seven more, and the retired die after however many years
   * past retirement the health service has bought them. That last term is
   * the loop worth having: a better health service means longer
   * retirements, which means more retired people, which means a larger
   * pension and health bill. The reward for succeeding at health policy is
   * a harder health budget.
   *
   * An earlier version of this tracked shares rather than people and added
   * every birth to the youth cohort without ever ageing anyone out of it.
   * Children accumulated forever: across twenty years the youth share
   * climbed from 20% to 38% while the working share collapsed from 62% to
   * 41%, and the workforce shrank 1.7% a year in a country with steady
   * births and positive net migration. Nothing about it was visible in any
   * single month.
   */
  const perMonth = (rate: number) => rate / 1000 / 12;
  const youth = demography.youthShare * demography.population;
  const working = demography.workingShare * demography.population;
  const retired = demography.retiredShare * demography.population;

  const births = demography.population * perMonth(birthRate);
  const migrants = demography.population * perMonth(netMigration);

  const comingOfAge = youth / (YEARS_AS_YOUTH * 12);
  const retiring = working / (YEARS_AT_WORK * 12);
  const retiredYears = Math.max(4, lifeExpectancy - YEARS_AS_YOUTH - YEARS_AT_WORK);
  const retiredDeaths = retired / (retiredYears * 12);
  const workingDeaths = working * perMonth(PREMATURE_DEATH_RATE);
  const youthDeaths = youth * perMonth(PREMATURE_DEATH_RATE * 0.2);

  const nextYouth = Math.max(
    0.01,
    youth + births - comingOfAge - youthDeaths + migrants * MIGRANT_YOUTH_SHARE,
  );
  const nextWorking = Math.max(
    0.01,
    working + comingOfAge - retiring - workingDeaths + migrants * MIGRANT_WORKING_SHARE,
  );
  const nextRetired = Math.max(
    0.01,
    retired + retiring - retiredDeaths + migrants * MIGRANT_RETIRED_SHARE,
  );

  const population = nextYouth + nextWorking + nextRetired;
  const youthShare = nextYouth / population;
  const workingShare = nextWorking / population;
  const retiredShare = nextRetired / population;

  /* The death rate is an OUTPUT of the cohorts rather than a setting of its
     own. Stating it independently is how the earlier version came to have a
     population whose deaths did not match its own age structure. */
  const deathRate = ((retiredDeaths + workingDeaths + youthDeaths) / population) * 1000 * 12;

  /* 4. Participation. Slow to rise, because people who left the labour force
        are slow to re-enter it even once the work comes back. */
  const participationTarget =
    PARTICIPATION_START + (NATURAL_UNEMPLOYMENT - inputs.unemployment) * PARTICIPATION_JOBS_WEIGHT;
  const participation = clamp(
    demography.participation +
      (participationTarget - demography.participation) * PARTICIPATION_ADJUST_RATE,
    0.4,
    0.85,
  );
  const workforce = nextWorking * participation;

  /* 6. Skills. The slowest thing in the file. */
  const skillsTarget = SKILLS_START + (inputs.educationQuality - 60) * 0.006;
  const skills = clamp(
    demography.skills + (skillsTarget - demography.skills) * SKILLS_ADJUST_RATE,
    0.2,
    0.95,
  );

  /* 7. Where the people are. They leave regions without work. */
  const regional = stepRegionalPopulation(demography.regional, inputs.regionalJobs, migrants);

  const urbanisation = clamp(
    demography.urbanisation + (URBANISATION_DRIFT / 12) * (1 - demography.urbanisation) * 4,
    0,
    0.96,
  );
  const householdSize = Math.max(
    1.6,
    HOUSEHOLD_SIZE_START - (retiredShare - AGE_RETIRED_START) * 2.2,
  );

  const point: DemographyPoint = {
    turn: inputs.turn,
    population,
    workforce,
    retiredShare,
    netMigration,
    lifeExpectancy,
  };

  return {
    population,
    birthRate,
    deathRate,
    lifeExpectancy,
    youthShare,
    workingShare,
    retiredShare,
    netMigration,
    immigration,
    emigration,
    urbanisation,
    density: population / 0.42,
    householdSize,
    participation,
    workforce,
    skills,
    regional,
    history: [...demography.history, point].slice(-DEMOGRAPHY_HISTORY_LIMIT),
    lastApportionment: demography.lastApportionment,
  };
}

/**
 * Move people between regions.
 *
 * Internal movement follows work: a region with a jobs shortfall loses
 * people to the regions that have some. The national net migration is then
 * distributed on top, weighted toward the regions that are already growing,
 * because that is where arrivals go.
 */
function stepRegionalPopulation(
  regional: readonly RegionalPopulation[],
  regionalJobs: Record<string, number>,
  nationalMigrants: number,
): RegionalPopulation[] {
  const pull = regional.map((r) => ({
    id: r.regionId,
    /* Positive pull attracts; negative repels. */
    value: regionalJobs[r.regionId] ?? 0,
  }));
  const totalPull = pull.reduce((sum, p) => sum + Math.exp(p.value / 6), 0);
  const totalPopulation = regional.reduce((sum, r) => sum + r.population, 0) || 1;

  /* Internal movement is zero-sum: everybody who leaves arrives somewhere. */
  const moved = regional.map((r) => {
    const jobs = regionalJobs[r.regionId] ?? 0;
    /* A tenth of a per cent a month at a ten-point shortfall — slow, and
       over a term it empties a region by three per cent. */
    return r.population * clamp(jobs / 10000, -0.0012, 0.0012);
  });
  const netMoved = moved.reduce((sum, m) => sum + m, 0);

  return regional.map((r, i) => {
    const share = Math.exp((pull[i]!.value ?? 0) / 6) / totalPull;
    const arrivals = nationalMigrants * share;
    /* Redistribute the rounding of internal movement by population, so the
       national total is conserved exactly. */
    const correction = -netMoved * (r.population / totalPopulation);
    const netFlow = moved[i]! + correction + arrivals;
    return {
      ...r,
      population: Math.max(0.05, r.population + netFlow),
      netFlow: netFlow * 1000,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Apportionment
 * ------------------------------------------------------------------ */

export function isApportionmentDue(demography: Demography, turn: number): boolean {
  return turn - demography.lastApportionment >= APPORTIONMENT_INTERVAL;
}

export interface Apportionment {
  regionId: string;
  before: number;
  after: number;
}

/**
 * Redistribute the seats to match where the people now are.
 *
 * Largest remainder against population, with a floor so no region is written
 * out of the chamber entirely. The total is conserved, so every seat a
 * shrinking region loses is one a growing region gains — and the government
 * that presided over the movement has to fight the next election on a map it
 * did not draw.
 */
export function apportionSeats(
  regions: readonly Region[],
  regional: readonly RegionalPopulation[],
): Apportionment[] {
  const total = regions.reduce((sum, r) => sum + r.seats, 0);
  const people = regional.reduce((sum, r) => sum + r.population, 0) || 1;

  const quotas = regions.map((region) => {
    const pop = regional.find((r) => r.regionId === region.id)?.population ?? 0;
    return { region, quota: (pop / people) * total };
  });

  const seats = quotas.map((q) => ({
    regionId: q.region.id,
    before: q.region.seats,
    after: Math.max(MIN_REGION_SEATS, Math.floor(q.quota)),
    remainder: q.quota - Math.floor(q.quota),
  }));

  /* Hand out what the floors and the flooring left over, largest remainder
     first — the same rule the seat allocation uses, for the same reason. */
  let assigned = seats.reduce((sum, s) => sum + s.after, 0);
  const order = [...seats].sort((a, b) => b.remainder - a.remainder);
  let i = 0;
  while (assigned < total && order.length > 0) {
    order[i % order.length]!.after += 1;
    assigned += 1;
    i += 1;
  }
  /* And take back any the floors forced us over by, from the largest first. */
  const bySize = [...seats].sort((a, b) => b.after - a.after);
  let j = 0;
  while (assigned > total && bySize.length > 0) {
    const target = bySize[j % bySize.length]!;
    if (target.after > MIN_REGION_SEATS) {
      target.after -= 1;
      assigned -= 1;
    }
    j += 1;
    if (j > total * 4) break;
  }

  return seats.map(({ regionId, before, after }) => ({ regionId, before, after }));
}

/* ------------------------------------------------------------------ *
 * Forecasting
 * ------------------------------------------------------------------ */

/**
 * Where the population goes if nothing changes.
 *
 * The only way to see what a decision about schools or health has actually
 * done, because nothing in this file moves fast enough to show up inside a
 * term. Runs the same monthly step, so it cannot disagree with what happens.
 */
export function forecastDemography(
  demography: Demography,
  inputs: DemographyInputs,
  horizon = 240,
): DemographyForecast {
  const months: DemographyPoint[] = [];
  let current = demography;
  for (let i = 1; i <= horizon; i += 1) {
    current = stepDemography(current, { ...inputs, turn: inputs.turn + i });
    months.push(current.history[current.history.length - 1]!);
  }

  return {
    months,
    endPopulation: current.population,
    endRetiredShare: current.retiredShare,
    endDependencyRatio: dependencyRatio(current),
  };
}
