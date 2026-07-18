import { describe, expect, it } from 'vitest';

import {
  checkChaptersInventory,
  checkPageTolerance,
  checkPartsInventory,
  checkTocWithinBounds,
  detectTocLastPage,
  pageTolerance,
  type ChapterInventory,
} from './completeness.ts';
import { getExpectedIdentity } from './expected-identity.ts';

describe('checkPartsInventory — inventaire des parties multiples', () => {
  const defi = getExpectedIdentity('defi');

  it('complet quand les 5 livrets DéFI sont présents', () => {
    const r = checkPartsInventory(defi, [
      'defi-axe-1-2024',
      'defi-axe-2-2024',
      'defi-axe-3-2024',
      'defi-axe-4-2024',
      'defi-axe-5-2024',
    ]);
    expect(r.status).toBe('complete');
    expect(r.missing).toEqual([]);
  });

  it('incomplet et nomme le livret manquant (incomplétude silencieuse)', () => {
    const r = checkPartsInventory(defi, [
      'defi-axe-1-2024',
      'defi-axe-2-2024',
      'defi-axe-3-2024',
      'defi-axe-5-2024',
    ]);
    expect(r.status).toBe('incomplete');
    expect(r.missing).toEqual(['defi-axe-4-2024']);
  });

  it('ignore les sources présentes hors périmètre attendu', () => {
    const r = checkPartsInventory(getExpectedIdentity('ps'), [
      'ps-programme-2024',
      'un-autre-source',
    ]);
    expect(r.status).toBe('complete');
    expect(r.present).toEqual(['ps-programme-2024']);
  });
});

describe('checkChaptersInventory — inventaire des chapitres web (#51)', () => {
  const inv = (expected: string[], present: string[]): ChapterInventory => ({
    expected,
    present,
    missing: expected.filter((s) => !present.includes(s)),
  });

  it('aucun inventaire (source paginée) → not-applicable (neutre)', () => {
    expect(checkChaptersInventory([]).status).toBe('not-applicable');
  });

  it('des attendus mais aucun snapshoté (crawl non lancé) → not-materialized', () => {
    const r = checkChaptersInventory([inv(['a', 'b', 'c'], [])]);
    expect(r.status).toBe('not-materialized');
  });

  it('sous-ensemble strict (crawl partiel 2/3) → incomplete, nomme le manquant', () => {
    const r = checkChaptersInventory([inv(['a', 'b', 'c'], ['a', 'b'])]);
    expect(r.status).toBe('incomplete');
    expect(r.missing).toEqual(['c']);
  });

  it('tous les attendus présents → complete', () => {
    const r = checkChaptersInventory([inv(['a', 'b'], ['a', 'b'])]);
    expect(r.status).toBe('complete');
    expect(r.expectedTotal).toBe(2);
  });

  it('agrège plusieurs documents : un miroir incomplet suffit à incomplete', () => {
    const r = checkChaptersInventory([inv(['a'], ['a']), inv(['x', 'y'], ['x'])]);
    expect(r.status).toBe('incomplete');
    expect(r.missing).toEqual(['y']);
  });
});

describe('detectTocLastPage — table des matières', () => {
  it('renvoie la plus grande page référencée par une TOC à points de conduite', () => {
    const toc = [
      'Table des matières',
      'Introduction ................. 3',
      'Chapitre 1 — Fiscalité ....... 12',
      'Chapitre 2 — Emploi .......... 45',
      'Conclusion ................... 118',
    ].join('\n');
    expect(detectTocLastPage(toc)).toBe(118);
  });

  it('reconnaît une TOC alignée par des espaces (sans points)', () => {
    const toc = ['Inhoud', 'Inleiding      5', 'Werk           40', 'Besluit        92'].join('\n');
    expect(detectTocLastPage(toc)).toBe(92);
  });

  it('renvoie null sous le seuil d\'entrées (pas de TOC plausible)', () => {
    expect(detectTocLastPage('Un seul titre .......... 4')).toBeNull();
    expect(detectTocLastPage('Texte courant sans structure de sommaire.')).toBeNull();
  });

  it('ne prend pas un titre numéroté en tête de ligne pour une entrée de TOC', () => {
    const body = ['1.2.3 Une section', '2 Un chapitre', '3 Autre chose'].join('\n');
    expect(detectTocLastPage(body)).toBeNull();
  });
});

describe('checkTocWithinBounds — détection de troncature', () => {
  it('within quand la dernière page de la TOC tient dans le document', () => {
    expect(checkTocWithinBounds(118, 120).status).toBe('within');
  });

  it('exceeds quand la TOC référence au-delà des pages réelles (tronqué)', () => {
    const r = checkTocWithinBounds(311, 100);
    expect(r.status).toBe('exceeds');
    expect(r.tocLastPage).toBe(311);
    expect(r.actualPages).toBe(100);
  });

  it('no-toc quand aucune table n\'a été détectée', () => {
    expect(checkTocWithinBounds(null, 100).status).toBe('no-toc');
  });
});

describe('checkPageTolerance — tolérance de pages', () => {
  it('tolérance = max(15 %, plancher)', () => {
    expect(pageTolerance(1220)).toBe(183);
    expect(pageTolerance(45)).toBe(7);
    expect(pageTolerance(10)).toBe(5); // plancher
  });

  it('within quand le nombre réel est proche de l\'attendu', () => {
    expect(checkPageTolerance(120, 120).status).toBe('within');
    expect(checkPageTolerance(45, 43).status).toBe('within');
  });

  it('outside pour la synthèse (100 p.) servie à la place du complet (311 p.)', () => {
    const r = checkPageTolerance(311, 100);
    expect(r.status).toBe('outside');
    expect(r.delta).toBe(211);
    expect(r.tolerance).toBe(47);
  });

  it('not-applicable sans pagination attendue (web-chapters) ou sans pages réelles', () => {
    expect(checkPageTolerance(null, 100).status).toBe('not-applicable');
    expect(checkPageTolerance(311, null).status).toBe('not-applicable');
  });
});
