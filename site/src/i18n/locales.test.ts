import { describe, expect, it } from 'vitest';
import { isLocale, LOCALES } from './locales.ts';

describe('isLocale', () => {
  it('accepts every registered locale', () => {
    for (const locale of LOCALES) {
      expect(isLocale(locale)).toBe(true);
    }
  });

  it('rejects unknown or non-string values', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('FR')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(0)).toBe(false);
  });
});
