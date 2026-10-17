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

  it('rejects non-strings', () => {
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})
