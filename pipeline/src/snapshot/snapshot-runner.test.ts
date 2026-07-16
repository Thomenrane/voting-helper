import { describe, expect, it } from 'vitest';

import { emptyManifest, type SnapshotEntry, type SnapshotSource } from './manifest.ts';
import { SnapshotRunError, snapshotSources } from './snapshot-runner.ts';

function source(id: string): SnapshotSource {
  return {
    id,
    label: `Source ${id}`,
    originUrl: `https://example.org/${id}.pdf`,
    fetchUrl: `https://example.org/${id}.pdf`,
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `docs/research/programmes-partis.md — § ${id}`,
  };
}

const at = (iso: string) => () => new Date(iso);

describe('snapshotSources', () => {
  it('appends one dated immutable entry per source and persists its bytes', async () => {
    const persisted: SnapshotEntry[] = [];
    const result = await snapshotSources({
      sources: [source('alpha'), source('beta')],
      manifest: emptyManifest('test', 'note'),
      kind: 'raw',
      snapshotsDir: 'data/snapshots/programmes',
      fetchBytes: async (url) => new TextEncoder().encode(url),
      persistSnapshot: async (entry) => {
        persisted.push(entry);
      },
      now: at('2026-07-16T13:07:42.000Z'),
    });

    expect(result.failed).toHaveLength(0);
    expect(result.succeeded.map((e) => e.source_id)).toEqual(['alpha', 'beta']);
    expect(result.manifest.snapshots).toHaveLength(2);
    expect(persisted.map((e) => e.snapshot_id)).toEqual([
      'alpha@20260716T130742000Z',
      'beta@20260716T130742000Z',
    ]);
    expect(result.succeeded[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps going after a failure: successes are recorded, failures listed with their source', async () => {
    const result = await snapshotSources({
      sources: [source('ok-1'), source('down'), source('ok-2')],
      manifest: emptyManifest('test', 'note'),
      kind: 'raw',
      snapshotsDir: 'data/snapshots/programmes',
      fetchBytes: async (url) => {
        if (url.includes('down')) {
          throw new Error('HTTP 404');
        }
        return new TextEncoder().encode(url);
      },
      persistSnapshot: async () => {},
      now: at('2026-07-16T13:07:42.000Z'),
    });

    expect(result.succeeded.map((e) => e.source_id)).toEqual(['ok-1', 'ok-2']);
    expect(result.manifest.snapshots.map((e) => e.source_id)).toEqual(['ok-1', 'ok-2']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.source.id).toBe('down');
    expect(result.failed[0]?.error.message).toBe('HTTP 404');
  });

  it('does not record a manifest entry when persisting the bytes fails', async () => {
    const result = await snapshotSources({
      sources: [source('alpha')],
      manifest: emptyManifest('test', 'note'),
      kind: 'raw',
      snapshotsDir: 'data/snapshots/programmes',
      fetchBytes: async () => new Uint8Array([1]),
      persistSnapshot: async () => {
        throw new Error('disk full');
      },
      now: at('2026-07-16T13:07:42.000Z'),
    });

    expect(result.manifest.snapshots).toHaveLength(0);
    expect(result.failed[0]?.error.message).toBe('disk full');
  });

  it('re-running against the produced manifest dates a new version', async () => {
    const run = (manifest: Parameters<typeof snapshotSources>[0]['manifest'], iso: string) =>
      snapshotSources({
        sources: [source('alpha')],
        manifest,
        kind: 'raw',
        snapshotsDir: 'data/snapshots/programmes',
        fetchBytes: async () => new TextEncoder().encode('same content'),
        persistSnapshot: async () => {},
        now: at(iso),
      });

    const first = await run(emptyManifest('test', 'note'), '2026-07-16T13:07:42.000Z');
    const second = await run(first.manifest, '2026-08-01T09:00:00.000Z');

    expect(second.manifest.snapshots).toHaveLength(2);
    expect(second.manifest.snapshots[1]?.content_unchanged_from).toBe(
      first.manifest.snapshots[0]?.snapshot_id,
    );
  });
});

describe('SnapshotRunError', () => {
  it('names every failed source, its URL and the cause', () => {
    const error = new SnapshotRunError(
      [
        { source: source('ps-programme-2024'), error: new Error('HTTP 403') },
        { source: source('ecolo-programme-2024'), error: new Error('timeout') },
      ],
      11,
    );
    expect(error.message).toContain('2 source(s) failed');
    expect(error.message).toContain('11 succeeded');
    expect(error.message).toContain('ps-programme-2024');
    expect(error.message).toContain('https://example.org/ps-programme-2024.pdf: HTTP 403');
    expect(error.message).toContain('ecolo-programme-2024');
    expect(error.message).toContain('timeout');
  });
});
