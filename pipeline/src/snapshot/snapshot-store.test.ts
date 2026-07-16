import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildSnapshotEntry,
  emptyManifest,
  SnapshotCorruptionError,
  type SnapshotSource,
} from './manifest.ts';
import { loadManifest, saveManifest, sha256Hex, writeSnapshotFile } from './snapshot-store.ts';

const SOURCE: SnapshotSource = {
  id: 'demo-source',
  label: 'Demo source',
  originUrl: 'https://example.org/demo.pdf',
  fetchUrl: 'https://example.org/demo.pdf',
  channel: 'live',
  mediaType: 'application/pdf',
  provenance: 'docs/research/programmes-partis.md — § demo',
};

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'snapshot-store-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('sha256Hex', () => {
  it('fingerprints bytes deterministically', () => {
    const bytes = new TextEncoder().encode('voting-helper');
    expect(sha256Hex(bytes)).toBe(sha256Hex(bytes));
    expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(new TextEncoder().encode('other'))).not.toBe(sha256Hex(bytes));
  });
});

describe('manifest persistence', () => {
  it('returns the fallback when no manifest is committed yet', async () => {
    const fallback = emptyManifest('desc', 'note');
    const loaded = await loadManifest(join(repoRoot, 'data/manifests/missing.json'), fallback);
    expect(loaded).toEqual(fallback);
  });

  it('round-trips a manifest through disk', async () => {
    const path = join(repoRoot, 'data/manifests/programmes.manifest.json');
    const manifest = emptyManifest('Programme snapshots', 'docs/research/programmes-partis.md');
    await saveManifest(path, manifest);
    const loaded = await loadManifest(path, emptyManifest('x', 'y'));
    expect(loaded).toEqual(manifest);
    expect(await readFile(path, 'utf8')).toMatch(/\n$/);
  });
});

describe('writeSnapshotFile — immutability on disk', () => {
  const entry = buildSnapshotEntry({
    source: SOURCE,
    kind: 'raw',
    retrievedAt: '2026-07-16T13:07:42.000Z',
    sha256: 'a'.repeat(64),
    bytes: 4,
    snapshotsDir: 'data/snapshots/programmes',
  });

  it('writes bytes at the entry path', async () => {
    await writeSnapshotFile(repoRoot, entry, new TextEncoder().encode('PDF!'));
    expect(await readFile(join(repoRoot, entry.file), 'utf8')).toBe('PDF!');
  });

  it('refuses to overwrite an existing snapshot file', async () => {
    await writeSnapshotFile(repoRoot, entry, new TextEncoder().encode('PDF!'));
    await expect(writeSnapshotFile(repoRoot, entry, new TextEncoder().encode('NEW'))).rejects.toThrow(
      /Refusing to overwrite.*immutable/,
    );
    expect(await readFile(join(repoRoot, entry.file), 'utf8')).toBe('PDF!');
  });

  it('verifies then keeps an existing shared file for an unchanged-content entry', async () => {
    const bytes = new TextEncoder().encode('PDF!');
    const attested = { ...entry, sha256: sha256Hex(bytes) };
    await writeSnapshotFile(repoRoot, attested, bytes);
    const shared = {
      ...attested,
      snapshot_id: 'demo-source@20260801T090000000Z',
      content_unchanged_from: attested.snapshot_id,
    };
    await writeSnapshotFile(repoRoot, shared, bytes);
    expect(await readFile(join(repoRoot, entry.file), 'utf8')).toBe('PDF!');
  });

  it('detects a corrupted shared file before re-attesting an unchanged-content entry', async () => {
    const bytes = new TextEncoder().encode('PDF!');
    const attested = { ...entry, sha256: sha256Hex(bytes) };
    await writeSnapshotFile(repoRoot, attested, bytes);
    // Truncate the stored binary behind the manifest's back.
    await writeFile(join(repoRoot, entry.file), 'PD');
    const shared = {
      ...attested,
      snapshot_id: 'demo-source@20260801T090000000Z',
      content_unchanged_from: attested.snapshot_id,
    };
    await expect(writeSnapshotFile(repoRoot, shared, bytes)).rejects.toThrow(
      SnapshotCorruptionError,
    );
    await expect(writeSnapshotFile(repoRoot, shared, bytes)).rejects.toThrow(/corrupted/);
    // The truncated file is untouched — no silent repair, no re-attestation.
    expect(await readFile(join(repoRoot, entry.file), 'utf8')).toBe('PD');
  });

  it('re-materializes a missing shared file from the fetched bytes (fresh clone)', async () => {
    const bytes = new TextEncoder().encode('PDF!');
    const shared = {
      ...entry,
      sha256: sha256Hex(bytes),
      snapshot_id: 'demo-source@20260801T090000000Z',
      content_unchanged_from: entry.snapshot_id,
    };
    await writeSnapshotFile(repoRoot, shared, bytes);
    expect(await readFile(join(repoRoot, entry.file), 'utf8')).toBe('PDF!');
  });

  it('refuses to re-materialize when the fetched bytes do not match the fingerprint', async () => {
    const shared = {
      ...entry,
      sha256: 'a'.repeat(64),
      snapshot_id: 'demo-source@20260801T090000000Z',
      content_unchanged_from: entry.snapshot_id,
    };
    await expect(writeSnapshotFile(repoRoot, shared, new TextEncoder().encode('DIFFERENT'))).rejects.toThrow(
      SnapshotCorruptionError,
    );
  });
});
