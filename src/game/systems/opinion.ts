/**
 * opinion.ts — what people think of the institutions, and what follows.
 *
 * Approval is what people think of the government. This is the far more
 * consequential thing underneath it: what they think of the arrangements
 * the government is operating.
 *
 * Three ideas.
 *
 * TRUST IS INSTITUTION-SPECIFIC AND CONTAGIOUS IN ONE DIRECTION. Each
 * institution is trusted according to how it is actually performing, but
 * distrust spreads and trust does not. A country that stops believing its
 * police will conclude something about its courts; a country that comes
 * to trust its courts again concludes nothing about anything. That
 * asymmetry is why institutional trust is so much easier to destroy than
 * to build, and it is modelled as an explicit term rather than left to
 * emerge.
 *
 * FRUSTRATION AND EFFICACY TOGETHER DECIDE PARTICIPATION. Angry people
 * who believe acting works turn out, petition, organise and march. Angry
 * people who believe nothing works stop doing any of it. So a government
 * that merely fails gets protest, and a government that fails AND
 * destroys the belief that politics can fix anything gets quiet — which
 * looks like success on every measure it would be judged by and is the
 * worse outcome by a distance. That trap is the reason this file exists.
 *
 * TRUST HAS A PRICE. Tax that is owed is not tax that is collected, and
 * the gap between them is trust. A government operating at low trust
 * raises less from the same rates, gets less compliance with everything
 * it asks, and cannot borrow the goodwill to do anything difficult. It
 * is not a mood; it is a line in the accounts.
 */

