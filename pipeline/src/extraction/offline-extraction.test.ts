import { describe, expect, it } from 'vitest';

import type { Statement } from '@voting-helper/data';

import { buildCoverageReport, renderCoverageReport } from './coverage-report.ts';
import { scanLayersForStatement } from './lexical-scan.ts';
import type { LLMClient, LLMRequest } from './llm-client.ts';
import {
  buildEmitFile,
  buildReplayClient,
  chunkTextHash,
  EMIT_KIND,
  ingestPositions,
  OFFLINE_FORMAT_VERSION,
  parseResponsesFile,
  renderEmitFile,
  renderResponsesFile,
  RESPONSES_KIND,
  scaffoldResponsesFile,
  type ResponsesFile,
} from './offline-extraction.ts';
import {
  chunkLayer,
  extractPositions,
  type LayerInput,
} from './position-extractor.ts';
import { renderPositionsYaml, toPartyPositions } from './positions-yaml.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

const STATEMENTS: Statement[] = [
  {
    id: 's1',
    theme: 'energie',
    texte_fr: 'Prolonger les centrales nucléaires existantes.',
    texte_nl: 'De bestaande kerncentrales verlengen.',
    note_concrete_fr: 'Maintien du parc nucléaire.',
    note_concrete_nl: 'Behoud van het kernpark.',
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

const CITATION = 'Nous soutenons le maintien des centrales nucléaires existantes.';

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

/** Three-page layer; a small budget forces a multi-chunk sweep. */
const LAYER = inputOf(
  layerOf(
    'prog',
    CITATION,
    'Rien de pertinent sur ces sujets dans cette page.',
    'Encore du texte neutre sans position codable ici.',
  ),
);
const MAX_CHARS = 120;

/**
 * Deterministic per-chunk answer: code s1 (+2) with a verbatim citation on the
 * chunk that contains page 1, `null` everywhere else; s2 is never documented.
 * Same answers feed the live fake client and the offline responses file.
 */
function answersForSweep(): string[] {
  const chunks = chunkLayer(LAYER, MAX_CHARS);
  return chunks.map((chunk) => {
    const hasCitationPage = chunk.firstPage <= 1 && 1 <= chunk.lastPage;
    return JSON.stringify([
      hasCitationPage
        ? { statement_id: 's1', position: 2, citation: { texte: CITATION, page: 1 } }
        : { statement_id: 's1', position: null, citation: null },
      { statement_id: 's2', position: null, citation: null },
    ]);
  });
}

function fakeClient(answers: string[]): LLMClient & { requests: LLMRequest[] } {
  const requests: LLMRequest[] = [];
  return {
    model: 'live-model',
    requests,
    async complete(request) {
      requests.push(request);
      const text = answers[requests.length - 1];
      if (text === undefined) throw new Error('fake client exhausted');
      return { text, usage: { input_tokens: 100, output_tokens: 20 } };
    },
  };
}

function responsesFromAnswers(partyId: string, answers: string[]): ResponsesFile {
  const chunks = chunkLayer(LAYER, MAX_CHARS);
  return {
    kind: RESPONSES_KIND,
    version: OFFLINE_FORMAT_VERSION,
    party_id: partyId,
    chunk_chars: MAX_CHARS,
    responses: chunks.map((chunk, index) => ({
      index,
      source_id: chunk.input.layer.source_id,
      first_page: chunk.firstPage,
      last_page: chunk.lastPage,
      text_sha256: chunkTextHash(chunk.text),
      answer: answers[index] ?? '',
    })),
  };
}

describe('buildEmitFile', () => {
  it('freezes one bounded prompt per chunk, all statements grouped, no API call', () => {
    const emit = buildEmitFile({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'claude-sonnet-5',
      statements: STATEMENTS,
      layers: [LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const chunks = chunkLayer(LAYER, MAX_CHARS);
    expect(emit.kind).toBe(EMIT_KIND);
    expect(emit.version).toBe(OFFLINE_FORMAT_VERSION);
    expect(emit.statement_ids).toEqual(['s1', 's2']);
    expect(emit.chunk_chars).toBe(MAX_CHARS);
    expect(emit.chunks).toHaveLength(chunks.length);
    expect(chunks.length).toBeGreaterThan(1); // the sweep really is multi-chunk
    // Each emitted prompt is the real live prompt, with both statements grouped,
    // and carries the deterministic content anchor of its chunk text.
    emit.chunks.forEach((chunk, i) => {
      expect(chunk.user).toContain('s1 : Prolonger les centrales');
      expect(chunk.user).toContain('s2 : Supprimer la TVA');
      expect(chunk.system).toContain('VERBATIM');
      expect(chunk.text_sha256).toBe(chunkTextHash(chunks[i]!.text));
    });
    expect(emit.chunks.map((c) => c.index)).toEqual([...chunks.keys()]);
  });

  it('is deterministic — identical layers emit a byte-identical file', () => {
    const options = {
      partyId: 'demo',
      partyName: 'Demo',
      model: 'claude-sonnet-5',
      statements: STATEMENTS,
      layers: [LAYER],
      maxChunkChars: MAX_CHARS,
    };
    expect(renderEmitFile(buildEmitFile(options))).toBe(renderEmitFile(buildEmitFile(options)));
  });
});

describe('scaffoldResponsesFile', () => {
  it('mirrors the emitted chunks with blank answers, ready to fill', () => {
    const emit = buildEmitFile({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'claude-sonnet-5',
      statements: STATEMENTS,
      layers: [LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const scaffold = scaffoldResponsesFile(emit);
    expect(scaffold.kind).toBe(RESPONSES_KIND);
    expect(scaffold.chunk_chars).toBe(emit.chunk_chars);
    expect(scaffold.responses.map((r) => r.index)).toEqual(emit.chunks.map((c) => c.index));
    expect(scaffold.responses.map((r) => r.text_sha256)).toEqual(
      emit.chunks.map((c) => c.text_sha256),
    );
    expect(scaffold.responses.every((r) => r.answer === '')).toBe(true);
    // renders to valid JSON round-trippable back through the parser once filled.
    expect(renderResponsesFile(scaffold)).toContain(RESPONSES_KIND);
  });
});

describe('parseResponsesFile', () => {
  it('parses a well-formed file', () => {
    const file = responsesFromAnswers('demo', answersForSweep());
    const parsed = parseResponsesFile(renderResponsesFile(file));
    expect(parsed.party_id).toBe('demo');
    expect(parsed.responses).toHaveLength(file.responses.length);
  });

  it('rejects a wrong kind, version, or a non-object top level', () => {
    expect(() => parseResponsesFile('[]')).toThrow(/top level must be an object/);
    expect(() => parseResponsesFile(JSON.stringify({ kind: 'nope' }))).toThrow(/wrong kind/);
    expect(() =>
      parseResponsesFile(JSON.stringify({ kind: RESPONSES_KIND, version: 99 })),
    ).toThrow(/unsupported version/);
  });

  it('rejects an empty answer — every emitted chunk must be filled', () => {
    const file = responsesFromAnswers('demo', answersForSweep());
    file.responses[0]!.answer = '   ';
    expect(() => parseResponsesFile(renderResponsesFile(file))).toThrow(/empty answer/);
  });
});

describe('ingestPositions (hard completeness)', () => {
  it('re-runs the real orchestration and verifies citations against the layer', async () => {
    const answers = answersForSweep();
    const result = await ingestPositions({
      partyId: 'demo',
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [LAYER],
      model: 'live-model',
      responses: responsesFromAnswers('demo', answers),
      maxChunkChars: MAX_CHARS,
    });
    expect(result.outcomes.find((o) => o.statement_id === 's1')).toMatchObject({
      kind: 'position',
      position: 2,
    });
    expect(result.outcomes.find((o) => o.statement_id === 's2')).toEqual({
      kind: 'no_position',
      statement_id: 's2',
    });
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 }); // keyless: no tokens
  });

  it('hard-errors when a chunk answer is missing (fewer responses than chunks)', async () => {
    const file = responsesFromAnswers('demo', answersForSweep());
    file.responses.pop(); // drop the last chunk answer
    await expect(
      ingestPositions({
        partyId: 'demo',
        partyName: 'Demo',
        statements: STATEMENTS,
        layers: [LAYER],
        model: 'live-model',
        responses: file,
        maxChunkChars: MAX_CHARS,
      }),
    ).rejects.toThrow(/every chunk must be answered/);
  });

  it('hard-errors when a chunk identity does not match the current sweep', async () => {
    const file = responsesFromAnswers('demo', answersForSweep());
    file.responses[0]!.last_page = 999;
    await expect(
      ingestPositions({
        partyId: 'demo',
        partyName: 'Demo',
        statements: STATEMENTS,
        layers: [LAYER],
        model: 'live-model',
        responses: file,
        maxChunkChars: MAX_CHARS,
      }),
    ).rejects.toThrow(/identity mismatch/);
  });

  it('hard-errors when the chunk text changed since the emit (hash mismatch)', async () => {
    const file = responsesFromAnswers('demo', answersForSweep());
    file.responses[0]!.text_sha256 = 'deadbeefdeadbeef'; // frozen against different text
    await expect(
      ingestPositions({
        partyId: 'demo',
        partyName: 'Demo',
        statements: STATEMENTS,
        layers: [LAYER],
        model: 'live-model',
        responses: file,
        maxChunkChars: MAX_CHARS,
      }),
    ).rejects.toThrow(/text of this chunk has changed since the emit/);
  });

  it('hard-errors when chunk_chars changed since the emit', async () => {
    const file = responsesFromAnswers('demo', answersForSweep()); // emitted at MAX_CHARS
    await expect(
      ingestPositions({
        partyId: 'demo',
        partyName: 'Demo',
        statements: STATEMENTS,
        layers: [LAYER],
        model: 'live-model',
        responses: file,
        maxChunkChars: MAX_CHARS + 1, // sweep uses a different budget
      }),
    ).rejects.toThrow(/chunk_chars has changed since the emit/);
  });

  it('hard-errors when an answer omits a requested statement (strict completeness)', async () => {
    const answers = answersForSweep();
    answers[0] = JSON.stringify([{ statement_id: 's1', position: null, citation: null }]); // s2 omitted
    await expect(
      ingestPositions({
        partyId: 'demo',
        partyName: 'Demo',
        statements: STATEMENTS,
        layers: [LAYER],
        model: 'live-model',
        responses: responsesFromAnswers('demo', answers),
        maxChunkChars: MAX_CHARS,
      }),
    ).rejects.toThrow(/missing statement\(s\) s2/);
  });

  it('hard-errors when the responses file targets another party', async () => {
    await expect(
      ingestPositions({
        partyId: 'demo',
        partyName: 'Demo',
        statements: STATEMENTS,
        layers: [LAYER],
        model: 'live-model',
        responses: responsesFromAnswers('other', answersForSweep()),
        maxChunkChars: MAX_CHARS,
      }),
    ).rejects.toThrow(/for party 'other'/);
  });
});

describe('buildReplayClient', () => {
  it('replays answers in order and exhausts loudly', async () => {
    const req: LLMRequest = { system: 's', user: 'u', maxTokens: 10 };
    const client = buildReplayClient('m', ['a', 'b']);
    expect((await client.complete(req)).text).toBe('a');
    expect((await client.complete(req)).text).toBe('b');
    await expect(client.complete(req)).rejects.toThrow(/exhausted/);
  });
});

describe('round-trip determinism: emit → fill → ingest === live', () => {
  it('produces byte-identical YAML and coverage.md to a live pass', async () => {
    const answers = answersForSweep();
    const model = 'claude-sonnet-5';
    const runDateIso = '2026-07-18';
    const runDateDisplay = '18/07/2026';

    // --- Live path: injected fake client through the real orchestration. ---
    const live = await extractPositions({
      partyId: 'demo',
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [LAYER],
      client: fakeClient(answers),
      maxChunkChars: MAX_CHARS,
    });

    // --- Offline path: emit → build responses file → parse → ingest. ---
    const emit = buildEmitFile({
      partyId: 'demo',
      partyName: 'Demo',
      model,
      statements: STATEMENTS,
      layers: [LAYER],
      maxChunkChars: MAX_CHARS,
    });
    // Fill the scaffold the emit path would hand to a filler.
    const scaffold = scaffoldResponsesFile(emit);
    const filled: ResponsesFile = {
      ...scaffold,
      responses: scaffold.responses.map((r) => ({ ...r, answer: answers[r.index]! })),
    };
    const responses = parseResponsesFile(renderResponsesFile(filled));
    const offline = await ingestPositions({
      partyId: 'demo',
      partyName: 'Demo',
      statements: STATEMENTS,
      layers: [LAYER],
      model,
      responses,
      maxChunkChars: MAX_CHARS,
    });

    // The orchestration outputs that feed YAML + coverage are identical.
    expect(offline.outcomes).toEqual(live.outcomes);
    expect(offline.candidates).toEqual(live.candidates);
    expect(offline.chunks).toEqual(live.chunks);
    expect(offline.chunk_count).toBe(live.chunk_count);

    // Render both artefacts through the SAME renderers and assert byte-equality.
    const renderYaml = (result: typeof live): string =>
      renderPositionsYaml(
        toPartyPositions('demo', result.outcomes, runDateIso),
        `Positions Demo — extraction LLM du ${runDateDisplay} (modèle ${model}).`,
      );
    const renderCoverage = (result: typeof live): string => {
      const lexicalScans = STATEMENTS.map((statement) =>
        scanLayersForStatement(statement, [LAYER].map((input) => input.layer)),
      );
      const coverage = buildCoverageReport({
        partyId: 'demo',
        statements: STATEMENTS,
        outcomes: result.outcomes,
        candidates: result.candidates,
        chunks: result.chunks,
        lexicalScans,
      });
      return renderCoverageReport(coverage, {
        partyName: 'Demo',
        model,
        runDate: runDateDisplay,
        statements: STATEMENTS,
      });
    };

    expect(renderYaml(offline)).toBe(renderYaml(live));
    expect(renderCoverage(offline)).toBe(renderCoverage(live));
  });
});
