/**
 * site-locale.test.ts — Phase 75 Plan 04, Task 1
 *
 * Covers VER-01 (D-10): siteLocaleFromPathname / normalizeSiteLocale in
 * i18n/locales.ts, the shared derivation feeding GA4's persistent
 * `site_locale` param.
 */
import { describe, it, expect } from 'vitest'
import { siteLocaleFromPathname, normalizeSiteLocale } from '@/i18n/locales'

describe('siteLocaleFromPathname', () => {
  it('returns the first path segment when it is a known locale', () => {
    expect(siteLocaleFromPathname('/ru/book')).toBe('ru')
    expect(siteLocaleFromPathname('/zh')).toBe('zh')
    expect(siteLocaleFromPathname('/ar/routes/prague-vienna')).toBe('ar')
  })

  it('returns en for the unprefixed root', () => {
    expect(siteLocaleFromPathname('/')).toBe('en')
    expect(siteLocaleFromPathname('')).toBe('en')
  })

  it('returns en for null/undefined', () => {
    expect(siteLocaleFromPathname(null)).toBe('en')
    expect(siteLocaleFromPathname(undefined)).toBe('en')
  })

  it('is case-sensitive — an uppercase locale segment falls back to en', () => {
    expect(siteLocaleFromPathname('/RU/book')).toBe('en')
  })

  it('returns en for an unknown segment', () => {
    expect(siteLocaleFromPathname('/russia')).toBe('en')
    expect(siteLocaleFromPathname('/book')).toBe('en')
  })
})

describe('normalizeSiteLocale', () => {
  it('returns the value when it is a known locale', () => {
    expect(normalizeSiteLocale('hi')).toBe('hi')
  })

  it('falls back to en for undefined, empty string, unknown, non-string, oversized input', () => {
    expect(normalizeSiteLocale(undefined)).toBe('en')
    expect(normalizeSiteLocale('')).toBe('en')
    expect(normalizeSiteLocale('xx')).toBe('en')
    expect(normalizeSiteLocale(42)).toBe('en')
    expect(normalizeSiteLocale('a'.repeat(1000))).toBe('en')
  })
})
