import { describe, expect, it } from 'vitest';

import {
  appendSnapshot,
  buildSnapshotEntry,
  compactTimestamp,
  DuplicateSnapshotError,
  emptyManifest,
  latestSnapshot,
  SnapshotCorruptionError,
  verifySnapshotIntegrity,
  type SnapshotSource,
} from './manifest.ts';

const SOURCE: SnapshotSource = {
  id: 'ps-programme-2024',
  label: 'PS — Programme 2024 (PDF complet)',
  originUrl: 'https://example.org/programme.pdf',
  fetchUrl: 'https://example.org/programme.pdf',
  channel: 'live',
  mediaType: 'application/pdf',
  provenance: 'docs/research/programmes-partis.md — § PS',
};

function entryAt(retrievedAt: string, sha256 = 'a'.repeat(64)) {
  return buildSnapshotEntry({
    source: SOURCE,
    kind: 'raw',
    retrievedAt,
    sha256,
    bytes: 1234,
    snapshotsDir: 'data/snapshots/programmes',
  });
}

describe('compactTimestamp', () => {
  it('produces a filename-safe, sortable, millisecond-precision UTC stamp', () => {
    expect(compactTimestamp('2026-07-16T13:07:42.123Z')).toBe('20260716T130742123Z');
  });

  it('rejects an invalid timestamp', () => {
    expect(() => compactTimestamp('not-a-date')).toThrow(/Invalid snapshot timestamp/);
  });
});

describe('buildSnapshotEntry', () => {
  it('dates the snapshot id and file path from the retrieval time', () => {
    const entry = entryAt('2026-07-16T13:07:42.000Z');
    expect(entry.snapshot_id).toBe('ps-programme-2024@20260716T130742000Z');
    expect(entry.file).toBe('data/snapshots/programmes/ps-programme-2024/20260716T130742000Z.pdf');
  });

  it('rejects a source id unsafe for file paths', () => {
    for (const id of ['../escape', 'UPPER', 'a b', 'dot.dot', '']) {
      expect(() =>
        buildSnapshotEntry({
          source: { ...SOURCE, id },
          kind: 'raw',
          retrievedAt: '2026-07-16T13:07:42.000Z',
          sha256: 'a'.repeat(64),
          bytes: 1,
          snapshotsDir: 'data/snapshots/programmes',
        }),
      ).toThrow(/source id/i);
    }
  });

  it('derives the file extension from the media type', () => {
    const entry = buildSnapshotEntry({
      source: { ...SOURCE, id: 'votes-parquet', mediaType: 'application/vnd.apache.parquet' },
      kind: 'raw',
      retrievedAt: '2026-07-16T13:07:42.000Z',
      sha256: 'b'.repeat(64),
      bytes: 99,
      snapshotsDir: 'data/snapshots/votes',
    });
    expect(entry.file).toBe('data/snapshots/votes/votes-parquet/20260716T130742000Z.parquet');
  });

  it('carries provenance and both URLs (origin vs fetched)', () => {
    const waybackSource: SnapshotSource = {
      ...SOURCE,
      originUrl: 'https://dead.example.org/programme.pdf',
      fetchUrl: 'https://web.archive.org/web/2024id_/https://dead.example.org/programme.pdf',
      channel: 'wayback',
    };
    const entry = buildSnapshotEntry({
      source: waybackSource,
      kind: 'raw',
      retrievedAt: '2026-07-16T13:07:42.000Z',
      sha256: 'c'.repeat(64),
      bytes: 99,
      snapshotsDir: 'data/snapshots/programmes',
    });
    expect(entry.origin_url).toBe('https://dead.example.org/programme.pdf');
    expect(entry.fetch_url).toContain('web.archive.org');
    expect(entry.channel).toBe('wayback');
    expect(entry.provenance).toContain('programmes-partis.md');
  });
});

