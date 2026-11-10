// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  comparePickup,
  formatPragueTime,
  mondayOf,
  pragueDateOf,
  pragueDayStartMs,
  pragueMinuteOfDay,
} from '@/lib/prague-calendar'

/**
 * Phase 90 DISP-03: every dispatch date decision is made in Europe/Prague, never in the
 * process or browser timezone. The same assertions must hold under three process timezones
 * (UTC, far west, far east) and on both 2027 DST-change days (28 March, 31 October).
 */
const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Auckland'] as const

describe.each(ZONES)('prague-calendar under TZ=%s', (tz) => {
  const originalTz = process.env.TZ

  beforeAll(() => {
    process.env.TZ = tz
  })

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  describe('pragueDateOf', () => {
    it.each([
      ['2027-03-27T22:59:00Z', '2027-03-27'],
      ['2027-03-27T23:00:00Z', '2027-03-28'],
      ['2027-10-30T21:59:00Z', '2027-10-30'],
      ['2027-10-30T22:00:00Z', '2027-10-31'],
      ['2027-10-31T22:59:00Z', '2027-10-31'],
      ['2027-10-31T23:00:00Z', '2027-11-01'],
    ])('%s is Prague %s', (utc, day) => {
      expect(pragueDateOf(Date.parse(utc))).toBe(day)
    })
  })

  describe('pragueMinuteOfDay', () => {
    it('spring forward: 00:59Z is 01:59 and 01:00Z is 03:00 (02:xx does not exist)', () => {
      expect(pragueMinuteOfDay(Date.parse('2027-03-28T00:59:00Z'))).toBe(119)
      expect(pragueMinuteOfDay(Date.parse('2027-03-28T01:00:00Z'))).toBe(180)
    })

    it('fall back: both 02:30 occurrences are minute 150 on 2027-10-31', () => {
      const first = Date.parse('2027-10-31T00:30:00Z')
      const second = Date.parse('2027-10-31T01:30:00Z')
      expect(pragueMinuteOfDay(first)).toBe(150)
      expect(pragueMinuteOfDay(second)).toBe(150)
      expect(pragueDateOf(first)).toBe('2027-10-31')
      expect(pragueDateOf(second)).toBe('2027-10-31')
    })

    it('Prague midnight is minute 0', () => {
      expect(pragueMinuteOfDay(Date.parse('2027-10-30T22:00:00Z'))).toBe(0)
    })
  })

  describe('pragueDayStartMs', () => {
    it.each([
      ['2027-03-28', '2027-03-27T23:00:00Z'],
      ['2027-10-31', '2027-10-30T22:00:00Z'],
      ['2027-11-01', '2027-10-31T23:00:00Z'],
    ])('%s starts at %s', (day, utc) => {
      expect(pragueDayStartMs(day)).toBe(Date.parse(utc))
    })
  })

  describe('mondayOf', () => {
    it.each([
      ['2027-03-28', '2027-03-22'],
      ['2027-10-31', '2027-10-25'],
      ['2027-11-01', '2027-11-01'],
      ['2027-10-27', '2027-10-25'],
    ])('mondayOf(%s) is %s', (day, monday) => {
      expect(mondayOf(day)).toBe(monday)
    })
  })

  describe('formatPragueTime', () => {
    it('prints 24 h wall-clock time in Prague', () => {
      expect(formatPragueTime(Date.parse('2027-03-28T01:00:00Z'))).toBe('03:00')
      expect(formatPragueTime(Date.parse('2027-10-30T22:05:00Z'))).toBe('00:05')
      expect(formatPragueTime(Date.parse('2027-07-01T12:30:00Z'))).toBe('14:30')
    })
  })
})

describe('comparePickup', () => {
  const row = (booking_reference: string, pickup_utc: string | null, pickup_date = '2027-06-01', pickup_time = '10:00') => ({
    booking_reference,
    pickup_utc,
    pickup_date,
    pickup_time,
  })

  it('orders earlier instants first', () => {
    const a = row('PRG-2', '2027-06-01T08:00:00Z')
    const b = row('PRG-1', '2027-06-01T09:00:00Z')
    expect([b, a].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-2', 'PRG-1'])
  })

  it('breaks ties on booking_reference ascending, whatever the input order', () => {
    const a = row('PRG-1', '2027-06-01T08:00:00Z')
    const b = row('PRG-2', '2027-06-01T08:00:00Z')
    expect([b, a].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-1', 'PRG-2'])
    expect([a, b].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-1', 'PRG-2'])
  })

  it('sorts a row whose instant does not parse after every parseable row', () => {
    const bad = row('PRG-0', null, 'not-a-date', 'nope')
    const good = row('PRG-9', '2027-12-31T23:00:00Z')
    expect([bad, good].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-9', 'PRG-0'])
    expect([good, bad].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-9', 'PRG-0'])
  })

  it('two unparseable rows fall back to booking_reference order', () => {
    const a = row('PRG-2', null, 'x', 'y')
    const b = row('PRG-1', null, 'x', 'y')
    expect([a, b].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-1', 'PRG-2'])
  })

  it('pickup_utc wins over pickup_date / pickup_time when both exist', () => {
    // pickup_date/time say 10:00 Prague (08:00Z in June) but pickup_utc says 07:00Z.
    const viaUtc = row('PRG-B', '2027-06-01T07:00:00Z', '2027-06-01', '10:00')
    const viaWallClock = row('PRG-A', null, '2027-06-01', '10:00')
    expect([viaWallClock, viaUtc].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-B', 'PRG-A'])
  })

  it('falls back to the Prague wall clock when pickup_utc is absent', () => {
    const early = row('PRG-2', null, '2027-06-01', '09:00')
    const late = row('PRG-1', null, '2027-06-01', '11:00')
    expect([late, early].sort(comparePickup).map((r) => r.booking_reference)).toEqual(['PRG-2', 'PRG-1'])
  })
})
