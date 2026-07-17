/**
 * Bilingual field resolution (#20) — the single place that maps a locale to
 * the matching `_fr` / `_nl` field of a bilingual record. Statements, context
 * notes (#14) and changelog entries (#26) are the bilingual content;
 * citations are NOT — they stay in their source language whatever the locale
 * (#10) and must never go through this module.
 *
 * The `Record<Locale, …>` shape is deliberate: adding a locale to LOCALES
 * fails compilation here until the mapping is completed.
 */
import type { ChangelogEntry, ContextNote, Statement } from '@voting-helper/data';
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

const CONTEXT_NOTE_BY_LOCALE: Record<Locale, (note: ContextNote) => string> = {
  fr: (note) => note.texte_fr,
  nl: (note) => note.texte_nl,
};

/** The dated context note (#14) in the given locale. */
export function contextNoteText(note: ContextNote, locale: Locale): string {
  return CONTEXT_NOTE_BY_LOCALE[locale](note);
}

const CHANGELOG_TITLE_BY_LOCALE: Record<Locale, (entry: ChangelogEntry) => string> = {
  fr: (entry) => entry.titre_fr,
  nl: (entry) => entry.titre_nl,
};

const CHANGELOG_DETAIL_BY_LOCALE: Record<Locale, (entry: ChangelogEntry) => string> = {
  fr: (entry) => entry.detail_fr,
  nl: (entry) => entry.detail_nl,
};

/** A changelog entry's title (#26) in the given locale. */
export function changelogTitle(entry: ChangelogEntry, locale: Locale): string {
  return CHANGELOG_TITLE_BY_LOCALE[locale](entry);
}

/** A changelog entry's detail (#26) in the given locale. */
export function changelogDetail(entry: ChangelogEntry, locale: Locale): string {
  return CHANGELOG_DETAIL_BY_LOCALE[locale](entry);
}
