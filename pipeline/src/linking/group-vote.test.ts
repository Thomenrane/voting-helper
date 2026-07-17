/**
 * Derivation of one party's RAW vote on a plenary vote from its group's
 * nominal ballots (#23 acceptance criterion): strict plurality among
 * oui/non/abstention. A tie or an empty tally yields null — the party gets
 * NO linked vote rather than an invented one.
 */
import { describe, expect, it } from 'vitest';

import type { GroupTally } from '../votes/votes.types.ts';
import { groupMajorityVote } from './group-vote.ts';

function tally(oui: number, non: number, abstention: number): GroupTally {
  return { group: 'Demo', oui, non, abstention };
}

describe('groupMajorityVote', () => {
  it('returns the strict plurality position', () => {
    expect(groupMajorityVote(tally(12, 2, 1))).toBe('oui');
    expect(groupMajorityVote(tally(0, 9, 3))).toBe('non');
    expect(groupMajorityVote(tally(1, 2, 10))).toBe('abstention');
  });

  it('returns the position of a unanimous group', () => {
    expect(groupMajorityVote(tally(15, 0, 0))).toBe('oui');
  });

  it('returns null on a tie — no vote is invented for a split group', () => {
    expect(groupMajorityVote(tally(5, 5, 1))).toBeNull();
    expect(groupMajorityVote(tally(3, 3, 3))).toBeNull();
    expect(groupMajorityVote(tally(0, 2, 2))).toBeNull();
  });

  it('returns null when the group cast no ballot at all', () => {
    expect(groupMajorityVote(tally(0, 0, 0))).toBeNull();
  });
});
