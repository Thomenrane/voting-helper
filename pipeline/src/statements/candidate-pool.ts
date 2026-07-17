/**
 * Candidate-statement pool generation (#24).
 *
 * Two harvest surfaces, both through the injected LLMClient seam (#22 —
 * mocked in tests, never called in dry-run):
 * - programme chunks: the page-aligned text-layer chunks of one party's
 *   programme (chunkLayer, #22) are mined for CONCRETE MEASURES rewritten as
 *   candidate statements, each traceable to party + page + snapshot;
 * - voted dossiers: the titles of mechanically eligible plenary-vote
 *   dossiers (#23 criteria) are mined the same way, each candidate traceable
 *   to its vote id and DOC reference.
 *
 * Parsing strictness (lessons #32/#34): format, theme ids, pages and vote
 * ids are always hard-validated. Completeness differs by surface, on
 * purpose: the dossier prompt submits an enumerated list, so every dossier
 * must be decided EXPLICITLY (candidate or null) — model silence never
 * becomes "nothing usable here". Programme chunks have no enumerable item
 * list ("all measures in this text" cannot be checked mechanically), so an
 * empty array is a valid answer there and recall is a human review concern.
 *
 * These are CANDIDATES only: no candidate becomes one of the 35 statements
 * without the human selection/rewriting session described in
 * docs/methodologie/guide-redaction-enonces.md.
 */
import type { PositionValue } from '@voting-helper/data';

import { addUsage } from '../extraction/cost.ts';
import type { LLMClient, LLMUsage } from '../extraction/llm-client.ts';
import type { LayerChunk, LayerInput } from '../extraction/position-extractor.ts';
import { chunkLayer } from '../extraction/position-extractor.ts';
import { formatDossierRef } from '../linking/dossier-ref.ts';
import type { PlenaryVote } from '../votes/votes.types.ts';
import { CANONICAL_THEMES, isCanonicalTheme } from './theme-coverage.ts';

/** Where a candidate statement comes from — its traceability anchor. */
export type CandidateSource =
  | {
      kind: 'programme';
      party_id: string;
      source_id: string;
      /** Dated snapshot id of the raw programme document. */
      ref_snapshot: string;
      url_source: string;
      page: number;
    }
  | {
      kind: 'vote';
      vote_id: string;
      /** Canonical DOC reference of the dossier. */
      dossier: string;
      /** ISO date (YYYY-MM-DD) of the plenary vote. */
      date: string;
    };

/** One candidate statement of the pool — NOT one of the 35 (human step). */
export interface CandidateStatement {
  id: string;
  theme: string;
  texte_fr: string;
  note_concrete_fr: string;
  /** At least one traceable source (guide rule n°3). */
  sources: CandidateSource[];
  /**
   * Coded party positions (party_id → −2..+2), filled during the HITL loop
   * when they exist — the discriminance measure reads them. Absent until
   * then.
   */
  positions?: Record<string, PositionValue>;
}

/**
 * A candidate as it comes out of the harvest — no id yet (ids are assigned
 * by the pool merge so re-runs never renumber, see pool-merge.ts) and no
 * positions (coded by humans later).
 */
export type HarvestedCandidate = Omit<CandidateStatement, 'id' | 'positions'>;

export interface PoolGenerationResult {
  candidates: HarvestedCandidate[];
  usage: LLMUsage;
  /** Number of LLM requests made (programme chunks or dossier batches). */
  request_count: number;
}

/**
 * Called after EVERY successfully parsed request with the cumulative
 * harvest so far, so a paid run persists progress incrementally: a
 * malformed answer at request k+1 never loses the k answers already paid
 * for — the caller has already persisted them.
 */
export type PersistHarvest = (candidates: readonly HarvestedCandidate[]) => Promise<void>;

const THEME_LINES = CANONICAL_THEMES.map((theme) => `  - ${theme.id} (${theme.label_fr})`);

/** Shared writing rules — the prompt-side mirror of the published guide. */
const CANDIDATE_RULES = [
  'Règles impératives :',
  '- Un énoncé candidat = UNE mesure concrète, reformulée en UNE phrase simple en',
  '  français, à l\'infinitif, compréhensible sans connaissance politique préalable',
  '  (pas de sigle non expliqué, pas de jargon).',
  '- `note_concrete_fr` précise la mesure exacte en une phrase : chiffres, seuils,',
  '  échéances, tels que la source les formule.',
  '- Formulation NEUTRE : aucune tournure valorisante ou péjorative ; un électeur',
  '  ne doit pas deviner la « bonne » réponse à la lecture.',
  '- `theme` est OBLIGATOIREMENT un de ces identifiants (compétences fédérales) :',
  ...THEME_LINES,
  '- Ne propose PAS de mesure qui ne relève d\'aucun de ces thèmes (compétences',
  '  régionales, communautaires ou purement locales : hors périmètre fédéral).',
  '- Ne déduis JAMAIS une mesure d\'une connaissance extérieure au texte fourni.',
].join('\n');

