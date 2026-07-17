/**
 * Balance statistics (#26, decision #7) — the numbers behind the /equilibre
 * page, computed at build time from the SAME dataset the test scores against.
 * Nothing here is hand-entered: every figure is derived from the positions.
 *
 * Same visibility rule as the engine (scoring.ts): only records with statut
 * 'valide' count, and two valid records for one party × statement are refused
 * — never silently collapsed.
 */
import type { Party, PartyPosition, Statement } from '@voting-helper/data';

/** Coverage figures for one party, against the full statement set. */
export interface PartyBalance {
  partyId: string;
  /** Statements with a documented (validated) programme position. */
  documentedProgramme: number;
  /** Statements with at least one linked vote. */
  statementsWithVotes: number;
  /** Total linked votes across all validated records. */
  linkedVotes: number;
  /** Denominator for both coverages — the full statement set. */
  totalStatements: number;
}

/** Distribution of the documented programme positions on one statement. */
export interface StatementBalance {
  statementId: string;
  /** Validated programme positions ≥ +1. */
  pour: number;
  /** Validated programme positions = 0. */
  neutre: number;
  /** Validated programme positions ≤ −1. */
  contre: number;
  /** Parties without a validated programme position on this statement. */
  nonDocumente: number;
  /** Denominator — the full party set. */
  totalParties: number;
}

/** Validated records of one party, keyed by statement — duplicates refused. */
function validRecordsByStatement(
  partyId: string,
  positions: readonly PartyPosition[],
): Map<string, PartyPosition> {
  const byStatement = new Map<string, PartyPosition>();
  for (const record of positions) {
    if (record.party_id !== partyId || record.statut !== 'valide') continue;
    if (byStatement.has(record.statement_id)) {
      throw new Error(
        `Duplicate valid position for party "${partyId}" and statement "${record.statement_id}" — inconsistent dataset refused.`,
      );
    }
    byStatement.set(record.statement_id, record);
  }
  return byStatement;
}

/**
 * Per-party coverage, in party input order. Only records pointing at a known
 * statement count — a record for a removed statement must not inflate
 * coverage figures.
 */
export function partyBalances(
  parties: readonly Party[],
  statements: readonly Statement[],
  positions: readonly PartyPosition[],
): PartyBalance[] {
  const statementIds = new Set(statements.map((s) => s.id));
  return parties.map((party) => {
    let documentedProgramme = 0;
    let statementsWithVotes = 0;
    let linkedVotes = 0;
    for (const record of validRecordsByStatement(party.id, positions).values()) {
      if (!statementIds.has(record.statement_id)) continue;
      if (record.position !== undefined) documentedProgramme += 1;
      if (record.votes_lies.length > 0) statementsWithVotes += 1;
      linkedVotes += record.votes_lies.length;
    }
    return {
      partyId: party.id,
      documentedProgramme,
      statementsWithVotes,
      linkedVotes,
      totalStatements: statements.length,
    };
  });
}

/**
 * Per-statement distribution of documented programme positions, in statement
 * input order. A discriminating statement shows parties on both sides; a
 * statement everyone agrees with teaches the user nothing.
 */
export function statementBalances(
  parties: readonly Party[],
  statements: readonly Statement[],
  positions: readonly PartyPosition[],
): StatementBalance[] {
  const recordsByParty = new Map(
    parties.map((party) => [party.id, validRecordsByStatement(party.id, positions)]),
  );
  return statements.map((statement) => {
    let pour = 0;
    let neutre = 0;
    let contre = 0;
    for (const records of recordsByParty.values()) {
      const record = records.get(statement.id);
      if (record?.position === undefined) continue;
      if (record.position >= 1) pour += 1;
      else if (record.position <= -1) contre += 1;
      else neutre += 1;
    }
    return {
      statementId: statement.id,
      pour,
      neutre,
      contre,
      nonDocumente: parties.length - pour - neutre - contre,
      totalParties: parties.length,
    };
  });
}
