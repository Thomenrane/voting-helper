import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import type { LLMClient, LLMRequest } from './llm-client.ts';
import {
  buildExtractionPrompt,
  chunkLayer,
  extractPositions,
  mergeCandidates,
  parseExtractionResponse,
  type LayerInput,
  type PositionCandidate,
} from './position-extractor.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

const STATEMENTS: Statement[] = [
  {
    id: 's1',
    theme: 'fiscalite',
    texte_fr: 'Réduire les cotisations sociales sur les bas salaires.',
    texte_nl: 'De sociale bijdragen op lage lonen verlagen.',
    note_concrete_fr: 'Réduction ciblée.',
    note_concrete_nl: 'Gerichte verlaging.',
  },
  {
    id: 's2',
    theme: 'mobilite',
    texte_fr: 'Supprimer la TVA sur les billets de train.',
    texte_nl: 'De btw op treintickets afschaffen.',
    note_concrete_fr: 'TVA à 0 %.',
    note_concrete_nl: '0% btw.',
  },
];

function layerOf(sourceId: string, ...pages: string[]): ProgrammeTextLayer {
  return {
    source_id: sourceId,
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

function inputOf(layer: ProgrammeTextLayer): LayerInput {
  return {
    layer,
    raw_snapshot_id: `${layer.source_id}@20260716T000000000Z`,
    url_source: `https://example.org/${layer.source_id}.pdf`,
  };
}

describe('chunkLayer', () => {
  it('keeps a small document in a single page-marked chunk', () => {
    const chunks = chunkLayer(inputOf(layerOf('doc', 'page un', 'page deux')));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.firstPage).toBe(1);
    expect(chunks[0]?.lastPage).toBe(2);
    expect(chunks[0]?.text).toContain('[PAGE 1]\npage un');
    expect(chunks[0]?.text).toContain('[PAGE 2]\npage deux');
  });

  it('splits on page boundaries when the budget is exceeded', () => {
    const chunks = chunkLayer(inputOf(layerOf('doc', 'a'.repeat(50), 'b'.repeat(50), 'c')), 70);
    expect(chunks.map((c) => [c.firstPage, c.lastPage])).toEqual([
      [1, 1],
      [2, 3],
    ]);
  });

  it('never splits inside a page even when one page exceeds the budget', () => {
    const chunks = chunkLayer(inputOf(layerOf('doc', 'x'.repeat(500))), 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain('x'.repeat(500));
  });
});

describe('buildExtractionPrompt', () => {
  it('demands verbatim source-language citations and strict JSON', () => {
    const chunk = chunkLayer(inputOf(layerOf('doc', 'contenu')))[0];
    if (chunk === undefined) throw new Error('no chunk');
    const { system, user } = buildExtractionPrompt('PS', STATEMENTS, chunk);
    expect(system).toContain('VERBATIM');
    expect(system).toContain('langue source');
    expect(system).toContain('null');
    expect(system).toContain('non-null (0 inclus');
    expect(system).toContain('-2');
    expect(user).toContain('s1 : Réduire les cotisations sociales');
    expect(user).toContain('[PAGE 1]');
    expect(user).toContain('pages 1 à 1');
  });
});

describe('parseExtractionResponse', () => {
  it('parses a valid answer, fenced or not', () => {
    const body = JSON.stringify([
      { statement_id: 's1', position: 2, citation: { texte: 'Nous réduirons.', page: 3 } },
      { statement_id: 's2', position: null, citation: null },
    ]);
    for (const text of [body, `\`\`\`json\n${body}\n\`\`\``]) {
      const items = parseExtractionResponse(text, STATEMENTS);
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        statement_id: 's1',
        position: 2,
        citation: { texte: 'Nous réduirons.', page: 3 },
      });
      expect(items[1]).toEqual({ statement_id: 's2', position: null, citation: null });
    }
  });

  it('rejects an empty answer — omission must never pass for documented silence', () => {
    expect(() => parseExtractionResponse('[]', STATEMENTS)).toThrow(
      /missing statement\(s\) s1, s2/,
    );
  });

  it('rejects an answer omitting a requested statement', () => {
    const onlyS1 = JSON.stringify([{ statement_id: 's1', position: null, citation: null }]);
    expect(() => parseExtractionResponse(onlyS1, STATEMENTS)).toThrow(/missing statement\(s\) s2/);
  });

  it('rejects non-JSON, unknown statements and out-of-scale positions', () => {
    expect(() => parseExtractionResponse('je pense que…', STATEMENTS)).toThrow(/not valid JSON/);
    expect(() =>
      parseExtractionResponse(JSON.stringify([{ statement_id: 'zz', position: null, citation: null }]), STATEMENTS),
    ).toThrow(/unknown statement 'zz'/);
    expect(() =>
      parseExtractionResponse(
        JSON.stringify([{ statement_id: 's1', position: 3, citation: { texte: 't', page: 1 } }]),
        STATEMENTS,
      ),
    ).toThrow(/out-of-scale position: 3/);
  });

  it('rejects a position without citation and a citation without position', () => {
    expect(() =>
      parseExtractionResponse(JSON.stringify([{ statement_id: 's1', position: 1, citation: null }]), STATEMENTS),
    ).toThrow(/position without citation/);
    expect(() =>
      parseExtractionResponse(
        JSON.stringify([{ statement_id: 's1', position: null, citation: { texte: 't', page: 1 } }]),
        STATEMENTS,
      ),
    ).toThrow(/citation without position/);
  });

  it('rejects empty citation text and invalid pages', () => {
    expect(() =>
      parseExtractionResponse(
        JSON.stringify([{ statement_id: 's1', position: 1, citation: { texte: '  ', page: 1 } }]),
        STATEMENTS,
      ),
    ).toThrow(/empty citation text/);
    expect(() =>
      parseExtractionResponse(
        JSON.stringify([{ statement_id: 's1', position: 1, citation: { texte: 't', page: 0 } }]),
        STATEMENTS,
      ),
    ).toThrow(/invalid page: 0/);
  });
});