export function buildProgrammePoolPrompt(
  partyName: string,
  chunk: LayerChunk,
): { system: string; user: string } {
  const system = [
    'Tu es un rédacteur documentaire pour un test électoral fédéral belge. Tu analyses',
    `un extrait du programme officiel du parti « ${partyName} » et tu en extrais des`,
    'MESURES CONCRÈTES qui pourraient devenir des énoncés candidats du test.',
    '',
    CANDIDATE_RULES,
    '- `page` est le numéro indiqué par le marqueur [PAGE n] où la mesure est décrite.',
    '- Extrais TOUTES les mesures concrètes de l\'extrait qui satisfont ces règles ;',
    '  si l\'extrait n\'en contient aucune, réponds avec un tableau vide [].',
    '',
    'Réponds UNIQUEMENT avec un tableau JSON (aucun texte autour), un objet par mesure :',
    '[{"texte_fr": "...", "note_concrete_fr": "...", "theme": "...", "page": 12}]',
  ].join('\n');

  const user = [
    `Extrait du programme (document '${chunk.input.layer.source_id}', pages ${chunk.firstPage}` +
      ` à ${chunk.lastPage}) :`,
    '---',
    chunk.text,
    '---',
    'Rappel : JSON uniquement, un thème de la liste fournie par mesure.',
  ].join('\n');

  return { system, user };
}

interface ParsedProgrammeCandidate {
  texte_fr: string;
  note_concrete_fr: string;
  theme: string;
  page: number;
}

function parseJsonArray(text: string): unknown[] {
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
  return parsed;
}

function assertCandidateFields(
  record: Record<string, unknown>,
  where: string,
): { texte_fr: string; note_concrete_fr: string; theme: string } {
  const texteFr = record['texte_fr'];
  const noteFr = record['note_concrete_fr'];
  const theme = record['theme'];
  if (typeof texteFr !== 'string' || texteFr.trim().length === 0) {
    throw new Error(`${where} has an empty texte_fr.`);
  }
  if (typeof noteFr !== 'string' || noteFr.trim().length === 0) {
    throw new Error(`${where} has an empty note_concrete_fr.`);
  }
  if (typeof theme !== 'string' || !isCanonicalTheme(theme)) {
    throw new Error(
      `${where} has an unknown theme '${String(theme)}' — must be one of: ` +
        `${CANONICAL_THEMES.map((t) => t.id).join(', ')}.`,
    );
  }
  return { texte_fr: texteFr, note_concrete_fr: noteFr, theme };
}

/**
 * Parses one programme-chunk answer strictly. An empty array is valid (a
 * chunk may contain no usable measure); every present item is
 * hard-validated: fields, canonical theme, page within the chunk's range.
 */
export function parseProgrammePoolResponse(
  text: string,
  chunk: LayerChunk,
): ParsedProgrammeCandidate[] {
  return parseJsonArray(text).map((item: unknown, index: number): ParsedProgrammeCandidate => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`LLM answer item ${index} is not an object.`);
    }
    const record = item as Record<string, unknown>;
    const fields = assertCandidateFields(record, `LLM answer item ${index}`);
    const page = record['page'];
    if (typeof page !== 'number' || !Number.isInteger(page)) {
      throw new Error(`LLM answer item ${index} has an invalid page: ${String(page)}.`);
    }
    if (page < chunk.firstPage || page > chunk.lastPage) {
      throw new Error(
        `LLM answer item ${index} cites page ${page}, outside the submitted chunk ` +
          `(pages ${chunk.firstPage}-${chunk.lastPage}).`,
      );
    }
    return { ...fields, page };
  });
}

export interface GenerateProgrammePoolOptions {
  partyId: string;
  partyName: string;
  layers: readonly LayerInput[];
  client: LLMClient;
  maxChunkChars?: number;
  maxTokensPerAnswer?: number;
  /** Incremental persistence hook — see PersistHarvest. */
  persist?: PersistHarvest;
  /** Progress logger — injected so tests stay silent. */
  log?: (line: string) => void;
}

