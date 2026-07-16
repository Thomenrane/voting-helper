import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendSnapshot,
  buildSnapshotEntry,
  emptyManifest,
  type SnapshotManifest,
  type SnapshotSource,
} from '../snapshot/manifest.ts';
import { sha256Hex } from '../snapshot/snapshot-store.ts';
import { ensureTextLayer } from './text-layer-store.ts';
import { minimalPdf } from './test-support/minimal-pdf.ts';

const SOURCE: SnapshotSource = {
  id: 'demo-programme',
  label: 'Demo — Programme',
  originUrl: 'https://example.org/demo.pdf',
  fetchUrl: 'https://example.org/demo.pdf',
  channel: 'live',
  mediaType: 'application/pdf',
  provenance: 'test',
};

const NOW = () => new Date('2026-07-16T12:00:00.000Z');

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'textlayer-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

async function seedRawSnapshot(pages: string[]): Promise<SnapshotManifest> {
  const pdf = minimalPdf(pages);
  const entry = buildSnapshotEntry({
    source: SOURCE,
    kind: 'raw',
    retrievedAt: '2026-07-16T10:00:00.000Z',
    sha256: sha256Hex(pdf),
    bytes: pdf.byteLength,
    snapshotsDir: 'data/snapshots/programmes',
  });
  const manifest = appendSnapshot(emptyManifest('test', 'note'), entry);
  const stored = manifest.snapshots[0];
  if (stored === undefined) throw new Error('seed failed');
  await mkdir(join(repoRoot, 'data/snapshots/programmes/demo-programme'), { recursive: true });
  await writeFile(join(repoRoot, stored.file), pdf);
  return manifest;
}

describe('ensureTextLayer', () => {
  it('derives, attests and persists the layer on first call', async () => {
    const manifest = await seedRawSnapshot(['Premiere page du programme', 'Seconde page']);
    const { layer, manifest: next } = await ensureTextLayer(repoRoot, manifest, SOURCE, NOW);

    expect(layer.created).toBe(true);
    expect(layer.entry.source_id).toBe('demo-programme-text');
    expect(layer.entry.kind).toBe('derived');
    expect(layer.entry.quality).toMatchObject({ pages: 2, empty_pages: 0 });
    expect(layer.input.layer.pages[0]?.text).toContain('Premiere page');
    expect(layer.input.raw_snapshot_id).toMatch(/^demo-programme@/);
    expect(next.snapshots).toHaveLength(2);

    const stored = await readFile(join(repoRoot, layer.entry.file));
    expect(sha256Hex(stored)).toBe(layer.entry.sha256);
  });

  it('reuses a verified up-to-date layer without appending a new entry', async () => {
    const manifest = await seedRawSnapshot(['Unique page']);
    const first = await ensureTextLayer(repoRoot, manifest, SOURCE, NOW);
    const second = await ensureTextLayer(
      repoRoot,
      first.manifest,
      SOURCE,
      () => new Date('2026-07-17T12:00:00.000Z'),
    );
    expect(second.layer.created).toBe(false);
    expect(second.manifest.snapshots).toHaveLength(first.manifest.snapshots.length);
    expect(second.layer.entry.snapshot_id).toBe(first.layer.entry.snapshot_id);
  });

  it('re-derives when the local derived file disappeared (fresh clone)', async () => {
    const manifest = await seedRawSnapshot(['Une page']);
    const first = await ensureTextLayer(repoRoot, manifest, SOURCE, NOW);
    await rm(join(repoRoot, first.layer.entry.file));
    const second = await ensureTextLayer(
      repoRoot,
      first.manifest,
      SOURCE,
      () => new Date('2026-07-17T12:00:00.000Z'),
    );
    expect(second.layer.created).toBe(true);
    // Identical content: the new dated entry shares the file via dedup.
    expect(second.layer.entry.content_unchanged_from).toBe(first.layer.entry.snapshot_id);
    const stored = await readFile(join(repoRoot, second.layer.entry.file));
    expect(sha256Hex(stored)).toBe(first.layer.entry.sha256);
  });

  it('refuses non-PDF sources with the documented limitation', async () => {
    const manifest = await seedRawSnapshot(['x']);
    await expect(
      ensureTextLayer(repoRoot, manifest, { ...SOURCE, mediaType: 'text/html' }, NOW),
    ).rejects.toThrow(/only covers PDF/);
  });

  it('demands a prior raw snapshot', async () => {
    const manifest = emptyManifest('test', 'note');
    await expect(ensureTextLayer(repoRoot, manifest, SOURCE, NOW)).rejects.toThrow(
      /never snapshotted/,
    );
  });

  it('names the missing raw binary and the command that restores it', async () => {
    const manifest = await seedRawSnapshot(['x']);
    const raw = manifest.snapshots[0];
    if (raw === undefined) throw new Error('seed failed');
    await rm(join(repoRoot, raw.file));
    await expect(ensureTextLayer(repoRoot, manifest, SOURCE, NOW)).rejects.toThrow(
      /missing locally.*snapshot:programmes/s,
    );
  });
});
