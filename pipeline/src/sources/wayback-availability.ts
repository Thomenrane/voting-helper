/**
 * Per-chapter Wayback capture resolution (#58) — the NETWORK step of the chapter
 * crawl, isolated behind an injected fetcher so it is unit-testable offline.
 *
 * WHY per-chapter (not per-index): the programme index and its chapter pages are
 * NOT captured by the Internet Archive at the same instant. Dating a chapter
 * from the index's capture timestamp (`web/<index-ts>id_/<chapter>`) returns 403
 * — the exact capture does not exist — so every chapter would fail and the crawl
 * would be empty. Each chapter DOES have its own capture near the 9 June 2024
 * ballot; we resolve it through the Wayback availability API
 * (`archive.org/wayback/available?url=<chapter>&timestamp=<target>`), which
 * returns `archived_snapshots.closest`.
 *
 * FAIL-CLOSED, never fabricated:
 * - a capture is accepted ONLY when `closest.status === '200'` AND its timestamp
 *   is within the 2024 ballot year (`startsWith('2024')`);
 * - the availability API is capricious at an exact date (a chapter can report NO
 *   capture at `20240609` yet resolve at `20240701`), so several target dates
 *   near the ballot are tried before concluding absence;
 * - a chapter with no in-2024 capture after all targets is left UNRESOLVED — it
 *   is simply not snapshotted, so the committed index still expects it and the
 *   `chapters-inventory` check (#51) counts it missing → FAIL, never a silent
 *   PASS over a truncated programme.
 */
import type { SnapshotSource } from '../snapshot/manifest.ts';
import { chapterSnapshotSource, type ChapterLink } from './html-chapters.ts';
import { buildWaybackUrl } from './wayback.ts';

/**
 * Target capture dates tried in order, nearest the 9 June 2024 federal ballot
 * first. Fallbacks absorb the availability API's caprice at an exact date — they
 * are alternative probe dates, NOT a widening of the accepted year (the 2024
 * millésime guard below is applied to every candidate regardless of target).
 */
export const CHAPTER_CAPTURE_TARGETS = ['20240609', '20240701', '20240601', '20240515'] as const;

/** Ballot year — a capture is only accepted when its timestamp falls in it. */
export const CAPTURE_YEAR_PREFIX = '2024';

/** The `archived_snapshots.closest` shape we consume from the availability API. */
export interface AvailabilityClosest {
  /** HTTP status of the archived capture, as a string (e.g. `'200'`). */
  status: string;
  /** Capture timestamp, `YYYYMMDDhhmmss`. */
  timestamp: string;
}

/**
 * Fetches an availability API URL and returns its parsed JSON. Injected so the
 * resolver stays offline-testable; the command wires it to the app's `fetchBytes`.
 */
export type AvailabilityFetcher = (url: string) => Promise<unknown>;

/** Availability API URL for a canonical origin URL at a target timestamp. */
export function buildAvailabilityUrl(originUrl: string, timestamp: string): string {
  return `https://archive.org/wayback/available?url=${encodeURIComponent(originUrl)}&timestamp=${timestamp}`;
}

/** Extracts `archived_snapshots.closest`, or `null` when absent/malformed. */
export function parseAvailabilityClosest(json: unknown): AvailabilityClosest | null {
  if (typeof json !== 'object' || json === null) return null;
  const snapshots = (json as { archived_snapshots?: unknown }).archived_snapshots;
  if (typeof snapshots !== 'object' || snapshots === null) return null;
  const closest = (snapshots as { closest?: unknown }).closest;
  if (typeof closest !== 'object' || closest === null) return null;
  const { status, timestamp } = closest as { status?: unknown; timestamp?: unknown };
  if (typeof status !== 'string' || typeof timestamp !== 'string') return null;
  return { status, timestamp };
}

/** A closest capture is usable iff it is HTTP 200 AND within the 2024 ballot year. */
export function isCaptureInBallotYear(closest: AvailabilityClosest | null): boolean {
  return (
    closest !== null && closest.status === '200' && closest.timestamp.startsWith(CAPTURE_YEAR_PREFIX)
  );
}

/**
 * Resolves the nearest in-2024 Wayback capture timestamp for a canonical URL, or
 * `null` when none is findable after every target fallback (fail-closed — never
 * fabricated). Tries `targets` in order; a target that yields no `closest`, a
 * non-200 `closest`, or an out-of-2024 `closest` falls through to the next; a
 * network error on one target likewise falls through.
 */
export async function resolveChapterCapture(
  originUrl: string,
  fetchJson: AvailabilityFetcher,
  targets: readonly string[] = CHAPTER_CAPTURE_TARGETS,
): Promise<string | null> {
  for (const target of targets) {
    let json: unknown;
    try {
      json = await fetchJson(buildAvailabilityUrl(originUrl, target));
    } catch {
      continue; // transient availability hiccup on this target — try the next
    }
    const closest = parseAvailabilityClosest(json);
    if (isCaptureInBallotYear(closest) && closest !== null) return closest.timestamp;
  }
  return null;
}

/** Outcome of resolving one index's chapters against the Wayback availability API. */
export interface WaybackChapterCrawl {
  /**
   * Snapshot sources for the chapters WITH an in-2024 capture — each `fetchUrl`
   * is the per-chapter dated `id_` capture, the `originUrl` the canonical page.
   */
  sources: SnapshotSource[];
  /**
   * Slugs with NO in-2024 capture after all target fallbacks — deliberately not
   * snapshotted, so the committed index still expects them and `chapters-inventory`
   * (#51) counts them missing → FAIL (fail-closed, never a silent PASS).
   */
  unavailable: string[];
}

/**
 * Resolves a per-chapter dated Wayback capture for every extracted chapter link
 * and builds the snapshot sources for the ones that resolve, listing the rest as
 * `unavailable`. The crawl bounds have already been applied on the decoded
 * canonical origin by `extractChapterLinks`; here each canonical chapter URL is
 * wrapped in its OWN resolved capture (`web/<ts>id_/<canonical-url>`).
 */
export async function resolveWaybackChapterSources(
  indexSource: SnapshotSource,
  links: readonly ChapterLink[],
  fetchJson: AvailabilityFetcher,
  targets: readonly string[] = CHAPTER_CAPTURE_TARGETS,
): Promise<WaybackChapterCrawl> {
  const sources: SnapshotSource[] = [];
  const unavailable: string[] = [];
  for (const link of links) {
    const timestamp = await resolveChapterCapture(link.url, fetchJson, targets);
    if (timestamp === null) {
      unavailable.push(link.slug);
      continue;
    }
    sources.push(
      chapterSnapshotSource(indexSource, link.slug, link.url, buildWaybackUrl(timestamp, link.url)),
    );
  }
  return { sources, unavailable };
}
