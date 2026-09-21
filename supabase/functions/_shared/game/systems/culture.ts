/**
 * culture.ts — what holds a country together, and what it costs to let go.
 *
 * Three mechanics, each of which is slow enough that a government can do
 * real damage to it and leave before the damage is visible.
 *
 * NATIONAL IDENTITY is a stock. It is built by things people share — a
 * broadcaster everybody watches, a team everybody follows, an occasion
 * everybody marks — and it is eroded by things that divide: a widening
 * distribution, a countryside falling behind, a politics conducted as a
 * war. It cannot be bought quickly and it cannot be legislated at all. A
 * government that runs it down is usually not the government that
 * discovers the bill.
 *
 * BELONGING is the same stock measured per community, and it comes apart
 * from the national figure. A country can report high identity and
 * contain a community that does not feel part of it, and that gap is the
 * single most reliable predictor in this engine of a movement forming
 * later. Recognition — whether the state conducts itself in a way that
 * includes you — moves it more than money does.
 *
 * POLITICAL CULTURE is the set of things everyone does because they are
 * done, not because they are enforced: conceding, resigning, obeying a
 * court. It is modelled as a stock for one reason — it is the thing that
 * has to be gone before a constitutional crisis is possible, and a game
 * where that arrives as a random event rather than as a consequence would
 * be lying about how it happens.
 *
 * Pride and patriotism are kept separate throughout. Patriotism is
 * attachment and barely moves; pride is satisfaction with how the country
 * is doing and moves constantly. Governments routinely mistake a fall in
 * the second for a fall in the first.
 */

