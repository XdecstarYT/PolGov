/**
 * taxation.test.ts — who pays, and what they do about it.
 *
 * The property worth protecting here is that every instrument has a visible
 * revenue peak and the game does not hide it. A player who taxes capital
 * into the ground should collect less money and be able to see, beforehand,
 * exactly where that was going to start happening. A hidden wall would be a
 * punishment; a printed peak is a decision.
 */

import { describe, expect, it } from 'vitest';
import {
  TAX_TEMPLATES,
  baseSurviving,
  buildTaxCode,
  changeRawness,
  findTaxTemplate,
  forgetOldChanges,
  incidenceBySegment,
  incomeReliefFactor,
  instrumentYield,
  isPastPeak,
  marginalYield,
  turnReceipts,
  receiptsBreakdown,
  recordChange,
  revenuePeak,
  taxBurdenScore,
  taxEffects,
} from '../systems/taxation.ts';
import {
  GDP_START,
  REVENUE_GDP_SHARE,
  TAX_CHANGE_MEMORY_MONTHS,
  TURNS_PER_YEAR,
} from '../balance.ts';

const GDP = GDP_START;
const code = () => buildTaxCode();

describe('the inherited code', () => {
  it('raises what the rest of the game is balanced against', () => {
    const share = (turnReceipts(code(), GDP) * TURNS_PER_YEAR) / GDP;
    /* Within a point of the flat share every spending figure was tuned to.
       If this drifts, the country runs a structural deficit nobody chose. */
    expect(share).toBeGreaterThan(REVENUE_GDP_SHARE - 0.01);
    expect(share).toBeLessThan(REVENUE_GDP_SHARE + 0.01);
  });

  it('sets every instrument to its default, and no instrument past its peak', () => {
    const c = code();
    for (const template of TAX_TEMPLATES) {
      expect(c.rates[template.key]).toBe(template.defaultRate);
      expect(isPastPeak(template, template.defaultRate)).toBe(false);
    }
  });

  it('is led by the instruments that actually raise the money', () => {
    const rows = receiptsBreakdown(code(), GDP);
    /* Income tax and social contributions first, as in any real budget —
       not the loud narrow ones. */
    expect(['income', 'payroll']).toContain(rows[0]!.template.key);
    expect(rows[0]!.perTurn).toBeGreaterThan(rows[rows.length - 1]!.perTurn * 20);
  });
});

