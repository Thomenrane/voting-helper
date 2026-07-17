/**
 * Derivation of the statement-relative position of a linked vote (m3 decision,
 * review of PR #28): the stored fields are the RAW group vote on the dossier
 * (`vote_groupe`) and the dossier's direction relative to the statement
 * (`direction_dossier`); the ±2/0 position is ALWAYS derived, never stored.
 *
 * Published table (docs/methodologie/criteres-liaison-votes.md):
 *   oui × soutient = +2, oui × contredit = −2, abstention × * = 0,
 *   non × soutient = −2, non × contredit = +2.
 */
import { describe, expect, it } from 'vitest';

import { deriveRelativeVote, deriveVotePosition } from './linked-vote.ts';

describe('deriveVotePosition — raw group vote × dossier direction', () => {
  it('maps oui on a supporting dossier to +2', () => {
    expect(deriveVotePosition('oui', 'soutient')).toBe(2);
  });

  it('maps oui on a contradicting dossier to −2', () => {
    expect(deriveVotePosition('oui', 'contredit')).toBe(-2);
  });

  it('maps abstention to 0 regardless of the dossier direction', () => {
    expect(deriveVotePosition('abstention', 'soutient')).toBe(0);
    expect(deriveVotePosition('abstention', 'contredit')).toBe(0);
  });

  it('maps non on a supporting dossier to −2', () => {
    expect(deriveVotePosition('non', 'soutient')).toBe(-2);
  });

  it('maps non on a contradicting dossier to +2', () => {
    expect(deriveVotePosition('non', 'contredit')).toBe(2);
  });
});

describe('deriveRelativeVote — statement-relative reading of the raw vote', () => {
  it('keeps the raw vote as-is when the dossier supports the statement', () => {
    expect(deriveRelativeVote('oui', 'soutient')).toBe('oui');
    expect(deriveRelativeVote('abstention', 'soutient')).toBe('abstention');
    expect(deriveRelativeVote('non', 'soutient')).toBe('non');
  });

  it('inverts oui and non when the dossier contradicts the statement', () => {
    expect(deriveRelativeVote('oui', 'contredit')).toBe('non');
    expect(deriveRelativeVote('non', 'contredit')).toBe('oui');
    expect(deriveRelativeVote('abstention', 'contredit')).toBe('abstention');
  });

  it('is consistent with deriveVotePosition on every combination', () => {
    const value = { oui: 2, abstention: 0, non: -2 } as const;
    for (const vote of ['oui', 'abstention', 'non'] as const) {
      for (const direction of ['soutient', 'contredit'] as const) {
        expect(deriveVotePosition(vote, direction)).toBe(
          value[deriveRelativeVote(vote, direction)],
        );
      }
    }
  });
});
