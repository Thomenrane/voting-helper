/**
 * Locale registry — single source of truth for the Astro i18n config
 * (astro.config.ts) and the UI string dictionary (ui.ts).
 */
export const LOCALES = ['fr', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

/**
 * Native name of each locale — a language switcher names every language in
 * itself, so these are locale metadata, not per-locale UI strings.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  nl: 'Nederlands',
};
