import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import { buildCoverageReport, renderCoverageReport } from './coverage-report.ts';
import type { StatementLexicalScan } from './lexical-scan.ts';
import type {
  ExaminedChunk,
  PositionCandidate,
  StatementOutcome,
} from './position-extractor.ts';

const STATEMENTS: Statement[] = [
  {
    id: 's1',
    theme: 'fiscalite',
    texte_fr: 'Réduire les cotisations sociales sur les bas salaires.',
    texte_nl: 'nl',
    note_concrete_fr: 'n',
    note_concrete_nl: 'n',
  },
  {
    id: 's2',
    theme: 'mobilite',
    texte_fr: 'Supprimer la TVA sur les billets de train.',
    texte_nl: 'nl',
    note_concrete_fr: 'n',
    note_concrete_nl: 'n',
  },
];

const CHUNKS: ExaminedChunk[] = [
  { source_id: 'doc', first_page: 1, last_page: 2, chars: 6000 },
  { source_id: 'doc', first_page: 3, last_page: 4, chars: 6000 },
];

function candidate(overrides: Partial<PositionCandidate>): PositionCandidate {
  return {
    statement_id: 's1',
    position: 2,
    citation_texte: 'texte',
    citation_page: 1,
    source_id: 'doc',
    raw_snapshot_id: 'doc@x',
    url_source: 'https://example.org/doc.pdf',
    chunk_first_page: 1,
    chunk_last_page: 2,
    verdict: { status: 'verified', page: 1, spans_next_page: false },
    ...overrides,
  };
}

describe('buildCoverageReport', () => {
  it('flags a « non documentée » whose subject has lexical occurrences', () => {
    const outcomes: StatementOutcome[] = [
      { kind: 'position', statement_id: 's1', position: 2, citation: candidate({}) },
      { kind: 'no_position', statement_id: 's2' },
    ];
    const lexicalScans: StatementLexicalScan[] = [
      { statement_id: 's1', keywords: ['cotisations'], hits: [] },
      {
        statement_id: 's2',
        keywords: ['train', 'billets'],
        hits: [{ source_id: 'doc', page: 3, terms: ['train', 'billets'] }],
      },
    ];
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: STATEMENTS,
      outcomes,
      candidates: [candidate({})],
      chunks: CHUNKS,
      lexicalScans,
    });
    expect(report.chunks_examined).toBe(2);
    expect(report.documents).toEqual([{ source_id: 'doc', chunk_count: 2 }]);
    const s2 = report.statements.find((s) => s.statement_id === 's2');
    expect(s2?.flagged).toBe(true);
    expect(s2?.lexical_pages).toEqual([{ source_id: 'doc', page: 3, term_count: 2 }]);
    expect(report.flagged_count).toBe(1);
  });

  it('does NOT flag a « non documentée » with no lexical occurrence', () => {
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: STATEMENTS,
      outcomes: [
        { kind: 'no_position', statement_id: 's1' },
        { kind: 'no_position', statement_id: 's2' },
      ],
      candidates: [],
      chunks: CHUNKS,
      lexicalScans: [
        { statement_id: 's1', keywords: ['cotisations'], hits: [] },
        { statement_id: 's2', keywords: ['train'], hits: [] },
      ],
    });
    expect(report.flagged_count).toBe(0);
  });

  it('flags a « rejetée » (found_elsewhere) with lexical occurrences as a rejected candidate', () => {
    const rejected = candidate({
      statement_id: 's2',
      citation_page: 40,
      verdict: { status: 'found_elsewhere', pages: [12, 87] },
    });
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: STATEMENTS,
      outcomes: [
        { kind: 'position', statement_id: 's1', position: 2, citation: candidate({}) },
        { kind: 'rejected', statement_id: 's2', candidates: [rejected] },
      ],
      candidates: [candidate({}), rejected],
      chunks: CHUNKS,
      lexicalScans: [
        { statement_id: 's1', keywords: ['cotisations'], hits: [] },
        {
          statement_id: 's2',
          keywords: ['train', 'billets'],
          hits: [{ source_id: 'doc', page: 3, terms: ['train', 'billets'] }],
        },
      ],
    });
    const s2 = report.statements.find((s) => s.statement_id === 's2');
    expect(s2?.flagged).toBe(true);
    expect(s2?.flag_kind).toBe('rejected_candidate');
    expect(report.flagged_count).toBe(1);
  });

  it('does NOT flag a « rejetée » with no lexical occurrence', () => {
    const rejected = candidate({ statement_id: 's2', verdict: { status: 'not_found' } });
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: STATEMENTS,
      outcomes: [
        { kind: 'position', statement_id: 's1', position: 2, citation: candidate({}) },
        { kind: 'rejected', statement_id: 's2', candidates: [rejected] },
      ],
      candidates: [candidate({}), rejected],
      chunks: CHUNKS,
      lexicalScans: [
        { statement_id: 's1', keywords: ['cotisations'], hits: [] },
        { statement_id: 's2', keywords: ['train'], hits: [] },
      ],
    });
    const s2 = report.statements.find((s) => s.statement_id === 's2');
    expect(s2?.flagged).toBe(false);
    expect(s2?.flag_kind).toBeNull();
    expect(report.flagged_count).toBe(0);
  });

  it('tags a flagged « non documentée » as a lexical silence', () => {
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: [STATEMENTS[1]!],
      outcomes: [{ kind: 'no_position', statement_id: 's2' }],
      candidates: [],
      chunks: CHUNKS,
      lexicalScans: [
        {
          statement_id: 's2',
          keywords: ['train', 'billets'],
          hits: [{ source_id: 'doc', page: 3, terms: ['train', 'billets'] }],
        },
      ],
    });
    const s2 = report.statements[0];
    expect(s2?.flagged).toBe(true);
    expect(s2?.flag_kind).toBe('lexical_silence');
  });

  it('does NOT flag a documented position even if the subject occurs lexically', () => {
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: [STATEMENTS[0]!],
      outcomes: [{ kind: 'position', statement_id: 's1', position: 2, citation: candidate({}) }],
      candidates: [candidate({})],
      chunks: CHUNKS,
      lexicalScans: [
        {
          statement_id: 's1',
          keywords: ['cotisations'],
          hits: [{ source_id: 'doc', page: 1, terms: ['cotisations', 'salaires'] }],
        },
      ],
    });
    expect(report.statements[0]?.flagged).toBe(false);
  });

  it('deduplicates candidate chunks per statement and marks a verified chunk', () => {
    const rejectedElsewhere = candidate({
      chunk_first_page: 3,
      chunk_last_page: 4,
      verdict: { status: 'not_found' },
    });
    const verifiedSameChunk = candidate({ chunk_first_page: 1, chunk_last_page: 2 });
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: [STATEMENTS[0]!],
      outcomes: [{ kind: 'position', statement_id: 's1', position: 2, citation: verifiedSameChunk }],
      candidates: [verifiedSameChunk, candidate({}), rejectedElsewhere],
      chunks: CHUNKS,
      lexicalScans: [{ statement_id: 's1', keywords: ['cotisations'], hits: [] }],
    });
    const chunks = report.statements[0]!.candidate_chunks;
    expect(chunks).toHaveLength(2); // p.1-2 (deduped) and p.3-4
    expect(chunks.find((c) => c.first_page === 1)?.verified).toBe(true);
    expect(chunks.find((c) => c.first_page === 3)?.verified).toBe(false);
  });
});

