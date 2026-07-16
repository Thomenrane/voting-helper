/**
 * Snapshot runner — orchestrates fetch → fingerprint → manifest → store for a
 * list of sources. Network access is injected so the logic is testable offline.
 *
 * Failure contract (ticket #21): a failing source NEVER silently truncates the
 * run. Every source is attempted; successes are recorded; the caller receives
 * the full list of failures, each naming its source, and must exit non-zero.
 */
import {
  appendSnapshot,
  buildSnapshotEntry,
  type SnapshotKind,
  type SnapshotManifest,
  type SnapshotSource,
} from './manifest.ts';
import { sha256Hex } from './snapshot-store.ts';

/** Fetches the raw bytes of one URL. Must reject on any non-success response. */
export type FetchBytes = (url: string) => Promise<Uint8Array>;

/** Persists the bytes of one appended entry (see writeSnapshotFile). */
export type PersistSnapshot = (
  entry: SnapshotManifest['snapshots'][number],
  bytes: Uint8Array,
) => Promise<void>;

export interface SourceFailure {
  source: SnapshotSource;
  error: Error;
}

export interface SnapshotRunResult {
  manifest: SnapshotManifest;
  succeeded: SnapshotManifest['snapshots'];
  failed: SourceFailure[];
}

export interface SnapshotRunOptions {
  sources: SnapshotSource[];
  manifest: SnapshotManifest;
  kind: SnapshotKind;
  /** Snapshot directory relative to the repo root, e.g. 'data/snapshots/programmes'. */
  snapshotsDir: string;
  fetchBytes: FetchBytes;
  persistSnapshot: PersistSnapshot;
  now?: () => Date;
}

/** Raised by commands when at least one source failed. Names every source. */
export class SnapshotRunError extends Error {
  readonly failures: SourceFailure[];

  constructor(failures: SourceFailure[], succeededCount: number) {
    const lines = failures.map(
      (f) => `  - ${f.source.id} (${f.source.label}) — ${f.source.fetchUrl}: ${f.error.message}`,
    );
    super(
      `${failures.length} source(s) failed to snapshot (${succeededCount} succeeded — recorded in the manifest):\n${lines.join('\n')}`,
    );
    this.name = 'SnapshotRunError';
    this.failures = failures;
  }
}

/**
 * Snapshots every source, appending one dated immutable entry per success.
 * Never throws for a source failure — failures are returned for explicit
 * reporting by the caller.
 */
export async function snapshotSources(options: SnapshotRunOptions): Promise<SnapshotRunResult> {
  const { sources, kind, snapshotsDir, fetchBytes, persistSnapshot } = options;
  const now = options.now ?? (() => new Date());

  let manifest = options.manifest;
  const succeeded: SnapshotManifest['snapshots'] = [];
  const failed: SourceFailure[] = [];

  for (const source of sources) {
    try {
      const bytes = await fetchBytes(source.fetchUrl);
      const entry = buildSnapshotEntry({
        source,
        kind,
        retrievedAt: now().toISOString(),
        sha256: sha256Hex(bytes),
        bytes: bytes.byteLength,
        snapshotsDir,
      });
      const next = appendSnapshot(manifest, entry);
      const appended = next.snapshots[next.snapshots.length - 1];
      if (appended === undefined) {
        throw new Error(`Manifest append produced no entry for source '${source.id}'.`);
      }
      await persistSnapshot(appended, bytes);
      manifest = next;
      succeeded.push(appended);
    } catch (cause) {
      failed.push({
        source,
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
  }

  return { manifest, succeeded, failed };
}
