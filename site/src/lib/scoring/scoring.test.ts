/**
 * Golden tests for the scoring engine — seam n°1 of the project (ticket #16).
 *
 * Every expected value is hand-computed from the published methodology
 * (ticket #8): score = 100 × (1 − mean(|answer − position| / 4)) over the
 * included statements, rounded to the nearest integer; exclusions never
 * count as neutral; a zero denominator yields null, never 0.
 */
import { describe, expect, it } from 'vitest';
import type { Party, PartyPosition, UserAnswers } from '@voting-helper/data';
import { scoreParties } from './scoring.ts';

/** Shorthand: a fully valid party × statement record. */
function record(
  partyId: string,
  statementId: string,
  programme: -2 | -1 | 0 | 1 | 2 | undefined,
  votes: Array<'oui' | 'abstention' | 'non'>,
  statut: 'valide' | 'en_attente' | 'rejete' = 'valide',
): PartyPosition {
  const base = {
    party_id: partyId,
    statement_id: statementId,
    votes_lies: votes.map((v, i) => ({
      id: `${partyId}-${statementId}-v${i + 1}`,
      date: '2025-01-01',
      dossier: 'DOC 56 0001/001',
      position_groupe: v,
      justification: 'Vote de test.',
    })),
    statut,
    derniere_revision: '2026-01-01',
  };
  if (programme === undefined) return base;
  return {
    ...base,
    position: programme,
    citation: {
      texte: 'Citation de test.',
      url_source: 'https://example.org/test.pdf',
      ref_snapshot: 'snapshots/test.pdf',
      page: 1,
    },
  };
}

const partyX: Party = { id: 'x', name: 'Parti X' };
const partyY: Party = { id: 'y', name: 'Parti Y' };

describe('scoreParties — nominal, multi-party', () => {
  const answers: UserAnswers = { s1: 2, s2: -1, s3: 0 };
  const positions: PartyPosition[] = [
    record('x', 's1', 2, ['oui']),
    record('x', 's2', -2, ['non']),
    record('x', 's3', 1, ['abstention']),
    record('y', 's1', -2, ['non']),
    record('y', 's2', 1, ['oui']),
    record('y', 's3', 0, ['abstention']),
  ];

  it('computes exact promesses and actes scores with full denominators', () => {
    const [x, y] = scoreParties(answers, [partyX, partyY], positions);
    // X promesses: dists/4 = 0, 0.25, 0.25 → mean 1/6 → 100×(5/6) = 83.33 → 83
    expect(x?.promesses).toEqual({ score: 83, denominator: 3 });
    // X actes: votes → +2, −2, 0 ; dists/4 = 0, 0.25, 0 → mean 1/12 → 91.67 → 92
    expect(x?.actes).toEqual({ score: 92, denominator: 3 });
    // Y promesses: dists/4 = 1, 0.5, 0 → mean 0.5 → 50
    expect(y?.promesses).toEqual({ score: 50, denominator: 3 });
    // Y actes: votes → −2, +2, 0 ; dists/4 = 1, 0.75, 0 → mean 7/12 → 41.67 → 42
    expect(y?.actes).toEqual({ score: 42, denominator: 3 });
  });

  it('computes the écart from the rounded scores and keeps parties in input order', () => {
    const [x, y] = scoreParties(answers, [partyX, partyY], positions);
    expect(x?.partyId).toBe('x');
    expect(y?.partyId).toBe('y');
    expect(x?.ecart).toBe(83 - 92);
    expect(x?.ecartMarquant).toBe(false);
    expect(y?.ecart).toBe(50 - 42);
    expect(y?.ecartMarquant).toBe(false);
  });

  it('never fuses the two scores into a single number', () => {
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x).not.toHaveProperty('score');
    expect(x).not.toHaveProperty('total');
  });
});

