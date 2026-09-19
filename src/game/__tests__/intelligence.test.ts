/**
 * intelligence.test.ts — the assessment that is confidently wrong.
 *
 * The claim: collection buys a narrower error bar and never a right answer,
 * and the confidence label is drawn from the same machinery as the number,
 * so a high-confidence assessment is usually right and occasionally
 * catastrophic — with nothing on the paper to say which case this is.
 *
 * That is a statistical claim, so it is measured over four thousand draws
 * rather than asserted about one. The numbers in the comments are what the
 * model actually produces, not what it was hoped it would.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_DECAY_WEEKS,
  OVERCONFIDENCE_BASE,
  OVERSIGHT_EXPOSURE_WEIGHT,
  SCANDAL_OVERSIGHT_GUARD,
} from '../balance.ts';
import {
  OPERATION_TEMPLATES,
  POWER_TEMPLATES,
  SUBJECT_TEMPLATES,
  findOperation,
  findSubject,
} from '../content/intelligence.ts';
import { Rng } from '../rng.ts';
import { buildWorld } from '../systems/diplomacy.ts';
import { buildMilitary } from '../systems/military.ts';
import {
  assess,
  buildIntelligence,
  collectionFor,
  describeIntelligence,
  judge,
  launch,
  operationOdds,
  scandalRisk,
  stepIntelligence,
  trackRecord,
  truthOf,
} from '../systems/intelligence.ts';
import { createStandardGame } from '../setup.ts';
import { applyIntent } from '../turn.ts';
import type { AssessmentSubject, GameState, Intelligence } from '../index.ts';

const world = buildWorld();
const military = buildMilitary();

/** Draw a lot of assessments and report how they landed. */
function sample(
  subject: AssessmentSubject,
  intel: Intelligence,
  draws = 4000,
): { wrong: number; highShare: number; highWrong: number; meanError: number } {
  let wrong = 0;
  let high = 0;
  let highWrong = 0;
  let error = 0;

  for (let i = 0; i < draws; i += 1) {
    const a = assess(subject, 'russia', intel, world, military, [], 1, new Rng(i + 1));
    const off = Math.abs(a.estimate - a.truth);
    error += off;
    if (off >= 18) wrong += 1;
    if (a.confidence === 'high') {
      high += 1;
      if (off >= 18) highWrong += 1;
    }
  }

  return {
    wrong: wrong / draws,
    highShare: high / draws,
    highWrong: high === 0 ? 0 : highWrong / high,
    meanError: error / draws,
  };
}

function inOffice(id = 'intel-test'): GameState {
  let state = createStandardGame(id);
  if (state.phase === 'coalition') {
    for (const candidate of state.negotiation!.candidates) {
      state = applyIntent(state, {
        type: 'negotiation_accept',
        partyId: candidate.partyId,
      }).state;
    }
    state = applyIntent(state, { type: 'negotiation_form_government' }).state;
  }
  return state;
}

const excellent = (): Intelligence => ({
  ...buildIntelligence(),
  capability: 88,
  penetration: 5,
  posture: { human: 0.5, signals: 0.3, analysis: 0.2 },
});

