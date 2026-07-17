import { describe, expect, it } from 'vitest';
import type { Party, PartyPosition, PositionValue, Statement } from '@voting-helper/data';
import { partyBalances, statementBalances } from './balance.ts';

const PARTIES: Party[] = [
  { id: 'p1', name: 'Parti 1' },
  { id: 'p2', name: 'Parti 2' },
];

function statement(id: string): Statement {
  return {
    id,
    theme: 'fiscalite',
    texte_fr: `Énoncé ${id}`,
    texte_nl: `Stelling ${id}`,
    note_concrete_fr: 'Note',
    note_concrete_nl: 'Nota',
  };
}

const STATEMENTS: Statement[] = [statement('s1'), statement('s2'), statement('s3')];

interface RecordOptions {
  position?: PositionValue;
  votes?: number;
  statut?: 'valide' | 'en_attente' | 'rejete';
}

function record(
  partyId: string,
  statementId: string,
  { position, votes = 0, statut = 'valide' }: RecordOptions,
): PartyPosition {
  const programme =
    position !== undefined
      ? {
          position,
          citation: {
            texte: 'Citation.',
            url_source: 'https://example.org/source.pdf',
            ref_snapshot: 'snapshots/test.pdf',
            page: 1,
          },
        }
      : {};
  return {
    ...programme,
    party_id: partyId,
    statement_id: statementId,
    votes_lies: Array.from({ length: votes }, (_, i) => ({
      id: `${partyId}-${statementId}-v${i + 1}`,
      date: '2025-03-15',
      dossier: 'DOC 56 0001/001',
      vote_groupe: 'oui' as const,
      direction_dossier: 'soutient' as const,
      justification: 'Vote lié de test.',
    })),
    statut,
    derniere_revision: '2026-06-01',
  };
}

describe('partyBalances', () => {
  it('counts documented programme positions, statements with votes, and linked votes', () => {
    const balances = partyBalances(PARTIES, STATEMENTS, [
      record('p1', 's1', { position: 2, votes: 1 }),
      record('p1', 's2', { position: -1, votes: 0 }),
      record('p1', 's3', { votes: 2 }), // votes without a programme position
      record('p2', 's1', { position: 0, votes: 1 }),
    ]);
    expect(balances).toEqual([
      {
        partyId: 'p1',
        documentedProgramme: 2,
        statementsWithVotes: 2,
        linkedVotes: 3,
        totalStatements: 3,
      },
      {
        partyId: 'p2',
        documentedProgramme: 1,
        statementsWithVotes: 1,
        linkedVotes: 1,
        totalStatements: 3,
      },
    ]);
  });

  it('ignores non-validated records — same rule as the engine', () => {
    const balances = partyBalances(PARTIES, STATEMENTS, [
      record('p1', 's1', { position: 2, votes: 1, statut: 'en_attente' }),
      record('p1', 's2', { position: 1, votes: 1, statut: 'rejete' }),
    ]);
    expect(balances[0]).toMatchObject({ documentedProgramme: 0, linkedVotes: 0 });
  });

  it('ignores records pointing at an unknown statement', () => {
    const balances = partyBalances(PARTIES, STATEMENTS, [
      record('p1', 's-removed', { position: 2, votes: 1 }),
    ]);
    expect(balances[0]).toMatchObject({
      documentedProgramme: 0,
      statementsWithVotes: 0,
      linkedVotes: 0,
    });
  });

  it('refuses two valid records for one party × statement', () => {
    expect(() =>
      partyBalances(PARTIES, STATEMENTS, [
        record('p1', 's1', { position: 2 }),
        record('p1', 's1', { position: -2 }),
      ]),
    ).toThrow(/Duplicate valid position/);
  });
});

describe('statementBalances', () => {
  it('buckets documented positions as pour / neutre / contre and counts the undocumented', () => {
    const balances = statementBalances(PARTIES, STATEMENTS, [
      record('p1', 's1', { position: 2 }),
      record('p2', 's1', { position: -1 }),
      record('p1', 's2', { position: 0 }),
      // p2 has no record on s2; s3 has none at all.
    ]);
    expect(balances).toEqual([
      { statementId: 's1', pour: 1, neutre: 0, contre: 1, nonDocumente: 0, totalParties: 2 },
      { statementId: 's2', pour: 0, neutre: 1, contre: 0, nonDocumente: 1, totalParties: 2 },
      { statementId: 's3', pour: 0, neutre: 0, contre: 0, nonDocumente: 2, totalParties: 2 },
    ]);
  });

  it('counts a votes-only record (no programme position) as non documenté', () => {
    const balances = statementBalances(PARTIES, STATEMENTS, [record('p1', 's1', { votes: 1 })]);
    expect(balances[0]).toMatchObject({ pour: 0, neutre: 0, contre: 0, nonDocumente: 2 });
  });

  it('ignores non-validated records', () => {
    const balances = statementBalances(PARTIES, STATEMENTS, [
      record('p1', 's1', { position: 2, statut: 'en_attente' }),
    ]);
    expect(balances[0]).toMatchObject({ pour: 0, nonDocumente: 2 });
  });
});
