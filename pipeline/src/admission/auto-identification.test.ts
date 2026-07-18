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

describe('checkAutoIdentification — année (proximité d\'un marqueur de programme)', () => {
  it('détecte l\'année attendue près du titre du programme', () => {
    const r = checkAutoIdentification('Programme fédéral — élections du 9 juin 2024', PS);
    expect(r.yearPresent).toBe(true);
  });

  it('ne confond pas 2024 avec un nombre englobant (20240, 12024)', () => {
    const r = checkAutoIdentification('Document de référence 120240 pour la Chambre', PS);
    expect(r.yearPresent).toBe(false);
  });

  it('REFUSE une année isolée, loin de tout marqueur de programme (« budget 2024 »)', () => {
    // MINEUR #4 : une année seule ne dit rien — « budget 2024 », « en 2024 »…
    expect(checkAutoIdentification('Le budget 2024 prévoit des économies.', PS).yearPresent).toBe(
      false,
    );
    // Même mot « programma » mais séparé de l'année par > proximité → refusé.
    // (Du texte de remplissage, pas des espaces : la normalisation replie les
    // suites d'espaces en un seul.)
    const farApart = `verkiezingsprogramma ${'bla '.repeat(30)}2024`;
    expect(checkAutoIdentification(farApart, PS).yearPresent).toBe(false);
  });

  it('signale l\'absence de l\'année attendue (mauvaise édition 2019)', () => {
    const r = checkAutoIdentification('Programme aux élections fédérales 2019', PS);
    expect(r.yearPresent).toBe(false);
    // Le niveau, lui, est bien affirmé par une phrase forte.
    expect(r.levelPresent).toBe(true);
  });
});

describe('checkAutoIdentification — niveau fédéral : phrases fortes d\'auto-désignation', () => {
  it('accepte les phrases fortes explicites (FR + NL, insensible casse/accents)', () => {
    expect(checkAutoIdentification('Programme — élections fédérales 2024', PS).levelPresent).toBe(
      true,
    );
    expect(
      checkAutoIdentification('PROGRAMME POUR LES ÉLECTIONS FÉDÉRALES 2024', PS).levelPresent,
    ).toBe(true);
    expect(
      checkAutoIdentification('Federale verkiezingen 2024 — programma', PS).levelPresent,
    ).toBe(true);
  });

  it('accepte la Chambre des représentants / Kamer van volksvertegenwoordigers', () => {
    expect(
      checkAutoIdentification('Programme pour la Chambre des représentants 2024', PS).levelPresent,
    ).toBe(true);
    expect(
      checkAutoIdentification('Programma voor de Kamer van volksvertegenwoordigers 2024', PS)
        .levelPresent,
    ).toBe(true);
  });

  it('REFUSE un jeton nu « fédéral/federaal » sans phrase forte', () => {
    // Le durcissement : « fédéral » seul ne déclare pas un programme fédéral.
    const r = checkAutoIdentification('PROGRAMME FÉDÉRAL 2024', PS);
    expect(r.levelPresent).toBe(false);
    expect(r.matchedLevelTerms).toEqual([]);
  });

  it('REFUSE un intitulé générique sans marqueur fédéral fort', () => {
    // « verkiezingsprogramma 2024 » n'affirme aucun niveau : le 9/6/2024, les
    // scrutins fédéral, régional et européen ont eu lieu le même jour.
    const r = checkAutoIdentification('Verkiezingsprogramma 2024 — Vlaamse welvaart', NVA);
    expect(r.yearPresent).toBe(true);
    expect(r.levelPresent).toBe(false);
    expect(r.matchedLevelTerms).toEqual([]);
  });
});

describe('checkAutoIdentification — le discriminateur sépare « mentionne » de « se déclare »', () => {
  // (a) Fenêtre réaliste style N-VA : le texte DISCUTE du fédéral (« federale
  // overheid », « federale regering », « in de Kamer ») mais ne se déclare PAS
  // programme fédéral → level.present doit rester FAUX.
  const NVA_LIKE_WINDOW = [
    'Voor Vlaamse Welvaart',
    'Het verkiezingsprogramma van de N-VA — 2024',
    'Vlaanderen is onze prioriteit. De Vlaamse welvaart staat centraal.',
    'Wij willen bevoegdheden weghalen bij de federale overheid en ' +
      'overdragen naar Vlaanderen. De federale regering faalt.',
    'Ook in de Kamer blijven we ijveren voor confederalisme en meer Vlaamse autonomie.',
  ].join('\n');

  it('(a) un texte qui MENTIONNE le fédéral (federale overheid/regering, in de Kamer) ne compte PAS level.present', () => {
    const r = checkAutoIdentification(NVA_LIKE_WINDOW, NVA);
    expect(r.yearPresent).toBe(true); // 2024 près de « verkiezingsprogramma »
    expect(r.levelPresent).toBe(false); // discute du fédéral, ne se déclare pas fédéral
    expect(r.matchedLevelTerms).toEqual([]);
  });

  // (b) Un vrai programme fédéral portant la phrase forte → level.present VRAI.
  const REAL_FEDERAL_WINDOW = [
    'Programma voor de federale verkiezingen van 9 juni 2024',
    'Ons programma voor de Kamer van volksvertegenwoordigers.',
    'Concrete maatregelen voor het federale niveau.',
  ].join('\n');

  it('(b) un vrai programme fédéral portant la phrase forte compte level.present', () => {
    const r = checkAutoIdentification(REAL_FEDERAL_WINDOW, NVA);
    expect(r.levelPresent).toBe(true);
    expect(r.matchedLevelTerms).toContain('federale verkiezingen');
    expect(r.matchedLevelTerms).toContain('kamer van volksvertegenwoordigers');
  });
});

describe('firstPagesText / checkLayerAutoIdentification', () => {
  it('n\'inspecte que les premières pages', () => {
    const layer = layerOf(
      'ps-programme-2024',
      'Programme aux élections fédérales 2024',
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
    const layer = layerOf('x', 'Programme aux élections fédérales 2024', 'p2');
    expect(checkLayerAutoIdentification(layer, PS, 5).pagesScanned).toBe(2);
  });
});
