/**
 * budget.ts — sector health, revenue, deficit and debt.
 *
 * The long-run tension the design asks for lives here: deficit spending is
 * available and often correct in the short term, but debt service scales and
 * eventually crowds out the programmes that were borrowed for.
 */

import {
  DEBT_INTEREST_RATE,
  DIFFICULTY,
  POLICY_RATE_NEUTRAL,
  SECTOR_BASELINE_FUNDING,
  SECTOR_DRIFT_RATE,
  SECTOR_KEYS,
  SURPLUS_TO_DEBT_RATIO,
} from '../balance.ts';
import type { Difficulty, Economy, Sector, SectorKey } from '../types.ts';
import { computeRevenueFromGdp } from './economy.ts';

/**
 * The health a sector settles at for a given funding level.
 *
 *   equilibrium(f) = 100 · f / (f + k),  k = baseline · 2/3
 *
 * Chosen so that funding at the sector's baseline yields exactly 60, and so
 * that returns diminish honestly: for health, ₡30bn → 60, ₡60bn → 75,
 * ₡120bn → 85.7. Doubling spend never doubles outcome.
 */
export function sectorEquilibrium(key: SectorKey, funding: number): number {
  const baseline = SECTOR_BASELINE_FUNDING[key];
  const k = (baseline * 2) / 3;
  const f = Math.max(0, funding);
  if (f + k === 0) return 0;
  return (100 * f) / (f + k);
}

/**
 * One turn of drift toward equilibrium. Underfunded sectors fall faster than
 * overfunded ones rise — neglect compounds quicker than investment pays off.
 */
export function driftSectorHealth(
  key: SectorKey,
  health: number,
  funding: number,
  difficulty: Difficulty,
): number {
  const profile = DIFFICULTY[difficulty];
  const target = sectorEquilibrium(key, funding);
  const gap = target - health;
  const rate = gap < 0 ? SECTOR_DRIFT_RATE * profile.decayPressure : SECTOR_DRIFT_RATE;
  return clamp01to100(health + gap * rate);
}

export function clamp01to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Per-turn tax take.
 *
 * A share of output, so a slump compounds fiscally on its own: the month
 * unemployment rises is also the month revenue falls and the deficit widens
 * before the government has decided anything at all.
 */
export function computeRevenue(gdp: number, revenueModifier: number): number {
  return computeRevenueFromGdp(gdp, revenueModifier);
}

/**
 * Interest charged this turn on outstanding debt.
 *
 * It follows the central bank's policy rate, which the government does not
 * set. This is the second half of the bill for stimulus: spend into a closed
 * output gap, inflation rises, the bank raises rates, and the debt you took
 * on to do it costs more to carry. At the neutral rate this is exactly the
 * flat rate the game was previously tuned against, so nothing about the
 * baseline difficulty moves — only its response to the cycle.
 */
export function computeDebtService(debt: number, policyRate = POLICY_RATE_NEUTRAL): number {
  const relative = Math.max(0.35, policyRate / POLICY_RATE_NEUTRAL);
  return Math.max(0, debt) * DEBT_INTEREST_RATE * relative;
}

export function totalFunding(sectors: readonly Sector[]): number {
  return sectors.reduce((sum, sector) => sum + sector.funding, 0);
}

export interface FiscalTick {
  revenue: number;
  spending: number;
  debtService: number;
  /** revenue − spending − debtService. Negative is a deficit. */
  balance: number;
  /** Change applied to treasury this turn. */
  treasuryDelta: number;
  /** Change applied to debt this turn. */
  debtDelta: number;
}

/**
 * The fiscal impulse the economy feels, ₡bn.
 *
 * Positive when the government is injecting more than it takes out. This is
 * what `stepEconomy` reads, and it is the only channel through which a budget
 * decision reaches growth — deliberately one number, so the chain from a
 * funding slider to an unemployment rate stays traceable.
 */
export function fiscalImpulse(tick: FiscalTick): number {
  return -tick.balance;
}

/**
 * Resolve one turn of public finances.
 *
 * A deficit is financed by new debt. A surplus pays down debt first (at
 * SURPLUS_TO_DEBT_RATIO) and banks the remainder, so a disciplined government
 * digs itself out gradually rather than instantly.
 */
export function resolveFiscalTurn(
  sectors: readonly Sector[],
  economy: Economy,
  revenueModifier: number,
  debt: number,
): FiscalTick {
  const revenue = computeRevenue(economy.gdp, revenueModifier);
  const spending = totalFunding(sectors);
  const debtService = computeDebtService(debt, economy.policyRate);
  const balance = revenue - spending - debtService;

  if (balance < 0) {
    return {
      revenue,
      spending,
      debtService,
      balance,
      treasuryDelta: 0,
      debtDelta: -balance,
    };
  }

  const toDebt = Math.min(debt, balance * SURPLUS_TO_DEBT_RATIO);
  return {
    revenue,
    spending,
    debtService,
    balance,
    treasuryDelta: balance - toDebt,
    debtDelta: -toDebt,
  };
}

/** Average health across all five sectors. Drives the approval target. */
export function averageSectorHealth(sectors: readonly Sector[]): number {
  if (sectors.length === 0) return 0;
  return sectors.reduce((sum, s) => sum + s.health, 0) / sectors.length;
}

export function findSector(sectors: readonly Sector[], key: SectorKey): Sector {
  const found = sectors.find((s) => s.key === key);
  if (!found) throw new Error(`budget: missing sector ${key}`);
  return found;
}

/**
 * "What this does next turn" for the Budget Room. Pure projection — it runs
 * the same drift the resolution phase will run, so the preview cannot lie.
 */
export interface BudgetProjection {
  key: SectorKey;
  currentHealth: number;
  projectedHealth: number;
  equilibrium: number;
  funding: number;
}

export function projectBudget(
  sectors: readonly Sector[],
  difficulty: Difficulty,
): BudgetProjection[] {
  return SECTOR_KEYS.map((key) => {
    const sector = findSector(sectors, key);
    return {
      key,
      currentHealth: sector.health,
      projectedHealth: driftSectorHealth(key, sector.health, sector.funding, difficulty),
      equilibrium: sectorEquilibrium(key, sector.funding),
      funding: sector.funding,
    };
  });
}
