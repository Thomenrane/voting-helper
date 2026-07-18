/**
 * Deterministic lexical scan — the keyless safety net of the auditable
 * coverage sweep (#39).
 *
 * The exhaustive per-chunk sweep already gives RECALL (every chunk is
 * examined by the LLM). The lexical scan never cuts anything: it only
 * *prioritises human attention*. For one statement it derives bilingual
 * keywords (FR + NL, straight from the statement's own two languages, plus a
 * published synonym registry) and reports, over the FULL text layer, the
 * pages where the SUBJECT of the statement co-occurs. A « position non
 * documentée » whose subject has lexical occurrences is a silence a reviewer
 * MUST double-check.
 *
 * No key, no network, fully deterministic. Normalisation is shared with the
 * citation verifier (normalizeForSearch) so the scan and the mechanical
 * verifier agree on what a character is; on top of it the scan folds case and
 * diacritics because lexical presence is case/accent-insensitive by design
 * (unlike a verbatim citation, which is not).
 *
 * Published limit (methodology): a page is a hit only when at least
 * LEXICAL_COOCCURRENCE_MIN distinct keywords co-occur on it — one generic word
 * is not evidence the subject is treated. A subject phrased on a page with
 * fewer than that many expected keywords is the irreducible residue this scan
 * cannot surface; that residue is published, not hidden.
 */
import type { Statement } from '@voting-helper/data';

import { normalizeForSearch } from './normalize.ts';
import type { ProgrammeTextLayer } from './text-layer.ts';

/** One page where the statement's subject lexically co-occurs. */
export interface LexicalPageHit {
  source_id: string;
  page: number;
  /** Distinct keywords (folded form) found on this page. */
  terms: string[];
}

export interface StatementLexicalScan {
  statement_id: string;
  /** Folded keywords derived for this statement (FR + NL + synonyms). */
  keywords: string[];
  /** Pages meeting the co-occurrence threshold, strongest first. */
  hits: LexicalPageHit[];
}

/** Tokens shorter than this carry no discriminating signal. */
export const LEXICAL_MIN_TOKEN_LENGTH = 4;

/**
 * A page is a hit only when at least this many DISTINCT keywords co-occur —
 * one common word is not evidence the subject is addressed. A statement with
 * fewer derived keywords than this uses its own keyword count as the floor.
 */
export const LEXICAL_COOCCURRENCE_MIN = 2;

/**
 * Function words (FR + NL, folded) dropped from derived keywords even when
 * long enough — they carry no subject signal and would only create noise.
 * Deliberately conservative: only pure grammatical words, never content words.
 */
const STOPWORDS = new Set<string>([
  // FR
  'dans', 'pour', 'avec', 'sans', 'sous', 'plus', 'moins', 'cette', 'cette',
  'leur', 'leurs', 'nous', 'vous', 'elle', 'elles', 'dont', 'mais', 'comme',
  'aussi', 'entre', 'chaque', 'tout', 'tous', 'toute', 'toutes', 'etre',
  'avoir', 'fait', 'faire', 'ainsi', 'afin', 'lors', 'selon', 'vers',
  // NL
  'voor', 'zonder', 'meer', 'deze', 'onze', 'door', 'niet', 'wordt', 'worden',
  'tussen', 'naar', 'over', 'onder', 'zoals', 'omdat', 'maar', 'ook', 'elke',
  'alle', 'zijn', 'hebben', 'wordt', 'moet', 'moeten', 'kunnen', 'tegen',
]);

/**
 * Published synonym registry (FR + NL) extending each statement's own words.
 * These are the DEMO fixture statements (s1…s8) — the map is data, keyed by
 * statement id, and extends when the editorial 35 land (guide-redaction).
 * Multi-word entries are matched as phrases. Consumed by extract:positions.
 */
