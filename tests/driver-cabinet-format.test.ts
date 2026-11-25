import { describe, it, expect } from 'vitest'
import { formatCZK } from '@/lib/currency'
import {
  driverFeeLabel,
  dropoffText,
  firstNameOf,
  plateLabel,
  pragueDayLabel,
  placeLabel,
} from '@/lib/driver-cabinet/format'

// Phase 94 plan 94-03 (D-11, D-12): pure label helpers shared by the offers and rides lists.

describe('driverFeeLabel', () => {
  it('formats a positive integer with formatCZK', () => {
    expect(driverFeeLabel(2500)).toBe(formatCZK(2500))
    expect(driverFeeLabel(1)).toBe(formatCZK(1))
  })

  it.each([0, -5, 12.5, null, undefined, '2500', NaN, Infinity, {}])('is null for %s', (v) => {
    expect(driverFeeLabel(v)).toBeNull()
  })
})

describe('firstNameOf', () => {
  it('trims and caps at 60 characters', () => {
    expect(firstNameOf('  Jan  ')).toBe('Jan')
    expect(firstNameOf('x'.repeat(100))).toHaveLength(60)
  })
  it('is empty for null / undefined / blank', () => {
    expect(firstNameOf(null)).toBe('')
    expect(firstNameOf(undefined)).toBe('')
    expect(firstNameOf('   ')).toBe('')
  })
})

describe('pragueDayLabel', () => {
  const today = '2026-11-25'
  it('Today and Tomorrow', () => {
    expect(pragueDayLabel('2026-11-25', today)).toBe('Today')
    expect(pragueDayLabel('2026-11-26', today)).toBe('Tomorrow')
  })
  it('a later date in the same year has no year', () => {
    expect(pragueDayLabel('2026-11-27', today)).toBe('Fri 27 Nov')
  })
  it('a date in another year carries the year', () => {
    expect(pragueDayLabel('2027-01-08', today)).toBe('Fri 8 Jan 2027')
  })
  it('Tomorrow works across a year end', () => {
    expect(pragueDayLabel('2027-01-01', '2026-12-31')).toBe('Tomorrow')
  })
  it('DST boundaries give the right weekday', () => {
    expect(pragueDayLabel('2026-10-25', today)).toBe('Sun 25 Oct')
    expect(pragueDayLabel('2027-03-28', today)).toBe('Sun 28 Mar 2027')
  })
  it('returns the input for an unparsable date instead of throwing', () => {
    expect(pragueDayLabel('not-a-date', today)).toBe('not-a-date')
  })
})

describe('placeLabel', () => {
  it('keeps the text before the first comma', () => {
    expect(placeLabel('Václav Havel Airport Prague, Aviatická, Praha 6')).toBe('Václav Havel Airport Prague')
  })
  it('cuts a long first part to 28 characters ending in an ellipsis', () => {
    const out = placeLabel('x'.repeat(40) + ', Praha')
    expect(out).toHaveLength(28)
    expect(out.endsWith('…')).toBe(true)
  })
  it('honours a custom max', () => {
    expect(placeLabel('abcdefghij', 5)).toBe('abcd…')
  })
  it('is empty for null / undefined', () => {
    expect(placeLabel(null)).toBe('')
    expect(placeLabel(undefined)).toBe('')
  })
})

describe('dropoffText', () => {
  it('says As directed when empty', () => {
    expect(dropoffText('')).toBe('As directed')
    expect(dropoffText('   ')).toBe('As directed')
    expect(dropoffText(null)).toBe('As directed')
    expect(dropoffText(undefined)).toBe('As directed')
  })
  it('keeps a real address', () => {
    expect(dropoffText(' Hotel Alcron, Štěpánská 40 ')).toBe('Hotel Alcron, Štěpánská 40')
  })
})

describe('plateLabel', () => {
  it('upper-cases and trims', () => {
    expect(plateLabel(' 1ab 2345 ')).toBe('1AB 2345')
  })
  it('is null for empty values', () => {
    expect(plateLabel('')).toBeNull()
    expect(plateLabel('  ')).toBeNull()
    expect(plateLabel(null)).toBeNull()
    expect(plateLabel(undefined)).toBeNull()
  })
})
