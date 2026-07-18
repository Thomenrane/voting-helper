/**
 * Materialization of an HTML programme's per-chapter text layer (#51).
 *
 * Given a committed manifest and the index source id, gathers every snapshotted
 * chapter of that index (source ids prefixed `<index>-chapitre-`), reads each
 * chapter binary from disk, VERIFIES it against the committed SHA-256 (#21),
 * extracts its text (chrome stripped), and assembles the `ProgrammeTextLayer`
 * (chapter = page). This is the HTML sibling of `fileLayerLoader`'s PDF path.
 *
 * COMPLETENESS is enforced here — the single choke point both admission and
 * extraction go through — so a partial crawl can never silently yield a layer
 * over an INCOMPLETE programme: the EXPECTED chapter inventory is re-derived
 * from the committed index snapshot (`extractChapterLinks`), and materialization
 * refuses any strict subset. Transparency (which slugs are missing) is published
 * separately by the `chapters-inventory` admission check, which consumes
 * `chapterInventory` below.
 *
 * Fail-closed and conservative — returns `null` (layer NON MATÉRIALISÉE, never
 * a false verdict) when:
 * - no chapter has been snapshotted yet (crawl not run);
 * - the expected inventory can't be established (index binary absent/corrupt);
 * - the snapshotted chapters are a strict subset of the expected ones
 *   (partial crawl — proven incomplete);
 * - any chapter binary is missing locally (binaries are gitignored);
 * - any chapter is corrupt (its bytes diverge from the committed fingerprint —
 *   a falsified HTML never yields a layer).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  latestSnapshot,
  verifySnapshotIntegrity,
  type SnapshotEntry,
  type SnapshotManifest,
} from '../snapshot/manifest.ts';
import { sha256Hex } from '../snapshot/snapshot-store.ts';
import { chapterSourceIdPrefix, extractChapterLinks } from '../sources/html-chapters.ts';
import type { ChapterInventory } from '../admission/completeness.ts';
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
 * Derives the chapter inventory (`ChapterInventory`, defined in the admission
 * completeness module) for one index source, or `null` when it cannot
 * be established — the index snapshot is missing, its binary is absent locally
 * (binaries gitignored), corrupt, or lists no chapter. Reading the committed
 * index snapshot (integrity-verified) is the single source of truth for the
 * EXPECTED chapters, consistent with "materialize from pinned snapshots".
 */
export async function chapterInventory(
  repoRoot: string,
  manifest: SnapshotManifest,
  indexSourceId: string,
): Promise<ChapterInventory | null> {
  const index = latestSnapshot(manifest, indexSourceId);
  if (index === undefined) return null;
  const absPath = join(repoRoot, index.file);
  if (!existsSync(absPath)) return null;
  const bytes = await readFile(absPath);
  try {
    verifySnapshotIntegrity(index, sha256Hex(bytes));
  } catch {
    return null;
  }
  let expected: string[];
  try {
    expected = extractChapterLinks(new TextDecoder().decode(bytes), index.origin_url).map(
      (link) => link.slug,
    );
  } catch {
    return null; // e.g. crawl-bound exceeded — inventory not establishable
  }
  if (expected.length === 0) return null;
  const present = chapterEntries(manifest, indexSourceId).map((entry) =>
    slugOf(indexSourceId, entry.source_id),
  );
  const presentSet = new Set(present);
  const expectedSorted = [...expected].sort((a, b) => a.localeCompare(b));
  return {
    expected: expectedSorted,
    present: [...present].sort((a, b) => a.localeCompare(b)),
    missing: expectedSorted.filter((slug) => !presentSet.has(slug)),
  };
}

/**
 * Materializes the HTML chapter text layer for one index source, or `null` when
 * it cannot be proven complete-and-authentic (see module header). Enforces the
 * chapter inventory (no strict subset) then verifies each chapter's integrity
 * against the committed #21 fingerprint.
 */
export async function materializeHtmlChapterLayer(
  repoRoot: string,
  manifest: SnapshotManifest,
  indexSourceId: string,
): Promise<ProgrammeTextLayer | null> {
  const inventory = await chapterInventory(repoRoot, manifest, indexSourceId);
  // No establishable inventory, or a strict subset snapshotted (partial crawl):
  // never materialize a layer over a provably-incomplete programme (fail-closed).
  if (inventory === null || inventory.present.length === 0 || inventory.missing.length > 0) {
    return null;
  }
  const entries = chapterEntries(manifest, indexSourceId);
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