export const STATEMENT_KEYWORD_SYNONYMS: Record<string, readonly string[]> = {
  s1: ['charges sociales', 'loonkosten', 'loonlasten', 'lage lonen', 'sociale lasten'],
  s2: ['impot fortune', 'vermogensbelasting', 'patrimoine', 'vermogen', 'miljonairstaks'],
  s3: ['btw', 'ferroviaire', 'chemin de fer', 'spoorwegen', 'treinticket'],
  s4: ['voiture de societe', 'bedrijfswagen', 'salariswagen', 'avantage fiscal', 'fiscaal voordeel'],
  s5: ['nucleaire', 'kernenergie', 'kerncentrale', 'kernreactor', 'reacteur'],
  s6: ['chaudiere', 'stookolie', 'stookketel', 'verwarmingsketel', 'fioul'],
  s7: ['psychologue', 'psycholoog', 'psychologische', 'sante mentale', 'geestelijke gezondheid'],
  s8: ['medicament', 'geneesmiddel', 'pharmacie', 'apotheek', 'sans ordonnance', 'supermarkt'],
};

/**
 * Folds a string for lexical presence testing: the shared typography
 * normalisation (so the scan and the verifier agree on characters), then
 * diacritics-stripping and lower-casing (lexical presence ignores case and
 * accents, unlike a verbatim citation).
 */
export function foldForLexical(text: string): string {
  return normalizeForSearch(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase();
}

function tokenize(folded: string): string[] {
  return folded.split(/[^a-z0-9]+/u).filter((token) => token.length >= LEXICAL_MIN_TOKEN_LENGTH);
}

/**
 * Bilingual keywords for one statement: content tokens from its FR and NL
 * text and concrete notes, minus stopwords, plus the published synonyms.
 * Deterministic: deduplicated and sorted.
 */
export function deriveKeywords(
  statement: Statement,
  synonyms: readonly string[] = STATEMENT_KEYWORD_SYNONYMS[statement.id] ?? [],
): string[] {
  const keywords = new Set<string>();
  const fields = [
    statement.texte_fr,
    statement.texte_nl,
    statement.note_concrete_fr,
    statement.note_concrete_nl,
  ];
  for (const field of fields) {
    for (const token of tokenize(foldForLexical(field))) {
      if (!STOPWORDS.has(token)) keywords.add(token);
    }
  }
  for (const synonym of synonyms) {
    const folded = foldForLexical(synonym).trim();
    if (folded.length > 0) keywords.add(folded);
  }
  return [...keywords].sort();
}

/** Compiled matcher: whole-word for a single token, phrase for a multi-word synonym. */
function keywordMatcher(keyword: string): RegExp {
  if (keyword.includes(' ')) {
    const phrase = keyword
      .split(/\s+/u)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
      .join('\\s+');
    return new RegExp(`(?<![a-z0-9])${phrase}(?![a-z0-9])`, 'u');
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'u');
}

/**
 * Scans the full text layer(s) for one statement and returns the pages where
 * its subject lexically co-occurs (at least LEXICAL_COOCCURRENCE_MIN distinct
 * keywords, or all of them when the statement has fewer). Strongest pages
 * first; deterministic tie-breaking by source then page.
 */
export function scanLayersForStatement(
  statement: Statement,
  layers: readonly ProgrammeTextLayer[],
  synonyms?: readonly string[],
): StatementLexicalScan {
  const keywords = deriveKeywords(statement, synonyms);
  const matchers = keywords.map((keyword) => ({ keyword, regex: keywordMatcher(keyword) }));
  const threshold = Math.min(LEXICAL_COOCCURRENCE_MIN, keywords.length);
  const hits: LexicalPageHit[] = [];
  if (threshold === 0) {
    return { statement_id: statement.id, keywords, hits };
  }
  for (const layer of layers) {
    for (const { page, text } of layer.pages) {
      const folded = foldForLexical(text);
      const terms = matchers.filter(({ regex }) => regex.test(folded)).map(({ keyword }) => keyword);
      if (terms.length >= threshold) {
        hits.push({ source_id: layer.source_id, page, terms });
      }
    }
  }
  hits.sort(
    (a, b) =>
      b.terms.length - a.terms.length ||
      a.source_id.localeCompare(b.source_id) ||
      a.page - b.page,
  );
  return { statement_id: statement.id, keywords, hits };
}
