/**
 * budget.ts — sector health, revenue, deficit and debt.
 *
 * The long-run tension the design asks for lives here: deficit spending is
 * available and often correct in the short term, but debt service scales and
 * eventually crowds out the programmes that were borrowed for.
 */

import {
  DEBT_INTEREST_RATE,
  perYear,
  DIFFICULTY,
  POLICY_RATE_NEUTRAL,
  SECTOR_BASELINE_FUNDING,
  SECTOR_DRIFT_RATE,
  SECTOR_KEYS,
  SURPLUS_TO_DEBT_RATIO,
} from '../balance.ts';
import type { Bond, Difficulty, Economy, Sector, SectorKey, TaxCode } from '../types.ts';
import { computeRevenueFromGdp } from './economy.ts';
import { couponsDue } from './publicFinance.ts';
import { turnReceipts } from './taxation.ts';

/**
 * The health a sector settles at for a given funding level.
 *
 *   equilibrium(f) = 100 · f / (f + k),  k = baseline · 2/3
 *
 * Chosen so that funding at the sector's baseline yields exactly 60, and so
 * that returns diminish honestly: for health, ₡30bn → 60, ₡60bn → 75,
 * ₡120bn → 85.7. Doubling spend never doubles outcome.
 */
export function sectorEquilibrium(key: SectorKey, funding: number, moneyScale = 1): number {
  const baseline = SECTOR_BASELINE_FUNDING[key] * moneyScale;
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
  /** Points added to the equilibrium by things other than money — a carbon
      price on the environment, an excise on health. */
  externalNudge = 0,
  moneyScale = 1,
): number {
  const profile = DIFFICULTY[difficulty];
  const target = clamp01to100(sectorEquilibrium(key, funding, moneyScale) + externalNudge);
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
export function computeRevenue(
  gdp: number,
  revenueModifier: number,
  taxes?: TaxCode,
  /**
   * How much of what is owed actually arrives, 0–1.
   *
   * Applied to the receipts and NOT to the legislative modifier, which is
   * a fixed annual sum somebody legislated rather than a tax anybody has
   * the option of not paying.
   */
  compliance = 1,
): number {
  /* With a tax code, receipts are the sum of what each instrument actually
     raises at its rate. Without one — a handful of tests care only about
     seat arithmetic — fall back to the flat share it is calibrated to. */
  /* `revenueModifier` is an ANNUAL figure carried by legislation, so it is
     divided here like every other annual amount. */
  return taxes
    ? turnReceipts(taxes, gdp) * compliance + perYear(revenueModifier)
    : computeRevenueFromGdp(gdp, perYear(revenueModifier)) * compliance;
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

/**
 * Everything the five sectors are funded at, ₡bn A YEAR.
 *
 * Annual, like the figures it sums. `resolveFiscalTurn` divides it down to
 * what is actually spent this week — in one place, so the unit can never
 * drift between the budget screen and the treasury.
 */
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
/**
 * How much demand the government is adding this turn.
 *
 * The PRIMARY balance, not the overall one: revenue against what the state
 * actually buys, with debt service left out.
 *
 * Coupons are a transfer to whoever holds the paper, and whoever holds the
 * paper mostly saves them. Counting them as stimulus produced the defect
 * this function was rewritten to fix — a country with a large inherited
 * debt read its own interest bill as a boom, the boom raised inflation, the
 * central bank raised rates, the higher rates raised the interest bill, and
 * the loop ran until the rate cap. Governing a heavily indebted country is
 * supposed to be hard. It is not supposed to be a source of growth.
 *
 * A small share is passed through, because some of it is spent.
 */
export const DEBT_SERVICE_PASS_THROUGH = 0.15;

export function fiscalImpulse(tick: FiscalTick): number {
  const primary = tick.revenue - tick.spending;
  return -(primary - tick.debtService * DEBT_SERVICE_PASS_THROUGH);
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
  /**
   * The actual bond book, when there is one.
   *
   * With it, debt service is the sum of the coupons on paper actually
   * issued — which is lower than the old flat rate, because the old flat
   * rate was an unexamined 10.8% a year. Debt was never punishing through
   * interest anyway: it bites through the rating, the spread it adds to
   * every future issue, and the voters who read the number. Those channels
   * are stronger now, and this one is honest.
   */
  bonds?: readonly Bond[],
  /** The rates the government is charging. */
  taxes?: TaxCode,
  /**
   * Spending outside the five programme sectors — maintenance and building.
   * Stated annually, like everything else on a budget.
   */
  otherSpending = 0,
  /**
   * The share of what is owed that is actually collected, 0–1.
   *
   * Trust, priced. A government the country does not believe in raises
   * materially less from identical rates, and cannot close the gap by
   * raising them — the part that depends on people deciding to comply is
   * exactly the part that has stopped.
   */
  compliance = 1,
): FiscalTick {
  const revenue = computeRevenue(economy.gdp, revenueModifier, taxes, compliance);
  /* Programme budgets are annual figures. This is the one place they are
     divided into what is actually spent this week. */
  const spending = perYear(totalFunding(sectors) + otherSpending);
  const debtService = bonds ? couponsDue(bonds) : computeDebtService(debt, economy.policyRate);
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
  moneyScale = 1,
): BudgetProjection[] {
  return SECTOR_KEYS.map((key) => {
    const sector = findSector(sectors, key);
    return {
      key,
      currentHealth: sector.health,
      projectedHealth: driftSectorHealth(
        key,
        sector.health,
        sector.funding,
        difficulty,
        0,
        moneyScale,
      ),
      equilibrium: sectorEquilibrium(key, sector.funding, moneyScale),
      funding: sector.funding,
    };
  });
}
