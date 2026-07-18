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
import { fail, reportRun, resolveRepoRoot } from './command-support.ts';

const MANIFEST_RELATIVE_PATH = 'data/manifests/programmes.manifest.json';
const SNAPSHOTS_DIR = 'data/snapshots/programmes';

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
  for (const indexSource of targets) {
    const indexHtml = await readIndexHtml(repoRoot, manifest, indexSource);
    const links = extractChapterLinks(indexHtml, indexSource.originUrl);
    const chapterSources = buildChapterSources(indexSource, links);
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
}

main().catch(fail);
