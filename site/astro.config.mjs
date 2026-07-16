// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
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
