import { describe, expect, it } from 'vitest';

import type { PositionValue } from '@voting-helper/data';

import { computeDiscriminance } from './discriminance.ts';

function positions(...values: number[]): PositionValue[] {
  return values as PositionValue[];
}

describe('computeDiscriminance', () => {
  it('scores a full consensus at 0', () => {
    const result = computeDiscriminance(positions(2, 2, 2, 2, 2, 2));
    expect(result).toEqual({ score: 0, coded: 6 });
  });

  it('scores a shared neutral position at 0 — consensus on 0 is still consensus', () => {
    const result = computeDiscriminance(positions(0, 0, 0, 0));
    expect(result).toEqual({ score: 0, coded: 4 });
  });

  it('scores a perfectly balanced ±2 split at 1 (even party count)', () => {
    const result = computeDiscriminance(positions(2, 2, 2, -2, -2, -2));
    expect(result).toEqual({ score: 1, coded: 6 });
  });

  it('scores a maximally split odd party count at 1', () => {
    // n=3: pairs (2,2)=0, (2,−2)=4, (2,−2)=4 → sum 8 = 4·⌊3/2⌋·⌈3/2⌉.
    const result = computeDiscriminance(positions(2, 2, -2));
    expect(result).toEqual({ score: 1, coded: 3 });
  });

  it('scores two balanced ±1 camps at 0.5 — half the maximal spread', () => {
    const result = computeDiscriminance(positions(1, 1, 1, -1, -1, -1));
    expect(result.score).toBeCloseTo(0.5, 10);
  });

  it('scores a lone dissenter as near-consensus, below balanced ±1 camps', () => {
    // 11 parties at +2, one at −2: sum = 11·4 = 44, max = 4·6·6 = 144.
    const dissenter = computeDiscriminance(
      positions(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, -2),
    );
    expect(dissenter.score).toBeCloseTo(44 / 144, 10);

    const balancedMild = computeDiscriminance(
      positions(1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1),
    );
    // The ordering the formula was chosen for: a genuine two-camp split
    // discriminates more than a single ±2 outlier (variance gets this wrong).
    expect(balancedMild.score ?? 0).toBeGreaterThan(dissenter.score ?? 1);
  });

  it('increases as a consensus breaks into camps', () => {
    const consensus = computeDiscriminance(positions(1, 1, 1, 1));
    const mild = computeDiscriminance(positions(1, 1, 0, -1));
    const cleaving = computeDiscriminance(positions(2, 2, -2, -2));
    expect(consensus.score ?? 1).toBeLessThan(mild.score ?? 0);
    expect(mild.score ?? 1).toBeLessThan(cleaving.score ?? 0);
  });

  it('stays within [0, 1] on mixed distributions', () => {
    const result = computeDiscriminance(positions(2, 1, 0, -1, -2, 0, 1));
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it('returns null (not 0) when fewer than 2 positions are coded', () => {
    expect(computeDiscriminance(positions())).toEqual({ score: null, coded: 0 });
    expect(computeDiscriminance(positions(2))).toEqual({ score: null, coded: 1 });
  });
});
