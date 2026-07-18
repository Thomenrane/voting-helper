/**
 * HTML → per-chapter text layer (#51).
 *
 * Turns snapshotted programme CHAPTER pages (PTB/PVDA — no national PDF) into
 * the SAME `ProgrammeTextLayer` structure the PDF path produces (#22), so
 * admission (#42) and extraction (#25) stay agnostic to the source format:
 * each chapter is one « page » of the layer.
 *
 * Extraction is dependency-free and deterministic — a tolerant tag tokenizer,
 * not a live DOM: strip `<script>`/`<style>`, isolate the `<main>` content,
 * drop chrome (nav/header/footer/menus/cookie banner) by tag and by the theme's
 * boilerplate class markers, then flatten to text. Both parties render the same
 * Drupal `drupack` theme (investigation #51), so one selector set covers FR+NL.
 *
 * Integrity: every chapter-page carries the SHA-256 of ITS snapshot, and the
 * layer's `source_sha256` is a composite of those fingerprints — a single
 * falsified chapter changes the composite and (via the store's integrity check)
 * yields NO layer at all. Pure: no I/O, no network.
 */
import { createHash } from 'node:crypto';

import type { ProgrammeTextLayer, TextLayerPage } from './text-layer.ts';

/** HTML void elements — never have a closing tag. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Tags whose entire subtree is chrome, never programme content. `head` removes
 * metadata/inline CSS; the rest is site navigation, forms and decoration.
 */
const DROP_TAGS = new Set([
  'head', 'script', 'style', 'noscript', 'template', 'svg',
  'nav', 'header', 'footer', 'aside', 'form', 'button', 'dialog', 'iframe',
]);

/**
 * Boilerplate CLASS markers (substring match) of the shared Drupal `drupack`
 * theme (investigation #51): main/burger menus, the "doormat" mega-footer, the
 * footer, the search field, and the Cookiebot consent banner.
 */
const BOILERPLATE_CLASS_MARKERS = [
  'menu__', 'doormat__', 'footer__', 'search-field__', 'cookiebot',
];

/** Block-level tags — flattening inserts a line break around them. */
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'li', 'ul', 'ol', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'blockquote',
  'figure', 'figcaption', 'dl', 'dt', 'dd', 'header', 'footer',
]);

type Token =
  | { type: 'text'; raw: string }
  | { type: 'open'; name: string; attrs: string }
  | { type: 'void'; name: string; attrs: string }
  | { type: 'close'; name: string };

/**
 * Tolerant tokenizer. The attribute matcher `"[^"]*"|'[^']*'|[^>"']` skips any
 * `>` that sits inside a quoted attribute value, so tags are split correctly
 * even with URLs/inline data in attributes.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gu;
  let last = 0;
  for (let m = tagRe.exec(html); m !== null; m = tagRe.exec(html)) {
    if (m.index > last) tokens.push({ type: 'text', raw: html.slice(last, m.index) });
    const closing = m[1] === '/';
    const name = (m[2] ?? '').toLowerCase();
    const attrs = m[3] ?? '';
    const selfClose = m[4] === '/';
    if (closing) tokens.push({ type: 'close', name });
    else if (selfClose || VOID_TAGS.has(name)) tokens.push({ type: 'void', name, attrs });
    else tokens.push({ type: 'open', name, attrs });
    last = m.index + m[0].length;
  }
  if (last < html.length) tokens.push({ type: 'text', raw: html.slice(last) });
  return tokens;
}

/** Strips HTML comments (incl. CDATA-style) before tokenizing. */
function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/gu, '');
}

function classList(attrs: string): string {
  const m = /class\s*=\s*("([^"]*)"|'([^']*)')/iu.exec(attrs);
  return (m?.[2] ?? m?.[3] ?? '').toLowerCase();
}

function isBoilerplate(name: string, attrs: string): boolean {
  if (DROP_TAGS.has(name)) return true;
  const classes = classList(attrs);
  return BOILERPLATE_CLASS_MARKERS.some((marker) => classes.includes(marker));
}

/**
 * Removes whole subtrees for which `shouldDrop` is true, tracking nesting so a
 * dropped element containing same-named descendants is skipped in full.
 */
function stripElements(
  tokens: readonly Token[],
  shouldDrop: (name: string, attrs: string) => boolean,
): Token[] {
  const out: Token[] = [];
  let dropDepth = 0;
  let dropName = '';
  for (const token of tokens) {
    if (dropDepth > 0) {
      if (token.type === 'open' && token.name === dropName) dropDepth += 1;
      else if (token.type === 'close' && token.name === dropName) dropDepth -= 1;
      continue;
    }
    if (token.type === 'open' && shouldDrop(token.name, token.attrs)) {
      dropDepth = 1;
      dropName = token.name;
      continue;
    }
    if (token.type === 'void' && shouldDrop(token.name, token.attrs)) continue;
    out.push(token);
  }
  return out;
}

