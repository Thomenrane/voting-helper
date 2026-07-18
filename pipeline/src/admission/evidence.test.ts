import { describe, expect, it } from 'vitest';

import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import { buildPartyAdmissionInput, documentEvidence } from './evidence.ts';
import { getExpectedIdentity } from './expected-identity.ts';
import { admitParty } from './verdict.ts';

function layerOf(sourceId: string, ...pages: string[]): ProgrammeTextLayer {
  return {
    source_id: sourceId,
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

const NVA = getExpectedIdentity('nva');

describe('documentEvidence — depuis une couche texte', () => {
  it('dérive auto-ID, pages réelles et dernière page de TOC', () => {
    const pages = [
      'Programme pour les élections fédérales du 9 juin 2024',
      [
        'Table des matières',
        'Introduction ......... 3',
        'Fiscalité ............ 10',
        'Conclusion ........... 40',
      ].join('\n'),
    ];
    // Complète jusqu'à 45 pages pour un document plausible.
    while (pages.length < 45) pages.push(`Contenu page ${pages.length + 1}`);
    const evidence = documentEvidence(
      { source_id: 'nva-programme-2024', layer: layerOf('nva-programme-2024', ...pages), knownPages: null },
      NVA,
    );
    expect(evidence.autoId?.yearPresent).toBe(true);
    expect(evidence.autoId?.levelPresent).toBe(true);
    expect(evidence.actualPages).toBe(45);
    expect(evidence.tocLastPage).toBe(40);
  });

  it('sans couche texte : auto-ID/TOC non évaluées, pages = knownPages', () => {
    const evidence = documentEvidence(
      { source_id: 'nva-programme-2024', layer: null, knownPages: 120 },
      NVA,
    );
    expect(evidence.autoId).toBeNull();
    expect(evidence.tocLastPage).toBeNull();
    expect(evidence.actualPages).toBe(120);
  });
});

describe('buildPartyAdmissionInput', () => {
  it('produit une évidence par partie attendue, vide si le signal manque', () => {
    const defi = getExpectedIdentity('defi');
    const input = buildPartyAdmissionInput(
      defi,
      [{ source_id: 'defi-axe-1-2024', layer: null, knownPages: 44 }],
      ['defi-axe-1-2024'],
    );
    expect(input.documents).toHaveLength(5);
    expect(input.documents[0]?.actualPages).toBe(44);
    expect(input.documents[1]?.actualPages).toBeNull();
  });

  it('bout-en-bout : un vrai livret manquant donne FAIL via le verdict', () => {
    const defi = getExpectedIdentity('defi');
    const present = defi.parts.filter((p) => p.source_id !== 'defi-axe-5-2024');
    const input = buildPartyAdmissionInput(
      defi,
      present.map((p) => ({ source_id: p.source_id, layer: null, knownPages: p.expected_pages })),
      present.map((p) => p.source_id),
    );
    expect(admitParty(input).status).toBe('FAIL');
  });
});
