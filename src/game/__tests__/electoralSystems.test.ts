import { describe, expect, it } from 'vitest';
import {
  allocateDHondt,
  allocateLargestRemainder,
  allocateMixedMember,
  allocateSainteLague,
  contestFptp,
  contestPreferential,
  contestTwoRound,
  gallagherIndex,
  leader,
  normalise,
  preferenceOrder,
  runInstantRunoff,
  runTwoRound,
  tallyDistricts,
  type DistrictVote,
  type PartyPosition,
} from '../systems/electoralSystems.ts';
import { makeIdeology } from '../ideology.ts';

const positions: PartyPosition[] = [
  { id: 'left', ideology: makeIdeology(-0.7, 0.3, 0.2) },
  { id: 'centre', ideology: makeIdeology(0, 0.1, 0) },
  { id: 'right', ideology: makeIdeology(0.7, -0.2, -0.3) },
  { id: 'green', ideology: makeIdeology(-0.3, 0.5, 0.9) },
];

const sum = (obj: Record<string, number>) => Object.values(obj).reduce((a, b) => a + b, 0);

describe('helpers', () => {
  it('normalises to shares summing to 1', () => {
    expect(sum(normalise({ a: 3, b: 1 }))).toBeCloseTo(1, 10);
    expect(normalise({ a: 3, b: 1 }).a).toBeCloseTo(0.75, 10);
  });

  it('survives an all-zero input without dividing by zero', () => {
    const result = normalise({ a: 0, b: 0 });
    expect(Number.isFinite(result.a!)).toBe(true);
  });

  it('breaks leadership ties deterministically on id', () => {
    expect(leader({ zed: 0.5, alpha: 0.5 })).toBe('alpha');
    expect(leader({})).toBeNull();
  });
});