/** Mines one party's programme chunks for candidate statements. */
export async function generateProgrammePool(
  options: GenerateProgrammePoolOptions,
): Promise<PoolGenerationResult> {
  const {
    partyId,
    partyName,
    layers,
    client,
    maxChunkChars,
    maxTokensPerAnswer = 8192,
    persist,
    log = () => {},
  } = options;
  const chunks = layers.flatMap((input) => chunkLayer(input, maxChunkChars));
  let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  const candidates: HarvestedCandidate[] = [];
  for (const [index, chunk] of chunks.entries()) {
    log(
      `  chunk ${index + 1}/${chunks.length} — ${chunk.input.layer.source_id} ` +
        `p.${chunk.firstPage}-${chunk.lastPage} (${chunk.text.length} chars)…`,
    );
    const prompt = buildProgrammePoolPrompt(partyName, chunk);
    const response = await client.complete({ ...prompt, maxTokens: maxTokensPerAnswer });
    usage = addUsage(usage, response.usage);
    for (const item of parseProgrammePoolResponse(response.text, chunk)) {
      candidates.push({
        theme: item.theme,
        texte_fr: item.texte_fr,
        note_concrete_fr: item.note_concrete_fr,
        sources: [
          {
            kind: 'programme',
            party_id: partyId,
            source_id: chunk.input.layer.source_id,
            ref_snapshot: chunk.input.raw_snapshot_id,
            url_source: chunk.input.url_source,
            page: item.page,
          },
        ],
      });
    }
    await persist?.(candidates);
  }
  return { candidates, usage, request_count: chunks.length };
}

/** One voted dossier submitted to the harvest — deduplicated by dossier. */
export interface VotedDossier {
  /** Representative plenary vote on this dossier. */
  vote: PlenaryVote;
  /** Canonical DOC reference (formatDossierRef). */
  dossier_ref: string;
}

/**
 * Deduplicates eligible votes by dossier, keeping the earliest vote of each
 * dossier as its representative. Votes without a dossier never reach this
 * point (mechanical eligibility, #23). Deterministic: input order decides
 * ties.
 */
export function dedupeVotedDossiers(votes: readonly PlenaryVote[]): VotedDossier[] {
  const byDossier = new Map<string, PlenaryVote>();
  for (const vote of votes) {
    if (vote.dossier === null) {
      throw new Error(`Vote '${vote.id}' has no dossier — eligibility must filter it upstream.`);
    }
    const key = `${vote.legislature}-${vote.dossier.id}`;
    const current = byDossier.get(key);
    if (current === undefined || vote.date < current.date) {
      byDossier.set(key, vote);
    }
  }
  return [...byDossier.values()].map((vote) => ({
    vote,
    dossier_ref: formatDossierRef(vote.legislature, (vote.dossier as { id: string }).id),
  }));
}

/** Default number of dossiers per LLM request. */
export const DEFAULT_DOSSIER_BATCH_SIZE = 40;

export function batchDossiers(
  dossiers: readonly VotedDossier[],
  batchSize = DEFAULT_DOSSIER_BATCH_SIZE,
): VotedDossier[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`batchSize must be a positive integer, got ${String(batchSize)}.`);
  }
  const batches: VotedDossier[][] = [];
  for (let i = 0; i < dossiers.length; i += batchSize) {
    batches.push(dossiers.slice(i, i + batchSize));
  }
  return batches;
}

export function buildVotePoolPrompt(
  batch: readonly VotedDossier[],
): { system: string; user: string } {
  const system = [
    'Tu es un rédacteur documentaire pour un test électoral fédéral belge. Tu examines',
    'des dossiers législatifs VOTÉS en séance plénière de la Chambre et tu détermines,',
    'pour chacun, si son intitulé décrit une mesure concrète qui pourrait devenir un',
    'énoncé candidat du test.',
    '',
    CANDIDATE_RULES,
    '- Tu ne disposes que des intitulés : si l\'intitulé ne décrit pas une mesure',
    '  concrète identifiable (budget global, texte fourre-tout, assentiment à un',
    '  traité sans mesure lisible…), `candidat` est null.',
    '',
    'Réponds UNIQUEMENT avec un tableau JSON (aucun texte autour), UN objet par dossier',
    'soumis — chaque dossier doit apparaître exactement une fois :',
    '[{"vote_id": "...",',
    '  "candidat": {"texte_fr": "...", "note_concrete_fr": "...", "theme": "..."} | null}]',
    'N\'invente jamais de vote_id absent de la liste fournie.',
  ].join('\n');

  const user = [
    'Dossiers votés (vote_id | date | dossier | intitulé du dossier | intitulé du vote) :',
    ...batch.map(({ vote, dossier_ref }) => {
      const dossierTitle = vote.dossier?.title ?? 'titre de dossier inconnu';
      return `- ${vote.id} | ${vote.date} | ${dossier_ref} | ${dossierTitle} | ${vote.title_fr}`;
    }),
    '',
    'Rappel : JSON uniquement, une décision explicite (candidat ou null) par dossier.',
  ].join('\n');

  return { system, user };
}

