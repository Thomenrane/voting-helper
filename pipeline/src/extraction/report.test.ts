import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import type { PartyExtractionResult, PositionCandidate } from './position-extractor.ts';
import { countOutcomes, renderReviewSummary } from './report.ts';

const STATEMENTS: Statement[] = [
  {
    id: 's1',
    theme: 't',
    texte_fr: 'Réduire les cotisations sociales sur les bas salaires.',
    texte_nl: 'nl',
    note_concrete_fr: 'n',
    note_concrete_nl: 'n',
  },
  {
    id: 's2',
    theme: 't',
    texte_fr: 'Supprimer la TVA sur les billets de train.',
    texte_nl: 'nl',
    note_concrete_fr: 'n',
    note_concrete_nl: 'n',
  },
  {
    id: 's3',
    theme: 't',
    texte_fr: 'Prolonger deux réacteurs nucléaires.',
    texte_nl: 'nl',
    note_concrete_fr: 'n',
    note_concrete_nl: 'n',
  },
];

const CANDIDATE: PositionCandidate = {
  statement_id: 's1',
  position: 2,
  citation_texte: 'Nous réduirons les cotisations sociales.',
  citation_page: 12,
  source_id: 'demo-doc',
  raw_snapshot_id: 'demo-doc@x',
  url_source: 'https://example.org/demo.pdf',
  verdict: { status: 'verified', page: 12, spans_next_page: false },
};

const RESULT: PartyExtractionResult = {
  party_id: 'demo',
  chunk_count: 3,
  usage: { input_tokens: 1000, output_tokens: 100 },
  outcomes: [
    { kind: 'position', statement_id: 's1', position: 2, citation: CANDIDATE },
    {
      kind: 'rejected',
      statement_id: 's2',
      candidates: [
        { ...CANDIDATE, statement_id: 's2', position: -1, verdict: { status: 'not_found' } },
      ],
    },
    { kind: 'no_position', statement_id: 's3' },
  ],
};

describe('renderReviewSummary', () => {
  const summary = renderReviewSummary({
    partyName: 'Parti Démo',
    model: 'claude-sonnet-5',
    runDate: '16/07/2026',
    statements: STATEMENTS,
    result: RESULT,
    cost: { input_tokens: 1000, output_tokens: 100, usd: 0.0045, eur: 0.0039 },
  });

  it('shows positions, citations, pages and the verification rate', () => {
    expect(summary).toContain('**+2**');
    expect(summary).toContain('Nous réduirons les cotisations sociales.');
    expect(summary).toContain('demo-doc p. 12');
    expect(summary).toContain('1/2 citations proposées vérifiées mécaniquement');
    expect(summary).toContain('position REJETÉE');
    expect(summary).toContain('citation introuvable');
    expect(summary).toContain('pas de position documentée');
  });

  it('tells the reviewer where a wrongly-paginated citation was really found', () => {
    const withElsewhere = renderReviewSummary({
      partyName: 'Parti Démo',
      model: 'claude-sonnet-5',
      runDate: '16/07/2026',
      statements: STATEMENTS,
      result: {
        ...RESULT,
        outcomes: [
          {
            kind: 'rejected',
            statement_id: 's2',
            candidates: [
              {
                ...CANDIDATE,
                statement_id: 's2',
                citation_page: 40,
                verdict: { status: 'found_elsewhere', pages: [12, 87] },
              },
            ],
          },
        ],
      },
      cost: { input_tokens: 1, output_tokens: 1 },
    });
    expect(withElsewhere).toContain('retrouvée p. 12, 87 mais pas p. 40');
  });

  it('states that human PR review is the validation and shows the cost', () => {
    expect(summary).toContain('review humaine');
    expect(summary).toContain('en_attente');
    expect(summary).toContain('$0.0045');
    expect(summary).toContain('€');
  });

  it('renders a well-formed 6-column table for every outcome kind', () => {
    const rows = summary.split('\n').filter((line) => line.startsWith('| `s'));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.split('|')).toHaveLength(8); // 6 cells + 2 outer separators
    }
  });
});

describe('countOutcomes', () => {
  it('counts every outcome kind', () => {
    expect(countOutcomes(RESULT.outcomes)).toEqual({
      position: 1,
      rejected: 1,
      conflict: 0,
      no_position: 1,
    });
  });
});
