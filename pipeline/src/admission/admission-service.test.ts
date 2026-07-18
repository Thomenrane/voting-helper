import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

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
import { sha256Hex } from '../snapshot/snapshot-store.ts';
import { minimalPdf } from '../extraction/test-support/minimal-pdf.ts';
import {
  admitPartyFromManifest,
  collectPartySignals,
  fileLayerLoader,
  manifestAsOfDate,
} from './admission-service.ts';
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
    // Spread conditionnel : `exactOptionalPropertyTypes` interdit de passer
    // `quality: undefined` (l'option prod dans admit-source.ts fait de même).
    ...(quality !== undefined ? { quality } : {}),
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
  it('sans couche texte matérialisable → NOT_MATERIALIZED (couche absente, pas un doute) (#46)', async () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    manifest = withSnapshot(manifest, 'nva-programme-2024-text', '2026-07-16T13:05:00.000Z', {
      pages: 120,
      characters: 1000,
      empty_pages: 0,
    });
    const verdict = await admitPartyFromManifest(manifest, getExpectedIdentity('nva'), NEVER_LOADS);
    expect(verdict.status).toBe('NOT_MATERIALIZED');
    // La distinction est portée par les codes : non-matérialisé, pas .absent.
    expect(verdict.reasons.find((r) => r.check === 'auto-id-level')?.code).toBe(
      'level.not-materialized',
    );
  });

  it('avec une couche texte fédérale complète et bien dimensionnée → PASS', async () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    manifest = withSnapshot(manifest, 'nva-programme-2024-text', '2026-07-16T13:05:00.000Z', {
      pages: 120,
      characters: 1000,
      empty_pages: 0,
    });
    const pages = ['Programme pour les élections fédérales du 9 juin 2024'];
    while (pages.length < 120) pages.push(`page ${pages.length + 1}`);
    const loader = async (): Promise<ProgrammeTextLayer | null> =>
      layerOf('nva-programme-2024', ...pages);
    const verdict = await admitPartyFromManifest(manifest, getExpectedIdentity('nva'), loader);
    expect(verdict.status).toBe('PASS');
  });
});

describe('fileLayerLoader — matérialisation depuis le snapshot brut épinglé (#46)', () => {
  /**
   * Écrit un PDF brut sur disque (fixture offline via minimalPdf, aucun réseau,
   * aucune clé), attesté au manifeste avec son vrai SHA-256, puis matérialisé.
   * Prouve le cas N-VA du ticket : couche présente + « federale verkiezingen »
   * → PASS avec level.present, plus d'UNCERTAIN-par-absence.
   */
  async function seedRawSnapshot(
    sourceId: string,
    firstPage: string,
    totalPages: number,
  ): Promise<{ repoRoot: string; manifest: SnapshotManifest }> {
    const repoRoot = await mkdtemp(join(tmpdir(), 'admit-materialize-'));
    const pages = [firstPage];
    while (pages.length < totalPages) pages.push(`pagina ${pages.length + 1}`);
    const bytes = minimalPdf(pages);
    const entry = buildSnapshotEntry({
      source: source(sourceId),
      kind: 'raw',
      retrievedAt: '2026-07-16T13:25:30.000Z',
      sha256: sha256Hex(bytes),
      bytes: bytes.length,
      snapshotsDir: 'data/snapshots/programmes',
    });
    const absPath = join(repoRoot, entry.file);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, bytes);
    return { repoRoot, manifest: appendSnapshot(emptyManifest('t', 'n'), entry) };
  }

  it('N-VA : snapshot fédéral matérialisé → PASS avec level.present (« federale verkiezingen »)', async () => {
    const { repoRoot, manifest } = await seedRawSnapshot(
      'nva-programme-2024',
      'Verkiezingsprogramma 2024 - federale verkiezingen van 9 juni 2024',
      120,
    );
    const verdict = await admitPartyFromManifest(
      manifest,
      getExpectedIdentity('nva'),
      fileLayerLoader(repoRoot),
    );
    expect(verdict.status).toBe('PASS');
    const level = verdict.reasons.find((r) => r.check === 'auto-id-level');
    expect(level?.code).toBe('level.present');
  });

  it('binaire brut absent localement → NON matérialisé (loader rend null)', async () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    const loader = fileLayerLoader(await mkdtemp(join(tmpdir(), 'admit-empty-')));
    const verdict = await admitPartyFromManifest(manifest, getExpectedIdentity('nva'), loader);
    expect(verdict.status).toBe('NOT_MATERIALIZED');
  });

  it('binaire corrompu (empreinte #21 non concordante) → null, jamais faussement PASS', async () => {
    const { repoRoot, manifest } = await seedRawSnapshot('nva-programme-2024', 'federale verkiezingen 2024', 120);
    // Falsifie l'empreinte committée : les octets sur disque ne correspondent plus.
    const tampered: SnapshotManifest = {
      ...manifest,
      snapshots: manifest.snapshots.map((s) => ({ ...s, sha256: 'deadbeef'.padEnd(64, '0') })),
    };
    const verdict = await admitPartyFromManifest(
      tampered,
      getExpectedIdentity('nva'),
      fileLayerLoader(repoRoot),
    );
    expect(verdict.status).toBe('NOT_MATERIALIZED');
  });
});

describe('manifestAsOfDate — date de génération déterministe (#46)', () => {
  it('prend la plus récente retrieved_at (YYYY-MM-DD), pas une horloge de build', () => {
    let manifest = emptyManifest('t', 'n');
    manifest = withSnapshot(manifest, 'nva-programme-2024', '2026-07-16T13:00:00.000Z');
    manifest = withSnapshot(manifest, 'ps-programme-2024', '2026-07-18T09:30:00.000Z');
    expect(manifestAsOfDate(manifest)).toBe('2026-07-18');
  });

  it('manifeste vide → chaîne vide', () => {
    expect(manifestAsOfDate(emptyManifest('t', 'n'))).toBe('');
  });
});
