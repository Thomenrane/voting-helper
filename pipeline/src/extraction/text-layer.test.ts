import { describe, expect, it } from 'vitest';

import {
  buildTextLayer,
  parseTextLayer,
  serializeTextLayer,
  summarizeTextLayerQuality,
  textLayerSource,
  type ProgrammeTextLayer,
} from './text-layer.ts';

/**
 * Builds a minimal valid multi-page PDF in memory (uncompressed streams,
 * correct xref offsets) so extraction is tested offline against real pdf.js
 * parsing — no gitignored snapshot binaries involved.
 */
function minimalPdf(pagesText: string[]): Uint8Array {
  const n = pagesText.length;
  const fontObj = 3 + 2 * n;
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pagesText.map((_, i) => `${3 + i} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  for (let i = 0; i < n; i += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${3 + n + i} 0 R ` +
        `/Resources << /Font << /F1 ${fontObj} 0 R >> >> >>`,
    );
  }
  for (const text of pagesText) {
    const escaped = text.replace(/[\\()]/g, (c) => `\\${c}`);
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((content, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

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
