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

  it('bout-en-bout (#49) : troncature de queue DANS la tolérance de taille → jamais PASS, UNCERTAIN escaladé', () => {
    // N-VA : 120 p. attendues (tolérance ±18). Document réellement tronqué à
    // 110 p. (perte 8 %, DANS la tolérance → `pages.within` PASSE). La TDM,
    // écrite pour le document complet, référence encore les pages coupées
    // (jusqu'à 116). C'est LE cas qu'aucun contrôle de taille n'attrape : seul
    // `toc-bounds` peut le voir. detectTocLastPage doit remonter 116 (exceeds),
    // et la corroboration doit classer UNCERTAIN — surtout PAS un PASS silencieux.
    const toc = ['Inhoud'];
    for (let page = 4; page <= 108; page += 4) toc.push(`Hoofdstuk ......... ${String(page)}`);
    toc.push('Voorlaatste ......... 113');
    toc.push('Besluit ............. 116');
    const pages = ['Programme pour les élections fédérales du 9 juin 2024', toc.join('\n')];
    while (pages.length < 110) pages.push(`Inhoud pagina ${pages.length + 1}`);
    const input = buildPartyAdmissionInput(
      NVA,
      [{ source_id: 'nva-programme-2024', layer: layerOf('nva-programme-2024', ...pages), knownPages: null }],
      ['nva-programme-2024'],
    );
    const verdict = admitParty(input);
    expect(input.documents[0]?.tocLastPage).toBe(116); // détection : exceeds, non avalé
    expect(verdict.reasons.find((r) => r.check === 'page-tolerance')?.code).toBe('pages.within');
    const tocReason = verdict.reasons.find((r) => r.check === 'toc-bounds');
    expect(tocReason?.severity).toBe('UNCERTAIN');
    expect(tocReason?.code).toBe('toc.exceeds-uncorroborated');
    expect(verdict.status).not.toBe('PASS');
    expect(verdict.status).toBe('UNCERTAIN');
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
