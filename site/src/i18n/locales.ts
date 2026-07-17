/**
 * Locale registry — single source of truth for the Astro i18n config
 * (astro.config.ts) and the UI string dictionary (ui.ts).
 */
export const LOCALES = ['fr', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

/** Type guard for untrusted locale values (URL segments, data attributes). */
export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/**
 * Native name of each locale — a language switcher names every language in
 * itself, so these are locale metadata, not per-locale UI strings.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  nl: 'Nederlands',
};
