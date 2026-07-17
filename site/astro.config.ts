import { defineConfig } from 'astro/config';
import { DEFAULT_LOCALE, LOCALES } from './src/i18n/locales.ts';

// Production origin (Cloudflare Pages) — hreflang alternates and any future
// canonical/sitemap URLs derive from it. Update with the definitive domain.
const SITE = 'https://voting-helper.pages.dev';

export default defineConfig({
  site: SITE,
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