interface ParsedVoteCandidate {
  vote_id: string;
  candidat: { texte_fr: string; note_concrete_fr: string; theme: string } | null;
}

/**
 * Parses one dossier-batch answer strictly AND completely: every submitted
 * dossier must be decided exactly once (candidate or explicit null) — an
 * omitted dossier must never masquerade as "nothing usable" (lesson #32).
 */
export function parseVotePoolResponse(
  text: string,
  batch: readonly VotedDossier[],
): ParsedVoteCandidate[] {
  const known = new Set(batch.map(({ vote }) => vote.id));
  const seen = new Set<string>();
  const items = parseJsonArray(text).map((item: unknown, index: number): ParsedVoteCandidate => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`LLM answer item ${index} is not an object.`);
    }
    const record = item as Record<string, unknown>;
    const voteId = record['vote_id'];
    if (typeof voteId !== 'string' || !known.has(voteId)) {
      throw new Error(`LLM answer item ${index} names unknown vote '${String(voteId)}'.`);
    }
    if (seen.has(voteId)) {
      throw new Error(`LLM answer contains a duplicate decision for vote '${voteId}'.`);
    }
    seen.add(voteId);
    if (!('candidat' in record)) {
      // A missing key is not an explicit decision — 'candidat': null is.
      throw new Error(`LLM answer item ${index} (${voteId}) misses the 'candidat' field.`);
    }
    const candidat = record['candidat'];
    if (candidat === null) {
      return { vote_id: voteId, candidat: null };
    }
    if (typeof candidat !== 'object') {
      throw new Error(`LLM answer item ${index} (${voteId}) has a malformed candidat.`);
    }
    const fields = assertCandidateFields(
      candidat as Record<string, unknown>,
      `LLM answer item ${index} (${voteId})`,
    );
    return { vote_id: voteId, candidat: fields };
  });
  const missing = batch.filter(({ vote }) => !seen.has(vote.id));
  if (missing.length > 0) {
    throw new Error(
      `LLM answer is incomplete: missing decision(s) for ${missing
        .map(({ vote }) => vote.id)
        .join(', ')}. Every submitted dossier must be decided explicitly (candidat or null).`,
    );
  }
  return items;
}

export interface GenerateVotePoolOptions {
  dossiers: readonly VotedDossier[];
  client: LLMClient;
  batchSize?: number;
  maxTokensPerAnswer?: number;
  /** Incremental persistence hook — see PersistHarvest. */
  persist?: PersistHarvest;
  /** Progress logger — injected so tests stay silent. */
  log?: (line: string) => void;
}

/** Mines eligible voted-dossier titles for candidate statements. */
export async function generateVotePool(
  options: GenerateVotePoolOptions,
): Promise<PoolGenerationResult> {
  const {
    dossiers,
    client,
    batchSize = DEFAULT_DOSSIER_BATCH_SIZE,
    maxTokensPerAnswer = 8192,
    persist,
    log = () => {},
  } = options;
  const batches = batchDossiers(dossiers, batchSize);
  const byVoteId = new Map(dossiers.map((entry) => [entry.vote.id, entry]));
  let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  const candidates: HarvestedCandidate[] = [];
  for (const [index, batch] of batches.entries()) {
    log(`  batch ${index + 1}/${batches.length} — ${batch.length} dossier(s)…`);
    const prompt = buildVotePoolPrompt(batch);
    const response = await client.complete({ ...prompt, maxTokens: maxTokensPerAnswer });
    usage = addUsage(usage, response.usage);
    for (const item of parseVotePoolResponse(response.text, batch)) {
      if (item.candidat === null) {
        continue;
      }
      const origin = byVoteId.get(item.vote_id);
      if (origin === undefined) {
        throw new Error('unreachable: parsed decision names a dossier outside the pool input');
      }
      candidates.push({
        theme: item.candidat.theme,
        texte_fr: item.candidat.texte_fr,
        note_concrete_fr: item.candidat.note_concrete_fr,
        sources: [
          {
            kind: 'vote',
            vote_id: origin.vote.id,
            dossier: origin.dossier_ref,
            date: origin.vote.date,
          },
        ],
      });
    }
    await persist?.(candidates);
  }
  return { candidates, usage, request_count: batches.length };
}
