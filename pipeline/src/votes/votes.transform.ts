/**
 * Transforms raw zijwerkenvooru Parquet rows into the typed internal votes
 * format. Pure — no I/O, fully testable on fixture rows.
 *
 * Data-quality policy (measured on the real legislature-56 files):
 * - announced counts vs. listed names occasionally diverge → per-vote warning;
 * - deputy names are sometimes printed "Last First" → resolved by
 *   diacritic-insensitive sorted-token matching;
 * - a deputy absent from the members file keeps group=null + warning;
 * - structural defects (missing column, invalid date, duplicate vote id)
 *   are hard errors naming the offending row.
 */
import type { GroupVotePosition } from '@voting-helper/data';

import type { GroupTally, MemberBallot, PlenaryVote, VoteDossier } from './votes.types.ts';

/** Row of votes.parquet — every column is UTF8 in the source schema. */
export interface VotesParquetRow {
  vote_id: string;
  session_id: string;
  meeting_id: string;
  date: string;
  title_nl: string;
  title_fr: string;
  yes: string;
  no: string;
  abstain: string;
  members_yes: string;
  members_no: string;
  members_abstain: string;
  dossier_id: string;
  document_id: string;
  motion_id: string;
}

/** Row of members.parquet (columns relevant to vote ingestion). */
export interface MembersParquetRow {
  first_name: string;
  last_name: string;
  /** Parliamentary group, e.g. 'Ecolo-Groen', 'PVDA-PTB'. */
  fraction: string;
}

/** Row of dossiers.parquet (columns relevant to vote ingestion). */
export interface DossiersParquetRow {
  session_id: string;
  id: string;
  title: string;
  document_type: string;
  status: string;
}

/** A source Parquet row is structurally unusable. */
export class VoteRowError extends Error {
  constructor(file: string, rowIndex: number, detail: string) {
    super(`Invalid row ${rowIndex} in ${file}: ${detail}`);
    this.name = 'VoteRowError';
  }
}

/** Asserts that every required column of a row is a string, then types it. */
export function coerceRow<T>(
  row: Record<string, unknown>,
  requiredFields: readonly (keyof T & string)[],
  file: string,
  rowIndex: number,
): T {
  for (const field of requiredFields) {
    if (typeof row[field] !== 'string') {
      throw new VoteRowError(file, rowIndex, `column '${field}' is missing or not a string.`);
    }
  }
  return row as T;
}

export const VOTES_PARQUET_FIELDS = [
  'vote_id',
  'session_id',
  'meeting_id',
  'date',
  'title_nl',
  'title_fr',
  'yes',
  'no',
  'abstain',
  'members_yes',
  'members_no',
  'members_abstain',
  'dossier_id',
  'document_id',
  'motion_id',
] as const satisfies readonly (keyof VotesParquetRow)[];

export const MEMBERS_PARQUET_FIELDS = [
  'first_name',
  'last_name',
  'fraction',
] as const satisfies readonly (keyof MembersParquetRow)[];

export const DOSSIERS_PARQUET_FIELDS = [
  'session_id',
  'id',
  'title',
  'document_type',
  'status',
] as const satisfies readonly (keyof DossiersParquetRow)[];

/** Diacritic- and order-insensitive key for deputy-name matching. */
function nameTokenKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((token) => token !== '')
    .sort()
    .join('|');
}

interface MemberIndex {
  exact: Map<string, string>;
  byTokens: Map<string, string>;
}

function indexMembers(members: MembersParquetRow[]): MemberIndex {
  const exact = new Map<string, string>();
  const byTokens = new Map<string, string>();
  for (const member of members) {
    const fullName = `${member.first_name} ${member.last_name}`;
    exact.set(fullName, member.fraction);
    byTokens.set(nameTokenKey(fullName), member.fraction);
  }
  return { exact, byTokens };
}

function resolveGroup(name: string, index: MemberIndex): string | null {
  return index.exact.get(name) ?? index.byTokens.get(nameTokenKey(name)) ?? null;
}

/** Splits a ', '-separated deputy list; the source encodes "none" as ''. */
function splitMemberList(list: string): string[] {
  if (list === '') {
    return [];
  }
  return list.split(', ').filter((name) => name.trim() !== '');
}

