/**
 * Snapshot manifest — pure logic, no I/O.
 *
 * Decisions of ticket #21 (storage split validated in the ticket):
 * - Manifests (metadata + SHA-256 fingerprints) are committed to git.
 * - Snapshot binaries (PDF, Parquet, HTML, derived JSON) live in the
 *   gitignored `data/snapshots/` directory; the committed fingerprint
 *   guarantees their integrity until durable object storage exists.
 * - Snapshots are IMMUTABLE: re-running a snapshot command never replaces
 *   an existing version, it appends a new dated one.
 */

/**
 * How the bytes were obtained.
 * - `live`: fetched from the origin URL;
 * - `wayback`: origin URL dead or anti-bot, fetched from the Wayback Machine;
 * - `manual`: provided by a human through the admission re-entry path (#42),
 *   carrying an `attestation` (who/when/source) recorded in the manifest.
 */
export type SnapshotChannel = 'live' | 'wayback' | 'manual';

/**
 * Human attestation of a manually-sourced document (#42 re-entry path). When a
 * source is UNCERTAIN/FAIL at the admission gate, a human finds and uploads the
 * correct document; this records who vouched for it, when, and from where — so
 * the manifest stays the single source of truth and the attestation can be
 * published alongside the verification status.
 */
export interface SourceAttestation {
  /** Who provided/verified the document (human name or handle). */
  by: string;
  /** ISO 8601 UTC datetime of the attestation. */
  at: string;
  /** Source URL or a description of where the document came from. */
  source: string;
  /** Optional free-text note (why this document, what was checked). */
  note?: string;
}

/**
 * Human ratification of a specific admission CRITERION (#50). Distinct from
 * `SourceAttestation` (which vouches for a manually-sourced document): here the
 * document is already the correct, already-snapshotted one, and a human ratifies
 * a criterion the gate cannot auto-confirm (e.g. `auto-id-level`, when the June
 * 9 2024 ballot shared its date across the federal/regional/European levels).
 *
 * A criterion attestation is bound to the raw snapshot's SHA-256 at ratification
 * time: it is honoured ONLY while the pinned snapshot still bears that
 * fingerprint. Replacing the document (a new snapshot) leaves the old
 * attestation behind, the criterion reverts to UNCERTAIN — one cannot attest
 * document A and then substitute B while keeping the PASS.
 */
export interface CriterionAttestation {
  /**
   * Verdict `check` values ratified by this attestation (e.g. `auto-id-level`,
   * `auto-id-year`). Only checks that can be UNCERTAIN are ratifiable.
   */
  criteria: string[];
  /** Who ratified the criterion (human name or handle). */
  by: string;
  /** ISO 8601 UTC datetime of the ratification. */
  at: string;
  /** Free-text justification (why the criterion is genuinely satisfied). */
  note: string;
  /**
   * SHA-256 (hex) of the raw snapshot at ratification time. The attestation is
   * ignored — the criterion reverts to UNCERTAIN — as soon as the pinned
   * snapshot's fingerprint diverges from this value.
   */
  snapshot_sha256: string;
}

/** `raw` = bytes as fetched from the source; `derived` = produced by the pipeline. */
export type SnapshotKind = 'raw' | 'derived';

export type SnapshotMediaType =
  | 'application/pdf'
  | 'text/html'
  | 'application/vnd.apache.parquet'
  | 'application/json';

/** A document to snapshot, as declared in a source registry. */
export interface SnapshotSource {
  /** Stable identifier, e.g. 'ps-programme-2024'. Never renamed. */
  id: string;
  /** Human-readable label, e.g. 'PS — Programme 2024 (PDF complet)'. */
  label: string;
  /** Canonical URL of the original document (provenance, may be dead). */
  originUrl: string;
  /** URL actually fetched (Wayback Machine for dead/anti-bot origins). */
  fetchUrl: string;
  channel: SnapshotChannel;
  /** Drives the snapshot file extension. */
  mediaType: SnapshotMediaType;
  /** Pointer into the research note documenting this source. */
  provenance: string;
}

