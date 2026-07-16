/**
 * Typography normalization applied IDENTICALLY to LLM citations and to the
 * derived text layer before mechanical search (seam n°2). Documented rules,
 * each covered by normalize.test.ts:
 *
 * 1. Unicode NFKC — folds PDF font ligatures (ﬁ→fi, ﬂ→fl) and compatibility
 *    forms; also maps NBSP (U+00A0) and narrow NBSP (U+202F) to plain spaces.
 *    Letters like œ/æ have no compatibility decomposition and stay intact.
 * 2. Soft hyphens (U+00AD) removed — end-of-line hyphenation artifacts of
 *    justified PDF text.
 * 3. Curly/angle quotes → straight quotes ('  "). French guillemets carry
 *    their inner (non-breaking) space as part of the typography — « X » and
 *    "X" are the same citation — so that space is swallowed with the
 *    guillemet.
 * 4. Dash family (U+2010…U+2015, U+2212) → plain hyphen.
 * 5. Remaining Unicode spaces without NFKC decomposition (thin space & co.,
 *    U+2000…U+200A, U+205F, U+3000) → plain space.
 * 6. Whitespace runs (incl. newlines) collapsed to one space; trimmed.
 *
 * Case is deliberately PRESERVED: a case change is an alteration of the
 * citation, not typography — it must fail verification.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/­/g, '')
    .replace(/[‘’‚‛ʼ]/g, "'")
    .replace(/«\s*/gu, '"')
    .replace(/\s*»/gu, '"')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[ -  　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
