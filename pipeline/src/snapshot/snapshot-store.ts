/**
 * Snapshot store — filesystem I/O for manifests and snapshot binaries.
 *
 * Manifests are committed to git; snapshot binaries live under the
 * gitignored `data/snapshots/` directory (decision of ticket #21).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  verifySnapshotIntegrity,
  type SnapshotEntry,
  type SnapshotManifest,
} from './manifest.ts';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Write-then-rename: a crash mid-write never leaves a truncated file. */
async function atomicWriteFile(absPath: string, data: Uint8Array | string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp-${process.pid}`;
  await writeFile(tmpPath, data);
  await rename(tmpPath, absPath);
}

function assertString(value: unknown, what: string, path: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`'${path}' is an invalid manifest: ${what} is missing or not a string.`);
  }
}

const REQUIRED_ENTRY_FIELDS = [
  'snapshot_id',
  'source_id',
  'kind',
  'origin_url',
  'fetch_url',
  'retrieved_at',
  'sha256',
  'file',
] as const;

/** Structural validation — a corrupted manifest raises a named error. */
function assertManifest(value: unknown, path: string): asserts value is SnapshotManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`'${path}' is an invalid manifest: not a JSON object.`);
  }
  const manifest = value as Record<string, unknown>;
  assertString(manifest['description'], 'description', path);
  assertString(manifest['research_note'], 'research_note', path);
  if (!Array.isArray(manifest['snapshots'])) {
    throw new Error(`'${path}' is an invalid manifest: 'snapshots' is not an array.`);
  }
  manifest['snapshots'].forEach((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`'${path}' is an invalid manifest: snapshot entry ${index} is not an object.`);
    }
    for (const field of REQUIRED_ENTRY_FIELDS) {
      assertString((entry as Record<string, unknown>)[field], `snapshot entry ${index} '${field}'`, path);
    }
    if (typeof (entry as Record<string, unknown>)['bytes'] !== 'number') {
      throw new Error(
        `'${path}' is an invalid manifest: snapshot entry ${index} 'bytes' is missing or not a number.`,
      );
    }
  });
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `'${manifestAbsPath}' is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  assertManifest(parsed, manifestAbsPath);
  return parsed;
}

export async function saveManifest(
  manifestAbsPath: string,
  manifest: SnapshotManifest,
): Promise<void> {
  await atomicWriteFile(manifestAbsPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Writes the snapshot bytes for a manifest entry.
 *
 * - An entry marked `content_unchanged_from` shares an existing file: the
 *   stored bytes are hash-verified against the committed fingerprint BEFORE
 *   the new dated version re-attests them — a divergence is a detected
 *   corruption, never silently repaired. A locally missing shared file
 *   (fresh clone: binaries are gitignored) is re-materialized from the
 *   freshly fetched bytes, themselves verified against the fingerprint.
 * - Immutability guard: an existing snapshot file is NEVER overwritten.
 */
export async function writeSnapshotFile(
  repoRoot: string,
  entry: SnapshotEntry,
  bytes: Uint8Array,
): Promise<void> {
  const absPath = join(repoRoot, entry.file);
  if (entry.content_unchanged_from !== undefined) {
    if (existsSync(absPath)) {
      verifySnapshotIntegrity(entry, sha256Hex(await readFile(absPath)));
      return;
    }
    verifySnapshotIntegrity(entry, sha256Hex(bytes));
    await atomicWriteFile(absPath, bytes);
    return;
  }
  if (existsSync(absPath)) {
    throw new Error(
      `Refusing to overwrite existing snapshot file '${entry.file}' — snapshots are immutable.`,
    );
  }
  await atomicWriteFile(absPath, bytes);
}
