/**
 * Drift test for the share image fallback palette (#27).
 *
 * share-image.ts resolves colors from the page's CSS custom properties at
 * draw time; FALLBACK_PALETTE is its shadow copy for the (theoretical) case
 * where a variable is missing. A shadow copy rots silently — this test pins
 * every entry to the actual `--var: #hex` declarations in Base.astro, both
 * ways: same names, same values, nothing missing on either side.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FALLBACK_PALETTE } from './share-image.ts';

function baseAstroPalette(): Record<string, string> {
  const source = readFileSync(new URL('../../layouts/Base.astro', import.meta.url), 'utf8');
  const palette: Record<string, string> = {};
  for (const match of source.matchAll(/--([a-z][a-z-]*):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, hex] = match;
    if (name !== undefined && hex !== undefined) palette[name] = hex;
  }
  return palette;
}

describe('FALLBACK_PALETTE', () => {
  it('matches the CSS custom properties declared in Base.astro exactly', () => {
    const declared = baseAstroPalette();
    // Guard the extraction itself: an empty parse must fail loudly, not pass.
    expect(Object.keys(declared).length).toBeGreaterThan(0);
    expect(FALLBACK_PALETTE).toEqual(declared);
  });
});