describe('renderCoverageReport', () => {
  it('renders the sweep size, a flag section and a per-statement table', () => {
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: STATEMENTS,
      outcomes: [
        { kind: 'position', statement_id: 's1', position: 2, citation: candidate({}) },
        { kind: 'no_position', statement_id: 's2' },
      ],
      candidates: [candidate({})],
      chunks: CHUNKS,
      lexicalScans: [
        { statement_id: 's1', keywords: ['cotisations'], hits: [] },
        {
          statement_id: 's2',
          keywords: ['train', 'billets'],
          hits: [{ source_id: 'doc', page: 3, terms: ['train', 'billets'] }],
        },
      ],
    });
    const md = renderCoverageReport(report, {
      partyName: 'Demo',
      model: 'claude-sonnet-5',
      runDate: '17/07/2026',
      statements: STATEMENTS,
    });
    expect(md).toContain('Chunks examinés : **2**');
    expect(md).toContain('Silences signalés (à vérifier) : **1**');
    expect(md).toContain('⚠️ `s2`');
    expect(md).toContain('doc p.3');
    expect(md).toContain('| `s1` |'); // documented statement listed without flag
  });

  it('renders distinct verification mentions for rejected vs lexical-silence flags', () => {
    const rejected = candidate({
      statement_id: 's1',
      citation_page: 40,
      verdict: { status: 'found_elsewhere', pages: [12] },
    });
    const report = buildCoverageReport({
      partyId: 'demo',
      statements: STATEMENTS,
      outcomes: [
        { kind: 'rejected', statement_id: 's1', candidates: [rejected] },
        { kind: 'no_position', statement_id: 's2' },
      ],
      candidates: [rejected],
      chunks: CHUNKS,
      lexicalScans: [
        {
          statement_id: 's1',
          keywords: ['cotisations', 'salaires'],
          hits: [{ source_id: 'doc', page: 1, terms: ['cotisations', 'salaires'] }],
        },
        {
          statement_id: 's2',
          keywords: ['train', 'billets'],
          hits: [{ source_id: 'doc', page: 3, terms: ['train', 'billets'] }],
        },
      ],
    });
    const md = renderCoverageReport(report, {
      partyName: 'Demo',
      model: 'claude-sonnet-5',
      runDate: '17/07/2026',
      statements: STATEMENTS,
    });
    expect(md).toContain('Silences signalés (à vérifier) : **2**');
    expect(md).toContain('position candidate rejetée — citation retrouvée à une autre page ?');
    expect(md).toContain('aucune position codée mais le sujet apparaît');
    expect(md).toContain('À VÉRIFIER');
  });
});
