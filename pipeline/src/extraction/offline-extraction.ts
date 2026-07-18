/**
 * Keyless offline extraction — externalises the LLM step in two moves without
 * changing a single guarantee (#43).
 *
 * The exhaustive sweep, strict+complete parsing, mechanical citation
 * verification, inter-chunk merge and the coverage report stay the REAL
 * machinery of `extractPositions`. Only *who produces the LLM outputs* moves
 * out of the process:
 *
 *  - `buildEmitFile` runs the real orchestration UP TO the LLM boundary and
 *    freezes, per bounded chunk, the exact `{ system, user }` prompt the live
 *    path would send (one context chunk each, all statements grouped). No API
 *    call. Deterministic — the same layers always emit the same file.
 *  - An external LLM (a subscription agent, a human, or the API) fills a
 *    responses file: one structured answer per chunk, in the format
 *    `parseExtractionResponse` already expects.
 *  - `ingestPositions` re-enters the SAME orchestration with those answers
 *    injected through the existing `LLMClient` seam, so parsing (strict +
 *    complete), `verifyCitation`, `mergeCandidates` and the coverage report all
 *    run unchanged. A missing chunk or an omitted statement is a HARD ERROR —
 *    end-to-end completeness is preserved (lessons #32/#34/#39).
 *
 * For the same LLM outputs, `emit → fill → ingest` yields byte-identical YAML
 * and coverage artefacts to a live pass (see offline-extraction.test.ts).
 */
import type { Statement } from '@voting-helper/data';

import type { LLMClient } from './llm-client.ts';
import {
  buildExtractionPrompt,
  chunkLayer,
  DEFAULT_CHUNK_CHARS,
  extractPositions,
  type LayerInput,
  type PartyExtractionResult,
} from './position-extractor.ts';

/** File markers — a wrong-shaped file fails loudly instead of misbehaving. */
export const EMIT_KIND = 'voting-helper/extraction-emit';
export const RESPONSES_KIND = 'voting-helper/extraction-responses';
/** Bumped only on a breaking change to either file shape. */
export const OFFLINE_FORMAT_VERSION = 1;

/** One bounded chunk frozen for offline filling — prompt + coverage identity. */
export interface EmitChunk {
  /** 0-based position in the deterministic sweep order. */
  index: number;
  source_id: string;
  first_page: number;
  last_page: number;
  chars: number;
  /** Exact system prompt the live path sends for this chunk. */
  system: string;
  /** Exact user prompt (statements grouped + the chunk text) for this chunk. */
  user: string;
}

/** The `--emit` artefact: the sweep plan plus every per-chunk prompt. */
export interface EmitFile {
  kind: typeof EMIT_KIND;
  version: number;
  party_id: string;
  party_name: string;
  model: string;
  /** Chunk budget in chars used for the sweep — ingest must match it. */
  chunk_chars: number;
  /** Every statement the answers must decide, in order (completeness anchor). */
  statement_ids: string[];
  chunks: EmitChunk[];
}

/** One filled answer for one chunk, keyed by the emitted chunk identity. */
export interface ChunkResponse {
  index: number;
  source_id: string;
  first_page: number;
  last_page: number;
  /** Raw model answer for this chunk — the JSON array `parseExtractionResponse` reads. */
  answer: string;
}

/** The `--ingest` input: one answer per emitted chunk. */
export interface ResponsesFile {
  kind: typeof RESPONSES_KIND;
  version: number;
  party_id: string;
  responses: ChunkResponse[];
}

export interface BuildEmitOptions {
  partyId: string;
  partyName: string;
  model: string;
  statements: readonly Statement[];
  layers: readonly LayerInput[];
  maxChunkChars?: number;
}

/**
 * Runs the real sweep up to the LLM boundary and returns the emit artefact.
 * Reuses `chunkLayer` + `buildExtractionPrompt` — the prompts are identical to
 * the live path, byte for byte. Pure and deterministic: no I/O, no API call.
 */
