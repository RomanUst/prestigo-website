/**
 * SEO utilities for Prestigo.
 *
 * Usage — full hreflang cluster on an indexable, content-backed page:
 *
 *   import { getAlternates } from '@/lib/seo'
 *
 *   export const metadata: Metadata = {
 *     alternates: getAlternates('/routes/prague-berlin', {
 *       indexable: true,
 *       content: { kind: 'route', key: 'prague-berlin' },
 *     }),
 *     ...
 *   }
 *
 * getAlternates(path, opts) is the single source of truth consumed by both
 * per-page generateMetadata() and app/sitemap.ts — they can never diverge.
 *
 *   opts.indexable === false  -> D-06: no hreflang cluster is ever emitted
 *                                 on a noindex page (languages: {}), but the
 *                                 page stays self-canonical.
 *   opts.content               -> D-07: only locales with a genuine
 *                                 translation file join the cluster (`en`
 *                                 always included). Omit `content` entirely
 *                                 for chrome-only pages with no content
 *                                 model (e.g. /book) — all locales are
 *                                 assumed valid since UI chrome is already
 *                                 externalized via message catalogs.
 *
 * Every locale URL is resolved through the i18n/routing navigation bridge's
 * getPathname() — never hand-rolled `${locale}${path}` string concatenation.
 */

import fs from 'node:fs'
import path from 'node:path'
import { routing, getPathname } from '@/i18n/routing'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'

const BASE = 'https://rideprestigo.com'

interface AlternatesConfig {
  canonical: string
  languages: Record<string, string>
}

export type ContentRef = { kind: 'route' | 'page' | 'blog'; key: string }

interface GetAlternatesOpts {
  /** false => noindex page: emit no hreflang cluster at all (D-06). */
  indexable?: boolean
  /** Content-model reference used to probe per-locale translation presence (D-07). */
  content?: ContentRef
  /**
   * CR-01: the locale the page is currently rendering under. When supplied
   * AND it resolves to a genuine member of the page's `languages` cluster
   * (a real translation, or any locale for a chrome-only page with no
   * `content` ref), `canonical` self-references that locale's own absolute
   * URL instead of the plain EN path — required so a page never advertises
   * itself as a legitimate hreflang alternate while also declaring the EN
   * URL as its own canonical (Google treats that as contradictory and may
   * drop the non-EN URL from the index).
   *
   * Deliberately typed `string` (not `AppLocale`) so every call site can
   * pass its already-resolved `locale` variable (from `getLocale()` or
   * `(await params).locale`, both plain `string`) with no cast — validated
   * internally against `routing.locales` before use, mirroring the
   * `hasLocaleContent()` guard below.
   *
   * Omitted, invalid, or resolving to 'en'/an unavailable locale (D-07
   * EN-fallback) -> `canonical` is byte-identical to the pre-CR-01 output
   * (the relative EN-form path) so every existing caller — above all
   * app/sitemap.ts, which never passes `locale` — sees no change at all.
   */
  locale?: string
}

// One module-level constant per content kind, each a literal
// path.join(process.cwd(), 'content', '<kind>') — mirrors lib/page-content.ts
// and lib/route-content.ts. A lookup table here made the root dynamic, so
// Turbopack's file tracer could not scope it and traced the whole project
// into every server function that imports this module.
const ROUTES_ROOT = path.join(process.cwd(), 'content', 'routes')
const PAGES_ROOT = path.join(process.cwd(), 'content', 'pages')
const BLOG_ROOT = path.join(process.cwd(), 'content', 'blog')

/**
 * D-07 gate: true when a genuine, locale-specific translation file exists
 * for the given content reference. Validates `locale` against
 * `routing.locales` BEFORE any path.join/fs.existsSync — mirrors the V5
 * guard already used by lib/blog.ts/lib/route-content.ts/lib/page-content.ts
 * — never builds a filesystem path from an unrecognized locale string.
 */
function hasLocaleContent(ref: ContentRef, locale: string): boolean {
  if (!(routing.locales as readonly string[]).includes(locale)) return false
  switch (ref.kind) {
    case 'route':
      return fs.existsSync(path.join(ROUTES_ROOT, locale, `${ref.key}.json`))
    case 'page':
      return fs.existsSync(path.join(PAGES_ROOT, locale, `${ref.key}.json`))
    case 'blog':
      return fs.existsSync(path.join(BLOG_ROOT, locale, `${ref.key}.mdx`))
  }
}

