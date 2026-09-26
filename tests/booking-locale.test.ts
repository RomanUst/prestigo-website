import { describe, it, expect } from 'vitest'
import { locales } from '@/i18n/locales'
import { STRIPE_ELEMENTS_LOCALE, PLACES_LANGUAGE } from '@/lib/booking-locale'

describe('D-07: STRIPE_ELEMENTS_LOCALE', () => {
  it('has exactly the 7 AppLocale keys', () => {
    expect(Object.keys(STRIPE_ELEMENTS_LOCALE).sort()).toEqual([...locales].sort())
  })

  it('hi maps to "auto" (Stripe has no Hindi locale)', () => {
    expect(STRIPE_ELEMENTS_LOCALE.hi).toBe('auto')
  })

  it('every other locale maps to itself', () => {
    for (const loc of locales) {
      if (loc === 'hi') continue
      expect(STRIPE_ELEMENTS_LOCALE[loc]).toBe(loc)
    }
  })

  it('no value is the literal string "hi" (Stripe would reject it)', () => {
    expect(Object.values(STRIPE_ELEMENTS_LOCALE)).not.toContain('hi')
  })
})

describe('D-07: PLACES_LANGUAGE', () => {
  it('has exactly the 7 AppLocale keys', () => {
    expect(Object.keys(PLACES_LANGUAGE).sort()).toEqual([...locales].sort())
  })

  it('zh maps to "zh-CN" (Simplified)', () => {
    expect(PLACES_LANGUAGE.zh).toBe('zh-CN')
  })

  it('every other locale maps to itself, including hi', () => {
    for (const loc of locales) {
      if (loc === 'zh') continue
      expect(PLACES_LANGUAGE[loc]).toBe(loc)
    }
  })
})