describe('the peak', () => {
  it('sits where revenue actually stops rising', () => {
    for (const template of TAX_TEMPLATES) {
      const peak = revenuePeak(template);
      if (peak >= template.maxRate) continue;
      const at = instrumentYield(template, peak, GDP);
      expect(at).toBeGreaterThanOrEqual(instrumentYield(template, peak - 0.02, GDP) - 1e-6);
      expect(at).toBeGreaterThanOrEqual(instrumentYield(template, peak + 0.02, GDP) - 1e-6);
    }
  });

  it('collects less past it — a legible mistake, not a hidden wall', () => {
    const corporate = findTaxTemplate('corporate');
    const peak = revenuePeak(corporate);
    expect(instrumentYield(corporate, peak + 0.15, GDP)).toBeLessThan(
      instrumentYield(corporate, peak, GDP),
    );
    expect(isPastPeak(corporate, peak + 0.15)).toBe(true);
  });

  it('puts mobile bases far below immobile ones', () => {
    /* Capital moves; land does not. The wealth tax peaks in the low single
       digits and the land tax essentially never does. */
    expect(revenuePeak(findTaxTemplate('wealth'))).toBeLessThan(
      revenuePeak(findTaxTemplate('land')),
    );
    expect(revenuePeak(findTaxTemplate('corporate'))).toBeLessThan(
      revenuePeak(findTaxTemplate('income')),
    );
  });

  it('never leaves a base below nothing', () => {
    for (const template of TAX_TEMPLATES) {
      expect(baseSurviving(template, template.maxRate)).toBeGreaterThanOrEqual(0);
      expect(instrumentYield(template, template.maxRate, GDP)).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports a shrinking marginal yield as the rate climbs', () => {
    const income = findTaxTemplate('income');
    const early = marginalYield(income, 0.1, GDP);
    const late = marginalYield(income, 0.5, GDP);
    expect(late).toBeLessThan(early);
    expect(early).toBeGreaterThan(0);
  });
});

describe('the income tax dials', () => {
  it('costs money to give deductions and credits', () => {
    const generous = { ...code(), deductions: 1, credits: 1 };
    expect(incomeReliefFactor(generous)).toBeLessThan(incomeReliefFactor(code()));
    expect(turnReceipts(generous, GDP)).toBeLessThan(turnReceipts(code(), GDP));
  });

  it('never gives so much relief that the tax raises nothing', () => {
    expect(incomeReliefFactor({ ...code(), deductions: 1, credits: 1 })).toBeGreaterThan(0);
  });

  it('collects the same money at any progressivity — it only moves who pays', () => {
    const flat = { ...code(), progressivity: 0 };
    const steep = { ...code(), progressivity: 1 };
    expect(turnReceipts(flat, GDP)).toBeCloseTo(turnReceipts(steep, GDP), 6);

    const flatIncidence = incidenceBySegment(flat, GDP);
    const steepIncidence = incidenceBySegment(steep, GDP);
    expect(steepIncidence.high_income ?? 0).toBeGreaterThan(flatIncidence.high_income ?? 0);
    expect(steepIncidence.low_income ?? 0).toBeLessThan(flatIncidence.low_income ?? 0);
  });
});

describe('incidence', () => {
  it('is nothing at all when nothing has changed', () => {
    const burden = incidenceBySegment(code(), GDP);
    for (const value of Object.values(burden)) expect(Math.abs(value)).toBeLessThan(1e-9);
  });

  it('falls on the people who actually pay the instrument', () => {
    const c = code();
    const fuel = { ...c, rates: { ...c.rates, fuel: 0.7 } };
    const burden = incidenceBySegment(fuel, GDP);
    /* A fuel tax is a rural tax. It is not an abstract unpopularity. */
    expect(burden.rural_households ?? 0).toBeGreaterThan(0);
    expect(burden.farmers ?? 0).toBeGreaterThan(0);
    expect(burden.students).toBeUndefined();
  });

  it('runs backwards for a cut', () => {
    const c = code();
    const cut = { ...c, rates: { ...c.rates, corporate: 0.05 } };
    expect(incidenceBySegment(cut, GDP).business_owners ?? 0).toBeLessThan(0);
  });

  it('can favour the very people a different instrument would hurt', () => {
    const c = code();
    /* A tariff protects the industries it shelters while costing everyone at
       the till — which is why its incidence on industrial workers is
       negative and on small traders positive. */
    const tariff = { ...c, rates: { ...c.rates, import_tariff: 0.2 } };
    const burden = incidenceBySegment(tariff, GDP);
    expect(burden.industrial_workers ?? 0).toBeLessThan(0);
    expect(burden.small_traders ?? 0).toBeGreaterThan(0);
  });
});

describe('the burden voters score', () => {
  it('sits near the middle on the code as inherited', () => {
    const score = taxBurdenScore(code(), GDP);
    expect(score).toBeGreaterThan(55);
    expect(score).toBeLessThan(80);
  });

  it('falls when the government raises more, and rises when it raises less', () => {
    const c = code();
    const heavier = { ...c, rates: { ...c.rates, gst: 0.2 } };
    const lighter = { ...c, rates: { ...c.rates, gst: 0.02 } };
    expect(taxBurdenScore(heavier, GDP)).toBeLessThan(taxBurdenScore(c, GDP));
    expect(taxBurdenScore(lighter, GDP)).toBeGreaterThan(taxBurdenScore(c, GDP));
  });

  it('stays inside 0..100 at any rate the machinery allows', () => {
    const maxed = {
      ...code(),
      rates: Object.fromEntries(TAX_TEMPLATES.map((t) => [t.key, t.maxRate])) as never,
    };
    const zeroed = {
      ...code(),
      rates: Object.fromEntries(TAX_TEMPLATES.map((t) => [t.key, 0])) as never,
    };
    for (const c of [maxed, zeroed]) {
      const score = taxBurdenScore(c, GDP);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('what tax does besides raise money', () => {
  it('does nothing at all on the code as inherited', () => {
    const effects = taxEffects(code());
    expect(effects.investment).toBeCloseTo(0, 10);
    expect(effects.prices).toBeCloseTo(0, 10);
    expect(Object.keys(effects.sectors)).toHaveLength(0);
  });

  it('discourages investment when capital is taxed harder', () => {
    const c = code();
    expect(taxEffects({ ...c, rates: { ...c.rates, corporate: 0.5 } }).investment).toBeLessThan(0);
  });

  it('puts a consumption tax into prices', () => {
    const c = code();
    expect(taxEffects({ ...c, rates: { ...c.rates, gst: 0.25 } }).prices).toBeGreaterThan(0);
  });

  it('lets a carbon price work even where it raises little', () => {
    const c = code();
    const priced = { ...c, rates: { ...c.rates, carbon: 0.3 } };
    /* Well past its revenue peak, so the money is poor — and the
       environment improves anyway, which is the point of the instrument. */
    expect(taxEffects(priced).sectors.environment ?? 0).toBeGreaterThan(0);
    expect(isPastPeak(findTaxTemplate('carbon'), 0.3)).toBe(false);
    expect(instrumentYield(findTaxTemplate('carbon'), 0.45, GDP)).toBeLessThan(
      instrumentYield(findTaxTemplate('carbon'), 0.3, GDP),
    );
  });
});

describe('the memory of a change', () => {
  it('is raw when it happens and gone by the time it is old', () => {
    const changed = recordChange(code(), 'gst', 0.1, 0.16, 10);
    expect(changeRawness(changed, 'gst', 10)).toBeCloseTo(1, 6);
    expect(changeRawness(changed, 'gst', 10 + TAX_CHANGE_MEMORY_MONTHS)).toBe(0);
    expect(changeRawness(changed, 'income', 10)).toBe(0);
  });

  it('is forgotten from the record once it is stale', () => {
    const changed = recordChange(code(), 'gst', 0.1, 0.16, 1);
    expect(forgetOldChanges(changed, 5).recentChanges).toHaveLength(1);
    expect(forgetOldChanges(changed, 1 + TAX_CHANGE_MEMORY_MONTHS).recentChanges).toHaveLength(0);
  });

  it('does not forget the revenue — only the resentment', () => {
    const changed = recordChange(code(), 'gst', 0.1, 0.2, 1);
    const withRate = { ...changed, rates: { ...changed.rates, gst: 0.2 } };
    const later = forgetOldChanges(withRate, 100);
    expect(later.rates.gst).toBe(0.2);
    expect(later.recentChanges).toHaveLength(0);
  });
});
