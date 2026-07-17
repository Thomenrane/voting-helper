/**
 * Tests for the results presentation helpers (ticket #19).
 *
 * The module is the pure seam between the scoring engine's output and the
 * results screen: ranking of the two columns, slope line endpoints, audit
 * drill-down grouping and display formatting. No DOM here.
 */
import { describe, expect, it } from 'vitest';
import type { PartyPosition, Statement } from '@voting-helper/data';
import type { PartyScore } from '../scoring/scoring.ts';
import {
  buildPartyAudit,
  formatDateBE,
  formatEcart,
  formatScore,
  rankByDimension,
  slopeLines,
} from './results-presentation.ts';

/** Minimal PartyScore factory — only the fields the helpers read. */
function score(
  partyId: string,
  promesses: number | null,
  actes: number | null,
  options: { ecartMarquant?: boolean; contradictions?: string[] } = {},
): PartyScore {
  const ecart = promesses !== null && actes !== null ? promesses - actes : null;
  return {
    partyId,
    promesses: { score: promesses, denominator: promesses === null ? 0 : 5 },
    actes: { score: actes, denominator: actes === null ? 0 : 3 },
    ecart,
    ecartMarquant: options.ecartMarquant ?? (ecart !== null && Math.abs(ecart) >= 15),
    contradictions: options.contradictions ?? [],
  };
}

describe('rankByDimension', () => {
  it('sorts by the requested dimension, highest score first', () => {
    const ranking = rankByDimension(
      [score('a', 40, 90), score('b', 80, 10), score('c', 60, 50)],
      'promesses',
    );
    expect(ranking.map((r) => r.partyId)).toEqual(['b', 'c', 'a']);
  });

  it('ranks the two dimensions independently', () => {
    const scores = [score('a', 40, 90), score('b', 80, 10)];
    expect(rankByDimension(scores, 'promesses').map((r) => r.partyId)).toEqual(['b', 'a']);
    expect(rankByDimension(scores, 'actes').map((r) => r.partyId)).toEqual(['a', 'b']);
  });

  it('assigns 1-based ranks in column order', () => {
    const ranking = rankByDimension([score('a', 10, 10), score('b', 90, 90)], 'actes');
    expect(ranking.map((r) => r.rank)).toEqual([1, 2]);
    expect(ranking[0]?.partyId).toBe('b');
  });

  it('reports the score and denominator of the ranked dimension', () => {
    const ranking = rankByDimension([score('a', 40, 90)], 'actes');
    expect(ranking[0]).toMatchObject({ partyId: 'a', score: 90, denominator: 3 });
  });

  it('ranks a null score below a real 0', () => {
    const ranking = rankByDimension([score('nd', null, 20), score('zero', 0, 20)], 'promesses');
    expect(ranking.map((r) => r.partyId)).toEqual(['zero', 'nd']);
    expect(ranking[1]?.score).toBeNull();
  });

  it('breaks ties on the other dimension, then keeps party input order', () => {
    const scores = [
      score('a', 50, 10),
      score('b', 50, 70),
      score('c', 50, 10), // full tie with a → input order
    ];
    expect(rankByDimension(scores, 'promesses').map((r) => r.partyId)).toEqual(['b', 'a', 'c']);
  });

  it('breaks a null-score tie on the other dimension too', () => {
    const scores = [score('a', null, 10), score('b', null, 70)];
    expect(rankByDimension(scores, 'promesses').map((r) => r.partyId)).toEqual(['b', 'a']);
  });
});

describe('slopeLines', () => {
  it('connects each party from its promesses row to its actes row', () => {
    const lines = slopeLines([score('a', 40, 90), score('b', 80, 10), score('c', 60, 50)]);
    // promesses order: b, c, a — actes order: a, c, b
    expect(lines).toEqual([
      { partyId: 'b', fromIndex: 0, toIndex: 2, marquant: true },
      { partyId: 'c', fromIndex: 1, toIndex: 1, marquant: false },
      { partyId: 'a', fromIndex: 2, toIndex: 0, marquant: true },
    ]);
  });

  it('flags marquant straight from the engine, never recomputed locally', () => {
    // Contrived flag values prove the helper trusts the engine's field.
    const scores = [score('a', 50, 50, { ecartMarquant: true })];
    expect(slopeLines(scores)[0]?.marquant).toBe(true);
  });

  it('still yields a line for a party with a null score (ranked last)', () => {
    const lines = slopeLines([score('a', 80, null), score('b', 20, 60)]);
    const lineA = lines.find((l) => l.partyId === 'a');
    expect(lineA).toEqual({ partyId: 'a', fromIndex: 0, toIndex: 1, marquant: false });
  });
});

describe('formatScore', () => {
  it('renders a numeric score as-is', () => {
    expect(formatScore(72, 'n.d.')).toBe('72');
    expect(formatScore(0, 'n.d.')).toBe('0');
  });

  it('renders null with the provided not-available label', () => {
    expect(formatScore(null, 'n.d.')).toBe('n.d.');
    expect(formatScore(null, 'n.b.')).toBe('n.b.');
  });
});

