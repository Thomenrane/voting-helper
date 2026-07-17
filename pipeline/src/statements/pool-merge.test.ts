import { describe, expect, it } from 'vitest';

import type { PositionValue } from '@voting-helper/data';

import type { CandidateStatement, HarvestedCandidate } from './candidate-pool.ts';
import { mergePoolCandidates } from './pool-merge.ts';

function harvested(texte: string, page: number): HarvestedCandidate {
  return {
    theme: 'fiscalite',
    texte_fr: texte,
    note_concrete_fr: `Mesure synthétique : ${texte}`,
    sources: [
      {
        kind: 'programme',
        party_id: 'parti-alpha',
        source_id: 'parti-alpha-programme-fictif',
        ref_snapshot: 'snap-1',
        url_source: 'https://example.org/alpha.pdf',
        page,
      },
    ],
  };
}

function existing(
  id: string,
  texte: string,
  page: number,
  positions?: Record<string, PositionValue>,
): CandidateStatement {
  const candidate: CandidateStatement = { id, ...harvested(texte, page) };
  if (positions !== undefined) {
    candidate.positions = positions;
  }
  return candidate;
}

describe('mergePoolCandidates', () => {
  it('re-running the same harvest preserves existing candidates entirely — ids and coded positions', () => {
    const baseline = [
      existing('alpha-c001', 'Instaurer la mesure fictive A.', 3, { 'parti-alpha': 2, 'parti-beta': -2 }),
      existing('alpha-c002', 'Supprimer la mesure fictive B.', 7),
    ];
    const merged = mergePoolCandidates('alpha', baseline, [
      harvested('Instaurer la mesure fictive A.', 3),
      harvested('Supprimer la mesure fictive B.', 7),
    ]);
    expect(merged).toEqual(baseline);
  });

  it('matches on text + source even when whitespace or snapshot drift', () => {
    const baseline = [
      existing('alpha-c001', 'Instaurer la mesure fictive A.', 3, { 'parti-alpha': 2 }),
    ];
    const rerun = harvested('  Instaurer la   mesure fictive A. ', 3);
    (rerun.sources[0] as { ref_snapshot: string }).ref_snapshot = 'snap-2-later';
    const merged = mergePoolCandidates('alpha', baseline, [rerun]);
    expect(merged).toEqual(baseline);
  });

  it('appends genuinely new candidates with ids continuing after the max existing number', () => {
    const baseline = [
      existing('alpha-c001', 'Instaurer la mesure fictive A.', 3, { 'parti-alpha': 2 }),
      existing('alpha-c007', 'Supprimer la mesure fictive B.', 7),
    ];
    const merged = mergePoolCandidates('alpha', baseline, [
      harvested('Créer la mesure fictive C.', 12),
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.slice(0, 2)).toEqual(baseline);
    expect(merged[2]).toEqual({
      id: 'alpha-c008',
      ...harvested('Créer la mesure fictive C.', 12),
    });
  });

  it('never removes an existing candidate absent from the new harvest — human work survives', () => {
    const baseline = [
      existing('alpha-c001', 'Instaurer la mesure fictive A.', 3, { 'parti-beta': -1 }),
    ];
    const merged = mergePoolCandidates('alpha', baseline, []);
    expect(merged).toEqual(baseline);
  });

  it('fails loudly on duplicate ids in the existing file — never overwrites silently', () => {
    const baseline = [
      existing('alpha-c001', 'Instaurer la mesure fictive A.', 3),
      existing('alpha-c001', 'Supprimer la mesure fictive B.', 7),
    ];
    expect(() => mergePoolCandidates('alpha', baseline, [])).toThrow(
      /duplicate candidate id 'alpha-c001'/i,
    );
  });

  it('fails loudly when two existing candidates are indistinguishable by text + source', () => {
    const baseline = [
      existing('alpha-c001', 'Instaurer la mesure fictive A.', 3, { 'parti-alpha': 2 }),
      existing('alpha-c002', 'Instaurer la mesure fictive A.', 3, { 'parti-alpha': -2 }),
    ];
    expect(() =>
      mergePoolCandidates('alpha', baseline, [harvested('Instaurer la mesure fictive A.', 3)]),
    ).toThrow(/indistinguishable/);
  });

  it('is idempotent: merging the same harvest twice adds nothing the second time', () => {
    const once = mergePoolCandidates('alpha', [], [harvested('Créer la mesure fictive C.', 12)]);
    const twice = mergePoolCandidates('alpha', once, [harvested('Créer la mesure fictive C.', 12)]);
    expect(twice).toEqual(once);
  });
});
