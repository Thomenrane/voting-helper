/**
 * Derived per-page text layer for programme PDFs.
 *
 * Spike verdict (docs/spikes/extraction-couche-texte.md): per-page TypeScript
 * extraction via unpdf (pdf.js engine) — 90/90 sampled citation fragments
 * mechanically retrievable WITH the correct page on real programmes, incl.
 * the 1220-page PS worst case.
 *
 * The layer is the artefact the citation verifier searches (seam n°2):
 * - stored as deterministic JSON (no timestamp; the raw PDF is referenced by
 *   its SHA-256, stable across dated re-attestations, so unchanged content
 *   dedups in the manifest exactly like the derived votes dataset of #21);
 * - attested `kind: derived` in data/manifests/programmes.manifest.json with
 *   quality counters, so extraction regressions show up in git review.
 */
import { extractText, getDocumentProxy } from 'unpdf';

import type { SnapshotSource } from '../snapshot/manifest.ts';

export interface TextLayerPage {
  /**
   * 1-based page number. For a PDF layer, identical to the physical page. For
   * an `html-chapters` layer (#51), the reading-order index of the chapter —
   * each chapter is one « page » so admission and extraction stay agnostic to
   * the source format.
   */
  page: number;
  /** Raw extracted text of the page — NOT normalized (verifier normalizes). */
  text: string;
  /**
   * `html-chapters` layers only (#51): the chapter's heading (page title).
   * Absent on PDF pages — kept optional so PDF layers serialize unchanged.
   */
  title?: string;
  /**
   * `html-chapters` layers only (#51): SHA-256 (hex) of the HTML snapshot that
   * backs THIS chapter-page — the per-page integrity anchor. Absent on PDF
   * pages (a PDF layer carries a single `source_sha256` at the layer level).
   */
  source_sha256?: string;
  /** `html-chapters` layers only (#51): origin URL of the chapter page. */
  source_url?: string;
}

/**
 * Extraction engine, recorded so a future engine change is visible.
 * - `unpdf`: per-page PDF extraction (#22).
 * - `html-chapters`: per-chapter web extraction (#51) — one snapshotted HTML
 *   chapter per page, boilerplate stripped, each page anchored to its own
 *   snapshot SHA-256.
 */
export type TextLayerExtractor = 'unpdf' | 'html-chapters';

export interface ProgrammeTextLayer {
  /** Id of the raw programme source this layer derives from. */
  source_id: string;
  /**
   * SHA-256 (hex) tying the layer to its raw content. For a PDF layer, the raw
   * PDF bytes. For an `html-chapters` layer (#51), a COMPOSITE fingerprint
   * derived deterministically from the ordered per-chapter snapshot SHA-256s,
   * so the "raw content changed" reuse check stays valid without a single
   * underlying binary.
   */
  source_sha256: string;
  /** Extraction engine, recorded so a future engine change is visible. */
  extractor: TextLayerExtractor;
  page_count: number;
  pages: TextLayerPage[];
}

/** Committed in the derived manifest entry — regression signal in review. */
export interface TextLayerQuality extends Record<string, number> {
  pages: number;
  characters: number;
  /** Pages with no extractable text (scans, full-page artwork). */
  empty_pages: number;
}

/**
 * Media types a `ProgrammeTextLayer` can be built from — the single source of
 * truth shared by the extraction command's source filter and `ensureTextLayer`'s
 * dispatch: PDF (#22) and web-chapter HTML (#51).
 */
export const TEXT_LAYER_MEDIA_TYPES = ['application/pdf', 'text/html'] as const;

/** True when a source's media type carries a materializable text layer. */
export function supportsTextLayer(mediaType: string): boolean {
  return (TEXT_LAYER_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

/** Derives the per-page text layer from raw PDF bytes. Deterministic. */
export async function buildTextLayer(
  sourceId: string,
  sourceSha256: string,
  pdfBytes: Uint8Array,
): Promise<ProgrammeTextLayer> {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  if (text.length !== totalPages) {
    throw new Error(
      `Text layer for '${sourceId}' is inconsistent: ${totalPages} pages announced, ${text.length} extracted.`,
    );
  }
  return {
    source_id: sourceId,
    source_sha256: sourceSha256,
    extractor: 'unpdf',
    page_count: totalPages,
    pages: text.map((pageText, index) => ({ page: index + 1, text: pageText })),
  };
}

export function summarizeTextLayerQuality(layer: ProgrammeTextLayer): TextLayerQuality {
  return {
    pages: layer.page_count,
    characters: layer.pages.reduce((total, { text }) => total + text.length, 0),
    empty_pages: layer.pages.filter(({ text }) => text.trim().length === 0).length,
  };
}

/** Deterministic serialization — identical layers produce identical bytes. */
export function serializeTextLayer(layer: ProgrammeTextLayer): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(layer));
}

/** Parses stored derived-snapshot bytes; structural defects raise named errors. */
export function parseTextLayer(bytes: Uint8Array, file: string): ProgrammeTextLayer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    throw new Error(`'${file}' is not a valid text layer: invalid JSON.`, { cause });
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`'${file}' is not a valid text layer: not a JSON object.`);
  }
  const layer = parsed as Record<string, unknown>;
  if (typeof layer['source_id'] !== 'string' || typeof layer['source_sha256'] !== 'string') {
    throw new Error(`'${file}' is not a valid text layer: missing source provenance.`);
  }
  if (typeof layer['page_count'] !== 'number' || !Array.isArray(layer['pages'])) {
    throw new Error(`'${file}' is not a valid text layer: missing pages.`);
  }
  layer['pages'].forEach((entry: unknown, index: number) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>)['page'] !== 'number' ||
      typeof (entry as Record<string, unknown>)['text'] !== 'string'
    ) {
      throw new Error(`'${file}' is not a valid text layer: page entry ${index} is malformed.`);
    }
  });
  if (layer['pages'].length !== layer['page_count']) {
    throw new Error(
      `'${file}' is not a valid text layer: page_count=${String(layer['page_count'])} but ${layer['pages'].length} pages stored.`,
    );
  }
  return parsed as ProgrammeTextLayer;
}

/**
 * Snapshot source describing the derived text layer of one raw programme
 * source — mirrors DERIVED_VOTES_SOURCE (#21): same manifest, kind: derived.
 */
export function textLayerSource(raw: SnapshotSource): SnapshotSource {
  return {
    id: `${raw.id}-text`,
    label: `${raw.label} — couche texte par page (dérivée, unpdf)`,
    originUrl: raw.originUrl,
    fetchUrl: raw.originUrl,
    channel: raw.channel,
    mediaType: 'application/json',
    provenance: `docs/spikes/extraction-couche-texte.md (dérivé localement du snapshot brut '${raw.id}')`,
  };
}
