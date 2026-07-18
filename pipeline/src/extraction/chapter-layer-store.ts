/**
 * Materialization of an HTML programme's per-chapter text layer (#51).
 *
 * Given a committed manifest and the index source id, gathers every snapshotted
 * chapter of that index (source ids prefixed `<index>-chapitre-`), reads each
 * chapter binary from disk, VERIFIES it against the committed SHA-256 (#21),
 * extracts its text (chrome stripped), and assembles the `ProgrammeTextLayer`
 * (chapter = page). This is the HTML sibling of `fileLayerLoader`'s PDF path.
 *
 * Fail-closed and conservative — returns `null` (layer NON MATÉRIALISÉE, never
 * a false verdict) when:
 * - no chapter has been snapshotted yet (crawl not run);
 * - any chapter binary is missing locally (binaries are gitignored; partial
 *   crawl → the layer can't be proven complete);
 * - any chapter is corrupt (its bytes diverge from the committed fingerprint —
 *   a falsified HTML never yields a layer).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  latestSnapshot,
  type SnapshotEntry,
  type SnapshotManifest,
} from '../snapshot/manifest.ts';
import { sha256Hex } from '../snapshot/snapshot-store.ts';
import { chapterSourceIdPrefix } from '../sources/html-chapters.ts';
import { buildHtmlChapterLayer, extractChapterText, type ChapterSnapshot } from './html-text-layer.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

/** Latest snapshot per chapter source id of one index, ordered by source id. */
export function chapterEntries(
  manifest: SnapshotManifest,
  indexSourceId: string,
): SnapshotEntry[] {
  const prefix = chapterSourceIdPrefix(indexSourceId);
  const sourceIds = new Set<string>();
  for (const entry of manifest.snapshots) {
    if (entry.source_id.startsWith(prefix)) sourceIds.add(entry.source_id);
  }
  const entries: SnapshotEntry[] = [];
  for (const sourceId of [...sourceIds].sort((a, b) => a.localeCompare(b))) {
    const latest = latestSnapshot(manifest, sourceId);
    if (latest !== undefined) entries.push(latest);
  }
  return entries;
}

/** `<index>-chapitre-<slug>` → `<slug>`. */
function slugOf(indexSourceId: string, chapterSourceId: string): string {
  return chapterSourceId.slice(chapterSourceIdPrefix(indexSourceId).length);
}

/**
 * Materializes the HTML chapter text layer for one index source, or `null` when
 * it cannot be proven complete-and-authentic (see module header). Reads bytes
 * and verifies each chapter's integrity against the committed #21 fingerprint.
 */
export async function materializeHtmlChapterLayer(
  repoRoot: string,
  manifest: SnapshotManifest,
  indexSourceId: string,
): Promise<ProgrammeTextLayer | null> {
  const entries = chapterEntries(manifest, indexSourceId);
  if (entries.length === 0) return null;
  const chapters: ChapterSnapshot[] = [];
  for (const entry of entries) {
    const absPath = join(repoRoot, entry.file);
    if (!existsSync(absPath)) return null; // partial crawl — never a partial layer
    const bytes = await readFile(absPath);
    if (sha256Hex(bytes) !== entry.sha256) return null; // falsified chapter → no layer
    chapters.push({
      slug: slugOf(indexSourceId, entry.source_id),
      sha256: entry.sha256,
      url: entry.origin_url,
      content: extractChapterText(new TextDecoder().decode(bytes)),
    });
  }
  return buildHtmlChapterLayer(indexSourceId, chapters);
}
