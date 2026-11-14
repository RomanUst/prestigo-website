// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MIN_BLOCK_MIN,
  calendarWindow,
  comparePickup,
  formatPragueTime,
  layoutDay,
  mondayOf,
  monthGrid,
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

describe('layoutDay', () => {
  const h = (hour: number) => hour * 60
  const blk = (id: string, startMin: number, endMin: number) => ({ item: id, startMin, endMin })
  const byId = (placed: ReturnType<typeof layoutDay<string>>) => Object.fromEntries(placed.map((p) => [p.item, p]))

  it('touching blocks do not overlap: each is its own cluster with one column', () => {
    const p = byId(layoutDay([blk('a', h(9), h(10)), blk('b', h(10), h(11))]))
    expect(p.a).toMatchObject({ col: 0, cols: 1 })
    expect(p.b).toMatchObject({ col: 0, cols: 1 })
  })

  it('overlapping blocks sit side by side in two columns', () => {
    const p = byId(layoutDay([blk('a', h(9), h(11)), blk('b', h(10), h(12))]))
    expect(p.a.cols).toBe(2)
    expect(p.b.cols).toBe(2)
    expect(p.a.col).not.toBe(p.b.col)
  })

  it('equal starts: the longer block takes column 0', () => {
    const p = byId(layoutDay([blk('short', h(9), h(10)), blk('long', h(9), h(12))]))
    expect(p.long.col).toBe(0)
    expect(p.short.col).toBe(1)
    expect(p.long.cols).toBe(2)
  })

  it('a 10-minute block reserves MIN_BLOCK_MIN so a block starting 5 minutes later shares the cluster', () => {
    expect(MIN_BLOCK_MIN).toBe(30)
    const p = byId(layoutDay([blk('tiny', h(9), h(9) + 10), blk('next', h(9) + 5, h(10))]))
    expect(p.tiny.cols).toBe(2)
    expect(p.next.cols).toBe(2)
    expect(p.tiny.col).not.toBe(p.next.col)
  })

  it('a block starting after the reserved minimum height opens a new cluster', () => {
    const p = byId(layoutDay([blk('tiny', h(9), h(9) + 10), blk('later', h(9) + 30, h(10))]))
    expect(p.tiny.cols).toBe(1)
    expect(p.later.cols).toBe(1)
  })

  it('reuses a freed column inside a cluster', () => {
    // a 09-10, b 09:30-12, c 10-11: c drops back into a's column; the cluster has 2 columns
    const p = byId(layoutDay([blk('a', h(9), h(10)), blk('b', h(9) + 30, h(12)), blk('c', h(10), h(11))]))
    expect(p.a.col).toBe(0)
    expect(p.b.col).toBe(1)
    expect(p.c.col).toBe(0)
    expect(p.c.cols).toBe(2)
  })

  it('output order is stable for the same input', () => {
    const input = [blk('c', h(11), h(12)), blk('a', h(9), h(11)), blk('b', h(10), h(12))]
    const first = layoutDay(input).map((p) => p.item)
    const second = layoutDay(input).map((p) => p.item)
    expect(second).toEqual(first)
    expect(first).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const input = [blk('b', h(10), h(11)), blk('a', h(9), h(10))]
    layoutDay(input)
    expect(input.map((i) => i.item)).toEqual(['b', 'a'])
  })

  it('returns an empty list for no blocks', () => {
    expect(layoutDay([])).toEqual([])
  })
})

describe('monthGrid', () => {
  it('February 2027 starts on a Monday and fills exactly four weeks', () => {
    const g = monthGrid('2027-02-10')
    expect(g.start).toBe('2027-02-01')
    expect(g.end).toBe('2027-02-28')
    expect(g.weeks).toHaveLength(4)
    for (const w of g.weeks) expect(w).toHaveLength(7)
  })

  it('October 2027 spans five Monday-first weeks across the DST change', () => {
    const g = monthGrid('2027-10-15')
    expect(g.start).toBe('2027-09-27')
    expect(g.end).toBe('2027-10-31')
    expect(g.weeks).toHaveLength(5)
    expect(g.weeks[4]).toEqual([
      '2027-10-25',
      '2027-10-26',
      '2027-10-27',
      '2027-10-28',
      '2027-10-29',
      '2027-10-30',
      '2027-10-31',
    ])
  })

  it('March 2027 ends on the Sunday on or after the last day', () => {
    const g = monthGrid('2027-03-31')
    expect(g.start).toBe('2027-03-01')
    expect(g.end).toBe('2027-04-04')
    expect(g.weeks).toHaveLength(5)
    expect(g.weeks[0][0]).toBe('2027-03-01')
    expect(g.weeks[4][6]).toBe('2027-04-04')
  })
})

describe('calendarWindow', () => {
  it('day is the anchor date only', () => {
    expect(calendarWindow('day', '2027-10-31')).toEqual({ startDate: '2027-10-31', endDate: '2027-10-31' })
  })

  it('week is Monday to Sunday', () => {
    expect(calendarWindow('week', '2027-10-31')).toEqual({ startDate: '2027-10-25', endDate: '2027-10-31' })
    expect(calendarWindow('week', '2027-03-28')).toEqual({ startDate: '2027-03-22', endDate: '2027-03-28' })
  })

  it('month is the whole visible grid, leading and trailing days included', () => {
    expect(calendarWindow('month', '2027-10-15')).toEqual({ startDate: '2027-09-27', endDate: '2027-10-31' })
  })
})
