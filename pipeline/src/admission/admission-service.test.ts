import { describe, expect, it } from 'vitest';

import {
  appendSnapshot,
  buildSnapshotEntry,
  emptyManifest,
  type SnapshotEntry,
  type SnapshotManifest,
  type SnapshotSource,
} from '../snapshot/manifest.ts';
import type { ProgrammeTextLayer } from '../extraction/text-layer.ts';
import { admitPartyFromManifest, collectPartySignals } from './admission-service.ts';
import { getExpectedIdentity } from './expected-identity.ts';

function source(id: string): SnapshotSource {
  return {
    id,
    label: id,
    originUrl: 'https://example.org/x.pdf',
    fetchUrl: 'https://example.org/x.pdf',
    channel: 'live',
    mediaType: id.endsWith('-text') ? 'application/json' : 'application/pdf',
    provenance: 'test',
  };
}

function withSnapshot(
  manifest: SnapshotManifest,
  id: string,
  at: string,
  quality?: Record<string, number>,
): SnapshotManifest {
  const entry = buildSnapshotEntry({
    source: source(id),
    kind: id.endsWith('-text') ? 'derived' : 'raw',
    retrievedAt: at,
    sha256: `${id}`.padEnd(64, '0'),
    bytes: 10,
    snapshotsDir: 'data/snapshots/programmes',
    quality,
  });
  return appendSnapshot(manifest, entry);
}

function layerOf(sourceId: string, ...pages: string[]): ProgrammeTextLayer {
  return {
    source_id: sourceId,
    source_sha256: 'sha',
    extractor: 'unpdf',
    page_count: pages.length,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  };
}

const NEVER_LOADS = async (): Promise<ProgrammeTextLayer | null> => null;

describe('collectPartySignals', () => {
  it('marque une partie présente quand sa source brute est snapshotée', () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    return collectPartySignals(manifest, getExpectedIdentity('nva'), NEVER_LOADS).then((r) => {
      expect(r.presentSourceIds).toEqual(['nva-programme-2024']);
    });
  });

  it('reprend les pages connues du manifeste (quality.pages) sans couche texte', async () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    manifest = withSnapshot(manifest, 'nva-programme-2024-text', '2026-07-16T13:05:00.000Z', {
      pages: 120,
      characters: 1000,
      empty_pages: 0,
    });
    const { signals } = await collectPartySignals(manifest, getExpectedIdentity('nva'), NEVER_LOADS);
    expect(signals[0]?.knownPages).toBe(120);
    expect(signals[0]?.layer).toBeNull();
  });
});

describe('admitPartyFromManifest', () => {
  it('sans couche texte chargeable → UNCERTAIN (auto-ID non évaluée)', async () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    manifest = withSnapshot(manifest, 'nva-programme-2024-text', '2026-07-16T13:05:00.000Z', {
      pages: 120,
      characters: 1000,
      empty_pages: 0,
    });
    const verdict = await admitPartyFromManifest(manifest, getExpectedIdentity('nva'), NEVER_LOADS);
    expect(verdict.status).toBe('UNCERTAIN');
  });

  it('avec une couche texte fédérale complète et bien dimensionnée → PASS', async () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    manifest = withSnapshot(manifest, 'nva-programme-2024-text', '2026-07-16T13:05:00.000Z', {
      pages: 120,
      characters: 1000,
      empty_pages: 0,
    });
    const pages = ['Programme fédéral — élections du 9 juin 2024'];
    while (pages.length < 120) pages.push(`page ${pages.length + 1}`);
    const loader = async (): Promise<ProgrammeTextLayer | null> =>
      layerOf('nva-programme-2024', ...pages);
    const verdict = await admitPartyFromManifest(manifest, getExpectedIdentity('nva'), loader);
    expect(verdict.status).toBe('PASS');
  });
});
