/**
 * Load-or-derive of attested text layers.
 *
 * For each raw programme source: reuse the latest derived `<id>-text`
 * snapshot when it verifies against its committed fingerprint AND derives
 * from the current raw content (source_sha256); otherwise derive it from the
 * verified raw bytes and attest it in the manifest (kind: derived, quality
 * counters). Identical content dedups via the #21 manifest machinery, and a
 * locally missing derived file (fresh clone) is transparently re-derived.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  appendSnapshot,
  buildSnapshotEntry,
  latestSnapshot,
  verifySnapshotIntegrity,
  type SnapshotEntry,
  type SnapshotManifest,
  type SnapshotSource,
} from '../snapshot/manifest.ts';
import { sha256Hex, writeSnapshotFile } from '../snapshot/snapshot-store.ts';
import { materializeHtmlChapterLayer } from './chapter-layer-store.ts';
import type { LayerInput } from './position-extractor.ts';
import {
  buildTextLayer,
  parseTextLayer,
  serializeTextLayer,
  summarizeTextLayerQuality,
  textLayerSource,
} from './text-layer.ts';

const SNAPSHOTS_DIR = 'data/snapshots/programmes';

export interface EnsuredTextLayer {
  input: LayerInput;
  /** Manifest entry attesting the layer. */
  entry: SnapshotEntry;
  /** True when this call derived (and attested) a new layer version. */
  created: boolean;
}

export interface EnsureTextLayerResult {
  layer: EnsuredTextLayer;
  manifest: SnapshotManifest;
}

async function readSnapshotBytes(repoRoot: string, entry: SnapshotEntry): Promise<Uint8Array> {
  const absPath = join(repoRoot, entry.file);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(absPath);
  } catch (cause) {
    throw new Error(
      `Snapshot file '${entry.file}' is missing locally (binaries are gitignored). ` +
        `Run 'npm run snapshot:programmes' to re-materialize it.`,
      { cause },
    );
  }
  verifySnapshotIntegrity(entry, sha256Hex(bytes));
  return bytes;
}

export interface EnsureTextLayerOptions {
  /**
   * When false (dry-run), a missing layer is derived IN MEMORY only: the
   * manifest is returned untouched and nothing is written to disk. An
   * existing attested layer is still reused. Default: true.
   */
  persist?: boolean;
}

export async function ensureTextLayer(
  repoRoot: string,
  manifest: SnapshotManifest,
  source: SnapshotSource,
  now: () => Date = () => new Date(),
  options: EnsureTextLayerOptions = {},
): Promise<EnsureTextLayerResult> {
  const persist = options.persist ?? true;
  // Sources HTML des chapitres web (#51) : couche assemblée par chapitre depuis
  // les snapshots de chapitres, structure `ProgrammeTextLayer` identique à celle
  // du PDF — l'extraction (#25) reste agnostique à la source. Aucune couche
  // dérivée `<id>-text` n'est persistée : la couche est reconstruite depuis les
  // snapshots de chapitres épinglés (intégrité SHA-256 par page), déterministe.
  if (source.mediaType === 'text/html') {
    return ensureHtmlTextLayer(repoRoot, manifest, source);
  }
  if (source.mediaType !== 'application/pdf') {
    throw new Error(
      `Source '${source.id}' is ${source.mediaType} — the per-page text layer only covers PDF ` +
        'programmes and web-chapter HTML indexes (#51).',
    );
  }
  const raw = latestSnapshot(manifest, source.id);
  if (raw === undefined) {
    throw new Error(
      `Source '${source.id}' was never snapshotted. Run 'npm run snapshot:programmes' first.`,
    );
  }

  const derivedId = `${source.id}-text`;
  const existing = latestSnapshot(manifest, derivedId);
  if (existing !== undefined) {
    try {
      const bytes = await readSnapshotBytes(repoRoot, existing);
      const layer = parseTextLayer(bytes, existing.file);
      if (layer.source_sha256 === raw.sha256) {
        return {
          manifest,
          layer: {
            input: { layer, raw_snapshot_id: raw.snapshot_id, url_source: source.originUrl },
            entry: existing,
            created: false,
          },
        };
      }
      // Raw content changed since this layer was derived — fall through.
    } catch {
      // Missing or unreadable local derived file — fall through and re-derive
      // (identical content will dedup against the committed fingerprint).
    }
  }

  const rawBytes = await readSnapshotBytes(repoRoot, raw);
  const layer = await buildTextLayer(source.id, raw.sha256, rawBytes);
  const bytes = serializeTextLayer(layer);
  const entry = buildSnapshotEntry({
    source: textLayerSource(source),
    kind: 'derived',
    retrievedAt: now().toISOString(),
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
    snapshotsDir: SNAPSHOTS_DIR,
    quality: summarizeTextLayerQuality(layer),
  });
  const input = { layer, raw_snapshot_id: raw.snapshot_id, url_source: source.originUrl };
  if (!persist) {
    return { manifest, layer: { input, entry, created: true } };
  }
  const nextManifest = appendSnapshot(manifest, entry);
  const appended = nextManifest.snapshots[nextManifest.snapshots.length - 1];
  if (appended === undefined) {
    throw new Error(`Manifest append produced no entry for derived source '${derivedId}'.`);
  }
  await writeSnapshotFile(repoRoot, appended, bytes);
  return {
    manifest: nextManifest,
    layer: { input, entry: appended, created: true },
  };
}

/**
 * Materializes an HTML web-chapter source's text layer (#51) from its pinned
 * chapter snapshots — one chapter = one page, each anchored to its own SHA-256.
 * The manifest is returned untouched (nothing is derived-and-attested: the
 * layer is a deterministic reconstruction from the chapter snapshots). The
 * layer's citation provenance points at the index snapshot; per-page
 * `source_sha256` carries the true chapter integrity.
 *
 * Throws with an actionable message when the chapters are not (fully/authentic-
 * ally) snapshotted — the crawl must run first (`npm run snapshot:programme-chapters`).
 */
async function ensureHtmlTextLayer(
  repoRoot: string,
  manifest: SnapshotManifest,
  source: SnapshotSource,
): Promise<EnsureTextLayerResult> {
  const raw = latestSnapshot(manifest, source.id);
  if (raw === undefined) {
    throw new Error(
      `Source '${source.id}' was never snapshotted. Run 'npm run snapshot:programmes' first.`,
    );
  }
  const layer = await materializeHtmlChapterLayer(repoRoot, manifest, source.id);
  if (layer === null) {
    throw new Error(
      `HTML source '${source.id}' has no materializable text layer: its chapter snapshots are ` +
        'missing, incomplete, or corrupt. Run ' +
        `'npm run snapshot:programme-chapters -- --source ${source.id}' to crawl and snapshot ` +
        'the chapters (bounded, same-domain), then retry.',
    );
  }
  const input = { layer, raw_snapshot_id: raw.snapshot_id, url_source: source.originUrl };
  return { manifest, layer: { input, entry: raw, created: false } };
}
