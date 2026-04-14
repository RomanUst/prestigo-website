/**
 * SEO utilities for Prestigo.
 *
 * Usage — self-referencing hreflang on any page:
 *
 *   import { getAlternates } from '@/lib/seo'
 *
 *   export const metadata: Metadata = {
 *     alternates: getAlternates('/routes/prague-berlin'),
 *     ...
 *   }
 *
 * When adding a new language (e.g. /de/ or /cs/), extend the `languages`
 * object here and add the language-specific canonical to each page's
 * getAlternates call. No per-page boilerplate needed beyond that.
 */

const BASE = 'https://rideprestigo.com'

interface AlternatesConfig {
  canonical: string
  languages: Record<string, string>
}

/**
 * Return a Next.js metadata `alternates` object with self-referencing
 * hreflang="en" and hreflang="x-default" for the given path.
 *
 * @param canonicalPath - Absolute path starting with '/', e.g. '/routes/prague-vienna'.
 *                        Pass '' or '/' for the home page.
 */
export function getAlternates(canonicalPath: string): AlternatesConfig {
  const normPath = canonicalPath === '/' ? '' : canonicalPath
  const fullUrl = normPath === '' ? BASE : `${BASE}${normPath}`

  return {
    canonical: normPath === '' ? BASE : normPath,
    languages: {
      en: fullUrl,
      'x-default': fullUrl,
    },
  }
}
