import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  admitPartyFromManifest,
  fileChapterInventoryLoader,
  fileLayerLoader,
} from '../admission/admission-service.ts';
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
import {
  chapterEntries,
  chapterInventory,
  materializeHtmlChapterLayer,
} from './chapter-layer-store.ts';

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

/** Index HTML listing exactly `slugs` as chapter links (the expected inventory). */
const INDEX_HTML = (path: string, slugs: string[]): string =>
  `<html><body>${slugs.map((s) => `<a href="${path}/${s}">${s}</a>`).join('')}</body></html>`;

/**
 * Seeds an index and the chapter snapshots. The index links `expectedSlugs` when
 * given, else exactly the crawled chapters (complete). Passing MORE expected
 * slugs than crawled models a PARTIAL crawl (incomplete inventory).
 */
async function seedIndexWithChapters(
  indexId: string,
  origin: string,
  path: string,
  chapters: { slug: string; heading: string; body: string }[],
  expectedSlugs?: string[],
): Promise<SnapshotManifest> {
  let manifest = emptyManifest('t', 'n');
  manifest = await seedHtml(
    manifest,
    htmlSource(indexId, `${origin}${path}`),
    INDEX_HTML(path, expectedSlugs ?? chapters.map((c) => c.slug)),
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

  it('returns null on a partial crawl — snapshotted chapters are a strict subset of expected', async () => {
    // Index links 3 chapters; only 2 are snapshotted (the crawl 40/48 case).
    const manifest = await seedIndexWithChapters(
      'ptb-programme-2024',
      'https://www.ptb.be',
      '/programme',
      [
        { slug: 'agriculture', heading: 'Agriculture', body: 'a' },
        { slug: 'justice-fiscale', heading: 'Justice', body: 'b' },
      ],
      ['agriculture', 'justice-fiscale', 'securite-sociale'],
    );
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
    // The pvda index snapshot itself, listing its two chapters.
    manifest = await seedHtml(
      manifest,
      htmlSource('pvda-programme-2024', 'https://www.pvda.be/programma'),
      INDEX_HTML('/programma', ['fiscale-rechtvaardigheid', 'inleiding']),
      '2026-07-16T13:00:00.000Z',
    );
    return manifest;
  }

  it('renders a real verdict (auto-id + chapters-inventory evaluated), no longer NON MATÉRIALISÉ', async () => {
    const manifest = await seedPtbPvda();
    const verdict = await admitPartyFromManifest(
      manifest,
      getExpectedIdentity('ptb-pvda'),
      fileLayerLoader(repoRoot, manifest),
      fileChapterInventoryLoader(repoRoot, manifest),
    );
    expect(verdict.status).not.toBe('NOT_MATERIALIZED');
    const level = verdict.reasons.find((r) => r.check === 'auto-id-level');
    const year = verdict.reasons.find((r) => r.check === 'auto-id-year');
    expect(level?.code).not.toBe('level.not-materialized');
    expect(year?.code).not.toBe('year.not-materialized');
    // Inventaire complet des chapitres (miroir de parts.complete).
    expect(verdict.reasons.find((r) => r.check === 'chapters-inventory')?.code).toBe(
      'chapters.complete',
    );
    expect(verdict.status).toBe('PASS');
  });

  it('crawl PARTIEL (un chapitre attendu manquant) → FAIL chapters.incomplete, JAMAIS un PASS silencieux', async () => {
    // ptb: l'index attend 3 chapitres, seuls 2 sont crawlés (40/48 en miniature).
    let manifest = await seedIndexWithChapters(
      'ptb-programme-2024',
      'https://www.ptb.be',
      '/programme',
      [
        { slug: 'introduction', heading: 'Introduction', body: 'Programme 2024 élections fédérales.' },
        { slug: 'justice-fiscale', heading: 'Justice', body: 'Taxe.' },
      ],
      ['introduction', 'justice-fiscale', 'securite-sociale'], // 3 attendus, 1 manquant
    );
    // pvda complet, pour isoler l'incomplétude sur ptb.
    for (const chapter of [
      { slug: 'inleiding', heading: 'Inleiding', body: 'Programma 2024 federale verkiezingen.' },
    ]) {
      manifest = await seedHtml(
        manifest,
        htmlSource(chapterSourceId('pvda-programme-2024', chapter.slug), `https://www.pvda.be/programma/${chapter.slug}`),
        CHAPTER(chapter.heading, chapter.body),
        '2026-07-16T13:10:00.000Z',
      );
    }
    manifest = await seedHtml(
      manifest,
      htmlSource('pvda-programme-2024', 'https://www.pvda.be/programma'),
      INDEX_HTML('/programma', ['inleiding']),
      '2026-07-16T13:00:00.000Z',
    );

    const verdict = await admitPartyFromManifest(
      manifest,
      getExpectedIdentity('ptb-pvda'),
      fileLayerLoader(repoRoot, manifest),
      fileChapterInventoryLoader(repoRoot, manifest),
    );
    expect(verdict.status).not.toBe('PASS'); // le point du MAJOR : jamais PASS sur incomplet
    expect(verdict.status).toBe('FAIL');
    const chapters = verdict.reasons.find((r) => r.check === 'chapters-inventory');
    expect(chapters?.code).toBe('chapters.incomplete');
    expect(chapters?.human).toContain('securite-sociale'); // slug manquant listé (transparent)
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
      fileChapterInventoryLoader(repoRoot, tampered),
    );
    expect(verdict.status).toBe('NOT_MATERIALIZED');
  });
});

