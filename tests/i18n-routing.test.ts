/**
 * i18n-routing.test.ts — Phase 68 Plan 01, Task 2 (I18N-04)
 *
 * Locks the typed single-source locale config contract: the 7-locale set,
 * defaultLocale, localePrefix, localeDetection, rtlLocales, and hasLocale()
 * behavior consumed by middleware.ts and both root layouts.
 */

import { describe, it, expect } from 'vitest'
import { hasLocale } from 'next-intl'
import { routing, locales, rtlLocales, type AppLocale } from '@/i18n/routing'

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
})
