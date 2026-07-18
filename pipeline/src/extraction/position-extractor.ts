/**
 * LLM extraction of party positions from the derived text layer (#22).
 *
 * Flow per party: text layers (one per programme document) are cut into
 * page-aligned chunks that fit a single request; each chunk is sent with the
 * full statement list; the strict-JSON answers are parsed defensively, every
 * proposed citation is verified mechanically against the SAME layer
 * (citation-verifier), and candidates are merged into one outcome per
 * statement. A citation that fails verification REJECTS the position — it is
 * written with statut 'rejete', never published (only 'valide' records enter
 * scoring, and 'valide' is granted by human PR review alone).
 */
import type { PositionValue, Statement } from '@voting-helper/data';

import { verifyCitation, type CitationVerdict } from './citation-verifier.ts';
import type { LLMClient, LLMUsage } from './llm-client.ts';
import { addUsage } from './cost.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

/** One text layer plus the provenance the resulting citations must carry. */
export interface LayerInput {
  layer: ProgrammeTextLayer;
  /** Dated snapshot id of the RAW programme document (Citation.ref_snapshot). */
  raw_snapshot_id: string;
  /** Canonical origin URL of the programme document (Citation.url_source). */
  url_source: string;
}

/** A single position proposal parsed from one LLM answer. */
export interface PositionCandidate {
  statement_id: string;
  position: PositionValue;
  citation_texte: string;
  citation_page: number;
  source_id: string;
  raw_snapshot_id: string;
  url_source: string;
  /** First page of the chunk that produced this candidate — coverage provenance. */
  chunk_first_page: number;
  /** Last page of the chunk that produced this candidate — coverage provenance. */
  chunk_last_page: number;
  verdict: CitationVerdict;
}

/** One chunk actually examined during the sweep — the coverage inventory. */
export interface ExaminedChunk {
  source_id: string;
  first_page: number;
  last_page: number;
  chars: number;
}

export type StatementOutcome =
  /** One verified citation backs the position — proposed as 'en_attente'. */
  | {
      kind: 'position';
      statement_id: string;
      position: PositionValue;
      citation: PositionCandidate;
    }
  /** Citation(s) proposed but none survived mechanical verification. */
  | { kind: 'rejected'; statement_id: string; candidates: PositionCandidate[] }
  /** Verified citations disagree on the position — human arbitration needed. */
  | { kind: 'conflict'; statement_id: string; candidates: PositionCandidate[] }
  /** The programme documents no position on this statement. */
  | { kind: 'no_position'; statement_id: string };

export interface PartyExtractionResult {
  party_id: string;
  outcomes: StatementOutcome[];
  usage: LLMUsage;
  chunk_count: number;
  /** Every chunk examined by the sweep — the auditable coverage inventory. */
  chunks: ExaminedChunk[];
  /** Every candidate the model proposed, with chunk provenance and verdict. */
  candidates: PositionCandidate[];
}

/** Page-aligned chunk of one document, sized for a single request. */
export interface LayerChunk {
  input: LayerInput;
  firstPage: number;
  lastPage: number;
  text: string;
}

/**
 * Default chunk budget in characters — deliberately SMALL (~1.7k tokens of
 * FR/NL text, a few pages). The sweep is exhaustive (every chunk examined),
 * so recall does not depend on chunk size; a small, bounded context is the
 * whole point of #39: the LLM never sees a large document, so it cannot get
 * "lost in the middle". The statement list is re-sent with every chunk — the
 * chunk is the expensive context, the statements are amortised across it.
 */
export const DEFAULT_CHUNK_CHARS = 6_000;

export function chunkLayer(input: LayerInput, maxChars = DEFAULT_CHUNK_CHARS): LayerChunk[] {
  const chunks: LayerChunk[] = [];
  let pages: string[] = [];
  let firstPage = 1;
  let size = 0;
  const flush = (lastPage: number): void => {
    if (pages.length > 0) {
      chunks.push({ input, firstPage, lastPage, text: pages.join('\n') });
      pages = [];
      size = 0;
    }
  };
  for (const { page, text } of input.layer.pages) {
    const marked = `[PAGE ${page}]\n${text}`;
    if (size > 0 && size + marked.length > maxChars) {
      flush(page - 1);
      firstPage = page;
    }
    pages.push(marked);
    size += marked.length;
  }
  flush(input.layer.page_count);
  return chunks;
}