import {
  COMPLIANCE_FLOOR,
  CONTAGION_DOWN,
  CONTAGION_UP,
  EFFICACY_ADJUST_RATE,
  MOOD_ADJUST_RATE,
  TRUST_ADJUST_RATE,
  WITHDRAWAL_DRIVE,
  WITHDRAWAL_FRUSTRATION,
  TURNS_PER_YEAR,
} from '../balance.ts';
import { TRUST_TEMPLATES, findTrust, type TrustKey } from '../content/trust.ts';
import type { Opinion, TrustState } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);
const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildOpinion(): Opinion {
  return {
    trust: TRUST_TEMPLATES.map((t) => ({ key: t.key, level: t.opening })),
    efficacy: 54,
    frustration: 38,
    optimism: 52,
    fear: 30,
    confidence: 56,
    engagement: 50,
    protestParticipation: 2.4,
    petitionParticipation: 14,
    activism: 8,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

export function trustOf(opinion: Opinion, key: TrustKey): number {
  const found = opinion.trust.find((t) => t.key === key);
  if (!found) throw new Error(`opinion: no trust reading for ${key}`);
  return found.level;
}

/** Trust across every institution, weighted by how much each one matters. */
export function institutionalTrust(opinion: Opinion): number {
  let total = 0;
  let weight = 0;
  for (const state of opinion.trust) {
    const template = findTrust(state.key);
    total += state.level * template.weight;
    weight += template.weight;
  }
  return weight > 0 ? total / weight : 0;
}

/**
 * How much of what is owed actually arrives, 0–1.
 *
 * The line where trust stops being a mood. A country that believes its
 * state is competent and even-handed pays what it owes; one that does
 * not finds a great deal of its base quietly outside the system, and no
 * rate rise reaches it. Floored rather than taken to zero, because even
 * a thoroughly distrusted state collects from wages it can see.
 */
export function complianceFactor(opinion: Opinion): number {
  const government = trustOf(opinion, 'government');
  const service = trustOf(opinion, 'civil_service');
  const fairness = (government * 0.55 + service * 0.45) / 100;
  return clamp(COMPLIANCE_FLOOR + fairness * (1 - COMPLIANCE_FLOOR) * 1.18, COMPLIANCE_FLOOR, 1.05);
}

/**
 * Whether anger turns into action or into absence.
 *
 * Positive is a country that will march, petition and turn out; negative
 * is one that has stopped bothering. The same frustration produces either,
 * and which one it produces is the most consequential thing a government
 * can do to its own electorate without noticing.
 */
export function mobilisation(opinion: Opinion): number {
  return (opinion.frustration / 100) * ((opinion.efficacy - 42) / 58);
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface OpinionInputs {
  /** What people think of the government of the day. */
  approval: number;
  /** How the country is doing, and for whom. */
  growth: number;
  unemployment: number;
  /** What a household has left, at the bottom. */
  lowerDisposable: number;
  costOfLivingChange: number;
  /** The standard of living and its direction. */
  qualityOfLife: number;
  happiness: number;
  /** How far apart the chamber is, 0–1. */
  polarisation: number;
  /** The norms, 0–100. What a parliament is trusted against. */
  norms: number;
  /** Corruption, 0–100. Not yet built; passed as zero until Engine 5F. */
  corruption: number;
  /** Service quality for the institutions that have one. */
  courtsQuality: number;
  policeQuality: number;
  adminQuality: number;
  /** Crime per thousand, which is what policing is judged on. */
  crimeRate: number;
  /** How concentrated the press is, 0–1. High is few owners. */
  mediaConcentration: number;
  /** How much of what circulates is false, 0–100. Zero until Engine 6G. */
  disinformation: number;
  /** How unequal the country is, which is what business is judged on. */
  incomeGini: number;
  /** Whether the government can actually pass anything, 0–1. */
  legislativeSuccess: number;
  /** An external threat raises fear without anybody deciding to. */
  externalTension: number;
  turn: number;
}

export interface OpinionTick {
  opinion: Opinion;
  /** Institutions whose trust has just fallen below the point it recovers from. */
  collapsed: TrustKey[];
  /**
   * True the week the country crosses from angry-and-acting to
   * angry-and-absent. The single most important transition here and the
   * one that looks like calm.
   */
  withdrawn: boolean;
}

/** What each institution is actually judged on. */
function trustTarget(key: TrustKey, inputs: OpinionInputs): number {
  switch (key) {
    case 'government':
      return clamp100(
        18 + inputs.approval * 0.5 + inputs.qualityOfLife * 0.28 - inputs.corruption * 0.45,
      );
    case 'parliament':
      /* Judged on whether it is a functioning chamber rather than on
         whether people like its decisions: a parliament that cannot pass
         anything and conducts itself as a war is distrusted by the people
         who agree with it as well as the people who do not. */
      return clamp100(
        22 + inputs.norms * 0.42 + inputs.legislativeSuccess * 28 - inputs.polarisation * 32,
      );
    case 'courts':
      return clamp100(30 + inputs.norms * 0.4 + inputs.courtsQuality * 0.3 - inputs.corruption * 0.3);
    case 'police':
      return clamp100(34 + inputs.policeQuality * 0.42 - inputs.crimeRate * 0.7 - inputs.corruption * 0.35);
    case 'media':
      /* Plurality and accuracy. A press with few owners and a great deal
         of falsehood circulating is not believed, including when right. */
      return clamp100(
        62 - inputs.mediaConcentration * 34 - inputs.disinformation * 0.42 - inputs.polarisation * 14,
      );
    case 'business':
      return clamp100(
        56 - (inputs.incomeGini - 0.33) * 70 - (inputs.unemployment - 5) * 1.6 + inputs.growth * 1.8,
      );
    case 'civil_service':
      return clamp100(30 + inputs.adminQuality * 0.45 - inputs.corruption * 0.4);
  }
}

export function stepOpinion(opinion: Opinion, inputs: OpinionInputs): OpinionTick {
  const weekly = 1 / TURNS_PER_YEAR;

  /* ---- 1. Trust, institution by institution. ---- */
  const mean = institutionalTrust(opinion);

  const collapsed: TrustKey[] = [];
  const trust: TrustState[] = opinion.trust.map((state) => {
    const template = findTrust(state.key);
    const own = trustTarget(state.key, inputs);

    /*
     * Contagion, and only downward. A country that stops believing its
     * police will conclude something about its courts; one that comes to
     * trust its courts again concludes nothing about anything else. That
     * is why institutional trust is so much cheaper to destroy than to
     * build, and it is stated here rather than left to emerge.
     */
    const pull = mean < state.level ? CONTAGION_DOWN : CONTAGION_UP;
    const target = own * (1 - pull) + mean * pull;

    const level = clamp100(toward(state.level, target, TRUST_ADJUST_RATE * template.volatility));
    if (level < 28 && state.level >= 28) collapsed.push(state.key);
    return { key: state.key, level };
  });

  const next = { ...opinion, trust };

  /* ---- 2. The mood. ---- */
  /*
   * Four dimensions, because they are not one thing and they drive
   * different behaviour. Frustration marches. Fear votes for security and
   * against outsiders. Optimism spends. Confidence complies.
   */
  const frustration = clamp100(
    toward(
      opinion.frustration,
      clamp100(
        24 +
          (100 - inputs.qualityOfLife) * 0.34 +
          (100 - inputs.lowerDisposable) * 0.5 +
          inputs.costOfLivingChange * 2.4 +
          inputs.polarisation * 16 -
          institutionalTrust(next) * 0.16,
      ),
      MOOD_ADJUST_RATE,
    ),
  );
  const optimism = clamp100(
    toward(
      opinion.optimism,
      clamp100(30 + inputs.happiness * 0.5 + inputs.growth * 3.2 - (inputs.unemployment - 5) * 2.1),
      MOOD_ADJUST_RATE,
    ),
  );
  const fear = clamp100(
    toward(
      opinion.fear,
      clamp100(
        14 +
          inputs.externalTension * 0.32 +
          inputs.crimeRate * 0.65 +
          (inputs.unemployment - 5) * 1.5 +
          (100 - institutionalTrust(next)) * 0.2,
      ),
      MOOD_ADJUST_RATE,
    ),
  );
  const confidence = clamp100(
    toward(
      opinion.confidence,
      clamp100(institutionalTrust(next) * 0.62 + optimism * 0.3 - fear * 0.14 + 12),
      MOOD_ADJUST_RATE,
    ),
  );

  /* ---- 3. Efficacy: does any of it work? ---- */
  /*
   * The belief that acting changes something. It is built by governments
   * that respond to pressure and destroyed by ones that do not, and it is
   * the hinge the whole file turns on: the same anger produces a marching
   * country or an absent one depending entirely on this number.
   */
  const efficacy = clamp100(
    toward(
      opinion.efficacy,
      clamp100(
        16 +
          trustOf(next, 'parliament') * 0.34 +
          trustOf(next, 'government') * 0.2 +
          inputs.legislativeSuccess * 22 -
          inputs.polarisation * 14 -
          inputs.corruption * 0.2,
      ),
      EFFICACY_ADJUST_RATE,
    ),
  );

  const staged: Opinion = { ...next, frustration, optimism, fear, confidence, efficacy };
  const drive = mobilisation(staged);

  /* ---- 4. What people actually do about it. ---- */
  const engagement = clamp100(
    toward(opinion.engagement, clamp100(34 + efficacy * 0.45 + frustration * 0.22), 0.03),
  );
  /*
   * Participation rises with anger and with the belief that anger works,
   * and it is the PRODUCT rather than the sum: either at zero produces
   * nothing. A furious country that has given up does not march.
   */
  const protestParticipation = clamp(
    toward(opinion.protestParticipation, Math.max(0.2, 1.4 + drive * 22), 0.05),
    0,
    30,
  );
  const petitionParticipation = clamp(
    toward(opinion.petitionParticipation, Math.max(2, 8 + drive * 60), 0.05),
    0,
    70,
  );
  const activism = clamp(
    toward(opinion.activism, Math.max(0.5, 4 + drive * 34), 0.02),
    0,
    45,
  );

  const result: Opinion = {
    trust,
    efficacy,
    frustration,
    optimism,
    fear,
    confidence,
    engagement,
    protestParticipation,
    petitionParticipation,
    activism,
    history: [
      ...opinion.history,
      {
        turn: inputs.turn,
        institutionalTrust: institutionalTrust(next),
        efficacy,
        frustration,
        confidence,
        protestParticipation,
      },
    ].slice(-208),
  };

  /*
   * Angry, and no longer acting on it. Reported once, on the week it
   * crosses.
   *
   * Both halves are measured against the SAME threshold. Written against
   * two different ones it never fired at all: the drive moves slowly
   * enough that no single week ever spanned the gap between them, so the
   * most consequential transition in this file was silently unreportable.
   */
  const wasActing = mobilisation(opinion) > WITHDRAWAL_DRIVE;
  const nowAbsent = frustration > WITHDRAWAL_FRUSTRATION && drive <= WITHDRAWAL_DRIVE;
  void weekly;

  return {
    opinion: result,
    collapsed,
    withdrawn: wasActing && nowAbsent,
  };
}

/** One line on what the country thinks of its arrangements. */
export function describeOpinion(opinion: Opinion): string {
  const worst = opinion.trust.reduce((a, b) => (b.level < a.level ? b : a));
  const template = findTrust(worst.key);
  const drive = mobilisation(opinion);

  if (opinion.frustration > WITHDRAWAL_FRUSTRATION && drive <= WITHDRAWAL_DRIVE) {
    return `A frustrated country that has stopped acting on it. Frustration reads ${opinion.frustration.toFixed(0)} and the belief that anything can be changed by participating reads ${opinion.efficacy.toFixed(0)}. The streets are quiet, which is not the same as settled and is a good deal harder to come back from.`;
  }
  if (drive > 0.2) {
    return `Angry, and convinced that acting works: ${opinion.protestParticipation.toFixed(1)}% of the country has been out in the last year and ${opinion.activism.toFixed(0)}% is organised about something. A government facing this has a problem it can still answer.`;
  }
  if (worst.level < 30) {
    return `Trust in ${template.label.toLowerCase()} has fallen to ${worst.level.toFixed(0)}. Distrust spreads between institutions and confidence does not, so this is not where it stops.`;
  }
  if (complianceFactor(opinion) < 0.86) {
    return `Compliance is running at ${(complianceFactor(opinion) * 100).toFixed(0)}% of what is owed. Tax that is owed is not tax that is collected, and the gap between them is trust rather than enforcement.`;
  }
  return `Institutional trust ${institutionalTrust(opinion).toFixed(0)}, efficacy ${opinion.efficacy.toFixed(0)}, frustration ${opinion.frustration.toFixed(0)}, confidence ${opinion.confidence.toFixed(0)}.`;
}
