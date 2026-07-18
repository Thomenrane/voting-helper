import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { admitPartyFromManifest, fileLayerLoader } from '../admission/admission-service.ts';
import { getExpectedIdentity } from '../admission/expected-identity.ts';
import {
  appendSnapshot,
  buildSnapshotEntry,
  emptyManifest,
  type SnapshotManifest,
  type SnapshotSource,
} from '../snapshot/manifest.ts';
import { sha256Hex } from '../snapshot/snapshot-store.ts';
import { chapterSourceId } from '../sources/html-chapters.ts';
import { chapterEntries, materializeHtmlChapterLayer } from './chapter-layer-store.ts';

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'chapter-layer-'));
});
afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

function htmlSource(id: string, originUrl: string): SnapshotSource {
  return {
    id,
    label: id,
    originUrl,
    fetchUrl: originUrl,
    channel: 'live',
    mediaType: 'text/html',
    provenance: 'test',
  };
}

/** Writes an HTML snapshot to disk and appends its (real-sha) manifest entry. */
async function seedHtml(
  manifest: SnapshotManifest,
  source: SnapshotSource,
  html: string,
  at: string,
): Promise<SnapshotManifest> {
  const bytes = new TextEncoder().encode(html);
  const entry = buildSnapshotEntry({
    source,
    kind: 'raw',
    retrievedAt: at,
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
    snapshotsDir: 'data/snapshots/programmes',
  });
  const next = appendSnapshot(manifest, entry);
  const stored = next.snapshots[next.snapshots.length - 1];
  if (stored === undefined) throw new Error('seed failed');
  const absPath = join(repoRoot, stored.file);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, bytes);
  return next;
}

const CHAPTER = (heading: string, body: string): string =>
  `<html><body><nav class="menu__main">MENU</nav><main><h1>${heading}</h1>` +
  `<p>${body}</p></main><footer class="footer__x">chrome</footer></body></html>`;

async function seedIndexWithChapters(
  indexId: string,
  origin: string,
  path: string,
  chapters: { slug: string; heading: string; body: string }[],
): Promise<SnapshotManifest> {
  let manifest = emptyManifest('t', 'n');
  manifest = await seedHtml(
    manifest,
    htmlSource(indexId, `${origin}${path}`),
    '<html><body><a href="' + path + '/x">x</a></body></html>',
    '2026-07-16T13:00:00.000Z',
  );
  for (const chapter of chapters) {
    manifest = await seedHtml(
      manifest,
      htmlSource(chapterSourceId(indexId, chapter.slug), `${origin}${path}/${chapter.slug}`),
      CHAPTER(chapter.heading, chapter.body),
      '2026-07-16T13:10:00.000Z',
    );
  }
  return manifest;
}

describe('materializeHtmlChapterLayer', () => {
  it('assembles one page per chapter, slug-ordered, from verified snapshots', async () => {
    const manifest = await seedIndexWithChapters('ptb-programme-2024', 'https://www.ptb.be', '/programme', [
      { slug: 'justice-fiscale', heading: 'Justice fiscale', body: 'Taxe des riches.' },
      { slug: 'agriculture', heading: 'Agriculture', body: 'Soutien aux paysans.' },
    ]);
    const layer = await materializeHtmlChapterLayer(repoRoot, manifest, 'ptb-programme-2024');
    expect(layer).not.toBeNull();
    expect(layer?.extractor).toBe('html-chapters');
    expect(layer?.page_count).toBe(2);
    expect(layer?.pages[0]?.title).toBe('Agriculture');
    expect(layer?.pages[1]?.text).toContain('Taxe des riches');
    // Chrome stripped.
    expect(layer?.pages[0]?.text).not.toContain('MENU');
    expect(layer?.pages[0]?.text).not.toContain('chrome');
  });

  it('returns null when no chapter is snapshotted yet (crawl not run)', async () => {
    let manifest = emptyManifest('t', 'n');
    manifest = await seedHtml(
      manifest,
      htmlSource('ptb-programme-2024', 'https://www.ptb.be/programme'),
      '<html></html>',
      '2026-07-16T13:00:00.000Z',
    );
    expect(chapterEntries(manifest, 'ptb-programme-2024')).toHaveLength(0);
    expect(await materializeHtmlChapterLayer(repoRoot, manifest, 'ptb-programme-2024')).toBeNull();
  });

  it('returns null when a chapter binary is missing locally (partial crawl)', async () => {
    const manifest = await seedIndexWithChapters('ptb-programme-2024', 'https://www.ptb.be', '/programme', [
      { slug: 'agriculture', heading: 'Agriculture', body: 'x' },
    ]);
    // Delete the chapter file on disk — a partial crawl must never yield a partial layer.
    const chapEntry = manifest.snapshots.find((s) => s.source_id.includes('-chapitre-'));
    if (chapEntry === undefined) throw new Error('no chapter entry');
    await rm(join(repoRoot, chapEntry.file));
    expect(await materializeHtmlChapterLayer(repoRoot, manifest, 'ptb-programme-2024')).toBeNull();
  });

  it('returns null when a chapter is falsified (committed fingerprint diverges)', async () => {
    const manifest = await seedIndexWithChapters('ptb-programme-2024', 'https://www.ptb.be', '/programme', [
      { slug: 'agriculture', heading: 'Agriculture', body: 'x' },
    ]);
    const tampered: SnapshotManifest = {
      ...manifest,
      snapshots: manifest.snapshots.map((s) =>
        s.source_id.includes('-chapitre-') ? { ...s, sha256: 'deadbeef'.padEnd(64, '0') } : s,
      ),
    };
    expect(await materializeHtmlChapterLayer(repoRoot, tampered, 'ptb-programme-2024')).toBeNull();
  });
});

