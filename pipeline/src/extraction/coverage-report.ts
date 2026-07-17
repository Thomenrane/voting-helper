/**
 * Coverage report of an exhaustive extraction sweep (#39) — the artefact that
 * makes « position non documentée » AUDITABLE instead of a silent act of
 * trust. Committed per party as <party>.coverage.md.
 *
 * It answers, for a reviewer, three questions in 30 seconds instead of
 * re-reading the programme:
 *  1. How many bounded chunks were examined (was the sweep really exhaustive)?
 *  2. For each statement, which chunks produced a candidate?
 *  3. For each « non documentée », does the deterministic lexical scan find
 *     the subject anywhere? If it does, the silence is FLAGGED — the reviewer
 *     must verify it (a possible false negative), never trust it blindly.
 *
 * Pure: it derives everything from the extraction result (chunks, candidates,
 * outcomes) and the keyless lexical scans. It renders — it does not decide:
 * merge/rejection/conflict decisions belong to position-extractor.
 */
import type { Statement } from '@voting-helper/data';

import type { StatementLexicalScan } from './lexical-scan.ts';
import type {
  ExaminedChunk,
  PositionCandidate,
  StatementOutcome,
} from './position-extractor.ts';

/** A chunk that produced a candidate for one statement. */
export interface CandidateChunk {
  source_id: string;
  first_page: number;
  last_page: number;
  /** The candidate's citation passed mechanical verification in this chunk. */
  verified: boolean;
}

/** A page where the statement's subject lexically co-occurs. */
export interface LexicalPageRef {
  source_id: string;
  page: number;
  /** Distinct keywords matched on the page — the strength of the signal. */
  term_count: number;
}

export interface StatementCoverage {
  statement_id: string;
  outcome_kind: StatementOutcome['kind'];
  candidate_chunks: CandidateChunk[];
  lexical_pages: LexicalPageRef[];
  /**
   * True when the statement is « non documentée » YET the lexical scan found
   * its subject somewhere — a silence a human MUST verify.
   */
  flagged: boolean;
}

export interface CoverageReport {
  party_id: string;
  chunks_examined: number;
  documents: { source_id: string; chunk_count: number }[];
  statements: StatementCoverage[];
  flagged_count: number;
}

export interface BuildCoverageInput {
  partyId: string;
  statements: readonly Statement[];
  outcomes: readonly StatementOutcome[];
  candidates: readonly PositionCandidate[];
  chunks: readonly ExaminedChunk[];
  lexicalScans: readonly StatementLexicalScan[];
}

function candidateChunksFor(
  statementId: string,
  candidates: readonly PositionCandidate[],
): CandidateChunk[] {
  const seen = new Map<string, CandidateChunk>();
  for (const candidate of candidates) {
    if (candidate.statement_id !== statementId) continue;
    const key = `${candidate.source_id}:${candidate.chunk_first_page}:${candidate.chunk_last_page}`;
    const verified = candidate.verdict.status === 'verified';
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, {
        source_id: candidate.source_id,
        first_page: candidate.chunk_first_page,
        last_page: candidate.chunk_last_page,
        verified,
      });
    } else if (verified) {
      existing.verified = true; // a verified candidate in the chunk dominates
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.source_id.localeCompare(b.source_id) || a.first_page - b.first_page,
  );
}

export function buildCoverageReport(input: BuildCoverageInput): CoverageReport {
  const { partyId, statements, outcomes, candidates, chunks, lexicalScans } = input;
  const outcomeById = new Map(outcomes.map((o) => [o.statement_id, o.kind]));
  const scanById = new Map(lexicalScans.map((s) => [s.statement_id, s]));

  const documentsMap = new Map<string, number>();
  for (const chunk of chunks) {
    documentsMap.set(chunk.source_id, (documentsMap.get(chunk.source_id) ?? 0) + 1);
  }
  const documents = [...documentsMap.entries()]
    .map(([source_id, chunk_count]) => ({ source_id, chunk_count }))
    .sort((a, b) => a.source_id.localeCompare(b.source_id));

  const statementCoverage = statements.map((statement): StatementCoverage => {
    const outcomeKind = outcomeById.get(statement.id) ?? 'no_position';
    const scan = scanById.get(statement.id);
    const lexical_pages: LexicalPageRef[] = (scan?.hits ?? []).map((hit) => ({
      source_id: hit.source_id,
      page: hit.page,
      term_count: hit.terms.length,
    }));
    return {
      statement_id: statement.id,
      outcome_kind: outcomeKind,
      candidate_chunks: candidateChunksFor(statement.id, candidates),
      lexical_pages,
      flagged: outcomeKind === 'no_position' && lexical_pages.length > 0,
    };
  });

  return {
    party_id: partyId,
    chunks_examined: chunks.length,
    documents,
    statements: statementCoverage,
    flagged_count: statementCoverage.filter((s) => s.flagged).length,
  };
}

