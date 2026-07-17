/**
 * Single visibility rule for party position records: only records with
 * statut 'valide' are visible anywhere (engine, audit, balance stats), and
 * two valid records for one party × statement are refused — inconsistent
 * data must never be silently collapsed or averaged. One implementation,
 * consumed by scoring.ts, results-presentation.ts and balance.ts, so the
 * rule is a guarantee rather than a convention.
 */
import type { PartyPosition } from '@voting-helper/data';

/**
 * The party's validated records keyed by statement id, in input order.
 * Throws on a duplicate valid party × statement record.
 */
export function validRecordsByStatement(
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