describe('what can and cannot be known', () => {
  it('is near certain about what can be counted', () => {
    /* Ships can be photographed. This is the assessment that is usually
       right and never the one that matters most. */
    const inherited = sample('capability', buildIntelligence());
    expect(inherited.wrong).toBeLessThan(0.1);
    expect(inherited.meanError).toBeLessThan(9);
  });

  it('is wrong about intentions a quarter of the time, and always will be', () => {
    /*
     * Intentions are in somebody's head. They cannot be collected against,
     * only inferred, which is why every famous intelligence failure in
     * history is this box — and why perfect collection does not empty it.
     */
    const inherited = sample('intentions', buildIntelligence());
    expect(inherited.wrong).toBeGreaterThan(0.2);

    const best = sample('intentions', { ...excellent(), capability: 100 });
    expect(best.wrong).toBeLessThan(inherited.wrong);
    /* Better. Never solved. */
    expect(best.wrong).toBeGreaterThan(0.02);
  });

  it('buys a narrower error bar and never a right answer', () => {
    for (const template of SUBJECT_TEMPLATES) {
      const poor = sample(template.key, { ...buildIntelligence(), capability: 20 }, 1200);
      const rich = sample(template.key, excellent(), 1200);
      expect(rich.meanError).toBeLessThan(poor.meanError);
      expect(rich.meanError).toBeGreaterThan(0);
    }
  });

  it('is degraded by whoever is already inside our own house', () => {
    const clean: Intelligence = { ...buildIntelligence(), penetration: 0 };
    const penetrated: Intelligence = { ...buildIntelligence(), penetration: 85 };
    expect(collectionFor(penetrated, 'intentions')).toBeLessThan(
      collectionFor(clean, 'intentions'),
    );
  });

  it('is worse when the collection is pointed at the wrong thing', () => {
    /* A country that spent a decade on signals and is now asked about
       intentions has bought the wrong thing and cannot fix it in a term. */
    const signals: Intelligence = {
      ...buildIntelligence(),
      posture: { human: 0.08, signals: 0.82, analysis: 0.1 },
    };
    const human: Intelligence = {
      ...buildIntelligence(),
      posture: { human: 0.6, signals: 0.25, analysis: 0.15 },
    };
    expect(collectionFor(human, 'intentions')).toBeGreaterThan(
      collectionFor(signals, 'intentions'),
    );
    expect(collectionFor(signals, 'capability')).toBeGreaterThan(
      collectionFor(human, 'capability'),
    );
  });
});

describe('the confidence on the paper', () => {
  it('is an estimate too, and is wrong exactly where history says it is', () => {
    /*
     * The mechanic this whole system exists for. About one intentions
     * assessment in thirty arrives marked high confidence, and about a
     * quarter of those are badly wrong. Nobody is lying; the process
     * worked; there is nothing on the paper that says which case this is.
     */
    const intentions = sample('intentions', buildIntelligence());
    expect(intentions.highShare).toBeGreaterThan(0);
    expect(intentions.highWrong).toBeGreaterThan(0.1);

    /* And where the thing can simply be counted, high confidence means it. */
    const capability = sample('capability', excellent());
    expect(capability.highShare).toBeGreaterThan(0.5);
    expect(capability.highWrong).toBeLessThan(0.05);
  });

  it('oversells itself most on the questions that are hardest', () => {
    expect(OVERCONFIDENCE_BASE).toBeGreaterThan(0);
    const intentions = findSubject('intentions');
    const capability = findSubject('capability');
    expect(intentions.difficulty).toBeGreaterThan(capability.difficulty * 2);
  });

  it('can be marked right or wrong, but only later', () => {
    const a = assess('capability', 'russia', excellent(), world, military, [], 1, new Rng(5));
    expect(a.verdict).toBe('unknown');

    const sound = judge(a, a.estimate + 2);
    const wrong = judge(a, a.estimate + 45);
    expect(sound.verdict).toBe('sound');
    expect(wrong.verdict).toBe('wrong');
    /* And a verdict, once reached, is not revisited. */
    expect(judge(sound, a.estimate + 45).verdict).toBe('sound');
  });

  it('adds up to a track record a player can read back', () => {
    expect(trackRecord([])).toBeNull();
    const base = assess('capability', 'russia', excellent(), world, military, [], 1, new Rng(5));
    const record = trackRecord([
      { ...base, verdict: 'sound' },
      { ...base, id: 'b', verdict: 'sound' },
      { ...base, id: 'c', verdict: 'wrong' },
      { ...base, id: 'd', verdict: 'unknown' },
    ]);
    expect(record).toBeCloseTo(2 / 3, 4);
  });
});

