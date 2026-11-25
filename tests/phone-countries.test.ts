import { describe, it, expect } from 'vitest'
import { composePhone, splitPhone, guessCountry, flagEmoji, DIAL_CODES, POPULAR_COUNTRIES } from '@/lib/phone-countries'
import { isValidIntlPhone } from '@/lib/phone'

describe('composePhone', () => {
  it('turns a UK number typed the British way into E.164', () => {
    expect(composePhone('GB', '07700 900123')).toBe('+447700900123')
    expect(composePhone('GB', '7700 900123')).toBe('+447700900123')
  })

  it('keeps Czech numbers as typed', () => {
    expect(composePhone('CZ', '725 123 456')).toBe('+420725123456')
  })

  it('keeps the leading 0 for Italy', () => {
    expect(composePhone('IT', '06 1234 5678')).toBe('+390612345678')
  })

  it('drops the Russian 8 and the Hungarian 06 trunk prefixes', () => {
    expect(composePhone('RU', '8 916 123-45-67')).toBe('+79161234567')
    expect(composePhone('HU', '06 30 123 4567')).toBe('+36301234567')
  })

  it('returns "" for an empty number and an invalid string for a too-short one', () => {
    expect(composePhone('GB', '')).toBe('')
    expect(composePhone('GB', '  ')).toBe('')
    expect(isValidIntlPhone(composePhone('GB', '12'))).toBe(false)
  })
})

describe('splitPhone', () => {
  it('splits a full number into country and national part', () => {
    expect(splitPhone('+44 7700 900123')).toEqual({ iso: 'GB', national: '7700900123' })
    expect(splitPhone('00420 725 123 456')).toEqual({ iso: 'CZ', national: '725123456' })
  })

  it('reads +420 as Czechia, not a shorter code', () => {
    expect(splitPhone('+420725123456')?.iso).toBe('CZ')
  })

  it('keeps the chosen country when the code is shared', () => {
    expect(splitPhone('+447797123456', 'JE')?.iso).toBe('JE')
    expect(splitPhone('+447797123456')?.iso).toBe('GB')
    expect(splitPhone('+14165550123', 'CA')?.iso).toBe('CA')
  })

  it('returns null without a country code', () => {
    expect(splitPhone('07700 900123')).toBeNull()
  })
})

describe('guessCountry', () => {
  it('takes the region from the browser languages', () => {
    expect(guessCountry(['en-GB', 'en'])).toBe('GB')
    expect(guessCountry(['zh-Hant-TW'])).toBe('TW')
    expect(guessCountry(['en'])).toBeNull()
    expect(guessCountry(undefined)).toBeNull()
  })
})

describe('country data', () => {
  it('has a calling code for every popular country and builds flags', () => {
    for (const iso of POPULAR_COUNTRIES) expect(DIAL_CODES[iso]).toMatch(/^\d{1,3}$/)
    expect(flagEmoji('GB')).toBe('🇬🇧')
  })
})
