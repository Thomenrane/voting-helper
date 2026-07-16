import { describe, expect, it } from 'vitest';

import {
  buildTextLayer,
  parseTextLayer,
  serializeTextLayer,
  summarizeTextLayerQuality,
  textLayerSource,
  type ProgrammeTextLayer,
} from './text-layer.ts';
import { minimalPdf } from './test-support/minimal-pdf.ts';


describe('buildTextLayer', () => {
  it('extracts one text entry per physical page, 1-based', async () => {
    const pdf = minimalPdf(['Alpha premiere page', 'Beta deuxieme page', 'Gamma troisieme']);
    const layer = await buildTextLayer('demo-source', 'abc123', pdf);

    expect(layer.source_id).toBe('demo-source');
    expect(layer.source_sha256).toBe('abc123');
    expect(layer.extractor).toBe('unpdf');
    expect(layer.page_count).toBe(3);
    expect(layer.pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(layer.pages[0]?.text).toContain('Alpha premiere page');
    expect(layer.pages[1]?.text).toContain('Beta deuxieme page');
    expect(layer.pages[2]?.text).toContain('Gamma troisieme');
  });

  it('is deterministic: identical bytes produce identical serialized layers', async () => {
    const pdf = minimalPdf(['Une seule page']);
    const a = serializeTextLayer(await buildTextLayer('s', 'sha', pdf));
    const b = serializeTextLayer(await buildTextLayer('s', 'sha', pdf));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('summarizeTextLayerQuality', () => {
  it('counts pages, characters and empty pages', () => {
    const layer: ProgrammeTextLayer = {
      source_id: 's',
      source_sha256: 'sha',
      extractor: 'unpdf',
      page_count: 3,
      pages: [
        { page: 1, text: 'abcd' },
        { page: 2, text: '   ' },
        { page: 3, text: 'ef' },
      ],
    };
    expect(summarizeTextLayerQuality(layer)).toEqual({
      pages: 3,
      characters: 9,
      empty_pages: 1,
    });
  });
});

describe('parseTextLayer', () => {
  const valid: ProgrammeTextLayer = {
    source_id: 's',
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: 1,
    pages: [{ page: 1, text: 'contenu' }],
  };

  it('round-trips a serialized layer', () => {
    expect(parseTextLayer(serializeTextLayer(valid), 'f.json')).toEqual(valid);
  });

  it('rejects invalid JSON naming the file', () => {
    expect(() => parseTextLayer(new TextEncoder().encode('{nope'), 'bad.json')).toThrow(
      /'bad.json'.*invalid JSON/,
    );
  });

  it('rejects a layer whose page_count diverges from its pages', () => {
    const broken = { ...valid, page_count: 2 };
    expect(() =>
      parseTextLayer(new TextEncoder().encode(JSON.stringify(broken)), 'f.json'),
    ).toThrow(/page_count=2 but 1 pages/);
  });

  it('rejects malformed page entries', () => {
    const broken = { ...valid, pages: [{ page: 1 }] };
    expect(() =>
      parseTextLayer(new TextEncoder().encode(JSON.stringify(broken)), 'f.json'),
    ).toThrow(/page entry 0 is malformed/);
  });
});

describe('textLayerSource', () => {
  it('derives a path-safe -text source keeping raw provenance', () => {
    const derived = textLayerSource({
      id: 'ps-programme-2024',
      label: 'PS — Programme 2024',
      originUrl: 'https://example.org/ps.pdf',
      fetchUrl: 'https://wayback.example.org/ps.pdf',
      channel: 'wayback',
      mediaType: 'application/pdf',
      provenance: 'note',
    });
    expect(derived.id).toBe('ps-programme-2024-text');
    expect(derived.mediaType).toBe('application/json');
    expect(derived.originUrl).toBe('https://example.org/ps.pdf');
    expect(derived.channel).toBe('wayback');
    expect(derived.id).toMatch(/^[a-z0-9-]+$/);
  });
});