export function buildExtractionPrompt(
  partyName: string,
  statements: readonly Statement[],
  chunk: LayerChunk,
): { system: string; user: string } {
  const system = [
    'Tu es un codeur documentaire pour un test électoral belge. Tu analyses un extrait du',
    `programme officiel du parti « ${partyName} » et tu détermines, pour chaque énoncé fourni,`,
    'la position que CE TEXTE documente.',
    '',
    'Règles impératives :',
    '- Position sur une échelle de -2 à +2 : +2 = soutient pleinement l\'énoncé,',
    '  +1 = plutôt favorable, 0 = position explicitement neutre/conditionnelle,',
    '  -1 = plutôt opposé, -2 = s\'oppose frontalement. `null` si cet extrait ne',
    '  documente PAS de position sur l\'énoncé (le silence est une information).',
    '- Chaque position non-null (0 inclus : 0 est une position, pas une absence)',
    '  DOIT être accompagnée d\'une citation EXACTE, copiée',
    '  VERBATIM du texte fourni, dans la langue source (français ou néerlandais),',
    '  sans traduction, sans reformulation, sans correction orthographique, sans',
    '  ellipse. 1 à 3 phrases maximum.',
    '- `page` est le numéro indiqué par le marqueur [PAGE n] où la citation COMMENCE.',
    '- Chaque citation est vérifiée mécaniquement par recherche textuelle : toute',
    '  citation inexacte sera rejetée.',
    '- Ne déduis JAMAIS une position d\'une connaissance extérieure au texte fourni.',
    '',
    'Réponds UNIQUEMENT avec un tableau JSON (aucun texte autour), un objet par énoncé :',
    '[{"statement_id": "...", "position": -2 | -1 | 0 | 1 | 2 | null,',
    '  "citation": {"texte": "...", "page": 12} | null}]',
    '`citation` est null si et seulement si `position` est null.',
  ].join('\n');

  const statementList = statements
    .map((s) => `- ${s.id} : ${s.texte_fr}\n  (mesure concrète : ${s.note_concrete_fr})`)
    .join('\n');

  const user = [
    `Énoncés à évaluer :`,
    statementList,
    '',
    `Extrait du programme (document '${chunk.input.layer.source_id}', pages ${chunk.firstPage}` +
      ` à ${chunk.lastPage}) :`,
    '---',
    chunk.text,
    '---',
    'Rappel : JSON uniquement, citations VERBATIM dans la langue du texte.',
  ].join('\n');

  return { system, user };
}

interface ParsedItem {
  statement_id: string;
  position: PositionValue | null;
  citation: { texte: string; page: number } | null;
}

/**
 * Parses one LLM answer strictly — anything malformed raises a named error.
 *
 * Completeness is part of the contract (review MAJOR 2 on #32): every
 * requested statement must appear EXPLICITLY in the answer. An omitted
 * statement — an empty array, a silent model failure, or an injection in the
 * PDF text steering the model — must never masquerade as the editorially
 * meaningful « pas de position documentée » : that outcome exists only as an
 * explicit `position: null`.
 */
