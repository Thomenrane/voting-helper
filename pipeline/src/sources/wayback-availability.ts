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
 * - a capture is accepted ONLY when `closest.status === '200'` AND its capture
 *   day falls within the BALLOT WINDOW around 9 June 2024 (`[20240201,
 *   20240731]`) — a mere 2024 capture is not enough: a late-2024 snapshot post-
 *   dates the ballot and may already show the drifted programme;
 * - the availability API is capricious at an exact date (a chapter can report NO
 *   capture at `20240609` yet resolve at `20240701`), so several target dates
 *   near the ballot are tried before concluding absence;
 * - a chapter with no in-window capture after all targets is left UNRESOLVED — it
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
 * are alternative probe dates, NOT a widening of acceptance (the ballot-window
 * guard below is applied to every candidate regardless of the target used).
 */
export const CHAPTER_CAPTURE_TARGETS = ['20240609', '20240701', '20240601', '20240515'] as const;

/**
 * Ballot window (inclusive, `YYYYMMDD`) around the 9 June 2024 federal vote:
 * campaign publication (Feb) → shortly after the ballot (Jul). A capture whose
 * DAY falls outside it is rejected — including a late-2024 snapshot, which post-
 * dates the vote and may already carry the drifted programme. This is the
 * fidelity boundary: the goal is the ballot-time programme, not any 2024 capture.
 */
export const BALLOT_WINDOW_START = '20240201';
export const BALLOT_WINDOW_END = '20240731';

/** A Wayback timestamp is 4–14 digits (`YYYY` … `YYYYMMDDhhmmss`), digits only. */
const TIMESTAMP_PATTERN = /^\d{4,14}$/u;

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

/**
 * Extracts `archived_snapshots.closest`, or `null` when absent/malformed. The
 * `timestamp` must be digits-only (`4–14`); it is interpolated raw into the
 * fetch URL (`web/<ts>id_/…`), so a non-numeric value is rejected here (defense
 * in depth — fail-closed and the host is always web.archive.org anyway).
 */
export function parseAvailabilityClosest(json: unknown): AvailabilityClosest | null {
  if (typeof json !== 'object' || json === null) return null;
  const snapshots = (json as { archived_snapshots?: unknown }).archived_snapshots;
  if (typeof snapshots !== 'object' || snapshots === null) return null;
  const closest = (snapshots as { closest?: unknown }).closest;
  if (typeof closest !== 'object' || closest === null) return null;
  const { status, timestamp } = closest as { status?: unknown; timestamp?: unknown };
  if (typeof status !== 'string' || typeof timestamp !== 'string') return null;
  if (!TIMESTAMP_PATTERN.test(timestamp)) return null;
  return { status, timestamp };
}

/**
 * A closest capture is usable iff it is HTTP 200 AND its capture day falls inside
 * the ballot window `[BALLOT_WINDOW_START, BALLOT_WINDOW_END]`. The comparison is
 * a numeric prefix on the 8-digit day (`YYYYMMDD`) — a shorter/absent day is
 * out of window (fail-closed).
 */
export function isCaptureInBallotWindow(closest: AvailabilityClosest | null): boolean {
  if (closest === null || closest.status !== '200') return false;
  const day = closest.timestamp.slice(0, 8);
  if (!/^\d{8}$/u.test(day)) return false;
  const date = Number(day);
  return date >= Number(BALLOT_WINDOW_START) && date <= Number(BALLOT_WINDOW_END);
}

/**
 * Resolves the nearest in-window Wayback capture timestamp for a canonical URL,
 * or `null` when none is findable after every target fallback (fail-closed —
 * never fabricated). Tries `targets` in order; a target that yields no `closest`,
 * a non-200 `closest`, or a `closest` outside the ballot window falls through to
 * the next; a network error on one target likewise falls through.
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
    if (isCaptureInBallotWindow(closest) && closest !== null) return closest.timestamp;
  }
  return null;
}

/** Outcome of resolving one index's chapters against the Wayback availability API. */
export interface WaybackChapterCrawl {
  /**
   * Snapshot sources for the chapters WITH an in-window capture — each `fetchUrl`
   * is the per-chapter dated `id_` capture, the `originUrl` the canonical page.
   */
  sources: SnapshotSource[];
  /**
   * Slugs with NO in-window capture after all target fallbacks — deliberately not
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
