/**
 * Semantic preselection of candidate votes for one statement (#23).
 *
 * Two stages per statement, both downstream of the mechanical eligibility
 * rules (vote-eligibility.ts):
 * 1. a cheap lexical prefilter ranks eligible votes by token overlap between
 *    the statement (FR+NL text and concrete note) and the vote/dossier
 *    titles, keeping the top candidates — this bounds the LLM request and
 *    stands in for Eurovoc descriptors until the FLWB scraper (#2) provides
 *    them;
 * 2. the LLM (injected `LLMClient` seam, #22 — mocked in tests, never called
 *    in dry-run) decides for EVERY candidate: retained or set aside, with a
 *    one-sentence justification, and for retained votes the dossier's
 *    direction relative to the statement ('soutient'/'contredit', m3).
 *
 * Parsing is strict and complete (lesson of the #32 review): unknown ids,
 * duplicates, missing candidates or malformed directions are hard errors —
 * model silence never becomes an editorial decision.
 */
import type { DossierDirection, Statement } from '@voting-helper/data';

import type { LLMClient, LLMUsage } from '../extraction/llm-client.ts';
import { addUsage } from '../extraction/cost.ts';
import type { PlenaryVote } from '../votes/votes.types.ts';
import { formatDossierRef } from './dossier-ref.ts';
import { KIND_LABEL, type EligibleVoteKind } from './vote-eligibility.ts';

/** One mechanically eligible vote, with its classification. */
export interface EligibleVote {
  vote: PlenaryVote;
  kind: EligibleVoteKind;
}

/** A candidate the model retained for one statement. */
export interface RetainedLink {
  vote: PlenaryVote;
  kind: EligibleVoteKind;
  direction_dossier: DossierDirection;
  /** One-sentence justification — copied verbatim into the LinkedVote. */
  justification: string;
}

/** A candidate the model examined and set aside, with its reason. */
export interface SetAsideLink {
  vote: PlenaryVote;
  kind: EligibleVoteKind;
  motif: string;
}

export interface StatementPreselection {
  retained: RetainedLink[];
  setAside: SetAsideLink[];
  usage: LLMUsage;
}

/** Default cap on candidates sent to the model per statement. */
export const DEFAULT_MAX_CANDIDATES = 30;

/** Minimum token length considered meaningful for the lexical prefilter. */
const MIN_TOKEN_LENGTH = 4;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH),
  );
}

function statementTokens(statement: Statement): Set<string> {
  return tokenize(
    `${statement.texte_fr} ${statement.texte_nl} ${statement.note_concrete_fr} ${statement.note_concrete_nl}`,
  );
}

function candidateTokens(candidate: EligibleVote): Set<string> {
  const { vote } = candidate;
  return tokenize(`${vote.title_fr} ${vote.title_nl} ${vote.dossier?.title ?? ''}`);
}

/**
 * Ranks eligible votes by lexical overlap with the statement and keeps the
 * top `maxCandidates`. Zero-overlap votes are dropped: they are reported as
 * mechanically out of scope for this statement, not sent to the model.
 * Deterministic: stable sort, ties keep input order.
 */
