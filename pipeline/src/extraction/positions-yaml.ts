/**
 * YAML output of the extraction run, conforming to the shared PartyPosition
 * schema (@voting-helper/data). Statuses (#22):
 * - 'en_attente' — verified proposal (or explicit 'no documented position');
 *   human PR review is the only path to 'valide'.
 * - 'rejete' — the citation failed mechanical verification; kept in the file
 *   so the rejection is explicit and reviewable, never published (scoring
 *   only reads 'valide').
 * - conflicts (verified citations disagreeing) produce NO record: they are
 *   listed in the review summary for human arbitration.
 */
import { parse, stringify } from 'yaml';

import type { PartyPosition, PositionValue } from '@voting-helper/data';

import type { StatementOutcome } from './position-extractor.ts';

export function toPartyPositions(
  partyId: string,
  outcomes: readonly StatementOutcome[],
  revisionDate: string,
): PartyPosition[] {
  const positions: PartyPosition[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'position') {
      positions.push({
        party_id: partyId,
        statement_id: outcome.statement_id,
        position: outcome.position,
        citation: {
          texte: outcome.citation.citation_texte,
          url_source: outcome.citation.url_source,
          ref_snapshot: outcome.citation.raw_snapshot_id,
          page: outcome.citation.citation_page,
        },
        votes_lies: [],
        statut: 'en_attente',
        derniere_revision: revisionDate,
      });
    } else if (outcome.kind === 'rejected') {
      const first = outcome.candidates[0];
      if (first === undefined) {
        throw new Error(`Rejected outcome for '${outcome.statement_id}' has no candidate.`);
      }
      positions.push({
        party_id: partyId,
        statement_id: outcome.statement_id,
        position: first.position,
        citation: {
          texte: first.citation_texte,
          url_source: first.url_source,
          ref_snapshot: first.raw_snapshot_id,
          page: first.citation_page,
        },
        votes_lies: [],
        statut: 'rejete',
        derniere_revision: revisionDate,
      });
    } else if (outcome.kind === 'no_position') {
      positions.push({
        party_id: partyId,
        statement_id: outcome.statement_id,
        votes_lies: [],
        statut: 'en_attente',
        derniere_revision: revisionDate,
      });
    }
    // 'conflict': intentionally no record — review summary carries it.
  }
  return positions;
}

export function renderPositionsYaml(positions: readonly PartyPosition[], header: string): string {
  const banner = header
    .split('\n')
    .map((line) => (line.length > 0 ? `# ${line}` : '#'))
    .join('\n');
  return `${banner}\n${stringify({ positions })}`;
}

const VALID_STATUTS = new Set(['valide', 'en_attente', 'rejete']);

/** Parses a positions YAML file back, validating it against the shared schema. */
export function parsePositionsYaml(text: string, file: string): PartyPosition[] {
  const parsed: unknown = parse(text);
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>)['positions'])) {
    throw new Error(`'${file}' is not a valid positions file: missing 'positions' array.`);
  }
  const records = (parsed as { positions: unknown[] }).positions;
  records.forEach((record: unknown, index: number) => {
    if (typeof record !== 'object' || record === null) {
      throw new Error(`'${file}' position ${index} is not an object.`);
    }
    const r = record as Record<string, unknown>;
    if (typeof r['party_id'] !== 'string' || typeof r['statement_id'] !== 'string') {
      throw new Error(`'${file}' position ${index} misses party_id/statement_id.`);
    }
    if (typeof r['statut'] !== 'string' || !VALID_STATUTS.has(r['statut'])) {
      throw new Error(`'${file}' position ${index} has invalid statut '${String(r['statut'])}'.`);
    }
    if (typeof r['derniere_revision'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r['derniere_revision'])) {
      throw new Error(`'${file}' position ${index} has invalid derniere_revision.`);
    }
    if (!Array.isArray(r['votes_lies'])) {
      throw new Error(`'${file}' position ${index} misses votes_lies.`);
    }
    const hasPosition = r['position'] !== undefined && r['position'] !== null;
    const hasCitation = r['citation'] !== undefined && r['citation'] !== null;
    if (hasPosition !== hasCitation) {
      throw new Error(
        `'${file}' position ${index}: 'position' and 'citation' are jointly optional — one is missing.`,
      );
    }
    if (hasPosition) {
      const position = r['position'];
      if (typeof position !== 'number' || !Number.isInteger(position) || position < -2 || position > 2) {
        throw new Error(`'${file}' position ${index} has out-of-scale position ${String(position)}.`);
      }
      const citation = r['citation'] as Record<string, unknown>;
      if (
        typeof citation['texte'] !== 'string' ||
        citation['texte'].trim().length === 0 ||
        typeof citation['url_source'] !== 'string' ||
        typeof citation['ref_snapshot'] !== 'string' ||
        typeof citation['page'] !== 'number'
      ) {
        throw new Error(`'${file}' position ${index} has a malformed citation.`);
      }
      void (position as PositionValue);
    }
  });
  return records as PartyPosition[];
}