describe('scoreParties — « sans opinion »', () => {
  it('excludes the statement from BOTH scores and both denominators', () => {
    const answers: UserAnswers = { s1: 2, s2: 'sans_opinion' };
    const positions = [record('x', 's1', 1, ['oui']), record('x', 's2', 2, ['oui'])];
    const [x] = scoreParties(answers, [partyX], positions);
    // Only s1 counts: promesses |2−1|/4 = 0.25 → 75 ; actes |2−2|/4 = 0 → 100
    expect(x?.promesses).toEqual({ score: 75, denominator: 1 });
    expect(x?.actes).toEqual({ score: 100, denominator: 1 });
  });

  it('treats an unanswered statement like « sans opinion » (excluded from both)', () => {
    const answers: UserAnswers = { s1: 2 };
    const positions = [record('x', 's1', 2, ['oui']), record('x', 's2', -2, ['non'])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.promesses).toEqual({ score: 100, denominator: 1 });
    expect(x?.actes).toEqual({ score: 100, denominator: 1 });
  });
});

describe('scoreParties — missing programme position', () => {
  it('excludes the statement from promesses only, actes still counts it', () => {
    const answers: UserAnswers = { s1: 2, s2: 2 };
    const positions = [record('x', 's1', 2, ['oui']), record('x', 's2', undefined, ['non'])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.promesses).toEqual({ score: 100, denominator: 1 });
    // actes: dists/4 = 0 (s1) and 1 (s2) → mean 0.5 → 50
    expect(x?.actes).toEqual({ score: 50, denominator: 2 });
  });

  it('excludes a statement with no record at all from both scores', () => {
    const answers: UserAnswers = { s1: 2, s2: 2 };
    const positions = [record('x', 's1', 2, ['oui'])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.promesses).toEqual({ score: 100, denominator: 1 });
    expect(x?.actes).toEqual({ score: 100, denominator: 1 });
  });
});

describe('scoreParties — zero linked votes', () => {
  it('excludes the statement from actes only, promesses still counts it', () => {
    const answers: UserAnswers = { s1: 1, s2: -1 };
    const positions = [record('x', 's1', 1, []), record('x', 's2', 0, ['abstention'])];
    const [x] = scoreParties(answers, [partyX], positions);
    // promesses: dists/4 = 0 and 0.25 → mean 0.125 → 87.5 → 88
    expect(x?.promesses).toEqual({ score: 88, denominator: 2 });
    // actes: only s2 → |−1−0|/4 = 0.25 → 75
    expect(x?.actes).toEqual({ score: 75, denominator: 1 });
  });
});

describe('scoreParties — vote mapping and multiple linked votes', () => {
  it('maps oui/abstention/non to +2/0/−2 and averages multiple votes', () => {
    const answers: UserAnswers = { s1: 2 };
    const positions = [record('x', 's1', 2, ['oui', 'abstention'])];
    const [x] = scoreParties(answers, [partyX], positions);
    // vote position = (2 + 0) / 2 = +1 → |2−1|/4 = 0.25 → 75
    expect(x?.actes).toEqual({ score: 75, denominator: 1 });
  });
});

describe('scoreParties — contradiction « promesse vs vote »', () => {
  it('flags a statement whose programme and vote positions have opposite signs', () => {
    const answers: UserAnswers = { s1: 2 };
    const positions = [record('x', 's1', 2, ['non'])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.contradictions).toEqual(['s1']);
    expect(x?.promesses).toEqual({ score: 100, denominator: 1 });
    // actes: |2−(−2)|/4 = 1 → 0
    expect(x?.actes).toEqual({ score: 0, denominator: 1 });
    expect(x?.ecart).toBe(100);
    expect(x?.ecartMarquant).toBe(true);
  });

  it('flags in both directions (programme against, vote for)', () => {
    const answers: UserAnswers = { s1: 0 };
    const positions = [record('x', 's1', -1, ['oui'])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.contradictions).toEqual(['s1']);
  });

  it('does not flag when one side is neutral (abstention or position 0)', () => {
    const answers: UserAnswers = { s1: 1, s2: 1 };
    const positions = [record('x', 's1', 1, ['abstention']), record('x', 's2', 0, ['non'])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.contradictions).toEqual([]);
  });

  it('does not flag when programme position or votes are missing', () => {
    const answers: UserAnswers = { s1: 1, s2: 1 };
    const positions = [record('x', 's1', undefined, ['non']), record('x', 's2', 2, [])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.contradictions).toEqual([]);
  });
});

