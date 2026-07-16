/**
 * Results presentation — pure helpers for the results screen (ticket #19).
 *
 * This module is the seam between the scoring engine's output and the slope
 * chart / audit drill-down: it ranks the two columns, pairs the slope line
 * endpoints, groups the audit by theme and formats display values. It never
 * computes a score — `scoreParties` (scoring.ts) is the sole scoring surface,
 * and every flag rendered here (écart marquant, contradictions) comes from
 * its output. No DOM, no I/O.
 */
import type { Citation, LinkedVote, PartyPosition, PositionValue, Statement } from '@voting-helper/data';
import type { PartyScore } from '../scoring/scoring.ts';

/** The two ranked columns of the slope chart. Never fused. */
export type Dimension = 'promesses' | 'actes';

/** One row of a slope chart column. */
export interface RankedParty {
  partyId: string;
  /** 1-based position in this dimension's column. */
  rank: number;
  /** The dimension's 0–100 score, or null (« n.d. »). */
  score: number | null;
  /** Statements included in this dimension's mean — always displayed. */
  denominator: number;
}

/**
 * Descending score comparison where null ranks below a real 0:
 * « n.d. » means "nothing to score", which is worse than zero alignment.
 */
function compareScoreDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/**
 * Rank all parties on one dimension. Ties are broken on the other dimension,
 * then by party input order (Array.prototype.sort is stable).
 */
export function rankByDimension(
  scores: readonly PartyScore[],
  dimension: Dimension,
): RankedParty[] {
  const other: Dimension = dimension === 'promesses' ? 'actes' : 'promesses';
  return [...scores]
    .sort(
      (a, b) =>
        compareScoreDesc(a[dimension].score, b[dimension].score) ||
        compareScoreDesc(a[other].score, b[other].score),
    )
    .map((s, index) => ({
      partyId: s.partyId,
      rank: index + 1,
      score: s[dimension].score,
      denominator: s[dimension].denominator,
    }));
}

/** One slope line: a party's row in each column, in promesses-column order. */
export interface SlopeLine {
  partyId: string;
  /** 0-based row index in the promesses column. */
  fromIndex: number;
  /** 0-based row index in the actes column. */
  toIndex: number;
  /** Engine flag (|écart| ≥ 15) — the line is drawn accented. */
  marquant: boolean;
}

/** Pair each party's promesses row with its actes row. */
export function slopeLines(scores: readonly PartyScore[]): SlopeLine[] {
  const actesIndexById = new Map(
    rankByDimension(scores, 'actes').map((r, index) => [r.partyId, index]),
  );
  const marquantById = new Map(scores.map((s) => [s.partyId, s.ecartMarquant]));
  return rankByDimension(scores, 'promesses').map((r, fromIndex) => {
    const toIndex = actesIndexById.get(r.partyId);
    if (toIndex === undefined) {
      // Impossible: both rankings are permutations of the same score set.
      throw new Error(`Party "${r.partyId}" missing from the actes ranking.`);
    }
    return {
      partyId: r.partyId,
      fromIndex,
      toIndex,
      marquant: marquantById.get(r.partyId) ?? false,
    };
  });
}

/** Display a 0–100 score, or the locale's « n.d. » label for null. */
export function formatScore(score: number | null, notAvailable: string): string {
  return score === null ? notAvailable : String(score);
}

/** Display an écart with its sign (+23, -8, 0). */
export function formatEcart(ecart: number): string {
  return ecart > 0 ? `+${ecart}` : String(ecart);
}

/** ISO date (YYYY-MM-DD) → DD/MM/YYYY; anything else passes through. */
export function formatDateBE(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** One statement of the audit drill-down for one party. */
export interface AuditStatement {
  statement: Statement;
  /** null → « position non documentée » (excluded from promesses). */
  programme: { position: PositionValue; citation: Citation } | null;
  /** Empty → no linked vote (excluded from actes). */
  votes: readonly LinkedVote[];
  /** « Promesse vs vote » flag, from the engine's contradiction ids. */
  isContradiction: boolean;
}

/** One theme group of the audit drill-down, statements in input order. */
export interface AuditTheme {
  theme: string;
  statements: AuditStatement[];
}

/**
 * Build the party → theme → statement → evidence drill-down. Only validated
 * records are shown — same visibility rule as the engine. A statement with
 * no (validated) record is still listed: silence is information.
 */
export function buildPartyAudit(
  partyId: string,
  statements: readonly Statement[],
  positions: readonly PartyPosition[],
  contradictionIds: readonly string[],
): AuditTheme[] {
  const contradictions = new Set(contradictionIds);
  const recordByStatement = new Map<string, PartyPosition>();
  for (const record of positions) {
    if (record.party_id === partyId && record.statut === 'valide') {
      recordByStatement.set(record.statement_id, record);
    }
  }

  const themes: AuditTheme[] = [];
  const themeByName = new Map<string, AuditTheme>();
  for (const statement of statements) {
    let theme = themeByName.get(statement.theme);
    if (theme === undefined) {
      theme = { theme: statement.theme, statements: [] };
      themeByName.set(statement.theme, theme);
      themes.push(theme);
    }
    const record = recordByStatement.get(statement.id);
    theme.statements.push({
      statement,
      programme:
        record !== undefined && record.position !== undefined
          ? { position: record.position, citation: record.citation }
          : null,
      votes: record?.votes_lies ?? [],
      isContradiction: contradictions.has(statement.id),
    });
  }
  return themes;
}
