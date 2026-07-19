/**
 * Wayback Machine URL envelope helpers (#58) — pure, no I/O.
 *
 * A Wayback replay URL wraps a canonical origin URL in a dated envelope:
 *
 *     https://web.archive.org/web/<timestamp><modifier>/<origin-url>
 *
 * where `<timestamp>` is 1–14 digits (`YYYYMMDDhhmmss`, possibly truncated to a
 * DATE TARGET — Wayback then redirects to the nearest real capture) and
 * `<modifier>` is an optional two-letter replay flag followed by an underscore
 * (`id_` = identity / raw archived bytes, `if_`, `im_`, …). We always snapshot
 * with `id_`: the raw original bytes, so the SHA-256 fingerprints the ORIGINAL
 * document, never Wayback's rewritten replay chrome.
 *
 * PTB-PVDA are sourced from mid-2024 captures (#58): the crawl bounds
 * (`extractChapterLinks`) must apply to the DECODED canonical origin URL, never
 * to the `web.archive.org` host, and each chapter is fetched from the SAME dated
 * capture as its index. This module is the single place the envelope is parsed,
 * decoded, and rebuilt.
 */

const WAYBACK_HOST = 'web.archive.org';

/**
 * `/web/<ts><mod>/<target>` anywhere in the string. The host prefix
 * (`https://web.archive.org`) is optional so host-relative replay hrefs
 * (`/web/…`, as Wayback rewrites them) parse too. `<target>` is greedy — it
 * captures the wrapped URL verbatim, including any query string.
 */
const WAYBACK_ENVELOPE = /\/web\/(\d{1,14})([a-z]{2}_)?\/(.+)$/iu;

export interface WaybackParts {
  /** Capture timestamp, 1–14 digits (`20240609id_` → `20240609`). */
  timestamp: string;
  /** Replay modifier including its trailing underscore (`id_`), or `''`. */
  modifier: string;
  /** The wrapped URL (the canonical origin document, when absolute). */
  target: string;
}

/**
 * Parses a Wayback replay URL into its parts, or `null` when `url` is not a
 * Wayback envelope. Accepts the absolute form
 * (`https://web.archive.org/web/…`) and the host-relative form (`/web/…`).
 */
export function parseWaybackUrl(url: string): WaybackParts | null {
  const match = WAYBACK_ENVELOPE.exec(url);
  if (match === null) return null;
  const [, timestamp, modifier, target] = match;
  if (timestamp === undefined || target === undefined) return null;
  return { timestamp, modifier: modifier ?? '', target };
}

/**
 * Decodes a Wayback-encapsulated URL to its canonical origin target. A URL that
 * is NOT a Wayback envelope is returned UNCHANGED — so a caller can pass any
 * `href` and get back the origin URL to bound the crawl on (#58). Only decodes
 * when the wrapped target is itself an absolute `http(s)` URL (an encapsulated
 * origin link); a relative wrapped target has no canonical origin to decode to
 * and is left as-is (it will fail the same-origin bound downstream, fail-closed).
 */
export function decodeWaybackUrl(url: string): string {
  const parts = parseWaybackUrl(url);
  if (parts === null) return url;
  return /^https?:\/\//iu.test(parts.target) ? parts.target : url;
}

/**
 * Builds a Wayback replay URL wrapping `targetUrl` at `timestamp` with the given
 * `modifier` (default `id_` — raw identity bytes, what the snapshotter fetches
 * to fingerprint the ORIGINAL document). `timestamp` may be a full 14-digit
 * capture id or a shorter DATE TARGET (e.g. `20240609`): Wayback redirects a
 * date target to the nearest real capture.
 */
export function buildWaybackUrl(timestamp: string, targetUrl: string, modifier = 'id_'): string {
  return `https://${WAYBACK_HOST}/web/${timestamp}${modifier}/${targetUrl}`;
}
