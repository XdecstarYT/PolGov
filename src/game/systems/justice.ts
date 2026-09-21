/**
 * justice.ts — the bench, and the force that feeds it cases.
 *
 * CERTAINTY DETERS, SEVERITY BARELY DOES. `CLEARANCE_DETERRENCE_WEIGHT`
 * is set well above any sentencing template's `severityDeterrence`, on
 * purpose: a government that invests in solving more cases sees a
 * bigger fall in crime than one that invests in longer sentences for
 * the cases it already solves, which is the finding and not a dial.
 *
 * INDEPENDENCE IS SPENT. Leaning on the courts buys favourable rulings
 * now (`favour`) and pulls independence toward a lower floor that takes
 * far longer to climb back from than it took to fall to.
 *
 * ENFORCEMENT THEATRE IS A TRAP. A harder posture suppresses measured
 * crime directly, but the same posture cuts cooperation, and cooperation
 * is half of what produces the clearance rate — so pushing harder in a
 * community that already distrusts the police can raise arrests while
 * lowering the clearance rate the courts actually depend on.
 */

import {
  ACCURACY_START,
  BACKLOG_ORDINARY,
  BACKLOG_RATE,
  CLEARANCE_ACCURACY_TRADE,
  CLEARANCE_CAPABILITY_WEIGHT,
  CLEARANCE_COOPERATION_WEIGHT,
  CLEARANCE_DETERRENCE_WEIGHT,
  COOPERATION_RATE,
  COOPERATION_START,
  CORRUPTION_RATE,
  CORRUPTION_SCANDAL_THRESHOLD,
  CORRUPTION_START,
  INDEPENDENCE_RATE,
  JUDICIAL_INDEPENDENCE_START,
  POLICING_CAPABILITY_RATE,
  POLICING_CAPABILITY_START,
  PRISON_POPULATION_RATE,
  PRISON_POPULATION_START,
} from '../balance.ts';
import {
  findEnforcementPosture,
  findSentencing,
  findStance,
  type EnforcementPosture,
  type JudicialStance,
  type SentencingPolicy,
} from '../content/justice.ts';
import type { Courts, Justice, Policing } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);
const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildJustice(): Justice {
  const courts: Courts = {
    sentencing: 'standard',
    stance: 'ordinary',
    independence: JUDICIAL_INDEPENDENCE_START,
    backlog: BACKLOG_ORDINARY,
    clearanceRate: 0.5,
    accuracy: ACCURACY_START,
    prisonPopulation: PRISON_POPULATION_START,
  };
  const policing: Policing = {
    posture: 'standard',
    capability: POLICING_CAPABILITY_START,
    cooperation: COOPERATION_START,
    corruption: CORRUPTION_START,
    investigativeClearance: 0.5,
  };
  return { courts, policing, history: [] };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/**
 * The clearance rate, produced by capability and cooperation together —
 * not by posture directly, which is what makes enforcement theatre a
 * trap rather than a shortcut.
 */
export function clearanceRate(policing: Policing): number {
  return clamp(
    (policing.capability / 100) * CLEARANCE_CAPABILITY_WEIGHT +
      (policing.cooperation / 100) * CLEARANCE_COOPERATION_WEIGHT,
    0.05,
    0.95,
  );
}

/**
 * How much crime this system deters, combining the courts' sentencing
 * severity with the force's clearance rate — weighted, deliberately, so
 * that clearance dominates.
 */
export function crimeDeterrence(justice: Justice): number {
  const severity = findSentencing(justice.courts.sentencing).severityDeterrence;
  const clearance = clearanceRate(justice.policing);
  return severity * 0.5 + clearance * CLEARANCE_DETERRENCE_WEIGHT;
}

/** What the deterrence figure is worth as a `problems.ts` service-quality input, 0–100. */
export function policingQuality(justice: Justice): number {
  return clamp100(crimeDeterrence(justice) * 40);
}

export function courtsQuality(justice: Justice): number {
  return clamp100(
    60 +
      (justice.courts.accuracy - ACCURACY_START) * 120 -
      (justice.courts.backlog - BACKLOG_ORDINARY) * 25 +
      (justice.courts.independence - JUDICIAL_INDEPENDENCE_START) * 0.3,
  );
}

export function describeCourts(courts: Courts): string {
  if (courts.independence < 35) {
    return 'The bench answers to the government in most things that matter, and everyone in the building knows it.';
  }
  if (courts.backlog > 1.6) {
    return 'Cases wait years rather than months. Justice delayed is, in the only sense that matters to the person waiting, justice withheld.';
  }
  if (courts.accuracy < 0.75) {
    return 'Cases clear quickly and not always correctly. The appeals backlog is where the corners cut here turn up next.';
  }
  return 'An ordinary court system: independent enough, slow enough, and right more often than not.';
}

export function describePolicing(policing: Policing): string {
  if (policing.corruption > CORRUPTION_SCANDAL_THRESHOLD) {
    return 'Everybody in the department can name the officers on the take. It is a question of when this becomes everybody’s knowledge.';
  }
  if (policing.cooperation < 35) {
    return 'People do not call. Not because nothing is happening, but because calling has stopped seeming worth it.';
  }
  return 'An ordinary force: adequately funded, ordinarily trusted, closing about half of what it opens.';
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface JusticeInputs {
  /** Funding for courts, 0–2, 1 = ordinary. */
  courtFunding: number;
  /** Funding for police, 0–2, 1 = ordinary. */
  policeFunding: number;
  turn: number;
}

export interface JusticeTick {
  justice: Justice;
  /** True the week a corruption scandal breaks. */
  scandal: boolean;
  /** True the week independence crosses below half. */
  benchCaptured: boolean;
}

export function stepJustice(justice: Justice, inputs: JusticeInputs): JusticeTick {
  const stance = findStance(justice.courts.stance);
  const sentencing = findSentencing(justice.courts.sentencing);
  const posture = findEnforcementPosture(justice.policing.posture);

  const independence = clamp100(
    toward(justice.courts.independence, stance.independenceTarget, INDEPENDENCE_RATE),
  );

  const capability = clamp100(
    toward(
      justice.policing.capability,
      POLICING_CAPABILITY_START * inputs.policeFunding,
      POLICING_CAPABILITY_RATE,
    ),
  );

  const cooperationTarget = clamp100(
    COOPERATION_START + posture.cooperation - justice.policing.corruption * 0.6,
  );
  const cooperation = clamp100(
    toward(justice.policing.cooperation, cooperationTarget, COOPERATION_RATE),
  );

  /*
   * Corruption drifts toward what the posture and the capability funding
   * supply: an under-capability force under an aggressive posture, with
   * nobody watching, breeds it; a well-funded force under ordinary
   * scrutiny slowly loses it. No randomness — the threshold crossing
   * below is the "scandal", the same deterministic-crossing pattern the
   * cabinet uses for a broken table.
   */
  const corruptionTarget = clamp100(
    posture.scandalRisk * 9 + Math.max(0, POLICING_CAPABILITY_START - capability) * 0.4,
  );
  const corruption = clamp100(toward(justice.policing.corruption, corruptionTarget, CORRUPTION_RATE));
  const scandal =
    corruption > CORRUPTION_SCANDAL_THRESHOLD && justice.policing.corruption <= CORRUPTION_SCANDAL_THRESHOLD;

  const investigativeClearance = clamp(
    (capability / 100) * CLEARANCE_CAPABILITY_WEIGHT + (cooperation / 100) * CLEARANCE_COOPERATION_WEIGHT,
    0.05,
    0.95,
  );

  const policing: Policing = {
    ...justice.policing,
    capability,
    cooperation,
    corruption,
    investigativeClearance,
  };

  /* Clearance speed at the courts trades against accuracy: pushed harder
     than the caseload allows, more of what clears is wrong. */
  const backlogPressure = clamp(justice.courts.backlog - BACKLOG_ORDINARY, -0.5, 3);
  const clearanceSpeed = clamp(investigativeClearance - backlogPressure * 0.1, 0.05, 0.95);
  const accuracyTarget = clamp(
    ACCURACY_START - Math.max(0, clearanceSpeed - 0.5) * CLEARANCE_ACCURACY_TRADE,
    0.4,
    0.97,
  );
  const accuracy = clamp(toward(justice.courts.accuracy, accuracyTarget, 0.03), 0.4, 0.97);

  const backlogTarget = clamp(
    BACKLOG_ORDINARY * (2 - inputs.courtFunding) * (2 - clearanceSpeed),
    0.3,
    4,
  );
  const backlog = clamp(toward(justice.courts.backlog, backlogTarget, BACKLOG_RATE), 0.3, 4);

  const custodyTarget = PRISON_POPULATION_START * sentencing.custodyRate * clamp(clearanceSpeed * 1.6, 0.3, 1.6);
  const prisonPopulation = clamp(
    toward(justice.courts.prisonPopulation, custodyTarget, PRISON_POPULATION_RATE),
    0.1,
    6,
  );

  const courts: Courts = {
    ...justice.courts,
    independence,
    backlog,
    clearanceRate: clearanceSpeed,
    accuracy,
    prisonPopulation,
  };

  const next: Justice = {
    courts,
    policing,
    history: [
      ...justice.history,
      {
        turn: inputs.turn,
        independence,
        clearanceRate: clearanceSpeed,
        crimeDeterrence: crimeDeterrence({ courts, policing, history: [] }),
      },
    ].slice(-208),
  };

  return {
    justice: next,
    scandal,
    benchCaptured: independence < 50 && justice.courts.independence >= 50,
  };
}

/* ------------------------------------------------------------------ *
 * Decisions
 * ------------------------------------------------------------------ */

export function setSentencing(justice: Justice, policy: SentencingPolicy): Justice {
  return { ...justice, courts: { ...justice.courts, sentencing: policy } };
}

export function setJudicialStance(justice: Justice, stance: JudicialStance): Justice {
  return { ...justice, courts: { ...justice.courts, stance } };
}

export function setEnforcementPosture(justice: Justice, posture: EnforcementPosture): Justice {
  return { ...justice, policing: { ...justice.policing, posture } };
}

export function driveAntiCorruption(justice: Justice, effect: number): Justice {
  return {
    ...justice,
    policing: {
      ...justice.policing,
      corruption: clamp(justice.policing.corruption - effect, 0, 100),
    },
  };
}
