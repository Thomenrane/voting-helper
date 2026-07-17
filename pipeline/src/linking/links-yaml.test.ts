/**
 * Output stage of the vote-linking run (#23): per-party LinkedVote records
 * built from the retained candidates (raw group vote × dossier direction,
 * schema m3) and merged into the party's positions proposals — the same YAML
 * the positions:pr flow commits for human review.
 */
import { describe, expect, it } from 'vitest';

import type { PartyPosition } from '@voting-helper/data';

import type { GroupTally, PlenaryVote } from '../votes/votes.types.ts';
import { formatDossierRef } from './dossier-ref.ts';
import { buildPartyLinks, mergeStatementVotes } from './links-yaml.ts';
import type { RetainedLink } from './vote-preselection.ts';

function retained(
  id: string,
  groups: GroupTally[],
  direction: 'soutient' | 'contredit' = 'soutient',
): RetainedLink {
  const vote: PlenaryVote = {
    id,
    legislature: '56',
    meeting_id: '10',
    vote_number: '1',
    date: '2025-03-15',
    title_fr: 'Vote test',
    title_nl: 'Stemming test',
    dossier: { id: '228', title: 'Dossier test', document_type: 'WETSONTWERP', status: null },
    document_id: null,
    motion_id: null,
    counts: { oui: 0, non: 0, abstention: 0 },
    ballots: [],
    groups,
    warnings: [],
  };
  return { vote, kind: 'vote_final', direction_dossier: direction, justification: 'Vote final sur la mesure.' };
}

const GROUPS: readonly { party_id: string; fraction: string }[] = [
  { party_id: 'ps', fraction: 'PS' },
  { party_id: 'ecolo', fraction: 'Ecolo-Groen' },
  { party_id: 'groen', fraction: 'Ecolo-Groen' },
];

describe('formatDossierRef', () => {
  it('pads the dossier id to the Chamber DOC convention', () => {
    expect(formatDossierRef('56', '228')).toBe('DOC 56 0228');
    expect(formatDossierRef('56', '1234')).toBe('DOC 56 1234');
  });
});

describe('buildPartyLinks', () => {
  it('derives one LinkedVote per party from its group majority (raw vote kept raw)', () => {
    const link = retained(
      '56-m10-v1',
      [
        { group: 'PS', oui: 15, non: 0, abstention: 1 },
        { group: 'Ecolo-Groen', oui: 1, non: 12, abstention: 0 },
      ],
      'contredit',
    );
    const { links, absences } = buildPartyLinks([link], GROUPS);
    expect(absences).toEqual([]);
    const ps = links.find((l) => l.party_id === 'ps');
    expect(ps?.linked_vote).toEqual({
      id: '56-m10-v1',
      date: '2025-03-15',
      dossier: 'DOC 56 0228',
      vote_groupe: 'oui',
      direction_dossier: 'contredit',
      justification: 'Vote final sur la mesure.',
    });
    // Ecolo and Groen share the Ecolo-Groen fraction: same raw vote for both.
    const shared = links.filter((l) => l.fraction === 'Ecolo-Groen');
    expect(shared.map((l) => l.party_id).sort()).toEqual(['ecolo', 'groen']);
    expect(new Set(shared.map((l) => l.linked_vote.vote_groupe))).toEqual(new Set(['non']));
  });

  it('reports an absence instead of inventing a vote for a missing or tied group', () => {
    const link = retained('56-m10-v2', [
      { group: 'PS', oui: 5, non: 5, abstention: 0 },
      // Ecolo-Groen absent from the tallies entirely.
    ]);
    const { links, absences } = buildPartyLinks([link], GROUPS);
    expect(links).toEqual([]);
    expect(absences).toEqual([
      { party_id: 'ps', fraction: 'PS', vote_id: '56-m10-v2', reason: 'groupe_partage' },
      { party_id: 'ecolo', fraction: 'Ecolo-Groen', vote_id: '56-m10-v2', reason: 'groupe_absent' },
      { party_id: 'groen', fraction: 'Ecolo-Groen', vote_id: '56-m10-v2', reason: 'groupe_absent' },
    ]);
  });
});

describe('mergeStatementVotes', () => {
  const vote = {
    id: '56-m10-v1',
    date: '2025-03-15',
    dossier: 'DOC 56 0228',
    vote_groupe: 'oui' as const,
    direction_dossier: 'soutient' as const,
    justification: 'Vote final.',
  };

  const existing: PartyPosition[] = [
    {
      party_id: 'ps',
      statement_id: 's1',
      position: 2,
      citation: { texte: 'c', url_source: 'u', ref_snapshot: 'r', page: 1 },
      votes_lies: [],
      statut: 'en_attente',
      derniere_revision: '2026-07-01',
    },
    {
      party_id: 'ps',
      statement_id: 's2',
      votes_lies: [],
      statut: 'rejete',
      derniere_revision: '2026-07-01',
    },
  ];

  it('fills votes_lies on the existing record and refreshes the revision date', () => {
    const merged = mergeStatementVotes(existing, 'ps', new Map([['s1', [vote]]]), '2026-07-17');
    expect(merged[0]).toMatchObject({
      statement_id: 's1',
      position: 2,
      votes_lies: [vote],
      statut: 'en_attente',
      derniere_revision: '2026-07-17',
    });
    // Untouched records pass through unchanged.
    expect(merged[1]).toEqual(existing[1]);
  });

  it('keeps a rejete record rejete when votes are added — the citation stays rejected', () => {
    const merged = mergeStatementVotes(existing, 'ps', new Map([['s2', [vote]]]), '2026-07-17');
    expect(merged[1]).toMatchObject({ statement_id: 's2', statut: 'rejete', votes_lies: [vote] });
  });

  it('resets a valide record to en_attente — new linked votes need a new review', () => {
    const validated: PartyPosition[] = [{ ...existing[0]!, statut: 'valide' }];
    const merged = mergeStatementVotes(validated, 'ps', new Map([['s1', [vote]]]), '2026-07-17');
    expect(merged[0]?.statut).toBe('en_attente');
  });

  it('creates a votes-only en_attente record when the party has no record yet', () => {
    const merged = mergeStatementVotes(existing, 'ps', new Map([['s9', [vote]]]), '2026-07-17');
    expect(merged).toHaveLength(3);
    expect(merged[2]).toEqual({
      party_id: 'ps',
      statement_id: 's9',
      votes_lies: [vote],
      statut: 'en_attente',
      derniere_revision: '2026-07-17',
    });
  });

  it('replaces previous votes_lies on re-run instead of accumulating duplicates', () => {
    const first = mergeStatementVotes(existing, 'ps', new Map([['s1', [vote]]]), '2026-07-17');
    const second = mergeStatementVotes(first, 'ps', new Map([['s1', [vote]]]), '2026-07-18');
    expect(second[0]?.votes_lies).toHaveLength(1);
  });
});
