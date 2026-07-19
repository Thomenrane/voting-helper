/**
 * Keyless offline pool harvest — the emit/ingest seam of `statements:pool`,
 * the exact analog of `extraction/offline-extraction.ts` for the candidate
 * pool (#61, reusing #43/#44).
 *
 * `statements:pool` mines candidate statements from two surfaces (candidate-
 * pool.ts): a party's programme chunks (`--party`) and the eligible voted
 * dossiers (`--votes`). Both go through the injected `LLMClient` seam. This
 * module externalises *who produces the LLM outputs* WITHOUT changing a single
 * guarantee — the harvest itself (chunking/batching, strict+complete parsing,
 * pool merge) stays the REAL machinery of `generateProgrammePool` /
 * `generateVotePool`:
 *
 *  - `buildProgrammePoolEmit` / `buildVotePoolEmit` run the real harvest UP TO
 *    the LLM boundary and freeze, per unit (chunk or dossier batch), the exact
 *    `{ system, user }` prompt the live path would send, plus the content
 *    anchor `text_sha256` (`chunkTextHash`) and the sizing anchor `unit_size`
 *    (`chunk_chars` for programme, `batch_size` for votes). No API call.
 *  - An external LLM (a subscription agent, a human, the API) fills a responses
 *    file: one answer per unit, in the format the surface's parser expects.
 *  - `ingestProgrammePool` / `ingestVotePool` re-enter the SAME harvest with
 *    those answers injected through the existing replay client
 *    (`buildReplayClient`). The unit anchors are RE-VALIDATED one-to-one: a
 *    missing/extra/mismatched unit, a changed `unit_size`, or a chunk whose
 *    text changed since the emit (hash mismatch) is a HARD ERROR. The pool
 *    merge rule (ids and coded `positions` never overwritten) is untouched —
 *    the command hands the same `persist` hook it uses on the live path.
 *
 * For the same LLM outputs, `emit → fill → ingest` yields a byte-identical pool
 * to a live pass (invariant #43 — see pool-offline.test.ts).
 */
import { buildReplayClient, chunkTextHash } from '../extraction/offline-extraction.ts';
import {
  chunkLayer,
  DEFAULT_CHUNK_CHARS,
  type LayerChunk,
  type LayerInput,
} from '../extraction/position-extractor.ts';
import {
  batchDossiers,
  buildProgrammePoolPrompt,
  buildVotePoolPrompt,
  DEFAULT_DOSSIER_BATCH_SIZE,
  generateProgrammePool,
  generateVotePool,
  type PersistHarvest,
  type PoolGenerationResult,
  type VotedDossier,
} from './candidate-pool.ts';

/** File markers — a wrong-shaped file fails loudly instead of misbehaving. */
export const POOL_EMIT_KIND = 'voting-helper/pool-emit';
export const POOL_RESPONSES_KIND = 'voting-helper/pool-responses';
/** Bumped only on a breaking change to either file shape. */
export const POOL_OFFLINE_FORMAT_VERSION = 1;

/**
 * Harvest surface of a pool emit/ingest round-trip.
 * - `programme`: page-aligned chunks of one party's programme text layers.
 * - `votes`: batches of eligible voted dossiers.
 */
export type PoolSurface = 'programme' | 'votes';

/** One harvest unit frozen for offline filling — prompt + content anchor. */
export interface PoolEmitUnit {
  /** 0-based position in the deterministic harvest order. */
  index: number;
  /** Human identity for messages (`<source> p.a-b` or `batch k (n dossier(s))`). */
  label: string;
  /**
   * Short SHA-256 of the exact content this unit was built from — the
   * emit↔ingest content anchor. For a programme chunk, the chunk text; for a
   * dossier batch, the fully-rendered batch prompt (dossier lines + titles), so
   * a changed eligible-dossier set is caught instead of passing silently.
   */
  text_sha256: string;
  /** Exact system prompt the live path sends for this unit. */
  system: string;
  /** Exact user prompt (chunk text, or the enumerated dossier batch). */
  user: string;
}

/** The `--emit` artefact: the harvest plan plus every per-unit prompt. */
export interface PoolEmitFile {
  kind: typeof POOL_EMIT_KIND;
  version: number;
  surface: PoolSurface;
  /** Pool file origin key: the `party_id` (programme) or `'votes'` (votes). */
  origin: string;
  /** Programme party display name — programme surface only. */
  party_name?: string;
  model: string;
  /**
   * Sizing anchor the harvest used — `chunk_chars` (programme) or `batch_size`
   * (votes). Ingest must reproduce it exactly, else the units no longer line up.
   */
  unit_size: number;
  units: PoolEmitUnit[];
}

