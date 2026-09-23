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
