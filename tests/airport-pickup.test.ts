// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  DEFAULT_LANDING_OFFSET,
  LANDING_OFFSETS,
  freeWaitUntilMs,
  isLandingOffset,
  pickupFromLanding,
} from '@/lib/airport-pickup'
import { formatPragueTime } from '@/lib/prague-calendar'

// Phase 91 plan 91-07 (STOP-05, D-07, T-91-24): landing -> pickup is pure instant arithmetic in Prague time.
// Fixtures: the 2027 DST changes (28 March, 31 October) and a 23:50 roll-over, in three server time zones.

describe('offsets (D-07)', () => {
  it.each(LANDING_OFFSETS)('offset %i minutes gives a result', (offset) => {
    expect(pickupFromLanding('2027-06-10', '14:00', offset)).not.toBeNull()
  })

  it.each([10, 120, -15, 7.5, Number.NaN])('offset %s gives null', (offset) => {
    expect(isLandingOffset(offset)).toBe(false)
    expect(pickupFromLanding('2027-06-10', '14:00', offset)).toBeNull()
  })

  it('the UI default is 30 and is an allowed offset', () => {
    expect(DEFAULT_LANDING_OFFSET).toBe(30)
    expect(isLandingOffset(DEFAULT_LANDING_OFFSET)).toBe(true)
  })

  it('the pickup is never before the landing', () => {
    for (const offset of LANDING_OFFSETS) {
      const landing = pickupFromLanding('2027-06-10', '14:00', 0)
      const result = pickupFromLanding('2027-06-10', '14:00', offset)
      expect(result && landing && result.pickupMs >= landing.pickupMs).toBe(true)
    }
  })
})

describe.each(['UTC', 'Europe/Prague', 'America/New_York'])('landing -> pickup with the server in %s', (tz) => {
  const previous = process.env.TZ
  beforeAll(() => {
    process.env.TZ = tz
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  })

  it('landing 14:00 + 30 -> pickup 14:30 the same day', () => {
    const r = pickupFromLanding('2027-06-10', '14:00', 30)
    expect(r).toMatchObject({ pickupDate: '2027-06-10', pickupTime: '14:30' })
    // 14:30 CEST = 12:30Z
    expect(r?.pickupMs).toBe(Date.parse('2027-06-10T12:30:00Z'))
  })

  it('23:50 + 30 rolls to 00:20 on the next calendar day', () => {
    expect(pickupFromLanding('2027-06-10', '23:50', 30)).toMatchObject({
      pickupDate: '2027-06-11',
      pickupTime: '00:20',
    })
  })

  it('23:50 + 30 on the last day of a month and of a year rolls the month and the year', () => {
    expect(pickupFromLanding('2027-06-30', '23:50', 30)).toMatchObject({ pickupDate: '2027-07-01', pickupTime: '00:20' })
    expect(pickupFromLanding('2027-12-31', '23:50', 30)).toMatchObject({ pickupDate: '2028-01-01', pickupTime: '00:20' })
  })

  it('2027-03-28 (spring forward): landing 01:50 + 30 gives 03:20, the 02:00-03:00 hour does not exist', () => {
    const r = pickupFromLanding('2027-03-28', '01:50', 30)
    expect(r).toMatchObject({ pickupDate: '2027-03-28', pickupTime: '03:20' })
    // 01:50 CET = 00:50Z; + 30 min = 01:20Z = 03:20 CEST.
    expect(r?.pickupMs).toBe(Date.parse('2027-03-28T01:20:00Z'))
  })

  it('2027-10-31 (fall back): the ambiguous landing 02:40 resolves to the later, CET occurrence (pickupInstantMs) and + 30 gives 03:10', () => {
    const r = pickupFromLanding('2027-10-31', '02:40', 30)
    // pickupInstantMs reads 02:40 as 02:40 CET = 01:40Z (the second occurrence); + 30 min = 02:10Z = 03:10 CET.
    expect(r?.pickupMs).toBe(Date.parse('2027-10-31T02:10:00Z'))
    expect(r).toMatchObject({ pickupDate: '2027-10-31', pickupTime: '03:10' })
  })

  it('2027-10-31: landing 02:10 + 60 is one real hour later (CET), 03:10', () => {
    expect(pickupFromLanding('2027-10-31', '02:10', 60)).toMatchObject({ pickupDate: '2027-10-31', pickupTime: '03:10' })
  })

  it.each([
    ['2027-02-30', '12:00'],
    ['2027-13-01', '12:00'],
    ['2027-06-10', '25:00'],
    ['2027-06-10', '12:60'],
    ['2027-6-10', '12:00'],
    ['2027-06-10', '9:00'],
    ['', '12:00'],
    ['2027-06-10', ''],
    ['2027-06-10', '14:00:99'],
  ])('landing %s %s does not parse -> null', (date, time) => {
    expect(pickupFromLanding(date, time, 30)).toBeNull()
  })
})

describe('free waiting is measured from the pickup, never from the landing (STOP-05 ordering)', () => {
  it('freeWaitUntilMs(pickupMs, 60) - pickupMs is 3 600 000', () => {
    const r = pickupFromLanding('2027-06-10', '14:00', 30)
    if (!r) throw new Error('expected a pickup')
    expect(freeWaitUntilMs(r.pickupMs, 60) - r.pickupMs).toBe(3_600_000)
  })

  it('landing 14:00 + 30 with 60 free minutes ends at 15:30 Prague time, not 15:00', () => {
    const r = pickupFromLanding('2027-06-10', '14:00', 30)
    if (!r) throw new Error('expected a pickup')
    expect(formatPragueTime(freeWaitUntilMs(r.pickupMs, 60))).toBe('15:30')
  })
})