/** Inner tokens of the first `<main>…</main>`, or all tokens when absent. */
function mainRegion(tokens: readonly Token[]): Token[] {
  const start = tokens.findIndex((t) => t.type === 'open' && t.name === 'main');
  if (start === -1) return [...tokens];
  const inner: Token[] = [];
  let depth = 0;
  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.type === 'open' && token.name === 'main') {
      depth += 1;
      if (depth === 1) continue; // skip the opening <main> itself
    } else if (token.type === 'close' && token.name === 'main') {
      depth -= 1;
      if (depth === 0) break;
    }
    inner.push(token);
  }
  return inner;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â',
  ccedil: 'ç', ugrave: 'ù', ucirc: 'û', icirc: 'î', iuml: 'ï', ocirc: 'ô',
  euro: '€', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', oelig: 'œ', deg: '°', middot: '·', ndash: '–',
  mdash: '—', times: '×', copy: '©', reg: '®', trade: '™',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/gu, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** Flattens tokens to clean text: block tags → line breaks, whitespace collapsed. */
function textFromTokens(tokens: readonly Token[]): string {
  let buffer = '';
  for (const token of tokens) {
    if (token.type === 'text') {
      buffer += decodeEntities(token.raw);
    } else if (BLOCK_TAGS.has(token.name)) {
      buffer += '\n';
    }
  }
  return buffer
    .replace(/[^\S\n]+/gu, ' ') // collapse spaces/tabs, keep newlines
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Inner text of the first element matching `predicate`, or `null`. */
function firstElementText(
  tokens: readonly Token[],
  predicate: (name: string, attrs: string) => boolean,
): string | null {
  const start = tokens.findIndex((t) => t.type === 'open' && predicate(t.name, t.attrs));
  if (start === -1) return null;
  const open = tokens[start];
  if (open === undefined || open.type !== 'open') return null;
  const inner: Token[] = [];
  let depth = 0;
  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.type === 'open' && token.name === open.name) {
      depth += 1;
      if (depth === 1) continue;
    } else if (token.type === 'close' && token.name === open.name) {
      depth -= 1;
      if (depth === 0) break;
    }
    inner.push(token);
  }
  const text = textFromTokens(inner);
  return text.length > 0 ? text.replace(/\n+/gu, ' ').trim() : null;
}

export interface ChapterContent {
  /** Chapter heading — `<h1>`, else the theme's `.section-title__title`. */
  title: string;
  /** Cleaned chapter body text (chrome removed). */
  text: string;
}

/**
 * Extracts the title and cleaned body text of one chapter HTML page. Pure and
 * deterministic. Chrome (nav/header/footer/menus/cookie banner/scripts) is
 * removed; the `<main>` content is kept.
 */
export function extractChapterText(html: string): ChapterContent {
  const all = tokenize(stripComments(html));
  // Title BEFORE stripping — the heading may sit in a section wrapper.
  const region = mainRegion(all);
  const title =
    firstElementText(region, (name) => name === 'h1') ??
    firstElementText(region, (_name, attrs) => classList(attrs).includes('section-title__title')) ??
    firstElementText(all, (name) => name === 'h1') ??
    '';
  const body = textFromTokens(stripElements(region, isBoilerplate));
  return { title, text: body };
}

/** One chapter's snapshot facts, assembled into a layer page. */
export interface ChapterSnapshot {
  /** Chapter slug (reading order key). */
  slug: string;
  /** SHA-256 (hex) of this chapter's HTML snapshot — the per-page integrity anchor. */
  sha256: string;
  /** Origin URL of the chapter page. */
  url: string;
  content: ChapterContent;
}

/** Deterministic composite fingerprint of ordered per-chapter snapshot SHA-256s. */
export function compositeChapterSha(chapters: readonly ChapterSnapshot[]): string {
  const material = [...chapters]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((chapter) => `${chapter.slug}:${chapter.sha256}`)
    .join('\n');
  return createHash('sha256').update(material).digest('hex');
}

/**
 * Assembles a `ProgrammeTextLayer` from snapshotted chapters — each chapter is
 * one page, in deterministic slug order, anchored to its own snapshot SHA-256.
 */
export function buildHtmlChapterLayer(
  sourceId: string,
  chapters: readonly ChapterSnapshot[],
): ProgrammeTextLayer {
  const ordered = [...chapters].sort((a, b) => a.slug.localeCompare(b.slug));
  const pages: TextLayerPage[] = ordered.map((chapter, index) => ({
    page: index + 1,
    text: chapter.content.text,
    title: chapter.content.title,
    source_sha256: chapter.sha256,
    source_url: chapter.url,
  }));
  return {
    source_id: sourceId,
    source_sha256: compositeChapterSha(ordered),
    extractor: 'html-chapters',
    page_count: pages.length,
    pages,
  };
}
