/**
 * Ranking and coverage report of the candidate pool (#24).
 *
 * Pure module behind `npm run statements:select`: ranks candidates by
 * discriminance (computed live from their coded positions — never stored
 * scores, mirror of §L rule 2), assesses theme coverage of the pool, and
 * renders the markdown report the human selection session works from.
 *
 * The ranking is decision SUPPORT, not a decision: the 35 statements are
 * chosen and rewritten by a human following the published guide
 * (docs/methodologie/guide-redaction-enonces.md).
 */
import type { CandidateStatement } from './candidate-pool.ts';
import { computeDiscriminance, type DiscriminanceResult } from './discriminance.ts';
import {
  assessThemeCoverage,
  SELECTION_TARGET,
  SELECTION_TOTAL,
  type ThemeCoverage,
} from './theme-coverage.ts';

export interface RankedCandidate {
  candidate: CandidateStatement;
  discriminance: DiscriminanceResult;
}

/**
 * Ranks candidates for human review: coded candidates first, by score
 * descending (ties: more coded positions first, then id — deterministic),
 * uncoded candidates last by id. A duplicate candidate id across pool files
 * is a hard error.
 */
export function rankCandidates(candidates: readonly CandidateStatement[]): RankedCandidate[] {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      throw new Error(`Duplicate candidate id '${candidate.id}' across pool files.`);
    }
    seen.add(candidate.id);
  }
  return candidates
    .map((candidate) => ({
      candidate,
      discriminance: computeDiscriminance(Object.values(candidate.positions ?? {})),
    }))
    .sort((a, b) => {
      const scoreA = a.discriminance.score;
      const scoreB = b.discriminance.score;
      if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      if ((scoreA === null) !== (scoreB === null)) {
        return scoreA === null ? 1 : -1;
      }
      if (a.discriminance.coded !== b.discriminance.coded) {
        return b.discriminance.coded - a.discriminance.coded;
      }
      return a.candidate.id.localeCompare(b.candidate.id);
    });
}

/**
 * Pool-level coverage: does each theme offer at least the minimum number of
 * selectable candidates? Overflow is meaningless for a pool (bigger is
 * better), hence the unbounded max.
 */
export function assessPoolCoverage(candidates: readonly CandidateStatement[]): ThemeCoverage[] {
  return assessThemeCoverage(
    candidates.map((candidate) => candidate.theme),
    { min: SELECTION_TARGET.min, max: Number.POSITIVE_INFINITY },
  );
}

function formatScore(discriminance: DiscriminanceResult): string {
  return discriminance.score === null
    ? 'non codé'
    : `${discriminance.score.toFixed(3)} (${discriminance.coded} positions)`;
}

function describeOrigin(candidate: CandidateStatement): string {
  return candidate.sources
    .map((source) =>
      source.kind === 'programme'
        ? `${source.party_id} p.${source.page}`
        : `${source.dossier} (${source.vote_id})`,
    )
    .join(' ; ');
}

export interface SelectionReportOptions {
  /** DD/MM/YYYY run date. */
  runDate: string;
  /** Repo-relative pool files the report was computed from. */
  poolFiles: readonly string[];
  ranked: readonly RankedCandidate[];
  coverage: readonly ThemeCoverage[];
}

/** Renders the markdown report of one statements:select run. */
export function renderSelectionReport(options: SelectionReportOptions): string {
  const { runDate, poolFiles, ranked, coverage } = options;
  const coded = ranked.filter((entry) => entry.discriminance.score !== null);
  const gaps = coverage.filter((entry) => entry.status === 'gap');
  const lines: string[] = [
    `# Sélection des énoncés — rapport du ${runDate}`,
    '',
    `Pool : ${ranked.length} candidat(s) (${coded.length} codé(s) en positions) — ` +
      `fichiers : ${poolFiles.join(', ')}.`,
    '',
    `Objectif de sélection : ${SELECTION_TOTAL} énoncés, ${SELECTION_TARGET.min}-` +
      `${SELECTION_TARGET.max} par thème. Ce rapport CLASSE, il ne SÉLECTIONNE pas : ` +
      'la sélection et la réécriture sont humaines ' +
      '(docs/methodologie/guide-redaction-enonces.md).',
    '',
    '## Couverture thématique du pool',
    '',
    '| Thème | Candidats | Statut |',
    '|---|---|---|',
    ...coverage.map(
      (entry) =>
        `| ${entry.theme.label_fr} (\`${entry.theme.id}\`) | ${entry.count} | ` +
        `${entry.status === 'gap' ? `TROU — moins de ${SELECTION_TARGET.min} candidats` : 'ok'} |`,
    ),
    '',
  ];
  if (gaps.length > 0) {
    lines.push(
      `**${gaps.length} thème(s) en trou de couverture** : ` +
        `${gaps.map((entry) => entry.theme.id).join(', ')} — relancer statements:pool ` +
        'sur des sources couvrant ces thèmes avant la session de sélection.',
      '',
    );
  }
  lines.push(
    '## Classement par discriminance',
    '',
    'Score : écart absolu moyen entre deux partis codés, normalisé (0 = consensus, ' +
      '1 = partis répartis au maximum). Les candidats non codés sont en fin de ' +
      'classement — coder leurs positions avant de les juger.',
    '',
    '| # | Id | Thème | Discriminance | Énoncé candidat | Origine |',
    '|---|---|---|---|---|---|',
    ...ranked.map(
      (entry, index) =>
        `| ${index + 1} | ${entry.candidate.id} | ${entry.candidate.theme} | ` +
        `${formatScore(entry.discriminance)} | ${entry.candidate.texte_fr} | ` +
        `${describeOrigin(entry.candidate)} |`,
    ),
  );
  return lines.join('\n');
}
