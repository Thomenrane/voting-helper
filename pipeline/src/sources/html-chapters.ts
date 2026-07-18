/**
 * Bounded chapter crawl of an HTML programme index (#51).
 *
 * PTB (`ptb.be/programme`) and PVDA (`pvda.be/programma`) — the unitary party
 * that publishes NO national PDF — expose their programme as a web index that
 * is only a TABLE OF LINKS: the real content lives in one page per chapter
 * (investigation on issue #51: 48 FR + 47 NL chapters, no inline content). The
 * per-page text layer (#22) is PDF-only, so these parties have no text layer
 * and stay NON MATÉRIALISÉ at the admission gate.
 *
 * This module derives, PURELY, the bounded set of chapter sources to snapshot
 * from a committed index snapshot: same origin as the index, one path segment
 * below the index path (`/programme/<slug>`, `/programma/<slug>`), deduplicated,
 * deterministically ordered by slug. The result is a list of `SnapshotSource`s
 * fed to the SAME #21 snapshot machinery as every other source — each chapter
 * becomes a dated, fingerprinted, immutable snapshot. Nothing here touches the
 * network; the crawl itself is the injected fetcher of the snapshot runner.
 */
import type { SnapshotSource } from '../snapshot/manifest.ts';

/** Path-safe slug — chapter slugs end up in snapshot file paths (#21). */
const SAFE_SLUG = /^[a-z0-9-]+$/;

/**
 * Hard cap on chapters discovered from one index — a runaway or hostile index
 * is refused, never crawled unbounded. The known corpus is ~48 chapters/party.
 */
export const MAX_CHAPTERS_PER_INDEX = 200;

export interface ChapterLink {
  /** Last path segment of the chapter URL, e.g. `justice-fiscale`. */
  slug: string;
  /** Absolute chapter URL, origin-normalized against the index. */
  url: string;
}

/** Every `href` value in the HTML (single- or double-quoted). */
function hrefs(html: string): string[] {
  const out: string[] = [];
  const regex = /href\s*=\s*("([^"]*)"|'([^']*)')/giu;
  for (let m = regex.exec(html); m !== null; m = regex.exec(html)) {
    const value = m[2] ?? m[3];
    if (value !== undefined && value.length > 0) out.push(value);
  }
  return out;
}

/**
 * Extracts the bounded, deduplicated, ordered set of chapter links from an
 * index page. A chapter is a link that:
 * - resolves to the SAME origin as the index (no off-domain links);
 * - sits exactly ONE path segment below the index path
 *   (`/programme` → `/programme/<slug>`), so the crawl never recurses;
 * - has a path-safe slug (used verbatim in snapshot file paths).
 *
 * Ordering is lexicographic on slug — deterministic and stable across runs.
 * Throws when the discovered set exceeds `MAX_CHAPTERS_PER_INDEX`.
 */
export function extractChapterLinks(indexHtml: string, indexUrl: string): ChapterLink[] {
  const index = new URL(indexUrl);
  const base = index.pathname.replace(/\/+$/u, ''); // `/programme`
  const prefix = `${base}/`;
  const bySlug = new Map<string, string>();
  for (const raw of hrefs(indexHtml)) {
    let resolved: URL;
    try {
      resolved = new URL(raw, index);
    } catch {
      continue; // malformed href — ignore
    }
    if (resolved.origin !== index.origin) continue;
    const path = resolved.pathname.replace(/\/+$/u, '');
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.length === 0 || rest.includes('/')) continue; // exactly one segment
    if (!SAFE_SLUG.test(rest)) continue;
    // Canonical chapter URL: origin + path, dropping query/hash (a chapter is a
    // page, not a filtered view). First occurrence wins; dedup by slug.
    if (!bySlug.has(rest)) bySlug.set(rest, `${resolved.origin}${path}`);
  }
  const links = [...bySlug.entries()]
    .map(([slug, url]) => ({ slug, url }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  if (links.length > MAX_CHAPTERS_PER_INDEX) {
    throw new Error(
      `Index '${indexUrl}' yields ${links.length} chapter links — exceeds the ` +
        `${MAX_CHAPTERS_PER_INDEX}-chapter crawl bound. Refusing to crawl (registry drift?).`,
    );
  }
  return links;
}

/** Chapter snapshot source id: `<index-source-id>-chapitre-<slug>`. Path-safe. */
export function chapterSourceId(indexSourceId: string, slug: string): string {
  return `${indexSourceId}-chapitre-${slug}`;
}

/** Prefix identifying every chapter snapshot of one index source in the manifest. */
export function chapterSourceIdPrefix(indexSourceId: string): string {
  return `${indexSourceId}-chapitre-`;
}

/**
 * Builds the `SnapshotSource`s for one index's chapters — snapshotted through
 * the ordinary #21 machinery (dated, fingerprinted, immutable). Channel and
 * provenance are inherited from the index source; the media type is `text/html`.
 */
export function buildChapterSources(
  indexSource: SnapshotSource,
  chapters: readonly ChapterLink[],
): SnapshotSource[] {
  return chapters.map((chapter) => ({
    id: chapterSourceId(indexSource.id, chapter.slug),
    label: `${indexSource.label} — chapitre « ${chapter.slug} »`,
    originUrl: chapter.url,
    fetchUrl: chapter.url,
    channel: indexSource.channel,
    mediaType: 'text/html',
    provenance: `${indexSource.provenance} — chapitre crawlé (borné) depuis l'index #51`,
  }));
}