/** One filled answer for one unit, keyed by the emitted unit identity. */
export interface PoolChunkResponse {
  index: number;
  /** Human identity carried from the emit — echoed in error messages. */
  label: string;
  /** Short SHA-256 of the content this answer was written against (from emit). */
  text_sha256: string;
  /** Raw model answer for this unit — the JSON array the surface parser reads. */
  answer: string;
}

/** The `--ingest` input: one answer per emitted unit. */
export interface PoolResponsesFile {
  kind: typeof POOL_RESPONSES_KIND;
  version: number;
  surface: PoolSurface;
  origin: string;
  /** Sizing anchor the emit used — the ingest harvest must reproduce it. */
  unit_size: number;
  responses: PoolChunkResponse[];
}

/** The content anchor + label of one harvest unit, recomputed at emit and ingest. */
interface UnitAnchor {
  label: string;
  text_sha256: string;
}

function programmeChunkLabel(chunk: LayerChunk): string {
  return `${chunk.input.layer.source_id} p.${chunk.firstPage}-${chunk.lastPage}`;
}

function voteBatchLabel(index: number, batch: readonly VotedDossier[]): string {
  return `batch ${index + 1} (${batch.length} dossier(s))`;
}

// --- Emit -----------------------------------------------------------------

export interface BuildProgrammePoolEmitOptions {
  partyId: string;
  partyName: string;
  model: string;
  layers: readonly LayerInput[];
  maxChunkChars?: number;
}

/**
 * Runs the real programme harvest up to the LLM boundary and returns the emit
 * artefact. Reuses `chunkLayer` + `buildProgrammePoolPrompt` — the prompts are
 * identical to the live path, byte for byte. Pure and deterministic.
 */
export function buildProgrammePoolEmit(options: BuildProgrammePoolEmitOptions): PoolEmitFile {
  const { partyId, partyName, model, layers, maxChunkChars = DEFAULT_CHUNK_CHARS } = options;
  const chunks = layers.flatMap((input) => chunkLayer(input, maxChunkChars));
  const units = chunks.map((chunk, index): PoolEmitUnit => {
    const { system, user } = buildProgrammePoolPrompt(partyName, chunk);
    return {
      index,
      label: programmeChunkLabel(chunk),
      text_sha256: chunkTextHash(chunk.text),
      system,
      user,
    };
  });
  return {
    kind: POOL_EMIT_KIND,
    version: POOL_OFFLINE_FORMAT_VERSION,
    surface: 'programme',
    origin: partyId,
    party_name: partyName,
    model,
    unit_size: maxChunkChars,
    units,
  };
}

export interface BuildVotePoolEmitOptions {
  model: string;
  dossiers: readonly VotedDossier[];
  batchSize?: number;
}

/**
 * Runs the real votes harvest up to the LLM boundary and returns the emit
 * artefact. Reuses `batchDossiers` + `buildVotePoolPrompt`. Pure and
 * deterministic.
 */
export function buildVotePoolEmit(options: BuildVotePoolEmitOptions): PoolEmitFile {
  const { model, dossiers, batchSize = DEFAULT_DOSSIER_BATCH_SIZE } = options;
  const batches = batchDossiers(dossiers, batchSize);
  const units = batches.map((batch, index): PoolEmitUnit => {
    const { system, user } = buildVotePoolPrompt(batch);
    return {
      index,
      label: voteBatchLabel(index, batch),
      text_sha256: chunkTextHash(user),
      system,
      user,
    };
  });
  return {
    kind: POOL_EMIT_KIND,
    version: POOL_OFFLINE_FORMAT_VERSION,
    surface: 'votes',
    origin: 'votes',
    model,
    unit_size: batchSize,
    units,
  };
}

/** Deterministic serialisation of the emit artefact (stable key order + newline). */
export function renderPoolEmitFile(emit: PoolEmitFile): string {
  return `${JSON.stringify(emit, null, 2)}\n`;
}

/** Deterministic serialisation of a responses file (used to scaffold fills). */
export function renderPoolResponsesFile(responses: PoolResponsesFile): string {
  return `${JSON.stringify(responses, null, 2)}\n`;
}

/**
 * Scaffolds an empty responses file from an emit artefact — one entry per unit
 * with a blank `answer`, ready for a filler to complete.
 */
