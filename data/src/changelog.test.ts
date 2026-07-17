/**
 * Validation of the committed public changelog (#26) — the file is the
 * source of truth of /changelog, so its invariants are enforced here rather
 * than trusted by convention. No clock is consulted: determinism holds by
 * checking format and internal order only.
 */
import { describe, expect, it } from 'vitest';
import { CHANGELOG } from './changelog.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('CHANGELOG', () => {
  it('has at least one entry', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it('uses strict ISO dates that survive a calendar round-trip', () => {
    for (const entry of CHANGELOG) {
      // Rejects DD/MM/YYYY outright, and impossible dates like 2026-02-30
      // (which round-trip to a different ISO day).
      expect(entry.date).toMatch(ISO_DATE);
      expect(new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(entry.date);
    }
  });

  it('is append-only: file order is chronological (non-decreasing dates)', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      const previous = CHANGELOG[i - 1]!.date;
      const current = CHANGELOG[i]!.date;
      expect(current >= previous, `entry ${i} ("${current}") predates entry ${i - 1} ("${previous}")`).toBe(true);
    }
  });

  it('links every entry to a proof on the project repository', () => {
    for (const entry of CHANGELOG) {
      expect(entry.url_preuve).toMatch(/^https:\/\/github\.com\/Thomenrane\/voting-helper\//);
    }
  });

  it('carries non-empty bilingual titles and details', () => {
    for (const entry of CHANGELOG) {
      expect(entry.titre_fr.length).toBeGreaterThan(0);
      expect(entry.titre_nl.length).toBeGreaterThan(0);
      expect(entry.detail_fr.length).toBeGreaterThan(0);
      expect(entry.detail_nl.length).toBeGreaterThan(0);
    }
  });
});