describe('operations', () => {
  it('are more likely to work with better agencies', () => {
    for (const template of OPERATION_TEMPLATES) {
      const poor = operationOdds(template.key, { ...buildIntelligence(), capability: 15 });
      const good = operationOdds(template.key, excellent());
      expect(good.success).toBeGreaterThan(poor.success);
    }
  });

  it('are harder to catch when nobody is watching, which is a real argument', () => {
    const watched: Intelligence = { ...buildIntelligence(), oversight: 90 };
    const unwatched: Intelligence = { ...buildIntelligence(), oversight: 10 };
    expect(operationOdds('sabotage', unwatched).exposure).toBeLessThan(
      operationOdds('sabotage', watched).exposure,
    );
    expect(OVERSIGHT_EXPOSURE_WEIGHT).toBeGreaterThan(0);
  });

  it('and the price of winning that argument is the thing that ends governments', () => {
    const watched: Intelligence = { ...buildIntelligence(), oversight: 90, powers: 3 };
    const unwatched: Intelligence = { ...buildIntelligence(), oversight: 10, powers: 3 };
    expect(scandalRisk(watched)).toBe(0);
    expect(scandalRisk(unwatched)).toBeGreaterThan(0);
    expect(SCANDAL_OVERSIGHT_GUARD).toBeGreaterThan(0);
  });

  it('can fail and surface at the same time, which nobody plans for', () => {
    /* Rolled separately on purpose: the worst outcome has to be reachable. */
    let intel = launch(buildIntelligence(), 'sabotage', 'russia', 1);
    const template = findOperation('sabotage');
    let sawExposed = false;
    let sawFailed = false;

    for (let seed = 1; seed <= 300 && !(sawExposed && sawFailed); seed += 1) {
      const result = stepIntelligence(
        { ...intel, operations: intel.operations.map((o) => ({ ...o, status: 'running' as const })) },
        {
          cover: 1,
          world,
          military,
          crises: [],
          turn: 1 + template.weeks,
          rng: new Rng(seed),
        },
      );
      const status = result.intelligence.operations[0]!.status;
      if (status === 'exposed') sawExposed = true;
      if (status === 'failed') sawFailed = true;
    }

    expect(sawExposed).toBe(true);
    expect(sawFailed).toBe(true);
    intel = buildIntelligence();
  });

  it('fix the exposure risk at launch, so a successor pays for it', () => {
    const careless: Intelligence = { ...buildIntelligence(), oversight: 5 };
    const launched = launch(careless, 'intercept', 'russia', 10);
    const operation = launched.operations[0]!;
    /* The number travels with the operation. Tightening oversight later
       does not un-authorise what is already running. */
    expect(operation.exposure).toBeCloseTo(operationOdds('intercept', careless).exposure, 6);
  });
});

describe('the week', () => {
  it('lets somebody in a little further every week, on their own', () => {
    let intel = buildIntelligence();
    const before = intel.penetration;
    for (let week = 1; week <= 52; week += 1) {
      intel = stepIntelligence(intel, {
        cover: 1,
        world,
        military,
        crises: [],
        turn: week,
        rng: new Rng(week),
      }).intelligence;
    }
    /* Somebody is always trying. The only thing that reduces it is looking
       for them, which is unglamorous and nobody funds it. */
    expect(intel.penetration).toBeGreaterThan(before);
  });

  it('moves capability with the money, slowly, and never to nothing', () => {
    let starved = buildIntelligence();
    for (let week = 1; week <= 52 * 4; week += 1) {
      starved = stepIntelligence(starved, {
        cover: 0.4,
        world,
        military,
        crises: [],
        turn: week,
        rng: new Rng(week),
      }).intelligence;
    }
    expect(starved.capability).toBeLessThan(buildIntelligence().capability);
    /* The agencies do not stop existing when they are cut. They stop being
       good, which is harder to notice and harder to undo. */
    expect(starved.capability).toBeGreaterThan(5);
  });

  it('marks old assessments once the answer is visible', () => {
    const a = assess('capability', 'russia', excellent(), world, military, [], 1, new Rng(5));
    const intel: Intelligence = { ...buildIntelligence(), assessments: [a] };
    const early = stepIntelligence(intel, {
      cover: 1,
      world,
      military,
      crises: [],
      turn: 1 + ASSESSMENT_DECAY_WEEKS - 2,
      rng: new Rng(1),
    });
    expect(early.judged).toHaveLength(0);

    const later = stepIntelligence(intel, {
      cover: 1,
      world,
      military,
      crises: [],
      turn: 1 + ASSESSMENT_DECAY_WEEKS + 1,
      rng: new Rng(1),
    });
    expect(later.judged).toHaveLength(1);
    expect(later.judged[0]!.verdict).not.toBe('unknown');
  });
});