export function scaffoldPoolResponsesFile(emit: PoolEmitFile): PoolResponsesFile {
  return {
    kind: POOL_RESPONSES_KIND,
    version: POOL_OFFLINE_FORMAT_VERSION,
    surface: emit.surface,
    origin: emit.origin,
    unit_size: emit.unit_size,
    responses: emit.units.map((unit): PoolChunkResponse => ({
      index: unit.index,
      label: unit.label,
      text_sha256: unit.text_sha256,
      answer: '',
    })),
  };
}

// --- Parse ----------------------------------------------------------------

function fieldError(context: string, detail: string): Error {
  return new Error(`${context} is malformed: ${detail}`);
}

function isPoolSurface(value: unknown): value is PoolSurface {
  return value === 'programme' || value === 'votes';
}

/** Parses and structurally validates a responses file — a wrong shape fails hard. */
export function parsePoolResponsesFile(text: string, file = '<pool-responses>'): PoolResponsesFile {
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
  if (record['kind'] !== POOL_RESPONSES_KIND) {
    throw fieldError(
      file,
      `wrong kind '${String(record['kind'])}' (expected '${POOL_RESPONSES_KIND}').`,
    );
  }
  if (record['version'] !== POOL_OFFLINE_FORMAT_VERSION) {
    throw fieldError(file, `unsupported version '${String(record['version'])}'.`);
  }
  if (!isPoolSurface(record['surface'])) {
    throw fieldError(file, `surface must be 'programme' or 'votes', got '${String(record['surface'])}'.`);
  }
  if (typeof record['origin'] !== 'string' || record['origin'].length === 0) {
    throw fieldError(file, 'origin must be a non-empty string.');
  }
  const unitSize = record['unit_size'];
  if (typeof unitSize !== 'number' || !Number.isInteger(unitSize) || unitSize < 1) {
    throw fieldError(file, 'unit_size must be a positive integer (carried from the emit).');
  }
  if (!Array.isArray(record['responses'])) {
    throw fieldError(file, 'responses must be an array.');
  }
  const responses = record['responses'].map((item: unknown, i: number): PoolChunkResponse => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw fieldError(file, `responses[${i}] must be an object.`);
    }
    const r = item as Record<string, unknown>;
    const index = r['index'];
    const label = r['label'];
    const textSha256 = r['text_sha256'];
    const answer = r['answer'];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      throw fieldError(file, `responses[${i}].index must be a non-negative integer.`);
    }
    if (typeof label !== 'string' || label.length === 0) {
      throw fieldError(file, `responses[${i}].label must be a non-empty string (from the emit).`);
    }
    if (typeof textSha256 !== 'string' || textSha256.length === 0) {
      throw fieldError(file, `responses[${i}].text_sha256 must be a non-empty string (from the emit).`);
    }
    if (typeof answer !== 'string' || answer.trim().length === 0) {
      throw fieldError(
        file,
        `responses[${i}] (unit ${index}, ${label}) has an empty answer — ` +
          'every emitted unit must be filled.',
      );
    }
    return { index, label, text_sha256: textSha256, answer };
  });
  return {
    kind: POOL_RESPONSES_KIND,
    version: POOL_OFFLINE_FORMAT_VERSION,
    surface: record['surface'],
    origin: record['origin'],
    unit_size: unitSize,
    responses,
  };
}

// --- Ingest ---------------------------------------------------------------

/**
 * Re-validates the responses against freshly-recomputed unit anchors and
 * returns the answers in harvest order. A missing/extra unit, a changed
 * `unit_size`, an identity mismatch, or a content-hash mismatch is a HARD
 * ERROR — the shared guard of both surfaces.
 */
