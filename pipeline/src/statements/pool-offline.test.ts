import { describe, expect, it } from 'vitest';

import type { LLMClient, LLMRequest } from '../extraction/llm-client.ts';
import { chunkLayer, type LayerInput } from '../extraction/position-extractor.ts';
import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import { getPartyProgrammeSources } from '../sources/party-programmes.ts';
import { supportsTextLayer } from '../extraction/text-layer.ts';
import {
  buildProgrammePoolPrompt,
  buildVotePoolPrompt,
  dedupeVotedDossiers,
  generateProgrammePool,
  generateVotePool,
  type HarvestedCandidate,
  type VotedDossier,
} from './candidate-pool.ts';
import { mergePoolCandidates } from './pool-merge.ts';
import { renderPoolYaml } from './pool-yaml.ts';
import {
  buildProgrammePoolEmit,
  buildVotePoolEmit,
  ingestProgrammePool,
  ingestVotePool,
  parsePoolResponsesFile,
  POOL_EMIT_KIND,
  POOL_OFFLINE_FORMAT_VERSION,
  POOL_RESPONSES_KIND,
  renderPoolEmitFile,
  renderPoolResponsesFile,
  scaffoldPoolResponsesFile,
  type PoolResponsesFile,
} from './pool-offline.ts';
import type { PlenaryVote } from '../votes/votes.types.ts';

// --- Fixtures -------------------------------------------------------------

