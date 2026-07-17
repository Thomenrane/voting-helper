import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from '@voting-helper/data';
import { sortChangelog } from './changelog-view.ts';

function entry(date: string, titre_fr: string): ChangelogEntry {
  return {
    date,
    kind: 'positions',
    titre_fr,
    titre_nl: titre_fr,
    detail_fr: 'Détail',
    detail_nl: 'Detail',
    url_preuve: 'https://example.org/pr',
  };
}

describe('sortChangelog', () => {
  it('orders entries newest first', () => {
    const sorted = sortChangelog([
      entry('2026-07-16', 'ancien'),
      entry('2026-07-17', 'récent'),
      entry('2026-06-01', 'plus ancien'),
    ]);
    expect(sorted.map((e) => e.titre_fr)).toEqual(['récent', 'ancien', 'plus ancien']);
  });

  it('puts the later file entry first among same-date entries (append-only file)', () => {
    const sorted = sortChangelog([
      entry('2026-07-16', 'premier du fichier'),
      entry('2026-07-16', 'second du fichier'),
    ]);
    expect(sorted.map((e) => e.titre_fr)).toEqual(['second du fichier', 'premier du fichier']);
  });

  it('does not mutate the input array', () => {
    const input = [entry('2026-07-16', 'a'), entry('2026-07-17', 'b')];
    sortChangelog(input);
    expect(input.map((e) => e.titre_fr)).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty changelog', () => {
    expect(sortChangelog([])).toEqual([]);
  });
});
