import { describe, expect, it } from 'vitest';

import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import {
  checkAutoIdentification,
  checkLayerAutoIdentification,
  firstPagesText,
} from './auto-identification.ts';
import { getExpectedIdentity } from './expected-identity.ts';

const PS = getExpectedIdentity('ps');
const NVA = getExpectedIdentity('nva');

function layerOf(sourceId: string, ...pages: string[]): ProgrammeTextLayer {
  return {
    source_id: sourceId,
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

describe('checkAutoIdentification — année', () => {
  it('détecte l\'année attendue en toutes lettres de couverture', () => {
    const r = checkAutoIdentification('Programme fédéral — élections du 9 juin 2024', PS);
    expect(r.yearPresent).toBe(true);
  });

  it('ne confond pas 2024 avec un nombre englobant (20240, 12024)', () => {
    const r = checkAutoIdentification('Document de référence 120240 pour la Chambre', PS);
    expect(r.yearPresent).toBe(false);
  });

  it('signale l\'absence de l\'année attendue (mauvaise édition 2019)', () => {
    const r = checkAutoIdentification('Programme fédéral 2019', PS);
    expect(r.yearPresent).toBe(false);
    expect(r.levelPresent).toBe(true);
  });
});

describe('checkAutoIdentification — niveau fédéral (insensible casse/accents)', () => {
  it('accepte « élections fédérales », « FÉDÉRAL », « federale » (NL)', () => {
    expect(checkAutoIdentification('élections fédérales 2024', PS).levelPresent).toBe(true);
    expect(checkAutoIdentification('PROGRAMME FÉDÉRAL 2024', PS).levelPresent).toBe(true);
    expect(checkAutoIdentification('federale verkiezingen 2024', PS).levelPresent).toBe(true);
  });

  it('accepte une référence à la Chambre / Kamer', () => {
    expect(checkAutoIdentification('pour la Chambre des représentants 2024', PS).levelPresent).toBe(
      true,
    );
    expect(
      checkAutoIdentification('programma voor de Kamer van volksvertegenwoordigers 2024', PS)
        .levelPresent,
    ).toBe(true);
  });

  it('REFUSE un intitulé générique sans marqueur fédéral explicite', () => {
    // « verkiezingsprogramma 2024 » n'affirme aucun niveau : le 9/6/2024, les
    // scrutins fédéral, régional et européen ont eu lieu le même jour.
    const r = checkAutoIdentification('Verkiezingsprogramma 2024 — Vlaamse welvaart', NVA);
    expect(r.yearPresent).toBe(true);
    expect(r.levelPresent).toBe(false);
    expect(r.matchedLevelTerms).toEqual([]);
  });

  it('cas N-VA « Voor Vlaamse Welvaart » : année OK, niveau non affirmé → non-PASS', () => {
    // Couverture réelle framée « flamand » : l'année est là, mais aucun
    // marqueur fédéral explicite dans les premières pages.
    const cover = 'Voor Vlaamse Welvaart\nHet verkiezingsprogramma van de N-VA — 2024';
    const r = checkAutoIdentification(cover, NVA);
    expect(r.yearPresent).toBe(true);
    expect(r.levelPresent).toBe(false);
  });
});

describe('firstPagesText / checkLayerAutoIdentification', () => {
  it('n\'inspecte que les premières pages', () => {
    const layer = layerOf(
      'ps-programme-2024',
      'Programme fédéral 2024',
      'Sommaire',
      'p3',
      'p4',
      'p5',
      'Élections régionales 2029 — page 6 hors fenêtre',
    );
    expect(firstPagesText(layer, 5)).not.toContain('page 6 hors fenêtre');
    const r = checkLayerAutoIdentification(layer, PS, 5);
    expect(r.yearPresent).toBe(true);
    expect(r.levelPresent).toBe(true);
    expect(r.pagesScanned).toBe(5);
  });

  it('rapporte le nombre réel de pages inspectées quand la couche est courte', () => {
    const layer = layerOf('x', 'Programme fédéral 2024', 'p2');
    expect(checkLayerAutoIdentification(layer, PS, 5).pagesScanned).toBe(2);
  });
});