export function rankCandidatesLexically(
  statement: Statement,
  eligible: readonly EligibleVote[],
  maxCandidates: number,
): EligibleVote[] {
  const target = statementTokens(statement);
  return eligible
    .map((candidate) => {
      let score = 0;
      for (const token of candidateTokens(candidate)) {
        if (target.has(token)) score += 1;
      }
      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map((entry) => entry.candidate);
}

/** Review-ready one-line description of a candidate (also used in prompts). */
export function describeCandidate(candidate: EligibleVote): string {
  const { vote, kind } = candidate;
  const ref = vote.dossier === null ? '—' : formatDossierRef(vote.legislature, vote.dossier.id);
  const dossierTitle = vote.dossier?.title ?? 'titre de dossier inconnu';
  return `${vote.id} | ${vote.date} | ${KIND_LABEL[kind]} | ${ref} — ${dossierTitle} | ${vote.title_fr}`;
}

export function buildLinkingPrompt(
  statement: Statement,
  candidates: readonly EligibleVote[],
): { system: string; user: string } {
  const system = [
    'Tu es un codeur documentaire pour un test électoral belge. Pour UN énoncé du test,',
    'tu examines des votes nominatifs de la Chambre présélectionnés mécaniquement et tu',
    'décides lesquels sont liés à l’énoncé, selon les critères publiés :',
    '- RETENIR uniquement un vote final en plénière sur un dossier portant directement',
    '  sur la mesure de l’énoncé, ou un vote d’amendement portant directement sur cette',
    '  mesure.',
    '- ÉCARTER tout vote dont le dossier ne porte que sur un sujet voisin, plus large,',
    '  ou une autre mesure du même thème. En cas de doute, écarter : la review humaine',
    '  ne peut pas récupérer un lien manquant, mais elle peut supprimer un lien faible.',
    '- Pour chaque vote RETENU, détermine `direction_dossier` : "soutient" si adopter',
    '  ce dossier va dans le sens de l’énoncé, "contredit" si l’adopter va contre',
    '  l’énoncé. Ne traduis JAMAIS le vote du groupe : la direction qualifie le DOSSIER,',
    '  pas le vote.',
    '- `motif` : une phrase, en français, justifiant la décision (retenu OU écarté).',
    '',
    'Réponds UNIQUEMENT avec un tableau JSON (aucun texte autour), UN objet par vote',
    'candidat — chaque candidat doit apparaître exactement une fois :',
    '[{"vote_id": "...", "retenu": true | false,',
    '  "direction_dossier": "soutient" | "contredit" | null, "motif": "..."}]',
    '`direction_dossier` est null si et seulement si `retenu` est false.',
    'N’invente jamais de vote_id absent de la liste fournie.',
  ].join('\n');

  const user = [
    'Énoncé :',
    `- ${statement.id} : ${statement.texte_fr}`,
    `  (mesure concrète : ${statement.note_concrete_fr})`,
    `  (NL : ${statement.texte_nl})`,
    '',
    'Votes candidats (id | date | type | dossier | intitulé du vote) :',
    ...candidates.map((candidate) => `- ${describeCandidate(candidate)}`),
    '',
    'Rappel : JSON uniquement, une décision explicite par candidat.',
  ].join('\n');

  return { system, user };
}

export interface LinkDecision {
  vote_id: string;
  retenu: boolean;
  direction_dossier: DossierDirection | null;
  motif: string;
}

/**
 * Parses one LLM answer strictly. Every submitted candidate must be decided
 * exactly once; a retained vote must carry a direction, a set-aside vote must
 * not; every decision must be justified.
 */
export function parseLinkingResponse(
  text: string,
  candidates: readonly EligibleVote[],
): LinkDecision[] {
  const known = new Set(candidates.map((c) => c.vote.id));
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
  const seen = new Set<string>();
  const decisions = parsed.map((item: unknown, index: number): LinkDecision => {
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
    const retenu = record['retenu'];
    if (typeof retenu !== 'boolean') {
      throw new Error(`LLM answer item ${index} (${voteId}) has a non-boolean 'retenu'.`);
    }
    const direction = record['direction_dossier'] ?? null;
    if (retenu) {
      if (direction !== 'soutient' && direction !== 'contredit') {
        throw new Error(
          `LLM answer item ${index} (${voteId}) is retained but carries no valid direction_dossier.`,
        );
      }
    } else if (direction !== null) {
      throw new Error(
        `LLM answer item ${index} (${voteId}) is set aside but carries a direction_dossier.`,
      );
    }
    const motif = record['motif'];
    if (typeof motif !== 'string' || motif.trim().length === 0) {
      throw new Error(`LLM answer item ${index} (${voteId}) has an empty motif.`);
    }
    return {
      vote_id: voteId,
      retenu,
      direction_dossier: retenu ? (direction as DossierDirection) : null,
      motif,
    };
  });
  const missing = candidates.filter((c) => !seen.has(c.vote.id));
  if (missing.length > 0) {
    throw new Error(
      `LLM answer is incomplete: missing decision(s) for ${missing.map((c) => c.vote.id).join(', ')}. ` +
        'Every submitted candidate must be decided explicitly.',
    );
  }
  return decisions;
}

export interface PreselectOptions {
  statement: Statement;
  /** Lexically prefiltered candidates (rankCandidatesLexically output). */
  candidates: readonly EligibleVote[];
  client: LLMClient;
  maxTokensPerAnswer?: number;
}

/** Runs the LLM decision for one statement's candidates. */
export async function preselectVotesForStatement(
  options: PreselectOptions,
): Promise<StatementPreselection> {
  const { statement, candidates, client, maxTokensPerAnswer = 4096 } = options;
  let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  if (candidates.length === 0) {
    return { retained: [], setAside: [], usage };
  }
  const prompt = buildLinkingPrompt(statement, candidates);
  const response = await client.complete({ ...prompt, maxTokens: maxTokensPerAnswer });
  usage = addUsage(usage, response.usage);
  const byId = new Map(candidates.map((c) => [c.vote.id, c]));
  const retained: RetainedLink[] = [];
  const setAside: SetAsideLink[] = [];
  for (const decision of parseLinkingResponse(response.text, candidates)) {
    const candidate = byId.get(decision.vote_id);
    if (candidate === undefined) {
      throw new Error('unreachable: parsed decision names a filtered-out candidate');
    }
    if (decision.retenu && decision.direction_dossier !== null) {
      retained.push({
        vote: candidate.vote,
        kind: candidate.kind,
        direction_dossier: decision.direction_dossier,
        justification: decision.motif,
      });
    } else {
      setAside.push({ vote: candidate.vote, kind: candidate.kind, motif: decision.motif });
    }
  }
  return { retained, setAside, usage };
}
