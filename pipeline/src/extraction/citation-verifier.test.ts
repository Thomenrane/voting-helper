/**
 * Seam n°2 (spec #15): citation proposed by the LLM + derived text layer →
 * mechanically found / not found. Written BEFORE the implementation (TDD).
 */
import { describe, expect, it } from 'vitest';

import { verifyCitation } from './citation-verifier.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

function layerOf(...pages: string[]): ProgrammeTextLayer {
  return {
    source_id: 'demo',
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

const LAYER = layerOf(
  'Nous proposons de réduire les cotisations sociales sur les bas salaires dès 2025.',
  'La TVA sur les billets de train sera supprimée. Un impôt sur les grandes fortunes' +
    ' sera instauré pour financer la transition.',
  'Wij verlengen twee kernreactoren met tien jaar om de bevoorrading te verzekeren.',
);

describe('verifyCitation — exact presence', () => {
  it('verifies a citation present verbatim on the stated page', () => {
    expect(
      verifyCitation('La TVA sur les billets de train sera supprimée.', 2, LAYER),
    ).toEqual({ status: 'verified', page: 2, spans_next_page: false });
  });

  it('rejects a citation absent from the layer', () => {
    expect(verifyCitation('Nous doublerons le budget de la défense.', 1, LAYER)).toEqual({
      status: 'not_found',
    });
  });

  it('rejects a citation altered by a single character', () => {
    expect(
      verifyCitation('La TVA sur les billets de train sera supprimee.', 2, LAYER),
    ).toEqual({ status: 'not_found' });
  });

  it('rejects a citation whose case was altered', () => {
    expect(
      verifyCitation('la TVA sur les billets de train sera supprimée.', 2, LAYER),
    ).toEqual({ status: 'not_found' });
  });

  it('throws on an empty citation — a contract violation, not a verdict', () => {
    expect(() => verifyCitation('   ', 1, LAYER)).toThrow(/empty citation/i);
  });
});

describe('verifyCitation — FR/NL PDF typography', () => {
  it('matches across non-breaking and narrow non-breaking spaces', () => {
    const layer = layerOf('Un budget de 3\u00A0000\u202F€ sera dégagé pour les écoles.');
    expect(verifyCitation('Un budget de 3 000 € sera dégagé pour les écoles.', 1, layer)).toEqual(
      { status: 'verified', page: 1, spans_next_page: false },
    );
  });

  it('matches across ligatures produced by PDF fonts', () => {
    const layer = layerOf('De ﬁscale hervorming wordt aﬂopend ingevoerd.');
    expect(verifyCitation('De fiscale hervorming wordt aflopend ingevoerd.', 1, layer)).toEqual({
      status: 'verified',
      page: 1,
      spans_next_page: false,
    });
  });

  it('matches across typographic dashes and curly quotes', () => {
    const layer = layerOf('Le « pacte social » couvre le long–terme — sans exception.');
    expect(
      verifyCitation(`Le "pacte social" couvre le long-terme - sans exception.`, 1, layer),
    ).toEqual({ status: 'verified', page: 1, spans_next_page: false });
  });

  it('matches across soft hyphens left by justified PDF text', () => {
    const layer = layerOf('Het regeer\u00ADakkoord voorziet een hervorming van de pensioenen.');
    expect(
      verifyCitation('Het regeerakkoord voorziet een hervorming van de pensioenen.', 1, layer),
    ).toEqual({ status: 'verified', page: 1, spans_next_page: false });
  });

  it('matches a citation whose line breaks became spaces in the layer', () => {
    const layer = layerOf('Nous garantissons\nun accès égal\naux soins de santé.');
    expect(verifyCitation('Nous garantissons un accès égal aux soins de santé.', 1, layer)).toEqual(
      { status: 'verified', page: 1, spans_next_page: false },
    );
  });
});

describe('verifyCitation — pagination', () => {
  const SPLIT = layerOf(
    'Introduction. Nous défendons une réforme fiscale juste',
    'et progressive pour tous les revenus. Conclusion.',
  );

  it('verifies a citation straddling the stated page and the next', () => {
    expect(
      verifyCitation('une réforme fiscale juste et progressive pour tous les revenus.', 1, SPLIT),
    ).toEqual({ status: 'verified', page: 1, spans_next_page: true });
  });

  it('reports the real start page when the stated page is the tail of the span', () => {
    expect(
      verifyCitation('une réforme fiscale juste et progressive pour tous les revenus.', 2, SPLIT),
    ).toEqual({ status: 'found_elsewhere', pages: [1] });
  });

  it('reports the pages where the text actually lives when the stated page is wrong', () => {
    expect(
      verifyCitation('La TVA sur les billets de train sera supprimée.', 3, LAYER),
    ).toEqual({ status: 'found_elsewhere', pages: [2] });
  });

  it('reports every occurrence of a repeated citation', () => {
    const layer = layerOf('Slogan commun.', 'Autre contenu.', 'Slogan commun.');
    expect(verifyCitation('Slogan commun.', 2, layer)).toEqual({
      status: 'found_elsewhere',
      pages: [1, 3],
    });
  });

  it('handles an out-of-range stated page without crashing', () => {
    expect(verifyCitation('La TVA sur les billets de train sera supprimée.', 99, LAYER)).toEqual({
      status: 'found_elsewhere',
      pages: [2],
    });
  });
});
