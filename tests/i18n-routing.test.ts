/**
 * i18n-routing.test.ts — Phase 68 Plan 01, Task 2 (I18N-04)
 *
 * Locks the typed single-source locale config contract: the 7-locale set,
 * defaultLocale, localePrefix, localeDetection, rtlLocales, and hasLocale()
 * behavior consumed by middleware.ts and both root layouts.
 */

import { describe, it, expect } from 'vitest'
import { hasLocale } from 'next-intl'
import { routing, locales, rtlLocales, stripLocalePrefix, type AppLocale } from '@/i18n/routing'

describe('i18n/routing.ts — typed single-source locale config (I18N-04)', () => {
  it('locales deep-equals the 7-tuple in order', () => {
    expect(routing.locales).toEqual(['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'])
    expect(locales).toEqual(['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'])
  })

  it('defaultLocale is en', () => {
    expect(routing.defaultLocale).toBe('en')
  })

  it('localePrefix is as-needed', () => {
    expect(routing.localePrefix).toBe('as-needed')
  })

  it('localeDetection is false (UX-02 is explicitly Phase 74 scope)', () => {
    expect(routing.localeDetection).toBe(false)
  })

  it('rtlLocales contains exactly ar', () => {
    expect(rtlLocales).toEqual(['ar'])
  })

  it('hasLocale returns true for each of the 7 configured codes', () => {
    for (const code of locales) {
      expect(hasLocale(routing.locales, code)).toBe(true)
    }
  })

  it('hasLocale returns false for an unconfigured code', () => {
    expect(hasLocale(routing.locales, 'de')).toBe(false)
  })

  it('hasLocale returns false for an empty string', () => {
    expect(hasLocale(routing.locales, '')).toBe(false)
  })

  it('hasLocale returns false for undefined', () => {
    expect(hasLocale(routing.locales, undefined)).toBe(false)
  })

  it('AppLocale type is satisfied by every configured locale (compile-time check)', () => {
    const sample: AppLocale[] = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
    expect(sample).toEqual(locales)
  })

  it('hasLocale returns false for an unconfigured 2-letter prefix (xx) — used by the /xx/ 404 edge case', () => {
    expect(hasLocale(routing.locales, 'xx')).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// stripLocalePrefix — Phase 68 Plan 02, Task 1 (I18N-01/I18N-02/I18N-04 edges)
//
// Exported from i18n/routing.ts (single implementation, imported by
// middleware.ts — no duplication) and exercised directly here so the
// case-variant/unconfigured/adjacency edges are asserted against the exact
// function middleware.ts's isDynamicPath() and the Supabase pathname checks
// rely on, parametrized over routing.locales so the 7-locale set stays
// single-source (I18N-04).
// -----------------------------------------------------------------------------
describe('stripLocalePrefix — locale-prefix stripping edges (I18N-01/02/04)', () => {
  it('does NOT strip an uppercase locale-lookalike segment (/RU/account stays /RU/account) — defense-in-depth only', () => {
    // NOTE (accepted deviation, T-68-06, Task 3 checkpoint): in the live
    // request path, next-intl's own createMiddleware case-normalizes /RU
    // and 307-redirects to /ru BEFORE this helper is ever reached with the
    // original uppercase pathname — see
    // tests/middleware-i18n.test.ts#'edge: case-variant locale prefix
    // (/RU/) canonicalizes via redirect'. This unit test documents the
    // helper's own behavior in isolation (it never silently strips a
    // case-mismatched segment) as defense-in-depth, not the end-to-end
    // system behavior for a raw /RU/ request.
    expect(stripLocalePrefix('/RU/account', routing.locales)).toBe('/RU/account')
  })

  it('does NOT strip an unconfigured locale code (/de/x stays /de/x)', () => {
    expect(stripLocalePrefix('/de/x', routing.locales)).toBe('/de/x')
  })

  it('strips a bare configured locale segment to root (/ru -> /)', () => {
    expect(stripLocalePrefix('/ru', routing.locales)).toBe('/')
  })

  it('strips a configured locale prefix from a nested path (/ru/book -> /book)', () => {
    expect(stripLocalePrefix('/ru/book', routing.locales)).toBe('/book')
  })

  it.each(routing.locales.filter((l) => l !== 'en'))(
    'strips every non-default configured locale (/%s/book -> /book)',
    (locale) => {
      expect(stripLocalePrefix(`/${locale}/book`, routing.locales)).toBe('/book')
    }
  )

  it('adjacency: leaves a real route-lookalike first segment untouched (/routes)', () => {
    expect(stripLocalePrefix('/routes/prague-vienna', routing.locales)).toBe(
      '/routes/prague-vienna'
    )
  })

  it('adjacency: leaves a real route-lookalike first segment untouched (/services)', () => {
    expect(stripLocalePrefix('/services/airport-transfer', routing.locales)).toBe(
      '/services/airport-transfer'
    )
  })
})
