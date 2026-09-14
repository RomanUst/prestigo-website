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