describe('proportional allocation', () => {
  const shares = { left: 0.41, centre: 0.31, right: 0.2, green: 0.08 };

  it('allocates exactly the seats available, in all three methods', () => {
    for (const seats of [3, 10, 25, 180]) {
      expect(sum(allocateLargestRemainder(shares, seats))).toBe(seats);
      expect(sum(allocateDHondt(shares, seats))).toBe(seats);
      expect(sum(allocateSainteLague(shares, seats))).toBe(seats);
    }
  });

  it('never allocates a negative seat count', () => {
    for (const method of [allocateLargestRemainder, allocateDHondt, allocateSainteLague]) {
      for (const value of Object.values(method(shares, 7))) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("d'Hondt favours the largest party over Sainte-Lague", () => {
    /* The classic difference between the two divisors. */
    const dhondt = allocateDHondt(shares, 10);
    const sainte = allocateSainteLague(shares, 10);
    expect(dhondt.left!).toBeGreaterThanOrEqual(sainte.left!);
    expect(dhondt.green!).toBeLessThanOrEqual(sainte.green!);
  });

  it('is deterministic across repeated runs', () => {
    expect(allocateDHondt(shares, 13)).toEqual(allocateDHondt(shares, 13));
    expect(allocateLargestRemainder(shares, 13)).toEqual(allocateLargestRemainder(shares, 13));
  });

  it('gives every seat to a party with all the votes', () => {
    expect(allocateDHondt({ left: 1, right: 0 }, 9).left).toBe(9);
  });
});

describe('preference transfers', () => {
  it('orders a party’s preferences by ideological closeness', () => {
    /*
     * From left, centre is nearer than green: green shares the economic and
     * social axes but sits a long way off on the environmental one, which the
     * distance metric counts in full.
     */
    const order = preferenceOrder(positions[0]!, positions); // left
    expect(order).toEqual(['centre', 'green', 'right']);
  });

  it('puts the most distant party last for every party', () => {
    expect(preferenceOrder(positions[0]!, positions).at(-1)).toBe('right'); // left
    expect(preferenceOrder(positions[2]!, positions).at(-1)).toBe('green'); // right
  });

  it('never includes the party itself', () => {
    for (const position of positions) {
      expect(preferenceOrder(position, positions)).not.toContain(position.id);
    }
  });
});

describe('instant runoff', () => {
  it('declares an outright majority immediately', () => {
    const result = runInstantRunoff({ left: 0.6, right: 0.4 }, positions);
    expect(result.winner).toBe('left');
    expect(result.rounds).toHaveLength(1);
  });

  it('eliminates the weakest and transfers along the ideological grain', () => {
    /* Green is weakest; its votes should flow to left, not right. */
    const result = runInstantRunoff({ left: 0.36, right: 0.42, green: 0.22 }, positions);
    expect(result.winner).toBe('left');
    expect(result.rounds[0]!.eliminated).toBe('green');
  });

  it('can produce a different winner from first-past-the-post', () => {
    const shares = { left: 0.36, right: 0.42, green: 0.22 };
    expect(leader(shares)).toBe('right');
    expect(runInstantRunoff(shares, positions).winner).toBe('left');
  });

  it('always returns a winner that received votes', () => {
    const shares = { left: 0.3, centre: 0.25, right: 0.25, green: 0.2 };
    const result = runInstantRunoff(shares, positions);
    expect(Object.keys(shares)).toContain(result.winner);
  });

  it('terminates on a perfect tie rather than looping', () => {
    const result = runInstantRunoff({ left: 0.25, centre: 0.25, right: 0.25, green: 0.25 }, positions);
    expect(result.winner).toBeTruthy();
    expect(result.rounds.length).toBeLessThanOrEqual(positions.length + 2);
  });

  it('handles a single candidate', () => {
    expect(runInstantRunoff({ left: 1 }, positions).winner).toBe('left');
  });
});

describe('two-round runoff', () => {
  it('skips the second round on an outright majority', () => {
    const result = runTwoRound({ left: 0.55, right: 0.45 }, positions);
    expect(result.winner).toBe('left');
    expect(result.rounds).toHaveLength(1);
  });

  it('sends eliminated voters to whichever finalist is closer to them', () => {
    /* green's voters prefer left over right, flipping the result. */
    const result = runTwoRound({ right: 0.44, left: 0.36, green: 0.2 }, positions);
    expect(result.rounds).toHaveLength(2);
    expect(result.winner).toBe('left');
  });

  it('splits an unknown party’s vote rather than discarding it', () => {
    const result = runTwoRound({ left: 0.4, right: 0.4, mystery: 0.2 }, positions);
    expect(sum(result.rounds[1]!.shares)).toBeCloseTo(1, 8);
  });
});

describe('district contests', () => {
  const districts: DistrictVote[] = [
    { districtId: 'd1', regionId: 'r', shares: { left: 0.5, right: 0.3, green: 0.2 } },
    { districtId: 'd2', regionId: 'r', shares: { left: 0.2, right: 0.6, green: 0.2 } },
    { districtId: 'd3', regionId: 'r', shares: { left: 0.36, right: 0.42, green: 0.22 } },
  ];

  it('gives first past the post one seat per district', () => {
    const seats = tallyDistricts(contestFptp(districts));
    expect(sum(seats)).toBe(districts.length);
  });

  it('produces a different parliament under preferential counting', () => {
    const fptp = tallyDistricts(contestFptp(districts));
    const preferential = tallyDistricts(contestPreferential(districts, positions));
    expect(sum(preferential)).toBe(districts.length);
    /* d3 flips on transfers, so the two tallies differ. */
    expect(preferential).not.toEqual(fptp);
  });

  it('produces a full tally under two-round counting', () => {
    expect(sum(tallyDistricts(contestTwoRound(districts, positions)))).toBe(districts.length);
  });

  it('records the rounds for preferential and two-round contests', () => {
    expect(contestPreferential(districts, positions)[2]!.rounds!.length).toBeGreaterThan(1);
    expect(contestTwoRound(districts, positions)[2]!.rounds!.length).toBeGreaterThan(1);
  });
});

describe('mixed-member proportional', () => {
  const nationalShares = { left: 0.4, centre: 0.3, right: 0.2, green: 0.1 };

  it('fills exactly the list seats available', () => {
    const districtSeats = { left: 30, centre: 10, right: 8, green: 2 };
    const { list } = allocateMixedMember(districtSeats, nationalShares, 50);
    expect(sum(list)).toBe(50);
  });

  it('corrects toward proportionality', () => {
    /* Left is heavily over-represented on districts; the list should not add to it much. */
    const districtSeats = { left: 45, centre: 3, right: 2, green: 0 };
    const { total } = allocateMixedMember(districtSeats, nationalShares, 50);
    const chamber = sum(total);

    const districtGallagher = gallagherIndex(nationalShares, districtSeats);
    const totalGallagher = gallagherIndex(nationalShares, total);
    expect(totalGallagher).toBeLessThan(districtGallagher);
    expect(chamber).toBe(100);
  });

  it('lets a party keep district seats beyond its proportional share', () => {
    const districtSeats = { left: 60, centre: 0, right: 0, green: 0 };
    const { total } = allocateMixedMember(districtSeats, nationalShares, 20);
    expect(total.left!).toBeGreaterThanOrEqual(60);
  });

  it('falls back to a straight proportional list when nobody is short', () => {
    const districtSeats = { left: 90, centre: 0, right: 0, green: 0 };
    const { list } = allocateMixedMember(districtSeats, { left: 1 }, 10);
    expect(sum(list)).toBe(10);
  });
});

describe('disproportionality', () => {
  it('is zero when seats mirror votes', () => {
    expect(gallagherIndex({ a: 0.5, b: 0.5 }, { a: 50, b: 50 })).toBeCloseTo(0, 8);
  });

  it('rises as a result departs from the votes cast', () => {
    const fair = gallagherIndex({ a: 0.5, b: 0.5 }, { a: 52, b: 48 });
    const skewed = gallagherIndex({ a: 0.5, b: 0.5 }, { a: 90, b: 10 });
    expect(skewed).toBeGreaterThan(fair);
  });

  it('is zero for an empty chamber rather than NaN', () => {
    expect(gallagherIndex({ a: 1 }, {})).toBe(0);
  });

  it('ranks the systems as political science expects', () => {
    /*
     * Same votes, four counts. First past the post should distort most and
     * proportional least — if this ever inverts, something is wrong.
     */
    const districts: DistrictVote[] = Array.from({ length: 30 }, (_, i) => ({
      districtId: `d${i}`,
      regionId: 'r',
      /* Left leads almost everywhere by a little: the classic FPTP landslide. */
      shares: { left: 0.4 + (i % 3) * 0.01, right: 0.34, centre: 0.16, green: 0.1 },
    }));
    const votes = { left: 0.41, right: 0.34, centre: 0.16, green: 0.09 };

    const fptp = gallagherIndex(votes, tallyDistricts(contestFptp(districts)));
    const proportional = gallagherIndex(votes, allocateLargestRemainder(votes, 30));

    expect(fptp).toBeGreaterThan(proportional);
    expect(proportional).toBeLessThan(5);
  });
});
