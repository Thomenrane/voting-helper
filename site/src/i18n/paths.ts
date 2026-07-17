/**
 * Locale-aware path resolution (#20) — used by the language switcher and the
 * hreflang alternates. Pure string logic, no Astro dependency.
 */
import { LOCALES, type Locale } from './locales.ts';

function isLocale(segment: string): segment is Locale {
  return (LOCALES as readonly string[]).includes(segment);
}

/**
 * Return `pathname` addressed to `locale`: its leading locale segment is
 * swapped, or the locale is prefixed when the path carries none. The rest of
 * the path is preserved; trailing slashes are normalised away (the site uses
 * Astro's default `trailingSlash: 'ignore'`).
 */
export function localizePath(pathname: string, locale: Locale): string {
  const segments = pathname.split('/').filter((segment) => segment !== '');
  const first = segments[0];
  if (first !== undefined && isLocale(first)) {
    segments[0] = locale;
  } else {
    segments.unshift(locale);
  }
  return `/${segments.join('/')}`;
}