function orderPoolAnswers(
  surface: PoolSurface,
  origin: string,
  unitSize: number,
  anchors: readonly UnitAnchor[],
  responses: PoolResponsesFile,
): string[] {
  if (responses.surface !== surface) {
    throw new Error(
      `Responses file is for the '${responses.surface}' surface, but this is a '${surface}' harvest.`,
    );
  }
  if (responses.origin !== origin) {
    throw new Error(
      `Responses file is for origin '${responses.origin}', but this harvest is '${origin}'.`,
    );
  }
  if (responses.unit_size !== unitSize) {
    throw new Error(
      `Responses file was emitted with unit_size ${responses.unit_size}, but this harvest uses ` +
        `${unitSize} — ${surface === 'programme' ? 'chunk_chars' : 'batch_size'} has changed since ` +
        'the emit. Re-emit the plan against the current settings.',
    );
  }

  const byIndex = new Map<number, PoolChunkResponse>();
  for (const response of responses.responses) {
    if (byIndex.has(response.index)) {
      throw new Error(`Responses file has a duplicate answer for unit ${response.index}.`);
    }
    byIndex.set(response.index, response);
  }
  if (responses.responses.length !== anchors.length) {
    throw new Error(
      `Responses file covers ${responses.responses.length} unit(s) but the harvest has ` +
        `${anchors.length} — every unit must be answered (missing or extra unit).`,
    );
  }

  return anchors.map((anchor, index): string => {
    const response = byIndex.get(index);
    if (response === undefined) {
      throw new Error(`Responses file is missing the answer for unit ${index} (${anchor.label}).`);
    }
    if (response.label !== anchor.label) {
      throw new Error(
        `Responses file unit ${index} identity mismatch: expected ${anchor.label}, got ` +
          `${response.label} — re-emit the plan against the current corpus.`,
      );
    }
    // Content anchor: the frozen answer must be bound to the EXACT content it
    // was written against. A re-derived layer (or a changed eligible-dossier
    // set) keeps the identity above yet diverges here — a hard error.
    if (response.text_sha256 !== anchor.text_sha256) {
      throw new Error(
        `Responses file unit ${index} (${anchor.label}) text hash mismatch: answer was written ` +
          `against ${response.text_sha256}, current content is ${anchor.text_sha256} — the ` +
          'content of this unit has changed since the emit. Re-emit the plan against the current corpus.',
      );
    }
    return response.answer;
  });
}

export interface IngestProgrammePoolOptions {
  partyId: string;
  partyName: string;
  layers: readonly LayerInput[];
  model: string;
  responses: PoolResponsesFile;
  maxChunkChars?: number;
  persist?: PersistHarvest;
  log?: (line: string) => void;
}

/**
 * Re-enters the real programme harvest with externally-produced answers.
 * Recomputes the exact same chunks the live path (and `buildProgrammePoolEmit`)
 * would, re-validates every unit anchor one-to-one, then replays the answers
 * through the `LLMClient` seam into `generateProgrammePool`. The result is
 * identical to a live pass for the same answers, except usage is zero (keyless).
 */
export async function ingestProgrammePool(
  options: IngestProgrammePoolOptions,
): Promise<PoolGenerationResult> {
  const {
    partyId,
    partyName,
    layers,
    model,
    responses,
    maxChunkChars = DEFAULT_CHUNK_CHARS,
    persist,
    log,
  } = options;
  const chunks = layers.flatMap((input) => chunkLayer(input, maxChunkChars));
  const anchors: UnitAnchor[] = chunks.map((chunk) => ({
    label: programmeChunkLabel(chunk),
    text_sha256: chunkTextHash(chunk.text),
  }));
  const answers = orderPoolAnswers('programme', partyId, maxChunkChars, anchors, responses);
  const client = buildReplayClient(model, answers);
  return generateProgrammePool({
    partyId,
    partyName,
    layers,
    client,
    maxChunkChars,
    ...(persist !== undefined ? { persist } : {}),
    ...(log !== undefined ? { log } : {}),
  });
}

export interface IngestVotePoolOptions {
  dossiers: readonly VotedDossier[];
  model: string;
  responses: PoolResponsesFile;
  batchSize?: number;
  persist?: PersistHarvest;
  log?: (line: string) => void;
}

/**
 * Re-enters the real votes harvest with externally-produced answers. Recomputes
 * the exact same dossier batches, re-validates every unit anchor one-to-one,
 * then replays the answers into `generateVotePool`. Keyless — usage is zero.
 */
export async function ingestVotePool(
  options: IngestVotePoolOptions,
): Promise<PoolGenerationResult> {
  const { dossiers, model, responses, batchSize = DEFAULT_DOSSIER_BATCH_SIZE, persist, log } =
    options;
  const batches = batchDossiers(dossiers, batchSize);
  const anchors: UnitAnchor[] = batches.map((batch, index) => ({
    label: voteBatchLabel(index, batch),
    text_sha256: chunkTextHash(buildVotePoolPrompt(batch).user),
  }));
  const answers = orderPoolAnswers('votes', 'votes', batchSize, anchors, responses);
  const client = buildReplayClient(model, answers);
  return generateVotePool({
    dossiers,
    client,
    batchSize,
    ...(persist !== undefined ? { persist } : {}),
    ...(log !== undefined ? { log } : {}),
  });
}