function layerOf(
  sourceId: string,
  extractor: ProgrammeTextLayer['extractor'],
  pages: string[],
): ProgrammeTextLayer {
  return {
    source_id: sourceId,
    source_sha256: 'sha',
    extractor,
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

function inputOf(layer: ProgrammeTextLayer): LayerInput {
  return {
    layer,
    raw_snapshot_id: `${layer.source_id}@20260716T000000000Z`,
    url_source: `https://example.org/${layer.source_id}`,
  };
}

/** A concrete measure the model "finds" on a page, as a valid programme item. */
function programmeItem(page: number): string {
  return JSON.stringify({
    texte_fr: `Instaurer la mesure fictive de la page ${page}.`,
    note_concrete_fr: 'Seuil fictif de démonstration.',
    theme: 'mobilite',
    page,
  });
}

/** Deterministic per-chunk programme answer: one measure on the chunk's first page. */
function programmeAnswers(layer: LayerInput, maxChars: number): string[] {
  return chunkLayer(layer, maxChars).map((chunk) => `[${programmeItem(chunk.firstPage)}]`);
}

function plenaryVote(id: string, dossierId: string, date: string, title: string): PlenaryVote {
  return {
    id,
    legislature: '56',
    meeting_id: 'm1',
    vote_number: '1',
    date,
    title_fr: `Vote sur ${title}`,
    title_nl: `Stemming over ${title}`,
    dossier: { id: dossierId, title, document_type: null, status: null },
    document_id: null,
    motion_id: null,
    counts: { oui: 0, non: 0, abstention: 0 },
    ballots: [],
    groups: [],
    warnings: [],
  };
}

function fakeClient(answers: readonly string[]): LLMClient & { requests: LLMRequest[] } {
  const requests: LLMRequest[] = [];
  let call = 0;
  return {
    model: 'live-model',
    requests,
    complete(request) {
      requests.push(request);
      const text = answers[call];
      call += 1;
      if (text === undefined) throw new Error('fake client exhausted');
      return Promise.resolve({ text, usage: { input_tokens: 100, output_tokens: 20 } });
    },
  };
}

const MAX_CHARS = 80;
const PROGRAMME_LAYER = inputOf(
  layerOf('prog', 'unpdf', [
    'La première page décrit une mesure concrète de mobilité fictive.',
    'La deuxième page contient un autre passage de démonstration ici.',
    'Troisième page, encore du texte neutre pour forcer trois chunks.',
  ]),
);

/** An HTML web-chapter layer (#51): one chapter per page — no PDF anywhere. */
const HTML_LAYER = inputOf(
  layerOf('ptb-programme-2024', 'html-chapters', [
    'Chapitre 1 : mesure fictive sur la mobilité pour la démonstration keyless.',
    'Chapitre 2 : autre passage de démonstration pour un second chunk distinct.',
  ]),
);

const VOTE_DOSSIERS: VotedDossier[] = dedupeVotedDossiers([
  plenaryVote('56-m1-v1', '228', '2025-01-15', 'Instauration de la mesure fictive Gamma'),
  plenaryVote('56-m2-v4', '412', '2025-03-02', 'Mesure fictive Delta'),
]);

function voteAnswers(): string[] {
  // batchSize 1 → two batches → two answers; one candidate, one explicit null.
  return [
    '[{"vote_id": "56-m1-v1", "candidat": {"texte_fr": "Instaurer la mesure fictive Gamma.", ' +
      '"note_concrete_fr": "Échéance fictive : 2030.", "theme": "pensions-secu"}}]',
    '[{"vote_id": "56-m2-v4", "candidat": null}]',
  ];
}

function fillScaffold(emit: ReturnType<typeof buildProgrammePoolEmit>, answers: string[]): PoolResponsesFile {
  const scaffold = scaffoldPoolResponsesFile(emit);
  return {
    ...scaffold,
    responses: scaffold.responses.map((r) => ({ ...r, answer: answers[r.index]! })),
  };
}

// --- Emit -----------------------------------------------------------------

describe('buildProgrammePoolEmit', () => {
  it('freezes one prompt per chunk with the content anchor, no API call', () => {
    const emit = buildProgrammePoolEmit({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'claude-sonnet-5',
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const chunks = chunkLayer(PROGRAMME_LAYER, MAX_CHARS);
    expect(chunks.length).toBeGreaterThan(1); // the harvest really is multi-chunk
    expect(emit.kind).toBe(POOL_EMIT_KIND);
    expect(emit.surface).toBe('programme');
    expect(emit.origin).toBe('demo');
    expect(emit.unit_size).toBe(MAX_CHARS);
    expect(emit.units).toHaveLength(chunks.length);
    emit.units.forEach((unit, i) => {
      expect(unit.system).toContain('« Demo »');
      expect(unit.user).toContain('[PAGE');
      expect(unit.text_sha256).toBe(
        buildProgrammePoolEmit({
          partyId: 'demo',
          partyName: 'Demo',
          model: 'claude-sonnet-5',
          layers: [PROGRAMME_LAYER],
          maxChunkChars: MAX_CHARS,
        }).units[i]!.text_sha256,
      );
    });
    // The frozen prompt is byte-identical to the live prompt for the same chunk.
    expect(emit.units[0]!.user).toBe(buildProgrammePoolPrompt('Demo', chunks[0]!).user);
  });

  it('is deterministic — identical inputs emit a byte-identical file', () => {
    const options = {
      partyId: 'demo',
      partyName: 'Demo',
      model: 'claude-sonnet-5',
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    };
    expect(renderPoolEmitFile(buildProgrammePoolEmit(options))).toBe(
      renderPoolEmitFile(buildProgrammePoolEmit(options)),
    );
  });
});

describe('buildVotePoolEmit', () => {
  it('freezes one prompt per dossier batch with a batch content anchor', () => {
    const emit = buildVotePoolEmit({ model: 'claude-sonnet-5', dossiers: VOTE_DOSSIERS, batchSize: 1 });
    expect(emit.surface).toBe('votes');
    expect(emit.origin).toBe('votes');
    expect(emit.unit_size).toBe(1);
    expect(emit.units).toHaveLength(2);
    expect(emit.units[0]!.user).toContain('56-m1-v1');
    expect(emit.units[1]!.user).toContain('56-m2-v4');
  });
});

describe('scaffoldPoolResponsesFile / parsePoolResponsesFile', () => {
  it('mirrors the emitted units with blank answers, ready to fill', () => {
    const emit = buildProgrammePoolEmit({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'm',
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const scaffold = scaffoldPoolResponsesFile(emit);
    expect(scaffold.kind).toBe(POOL_RESPONSES_KIND);
    expect(scaffold.surface).toBe('programme');
    expect(scaffold.responses.map((r) => r.text_sha256)).toEqual(
      emit.units.map((u) => u.text_sha256),
    );
    expect(scaffold.responses.every((r) => r.answer === '')).toBe(true);
  });

  it('parses a well-formed filled file', () => {
    const emit = buildProgrammePoolEmit({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'm',
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const filled = fillScaffold(emit, programmeAnswers(PROGRAMME_LAYER, MAX_CHARS));
    const parsed = parsePoolResponsesFile(renderPoolResponsesFile(filled));
    expect(parsed.origin).toBe('demo');
    expect(parsed.responses).toHaveLength(emit.units.length);
  });

  it('rejects a wrong kind, version, surface, or a non-object top level', () => {
    expect(() => parsePoolResponsesFile('[]')).toThrow(/top level must be an object/);
    expect(() => parsePoolResponsesFile(JSON.stringify({ kind: 'nope' }))).toThrow(/wrong kind/);
    expect(() =>
      parsePoolResponsesFile(JSON.stringify({ kind: POOL_RESPONSES_KIND, version: 99 })),
    ).toThrow(/unsupported version/);
    expect(() =>
      parsePoolResponsesFile(
        JSON.stringify({ kind: POOL_RESPONSES_KIND, version: POOL_OFFLINE_FORMAT_VERSION, surface: 'x' }),
      ),
    ).toThrow(/surface must be/);
  });

  it('rejects an empty answer — every emitted unit must be filled', () => {
    const emit = buildProgrammePoolEmit({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'm',
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const filled = fillScaffold(emit, programmeAnswers(PROGRAMME_LAYER, MAX_CHARS));
    filled.responses[0]!.answer = '   ';
    expect(() => parsePoolResponsesFile(renderPoolResponsesFile(filled))).toThrow(/empty answer/);
  });
});

// --- Round-trip determinism: emit → fill → ingest === live ----------------

describe('round-trip determinism (programme): emit → fill → ingest === live', () => {
  it('produces a byte-identical pool to a live pass', async () => {
    const answers = programmeAnswers(PROGRAMME_LAYER, MAX_CHARS);
    const model = 'claude-sonnet-5';

    const live = await generateProgrammePool({
      partyId: 'demo',
      partyName: 'Demo',
      layers: [PROGRAMME_LAYER],
      client: fakeClient(answers),
      maxChunkChars: MAX_CHARS,
    });

    const emit = buildProgrammePoolEmit({
      partyId: 'demo',
      partyName: 'Demo',
      model,
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const responses = parsePoolResponsesFile(renderPoolResponsesFile(fillScaffold(emit, answers)));
    const offline = await ingestProgrammePool({
      partyId: 'demo',
      partyName: 'Demo',
      layers: [PROGRAMME_LAYER],
      model,
      responses,
      maxChunkChars: MAX_CHARS,
    });

    expect(offline.candidates).toEqual(live.candidates);
    expect(offline.usage).toEqual({ input_tokens: 0, output_tokens: 0 }); // keyless

    const render = (r: typeof live): string =>
      renderPoolYaml(mergePoolCandidates('demo', [], r.candidates), 'Pool Demo');
    expect(render(offline)).toBe(render(live));
    expect(offline.candidates.length).toBeGreaterThan(0);
  });
});

describe('round-trip determinism (votes): emit → fill → ingest === live', () => {
  it('produces a byte-identical pool to a live pass', async () => {
    const answers = voteAnswers();
    const model = 'claude-sonnet-5';

    const live = await generateVotePool({
      dossiers: VOTE_DOSSIERS,
      client: fakeClient(answers),
      batchSize: 1,
    });

    const emit = buildVotePoolEmit({ model, dossiers: VOTE_DOSSIERS, batchSize: 1 });
    const filled: PoolResponsesFile = {
      ...scaffoldPoolResponsesFile(emit),
      responses: scaffoldPoolResponsesFile(emit).responses.map((r) => ({
        ...r,
        answer: answers[r.index]!,
      })),
    };
    const responses = parsePoolResponsesFile(renderPoolResponsesFile(filled));
    const offline = await ingestVotePool({ dossiers: VOTE_DOSSIERS, model, responses, batchSize: 1 });

    expect(offline.candidates).toEqual(live.candidates);
    const render = (r: typeof live): string =>
      renderPoolYaml(mergePoolCandidates('votes', [], r.candidates), 'Pool votes');
    expect(render(offline)).toBe(render(live));
  });
});

// --- Hard-error re-validation ---------------------------------------------

describe('ingestProgrammePool (hard re-validation)', () => {
  function baseline(): PoolResponsesFile {
    const emit = buildProgrammePoolEmit({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'm',
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    return fillScaffold(emit, programmeAnswers(PROGRAMME_LAYER, MAX_CHARS));
  }

  const run = (responses: PoolResponsesFile, maxChunkChars = MAX_CHARS) =>
    ingestProgrammePool({
      partyId: 'demo',
      partyName: 'Demo',
      layers: [PROGRAMME_LAYER],
      model: 'm',
      responses,
      maxChunkChars,
    });

  it('rejects a chunk whose text changed since the emit (hash mismatch)', async () => {
    const responses = baseline();
    responses.responses[0]!.text_sha256 = 'deadbeefdeadbeef';
    await expect(run(responses)).rejects.toThrow(/content of this unit has changed since the emit/);
  });

  it('rejects a changed unit_size (chunk_chars) since the emit', async () => {
    await expect(run(baseline(), MAX_CHARS + 1)).rejects.toThrow(/chunk_chars has changed/);
  });

  it('rejects a missing unit (fewer responses than chunks)', async () => {
    const responses = baseline();
    responses.responses.pop();
    await expect(run(responses)).rejects.toThrow(/every unit must be answered/);
  });

  it('rejects an identity mismatch', async () => {
    const responses = baseline();
    responses.responses[0]!.label = 'prog p.9-9';
    await expect(run(responses)).rejects.toThrow(/identity mismatch/);
  });

  it('rejects a responses file for another surface', async () => {
    const votesEmit = buildVotePoolEmit({ model: 'm', dossiers: VOTE_DOSSIERS, batchSize: 1 });
    const wrongSurface = parsePoolResponsesFile(
      renderPoolResponsesFile({
        ...scaffoldPoolResponsesFile(votesEmit),
        responses: scaffoldPoolResponsesFile(votesEmit).responses.map((r) => ({
          ...r,
          answer: '[]',
        })),
      }),
    );
    await expect(run(wrongSurface)).rejects.toThrow(/'votes' surface, but this is a 'programme'/);
  });
});

// --- HTML source harvestability (#51) -------------------------------------

describe('HTML source harvestability', () => {
  it('every PTB-PVDA source is text-layer capable — no longer skipped as "no PDF"', () => {
    const sources = getPartyProgrammeSources('ptb-pvda');
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.mediaType).toBe('text/html');
      expect(supportsTextLayer(source.mediaType)).toBe(true);
    }
  });

  it('harvests an HTML web-chapter layer through the same emit/ingest path', async () => {
    const answers = programmeAnswers(HTML_LAYER, MAX_CHARS);
    const emit = buildProgrammePoolEmit({
      partyId: 'ptb-pvda',
      partyName: 'PTB-PVDA',
      model: 'm',
      layers: [HTML_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    expect(emit.units.length).toBeGreaterThan(0); // each chapter-page yields chunks
    const responses = parsePoolResponsesFile(renderPoolResponsesFile(fillScaffold(emit, answers)));
    const result = await ingestProgrammePool({
      partyId: 'ptb-pvda',
      partyName: 'PTB-PVDA',
      layers: [HTML_LAYER],
      model: 'm',
      responses,
      maxChunkChars: MAX_CHARS,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.sources[0]).toMatchObject({
      kind: 'programme',
      party_id: 'ptb-pvda',
      source_id: 'ptb-programme-2024',
    });
  });
});

// --- Pool merge rule preserved --------------------------------------------

describe('pool merge rule preserved through ingest', () => {
  it('never overwrites existing ids or coded positions when merging an ingested harvest', async () => {
    const answers = programmeAnswers(PROGRAMME_LAYER, MAX_CHARS);
    const emit = buildProgrammePoolEmit({
      partyId: 'demo',
      partyName: 'Demo',
      model: 'm',
      layers: [PROGRAMME_LAYER],
      maxChunkChars: MAX_CHARS,
    });
    const responses = parsePoolResponsesFile(renderPoolResponsesFile(fillScaffold(emit, answers)));
    const harvest = await ingestProgrammePool({
      partyId: 'demo',
      partyName: 'Demo',
      layers: [PROGRAMME_LAYER],
      model: 'm',
      responses,
      maxChunkChars: MAX_CHARS,
    });

    const existing: HarvestedCandidate & { id: string; positions: Record<string, 1> } = {
      id: 'demo-c001',
      positions: { ps: 1 },
      ...harvest.candidates[0]!,
    };
    const merged = mergePoolCandidates('demo', [existing], harvest.candidates);
    const kept = merged.find((c) => c.id === 'demo-c001');
    expect(kept?.positions).toEqual({ ps: 1 }); // coded positions untouched
    // The re-harvested identical candidate is dropped, not duplicated under a new id.
    expect(merged.filter((c) => c.texte_fr === existing.texte_fr)).toHaveLength(1);
  });
});
