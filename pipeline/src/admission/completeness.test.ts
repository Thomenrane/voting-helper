import { describe, expect, it } from 'vitest';

import {
  checkPageTolerance,
  checkPartsInventory,
  checkTocWithinBounds,
  detectTocLastPage,
  pageTolerance,
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

describe('detectTocLastPage — robustesse aux TDM multi-colonnes / points de conduite (#49)', () => {
  it('ignore un artefact de colonne d\'un ordre de grandeur au-delà du document (cd&v : 9957 sur 442 p.)', () => {
    // TDM linéarisée : de vrais titres de chapitres dont le numéro de page réel
    // (57, 56, 55…) ressort préfixé d'un chiffre parasite de la colonne voisine.
    const toc = [
      'Table des matières',
      'Inleiding ....................................................... 3',
      'Fiscaliteit ..................................................... 45',
      'Werk en economie ............................................... 210',
      'Onderwijs ...................................................... 388',
      'Prioriteit voor duurzame vrijetijdsinfrastructuur .............. 9957',
      'Hervorming non-profitfiscaliteit ............................... 9856',
      'Respect voor vrijheid van vereniging ........................... 9655',
      'Vrije Tijd ..................................................... 9453',
    ].join('\n');
    // Le max brut serait 9957 → faux toc.exceeds. Borné au réel, la dernière
    // page crédible est 388 (dans les 442 pages).
    expect(detectTocLastPage(toc, 442)).toBe(388);
    expect(checkTocWithinBounds(detectTocLastPage(toc, 442), 442).status).toBe('within');
  });

  it('un débordement sub-5× (les-engagés : 701 sur 355 p.) REMONTE comme exceeds — tranché au verdict, pas ici', () => {
    const entries = ['Sommaire'];
    for (let page = 5; page <= 350; page += 10) {
      entries.push(`Chapitre référencé ........................ ${String(page)}`);
    }
    // 701 ≈ 1,97× le réel : sous le facteur ×5, donc NON filtré par la détection.
    // Il remonte comme exceeds ; c'est la corroboration `pages.within` au verdict
    // qui le classera UNCERTAIN (et non un faux FAIL ni un PASS silencieux).
    entries.push('Titre parasité par la colonne voisine ..... 701');
    const toc = entries.join('\n');
    expect(detectTocLastPage(toc, 355)).toBe(701);
    expect(checkTocWithinBounds(detectTocLastPage(toc, 355), 355).status).toBe('exceeds');
  });

  it('troncature de queue DANS la tolérance de taille (peu d\'entrées débordent) → exceeds, PAS avalé (anti fail-open)', () => {
    // Document réellement tronqué de 8 % (120 → 110 p.) : la TDM, écrite pour le
    // document complet, référence encore les pages coupées (jusqu'à 116). Seules
    // 2 des 31 entrées dépassent 110 (6,5 %). Un garde-fou de « fraction » aurait
    // borné ce cas à `within` → PASS silencieux (fail-open). La détection ne le
    // fait plus : 116 remonte comme exceeds (le verdict l'escaladera).
    const entries = ['Inhoud'];
    for (let page = 4; page <= 108; page += 4) {
      entries.push(`Hoofdstuk ................................. ${String(page)}`);
    }
    entries.push('Voorlaatste ............................... 113');
    entries.push('Besluit ................................... 116');
    const toc = entries.join('\n');
    const last = detectTocLastPage(toc, 110);
    expect(last).toBe(116);
    expect(checkTocWithinBounds(last, 110).status).toBe('exceeds');
  });

  it('conserve la détection de troncature réelle : débordement large → exceeds (invariant de sûreté)', () => {
    // Document réellement tronqué : la TDM (écrite pour un document complet)
    // référence de nombreuses pages au-delà du réel.
    const entries = ['Table des matières'];
    for (let page = 20; page <= 300; page += 20) {
      entries.push(`Chapitre ................................... ${String(page)}`);
    }
    const toc = entries.join('\n');
    const last = detectTocLastPage(toc, 100);
    expect(last).toBe(300);
    expect(checkTocWithinBounds(last, 100).status).toBe('exceeds');
  });

  it('reste non concluant (null) quand toute la TDM est illisible (que des artefacts)', () => {
    const toc = [
      'Table des matières',
      'Titre A ............ 9957',
      'Titre B ............ 9856',
      'Titre C ............ 9655',
    ].join('\n');
    expect(detectTocLastPage(toc, 442)).toBeNull();
    expect(checkTocWithinBounds(detectTocLastPage(toc, 442), 442).status).toBe('no-toc');
  });

  it('sans borne connue (actualPages absent), conserve le comportement brut (max)', () => {
    const toc = [
      'Introduction ................. 3',
      'Chapitre 1 ................... 12',
      'Conclusion ................... 118',
    ].join('\n');
    expect(detectTocLastPage(toc)).toBe(118);
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