describe('formatEcart', () => {
  it('prefixes positive gaps with +', () => {
    expect(formatEcart(23)).toBe('+23');
  });

  it('keeps the sign of negative gaps', () => {
    expect(formatEcart(-8)).toBe('-8');
  });

  it('renders zero without a sign', () => {
    expect(formatEcart(0)).toBe('0');
  });
});

describe('formatDateBE', () => {
  it('renders an ISO date as DD/MM/YYYY', () => {
    expect(formatDateBE('2025-03-15')).toBe('15/03/2025');
  });

  it('returns a non-ISO value unchanged rather than mangling it', () => {
    expect(formatDateBE('date inconnue')).toBe('date inconnue');
  });
});

describe('buildPartyAudit', () => {
  const statements: Statement[] = [
    stmt('s1', 'fiscalite'),
    stmt('s2', 'fiscalite'),
    stmt('s3', 'mobilite'),
    stmt('s4', 'fiscalite'), // themes can interleave — grouping must not reorder statements
  ];

  function stmt(id: string, theme: string): Statement {
    return {
      id,
      theme,
      texte_fr: `Énoncé ${id}`,
      texte_nl: `Stelling ${id}`,
      note_concrete_fr: `Note ${id}`,
      note_concrete_nl: `Noot ${id}`,
    };
  }

  function record(
    partyId: string,
    statementId: string,
    options: {
      position?: -2 | -1 | 0 | 1 | 2;
      votes?: ('oui' | 'abstention' | 'non')[];
      statut?: 'valide' | 'en_attente' | 'rejete';
    } = {},
  ): PartyPosition {
    const programme =
      options.position !== undefined
        ? {
            position: options.position,
            citation: {
              texte: `Citation ${partyId}/${statementId}`,
              url_source: `https://example.org/${partyId}.pdf`,
              ref_snapshot: `snapshots/${partyId}.pdf`,
              page: 12,
            },
          }
        : {};
    return {
      ...programme,
      party_id: partyId,
      statement_id: statementId,
      votes_lies: (options.votes ?? []).map((v, i) => ({
        id: `${partyId}-${statementId}-v${i + 1}`,
        date: '2025-03-15',
        dossier: `DOC ${i + 1}`,
        vote_groupe: v,
        direction_dossier: 'soutient' as const,
        justification: `Justification ${i + 1}`,
      })),
      statut: options.statut ?? 'valide',
      derniere_revision: '2026-06-01',
    };
  }

  it('groups statements by theme, themes in first-appearance order', () => {
    const audit = buildPartyAudit('p', statements, [], []);
    expect(audit.map((t) => t.theme)).toEqual(['fiscalite', 'mobilite']);
    expect(audit[0]?.statements.map((s) => s.statement.id)).toEqual(['s1', 's2', 's4']);
    expect(audit[1]?.statements.map((s) => s.statement.id)).toEqual(['s3']);
  });

  it('exposes the programme citation and the linked votes of a full record', () => {
    const audit = buildPartyAudit(
      'p',
      statements,
      [record('p', 's1', { position: 2, votes: ['oui', 'abstention'] })],
      [],
    );
    const s1 = audit[0]?.statements[0];
    expect(s1?.programme?.position).toBe(2);
    expect(s1?.programme?.citation.texte).toBe('Citation p/s1');
    expect(s1?.votes.map((v) => v.vote_groupe)).toEqual(['oui', 'abstention']);
  });

  it('reports an undocumented programme position (record without programme part)', () => {
    const audit = buildPartyAudit('p', statements, [record('p', 's1', { votes: ['non'] })], []);
    const s1 = audit[0]?.statements[0];
    expect(s1?.programme).toBeNull();
    expect(s1?.votes).toHaveLength(1);
  });

  it('treats a missing record as fully undocumented (silence is information)', () => {
    const audit = buildPartyAudit('p', statements, [], []);
    const s1 = audit[0]?.statements[0];
    expect(s1?.programme).toBeNull();
    expect(s1?.votes).toEqual([]);
  });

  it('ignores non-validated records and other parties, like the engine does', () => {
    const audit = buildPartyAudit(
      'p',
      statements,
      [
        record('p', 's1', { position: 2, votes: ['oui'], statut: 'en_attente' }),
        record('autre', 's1', { position: 2, votes: ['oui'] }),
      ],
      [],
    );
    const s1 = audit[0]?.statements[0];
    expect(s1?.programme).toBeNull();
    expect(s1?.votes).toEqual([]);
  });

  it('flags contradictions from the engine-provided ids only', () => {
    const audit = buildPartyAudit(
      'p',
      statements,
      [record('p', 's1', { position: 2, votes: ['non'] })],
      ['s1'],
    );
    expect(audit[0]?.statements[0]?.isContradiction).toBe(true);
    expect(audit[0]?.statements[1]?.isContradiction).toBe(false);
  });

  it('refuses two valid records for the same statement, like the engine does', () => {
    expect(() =>
      buildPartyAudit(
        'p',
        statements,
        [record('p', 's1', { position: 2 }), record('p', 's1', { position: -2 })],
        [],
      ),
    ).toThrow(/Duplicate valid position/);
  });
});
