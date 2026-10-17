import { describe, expect, it } from 'vitest'
import { E164_RE, isValidIntlPhone, normalizePhone } from '@/lib/phone'

describe('normalizePhone', () => {
  it.each([
    ['+420 725 123 456', '+420725123456'],
    ['+420-725-123-456', '+420725123456'],
    ['(+44) 20 7946 0958', '+442079460958'],
    ['00420725123456', '+420725123456'],
    ['  +1 (415) 555-2671 ', '+14155552671'],
    ['+4.9.30.1234567', '+49301234567'],
  ])('accepts %s as %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
    expect(E164_RE.test(expected)).toBe(true)
  })

  it.each([
    ['725123456', 'local number without country code'],
    ['420725123456', 'country code without +'],
    ['+0725123456', 'country code cannot start with 0'],
    ['+1234567', 'too short'],
    ['+1234567890123456', 'too long'],
    ['+420 72a 123 456', 'letters'],
    ['', 'empty'],
    ['   ', 'blank'],
  ])('rejects %s (%s)', (raw) => {
    expect(normalizePhone(raw)).toBeNull()
    expect(isValidIntlPhone(raw)).toBe(false)
  })

  describe('national trunk prefix', () => {
    it.each([
      ['+44 (0) 20 7946 0958', '+442079460958'],
      ['+44(0)20 7946 0958', '+442079460958'],
      ['+49 (0)30 1234567', '+49301234567'],
      ['0044 (0) 20 7946 0958', '+442079460958'],
      ['+44 020 7946 0958', '+442079460958'],
      ['+49 030 1234567', '+49301234567'],
      ['+43 01 234 5678', '+4312345678'],
      ['+41 044 668 18 00', '+41446681800'],
      ['+31 06 12345678', '+31612345678'],
      ['+32 0475 12 34 56', '+32475123456'],
      ['+33 01 23 45 67 89', '+33123456789'],
      ['+36 06 1 234 5678', '+36612345678'],
      ['+48 022 123 45 67', '+48221234567'],
    ])('drops the trunk 0 in %s', (raw, expected) => {
      expect(normalizePhone(raw)).toBe(expected)
    })

    it('keeps the leading 0 of Italian numbers', () => {
      expect(normalizePhone('+39 06 1234 5678')).toBe('+390612345678')
      expect(normalizePhone('0039 02 1234 5678')).toBe('+390212345678')
    })

    it('keeps a zero that is not directly after the country code', () => {
      expect(normalizePhone('+44 20 7046 0958')).toBe('+442070460958')
      expect(normalizePhone('+1 (415) 505-2671')).toBe('+14155052671')
    })

    it.each([
      ['+420 0725 986 855'],
      ['+4200725986855'],
      ['00420 0725 986 855'],
      ['+421 0905 123 456'],
    ])('rejects a 0 after the Czech/Slovak code: %s', (raw) => {
      expect(normalizePhone(raw)).toBeNull()
    })

    it('accepts the explicit (0) notation for any code', () => {
      expect(normalizePhone('+420 (0) 725 986 855')).toBe('+420725986855')
    })
  })

  describe('non-Latin keyboards and pasted text', () => {
    it.each([
      ['Arabic-Indic digits', '+٤٢٠ ٧٢٥ ٩٨٦ ٨٥٥'],
      ['Extended Arabic-Indic (Persian/Urdu) digits', '+۴۲۰ ۷۲۵ ۹۸۶ ۸۵۵'],
      ['Devanagari digits', '+४२० ७२५ ९८६ ८५५'],
      ['fullwidth digits', '+４２０７２５９８６８５５'],
      ['fullwidth plus', '＋420725986855'],
      ['fullwidth plus and digits', '＋４２０ ７２５ ９８６ ８５５'],
      ['Unicode dashes', '+420–725—986‑855'],
      ['minus sign', '+420−725−986−855'],
      ['fullwidth hyphen and brackets', '（+420）725－986－855'],
      ['no-break and ideographic spaces', '+420\u00a0725\u3000986\u2009855'],
      ['LRM / RLM marks', '\u200e+420 725 986 855\u200f'],
      ['embedding marks LRE..PDF', '\u202a+420 725 986 855\u202c'],
      ['bidi isolates', '\u2066+420 725 986 855\u2069'],
      ['Arabic letter mark and BOM', '\ufeff\u061c+420 725 986 855'],
      ['Arabic-Indic digits with RTL marks', '\u200f+٤٢٠\u00a0٧٢٥\u200f٩٨٦\u200f٨٥٥'],
      ['Arabic-Indic digits with 00 prefix', '٠٠٤٢٠٧٢٥٩٨٦٨٥٥'],
    ])('accepts %s', (_label, raw) => {
      expect(normalizePhone(raw)).toBe('+420725986855')
    })

    it('still rejects letters and look-alike digits that are not decimal digits', () => {
      expect(normalizePhone('+420 72a 986 855')).toBeNull()
      expect(normalizePhone('+420 ⑦25 986 855')).toBeNull()
      expect(normalizePhone('+٤٢٠ ٧٢a ٩٨٦ ٨٥٥')).toBeNull()
    })

    it('still rejects non-Latin digits without a country code', () => {
      expect(normalizePhone('٧٢٥٩٨٦٨٥٥')).toBeNull()
      expect(normalizePhone('७२५९८६८५५')).toBeNull()
    })
  })

  it('rejects non-strings', () => {
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})