describe('buildSnapshotEntry — human attestation (re-entry path #42)', () => {
  it('omits attestation by default and records it when provided', () => {
    const plain = entryAt('2026-07-16T13:07:42.000Z');
    expect(plain.attestation).toBeUndefined();

    const attested = buildSnapshotEntry({
      source: { ...SOURCE, channel: 'manual' },
      kind: 'raw',
      retrievedAt: '2026-07-18T10:00:00.000Z',
      sha256: 'a'.repeat(64),
      bytes: 42,
      snapshotsDir: 'data/snapshots/programmes',
      attestation: {
        by: 'Thomas',
        at: '2026-07-18T10:00:00.000Z',
        source: 'https://www.ps.be/programme-2024 (téléchargé en navigateur)',
        note: 'Programme complet vérifié à la main.',
      },
    });
    expect(attested.channel).toBe('manual');
    expect(attested.attestation?.by).toBe('Thomas');
    expect(attested.attestation?.source).toContain('ps.be');
  });
});

describe('appendSnapshot — immutability', () => {
  it('appends without mutating the input manifest', () => {
    const manifest = emptyManifest('test', 'docs/research/programmes-partis.md');
    const next = appendSnapshot(manifest, entryAt('2026-07-16T13:07:42.000Z'));
    expect(manifest.snapshots).toHaveLength(0);
    expect(next.snapshots).toHaveLength(1);
  });

  it('rejects a duplicate snapshot id — a version is never replaced', () => {
    const entry = entryAt('2026-07-16T13:07:42.000Z');
    const manifest = appendSnapshot(emptyManifest('test', 'note'), entry);
    expect(() => appendSnapshot(manifest, entry)).toThrow(DuplicateSnapshotError);
    expect(() => appendSnapshot(manifest, entry)).toThrow(
      /already snapshotted at this exact timestamp.*immutable/,
    );
  });

  it('re-snapshotting dates a NEW version instead of overwriting', () => {
    let manifest = emptyManifest('test', 'note');
    manifest = appendSnapshot(manifest, entryAt('2026-07-16T13:07:42.000Z', 'a'.repeat(64)));
    manifest = appendSnapshot(manifest, entryAt('2026-08-01T09:00:00.000Z', 'b'.repeat(64)));
    expect(manifest.snapshots).toHaveLength(2);
    expect(manifest.snapshots.map((s) => s.snapshot_id)).toEqual([
      'ps-programme-2024@20260716T130742000Z',
      'ps-programme-2024@20260801T090000000Z',
    ]);
    expect(latestSnapshot(manifest, 'ps-programme-2024')?.sha256).toBe('b'.repeat(64));
  });

  it('shares the stored file when content is unchanged, but still dates a version', () => {
    const sha = 'd'.repeat(64);
    let manifest = emptyManifest('test', 'note');
    manifest = appendSnapshot(manifest, entryAt('2026-07-16T13:07:42.000Z', sha));
    manifest = appendSnapshot(manifest, entryAt('2026-08-01T09:00:00.000Z', sha));
    const [first, second] = manifest.snapshots;
    expect(second?.content_unchanged_from).toBe(first?.snapshot_id);
    expect(second?.file).toBe(first?.file);
    expect(second?.snapshot_id).not.toBe(first?.snapshot_id);
  });
});

describe('latestSnapshot', () => {
  it('returns undefined for a source never snapshotted', () => {
    expect(latestSnapshot(emptyManifest('test', 'note'), 'unknown')).toBeUndefined();
  });
});

describe('verifySnapshotIntegrity — corruption detection', () => {
  it('accepts bytes matching the committed fingerprint', () => {
    const entry = entryAt('2026-07-16T13:07:42.000Z', 'e'.repeat(64));
    expect(() => verifySnapshotIntegrity(entry, 'e'.repeat(64))).not.toThrow();
  });

  it('names the snapshot, source and file when fingerprints diverge', () => {
    const entry = entryAt('2026-07-16T13:07:42.000Z', 'e'.repeat(64));
    expect(() => verifySnapshotIntegrity(entry, 'f'.repeat(64))).toThrow(SnapshotCorruptionError);
    expect(() => verifySnapshotIntegrity(entry, 'f'.repeat(64))).toThrow(
      /ps-programme-2024@20260716T130742000Z.*ps-programme-2024.*corrupted/,
    );
  });
});