import {
  BELONGING_ADJUST_RATE,
  BELONGING_ALARM,
  IDENTITY_ADJUST_RATE,
  INSTITUTION_DECAY_SCALE,
  NORMS_ADJUST_RATE,
  NORMS_START,
  PRIDE_ADJUST_RATE,
  SECULARISATION_PER_YEAR,
  TURNS_PER_YEAR,
} from '../balance.ts';
import {
  COMMUNITY_LABELS,
  CULTURAL_INSTITUTION_TEMPLATES,
  findCulturalInstitution,
  type CompositionProfile,
  type CulturalInstitutionKey,
} from '../content/culture.ts';
import type { CulturalCommunity, CulturalInstitution, Culture } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);
const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildCulture(
  composition: CompositionProfile,
  culturalSpend: number,
): Culture {
  const total = composition.shares.reduce((a, b) => a + b, 0) || 1;
  const shares = composition.shares.map((s) => s / total);

  const communities: CulturalCommunity[] = shares.map((share, i) => ({
    id: `community-${i + 1}`,
    label: COMMUNITY_LABELS[Math.min(i, COMMUNITY_LABELS.length - 1)]!,
    share,
    /*
     * The largest community's arrangements are the default, so it is
     * recognised without anybody having to decide to. Everyone else is
     * recognised to the extent the state has bothered, which at the start
     * of a run is whatever a previous government left behind.
     */
    recognition: i === 0 ? 100 : clamp100(100 - composition.majorityDefault * 62),
    belonging: i === 0 ? 78 : clamp100(78 - composition.majorityDefault * 26),
  }));

  const institutions: CulturalInstitution[] = CULTURAL_INSTITUTION_TEMPLATES.map((t) => ({
    key: t.key,
    funding: culturalSpend * t.share,
    reach: t.reach * 100 * 0.82,
    vitality: 64,
  }));

  /* A country where one community's customs are simply the national ones
     has an easier time telling a single story about itself, and a harder
     time including everybody in it. Both halves are real. */
  const plurality = 1 - shares[0]!;

  return {
    nationalIdentity: clamp100(70 - plurality * 22),
    regionalIdentity: clamp100(44 + plurality * 20),
    communities,
    languagePolicy: clamp100(100 - composition.majorityDefault * 70),
    traditionStrength: 62,
    religiosity: 46,
    secularisation: SECULARISATION_PER_YEAR,
    festivals: 8,
    institutions,
    youthDivergence: 22,
    politicalCulture: NORMS_START,
    patriotism: 66,
    nationalPride: 62,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

export function institutionOf(culture: Culture, key: CulturalInstitutionKey): CulturalInstitution {
  const found = culture.institutions.find((i) => i.key === key);
  if (!found) throw new Error(`culture: no institution ${key}`);
  return found;
}

/**
 * How much of the country the cultural institutions between them touch.
 *
 * Not a sum — people overlap, and the same household that goes to the
 * football also uses the library. Combined as independent probabilities,
 * which is the honest way to add reach.
 */
export function culturalReach(culture: Culture): number {
  let missed = 1;
  for (const institution of culture.institutions) {
    missed *= 1 - (institution.reach / 100) * (institution.vitality / 100);
  }
  return (1 - missed) * 100;
}

/** The community that feels least part of the country. */
export function leastIncluded(culture: Culture): CulturalCommunity {
  return culture.communities.reduce((a, b) => (b.belonging < a.belonging ? b : a));
}

/**
 * How far belonging varies between communities, points.
 *
 * Worst to best, ignoring size. This says how badly the least-included
 * community is doing and nothing about how many people that is.
 */
export function belongingGap(culture: Culture): number {
  const values = culture.communities.map((c) => c.belonging);
  return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
}

/**
 * The share-weighted mean of belonging — how attached the country is overall.
 *
 * Kept alongside the gap because the two answer different questions and
 * both are needed. A country where one community in fifty is poorly
 * included has a wide gap and high cohesion; a country where two of its
 * three communities are has a similar gap and is in a different
 * situation entirely. Reporting only the first would have told a player
 * their country was coming apart over three per cent of it.
 */
export function cohesion(culture: Culture): number {
  const total = culture.communities.reduce((sum, c) => sum + c.share, 0) || 1;
  return culture.communities.reduce((sum, c) => sum + c.belonging * c.share, 0) / total;
}

/** How much of the country is in a community that feels notably left out. */
export function excludedShare(culture: Culture): number {
  const best = Math.max(...culture.communities.map((c) => c.belonging));
  return culture.communities
    .filter((c) => c.belonging < best - 15)
    .reduce((sum, c) => sum + c.share, 0);
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface CultureInputs {
  /** What the cultural line is actually funded at this year, ₡bn. */
  culturalSpend: number;
  /** What it would take to hold every institution where it is, ₡bn. */
  culturalDemand: number;
  /** The public broadcaster's health, 0–100. The largest shared room. */
  broadcasting: number;
  /** Education quality, which is where a country's story is first told. */
  education: number;
  /** How unequal the distribution is. A shared story is harder to tell. */
  incomeGini: number;
  /** How far the countryside sits below the country, points. */
  ruralGap: number;
  /** How far apart the parties are. */
  polarisation: number;
  /** Corruption, 0–100. What norms erode under. */
  corruption: number;
  /** How the country is doing, for pride: growth and unemployment. */
  growth: number;
  unemployment: number;
  /** How the country is seen from outside, 0–100. */
  standing: number;
  /** Share of the population under thirty, 0–1. */
  youthShare: number;
  turn: number;
}

export interface CultureTick {
  culture: Culture;
  /** Institutions that have just fallen below the point they recover from. */
  hollowed: CulturalInstitutionKey[];
  /** True the week a community's belonging falls dangerously behind. */
  comingApart: boolean;
  /** True while pride is falling and attachment is not. */
  prideWithoutPatriotismLoss: boolean;
}

export function stepCulture(culture: Culture, inputs: CultureInputs): CultureTick {
  const weekly = 1 / TURNS_PER_YEAR;

  /* ---- 1. The institutions. ---- */
  const cover =
    inputs.culturalDemand > 0 ? inputs.culturalSpend / inputs.culturalDemand : 1;

  const hollowed: CulturalInstitutionKey[] = [];
  const institutions: CulturalInstitution[] = culture.institutions.map((state) => {
    const template = findCulturalInstitution(state.key);
    const funding = inputs.culturalSpend * template.share;

    /*
     * Vitality follows the money, and falls faster than it rises. A
     * disbanded ensemble is not re-formed by restoring its grant: the
     * players took other work and the ones who trained for it stopped
     * training. That asymmetry is the whole reason culture is a stock
     * rather than a service.
     */
    const target = clamp100(30 + cover * 55);
    const rate =
      target < state.vitality
        ? template.fragility * INSTITUTION_DECAY_SCALE * weekly * 52
        : template.fragility * INSTITUTION_DECAY_SCALE * weekly * 16;
    const vitality = clamp100(toward(state.vitality, target, clamp(rate, 0, 0.5)));

    /* Reach follows vitality, and a hollow institution is one nobody can
       get to whatever its building still says on the front. */
    const reach = clamp100(
      toward(state.reach, template.reach * 100 * (0.35 + (vitality / 100) * 0.75), 0.02),
    );

    if (vitality < 35 && state.vitality >= 35) hollowed.push(state.key);
    return { key: state.key, funding, reach, vitality };
  });

  const reachTotal = culturalReach({ ...culture, institutions });
  const identityWork = institutions.reduce(
    (sum, i) => sum + (i.reach / 100) * (i.vitality / 100) * findCulturalInstitution(i.key).identity,
    0,
  );

  /* ---- 2. National identity. ---- */
  /*
   * Built by what people share, eroded by what divides them. The
   * broadcaster and the schools are the two largest rooms in the
   * country; the distribution and the regional gap are the two things
   * that most reliably make a shared story sound like somebody else's.
   */
  const identityTarget = clamp100(
    34 +
      identityWork * 5.2 +
      inputs.broadcasting * 0.14 +
      inputs.education * 0.1 +
      culture.festivals * 0.7 -
      (inputs.incomeGini - 0.33) * 58 -
      inputs.ruralGap * 0.8 -
      inputs.polarisation * 14,
  );
  const nationalIdentity = clamp100(
    toward(culture.nationalIdentity, identityTarget, IDENTITY_ADJUST_RATE),
  );

  /* Where the national story is thin, the local one fills the space. That
     is not a failure — it is what people do — but it changes what a
     government can ask of them. */
  const regionalIdentity = clamp100(
    toward(culture.regionalIdentity, clamp100(96 - nationalIdentity * 0.62 + inputs.ruralGap), 0.01),
  );

  /* ---- 3. Belonging, per community. ---- */
  const communities: CulturalCommunity[] = culture.communities.map((community, i) => {
    /*
     * Recognition is what the state does about a community's language and
     * customs. It costs almost nothing and it is worth more than money,
     * which is a fact governments discover in the wrong order.
     */
    const recognition =
      i === 0
        ? 100
        : clamp100(toward(community.recognition, culture.languagePolicy, 0.012));

    /*
     * Recognition is weighted above the national story on purpose. Being
     * excluded from how a country conducts itself is not a smaller fact
     * than the country's general mood, and at 0.3 the gap between a fully
     * recognised community and an entirely unrecognised one could never
     * exceed twenty-one points — which meant no state, however
     * unaccommodating, could ever actually drive a community out.
     */
    const target = clamp100(
      nationalIdentity * 0.42 +
        recognition * 0.45 +
        12 -
        (inputs.incomeGini - 0.33) * 30 -
        inputs.polarisation * 8,
    );
    return {
      ...community,
      recognition,
      belonging: clamp100(toward(community.belonging, target, BELONGING_ADJUST_RATE)),
    };
  });

  /* ---- 4. Norms. ---- */
  /*
   * Conceding, resigning, obeying a court. Nothing enforces any of it —
   * that is what makes it culture rather than law — so it erodes under a
   * politics conducted as a war and under a state that is seen to be for
   * sale, and it recovers far more slowly than it falls.
   */
  const normsTarget = clamp100(
    NORMS_START + 16 - inputs.polarisation * 34 - inputs.corruption * 0.55,
  );
  const politicalCulture = clamp100(
    toward(
      culture.politicalCulture,
      normsTarget,
      normsTarget < culture.politicalCulture ? NORMS_ADJUST_RATE * 2.4 : NORMS_ADJUST_RATE,
    ),
  );

  /* ---- 5. Pride, patriotism, and the difference. ---- */
  /*
   * Patriotism is attachment to the place and barely moves. Pride is
   * satisfaction with how it is doing and moves constantly. A government
   * watching pride fall will usually be told the country is losing its
   * patriotism, which is not what is happening and not fixable by the
   * things proposed for it.
   */
  const patriotism = clamp100(
    toward(culture.patriotism, clamp100(52 + nationalIdentity * 0.28 + culture.traditionStrength * 0.12), 0.004),
  );
  const prideTarget = clamp100(
    40 +
      inputs.standing * 0.26 +
      inputs.growth * 3.4 -
      (inputs.unemployment - 5) * 1.9 +
      identityWork * 2.2,
  );
  const nationalPride = clamp100(toward(culture.nationalPride, prideTarget, PRIDE_ADJUST_RATE));

  /* ---- 6. The slow drifts. ---- */
  /* A generational trend, not a policy. No government has ever moved it
     deliberately and several have been destroyed trying. */
  const religiosity = clamp(culture.religiosity - culture.secularisation * weekly, 8, 92);
  const traditionStrength = clamp100(
    toward(culture.traditionStrength, clamp100(30 + religiosity * 0.5 + culture.festivals * 1.4), 0.004),
  );
  /* The young are always somewhat elsewhere. How far depends on how fast
     the country is changing around them. */
  const youthDivergence = clamp100(
    toward(
      culture.youthDivergence,
      clamp100(14 + culture.secularisation * 22 + inputs.polarisation * 28 + inputs.youthShare * 30),
      0.006,
    ),
  );

  const next: Culture = {
    nationalIdentity,
    regionalIdentity,
    communities,
    languagePolicy: culture.languagePolicy,
    traditionStrength,
    religiosity,
    secularisation: culture.secularisation,
    festivals: culture.festivals,
    institutions,
    youthDivergence,
    politicalCulture,
    patriotism,
    nationalPride,
    history: [
      ...culture.history,
      {
        turn: inputs.turn,
        nationalIdentity,
        politicalCulture,
        nationalPride,
        patriotism,
        culturalReach: reachTotal,
      },
    ].slice(-208),
  };

  return {
    culture: next,
    hollowed,
    /*
     * Both halves. A wide gap over a very small community is a real
     * grievance and not a country coming apart, and a report that could
     * not tell those apart would be crying wolf in every homogeneous
     * country in the game.
     */
    comingApart:
      belongingGap(next) > BELONGING_ALARM &&
      excludedShare(next) > 0.08 &&
      !(belongingGap(culture) > BELONGING_ALARM && excludedShare(culture) > 0.08),
    prideWithoutPatriotismLoss:
      nationalPride < culture.nationalPride - 0.01 && patriotism >= culture.patriotism - 0.005,
  };
}

/** One line on what the country has and what it is spending. */
export function describeCulture(culture: Culture): string {
  const weakest = leastIncluded(culture);
  const gap = belongingGap(culture);
  const hollow = culture.institutions.filter((i) => i.vitality < 40);

  if (gap > 26) {
    return `${weakest.label.toLowerCase()} reads ${weakest.belonging.toFixed(0)} on belonging against ${(weakest.belonging + gap).toFixed(0)} at the top — a ${gap.toFixed(0)}-point gap. A country holds together at its weakest attachment rather than its average, and the average here is fine.`;
  }
  if (culture.politicalCulture < 45) {
    return `The norms are thin: ${culture.politicalCulture.toFixed(0)} out of a hundred. Conceding, resigning and obeying a court are things nothing enforces, which is what makes them culture — and what makes them possible to lose without repealing anything.`;
  }
  if (hollow.length >= 3) {
    return `${hollow.length} of the cultural institutions are running below the point they recover from. Nothing has closed and nothing will be missed this year. A disbanded ensemble is not re-formed by restoring its grant.`;
  }
  if (culture.nationalPride < culture.patriotism - 14) {
    return `Attachment to the country is holding at ${culture.patriotism.toFixed(0)} while pride in how it is doing has fallen to ${culture.nationalPride.toFixed(0)}. Those are different things, and only the second one is about you.`;
  }
  return `National identity ${culture.nationalIdentity.toFixed(0)}, norms ${culture.politicalCulture.toFixed(0)}, pride ${culture.nationalPride.toFixed(0)}, and the institutions between them reaching ${culturalReach(culture).toFixed(0)}% of the country.`;
}