function parseCount(value: string, field: string, voteRef: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new VoteRowError('votes.parquet', -1, `vote ${voteRef}: '${field}' is not a count: '${value}'.`);
  }
  return count;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildBallots(
  names: string[],
  position: GroupVotePosition,
  index: MemberIndex,
  warnings: string[],
): MemberBallot[] {
  return names.map((name) => {
    const group = resolveGroup(name, index);
    if (group === null) {
      warnings.push(`deputy '${name}' (${position}) not found in the members file — group unresolved`);
    }
    return { name, group, position };
  });
}

function tallyGroups(ballots: MemberBallot[]): GroupTally[] {
  const tallies = new Map<string, GroupTally>();
  for (const ballot of ballots) {
    if (ballot.group === null) {
      continue;
    }
    const tally = tallies.get(ballot.group) ?? {
      group: ballot.group,
      oui: 0,
      non: 0,
      abstention: 0,
    };
    tally[ballot.position] += 1;
    tallies.set(ballot.group, tally);
  }
  return [...tallies.values()].sort((a, b) => a.group.localeCompare(b.group));
}

/**
 * Transforms raw Parquet rows into typed plenary votes, sorted by date then
 * meeting then vote number. Throws VoteRowError on structural defects.
 */
export function transformVotes(
  voteRows: VotesParquetRow[],
  memberRows: MembersParquetRow[],
  dossierRows: DossiersParquetRow[],
): PlenaryVote[] {
  const memberIndex = indexMembers(memberRows);
  const dossiersById = new Map(
    dossierRows.map((dossier) => [`${dossier.session_id}/${dossier.id}`, dossier]),
  );

  const seenIds = new Set<string>();
  const votes = voteRows.map((row, rowIndex) => {
    const id = `${row.session_id}-m${row.meeting_id}-v${row.vote_id}`;
    if (seenIds.has(id)) {
      throw new VoteRowError('votes.parquet', rowIndex, `duplicate vote id '${id}'.`);
    }
    seenIds.add(id);
    if (!ISO_DATE.test(row.date)) {
      throw new VoteRowError('votes.parquet', rowIndex, `vote ${id}: invalid date '${row.date}'.`);
    }

    const counts = {
      oui: parseCount(row.yes, 'yes', id),
      non: parseCount(row.no, 'no', id),
      abstention: parseCount(row.abstain, 'abstain', id),
    };

    const warnings: string[] = [];
    const ballots = [
      ...buildBallots(splitMemberList(row.members_yes), 'oui', memberIndex, warnings),
      ...buildBallots(splitMemberList(row.members_no), 'non', memberIndex, warnings),
      ...buildBallots(splitMemberList(row.members_abstain), 'abstention', memberIndex, warnings),
    ];

    for (const [position, announced, listed] of [
      ['oui', counts.oui, splitMemberList(row.members_yes).length],
      ['non', counts.non, splitMemberList(row.members_no).length],
      ['abstention', counts.abstention, splitMemberList(row.members_abstain).length],
    ] as const) {
      if (announced !== listed) {
        warnings.push(`announced ${announced} '${position}' ballots but ${listed} deputies listed`);
      }
    }

    const dossierRow =
      row.dossier_id === '' ? undefined : dossiersById.get(`${row.session_id}/${row.dossier_id}`);
    const dossier: VoteDossier | null =
      row.dossier_id === ''
        ? null
        : {
            id: row.dossier_id,
            title: dossierRow?.title ?? null,
            document_type: dossierRow?.document_type ?? null,
            status: dossierRow?.status ?? null,
          };
    if (row.dossier_id !== '' && dossierRow === undefined) {
      warnings.push(`dossier '${row.dossier_id}' not found in the dossiers file`);
    }

    return {
      id,
      legislature: row.session_id,
      meeting_id: row.meeting_id,
      vote_number: row.vote_id,
      date: row.date,
      title_fr: row.title_fr,
      title_nl: row.title_nl,
      dossier,
      document_id: row.document_id === '' ? null : row.document_id,
      motion_id: row.motion_id === '' ? null : row.motion_id,
      counts,
      ballots,
      groups: tallyGroups(ballots),
      warnings,
    } satisfies PlenaryVote;
  });

  return votes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.meeting_id) - Number(b.meeting_id) ||
      Number(a.vote_number) - Number(b.vote_number),
  );
}
