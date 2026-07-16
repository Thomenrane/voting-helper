/**
 * Manifest verification — confronts every snapshot file present on disk with
 * the SHA-256 fingerprint committed in the manifest.
 *
 * A missing file is NOT an error: binaries are gitignored, so a fresh clone
 * has manifests but no local snapshots. Corruption, however, is.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SnapshotEntry, SnapshotManifest } from './manifest.ts';
import { sha256Hex } from './snapshot-store.ts';

export type SnapshotFileStatus = 'ok' | 'corrupted' | 'missing';

export interface SnapshotVerification {
  entry: SnapshotEntry;
  status: SnapshotFileStatus;
  /** Hash of the bytes actually on disk — set unless the file is missing. */
  actualSha256?: string;
}

/** Verifies each manifest entry's file on disk. Order follows the manifest. */
export async function verifyManifestFiles(
  repoRoot: string,
  manifest: SnapshotManifest,
): Promise<SnapshotVerification[]> {
  const hashCache = new Map<string, string>();
  const results: SnapshotVerification[] = [];
  for (const entry of manifest.snapshots) {
    const absPath = join(repoRoot, entry.file);
    if (!existsSync(absPath)) {
      results.push({ entry, status: 'missing' });
      continue;
    }
    let actualSha256 = hashCache.get(absPath);
    if (actualSha256 === undefined) {
      actualSha256 = sha256Hex(await readFile(absPath));
      hashCache.set(absPath, actualSha256);
    }
    results.push({
      entry,
      status: actualSha256 === entry.sha256 ? 'ok' : 'corrupted',
      actualSha256,
    });
  }
  return results;
}