export function buildEmitFile(options: BuildEmitOptions): EmitFile {
  const { partyId, partyName, model, statements, layers, maxChunkChars = DEFAULT_CHUNK_CHARS } =
    options;
  const chunks = layers.flatMap((input) => chunkLayer(input, maxChunkChars));
  const emittedChunks = chunks.map((chunk, index): EmitChunk => {
    const { system, user } = buildExtractionPrompt(partyName, statements, chunk);
    return {
      index,
      source_id: chunk.input.layer.source_id,
      first_page: chunk.firstPage,
      last_page: chunk.lastPage,
      chars: chunk.text.length,
      system,
      user,
    };
  });
  return {
    kind: EMIT_KIND,
    version: OFFLINE_FORMAT_VERSION,
    party_id: partyId,
    party_name: partyName,
    model,
    chunk_chars: maxChunkChars,
    statement_ids: statements.map((s) => s.id),
    chunks: emittedChunks,
  };
}

/** Deterministic serialisation of the emit artefact (stable key order + newline). */
export function renderEmitFile(emit: EmitFile): string {
  return `${JSON.stringify(emit, null, 2)}\n`;
}

/** Deterministic serialisation of a responses file (used to scaffold fills). */
export function renderResponsesFile(responses: ResponsesFile): string {
  return `${JSON.stringify(responses, null, 2)}\n`;
}

/**
 * Scaffolds an empty responses file from an emit artefact — one entry per
 * chunk with a blank `answer`, ready for a filler to complete. The emit path
 * writes the prompts; this makes producing the matching responses file trivial.
 */
export function scaffoldResponsesFile(emit: EmitFile): ResponsesFile {
  return {
    kind: RESPONSES_KIND,
    version: OFFLINE_FORMAT_VERSION,
    party_id: emit.party_id,
    responses: emit.chunks.map((chunk): ChunkResponse => ({
      index: chunk.index,
      source_id: chunk.source_id,
      first_page: chunk.first_page,
      last_page: chunk.last_page,
      answer: '',
    })),
  };
}

function fieldError(context: string, detail: string): Error {
  return new Error(`${context} is malformed: ${detail}`);
}

/** Parses and structurally validates a responses file — a wrong shape fails hard. */
export function parseResponsesFile(text: string, file = '<responses>'): ResponsesFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw fieldError(file, `not valid JSON (${String(cause)}).`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw fieldError(file, 'top level must be an object.');
  }
  const record = parsed as Record<string, unknown>;
  if (record['kind'] !== RESPONSES_KIND) {
    throw fieldError(file, `wrong kind '${String(record['kind'])}' (expected '${RESPONSES_KIND}').`);
  }
  if (record['version'] !== OFFLINE_FORMAT_VERSION) {
    throw fieldError(file, `unsupported version '${String(record['version'])}'.`);
  }
  if (typeof record['party_id'] !== 'string' || record['party_id'].length === 0) {
    throw fieldError(file, 'party_id must be a non-empty string.');
  }
  if (!Array.isArray(record['responses'])) {
    throw fieldError(file, 'responses must be an array.');
  }
  const responses = record['responses'].map((item: unknown, i: number): ChunkResponse => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw fieldError(file, `responses[${i}] must be an object.`);
    }
    const r = item as Record<string, unknown>;
    const index = r['index'];
    const sourceId = r['source_id'];
    const firstPage = r['first_page'];
    const lastPage = r['last_page'];
    const answer = r['answer'];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      throw fieldError(file, `responses[${i}].index must be a non-negative integer.`);
    }
    if (typeof sourceId !== 'string' || sourceId.length === 0) {
      throw fieldError(file, `responses[${i}].source_id must be a non-empty string.`);
    }
    if (typeof firstPage !== 'number' || !Number.isInteger(firstPage) || firstPage < 1) {
      throw fieldError(file, `responses[${i}].first_page must be a positive integer.`);
    }
    if (typeof lastPage !== 'number' || !Number.isInteger(lastPage) || lastPage < firstPage) {
      throw fieldError(file, `responses[${i}].last_page must be an integer >= first_page.`);
    }
    if (typeof answer !== 'string' || answer.trim().length === 0) {
      throw fieldError(
        file,
        `responses[${i}] (chunk ${index}, p.${firstPage}-${lastPage}) has an empty answer — ` +
          'every emitted chunk must be filled.',
      );
    }
    return { index, source_id: sourceId, first_page: firstPage, last_page: lastPage, answer };
  });
  return {
    kind: RESPONSES_KIND,
    version: OFFLINE_FORMAT_VERSION,
    party_id: record['party_id'],
    responses,
  };
}

