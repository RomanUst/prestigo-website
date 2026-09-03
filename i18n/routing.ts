/**
 * Central i18n routing config.
 *
 * Single source of truth for the 7 supported locales (I18N-04).
 * Consumed by:
 *   - middleware.ts (composed next-intl locale routing)
 *   - i18n/request.ts (getRequestConfig locale resolution)
 *   - app/[locale]/layout.tsx (hasLocale guard, <html lang dir>)
 *
 * localePrefix: 'as-needed' — the default locale (en) resolves at the root
 * with no /en prefix; every other locale is prefixed (/ru, /es, ...).
 * localeDetection stays false this phase — UX-02 (Accept-Language
 * auto-detect) is explicitly Phase 74 scope. Do not flip this on early.
 */
import { defineRouting } from 'next-intl/routing'

export const locales = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
export type AppLocale = (typeof locales)[number]

export const rtlLocales: readonly AppLocale[] = ['ar']

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: false,
})
