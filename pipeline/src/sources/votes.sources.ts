/**
 * Registry of Chamber vote sources.
 *
 * Today's implementation ingests the CC0 Parquet files published by the
 * zijwerkenvooru project (referenced on data.gov.be, legislature 56). The
 * `ChamberVotesSource` contract is the seam for the future CRIV/FLWB scraper
 * (#2): a new source only has to declare its raw documents and its parsing —
 * snapshotting, manifests and the typed output format are shared.
 *
 * Provenance: `docs/research/votes-chambre.md` (branch research/votes-chambre).
 */
import type { SnapshotSource } from '../snapshot/manifest.ts';
import { readParquetRows } from '../votes/parquet.ts';
import {
  coerceRow,
  DOSSIERS_PARQUET_FIELDS,
  MEMBERS_PARQUET_FIELDS,
  transformVotes,
  VOTES_PARQUET_FIELDS,
  type DossiersParquetRow,
  type MembersParquetRow,
  type VotesParquetRow,
} from '../votes/votes.transform.ts';
import type { VotesDataset } from '../votes/votes.types.ts';

const NOTE = 'docs/research/votes-chambre.md (branch research/votes-chambre, 16/07/2026)';

/**
 * Contract for a source of Chamber plenary votes.
 *
 * Implementations: `ZIJWERKENVOORU_VOTES_SOURCE` (Parquet, active). The
 * CRIV/FLWB scraper planned by #2 will implement this same contract with
 * CRIV HTML pages + FLWB dossier fiches as `rawSources`.
 */
export interface ChamberVotesSource {
  readonly id: string;
  readonly legislature: string;
  /** Licence of the raw files (NOT of the Chamber's upstream data). */
  readonly licence: string;
  readonly provenance: string;
  /** Raw documents to snapshot verbatim before any parsing. */
  readonly rawSources: readonly SnapshotSource[];
  /**
   * Parses previously snapshotted raw bytes (keyed by source id) into the
   * typed internal dataset. Must throw an explicit error on structural
   * defects — never produce a silently truncated dataset. The result must
   * be deterministic for identical inputs (no embedded timestamps).
   */
  toDataset(rawBySourceId: ReadonlyMap<string, Uint8Array>): Promise<VotesDataset>;
}

const ZIJWERKENVOORU_BASE =
  'https://raw.githubusercontent.com/thepycoder/zijwerkenvooru/main/web/src/data';

export const VOTES_PARQUET_SOURCE_ID = 'zijwerkenvooru-votes-parquet';
export const MEMBERS_PARQUET_SOURCE_ID = 'zijwerkenvooru-members-parquet';
export const DOSSIERS_PARQUET_SOURCE_ID = 'zijwerkenvooru-dossiers-parquet';

function parquetSource(id: string, file: string, label: string): SnapshotSource {
  return {
    id,
    label,
    originUrl: `${ZIJWERKENVOORU_BASE}/${file}`,
    fetchUrl: `${ZIJWERKENVOORU_BASE}/${file}`,
    channel: 'live',
    mediaType: 'application/vnd.apache.parquet',
    provenance: `${NOTE} — § 4 zijwerkenvooru (CC0, data.gov.be/datasets/datafederaalparlement)`,
  };
}

function requireRaw(rawBySourceId: ReadonlyMap<string, Uint8Array>, sourceId: string): Uint8Array {
  const bytes = rawBySourceId.get(sourceId);
  if (bytes === undefined) {
    throw new Error(`Missing snapshotted raw bytes for source '${sourceId}'.`);
  }
  return bytes;
}

async function readRowsAs<T>(
  bytes: Uint8Array,
  fields: readonly (keyof T & string)[],
  file: string,
): Promise<T[]> {
  const rows = await readParquetRows(bytes);
  return rows.map((row, index) => coerceRow<T>(row, fields, file, index));
}

/** Active vote source: zijwerkenvooru CC0 Parquet files, legislature 56. */
export const ZIJWERKENVOORU_VOTES_SOURCE: ChamberVotesSource = {
  id: 'zijwerkenvooru-parquet',
  legislature: '56',
  licence: 'CC0 (files published by zijwerkenvooru; Chamber upstream licence to clarify — see note)',
  provenance: `${NOTE} — § 4`,
  rawSources: [
    parquetSource(
      VOTES_PARQUET_SOURCE_ID,
      'votes.parquet',
      'zijwerkenvooru — votes.parquet (votes nominatifs plénière, législature 56)',
    ),
    parquetSource(
      MEMBERS_PARQUET_SOURCE_ID,
      'members.parquet',
      'zijwerkenvooru — members.parquet (députés, groupe politique)',
    ),
    parquetSource(
      DOSSIERS_PARQUET_SOURCE_ID,
      'dossiers.parquet',
      'zijwerkenvooru — dossiers.parquet (dossiers législatifs votés)',
    ),
  ],
  async toDataset(rawBySourceId) {
    const [voteRows, memberRows, dossierRows] = await Promise.all([
      readRowsAs<VotesParquetRow>(
        requireRaw(rawBySourceId, VOTES_PARQUET_SOURCE_ID),
        VOTES_PARQUET_FIELDS,
        'votes.parquet',
      ),
      readRowsAs<MembersParquetRow>(
        requireRaw(rawBySourceId, MEMBERS_PARQUET_SOURCE_ID),
        MEMBERS_PARQUET_FIELDS,
        'members.parquet',
      ),
      readRowsAs<DossiersParquetRow>(
        requireRaw(rawBySourceId, DOSSIERS_PARQUET_SOURCE_ID),
        DOSSIERS_PARQUET_FIELDS,
        'dossiers.parquet',
      ),
    ]);
    const votes = transformVotes(voteRows, memberRows, dossierRows);
    return {
      source_id: this.id,
      legislature: this.legislature,
      vote_count: votes.length,
      votes,
    };
  },
};

/** Snapshot source describing the derived typed dataset produced by ingestion. */
export const DERIVED_VOTES_SOURCE: SnapshotSource = {
  id: 'votes-dataset-leg56',
  label: 'Typed plenary votes dataset (derived from the zijwerkenvooru Parquet snapshots)',
  originUrl: 'https://data.gov.be/fr/datasets/datafederaalparlement',
  fetchUrl: 'https://data.gov.be/fr/datasets/datafederaalparlement',
  channel: 'live',
  mediaType: 'application/json',
  provenance: `${NOTE} — § 4 (dérivé localement, voir entrées raw du même run)`,
};
