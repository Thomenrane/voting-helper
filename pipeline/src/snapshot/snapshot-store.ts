/**
 * Snapshot store — filesystem I/O for manifests and snapshot binaries.
 *
 * Manifests are committed to git; snapshot binaries live under the
 * gitignored `data/snapshots/` directory (decision of ticket #21).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { SnapshotEntry, SnapshotManifest } from './manifest.ts';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Loads a committed manifest; a missing file yields the provided empty manifest. */
export async function loadManifest(
  manifestAbsPath: string,
  fallback: SnapshotManifest,
): Promise<SnapshotManifest> {
  if (!existsSync(manifestAbsPath)) {
    return fallback;
  }
  const raw = await readFile(manifestAbsPath, 'utf8');
  return JSON.parse(raw) as SnapshotManifest;
}

export async function saveManifest(
  manifestAbsPath: string,
  manifest: SnapshotManifest,
): Promise<void> {
  await mkdir(dirname(manifestAbsPath), { recursive: true });
  await writeFile(manifestAbsPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/**
 * Writes the snapshot bytes for a manifest entry.
 *
 * - An entry marked `content_unchanged_from` shares an existing file: nothing
 *   is written, but the shared file must exist.
 * - Immutability guard: an existing snapshot file is NEVER overwritten.
 */
export async function writeSnapshotFile(
  repoRoot: string,
  entry: SnapshotEntry,
  bytes: Uint8Array,
): Promise<void> {
  const absPath = join(repoRoot, entry.file);
  if (entry.content_unchanged_from !== undefined) {
    if (!existsSync(absPath)) {
      throw new Error(
        `Snapshot '${entry.snapshot_id}' references shared file '${entry.file}' ` +
          `(unchanged since '${entry.content_unchanged_from}') but the file is missing.`,
      );
    }
    return;
  }
  if (existsSync(absPath)) {
    throw new Error(
      `Refusing to overwrite existing snapshot file '${entry.file}' — snapshots are immutable.`,
    );
  }
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, bytes);
}
