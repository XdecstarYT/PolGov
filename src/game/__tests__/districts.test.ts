import { describe, expect, it } from 'vitest';
import {
  buildDistricts,
  districtFavourability,
  meanDistortion,
  redrawBoundaries,
  segmentTotals,
} from '../systems/districts.ts';
import { buildRegions } from '../setup.ts';
import { Rng } from '../rng.ts';
import { makeIdeology } from '../ideology.ts';
import type { SegmentKey } from '../content/segments.ts';
import type { Region } from '../types.ts';

const region = (): Region => buildRegions().find((r) => r.id === 'halloway')!;

describe('district generation', () => {
  it('creates one district per seat', () => {
    for (const r of buildRegions()) {
      expect(buildDistricts(r, new Rng(1)).length).toBe(r.seats);
    }
  });

  it('conserves the region’s electorate exactly', () => {
    for (const r of buildRegions()) {
      const totals = segmentTotals(buildDistricts(r, new Rng(7)));
      for (const [segment, weight] of Object.entries(r.composition) as [SegmentKey, number][]) {
        expect(totals[segment]).toBeCloseTo(weight, 8);
      }
    }
  });

  it('gives districts distinct mixes rather than clones', () => {
    const districts = buildDistricts(region(), new Rng(3));
    const first = districts[0]!.composition.industrial_workers ?? 0;
    const differs = districts.some(
      (d) => Math.abs((d.composition.industrial_workers ?? 0) - first) > 1e-6,
    );
    expect(differs).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = buildDistricts(region(), new Rng(99));
    const b = buildDistricts(region(), new Rng(99));
    expect(a.map((d) => d.composition)).toEqual(b.map((d) => d.composition));
  });

  it('starts every district undistorted', () => {
    expect(meanDistortion(buildDistricts(region(), new Rng(2)))).toBe(0);
  });

  it('names districts as places', () => {
    const districts = buildDistricts(region(), new Rng(2));
    expect(districts[0]!.name).toContain('Halloway Basin');
    expect(new Set(districts.map((d) => d.name)).size).toBe(districts.length);
  });
});

describe('boundary redrawing', () => {
  const marketIdeology = makeIdeology(0.7, -0.1, -0.35);

  it('conserves every segment across the region — a gerrymander moves voters, it cannot create them', () => {
    const districts = buildDistricts(region(), new Rng(11));
    const before = segmentTotals(districts);
    const after = segmentTotals(redrawBoundaries(districts, marketIdeology, 1).districts);

    for (const segment of Object.keys(before) as SegmentKey[]) {
      expect(after[segment]).toBeCloseTo(before[segment]!, 6);
    }
  });

  it('raises the beneficiary’s favourability in the marginal seats', () => {
    const districts = buildDistricts(region(), new Rng(5));
    const result = redrawBoundaries(districts, marketIdeology, 0.9);

    const before = new Map(districts.map((d) => [d.id, districtFavourability(d, marketIdeology)]));
    const crackedImproved = result.cracked.filter((id) => {
      const after = result.districts.find((d) => d.id === id)!;
      return districtFavourability(after, marketIdeology) > before.get(id)!;
    });

    expect(crackedImproved.length).toBeGreaterThan(result.cracked.length / 2);
  });

  it('packs hostile voters into the conceded seat, making it worse still', () => {
    const districts = buildDistricts(region(), new Rng(5));
    const result = redrawBoundaries(districts, marketIdeology, 0.9);
    const sinkId = result.packed[0]!;

    const before = districtFavourability(districts.find((d) => d.id === sinkId)!, marketIdeology);
    const after = districtFavourability(
      result.districts.find((d) => d.id === sinkId)!,
      marketIdeology,
    );
    expect(after).toBeLessThan(before);
  });

  it('records distortion that never decreases', () => {
    let districts = buildDistricts(region(), new Rng(8));
    let previous = meanDistortion(districts);
    for (let i = 0; i < 4; i += 1) {
      districts = redrawBoundaries(districts, marketIdeology, 0.5).districts;
      const now = meanDistortion(districts);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBeLessThanOrEqual(1);
  });

  it('does nothing at zero intensity', () => {
    const districts = buildDistricts(region(), new Rng(4));
    const result = redrawBoundaries(districts, marketIdeology, 0);
    expect(result.distortionAdded).toBe(0);
    for (const district of result.districts) {
      const original = districts.find((d) => d.id === district.id)!;
      for (const key of Object.keys(district.composition) as SegmentKey[]) {
        expect(district.composition[key]).toBeCloseTo(original.composition[key]!, 8);
      }
    }
  });

  it('refuses to redraw a single-district region', () => {
    const tiny: Region = { ...region(), seats: 1 };
    const districts = buildDistricts(tiny, new Rng(1));
    const result = redrawBoundaries(districts, marketIdeology, 1);
    expect(result.distortionAdded).toBe(0);
    expect(result.cracked).toHaveLength(0);
  });

  it('never produces a negative segment weight', () => {
    let districts = buildDistricts(region(), new Rng(6));
    for (let i = 0; i < 10; i += 1) {
      districts = redrawBoundaries(districts, marketIdeology, 1).districts;
    }
    for (const district of districts) {
      for (const weight of Object.values(district.composition)) {
        expect(weight).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('favourability', () => {
  it('is higher where a position’s natural supporters live', () => {
    const districts = buildDistricts(region(), new Rng(12));
    const collectivist = makeIdeology(-0.65, 0.2, 0.1);
    const market = makeIdeology(0.75, -0.1, -0.35);
    /* Halloway is industrial and unionised. */
    const meanCollectivist =
      districts.reduce((s, d) => s + districtFavourability(d, collectivist), 0) / districts.length;
    const meanMarket =
      districts.reduce((s, d) => s + districtFavourability(d, market), 0) / districts.length;
    expect(meanCollectivist).toBeGreaterThan(meanMarket);
  });

  it('returns zero for an empty district rather than NaN', () => {
    expect(
      districtFavourability(
        { id: 'x', regionId: 'r', name: 'x', composition: {}, distortion: 0 },
        makeIdeology(0, 0, 0),
      ),
    ).toBe(0);
  });
});
