/**
 * Locale list + type — single source of truth (I18N-04), extracted out of
 * i18n/routing.ts so plain Node scripts (e.g. scripts/i18n-translate.mjs,
 * scripts/lib/i18n-glossary.mjs) can import the locale list without pulling
 * in next-intl/navigation's Next.js-only module-resolution graph.
 *
 * i18n/routing.ts re-exports these symbols unchanged — every existing
 * consumer (middleware.ts, app/[locale]/layout.tsx, components, etc.)
 * continues to import from 'i18n/routing' with no change required.
 *
 * This file must never import next-intl, next/*, or React — that is
 * precisely the constraint that makes it safely importable from a plain
 * `node scripts/*.mjs` invocation (Phase 72, Plan 01).
 */

export const locales = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
export type AppLocale = (typeof locales)[number]

export const rtlLocales: readonly AppLocale[] = ['ar']

/**
 * Endonym labels — each language named in itself (UX-01 D-02). Structural
 * config, not translated UI copy, so it lives here rather than in
 * messages/*.json (matches the established "structural config never moves
 * into message JSON" convention, Phase 69).
 */
export const LOCALE_ENDONYMS: Record<AppLocale, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  ar: 'العربية',
  hi: 'हिन्दी',
  zh: '中文',
} as const

/**
 * BCP-47 language tags used for hreflang alternates (lib/seo.ts) and JSON-LD
 * `inLanguage` (lib/jsonld.ts). Every locale maps to itself except `zh`,
 * which maps to the explicit Simplified Chinese script subtag `zh-Hans` —
 * bare `zh` is ambiguous per Google's hreflang guidance and defaults to the
 * "predominant Mandarin form," whereas `zh-Hans` unambiguously targets
 * Simplified Chinese script regardless of country (SEO-04, matches the
 * project's Noto Sans SC font choice shipped in Phase 73).
 */
export const BCP47_TAG: Record<AppLocale, string> = {
  en: 'en',
  ru: 'ru',
  es: 'es',
  fr: 'fr',
  ar: 'ar',
  hi: 'hi',
  zh: 'zh-Hans',
} as const

/**
 * Derives the site locale (GA4/Meta `site_locale` dimension, D-10/D-12) from
 * a URL pathname — the first non-empty path segment when it is an exact
 * (case-sensitive) member of `locales`, else `'en'` (EN is the unprefixed
 * root locale under `localePrefix: 'as-needed'`, Phase 68). Never throws,
 * never returns undefined — every edge case (empty string, '/', null,
 * undefined, a case-mismatched or unknown segment) resolves to 'en'.
 *
 * Deliberately does NOT read the browser's `navigator.language` — D-10
 * requires the *site* locale (what the user is actually viewing), not their
 * browser/OS language preference, which GA4's built-in `language` dimension
 * already captures separately.
 */
export function siteLocaleFromPathname(
  pathname: string | null | undefined
): AppLocale {
  if (!pathname) return 'en'
  const firstSegment = pathname.split('/').find((segment) => segment.length > 0)
  if (firstSegment && (locales as readonly string[]).includes(firstSegment)) {
    return firstSegment as AppLocale
  }
  return 'en'
}

/**
 * Normalizes an arbitrary value (query param, stored preference, etc.) to a
 * valid AppLocale — an exact (case-sensitive) member of `locales`, else
 * `'en'`. Accepts `unknown` so callers never need a type guard before
 * calling it; non-string, empty, unknown, or oversized inputs all fall back
 * to 'en' rather than throwing.
 */
export function normalizeSiteLocale(value: unknown): AppLocale {
  if (typeof value === 'string' && (locales as readonly string[]).includes(value)) {
    return value as AppLocale
  }
  return 'en'
}
