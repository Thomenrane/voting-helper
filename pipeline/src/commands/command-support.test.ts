import { describe, expect, it } from 'vitest';

import {
  assertChaptersComplete,
  IncompleteChaptersError,
  type UnavailableChapters,
} from './command-support.ts';

describe('assertChaptersComplete (#58 — crawl-time incompleteness → non-zero exit)', () => {
  it('is a no-op when every index resolved all chapters', () => {
    expect(() => assertChaptersComplete([])).not.toThrow();
    // An index present but with no gaps must not fail either.
    expect(() => assertChaptersComplete([{ indexId: 'ptb-programme-2024', slugs: [] }])).not.toThrow();
  });

  it('throws IncompleteChaptersError naming the index, the count and the slugs', () => {
    const unavailable: UnavailableChapters[] = [
      { indexId: 'ptb-programme-2024', slugs: ['securite-sociale', 'logement'] },
    ];
    let caught: unknown;
    try {
      assertChaptersComplete(unavailable);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IncompleteChaptersError);
    const err = caught as IncompleteChaptersError;
    expect(err.unavailable).toEqual(unavailable);
    expect(err.message).toContain('2 chapitre(s)');
    expect(err.message).toContain('ptb-programme-2024');
    expect(err.message).toContain('securite-sociale');
    expect(err.message).toContain('logement');
  });

  it('aggregates the total across several indexes', () => {
    try {
      assertChaptersComplete([
        { indexId: 'ptb-programme-2024', slugs: ['a'] },
        { indexId: 'pvda-programme-2024', slugs: ['b', 'c'] },
      ]);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IncompleteChaptersError);
      expect((error as IncompleteChaptersError).message).toContain('3 chapitre(s)');
    }
  });
});
