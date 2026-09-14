import { describe, expect, it } from 'vitest';
import { MAX_DISTANCE, affinity, affinityLabel, axisLabel, distance, makeIdeology, normalisedDistance, weightedCentroid } from '../ideology.ts';
import { PARTY_TEMPLATES } from '../content/parties.ts';

describe('position maths', () => {
  it('clamps every axis into −1..1', () => {
    const extreme = makeIdeology(5, -9, 0.5);
    expect(extreme.economic).toBe(1);
    expect(extreme.social).toBe(-1);
    expect(extreme.environmental).toBe(0.5);
  });

  it('reports zero distance from a position to itself', () => {
    const position = makeIdeology(0.3, -0.4, 0.8);
    expect(distance(position, position)).toBe(0);
    expect(affinity(position, position)).toBe(1);
  });

  it('is symmetric', () => {
    const a = makeIdeology(0.4, -0.2, 0.9);
    const b = makeIdeology(-0.6, 0.3, -0.1);
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 10);
    expect(affinity(a, b)).toBeCloseTo(affinity(b, a), 10);
  });

  it('keeps normalised distance within 0..1 even past the calibrated maximum', () => {
    const corner = normalisedDistance(makeIdeology(1, 1, 1), makeIdeology(-1, -1, -1));
    expect(corner).toBeLessThanOrEqual(1);
    expect(corner).toBeGreaterThan(0.9);
    expect(affinity(makeIdeology(1, 1, 1), makeIdeology(-1, -1, -1))).toBeGreaterThanOrEqual(-1);
  });
});

describe('affinity calibration', () => {
  /**
   * Normalising against the cube's theoretical diagonal (sqrt(12)) squeezed
   * every real party pair into the friendly half of the scale, so everyone at
   * the negotiating table read as a natural ally. These assertions keep the
   * scale calibrated to the range positions actually occupy.
   */
  it('is calibrated below the cube diagonal', () => {
    expect(MAX_DISTANCE).toBeLessThan(Math.sqrt(12));
  });

  it('spreads the real party roster across both halves of the scale', () => {
    const values: number[] = [];
    for (let i = 0; i < PARTY_TEMPLATES.length; i += 1) {
      for (let j = i + 1; j < PARTY_TEMPLATES.length; j += 1) {
        values.push(affinity(PARTY_TEMPLATES[i]!.ideology, PARTY_TEMPLATES[j]!.ideology));
      }
    }
    expect(Math.min(...values)).toBeLessThan(-0.25);
    expect(Math.max(...values)).toBeGreaterThan(0.35);
  });

  it('makes the market and ecological parties the most opposed pair', () => {
    const enterprise = PARTY_TEMPLATES.find((p) => p.id === 'enterprise')!;
    const verdant = PARTY_TEMPLATES.find((p) => p.id === 'verdant')!;
    const worst = affinity(enterprise.ideology, verdant.ideology);

    for (let i = 0; i < PARTY_TEMPLATES.length; i += 1) {
      for (let j = i + 1; j < PARTY_TEMPLATES.length; j += 1) {
        expect(affinity(PARTY_TEMPLATES[i]!.ideology, PARTY_TEMPLATES[j]!.ideology)).toBeGreaterThanOrEqual(worst);
      }
    }
  });

  it('labels the whole range without gaps', () => {
    const labels = new Set<string>();
    for (let v = -1; v <= 1.0001; v += 0.05) labels.add(affinityLabel(v));
    expect(labels.size).toBeGreaterThanOrEqual(4);
  });
});

describe('descriptive labels stay neutral', () => {
  it('never implies a position is correct', () => {
    const forbidden = /\b(good|bad|right|wrong|better|worse|correct|extremist|sensible)\b/i;
    for (const axis of ['economic', 'social', 'environmental'] as const) {
      for (let v = -1; v <= 1.0001; v += 0.1) {
        expect(axisLabel(axis, v)).not.toMatch(forbidden);
      }
    }
    for (let v = -1; v <= 1.0001; v += 0.05) {
      expect(affinityLabel(v)).not.toMatch(forbidden);
    }
  });

  it('describes a balanced position as balanced on every axis', () => {
    for (const axis of ['economic', 'social', 'environmental'] as const) {
      expect(axisLabel(axis, 0)).toBe('balanced');
    }
  });
});

describe('weightedCentroid', () => {
  it('returns the origin for an empty or weightless set', () => {
    expect(weightedCentroid([])).toEqual(makeIdeology(0, 0, 0));
    expect(weightedCentroid([{ ideology: makeIdeology(1, 1, 1), weight: 0 }])).toEqual(
      makeIdeology(0, 0, 0),
    );
  });

  it('weights members by their seats', () => {
    const result = weightedCentroid([
      { ideology: makeIdeology(1, 0, 0), weight: 3 },
      { ideology: makeIdeology(-1, 0, 0), weight: 1 },
    ]);
    expect(result.economic).toBeCloseTo(0.5, 6);
  });
});
