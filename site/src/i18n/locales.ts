/**
 * Locale registry — single source of truth for the Astro i18n config
 * (astro.config.ts) and the UI string dictionary (ui.ts).
 */
export const LOCALES = ['fr', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
