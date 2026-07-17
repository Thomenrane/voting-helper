/**
 * Changelog presentation (#26) — pure ordering helper between the committed
 * changelog (data/src/changelog.ts) and the /changelog page. No DOM, no I/O.
 */
import type { ChangelogEntry } from '@voting-helper/data';

/**
 * Entries newest first. ISO dates compare lexicographically; entries sharing
 * a date keep their file order reversed (the file is append-only, so later in
 * the file = more recent). The input array is never mutated.
 */
export function sortChangelog(entries: readonly ChangelogEntry[]): ChangelogEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      if (a.entry.date !== b.entry.date) return a.entry.date < b.entry.date ? 1 : -1;
      return b.index - a.index;
    })
    .map(({ entry }) => entry);
}