export function parseExtractionResponse(
  text: string,
  statements: readonly Statement[],
): ParsedItem[] {
  const known = new Set(statements.map((s) => s.id));
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/u, '')
    .replace(/\s*```$/u, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (cause) {
    throw new Error(`LLM answer is not valid JSON: ${String(cause)}\n---\n${text.slice(0, 400)}`, {
      cause,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new Error('LLM answer is valid JSON but not an array.');
  }
  const items = parsed.map((item: unknown, index: number): ParsedItem => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`LLM answer item ${index} is not an object.`);
    }
    const record = item as Record<string, unknown>;
    const statementId = record['statement_id'];
    if (typeof statementId !== 'string' || !known.has(statementId)) {
      throw new Error(`LLM answer item ${index} names unknown statement '${String(statementId)}'.`);
    }
    const position = record['position'];
    const citation = record['citation'];
    if (position === null) {
      if (citation !== null && citation !== undefined) {
        throw new Error(`LLM answer item ${index} (${statementId}) has a citation without position.`);
      }
      return { statement_id: statementId, position: null, citation: null };
    }
    if (typeof position !== 'number' || !Number.isInteger(position) || position < -2 || position > 2) {
      throw new Error(
        `LLM answer item ${index} (${statementId}) has an out-of-scale position: ${String(position)}.`,
      );
    }
    if (typeof citation !== 'object' || citation === null) {
      throw new Error(`LLM answer item ${index} (${statementId}) has a position without citation.`);
    }
    const citationRecord = citation as Record<string, unknown>;
    const texte = citationRecord['texte'];
    const page = citationRecord['page'];
    if (typeof texte !== 'string' || texte.trim().length === 0) {
      throw new Error(`LLM answer item ${index} (${statementId}) has an empty citation text.`);
    }
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new Error(`LLM answer item ${index} (${statementId}) has an invalid page: ${String(page)}.`);
    }
    return {
      statement_id: statementId,
      position: position as PositionValue,
      citation: { texte, page },
    };
  });
  const answered = new Set(items.map((item) => item.statement_id));
  const missing = statements.filter((statement) => !answered.has(statement.id));
  if (missing.length > 0) {
    throw new Error(
      `LLM answer is incomplete: missing statement(s) ${missing.map((s) => s.id).join(', ')}. ` +
        'Every requested statement must be answered explicitly (position or null).',
    );
  }
  return items;
}

/**
 * Merges verified candidates into one outcome per statement.
 * Rejection rule (#22): a position whose citation is not mechanically found
 * on its stated page is rejected — verified candidates alone can propose.
 */
export function mergeCandidates(
  statements: readonly Statement[],
  candidates: readonly PositionCandidate[],
): StatementOutcome[] {
  return statements.map((statement): StatementOutcome => {
    const own = candidates.filter((c) => c.statement_id === statement.id);
    if (own.length === 0) {
      return { kind: 'no_position', statement_id: statement.id };
    }
    const verified = own.filter((c) => c.verdict.status === 'verified');
    if (verified.length === 0) {
      return { kind: 'rejected', statement_id: statement.id, candidates: own };
    }
    const positions = new Set(verified.map((c) => c.position));
    if (positions.size > 1) {
      return { kind: 'conflict', statement_id: statement.id, candidates: verified };
    }
    const first = verified[0];
    if (first === undefined) {
      throw new Error('unreachable: verified candidates disappeared');
    }
    return {
      kind: 'position',
      statement_id: statement.id,
      position: first.position,
      citation: first,
    };
  });
}

export interface ExtractPositionsOptions {
  partyId: string;
  partyName: string;
  statements: readonly Statement[];
  layers: readonly LayerInput[];
  client: LLMClient;
  maxChunkChars?: number;
  maxTokensPerAnswer?: number;
  /** Progress logger — injected so tests stay silent. */
  log?: (line: string) => void;
}

export async function extractPositions(
  options: ExtractPositionsOptions,
): Promise<PartyExtractionResult> {
  const {
    partyId,
    partyName,
    statements,
    layers,
    client,
    maxChunkChars = DEFAULT_CHUNK_CHARS,
    maxTokensPerAnswer = 4096,
    log = () => {},
  } = options;

  const chunks = layers.flatMap((input) => chunkLayer(input, maxChunkChars));
  let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  const candidates: PositionCandidate[] = [];
  const examined: ExaminedChunk[] = [];

  for (const [index, chunk] of chunks.entries()) {
    log(
      `  chunk ${index + 1}/${chunks.length} — ${chunk.input.layer.source_id} ` +
        `p.${chunk.firstPage}-${chunk.lastPage} (${chunk.text.length} chars)…`,
    );
    examined.push({
      source_id: chunk.input.layer.source_id,
      first_page: chunk.firstPage,
      last_page: chunk.lastPage,
      chars: chunk.text.length,
    });
    const prompt = buildExtractionPrompt(partyName, statements, chunk);
    const response = await client.complete({ ...prompt, maxTokens: maxTokensPerAnswer });
    usage = addUsage(usage, response.usage);
    for (const item of parseExtractionResponse(response.text, statements)) {
      if (item.position === null || item.citation === null) {
        continue; // silence in this chunk is not evidence of absence overall
      }
      candidates.push({
        statement_id: item.statement_id,
        position: item.position,
        citation_texte: item.citation.texte,
        citation_page: item.citation.page,
        source_id: chunk.input.layer.source_id,
        raw_snapshot_id: chunk.input.raw_snapshot_id,
        url_source: chunk.input.url_source,
        chunk_first_page: chunk.firstPage,
        chunk_last_page: chunk.lastPage,
        verdict: verifyCitation(item.citation.texte, item.citation.page, chunk.input.layer),
      });
    }
  }

  return {
    party_id: partyId,
    outcomes: mergeCandidates(statements, candidates),
    usage,
    chunk_count: chunks.length,
    chunks: examined,
    candidates,
  };
}
