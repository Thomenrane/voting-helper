import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import {
  deriveKeywords,
  foldForLexical,
  LEXICAL_COOCCURRENCE_MIN,
  scanLayersForStatement,
} from './lexical-scan.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

const NUCLEAR: Statement = {
  id: 's5',
  theme: 'energie-climat',
  texte_fr: 'Prolonger deux réacteurs nucléaires de dix ans.',
  texte_nl: 'Twee kernreactoren met tien jaar verlengen.',
  note_concrete_fr: 'Prolongation au-delà de 2035.',
  note_concrete_nl: 'Verlenging tot na 2035.',
};

function layerOf(sourceId: string, ...pages: string[]): ProgrammeTextLayer {
  return {
    source_id: sourceId,
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

describe('foldForLexical', () => {
  it('strips diacritics, folds case and typography, keeps letters', () => {
    expect(foldForLexical('Réacteurs NUCLÉAIRES « prolongés »')).toBe(
      'reacteurs nucleaires "prolonges"',
    );
  });
});

describe('deriveKeywords', () => {
  it('derives bilingual content keywords and drops stopwords/short tokens', () => {
    const keywords = deriveKeywords(NUCLEAR, []);
    // FR + NL content words present…
    expect(keywords).toContain('reacteurs');
    expect(keywords).toContain('nucleaires');
    expect(keywords).toContain('kernreactoren');
    expect(keywords).toContain('verlengen');
    // …short tokens ('de', 'ans', 'na') and stopwords are gone.
    expect(keywords).not.toContain('ans');
    expect(keywords).not.toContain('de');
    expect(keywords.every((k) => k.length >= 4)).toBe(true);
  });

  it('adds published synonyms (single tokens and phrases), deduplicated and sorted', () => {
    const keywords = deriveKeywords(NUCLEAR); // default synonyms for s5
    expect(keywords).toContain('kerncentrale');
    expect(keywords).toContain('kernenergie');
    expect([...keywords]).toEqual([...keywords].sort());
    expect(new Set(keywords).size).toBe(keywords.length);
  });
});

describe('scanLayersForStatement', () => {
  it('flags a page where the subject co-occurs and ignores a page with a lone keyword', () => {
    const layer = layerOf(
      'prog',
      'Introduction générale sans rapport.',
      'Nous prolongeons les réacteurs nucléaires existants pour dix ans.', // 2 keywords
      'Le mot nucléaire apparaît seul ici, hors sujet.', // 1 keyword only
    );
    const scan = scanLayersForStatement(NUCLEAR, [layer], []);
    const pages = scan.hits.map((h) => h.page);
    expect(pages).toContain(2);
    expect(pages).not.toContain(3);
    expect(pages).not.toContain(1);
  });

  it('matches across FR and NL layers and orders strongest pages first', () => {
    const fr = layerOf('fr', 'Réacteurs nucléaires existants.'); // 2 keywords
    const nl = layerOf(
      'nl',
      'Wij verlengen de kernreactoren; prolongation nucléaire assumée.', // 4 keywords
    );
    const scan = scanLayersForStatement(NUCLEAR, [fr, nl]);
    expect(scan.hits.length).toBe(2);
    // The NL page matches more distinct keywords → it is ranked first.
    expect(scan.hits[0]?.source_id).toBe('nl');
    expect(scan.hits[0]?.terms.length).toBeGreaterThan(scan.hits[1]?.terms.length ?? 0);
  });

  it('uses whole-word matching — a keyword inside a larger word is not a match', () => {
    const trainStatement: Statement = {
      id: 's3',
      theme: 'mobilite',
      texte_fr: 'Supprimer la TVA sur les billets de train.',
      texte_nl: 'De btw op treintickets afschaffen.',
      note_concrete_fr: 'TVA à 0 %.',
      note_concrete_nl: '0% btw.',
    };
    // 'train' must not match 'entraînement'; 'billets' must not match 'billetterie'.
    const layer = layerOf('prog', 'Programme d’entraînement et billetterie diverse.');
    const scan = scanLayersForStatement(trainStatement, [layer], []);
    expect(scan.hits).toHaveLength(0);
  });

  it('returns no hits when the subject is absent, keeping the derived keywords', () => {
    const layer = layerOf('prog', 'Un texte entièrement consacré à la mobilité douce.');
    const scan = scanLayersForStatement(NUCLEAR, [layer], []);
    expect(scan.hits).toHaveLength(0);
    expect(scan.keywords.length).toBeGreaterThanOrEqual(LEXICAL_COOCCURRENCE_MIN);
  });
});