describe('admission of PTB-PVDA once chapters are crawled (#51)', () => {
  /**
   * Seeds BOTH language indexes and their chapters on disk. Content self-declares
   * the 2024 federal programme, so the materialized layer yields a REAL verdict
   * (not NON MATÉRIALISÉ) — the ticket's headline. The exact PASS/UNCERTAIN
   * depends on content; here it is a clean PASS.
   */
  async function seedPtbPvda(): Promise<SnapshotManifest> {
    const federal = 'Programme 2024 pour les élections fédérales du 9 juin 2024.';
    let manifest = await seedIndexWithChapters('ptb-programme-2024', 'https://www.ptb.be', '/programme', [
      { slug: 'introduction', heading: 'Introduction', body: federal },
      { slug: 'justice-fiscale', heading: 'Justice fiscale', body: 'Taxe des millionnaires.' },
    ]);
    // Continue on the SAME manifest/repoRoot for the NL mirror.
    for (const chapter of [
      { slug: 'inleiding', heading: 'Inleiding', body: 'Programma 2024 voor de federale verkiezingen.' },
      { slug: 'fiscale-rechtvaardigheid', heading: 'Fiscale', body: 'Miljonairstaks.' },
    ]) {
      manifest = await seedHtml(
        manifest,
        htmlSource(chapterSourceId('pvda-programme-2024', chapter.slug), `https://www.pvda.be/programma/${chapter.slug}`),
        CHAPTER(chapter.heading, chapter.body),
        '2026-07-16T13:10:00.000Z',
      );
    }
    // The pvda index snapshot itself.
    manifest = await seedHtml(
      manifest,
      htmlSource('pvda-programme-2024', 'https://www.pvda.be/programma'),
      '<html></html>',
      '2026-07-16T13:00:00.000Z',
    );
    return manifest;
  }

  it('renders a real verdict (auto-id evaluated), no longer NON MATÉRIALISÉ', async () => {
    const manifest = await seedPtbPvda();
    const verdict = await admitPartyFromManifest(
      manifest,
      getExpectedIdentity('ptb-pvda'),
      fileLayerLoader(repoRoot, manifest),
    );
    expect(verdict.status).not.toBe('NOT_MATERIALIZED');
    const level = verdict.reasons.find((r) => r.check === 'auto-id-level');
    const year = verdict.reasons.find((r) => r.check === 'auto-id-year');
    expect(level?.code).not.toBe('level.not-materialized');
    expect(year?.code).not.toBe('year.not-materialized');
    expect(verdict.status).toBe('PASS');
  });

  it('a falsified chapter yields no layer → back to NON MATÉRIALISÉ (fail-closed)', async () => {
    const manifest = await seedPtbPvda();
    // Falsify one chapter in EACH mirror: neither layer can be proven authentic,
    // both parts fall back to non-materialized — the party reverts to NON
    // MATÉRIALISÉ rather than a false verdict.
    const falsified = new Set([
      'ptb-programme-2024-chapitre-introduction',
      'pvda-programme-2024-chapitre-inleiding',
    ]);
    const tampered: SnapshotManifest = {
      ...manifest,
      snapshots: manifest.snapshots.map((s) =>
        falsified.has(s.source_id) ? { ...s, sha256: 'deadbeef'.padEnd(64, '0') } : s,
      ),
    };
    const verdict = await admitPartyFromManifest(
      tampered,
      getExpectedIdentity('ptb-pvda'),
      fileLayerLoader(repoRoot, tampered),
    );
    expect(verdict.status).toBe('NOT_MATERIALIZED');
  });
});
