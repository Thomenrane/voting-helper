/**
 * Review summary of a vote-linking run — the body of the batch PR (#23).
 * The human review of that PR IS the validation, so the summary must show,
 * per statement: the retained dossiers with the linking justification, the
 * RAW vote per group, the proposed dossier direction, the DERIVED position,
 * and why the other candidates were set aside (mechanically or by the model).
 */
import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import type { PlenaryVote } from '../votes/votes.types.ts';
import { renderLinkingReview, type StatementLinkReport } from './report.ts';

const STATEMENT: Statement = {
  id: 's3',
  theme: 'mobilite',
  texte_fr: 'Supprimer la TVA sur les billets de train.',
  texte_nl: 'De btw op treintickets afschaffen.',
  note_concrete_fr: 'TVA à 0 %.',
  note_concrete_nl: '0% btw.',
};

const VOTE: PlenaryVote = {
  id: '56-m10-v1',
  legislature: '56',
  meeting_id: '10',
  vote_number: '1',
  date: '2025-03-15',
  title_fr: 'Vote sur l’ensemble du projet',
  title_nl: 'Stemming over het geheel',
  dossier: { id: '228', title: 'TVA billets de train', document_type: 'WETSONTWERP', status: null },
  document_id: null,
  motion_id: null,
  counts: { oui: 0, non: 0, abstention: 0 },
  ballots: [],
  groups: [],
  warnings: [],
};

const REPORT: StatementLinkReport = {
  statement: STATEMENT,
  eligibleCount: 200,
  candidateCount: 12,
  notSubmitted: [{ id: '56-m11-v9', title_fr: 'Projet de loi TVA — article 4' }],
  retained: [
    {
      vote: VOTE,
      kind: 'vote_final',
      direction_dossier: 'contredit',
      justification: 'Le dossier rétablit la TVA visée par l’énoncé.',
    },
  ],
  setAside: [
    { vote: { ...VOTE, id: '56-m10-v2' }, kind: 'amendement', motif: 'Amendement sur un autre article.' },
  ],
  links: [
    {
      party_id: 'ps',
      fraction: 'PS',
      linked_vote: {
        id: '56-m10-v1',
        date: '2025-03-15',
        dossier: 'DOC 56 0228',
        vote_groupe: 'oui',
        direction_dossier: 'contredit',
        justification: 'Le dossier rétablit la TVA visée par l’énoncé.',
      },
    },
  ],
  absences: [{ party_id: 'defi', fraction: 'DéFI', vote_id: '56-m10-v1', reason: 'groupe_absent' }],
};

describe('renderLinkingReview', () => {
  const review = renderLinkingReview({
    model: 'claude-sonnet-5',
    runDate: '17/07/2026',
    datasetSnapshotId: 'votes-dataset-leg56@20260716T000000000Z',
    eligibility: { total: 673, eligible: 200, excludedByReason: new Map([['vote procédural (« ajournement ») — critère publié n° 2', 400], ['vote sans dossier législatif lié (motion ou vote de procédure) — critère publié n° 1', 73]]) },
    reports: [REPORT],
    cost: { input_tokens: 1000, output_tokens: 200, usd: 0.01, eur: 0.0086 },
  });

  it('shows the statement, the retained dossier, why it was retained, and the direction', () => {
    expect(review).toContain('s3');
    expect(review).toContain('Supprimer la TVA sur les billets de train.');
    expect(review).toContain('DOC 56 0228');
    expect(review).toContain('Le dossier rétablit la TVA visée par l’énoncé.');
    expect(review).toContain('contredit');
  });

  it('shows the raw group vote per party and the DERIVED position', () => {
    // oui × contredit → −2, and the raw vote stays visible.
    expect(review).toMatch(/PS.*oui.*−2/s);
  });

  it('shows why candidates were set aside, mechanically and by the model', () => {
    expect(review).toContain('Amendement sur un autre article.');
    expect(review).toContain('critère publié n° 2');
    expect(review).toContain('400');
  });

  it('names the group absences instead of silently dropping parties', () => {
    expect(review).toMatch(/defi.*absent/is);
  });

  it('carries the review contract: en_attente statuses and dataset provenance', () => {
    expect(review).toContain('en_attente');
    expect(review).toContain('votes-dataset-leg56@20260716T000000000Z');
    expect(review).toContain('docs/methodologie/criteres-liaison-votes.md');
  });

  it('lists the eligible votes NOT submitted to the model (lexical prefilter)', () => {
    // MAJOR 2 of the PR #34 review: the reviewer must be able to rescue a
    // vote the prefilter wrongly dropped — id + title, with the exact count.
    expect(review).toContain('56-m11-v9');
    expect(review).toContain('Projet de loi TVA — article 4');
    expect(review).toMatch(/non soumis au modèle.*\*\*1\*\*/i);
  });

  it('caps the not-submitted list but always reports the exact count', () => {
    const many = Array.from({ length: 27 }, (_, i) => ({
      id: `56-m20-v${i + 1}`,
      title_fr: `Scrutin ${i + 1}`,
    }));
    const capped = renderLinkingReview({
      model: 'claude-sonnet-5',
      runDate: '17/07/2026',
      datasetSnapshotId: 'x',
      eligibility: { total: 10, eligible: 5, excludedByReason: new Map() },
      reports: [{ ...REPORT, notSubmitted: many }],
      cost: { input_tokens: 0, output_tokens: 0 },
    });
    expect(capped).toMatch(/non soumis au modèle.*\*\*27\*\*/i);
    expect(capped).toContain('56-m20-v25');
    expect(capped).not.toContain('56-m20-v26');
    expect(capped).toContain('et 2 autres');
  });

  it('says explicitly when a statement has no retained vote (excluded from actes)', () => {
    const empty = renderLinkingReview({
      model: 'claude-sonnet-5',
      runDate: '17/07/2026',
      datasetSnapshotId: 'x',
      eligibility: { total: 10, eligible: 5, excludedByReason: new Map() },
      reports: [{ ...REPORT, retained: [], links: [], absences: [], setAside: [] }],
      cost: { input_tokens: 0, output_tokens: 0 },
    });
    expect(empty).toMatch(/aucun vote retenu/i);
    expect(empty).toMatch(/score « actes »/i);
  });
});
