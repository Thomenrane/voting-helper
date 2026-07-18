import { describe, expect, it } from 'vitest';

import {
  buildHtmlChapterLayer,
  compositeChapterSha,
  extractChapterText,
  type ChapterSnapshot,
} from './html-text-layer.ts';

/** A drupack-shaped chapter page: chrome around a <main> with real content. */
function chapterHtml(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><title>site</title>
    <style>.x{color:red}</style><script>track()</script></head>
    <body>
      <header class="header__top"><a href="/">Accueil</a></header>
      <nav class="menu__main"><ul><li>Programme</li><li>Actus</li></ul></nav>
      <div class="search-field__wrap"><input type="search"></div>
      <main>
        <section class="section-title"><h1>${title}</h1></section>
        <div class="field__item">
          <p>${body}</p>
          <p>Deuxi&egrave;me paragraphe avec un &amp; et &laquo; guillemets &raquo;.</p>
          <script>inline()</script>
        </div>
      </main>
      <div class="doormat__columns"><a href="/x">plan du site</a></div>
      <footer class="footer__legal">Mentions légales</footer>
      <div id="CybotCookiebotDialog" class="cookiebot">Nous utilisons des cookies</div>
    </body></html>`;
}

describe('extractChapterText', () => {
  it('keeps <main> content, strips nav/header/footer/menu/cookie/scripts', () => {
    const { title, text } = extractChapterText(
      chapterHtml('Justice fiscale', 'Nous voulons une taxe des millionnaires en 2024.'),
    );
    expect(title).toBe('Justice fiscale');
    expect(text).toContain('taxe des millionnaires en 2024');
    expect(text).toContain('Deuxième paragraphe avec un & et « guillemets ».');
    // Chrome removed.
    for (const chrome of ['Accueil', 'Actus', 'plan du site', 'Mentions légales', 'cookies', 'track(']) {
      expect(text).not.toContain(chrome);
    }
  });

  it('falls back to the section-title heading when there is no <h1>', () => {
    const html = `<main><div class="section-title__title"><h3>Agriculture</h3></div>
      <p>Contenu agricole.</p></main>`;
    expect(extractChapterText(html).title).toBe('Agriculture');
  });

  it('decodes numeric and hex entities', () => {
    const html = '<main><p>caf&#233; &#x20AC;5</p></main>';
    expect(extractChapterText(html).text).toBe('café €5');
  });

  it('does not leak a stray > from an attribute value into the text', () => {
    const html = '<main><p data-x="a>b">contenu propre</p></main>';
    expect(extractChapterText(html).text).toBe('contenu propre');
  });
});

describe('buildHtmlChapterLayer', () => {
  const chapters: ChapterSnapshot[] = [
    {
      slug: 'justice-fiscale',
      sha256: 'a'.repeat(64),
      url: 'https://www.ptb.be/programme/justice-fiscale',
      content: { title: 'Justice fiscale', text: 'Taxe des millionnaires.' },
    },
    {
      slug: 'agriculture',
      sha256: 'b'.repeat(64),
      url: 'https://www.ptb.be/programme/agriculture',
      content: { title: 'Agriculture', text: 'Soutien aux paysans.' },
    },
  ];

  it('makes one slug-ordered page per chapter, each anchored to its snapshot sha', () => {
    const layer = buildHtmlChapterLayer('ptb-programme-2024', chapters);
    expect(layer.extractor).toBe('html-chapters');
    expect(layer.page_count).toBe(2);
    expect(layer.pages.map((p) => p.page)).toEqual([1, 2]);
    // Slug order: agriculture before justice-fiscale.
    expect(layer.pages[0]?.title).toBe('Agriculture');
    expect(layer.pages[0]?.source_sha256).toBe('b'.repeat(64));
    expect(layer.pages[1]?.title).toBe('Justice fiscale');
    expect(layer.pages[1]?.source_sha256).toBe('a'.repeat(64));
  });

  it('composite sha is order-independent but sensitive to any chapter change', () => {
    const forward = compositeChapterSha(chapters);
    const reversed = compositeChapterSha([...chapters].reverse());
    expect(forward).toBe(reversed); // deterministic: sorted by slug internally
    const tampered = compositeChapterSha([
      { ...chapters[0]!, sha256: 'c'.repeat(64) },
      chapters[1]!,
    ]);
    expect(tampered).not.toBe(forward);
  });
});
