/**
 * Double versioning (#26) — methodology version + data date, displayed on the
 * results screen and the transparency pages (and later on the share image).
 *
 * The data date is DERIVED from the committed data (latest revision of a
 * position or latest changelog entry), never from the build clock: the same
 * commit always builds the same date, whatever day the build runs.
 */
import type { ChangelogEntry, PartyPosition } from '@voting-helper/data';

/**
 * Version of the published scoring methodology — the formula on the
 * /methodologie page and the engine (scoring.ts) at this version are the
 * same, golden-tested formula. Bump ONLY when the methodology itself changes
 * (scale, mapping, distance, exclusions, thresholds), never for data updates:
 * those move the data date instead.
 */
export const METHODOLOGY_VERSION = 'v1';

/**
 * Latest ISO date carried by the data itself: the most recent position
 * review (`derniere_revision`) or changelog entry. ISO dates (YYYY-MM-DD)
 * compare lexicographically. Returns null when both sources are empty —
 * callers display the locale's « n.d. », never a fabricated date.
 */
export function deriveDataDate(
  positions: readonly PartyPosition[],
  changelog: readonly ChangelogEntry[],
): string | null {
  let latest: string | null = null;
  for (const date of [
    ...positions.map((p) => p.derniere_revision),
    ...changelog.map((entry) => entry.date),
  ]) {
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}
