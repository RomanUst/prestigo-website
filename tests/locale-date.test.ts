/**
 * Phase 75, Plan 34 (WR-04) — formatLocaleDate renders post / card dates in
 * the page locale's own format. EN stays byte-identical to the historical
 * en-GB byline date (lib/authors formatBylineDate); every locale uses Latin
 * digits (site-wide DNT digit convention), zh uses its native Y年M月D日 order.
 */
import { describe, expect, it } from 'vitest'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { formatBylineDate } from '@/lib/authors'

const NON_EN = ['ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
const EN_MONTHS =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/
const NON_LATIN_DIGITS = /[٠-٩۰-۹०-९]/

describe('formatLocaleDate', () => {
  it('EN is byte-identical to the historical byline date', () => {
    expect(formatLocaleDate('2026-04-09', 'en')).toBe('9 April 2026')
    expect(formatLocaleDate('2026-04-09', 'en')).toBe(formatBylineDate('2026-04-09'))
    expect(formatLocaleDate('2026-07-13', 'en')).toBe(formatBylineDate('2026-07-13'))
  })

  it('falls back to the en-GB form for an unknown locale', () => {
    expect(formatLocaleDate('2026-04-09', 'xx')).toBe('9 April 2026')
    expect(formatLocaleDate('2026-04-09', '')).toBe('9 April 2026')
  })

  for (const locale of NON_EN) {
    it(`${locale}: localized month, year present, Latin digits only`, () => {
      for (const iso of ['2026-04-09', '2026-07-13', '2026-12-31']) {
        const out = formatLocaleDate(iso, locale)
        expect(out, `${locale} ${iso}`).toContain('2026')
        expect(out, `${locale} ${iso}`).not.toMatch(EN_MONTHS)
        expect(out, `${locale} ${iso}`).not.toMatch(NON_LATIN_DIGITS)
      }
    })
  }

  it('uses each locale’s own month names / order', () => {
    expect(formatLocaleDate('2026-04-09', 'ru')).toContain('апреля')
    expect(formatLocaleDate('2026-04-09', 'es')).toContain('abril')
    expect(formatLocaleDate('2026-04-09', 'fr')).toContain('avril')
    expect(formatLocaleDate('2026-04-09', 'zh')).toContain('年')
    expect(formatLocaleDate('2026-04-09', 'zh')).toBe('2026年4月9日')
  })

  it('formats in UTC (no off-by-one day from the runtime timezone)', () => {
    expect(formatLocaleDate('2026-01-01', 'en')).toBe('1 January 2026')
    expect(formatLocaleDate('2026-01-01', 'fr')).toBe('1 janvier 2026')
  })
})

describe('formatLocaleDateTime (Phase 89: free-until instant on the Prague wall clock)', () => {
  // 2026-11-14 08:05 UTC is 09:05 in Prague (CET, UTC+1); 2026-07-14 08:05 UTC is 10:05 (CEST, UTC+2).
  const winter = Date.parse('2026-11-14T08:05:00Z')
  const summer = Date.parse('2026-07-14T08:05:00Z')

  for (const locale of ['en', ...NON_EN]) {
    it(`${locale}: Prague time with Latin digits`, () => {
      const out = formatLocaleDateTime(winter, locale)
      expect(out).toContain('09:05')
      expect(out).toContain('2026')
      expect(out).not.toMatch(NON_LATIN_DIGITS)
    })
  }

  it('follows daylight saving time and keeps the day in Prague', () => {
    expect(formatLocaleDateTime(summer, 'en')).toContain('10:05')
    expect(formatLocaleDateTime(Date.parse('2026-11-14T23:30:00Z'), 'en')).toContain('15 November 2026')
  })

  it('gives an empty string for an unusable instant and English for an unknown locale', () => {
    expect(formatLocaleDateTime(Number.NaN, 'en')).toBe('')
    expect(formatLocaleDateTime(winter, 'xx')).toBe(formatLocaleDateTime(winter, 'en'))
  })
})