describe('at home', () => {
  it('offers a ladder where each rung is a real argument', () => {
    expect(POWER_TEMPLATES.length).toBeGreaterThan(2);
    for (let i = 1; i < POWER_TEMPLATES.length; i += 1) {
      const lower = POWER_TEMPLATES[i - 1]!;
      const higher = POWER_TEMPLATES[i]!;
      /* Each rung buys more and costs more, in both currencies. */
      expect(higher.surveillance).toBeGreaterThan(lower.surveillance);
      expect(higher.cost).toBeGreaterThan(lower.cost);
      expect(higher.approval).toBeLessThan(lower.approval + 0.001);
      expect(higher.objectors.length).toBeGreaterThanOrEqual(lower.objectors.length);
    }
  });

  it('genuinely reduces what goes wrong, because pretending otherwise is arguing', () => {
    const none = stepIntelligence(
      { ...buildIntelligence(), powers: 0 },
      { cover: 1, world, military, crises: [], turn: 2, rng: new Rng(1) },
    );
    const full = stepIntelligence(
      { ...buildIntelligence(), powers: 3 },
      { cover: 1, world, military, crises: [], turn: 2, rng: new Rng(1) },
    );
    expect(full.unrestAverted).toBeGreaterThan(none.unrestAverted);
  });
});

describe('through the turn engine', () => {
  it('will not reprint the same paper with a new date on it', () => {
    const state: GameState = { ...inOffice('intel-repeat'), politicalCapital: 200 };
    const first = applyIntent(state, {
      type: 'commission_assessment',
      subject: 'intentions',
      nation: 'russia',
    });
    expect(first.error).toBeUndefined();
    expect(first.state.intelligence.assessments).toHaveLength(1);

    const again = applyIntent(
      { ...first.state, politicalCapital: 200 },
      { type: 'commission_assessment', subject: 'intentions', nation: 'russia' },
    );
    expect(again.error).toContain('same');
  });

  it('shows the player the estimate and never the truth', () => {
    const state: GameState = { ...inOffice('intel-truth'), politicalCapital: 200 };
    const result = applyIntent(state, {
      type: 'commission_assessment',
      subject: 'programme',
      nation: 'united_states',
    });
    const assessment = result.state.intelligence.assessments[0]!;
    const entry = result.state.logs
      .flatMap((l) => l.entries)
      .find((e) => e.label.includes('Weapons programme'));

    expect(entry).toBeDefined();
    expect(entry!.cause).toContain(assessment.estimate.toFixed(0));
    /* The truth is in the state, because the engine needs it. It is never
       in anything the player reads. */
    expect(entry!.cause).not.toContain(`truth`);
  });

  it('refuses a collection posture that is not a whole budget', () => {
    const state: GameState = { ...inOffice('intel-posture'), politicalCapital: 200 };
    expect(
      applyIntent(state, { type: 'set_collection', human: 0.6, signals: 0.6, analysis: 0.2 }).error,
    ).toContain('add to the whole');
  });

  it('charges approval for taking powers and gives most of it back for repealing', () => {
    const state: GameState = { ...inOffice('intel-powers'), politicalCapital: 200 };
    const taken = applyIntent(state, { type: 'set_surveillance', level: 2 });
    expect(taken.error).toBeUndefined();
    expect(taken.state.approval).toBeLessThan(state.approval);

    const given = applyIntent(
      { ...taken.state, politicalCapital: 200 },
      { type: 'set_surveillance', level: 0 },
    );
    expect(given.error).toBeUndefined();
    expect(given.state.approval).toBeGreaterThan(taken.state.approval);
    /* But not all of it: the argument was had in public, and the public
       remembers having it. */
    expect(given.state.approval).toBeLessThan(state.approval);
  });

  it('describes the agencies without flattering them', () => {
    const penetrated: Intelligence = { ...buildIntelligence(), penetration: 80 };
    expect(describeIntelligence(penetrated)).toContain('Somebody is inside');
  });

  it('knows the truth it is estimating, so the estimate has something to be wrong about', () => {
    for (const template of SUBJECT_TEMPLATES) {
      const truth = truthOf(template.key, 'russia', world, military, []);
      expect(truth).toBeGreaterThanOrEqual(0);
      expect(truth).toBeLessThanOrEqual(100);
    }
  });
});
