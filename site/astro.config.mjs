// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Astro's i18n routing requires an explicit root route; redirect / to the
  // default locale.
  redirects: {
    '/': '/fr',
  },
  i18n: {
    locales: ['fr', 'nl'],
    defaultLocale: 'fr',
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
