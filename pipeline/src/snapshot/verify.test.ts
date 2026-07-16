import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendSnapshot,
  buildSnapshotEntry,
  emptyManifest,
  type SnapshotManifest,
  type SnapshotSource,
} from './manifest.ts';
import { sha256Hex } from './snapshot-store.ts';
import { verifyManifestFiles } from './verify.ts';

function source(id: string): SnapshotSource {
  return {
    id,
    label: `Source ${id}`,
    originUrl: `https://example.org/${id}.pdf`,
    fetchUrl: `https://example.org/${id}.pdf`,
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: 'note',
  };
}

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'snapshot-verify-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

async function manifestWith(
  entries: { id: string; content: string | null; storedContent?: string }[],
): Promise<SnapshotManifest> {
  let manifest = emptyManifest('test', 'note');
  for (const { id, content, storedContent } of entries) {
    const bytes = new TextEncoder().encode(content ?? '');
    const entry = buildSnapshotEntry({
      source: source(id),
      kind: 'raw',
      retrievedAt: '2026-07-16T13:07:42.123Z',
      sha256: sha256Hex(bytes),
      bytes: bytes.byteLength,
      snapshotsDir: 'data/snapshots/test',
    });
    manifest = appendSnapshot(manifest, entry);
    if (content !== null) {
      const absPath = join(repoRoot, entry.file);
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, storedContent ?? content);
    }
  }
  return manifest;
}

describe('verifyManifestFiles', () => {
  it('reports ok / corrupted / missing per manifest entry', async () => {
    const manifest = await manifestWith([
      { id: 'intact', content: 'good bytes' },
      { id: 'truncated', content: 'full bytes', storedContent: 'full' },
      { id: 'absent', content: null },
    ]);

    const results = await verifyManifestFiles(repoRoot, manifest);

    expect(results.map((r) => [r.entry.source_id, r.status])).toEqual([
      ['intact', 'ok'],
      ['truncated', 'corrupted'],
      ['absent', 'missing'],
    ]);
    const corrupted = results.find((r) => r.status === 'corrupted');
    expect(corrupted?.actualSha256).toBeDefined();
    expect(corrupted?.actualSha256).not.toBe(corrupted?.entry.sha256);
  });

  it('verifies every dated version, including unchanged-content entries sharing a file', async () => {
    let manifest = await manifestWith([{ id: 'doc', content: 'stable content' }]);
    const bytes = new TextEncoder().encode('stable content');
    const again = buildSnapshotEntry({
      source: source('doc'),
      kind: 'raw',
      retrievedAt: '2026-08-01T09:00:00.000Z',
      sha256: sha256Hex(bytes),
      bytes: bytes.byteLength,
      snapshotsDir: 'data/snapshots/test',
    });
    manifest = appendSnapshot(manifest, again);

    const results = await verifyManifestFiles(repoRoot, manifest);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });
});