/** One dated, immutable snapshot of one source. */
export interface SnapshotEntry {
  /** `<source_id>@<compact UTC timestamp>` — unique per manifest. */
  snapshot_id: string;
  source_id: string;
  label: string;
  kind: SnapshotKind;
  origin_url: string;
  fetch_url: string;
  channel: SnapshotChannel;
  media_type: SnapshotMediaType;
  /** ISO 8601 UTC datetime at which the bytes were retrieved. */
  retrieved_at: string;
  /** SHA-256 of the snapshot bytes, hex-encoded. Committed integrity proof. */
  sha256: string;
  bytes: number;
  /** Snapshot file path relative to the repo root (gitignored binary). */
  file: string;
  /**
   * Set when the fetched content is byte-identical to a previous snapshot
   * of the same source: `file` then points at that snapshot's file instead
   * of duplicating the bytes on disk.
   */
  content_unchanged_from?: string;
  /**
   * Data-quality counters for derived snapshots (warnings, unresolved or
   * ambiguous deputies, …). Committed so a quality regression between two
   * ingestion runs is visible in git review.
   */
  quality?: Record<string, number>;
  /**
   * Human attestation, present only for `channel: 'manual'` snapshots provided
   * through the admission re-entry path (#42). Recorded and published.
   */
  attestation?: SourceAttestation;
  /**
   * Human criterion ratifications (#50), bound to this snapshot's fingerprint.
   * Attached in place by `admit:attest` to the currently-pinned raw snapshot;
   * consumed by the admission verdict to lift a genuinely-satisfied UNCERTAIN
   * criterion to PASS. Never present on a snapshot that has been superseded.
   */
  criteria_attestations?: CriterionAttestation[];
  provenance: string;
}

export interface SnapshotManifest {
  description: string;
  /** Research note documenting every source in this manifest. */
  research_note: string;
  /** Append-only list, oldest first. */
  snapshots: SnapshotEntry[];
}

/** A snapshot id was appended twice — immutability violation. */
export class DuplicateSnapshotError extends Error {
  constructor(snapshotId: string) {
    super(
      `A snapshot with id '${snapshotId}' is already recorded: this source was already ` +
        `snapshotted at this exact timestamp. Snapshots are immutable and never replaced — ` +
        `re-run later to date a new version.`,
    );
    this.name = 'DuplicateSnapshotError';
  }
}

/** Bytes on disk no longer match the fingerprint committed in the manifest. */
export class SnapshotCorruptionError extends Error {
  constructor(entry: SnapshotEntry, actualSha256: string) {
    super(
      `Snapshot '${entry.snapshot_id}' (source '${entry.source_id}', file '${entry.file}') is corrupted: ` +
        `manifest fingerprint sha256=${entry.sha256}, actual sha256=${actualSha256}.`,
    );
    this.name = 'SnapshotCorruptionError';
  }
}

const MEDIA_TYPE_EXTENSION: Record<SnapshotMediaType, string> = {
  'application/pdf': 'pdf',
  'text/html': 'html',
  'application/vnd.apache.parquet': 'parquet',
  'application/json': 'json',
};

export function emptyManifest(description: string, researchNote: string): SnapshotManifest {
  return { description, research_note: researchNote, snapshots: [] };
}

/**
 * `2026-07-16T13:07:42.123Z` → `20260716T130742123Z` (filename-safe,
 * sortable). Millisecond precision keeps two runs within the same second
 * from colliding on the snapshot id.
 */
