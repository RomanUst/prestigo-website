import { describe, it, expect } from 'vitest'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'

describe('getPragueTodayISO', () => {
  it('resolves a UTC-day boundary correctly in summer (CEST, UTC+2)', () => {
    // 23:30 UTC on Aug 28 is already 01:30 on Aug 29 in Prague during CEST.
    expect(getPragueTodayISO(new Date('2026-08-28T23:30:00Z'))).toBe('2026-08-29')
  })

  it('resolves a UTC-day boundary correctly in winter (CET, UTC+1)', () => {
    // 22:00 UTC on Jan 15 is still 23:00 on Jan 15 in Prague during CET.
    expect(getPragueTodayISO(new Date('2026-01-15T22:00:00Z'))).toBe('2026-01-15')
  })

  it('defaults to the current time and returns a YYYY-MM-DD string when called with no argument', () => {
    const result = getPragueTodayISO()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('shiftIsoDate', () => {
  it('shifts back one whole day', () => {
    expect(shiftIsoDate('2026-08-29', -1)).toBe('2026-08-28')
  })

  it('shifts back across a month boundary', () => {
    expect(shiftIsoDate('2026-03-01', -7)).toBe('2026-02-22')
  })
})