export interface IngestPositionsOptions {
  partyId: string;
  partyName: string;
  statements: readonly Statement[];
  layers: readonly LayerInput[];
  model: string;
  responses: ResponsesFile;
  maxChunkChars?: number;
  log?: (line: string) => void;
}

/**
 * Re-enters the real orchestration with externally-produced answers.
 *
 * It recomputes the exact same bounded chunks the live path (and `buildEmitFile`)
 * would, validates that the responses cover EVERY chunk one-to-one by identity
 * (a missing/extra/mismatched chunk is a HARD ERROR), then replays the answers
 * through the `LLMClient` seam into `extractPositions`. Parsing stays strict and
 * complete, so an omitted statement inside an answer is also a hard error. The
 * returned result is identical to a live pass for the same answers, except that
 * offline usage is zero (no tokens are spent).
 */
export async function ingestPositions(
  options: IngestPositionsOptions,
): Promise<PartyExtractionResult> {
  const {
    partyId,
    partyName,
    statements,
    layers,
    model,
    responses,
    maxChunkChars = DEFAULT_CHUNK_CHARS,
    log = () => {},
  } = options;

  if (responses.party_id !== partyId) {
    throw new Error(
      `Responses file is for party '${responses.party_id}', but --party is '${partyId}'.`,
    );
  }

  const chunks = layers.flatMap((input) => chunkLayer(input, maxChunkChars));
  const byIndex = new Map<number, ChunkResponse>();
  for (const response of responses.responses) {
    if (byIndex.has(response.index)) {
      throw new Error(`Responses file has a duplicate answer for chunk ${response.index}.`);
    }
    byIndex.set(response.index, response);
  }
  if (responses.responses.length !== chunks.length) {
    throw new Error(
      `Responses file covers ${responses.responses.length} chunk(s) but the sweep has ` +
        `${chunks.length} — every chunk must be answered (missing or extra chunk).`,
    );
  }

  const answersInOrder: string[] = chunks.map((chunk, index) => {
    const response = byIndex.get(index);
    const identity = `${chunk.input.layer.source_id} p.${chunk.firstPage}-${chunk.lastPage}`;
    if (response === undefined) {
      throw new Error(`Responses file is missing the answer for chunk ${index} (${identity}).`);
    }
    if (
      response.source_id !== chunk.input.layer.source_id ||
      response.first_page !== chunk.firstPage ||
      response.last_page !== chunk.lastPage
    ) {
      throw new Error(
        `Responses file chunk ${index} identity mismatch: expected ${identity}, got ` +
          `${response.source_id} p.${response.first_page}-${response.last_page} — ` +
          're-emit the plan against the current text layer.',
      );
    }
    return response.answer;
  });

  const client = buildReplayClient(model, answersInOrder);
  const result = await extractPositions({
    partyId,
    partyName,
    statements,
    layers,
    client,
    maxChunkChars,
    log,
  });
  return result;
}

/**
 * Builds an `LLMClient` that replays pre-filled answers instead of calling the
 * API — the seam the offline path injects. Answers are returned in sweep order,
 * one per chunk. Offline usage is zero: no tokens are spent.
 */
export function buildReplayClient(model: string, answersInOrder: readonly string[]): LLMClient {
  let cursor = 0;
  return {
    model,
    async complete() {
      const text = answersInOrder[cursor];
      if (text === undefined) {
        throw new Error(
          `Replay client exhausted after ${cursor} answer(s) — the sweep asked for more ` +
            'chunks than the responses file provides.',
        );
      }
      cursor += 1;
      return { text, usage: { input_tokens: 0, output_tokens: 0 } };
    },
  };
}
