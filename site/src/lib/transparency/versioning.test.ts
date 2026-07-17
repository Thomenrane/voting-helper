import { describe, expect, it } from 'vitest';
import type { ChangelogEntry, PartyPosition } from '@voting-helper/data';
import { deriveDataDate, METHODOLOGY_VERSION } from './versioning.ts';

function position(derniere_revision: string): PartyPosition {
  return {
    party_id: 'parti-x',
    statement_id: 's1',
    votes_lies: [],
    statut: 'valide',
    derniere_revision,
  };
}

function entry(date: string): ChangelogEntry {
  return {
    date,
    kind: 'positions',
    titre_fr: 'Titre',
    titre_nl: 'Titel',
    detail_fr: 'Détail',
    detail_nl: 'Detail',
    url_preuve: 'https://example.org/pr/1',
  };
}

describe('METHODOLOGY_VERSION', () => {
  it('is a non-empty version identifier', () => {
    expect(METHODOLOGY_VERSION).toMatch(/^v\d+/);
  });
});

describe('deriveDataDate', () => {
  it('returns the latest position revision when it is the most recent', () => {
    expect(
      deriveDataDate([position('2026-06-01'), position('2026-06-15')], [entry('2026-05-01')]),
    ).toBe('2026-06-15');
  });

  it('returns the latest changelog date when it is the most recent', () => {
    expect(deriveDataDate([position('2026-06-01')], [entry('2026-07-16')])).toBe('2026-07-16');
  });

  it('works from positions alone', () => {
    expect(deriveDataDate([position('2026-06-01')], [])).toBe('2026-06-01');
  });

  it('works from the changelog alone', () => {
    expect(deriveDataDate([], [entry('2026-07-16'), entry('2026-07-01')])).toBe('2026-07-16');
  });

  it('returns null when there is no data at all', () => {
    expect(deriveDataDate([], [])).toBeNull();
  });

  it('does not depend on input order', () => {
    const shuffled = [position('2026-06-15'), position('2026-01-01'), position('2026-03-10')];
    expect(deriveDataDate(shuffled, [])).toBe('2026-06-15');
    expect(deriveDataDate([...shuffled].reverse(), [])).toBe('2026-06-15');
  });
});
