/**
 * Bilingual field resolution (#20) — the single place that maps a locale to
 * the matching `_fr` / `_nl` field of a bilingual record. Statements are the
 * only bilingual content; citations are NOT — they stay in their source
 * language whatever the locale (#10) and must never go through this module.
 *
 * The `Record<Locale, …>` shape is deliberate: adding a locale to LOCALES
 * fails compilation here until the mapping is completed.
 */
import type { Statement } from '@voting-helper/data';
import type { Locale } from './locales.ts';

const TEXT_BY_LOCALE: Record<Locale, (statement: Statement) => string> = {
  fr: (statement) => statement.texte_fr,
  nl: (statement) => statement.texte_nl,
};

const NOTE_BY_LOCALE: Record<Locale, (statement: Statement) => string> = {
  fr: (statement) => statement.note_concrete_fr,
  nl: (statement) => statement.note_concrete_nl,
};

/** The statement sentence in the given locale. */
export function statementText(statement: Statement, locale: Locale): string {
  return TEXT_BY_LOCALE[locale](statement);
}

/** The « mesure concrète » footnote in the given locale. */
export function statementNote(statement: Statement, locale: Locale): string {
  return NOTE_BY_LOCALE[locale](statement);
}
