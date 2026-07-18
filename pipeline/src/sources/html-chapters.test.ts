import { describe, expect, it } from 'vitest';

import type { SnapshotSource } from '../snapshot/manifest.ts';
import {
  buildChapterSources,
  chapterSourceId,
  chapterSourceIdPrefix,
  extractChapterLinks,
  MAX_CHAPTERS_PER_INDEX,
} from './html-chapters.ts';

const INDEX: SnapshotSource = {
  id: 'ptb-programme-2024',
  label: 'PTB — Programme',
  originUrl: 'https://www.ptb.be/programme',
  fetchUrl: 'https://www.ptb.be/programme',
  channel: 'live',
  mediaType: 'text/html',
  provenance: 'note',
};

describe('extractChapterLinks', () => {
  it('keeps only same-origin, one-segment chapter links, deduped and slug-ordered', () => {
    const html = `
      <a href="https://www.ptb.be/programme/justice-fiscale">Justice fiscale</a>
      <a href="/programme/agriculture">Agriculture</a>
      <a href="https://www.ptb.be/programme/agriculture">dup</a>
      <a href="https://www.ptb.be/programme/justice-fiscale?ref=nav">with query</a>
      <a href="https://twitter.com/ptb">off-domain</a>
      <a href="https://www.ptb.be/programme">index itself</a>
      <a href="https://www.ptb.be/programme/justice/detail">too deep</a>
      <a href="https://www.ptb.be/contact">other section</a>
    `;
    const links = extractChapterLinks(html, INDEX.originUrl);
    expect(links.map((l) => l.slug)).toEqual(['agriculture', 'justice-fiscale']);
    expect(links[0]?.url).toBe('https://www.ptb.be/programme/agriculture');
    // Query/hash dropped — a chapter is a page, not a filtered view.
    expect(links[1]?.url).toBe('https://www.ptb.be/programme/justice-fiscale');
  });

  it('resolves the NL mirror against its own path prefix', () => {
    const links = extractChapterLinks(
      '<a href="/programma/anti-racisme">x</a><a href="/programme/nope">fr on nl</a>',
      'https://www.pvda.be/programma',
    );
    expect(links.map((l) => l.slug)).toEqual(['anti-racisme']);
  });

  it('ignores unsafe slugs (never path-injectable)', () => {
    const links = extractChapterLinks(
      '<a href="https://www.ptb.be/programme/../etc">bad</a><a href="/programme/ok">ok</a>',
      INDEX.originUrl,
    );
    expect(links.map((l) => l.slug)).toEqual(['ok']);
  });

  it('refuses an index that exceeds the crawl bound', () => {
    const many = Array.from(
      { length: MAX_CHAPTERS_PER_INDEX + 1 },
      (_v, i) => `<a href="/programme/chap-${String(i).padStart(4, '0')}">x</a>`,
    ).join('');
    expect(() => extractChapterLinks(many, INDEX.originUrl)).toThrow(/crawl bound/);
  });
});

describe('chapterSourceId', () => {
  it('is path-safe and prefixed by the index id', () => {
    const id = chapterSourceId('ptb-programme-2024', 'justice-fiscale');
    expect(id).toBe('ptb-programme-2024-chapitre-justice-fiscale');
    expect(id.startsWith(chapterSourceIdPrefix('ptb-programme-2024'))).toBe(true);
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('buildChapterSources', () => {
  it('inherits channel + provenance from the index, media type text/html', () => {
    const sources = buildChapterSources(INDEX, [
      { slug: 'agriculture', url: 'https://www.ptb.be/programme/agriculture' },
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: 'ptb-programme-2024-chapitre-agriculture',
      originUrl: 'https://www.ptb.be/programme/agriculture',
      fetchUrl: 'https://www.ptb.be/programme/agriculture',
      channel: 'live',
      mediaType: 'text/html',
    });
    expect(sources[0]?.provenance).toContain('note');
  });
});
