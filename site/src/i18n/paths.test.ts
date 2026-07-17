import { describe, expect, it } from 'vitest';
import { localizePath } from './paths.ts';

describe('localizePath', () => {
  it('swaps the locale prefix of a locale root', () => {
    expect(localizePath('/fr', 'nl')).toBe('/nl');
    expect(localizePath('/nl', 'fr')).toBe('/fr');
  });

  it('tolerates a trailing slash', () => {
    expect(localizePath('/fr/', 'nl')).toBe('/nl');
  });

  it('preserves the rest of the path after the locale segment', () => {
    expect(localizePath('/fr/methodologie', 'nl')).toBe('/nl/methodologie');
    expect(localizePath('/nl/a/b/', 'fr')).toBe('/fr/a/b');
  });

  it('is a no-op (normalisation aside) for the same locale', () => {
    expect(localizePath('/fr/methodologie', 'fr')).toBe('/fr/methodologie');
  });

  it('prefixes a path that carries no locale segment', () => {
    expect(localizePath('/', 'nl')).toBe('/nl');
    expect(localizePath('/apropos', 'nl')).toBe('/nl/apropos');
  });
});
