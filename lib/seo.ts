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
}

const CONTENT_ROOTS: Record<ContentRef['kind'], string> = {
  route: path.join(process.cwd(), 'content', 'routes'),
  page: path.join(process.cwd(), 'content', 'pages'),
  blog: path.join(process.cwd(), 'content', 'blog'),
}

/**
 * D-07 gate: true when a genuine, locale-specific translation file exists
 * for the given content reference. Validates `locale` against
 * `routing.locales` BEFORE any path.join/fs.existsSync — mirrors the V5
 * guard already used by lib/blog.ts/lib/route-content.ts/lib/page-content.ts
 * — never builds a filesystem path from an unrecognized locale string.
 */
function hasLocaleContent(ref: ContentRef, locale: string): boolean {
  if (!(routing.locales as readonly string[]).includes(locale)) return false
  const ext = ref.kind === 'blog' ? 'mdx' : 'json'
  const root = CONTENT_ROOTS[ref.kind]
  return fs.existsSync(path.join(root, locale, `${ref.key}.${ext}`))
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
  const canonical = normPath === '' ? BASE : normPath

  // D-06: noindex pages emit no hreflang cluster at all.
  if (opts.indexable === false) {
    return { canonical, languages: {} }
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

  return { canonical, languages }
}
