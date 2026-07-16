import { describe, expect, it } from 'vitest';

import {
  coerceRow,
  transformVotes,
  VOTES_PARQUET_FIELDS,
  VoteRowError,
  type DossiersParquetRow,
  type MembersParquetRow,
  type VotesParquetRow,
} from './votes.transform.ts';

const MEMBERS: MembersParquetRow[] = [
  { first_name: 'Staf', last_name: 'Aerts', fraction: 'Ecolo-Groen' },
  { first_name: 'Khalil', last_name: 'Aouasti', fraction: 'PS' },
  { first_name: 'Eric', last_name: 'Thiebaut', fraction: 'PS' },
  { first_name: 'Sophie', last_name: 'De Wit', fraction: 'N-VA' },
];

const DOSSIERS: DossiersParquetRow[] = [
  {
    session_id: '56',
    id: '228',
    title: 'Wetsontwerp houdende diverse bepalingen.',
    document_type: 'WetsOntwerp',
    status: 'Aangenomen',
  },
];

function voteRow(overrides: Partial<VotesParquetRow> = {}): VotesParquetRow {
  return {
    vote_id: '0',
    session_id: '56',
    meeting_id: '6',
    date: '2024-09-26',
    title_nl: 'Voorstel X',
    title_fr: 'Proposition X',
    yes: '2',
    no: '1',
    abstain: '0',
    members_yes: 'Staf Aerts, Khalil Aouasti',
    members_no: 'Sophie De Wit',
    members_abstain: '',
    dossier_id: '228',
    document_id: '3',
    motion_id: '',
    ...overrides,
  };
}

describe('coerceRow', () => {
  it('types a row whose required columns are all strings', () => {
    const row = coerceRow<VotesParquetRow>(
      { ...voteRow() },
      VOTES_PARQUET_FIELDS,
      'votes.parquet',
      0,
    );
    expect(row.vote_id).toBe('0');
  });

  it('names the file, row and column on a structural defect', () => {
    const broken: Record<string, unknown> = { ...voteRow(), date: undefined };
    expect(() => coerceRow<VotesParquetRow>(broken, VOTES_PARQUET_FIELDS, 'votes.parquet', 41)).toThrow(
      /row 41 in votes\.parquet: column 'date'/,
    );
  });
});