describe('materialization over a WAYBACK index (#58) — encapsulated hrefs', () => {
  const ORIGIN = 'https://www.ptb.be';
  const PATH = '/programme';
  /** Wayback capture of the index whose chapter hrefs are wrapped in the replay
   * envelope — absolute web.archive.org for even slugs, host-relative for odd. */
  const WAYBACK_INDEX_HTML = (slugs: string[], ts = '20240609id_'): string =>
    `<html><body>${slugs
      .map((s, i) =>
        i % 2 === 0
          ? `<a href="https://web.archive.org/web/${ts}/${ORIGIN}${PATH}/${s}">${s}</a>`
          : `<a href="/web/${ts}/${ORIGIN}${PATH}/${s}">${s}</a>`,
      )
      .join('')}</body></html>`;

  /** Seeds a Wayback index (encapsulated hrefs) and its snapshotted chapters. */
  async function seedWaybackIndex(
    chapters: { slug: string; heading: string; body: string }[],
    expectedSlugs?: string[],
  ): Promise<SnapshotManifest> {
    let manifest = emptyManifest('t', 'n');
    manifest = await seedHtml(
      manifest,
      htmlSource('ptb-programme-2024', `${ORIGIN}${PATH}`),
      WAYBACK_INDEX_HTML(expectedSlugs ?? chapters.map((c) => c.slug)),
      '2026-07-16T13:00:00.000Z',
    );
    for (const chapter of chapters) {
      manifest = await seedHtml(
        manifest,
        htmlSource(chapterSourceId('ptb-programme-2024', chapter.slug), `${ORIGIN}${PATH}/${chapter.slug}`),
        CHAPTER(chapter.heading, chapter.body),
        '2026-07-16T13:10:00.000Z',
      );
    }
    return manifest;
  }

  it('derives the expected inventory from a Wayback index and materializes the layer', async () => {
    const manifest = await seedWaybackIndex([
      { slug: 'justice-fiscale', heading: 'Justice fiscale', body: 'Taxe des riches.' },
      { slug: 'agriculture', heading: 'Agriculture', body: 'Soutien aux paysans.' },
    ]);
    // The expected inventory is re-derived from the encapsulated index hrefs.
    const inventory = await chapterInventory(repoRoot, manifest, 'ptb-programme-2024');
    expect(inventory?.expected).toEqual(['agriculture', 'justice-fiscale']);
    expect(inventory?.missing).toEqual([]);
    const layer = await materializeHtmlChapterLayer(repoRoot, manifest, 'ptb-programme-2024');
    expect(layer?.page_count).toBe(2);
    expect(layer?.pages[1]?.text).toContain('Taxe des riches');
  });

  it('a partial crawl over a Wayback index → null and lists the missing slug (guardrail #51 preserved)', async () => {
    const manifest = await seedWaybackIndex(
      [
        { slug: 'agriculture', heading: 'Agriculture', body: 'a' },
        { slug: 'justice-fiscale', heading: 'Justice', body: 'b' },
      ],
      ['agriculture', 'justice-fiscale', 'securite-sociale'], // 3 attendus, 1 non crawlé
    );
    const inventory = await chapterInventory(repoRoot, manifest, 'ptb-programme-2024');
    expect(inventory?.missing).toEqual(['securite-sociale']);
    expect(await materializeHtmlChapterLayer(repoRoot, manifest, 'ptb-programme-2024')).toBeNull();
  });

  it('a falsified chapter under a Wayback index → null (fail-closed)', async () => {
    const manifest = await seedWaybackIndex([
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