describe('mergeCandidates', () => {
  const verified = (statementId: string, position: -2 | -1 | 0 | 1 | 2, page = 1): PositionCandidate => ({
    statement_id: statementId,
    position,
    citation_texte: 'texte',
    citation_page: page,
    source_id: 'doc',
    raw_snapshot_id: 'doc@x',
    url_source: 'https://example.org/doc.pdf',
    chunk_first_page: page,
    chunk_last_page: page,
    verdict: { status: 'verified', page, spans_next_page: false },
  });

  it('keeps a single verified candidate as the proposed position', () => {
    const outcomes = mergeCandidates(STATEMENTS, [verified('s1', 2)]);
    expect(outcomes[0]).toMatchObject({ kind: 'position', statement_id: 's1', position: 2 });
    expect(outcomes[1]).toEqual({ kind: 'no_position', statement_id: 's2' });
  });

  it('rejects a statement whose only citations failed verification', () => {
    const rejected: PositionCandidate = { ...verified('s1', 1), verdict: { status: 'not_found' } };
    expect(mergeCandidates(STATEMENTS, [rejected])[0]).toMatchObject({
      kind: 'rejected',
      statement_id: 's1',
    });
  });

  it('flags a conflict when verified citations disagree on the position', () => {
    const outcomes = mergeCandidates(STATEMENTS, [verified('s1', 2), verified('s1', -2, 9)]);
    expect(outcomes[0]).toMatchObject({ kind: 'conflict', statement_id: 's1' });
  });

  it('agreeing verified candidates collapse to one proposal', () => {
    const outcomes = mergeCandidates(STATEMENTS, [verified('s1', 1), verified('s1', 1, 7)]);
    expect(outcomes[0]).toMatchObject({ kind: 'position', position: 1 });
  });
});

describe('extractPositions (injected fake client — no network)', () => {
  const LAYER = layerOf(
    'doc',
    'Nous réduirons les cotisations sociales sur les bas salaires dès 2025.',
    'Rien sur les trains ici.',
  );

  function fakeClient(answers: string[]): LLMClient & { requests: LLMRequest[] } {
    const requests: LLMRequest[] = [];
    return {
      model: 'fake-model',
      requests,
      async complete(request) {
        requests.push(request);
        const text = answers[requests.length - 1];
        if (text === undefined) throw new Error('fake client exhausted');
        return { text, usage: { input_tokens: 100, output_tokens: 20 } };
      },
    };
  }

  it('verifies citations against the layer and accumulates usage', async () => {
    const client = fakeClient([
      JSON.stringify([
        {
          statement_id: 's1',
          position: 2,
          citation: {
            texte: 'Nous réduirons les cotisations sociales sur les bas salaires dès 2025.',
            page: 1,
          },
        },
        { statement_id: 's2', position: null, citation: null },
      ]),
    ]);
    const result = await extractPositions({
      partyId: 'demo',
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [inputOf(LAYER)],
      client,
    });
    expect(result.chunk_count).toBe(1);
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 20 });
    expect(result.outcomes[0]).toMatchObject({ kind: 'position', position: 2 });
    expect(result.outcomes[1]).toEqual({ kind: 'no_position', statement_id: 's2' });
    // Coverage inventory (#39): every examined chunk and every candidate, with
    // chunk provenance, are exposed for the coverage report.
    expect(result.chunks).toEqual([
      { source_id: 'doc', first_page: 1, last_page: 2, chars: expect.any(Number) },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      statement_id: 's1',
      chunk_first_page: 1,
      chunk_last_page: 2,
    });
  });

  it('bounds each call to a small chunk — a large document is swept in many chunks', async () => {
    const bigPage = 'Contenu de programme neutre. '.repeat(400); // ~11k chars
    const layer = layerOf('big', bigPage, bigPage, bigPage);
    const client = fakeClient(
      Array.from({ length: 20 }, () =>
        JSON.stringify(STATEMENTS.map((s) => ({ statement_id: s.id, position: null, citation: null }))),
      ),
    );
    const result = await extractPositions({
      partyId: 'demo',
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [inputOf(layer)],
      client,
    });
    // With the small default budget each page is its own bounded call.
    expect(result.chunk_count).toBeGreaterThan(1);
    expect(client.requests.length).toBe(result.chunk_count);
    for (const request of client.requests) {
      expect(request.user).not.toContain(bigPage + bigPage); // never two pages of context at once
    }
  });

  it('rejects hallucinated citations mechanically', async () => {
    const client = fakeClient([
      JSON.stringify([
        {
          statement_id: 's2',
          position: 2,
          citation: { texte: 'Les billets de train seront gratuits.', page: 2 },
        },
        { statement_id: 's1', position: null, citation: null },
      ]),
    ]);
    const result = await extractPositions({
      partyId: 'demo',
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [inputOf(LAYER)],
      client,
    });
    const s2 = result.outcomes.find((o) => o.statement_id === 's2');
    expect(s2).toMatchObject({ kind: 'rejected' });
  });
});
