import { describe, expect, it } from 'vitest';

import {
  assessThemeCoverage,
  CANONICAL_THEMES,
  SELECTION_TARGET,
  SELECTION_TOTAL,
  isCanonicalTheme,
} from './theme-coverage.ts';

describe('CANONICAL_THEMES', () => {
  it('carries the ~10 themes of the spec with unique ids', () => {
    expect(CANONICAL_THEMES).toHaveLength(10);
    expect(new Set(CANONICAL_THEMES.map((t) => t.id)).size).toBe(10);
  });

  it('makes the 35-statement target reachable at 3-4 per theme', () => {
    expect(SELECTION_TOTAL).toBeGreaterThanOrEqual(CANONICAL_THEMES.length * SELECTION_TARGET.min);
    expect(SELECTION_TOTAL).toBeLessThanOrEqual(CANONICAL_THEMES.length * SELECTION_TARGET.max);
  });

  it('recognizes canonical and rejects unknown theme ids', () => {
    expect(isCanonicalTheme('fiscalite')).toBe(true);
    expect(isCanonicalTheme('enseignement')).toBe(false);
  });
});

describe('assessThemeCoverage', () => {
  it('flags every canonical theme as a gap on an empty selection', () => {
    const coverage = assessThemeCoverage([]);
    expect(coverage).toHaveLength(CANONICAL_THEMES.length);
    expect(coverage.every((entry) => entry.status === 'gap' && entry.count === 0)).toBe(true);
  });

  it('marks themes inside the target as ok and counts them exactly', () => {
    const themes = [
      ...Array<string>(3).fill('fiscalite'),
      ...Array<string>(4).fill('sante'),
    ];
    const coverage = assessThemeCoverage(themes);
    const byId = new Map(coverage.map((entry) => [entry.theme.id, entry]));
    expect(byId.get('fiscalite')).toMatchObject({ count: 3, status: 'ok' });
    expect(byId.get('sante')).toMatchObject({ count: 4, status: 'ok' });
    expect(byId.get('migration')).toMatchObject({ count: 0, status: 'gap' });
  });

  it('flags overflow beyond the max target', () => {
    const coverage = assessThemeCoverage(Array<string>(5).fill('mobilite'));
    const mobilite = coverage.find((entry) => entry.theme.id === 'mobilite');
    expect(mobilite).toMatchObject({ count: 5, status: 'overflow' });
  });

  it('never flags overflow with an unbounded max (pool assessment)', () => {
    const coverage = assessThemeCoverage(Array<string>(50).fill('emploi'), {
      min: 3,
      max: Number.POSITIVE_INFINITY,
    });
    const emploi = coverage.find((entry) => entry.theme.id === 'emploi');
    expect(emploi).toMatchObject({ count: 50, status: 'ok' });
  });

  it('rejects an unknown theme id as schema drift', () => {
    expect(() => assessThemeCoverage(['enseignement'])).toThrow(/Unknown theme 'enseignement'/);
  });
});
