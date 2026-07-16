import { defineConfig } from 'astro/config';
import { DEFAULT_LOCALE, LOCALES } from './src/i18n/locales.ts';

export default defineConfig({
  // Astro's i18n routing requires an explicit root route; redirect / to the
  // default locale.
  redirects: {
    '/': `/${DEFAULT_LOCALE}`,
  },
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
