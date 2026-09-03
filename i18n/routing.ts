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

/**
 * Strips a configured locale segment from the front of a pathname, e.g.
 * '/ru/account' -> '/account', '/ru' -> '/'. Returns the pathname unchanged
 * if the first segment isn't an EXACT, lowercase, configured locale code —
 * '/RU/account' and '/de/x' are both left untouched (RESEARCH.md Pattern 2).
 *
 * Lives here (not in middleware.ts) so it has no dependency on
 * `next-intl/middleware`/`next/server` and can be imported by plain unit
 * tests (tests/i18n-routing.test.ts) without pulling in the Edge-only
 * `next/server` module. middleware.ts imports this single implementation
 * rather than redeclaring it — I18N-04 single-source discipline.
 */
export function stripLocalePrefix(pathname: string, allowedLocales: readonly string[]): string {
  const seg = pathname.split('/')[1]
  if (allowedLocales.includes(seg)) {
    const rest = pathname.slice(seg.length + 1)
    return rest === '' ? '/' : rest
  }
  return pathname
}
