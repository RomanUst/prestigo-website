/**
 * Phase 75, Plan 34 (WR-04) — formatLocaleDate renders post / card dates in
 * the page locale's own format. EN stays byte-identical to the historical
 * en-GB byline date (lib/authors formatBylineDate); every locale uses Latin
 * digits (site-wide DNT digit convention), zh uses its native Y年M月D日 order.
 */
import { describe, expect, it } from 'vitest'
import { formatLocaleDate } from '@/lib/locale-date'
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
