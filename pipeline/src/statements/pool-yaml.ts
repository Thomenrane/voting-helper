/**
 * YAML persistence of the candidate pool (#24).
 *
 * One file per harvest origin under data/statements/pool/
 * (`<party>.candidates.yaml`, `votes.candidates.yaml`). The files are the
 * working substrate of the HITL selection session: humans code positions
 * into the optional `positions` map, statements:select reads them back.
 * Parsing is strict — a hand-edited file that drifts from the schema fails
 * loudly, never silently drops a candidate.
 */
import { parse, stringify } from 'yaml';

import type { PositionValue } from '@voting-helper/data';

import { isCanonicalTheme } from './theme-coverage.ts';
import type { CandidateSource, CandidateStatement } from './candidate-pool.ts';

export function renderPoolYaml(
  candidates: readonly CandidateStatement[],
  header: string,
): string {
  const banner = header
    .split('\n')
    .map((line) => (line.length > 0 ? `# ${line}` : '#'))
    .join('\n');
  return `${banner}\n${stringify({ candidates })}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseSource(raw: unknown, where: string): CandidateSource {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${where} is not an object.`);
  }
  const source = raw as Record<string, unknown>;
  const kind = source['kind'];
  if (kind === 'programme') {
    for (const field of ['party_id', 'source_id', 'ref_snapshot', 'url_source'] as const) {
      if (typeof source[field] !== 'string' || source[field].trim().length === 0) {
        throw new Error(`${where} misses '${field}'.`);
      }
    }
    const page = source['page'];
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new Error(`${where} has an invalid page: ${String(page)}.`);
    }
    return {
      kind: 'programme',
      party_id: source['party_id'] as string,
      source_id: source['source_id'] as string,
      ref_snapshot: source['ref_snapshot'] as string,
      url_source: source['url_source'] as string,
      page,
    };
  }
  if (kind === 'vote') {
    for (const field of ['vote_id', 'dossier'] as const) {
      if (typeof source[field] !== 'string' || source[field].trim().length === 0) {
        throw new Error(`${where} misses '${field}'.`);
      }
    }
    if (typeof source['date'] !== 'string' || !ISO_DATE.test(source['date'])) {
      throw new Error(`${where} has an invalid date '${String(source['date'])}'.`);
    }
    return {
      kind: 'vote',
      vote_id: source['vote_id'] as string,
      dossier: source['dossier'] as string,
      date: source['date'],
    };
  }
  throw new Error(`${where} has an unknown source kind '${String(kind)}'.`);
}

function parsePositions(
  raw: unknown,
  where: string,
): Record<string, PositionValue> | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${where} has malformed positions (expected a party_id → value map).`);
  }
  const positions: Record<string, PositionValue> = {};
  for (const [partyId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < -2 || value > 2) {
      throw new Error(`${where} has an out-of-scale position for '${partyId}': ${String(value)}.`);
    }
    positions[partyId] = value as PositionValue;
  }
  return positions;
}

/** Parses one pool file back, validating every candidate. */
export function parsePoolYaml(text: string, file: string): CandidateStatement[] {
  const parsed: unknown = parse(text);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)['candidates'])
  ) {
    throw new Error(`'${file}' is not a valid pool file: missing 'candidates' array.`);
  }
  const records = (parsed as { candidates: unknown[] }).candidates;
  return records.map((record: unknown, index: number): CandidateStatement => {
    const where = `'${file}' candidate ${index}`;
    if (typeof record !== 'object' || record === null) {
      throw new Error(`${where} is not an object.`);
    }
    const r = record as Record<string, unknown>;
    for (const field of ['id', 'texte_fr', 'note_concrete_fr'] as const) {
      if (typeof r[field] !== 'string' || r[field].trim().length === 0) {
        throw new Error(`${where} misses '${field}'.`);
      }
    }
    const theme = r['theme'];
    if (typeof theme !== 'string' || !isCanonicalTheme(theme)) {
      throw new Error(`${where} has an unknown theme '${String(theme)}'.`);
    }
    const sources = r['sources'];
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error(`${where} has no sources — every candidate must stay traceable.`);
    }
    const candidate: CandidateStatement = {
      id: r['id'] as string,
      theme,
      texte_fr: r['texte_fr'] as string,
      note_concrete_fr: r['note_concrete_fr'] as string,
      sources: sources.map((source: unknown, sourceIndex: number) =>
        parseSource(source, `${where} source ${sourceIndex}`),
      ),
    };
    const positions = parsePositions(r['positions'], where);
    if (positions !== undefined) {
      candidate.positions = positions;
    }
    return candidate;
  });
}