/** Display cap on the per-statement lexical page list (exact count always shown). */
const LEXICAL_PAGES_CAP = 15;

const OUTCOME_LABEL: Record<StatementOutcome['kind'], string> = {
  position: 'position documentée (citation vérifiée)',
  rejected: 'citation rejetée (non retrouvée)',
  conflict: 'conflit inter-chunks (arbitrage humain)',
  no_position: 'non documentée',
};

function formatLexicalPages(pages: readonly LexicalPageRef[]): string {
  const shown = pages
    .slice(0, LEXICAL_PAGES_CAP)
    .map((p) => `${p.source_id} p.${p.page} (${p.term_count} mots-clés)`)
    .join(', ');
  if (pages.length > LEXICAL_PAGES_CAP) {
    return `${shown} … +${pages.length - LEXICAL_PAGES_CAP} autre(s)`;
  }
  return shown;
}

function formatCandidateChunks(chunks: readonly CandidateChunk[]): string {
  if (chunks.length === 0) return '—';
  return chunks
    .map((c) => `${c.source_id} p.${c.first_page}-${c.last_page}${c.verified ? ' ✅' : ' ❌'}`)
    .join(', ');
}

export interface CoverageMeta {
  partyName: string;
  model: string;
  /** DD/MM/YYYY display date. */
  runDate: string;
  statements: readonly Statement[];
}

export function renderCoverageReport(report: CoverageReport, meta: CoverageMeta): string {
  const byId = new Map(meta.statements.map((s) => [s.id, s]));
  const docLine = report.documents
    .map((d) => `${d.source_id} (${d.chunk_count} chunk(s))`)
    .join(', ');

  const flagged = report.statements.filter((s) => s.flagged);
  const flaggedSection =
    flagged.length === 0
      ? ['Aucun silence suspect : aucune « non documentée » n’a d’occurrence lexicale.']
      : [
          `**${flagged.length} silence(s) à vérifier** — « non documentée » avec occurrences`,
          'lexicales du sujet : le relecteur DOIT confirmer qu’aucune position n’a été manquée.',
          '',
          ...flagged.map((s) => {
            const texte = byId.get(s.statement_id)?.texte_fr ?? s.statement_id;
            return `- ⚠️ \`${s.statement_id}\` — ${texte}\n  Pages à occurrence : ${formatLexicalPages(s.lexical_pages)}`;
          }),
        ];

  const rows = report.statements.map((s) => {
    const texte = byId.get(s.statement_id)?.texte_fr ?? s.statement_id;
    const flag = s.flagged ? ' ⚠️' : '';
    return (
      `| \`${s.statement_id}\`${flag} | ${texte} | ${OUTCOME_LABEL[s.outcome_kind]} | ` +
      `${formatCandidateChunks(s.candidate_chunks)} | ${s.lexical_pages.length} |`
    );
  });

  return [
    `# Couverture de l’extraction — ${meta.partyName}`,
    '',
    `Run du ${meta.runDate} — modèle \`${meta.model}\`.`,
    '',
    'Balayage **exhaustif** : chaque chunk de la couche texte est examiné, avec une',
    'décision explicite par énoncé × chunk. Une « non documentée » n’est publiée que si',
    'AUCUN chunk n’a produit de position à citation mécaniquement vérifiée. Le scan lexical',
    'déterministe (sans clé) ne coupe rien — il ne fait que **signaler les silences douteux**.',
    '',
    '## Bilan',
    '',
    `- Chunks examinés : **${report.chunks_examined}** — ${docLine}`,
    `- Énoncés : **${report.statements.length}**`,
    `- Silences signalés (à vérifier) : **${report.flagged_count}**`,
    '',
    '## Silences à vérifier',
    '',
    ...flaggedSection,
    '',
    '## Détail par énoncé',
    '',
    '| Énoncé | Texte | Issue | Chunks-candidats (✅ vérifié / ❌ rejeté) | Pages lexicales |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '_Résidu irréductible publié : une position formulée sans aucun mot-clé attendu et',
    'non surfacée par le scan lexical peut échapper — voir',
    '`docs/methodologie/couverture-extraction.md`._',
  ].join('\n');
}