describe('scoreParties — zero denominator → null, never 0', () => {
  it('returns null scores when every statement is « sans opinion »', () => {
    const answers: UserAnswers = { s1: 'sans_opinion', s2: 'sans_opinion' };
    const positions = [record('x', 's1', 2, ['oui']), record('x', 's2', 1, ['oui'])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.promesses).toEqual({ score: null, denominator: 0 });
    expect(x?.actes).toEqual({ score: null, denominator: 0 });
    expect(x?.ecart).toBeNull();
    expect(x?.ecartMarquant).toBe(false);
  });

  it('returns null scores for a party with no records at all', () => {
    const answers: UserAnswers = { s1: 2 };
    const [x] = scoreParties(answers, [partyX], []);
    expect(x?.promesses).toEqual({ score: null, denominator: 0 });
    expect(x?.actes).toEqual({ score: null, denominator: 0 });
  });

  it('returns a null écart when only one dimension is scorable', () => {
    const answers: UserAnswers = { s1: 2 };
    const positions = [record('x', 's1', 2, [])];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.promesses).toEqual({ score: 100, denominator: 1 });
    expect(x?.actes).toEqual({ score: null, denominator: 0 });
    expect(x?.ecart).toBeNull();
    expect(x?.ecartMarquant).toBe(false);
  });
});

describe('scoreParties — review status', () => {
  it('ignores en_attente and rejete records entirely (scores and contradictions)', () => {
    const answers: UserAnswers = { s1: 2, s2: 2, s3: 2 };
    const positions = [
      record('x', 's1', 2, ['oui']),
      record('x', 's2', 2, ['non'], 'en_attente'),
      record('x', 's3', -2, ['non'], 'rejete'),
    ];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.promesses).toEqual({ score: 100, denominator: 1 });
    expect(x?.actes).toEqual({ score: 100, denominator: 1 });
    expect(x?.contradictions).toEqual([]);
  });
});

describe('scoreParties — écart marquant threshold', () => {
  it('flags an écart of exactly 15', () => {
    const answers: UserAnswers = { s1: 2, s2: 2, s3: 2, s4: 2, s5: 2 };
    const positions = [
      record('x', 's1', 2, ['oui', 'abstention']), // actes dist 0.25
      record('x', 's2', 2, ['abstention']), // actes dist 0.5
      record('x', 's3', 2, ['oui']),
      record('x', 's4', 2, ['oui']),
      record('x', 's5', 2, ['oui']),
    ];
    const [x] = scoreParties(answers, [partyX], positions);
    expect(x?.promesses).toEqual({ score: 100, denominator: 5 });
    // actes mean dist = (0.25 + 0.5) / 5 = 0.15 → 85
    expect(x?.actes).toEqual({ score: 85, denominator: 5 });
    expect(x?.ecart).toBe(15);
    expect(x?.ecartMarquant).toBe(true);
  });

  it('does not flag an écart below 15', () => {
    const answers: UserAnswers = { s1: 2, s2: 2, s3: 2, s4: 2, s5: 2 };
    const positions = [
      record('x', 's1', 2, ['oui', 'abstention']), // actes dist 0.25
      record('x', 's2', 2, ['oui', 'abstention']), // actes dist 0.25
      record('x', 's3', 2, ['oui']),
      record('x', 's4', 2, ['oui']),
      record('x', 's5', 2, ['oui']),
    ];
    const [x] = scoreParties(answers, [partyX], positions);
    // actes mean dist = 0.5 / 5 = 0.1 → 90 → écart 10
    expect(x?.ecart).toBe(10);
    expect(x?.ecartMarquant).toBe(false);
  });
});