/**
 * Returns a Next.js metadata `alternates` object: a full hreflang cluster
 * (one key per available locale, BCP-47 tagged, plus x-default) when the
 * page is indexable, or an empty cluster with a preserved self-canonical
 * when it is not (D-06).
 *
 * @param canonicalPath - Absolute path starting with '/', e.g. '/routes/prague-vienna'.
 *                        Pass '' or '/' for the home page. This is also the
 *                        path every locale alternate is resolved against —
 *                        callers that need a cross-canonical (e.g. a page
 *                        whose own URL differs from the path it canonicalizes
 *                        to) pass that target path here, matching the
 *                        pre-existing single-argument convention.
 */
export function getAlternates(
  canonicalPath: string,
  opts: GetAlternatesOpts = {}
): AlternatesConfig {
  const normPath = canonicalPath === '/' ? '' : canonicalPath
  const fullUrl = normPath === '' ? BASE : `${BASE}${normPath}`
  // Pre-CR-01 relative-path canonical form — preserved byte-for-byte as the
  // fallback for every case that isn't a genuine self-referencing non-EN
  // locale (see canonical computation below).
  const fallbackCanonical = normPath === '' ? BASE : normPath

  // D-06: noindex pages emit no hreflang cluster at all. Canonical shape is
  // left exactly as before — noindex pages are excluded from the
  // self-referencing-canonical requirement entirely (D-06/CR-01: no churn).
  if (opts.indexable === false) {
    return { canonical: fallbackCanonical, languages: {} }
  }

  // D-07: only locales with a genuine translation (or 'en', the canonical
  // source locale) join the cluster. No content ref supplied -> chrome-only
  // page, all locales assumed valid (UI chrome is already externalized).
  const availableLocales: readonly AppLocale[] = opts.content
    ? routing.locales.filter((locale) => locale === 'en' || hasLocaleContent(opts.content!, locale))
    : routing.locales

  const href = normPath === '' ? '/' : canonicalPath
  const languages: Record<string, string> = {}
  for (const locale of availableLocales) {
    const localizedPath = getPathname({ locale, href })
    // getPathname('/') returns the bare '/' for the default locale (en) —
    // collapse that to the root URL with no trailing slash, matching the
    // canonical/x-default URL shape for the home page.
    languages[BCP47_TAG[locale]] = BASE + (localizedPath === '/' ? '' : localizedPath)
  }
  languages['x-default'] = fullUrl

  // CR-01: self-referencing canonical. `opts.locale` must be (a) a real
  // routing locale and (b) present in this page's available cluster (a
  // genuine translation, or any locale for a chrome-only page) before it is
  // trusted — an invalid/omitted/unavailable locale, or the literal 'en',
  // all fall through to `fallbackCanonical` (byte-identical to today).
  const availableLocaleSet = availableLocales as readonly string[]
  const selfLocale: AppLocale | null =
    opts.locale && opts.locale !== 'en' && availableLocaleSet.includes(opts.locale)
      ? (opts.locale as AppLocale)
      : null

  const canonical = selfLocale
    ? (() => {
        const localizedPath = getPathname({ locale: selfLocale, href })
        return localizedPath === '/' ? BASE : BASE + localizedPath
      })()
    : fallbackCanonical

  return { canonical, languages }
}

/**
 * Normalizes an `AlternatesConfig.canonical` value to an absolute URL.
 *
 * `canonical` is deliberately relative in the EN/no-locale/D-07-fallback
 * case (resolved by Next.js against `metadataBase`) but absolute in the
 * CR-01 self-referencing non-EN case. `openGraph.url` in this codebase is
 * always written as a literal absolute string (WR-02) — this normalizes
 * both shapes to that one form without changing the EN/no-locale output
 * (still `${BASE}${relativePath}`, identical to what every page previously
 * hardcoded).
 */
export function toAbsoluteUrl(canonical: string): string {
  return canonical.startsWith('http') ? canonical : `${BASE}${canonical}`
}
