// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MAX_RANGE_DAYS, dispatchRange, validateCustomRange } from '@/lib/prague-calendar'

/**
 * Phase 90 D-07: the dispatch range presets are Prague calendar dates, never the UTC date,
 * and a custom range is bounded so one request cannot ask for an unbounded window.
 */
describe.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland'])('dispatchRange under TZ=%s', (tz) => {
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = tz
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it('at 2027-10-30T22:30Z Prague is already 2027-10-31', () => {
    const now = new Date('2027-10-30T22:30:00Z')
    expect(dispatchRange('today', now)).toEqual({ startDate: '2027-10-31', endDate: '2027-10-31' })
    expect(dispatchRange('tomorrow', now)).toEqual({ startDate: '2027-11-01', endDate: '2027-11-01' })
    expect(dispatchRange('7days', now)).toEqual({ startDate: '2027-10-31', endDate: '2027-11-06' })
  })

  it('around the spring DST change the Prague date flips at 23:00Z', () => {
    expect(dispatchRange('today', new Date('2027-03-27T22:30:00Z')).startDate).toBe('2027-03-27')
    expect(dispatchRange('today', new Date('2027-03-27T23:30:00Z')).startDate).toBe('2027-03-28')
  })
})

describe('dispatchRange default clock', () => {
  it('returns real YYYY-MM-DD dates when called without now', () => {
    const r = dispatchRange('today')
    expect(r.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.endDate).toBe(r.startDate)
  })
})

describe('validateCustomRange', () => {
  it('MAX_RANGE_DAYS is 62', () => {
    expect(MAX_RANGE_DAYS).toBe(62)
  })

  it('accepts a span of exactly 62 days inclusive', () => {
    expect(validateCustomRange('2027-10-01', '2027-12-01')).toEqual({ startDate: '2027-10-01', endDate: '2027-12-01' })
  })

  it('accepts a single day', () => {
    expect(validateCustomRange('2027-10-31', '2027-10-31')).toEqual({ startDate: '2027-10-31', endDate: '2027-10-31' })
  })

  it('rejects a span of 63 days', () => {
    expect(validateCustomRange('2027-10-01', '2027-12-02')).toBeNull()
  })

  it('rejects start after end', () => {
    expect(validateCustomRange('2027-10-05', '2027-10-04')).toBeNull()
  })

  it('rejects dates that do not exist', () => {
    expect(validateCustomRange('2027-02-30', '2027-03-01')).toBeNull()
    expect(validateCustomRange('2027-02-01', '2027-02-29')).toBeNull()
  })

  it.each([
    ['2027-1-01', '2027-01-02'],
    ['2027-01-01', '2027-1-02'],
    ['', '2027-01-02'],
    [' 2027-01-01', '2027-01-02'],
    ['2027-01-01T00:00:00Z', '2027-01-02'],
    ['<script>', '2027-01-02'],
  ])('rejects malformed input %j / %j', (start, end) => {
    expect(validateCustomRange(start, end)).toBeNull()
  })
})