export function compactTimestamp(retrievedAt: string): string {
  const parsed = new Date(retrievedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid snapshot timestamp: '${retrievedAt}'.`);
  }
  return parsed.toISOString().replace(/[-:.]/g, '');
}

/** Source ids end up in committed file paths — keep them strictly path-safe. */
const SAFE_SOURCE_ID = /^[a-z0-9-]+$/;

export interface BuildSnapshotEntryOptions {
  source: SnapshotSource;
  kind: SnapshotKind;
  /** ISO 8601 UTC datetime of retrieval. */
  retrievedAt: string;
  sha256: string;
  bytes: number;
  /** Snapshot directory relative to the repo root, e.g. 'data/snapshots/programmes'. */
  snapshotsDir: string;
  /** Optional data-quality counters (derived snapshots). */
  quality?: Record<string, number>;
  /** Optional human attestation (manual re-entry path, #42). */
  attestation?: SourceAttestation;
}

/** Builds a dated snapshot entry. Pure — file layout is derived, never probed. */
export function buildSnapshotEntry(options: BuildSnapshotEntryOptions): SnapshotEntry {
  const { source, kind, retrievedAt, sha256, bytes, snapshotsDir, quality, attestation } = options;
  if (!SAFE_SOURCE_ID.test(source.id)) {
    throw new Error(
      `Unsafe source id '${source.id}': ids are used in snapshot file paths and must match ${String(SAFE_SOURCE_ID)}.`,
    );
  }
  const stamp = compactTimestamp(retrievedAt);
  const extension = MEDIA_TYPE_EXTENSION[source.mediaType];
  return {
    snapshot_id: `${source.id}@${stamp}`,
    source_id: source.id,
    label: source.label,
    kind,
    origin_url: source.originUrl,
    fetch_url: source.fetchUrl,
    channel: source.channel,
    media_type: source.mediaType,
    retrieved_at: retrievedAt,
    sha256,
    bytes,
    file: `${snapshotsDir}/${source.id}/${stamp}.${extension}`,
    ...(quality !== undefined ? { quality } : {}),
    ...(attestation !== undefined ? { attestation } : {}),
    provenance: source.provenance,
  };
}

/** Latest snapshot of a source, or undefined if it was never snapshotted. */
export function latestSnapshot(
  manifest: SnapshotManifest,
  sourceId: string,
): SnapshotEntry | undefined {
  for (let i = manifest.snapshots.length - 1; i >= 0; i -= 1) {
    const entry = manifest.snapshots[i];
    if (entry !== undefined && entry.source_id === sourceId) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Appends a snapshot entry, enforcing immutability.
 *
 * - Never mutates the input manifest.
 * - Rejects duplicate snapshot ids.
 * - When the content is byte-identical to the source's latest snapshot, the
 *   new entry shares that snapshot's file (`content_unchanged_from`) instead
 *   of scheduling a duplicate binary — the dated version is still recorded.
 */
export function appendSnapshot(
  manifest: SnapshotManifest,
  entry: SnapshotEntry,
): SnapshotManifest {
  if (manifest.snapshots.some((existing) => existing.snapshot_id === entry.snapshot_id)) {
    throw new DuplicateSnapshotError(entry.snapshot_id);
  }
  const previous = latestSnapshot(manifest, entry.source_id);
  const appended: SnapshotEntry =
    previous !== undefined && previous.sha256 === entry.sha256
      ? { ...entry, file: previous.file, content_unchanged_from: previous.snapshot_id }
      : entry;
  return { ...manifest, snapshots: [...manifest.snapshots, appended] };
}

/** Verifies bytes on disk against the committed fingerprint. */
export function verifySnapshotIntegrity(entry: SnapshotEntry, actualSha256: string): void {
  if (entry.sha256 !== actualSha256) {
    throw new SnapshotCorruptionError(entry, actualSha256);
  }
}

/** Two criterion attestations are equivalent (ignoring the timestamp of the run). */
function sameCriterionAttestation(a: CriterionAttestation, b: CriterionAttestation): boolean {
  return (
    a.by === b.by &&
    a.note === b.note &&
    a.snapshot_sha256 === b.snapshot_sha256 &&
    [...a.criteria].sort().join(',') === [...b.criteria].sort().join(',')
  );
}

/**
 * Attaches a criterion attestation (#50) to an existing snapshot, in place —
 * metadata annotation, not a byte replacement, so snapshot immutability holds.
 * Never mutates the input manifest. An identical re-run is idempotent (dedup by
 * ratifier + note + criteria + fingerprint). Raises when the snapshot is absent.
 */
export function attachCriterionAttestation(
  manifest: SnapshotManifest,
  snapshotId: string,
  attestation: CriterionAttestation,
): SnapshotManifest {
  let found = false;
  const snapshots = manifest.snapshots.map((entry) => {
    if (entry.snapshot_id !== snapshotId) return entry;
    found = true;
    const existing = entry.criteria_attestations ?? [];
    if (existing.some((a) => sameCriterionAttestation(a, attestation))) return entry;
    return { ...entry, criteria_attestations: [...existing, attestation] };
  });
  if (!found) {
    throw new Error(
      `Cannot attach a criterion attestation: no snapshot '${snapshotId}' in the manifest.`,
    );
  }
  return { ...manifest, snapshots };
}
