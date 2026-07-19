import { describe, expect, it } from 'vitest';

import { buildWaybackUrl, decodeWaybackUrl, parseWaybackUrl } from './wayback.ts';

describe('parseWaybackUrl', () => {
  it('splits timestamp, modifier and wrapped target (absolute form)', () => {
    expect(
      parseWaybackUrl('https://web.archive.org/web/20240609id_/https://www.ptb.be/programme'),
    ).toEqual({
      timestamp: '20240609',
      modifier: 'id_',
      target: 'https://www.ptb.be/programme',
    });
  });

  it('accepts a 14-digit capture id and a query string in the target', () => {
    expect(
      parseWaybackUrl(
        'https://web.archive.org/web/20240530063900id_/https://x.be/a.pdf?1711725852',
      ),
    ).toEqual({
      timestamp: '20240530063900',
      modifier: 'id_',
      target: 'https://x.be/a.pdf?1711725852',
    });
  });

  it('accepts a coarse date target and a missing modifier (rewritten replay)', () => {
    expect(parseWaybackUrl('/web/2024/https://www.pvda.be/programma')).toEqual({
      timestamp: '2024',
      modifier: '',
      target: 'https://www.pvda.be/programma',
    });
  });

  it('returns null for a non-Wayback URL', () => {
    expect(parseWaybackUrl('https://www.ptb.be/programme')).toBeNull();
    expect(parseWaybackUrl('/programme/justice-fiscale')).toBeNull();
  });
});

describe('decodeWaybackUrl', () => {
  it('unwraps an encapsulated absolute origin URL', () => {
    expect(
      decodeWaybackUrl('https://web.archive.org/web/20240609id_/https://www.ptb.be/programme/x'),
    ).toBe('https://www.ptb.be/programme/x');
  });

  it('unwraps a host-relative replay href', () => {
    expect(decodeWaybackUrl('/web/20240609000000/https://www.pvda.be/programma/y')).toBe(
      'https://www.pvda.be/programma/y',
    );
  });

  it('returns a non-Wayback URL unchanged', () => {
    expect(decodeWaybackUrl('https://www.ptb.be/programme/z')).toBe(
      'https://www.ptb.be/programme/z',
    );
    expect(decodeWaybackUrl('/programme/agriculture')).toBe('/programme/agriculture');
  });

  it('leaves a wrapped relative target untouched (no canonical origin to decode)', () => {
    // Rewritten replay occasionally emits a path-relative target — nothing to
    // decode to; downstream same-origin bounds reject it (fail-closed).
    expect(decodeWaybackUrl('/web/20240609/./agriculture')).toBe('/web/20240609/./agriculture');
  });
});

describe('buildWaybackUrl', () => {
  it('wraps a target at a timestamp with the default id_ modifier', () => {
    expect(buildWaybackUrl('20240609', 'https://www.ptb.be/programme/x')).toBe(
      'https://web.archive.org/web/20240609id_/https://www.ptb.be/programme/x',
    );
  });

  it('preserves a caller-supplied modifier', () => {
    expect(buildWaybackUrl('20240609', 'https://x.be/y', 'if_')).toBe(
      'https://web.archive.org/web/20240609if_/https://x.be/y',
    );
  });

  it('round-trips with parseWaybackUrl', () => {
    const url = buildWaybackUrl('20240609', 'https://www.pvda.be/programma');
    expect(parseWaybackUrl(url)).toEqual({
      timestamp: '20240609',
      modifier: 'id_',
      target: 'https://www.pvda.be/programma',
    });
  });
});
