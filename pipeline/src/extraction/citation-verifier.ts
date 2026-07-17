/**
 * Citation verifier — seam n°2 of the spec (#15) and the anti-hallucination
 * guardrail of the extraction pipeline (#22).
 *
 * Every citation proposed by the LLM is searched MECHANICALLY in the derived
 * text layer after the documented typography normalization (normalize.ts).
 * A citation that is not found verbatim on its stated page is never published:
 * the caller marks the position 'rejete'.
 *
 * The citation's `page` is by convention the page where the citation STARTS;
 * a citation may straddle the stated page and the next one (justified PDF
 * text flows across pages), which is reported explicitly.
 *
 * Page-join rule (complements the normalization rules of normalize.ts): when
 * a page ends with a HARD hyphen — an end-of-line hyphenation the PDF carries
 * as '-' rather than U+00AD — the boundary is searched under three healings:
 * plain join ('… fis- cale …'), dehyphenated join ('… fiscale …'), and
 * hyphen-kept join without a space ('… long-terme …', for compounds broken
 * after their own hyphen). Matching ANY variant verifies the citation.
 */
import { normalizeForSearch } from './normalize.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

export type CitationVerdict =
  /** Found verbatim starting on the stated page. */
  | { status: 'verified'; page: number; spans_next_page: boolean }
  /** Found verbatim, but starting on other page(s) than stated. */
  | { status: 'found_elsewhere'; pages: number[] }
  /** Not present in the layer at all — hallucinated or altered. */
  | { status: 'not_found' };

/**
 * Healings of the (page, next page) boundary — see the page-join rule above.
 * Inputs are already normalized, so an end-of-page hyphenation is exactly a
 * trailing '-' followed by a word at the head of the next page.
 */
function pageJoinVariants(current: string, next: string): string[] {
  const variants = [`${current} ${next}`];
  if (current.endsWith('-') && /^[\p{L}\p{N}]/u.test(next)) {
    variants.push(`${current.slice(0, -1)}${next}`); // 'fis-' + 'cale' → 'fiscale'
    variants.push(`${current}${next}`); // 'long-' + 'terme' → 'long-terme'
  }
  return variants;
}

export function verifyCitation(
  texte: string,
  page: number,
  layer: ProgrammeTextLayer,
): CitationVerdict {
  const needle = normalizeForSearch(texte);
  if (needle.length === 0) {
    throw new Error(
      `Cannot verify an empty citation against '${layer.source_id}' — contract violation.`,
    );
  }

  const pages = layer.pages.map((entry) => normalizeForSearch(entry.text));
  const matches: { page: number; spans: boolean }[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const current = pages[i] ?? '';
    if (current.includes(needle)) {
      matches.push({ page: i + 1, spans: false });
      continue;
    }
    const next = pages[i + 1];
    // Start-of-span detection: present in a (page, next page) join variant
    // but not in either page alone → the citation starts on page i+1 and
    // flows onto the next page. A match fully on the next page is recorded by
    // the next iteration instead.
    if (
      next !== undefined &&
      !next.includes(needle) &&
      pageJoinVariants(current, next).some((joined) => joined.includes(needle))
    ) {
      matches.push({ page: i + 1, spans: true });
    }
  }

  const stated = matches.find((match) => match.page === page);
  if (stated !== undefined) {
    return { status: 'verified', page, spans_next_page: stated.spans };
  }
  if (matches.length > 0) {
    return { status: 'found_elsewhere', pages: matches.map((match) => match.page) };
  }
  return { status: 'not_found' };
}
