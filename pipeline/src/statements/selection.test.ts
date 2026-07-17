import { describe, expect, it } from 'vitest';

import type { PositionValue } from '@voting-helper/data';

import type { CandidateStatement } from './candidate-pool.ts';
import { assessPoolCoverage, rankCandidates, renderSelectionReport } from './selection.ts';

function candidate(
  id: string,
  theme: string,
  positions?: Record<string, PositionValue>,
): CandidateStatement {
  const base: CandidateStatement = {
    id,
    theme,
    texte_fr: `Énoncé ${id}.`,
    note_concrete_fr: `Mesure ${id}.`,
    sources: [
      {
        kind: 'programme',
        party_id: 'ps',
        source_id: 'ps-programme-2024',
        ref_snapshot: 'snap',
        url_source: 'https://example.org/ps.pdf',
        page: 1,
      },
    ],
  };
  if (positions !== undefined) {
    base.positions = positions;
  }
  return base;
}

describe('rankCandidates', () => {
  it('ranks cleaving candidates above consensual ones, uncoded last', () => {
    const consensual = candidate('a-c001', 'fiscalite', { ps: 2, mr: 2, ecolo: 2, nva: 2 });
    const cleaving = candidate('a-c002', 'sante', { ps: 2, mr: -2, ecolo: 2, nva: -2 });
    const uncoded = candidate('a-c003', 'mobilite');
    const ranked = rankCandidates([consensual, uncoded, cleaving]);
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(['a-c002', 'a-c001', 'a-c003']);
    expect(ranked[0]?.discriminance.score).toBe(1);
    expect(ranked[1]?.discriminance.score).toBe(0);
    expect(ranked[2]?.discriminance).toEqual({ score: null, coded: 0 });
  });

  it('breaks score ties by coded count, then id — deterministic', () => {
    const twoParties = candidate('b-c002', 'emploi', { ps: 2, mr: -2 });
    const fourParties = candidate('b-c001', 'emploi', { ps: 2, mr: -2, ecolo: 2, nva: -2 });
    const sameAsFour = candidate('a-c009', 'emploi', { ps: 2, mr: -2, ecolo: 2, nva: -2 });
    const ranked = rankCandidates([twoParties, fourParties, sameAsFour]);
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(['a-c009', 'b-c001', 'b-c002']);
  });

  it('treats a single coded position as uncoded (score null)', () => {
    const [only] = rankCandidates([candidate('c-c001', 'sante', { ps: 2 })]);
    expect(only?.discriminance).toEqual({ score: null, coded: 1 });
  });

  it('rejects duplicate candidate ids across pool files', () => {
    expect(() =>
      rankCandidates([candidate('dup-c001', 'sante'), candidate('dup-c001', 'emploi')]),
    ).toThrow(/Duplicate candidate id 'dup-c001'/);
  });
});

describe('assessPoolCoverage', () => {
  it('flags themes with fewer candidates than the selection minimum, never overflow', () => {
    const pool = [
      ...['fiscalite', 'fiscalite', 'fiscalite', 'fiscalite', 'fiscalite'].map((theme, i) =>
        candidate(`f-c00${i}`, theme),
      ),
      candidate('s-c001', 'sante'),
    ];
    const coverage = assessPoolCoverage(pool);
    const byId = new Map(coverage.map((entry) => [entry.theme.id, entry]));
    expect(byId.get('fiscalite')?.status).toBe('ok');
    expect(byId.get('sante')?.status).toBe('gap');
    expect(byId.get('migration')?.status).toBe('gap');
  });
});

describe('renderSelectionReport', () => {
  it('renders coverage gaps, the ranking and the human-selection reminder', () => {
    const pool = [
      candidate('a-c001', 'fiscalite', { ps: 2, mr: -2 }),
      candidate('a-c002', 'sante'),
    ];
    const report = renderSelectionReport({
      runDate: '17/07/2026',
      poolFiles: ['data/statements/pool/ps.candidates.yaml'],
      ranked: rankCandidates(pool),
      coverage: assessPoolCoverage(pool),
    });
    expect(report).toContain('rapport du 17/07/2026');
    expect(report).toContain('2 candidat(s) (1 codé(s) en positions)');
    expect(report).toContain('thème(s) en trou de couverture');
    expect(report).toContain('| 1 | a-c001 | fiscalite | 1.000 (2 positions) |');
    expect(report).toContain('| 2 | a-c002 | sante | non codé |');
    expect(report).toContain('la sélection et la réécriture sont humaines');
    expect(report).toContain('guide-redaction-enonces.md');
  });

  it('escapes pipes and newlines in candidate text so the table never breaks', () => {
    const tricky = candidate('a-c001', 'fiscalite');
    tricky.texte_fr = 'Choisir A | B\nsur deux lignes.';
    const report = renderSelectionReport({
      runDate: '17/07/2026',
      poolFiles: ['data/statements/pool/x.candidates.yaml'],
      ranked: rankCandidates([tricky]),
      coverage: assessPoolCoverage([tricky]),
    });
    expect(report).toContain('Choisir A \\| B sur deux lignes.');
    expect(report).not.toContain('Choisir A | B');
  });
});