describe('transformVotes — typed internal format', () => {
  it('produces vote, date, dossier and per-deputy/per-group detail', () => {
    const [vote] = transformVotes([voteRow()], MEMBERS, DOSSIERS);

    expect(vote?.id).toBe('56-m6-v0');
    expect(vote?.legislature).toBe('56');
    expect(vote?.date).toBe('2024-09-26');
    expect(vote?.counts).toEqual({ oui: 2, non: 1, abstention: 0 });
    expect(vote?.dossier).toEqual({
      id: '228',
      title: 'Wetsontwerp houdende diverse bepalingen.',
      document_type: 'WetsOntwerp',
      status: 'Aangenomen',
    });
    expect(vote?.ballots).toEqual([
      { name: 'Staf Aerts', group: 'Ecolo-Groen', position: 'oui' },
      { name: 'Khalil Aouasti', group: 'PS', position: 'oui' },
      { name: 'Sophie De Wit', group: 'N-VA', position: 'non' },
    ]);
    expect(vote?.groups).toEqual([
      { group: 'Ecolo-Groen', oui: 1, non: 0, abstention: 0 },
      { group: 'N-VA', oui: 0, non: 1, abstention: 0 },
      { group: 'PS', oui: 1, non: 0, abstention: 0 },
    ]);
    expect(vote?.motion_id).toBeNull();
    expect(vote?.warnings).toEqual([]);
  });

  it('resolves "Last First" printed names and accents via token matching', () => {
    const [vote] = transformVotes(
      [voteRow({ yes: '2', members_yes: 'Aerts Staf, Éric Thiébaut', no: '0', members_no: '' })],
      MEMBERS,
      DOSSIERS,
    );
    expect(vote?.ballots).toEqual([
      { name: 'Aerts Staf', group: 'Ecolo-Groen', position: 'oui' },
      { name: 'Éric Thiébaut', group: 'PS', position: 'oui' },
    ]);
    expect(vote?.warnings).toEqual([]);
  });

  it('keeps an unresolved deputy with group null and a warning', () => {
    const [vote] = transformVotes(
      [voteRow({ yes: '1', members_yes: 'Ngoi Mutyebele', no: '0', members_no: '' })],
      MEMBERS,
      DOSSIERS,
    );
    expect(vote?.ballots).toEqual([{ name: 'Ngoi Mutyebele', group: null, position: 'oui' }]);
    expect(vote?.groups).toEqual([]);
    expect(vote?.warnings).toEqual([
      "deputy 'Ngoi Mutyebele' (oui) not found in the members file — group unresolved",
    ]);
  });

  it('treats homonyms with DIFFERENT groups as ambiguous — never "last one wins"', () => {
    const homonyms: MembersParquetRow[] = [
      { first_name: 'Jean', last_name: 'Dupont', fraction: 'PS' },
      { first_name: 'Jean', last_name: 'Dupont', fraction: 'MR' },
    ];
    const [vote] = transformVotes(
      [voteRow({ yes: '1', members_yes: 'Jean Dupont', no: '0', members_no: '' })],
      homonyms,
      DOSSIERS,
    );
    expect(vote?.ballots).toEqual([{ name: 'Jean Dupont', group: null, position: 'oui' }]);
    expect(vote?.groups).toEqual([]);
    expect(vote?.warnings).toEqual([
      "deputy 'Jean Dupont' (oui) matches several members with different groups — group ambiguous",
    ]);
  });

  it('resolves homonyms sharing the SAME group without a warning', () => {
    const homonyms: MembersParquetRow[] = [
      { first_name: 'Jean', last_name: 'Dupont', fraction: 'PS' },
      { first_name: 'Jean', last_name: 'Dupont', fraction: 'PS' },
    ];
    const [vote] = transformVotes(
      [voteRow({ yes: '1', members_yes: 'Jean Dupont', no: '0', members_no: '' })],
      homonyms,
      DOSSIERS,
    );
    expect(vote?.ballots).toEqual([{ name: 'Jean Dupont', group: 'PS', position: 'oui' }]);
    expect(vote?.warnings).toEqual([]);
  });

  it('treats token-key collisions across distinct members as ambiguous for reordered names', () => {
    const collisions: MembersParquetRow[] = [
      { first_name: 'Anne-Marie', last_name: 'Dupont', fraction: 'PS' },
      { first_name: 'Marie-Anne', last_name: 'Dupont', fraction: 'MR' },
    ];
    // Exact printed names still resolve unambiguously…
    const [exact] = transformVotes(
      [voteRow({ yes: '1', members_yes: 'Anne-Marie Dupont', no: '0', members_no: '' })],
      collisions,
      DOSSIERS,
    );
    expect(exact?.ballots).toEqual([{ name: 'Anne-Marie Dupont', group: 'PS', position: 'oui' }]);
    expect(exact?.warnings).toEqual([]);
    // …but a reordered name that only token-matches cannot pick a side.
    const [reordered] = transformVotes(
      [voteRow({ yes: '1', members_yes: 'Dupont Anne-Marie', no: '0', members_no: '' })],
      collisions,
      DOSSIERS,
    );
    expect(reordered?.ballots).toEqual([{ name: 'Dupont Anne-Marie', group: null, position: 'oui' }]);
    expect(reordered?.warnings).toEqual([
      "deputy 'Dupont Anne-Marie' (oui) matches several members with different groups — group ambiguous",
    ]);
  });

  it('flags a count/list divergence as a warning, not an error (real-data behaviour)', () => {
    const [vote] = transformVotes([voteRow({ yes: '3' })], MEMBERS, DOSSIERS);
    expect(vote?.counts.oui).toBe(3);
    expect(vote?.ballots.filter((b) => b.position === 'oui')).toHaveLength(2);
    expect(vote?.warnings).toEqual(["announced 3 'oui' ballots but 2 deputies listed"]);
  });

  it('handles votes without a dossier (motions) and unknown dossier ids', () => {
    const [noDossier, unknownDossier] = transformVotes(
      [
        voteRow({ dossier_id: '', document_id: '', motion_id: '4' }),
        voteRow({ vote_id: '1', dossier_id: '999' }),
      ],
      MEMBERS,
      DOSSIERS,
    );
    expect(noDossier?.dossier).toBeNull();
    expect(noDossier?.document_id).toBeNull();
    expect(noDossier?.motion_id).toBe('4');
    expect(unknownDossier?.dossier).toEqual({
      id: '999',
      title: null,
      document_type: null,
      status: null,
    });
    expect(unknownDossier?.warnings).toContain("dossier '999' not found in the dossiers file");
  });

  it('rejects an invalid date, naming the vote', () => {
    expect(() => transformVotes([voteRow({ date: '26/09/2024' })], MEMBERS, DOSSIERS)).toThrow(
      VoteRowError,
    );
    expect(() => transformVotes([voteRow({ date: '26/09/2024' })], MEMBERS, DOSSIERS)).toThrow(
      /vote 56-m6-v0: invalid date '26\/09\/2024'/,
    );
  });

  it('rejects duplicate vote ids', () => {
    expect(() => transformVotes([voteRow(), voteRow()], MEMBERS, DOSSIERS)).toThrow(
      /duplicate vote id '56-m6-v0'/,
    );
  });

  it('rejects a non-numeric count', () => {
    expect(() => transformVotes([voteRow({ yes: 'twee' })], MEMBERS, DOSSIERS)).toThrow(
      /'yes' is not a count: 'twee'/,
    );
  });

  it('sorts votes by date, meeting, then vote number', () => {
    const votes = transformVotes(
      [
        voteRow({ vote_id: '10', meeting_id: '11', date: '2024-11-07' }),
        voteRow({ vote_id: '2', meeting_id: '11', date: '2024-11-07' }),
        voteRow({ vote_id: '0', meeting_id: '6', date: '2024-09-26' }),
      ],
      MEMBERS,
      DOSSIERS,
    );
    expect(votes.map((v) => v.id)).toEqual(['56-m6-v0', '56-m11-v2', '56-m11-v10']);
  });
});
