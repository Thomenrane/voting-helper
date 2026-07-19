/**
 * `npm run snapshot:programme-chapters [-- --source <index-source-id>]`
 *
 * Bounded chapter crawl of the HTML programme indexes (#51). PTB/PVDA publish
 * no national PDF: their programme is a web INDEX of per-chapter pages. This
 * command reads the committed index snapshot (#21), extracts the bounded set of
 * chapter links (same origin, one path segment below the index path), and
 * snapshots each chapter through the SAME #21 machinery — dated, fingerprinted,
 * immutable. Once crawled, `admit:report` materializes the per-chapter text
 * layer and renders a real verdict, and `extract:positions` can harvest them.
 *
 * Network is required for the crawl itself (the chapter pages are fetched); the
 * index bytes are read from the local snapshot. A failing chapter never
 * truncates the run silently — successes are recorded, then the command exits
 * non-zero naming every failure (same contract as snapshot:programmes).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { fetchBytes } from '../snapshot/fetcher.ts';
import {
  emptyManifest,
  latestSnapshot,
  verifySnapshotIntegrity,
  type SnapshotManifest,
  type SnapshotSource,
} from '../snapshot/manifest.ts';
import { snapshotSources } from '../snapshot/snapshot-runner.ts';
import {
  loadManifest,
  saveManifest,
  sha256Hex,
  writeSnapshotFile,
} from '../snapshot/snapshot-store.ts';
import { buildChapterSources, extractChapterLinks } from '../sources/html-chapters.ts';
import { PROGRAMME_SOURCES } from '../sources/programmes.sources.ts';
import {
  resolveWaybackChapterSources,
  type AvailabilityFetcher,
} from '../sources/wayback-availability.ts';
import {
  assertChaptersComplete,
  fail,
  reportRun,
  resolveRepoRoot,
  type UnavailableChapters,
} from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const SNAPSHOTS_DIR = 'data/snapshots/programmes';

/** Wayback availability API timeout — small JSON, but the API can be slow. */
const AVAILABILITY_TIMEOUT_MS = 60_000;

/**
 * The app's network path for the availability API (#58): fetch the JSON via the
 * same `fetchBytes` as every other snapshot fetch, then parse. Any failure
 * propagates as a thrown error, which `resolveChapterCapture` treats as "this
 * target unavailable" and falls through to the next target date.
 */
const fetchAvailabilityJson: AvailabilityFetcher = async (url) => {
  const bytes = await fetchBytes(url, AVAILABILITY_TIMEOUT_MS);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

/**
 * Resolves the chapter snapshot sources for one index. Wayback indexes (#58)
 * resolve a dated capture PER CHAPTER through the availability API (chapters are
 * not captured at the index's instant); a chapter with no in-2024 capture is
 * skipped (fail-closed → `chapters-inventory` counts it missing → FAIL). Live
 * indexes fetch each chapter from its canonical URL.
 */
async function crawlChapterSources(
  indexSource: SnapshotSource,
  links: ReturnType<typeof extractChapterLinks>,
): Promise<{ sources: SnapshotSource[]; unavailable: string[] }> {
  if (indexSource.channel !== 'wayback') {
    return { sources: buildChapterSources(indexSource, links), unavailable: [] };
  }
  const { sources, unavailable } = await resolveWaybackChapterSources(
    indexSource,
    links,
    fetchAvailabilityJson,
  );
  if (unavailable.length > 0) {
    console.warn(
      `⚠︎ ${unavailable.length}/${links.length} chapter(s) of '${indexSource.id}' have no in-window ` +
        `Wayback capture — skipped (chapters-inventory will FAIL until resolved): ${unavailable.join(', ')}`,
    );
  }
  return { sources, unavailable };
}

/** The committed index HTML bytes, integrity-verified against the manifest. */
async function readIndexHtml(
  repoRoot: string,
  manifest: SnapshotManifest,
  indexSource: SnapshotSource,
): Promise<string> {
  const raw = latestSnapshot(manifest, indexSource.id);
  if (raw === undefined) {
    throw new Error(
      `Index '${indexSource.id}' was never snapshotted. Run 'npm run snapshot:programmes' first.`,
    );
  }
  const bytes = await readFile(join(repoRoot, raw.file));
  verifySnapshotIntegrity(raw, sha256Hex(bytes));
  return new TextDecoder().decode(bytes);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { source: { type: 'string' } } });
  const htmlSources = PROGRAMME_SOURCES.filter((source) => source.mediaType === 'text/html');
  const targets =
    values.source === undefined
      ? htmlSources
      : htmlSources.filter((source) => source.id === values.source);
  if (targets.length === 0) {
    const known = htmlSources.map((source) => source.id).join(', ');
    throw new Error(
      values.source === undefined
        ? 'No HTML programme index in the registry to crawl.'
        : `'${values.source}' is not an HTML programme index. Known: ${known}.`,
    );
  }

  const repoRoot = resolveRepoRoot();
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  let manifest = await loadManifest(manifestPath, emptyManifest('', ''));
  if (manifest.snapshots.length === 0) {
    throw new Error(`No programme snapshots recorded. Run 'npm run snapshot:programmes' first.`);
  }

  const succeeded: SnapshotManifest['snapshots'] = [];
  const failed = [];
  const unavailableByIndex: UnavailableChapters[] = [];
  for (const indexSource of targets) {
    const indexHtml = await readIndexHtml(repoRoot, manifest, indexSource);
    const links = extractChapterLinks(indexHtml, indexSource.originUrl);
    const { sources: chapterSources, unavailable } = await crawlChapterSources(indexSource, links);
    if (unavailable.length > 0) {
      unavailableByIndex.push({ indexId: indexSource.id, slugs: unavailable });
    }
    console.log(`Crawling ${chapterSources.length} chapter(s) of '${indexSource.id}'…`);
    const result = await snapshotSources({
      sources: chapterSources,
      manifest,
      kind: 'raw',
      snapshotsDir: SNAPSHOTS_DIR,
      fetchBytes,
      persistSnapshot: (entry, bytes) => writeSnapshotFile(repoRoot, entry, bytes),
    });
    manifest = result.manifest;
    succeeded.push(...result.succeeded);
    failed.push(...result.failed);
  }
  await saveManifest(manifestPath, manifest);
  reportRun({ manifest, succeeded, failed }, MANIFEST_RELATIVE_PATH);
  // Successes are now persisted; surface any crawl-time incompleteness with a
  // non-zero exit so the operator sees it immediately, not only at admission (#58).
  assertChaptersComplete(unavailableByIndex);
}

main().catch(fail);
