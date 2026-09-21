/**
 * integrity.ts — the body of law, and what keeps power honest.
 *
 * ONE WELL, MANY TAPS. Police corruption lives in `justice.ts` because it
 * has its own texture — cash and a badge. This is everything else that
 * draws on the same underlying supply: how much patronage the cabinet
 * runs on, how independent the courts are of the government that would
 * rather they weren't, and what transparency and anti-corruption
 * machinery exist to make any of it hard to hide.
 *
 * RULE OF LAW IS A COMPOSITE, NOT A DIAL. It is what judicial
 * independence, this corruption index and the state of the statute book
 * add up to — nothing sets it directly, which is the honest shape of
 * the thing: no government has a rule-of-law lever, only levers that
 * feed it.
 *
 * THE STATUTE BOOK ONLY EVER GROWS ON ITS OWN. Regulatory stock rises
 * with every bill that passes and never falls by itself; a country that
 * wants a leaner rulebook has to spend deliberately to get one, on top
 * of whatever else it is doing.
 */

import {
  AUDIT_DECAY,
  AUDIT_EFFECT,
  CORRUPTION_INDEX_RATE,
  CORRUPTION_INDEX_START,
  REGULATORY_STOCK_PER_BILL,
  REGULATORY_STOCK_RATE,
  REGULATORY_STOCK_START,
  RULE_OF_LAW_RATE,
  RULE_OF_LAW_START,
} from '../balance.ts';
import {
  findAnticorruption,
  findTransparency,
  type AnticorruptionPosture,
  type TransparencyRegime,
} from '../content/integrity.ts';
import type { Integrity } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp100 = (v: number) => clamp(v, 0, 100);
const toward = (now: number, target: number, rate: number) => now + (target - now) * rate;

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export function buildIntegrity(): Integrity {
  return {
    transparency: 'limited',
    anticorruption: 'nominal',
    corruptionIndex: CORRUPTION_INDEX_START,
    ruleOfLaw: RULE_OF_LAW_START,
    regulatoryStock: REGULATORY_STOCK_START,
    auditsLaunched: 0,
    history: [],
  };
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/** What the regulatory stock is worth as an administrative-quality figure, 0–100. */
export function regulatoryQuality(integrity: Integrity): number {
  return clamp100(100 - (integrity.regulatoryStock - REGULATORY_STOCK_START) * 30);
}

export function describeIntegrity(integrity: Integrity): string {
  if (integrity.corruptionIndex > 60) {
    return 'Everyone doing business with this government budgets for it as a line item. Nobody calls it that.';
  }
  if (integrity.ruleOfLaw < 35) {
    return 'The rules exist. Whether they apply to you depends on who you are, which is the actual definition of the problem.';
  }
  if (integrity.regulatoryStock > 1.8) {
    return 'Nobody in the building can any longer explain the whole rulebook, which is where a great deal of ordinary, unglamorous corruption lives.';
  }
  return 'An ordinary state: some patronage, some paperwork, mostly even-handed.';
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

export interface IntegrityInputs {
  /** Share of the sitting cabinet whose appointment was a payment, 0–1. */
  patronageShare: number;
  /** The courts' independence — unaccountable courts let corruption persist. */
  judicialIndependence: number;
  /** Police corruption, which spills a little into the general figure. */
  policingCorruption: number;
  /** Bills enacted so far this run. */
  billsPassed: number;
  turn: number;
}

export interface IntegrityTick {
  integrity: Integrity;
  /** True the week the corruption index first crosses into "everyone budgets for it". */
  endemic: boolean;
}

export function stepIntegrity(integrity: Integrity, inputs: IntegrityInputs): IntegrityTick {
  const transparency = findTransparency(integrity.transparency);
  const anticorruption = findAnticorruption(integrity.anticorruption);

  const corruptionTarget = clamp100(
    CORRUPTION_INDEX_START +
      inputs.patronageShare * 30 -
      transparency.corruptionCheck * 30 -
      anticorruption.corruptionCheck * 30 +
      (100 - inputs.judicialIndependence) * 0.15 +
      inputs.policingCorruption * 0.2,
  );
  const corruptionIndex = clamp100(
    toward(integrity.corruptionIndex, corruptionTarget, CORRUPTION_INDEX_RATE),
  );

  const regulatoryTarget = REGULATORY_STOCK_START + inputs.billsPassed * REGULATORY_STOCK_PER_BILL;
  const regulatoryStock = clamp(
    toward(integrity.regulatoryStock, regulatoryTarget, REGULATORY_STOCK_RATE),
    REGULATORY_STOCK_START * 0.4,
    4,
  );

  const ruleOfLawTarget = clamp100(
    inputs.judicialIndependence * 0.4 +
      (100 - corruptionIndex) * 0.4 +
      regulatoryQuality({ ...integrity, regulatoryStock }) * 0.2,
  );
  const ruleOfLaw = clamp100(toward(integrity.ruleOfLaw, ruleOfLawTarget, RULE_OF_LAW_RATE));

  const next: Integrity = {
    ...integrity,
    corruptionIndex,
    ruleOfLaw,
    regulatoryStock,
    history: [
      ...integrity.history,
      { turn: inputs.turn, corruptionIndex, ruleOfLaw, regulatoryStock },
    ].slice(-208),
  };

  return {
    integrity: next,
    endemic: corruptionIndex > 60 && integrity.corruptionIndex <= 60,
  };
}

/* ------------------------------------------------------------------ *
 * Decisions
 * ------------------------------------------------------------------ */

export function setTransparency(integrity: Integrity, regime: TransparencyRegime): Integrity {
  return { ...integrity, transparency: regime };
}

export function setAnticorruption(integrity: Integrity, posture: AnticorruptionPosture): Integrity {
  return { ...integrity, anticorruption: posture };
}

/** What one more audit is worth this run — less than the last one. */
export function auditValue(integrity: Integrity): number {
  return AUDIT_EFFECT * AUDIT_DECAY ** integrity.auditsLaunched;
}

export function launchAudit(integrity: Integrity): Integrity {
  return {
    ...integrity,
    corruptionIndex: clamp(integrity.corruptionIndex - auditValue(integrity), 0, 100),
    auditsLaunched: integrity.auditsLaunched + 1,
  };
}

export function simplifyLaw(integrity: Integrity, effect: number): Integrity {
  return {
    ...integrity,
    regulatoryStock: clamp(integrity.regulatoryStock - effect, REGULATORY_STOCK_START * 0.4, 4),
  };
}
