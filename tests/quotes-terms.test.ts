// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  QUOTE_DEFAULT_FEE_PERCENT,
  QUOTE_POLICY_VERSION_PREFIX,
  evaluateQuoteCancel,
  keptDepositMinor,
  quoteFreeUntilMs,
  resolveQuotePolicy,
  termsFromSnapshot,
} from '@/lib/quotes/terms'
import {
  DEFAULT_POLICY,
  LEGACY_POLICY,
  freeHoursFor,
  policyFromSnapshot,
  type CancellationPolicy,
} from '@/lib/cancellation-policy'

/**
 * Phase 92 plan 92-02 (QUOTE-04; D-03, D-06, D-11, D-13; T-92-08): the terms of an accepted quote are stored once,
 * in the standard cancellation snapshot shape, and evaluated against the first trip.
 */

const HOUR = 3_600_000
const GLOBAL: CancellationPolicy = {
  ...DEFAULT_POLICY,
  version: '2026-11-1',
  kmThreshold: 100,
  freeHoursShort: 2,
  freeHoursLong: 24,
  freeHoursHourly: 12,
  feePercent: 40,
}
const transfer = (km: number | null) => ({ trip_type: 'transfer', distance_km: km })

describe('resolveQuotePolicy (D-06, D-11)', () => {
  it('stores custom free hours and custom fee percent, three equal hour fields, quote- version', () => {
    const r = resolveQuotePolicy({ customFreeHours: 336, customFeePercent: 50, globalPolicy: GLOBAL, firstLine: transfer(300) })
    expect(r.freeHours).toBe(336)
    expect(r.feePercent).toBe(50)
    expect(r.version.startsWith(QUOTE_POLICY_VERSION_PREFIX)).toBe(true)
    expect(r.snapshot.version).toBe(r.version)
    expect(r.snapshot.freeHoursShort).toBe(336)
    expect(r.snapshot.freeHoursLong).toBe(336)
    expect(r.snapshot.freeHoursHourly).toBe(336)
    expect(r.snapshot.feePercent).toBe(50)
    expect(r.snapshot.kmThreshold).toBe(GLOBAL.kmThreshold)
  })

  it("empty fields: the global policy's hours for the first trip and 100% of the deposit", () => {
    const longTrip = resolveQuotePolicy({ customFreeHours: null, customFeePercent: null, globalPolicy: GLOBAL, firstLine: transfer(300) })
    expect(longTrip.freeHours).toBe(freeHoursFor(GLOBAL, { tripType: 'transfer', distanceKm: 300 }))
    expect(longTrip.freeHours).toBe(24)
    expect(longTrip.feePercent).toBe(QUOTE_DEFAULT_FEE_PERCENT)
    expect(QUOTE_DEFAULT_FEE_PERCENT).toBe(100)

    const shortTrip = resolveQuotePolicy({ customFreeHours: null, customFeePercent: null, globalPolicy: GLOBAL, firstLine: transfer(20) })
    expect(shortTrip.freeHours).toBe(2)
    const hourly = resolveQuotePolicy({
      customFreeHours: null,
      customFeePercent: null,
      globalPolicy: GLOBAL,
      firstLine: { trip_type: 'hourly', distance_km: null },
    })
    expect(hourly.freeHours).toBe(12)
  })

  it('a custom value of 0 free hours is kept (cancelling is never free)', () => {
    const r = resolveQuotePolicy({ customFreeHours: 0, customFeePercent: null, globalPolicy: GLOBAL, firstLine: transfer(300) })
    expect(r.freeHours).toBe(0)
  })

  it('refuses custom values outside the bounds instead of guessing (hours 0..720, percent 1..100, whole numbers)', () => {
    const base = { globalPolicy: GLOBAL, firstLine: transfer(300) }
    expect(() => resolveQuotePolicy({ ...base, customFreeHours: 721, customFeePercent: null })).toThrow()
    expect(() => resolveQuotePolicy({ ...base, customFreeHours: -1, customFeePercent: null })).toThrow()
    expect(() => resolveQuotePolicy({ ...base, customFreeHours: 1.5, customFeePercent: null })).toThrow()
    expect(() => resolveQuotePolicy({ ...base, customFreeHours: null, customFeePercent: 0 })).toThrow()
    expect(() => resolveQuotePolicy({ ...base, customFreeHours: null, customFeePercent: 101 })).toThrow()
    expect(() => resolveQuotePolicy({ ...base, customFreeHours: 720, customFeePercent: 100 })).not.toThrow()
  })

  it('D-13: a stored 336-hour quote snapshot survives policyFromSnapshot', () => {
    const r = resolveQuotePolicy({ customFreeHours: 336, customFeePercent: 50, globalPolicy: GLOBAL, firstLine: transfer(300) })
    const p = policyFromSnapshot(r.snapshot)
    expect(p).not.toBe(LEGACY_POLICY)
    expect(p.freeHoursShort).toBe(336)
    expect(p.freeHoursLong).toBe(336)
    expect(p.freeHoursHourly).toBe(336)
    expect(p.feePercent).toBe(50)
  })

  it('D-13: a JSON-string snapshot (jsonb read back as text) also survives', () => {
    const r = resolveQuotePolicy({ customFreeHours: 720, customFeePercent: 100, globalPolicy: GLOBAL, firstLine: transfer(300) })
    expect(policyFromSnapshot(JSON.stringify(r.snapshot)).freeHoursLong).toBe(720)
  })
})

describe('termsFromSnapshot', () => {
  it('reads freeHours and feePercent back from a stored quote snapshot', () => {
    const r = resolveQuotePolicy({ customFreeHours: 168, customFeePercent: 25, globalPolicy: GLOBAL, firstLine: transfer(300) })
    expect(termsFromSnapshot(r.snapshot)).toEqual({ freeHours: 168, feePercent: 25 })
  })

  it('an unreadable snapshot gives the legacy terms (one hour, all of the deposit)', () => {
    expect(termsFromSnapshot(null)).toEqual({ freeHours: 1, feePercent: 100 })
    expect(termsFromSnapshot('oops')).toEqual({ freeHours: 1, feePercent: 100 })
  })
})

describe('quoteFreeUntilMs / evaluateQuoteCancel (D-03)', () => {
  const FIRST = Date.parse('2027-04-10T08:00:00Z')

  it('free until the first pickup minus the free hours', () => {
    expect(quoteFreeUntilMs(FIRST, 48)).toBe(FIRST - 48 * HOUR)
    expect(quoteFreeUntilMs(FIRST, 0)).toBe(FIRST)
  })

  it('counts real hours across the spring DST change (a plain millisecond subtraction)', () => {
    const pickup = Date.parse('2027-03-28T08:00:00Z')
    expect(quoteFreeUntilMs(pickup, 24)).toBe(Date.parse('2027-03-27T08:00:00Z'))
  })

  it('admin_prestigo is always free', () => {
    const freeUntil = quoteFreeUntilMs(FIRST, 24)
    expect(evaluateQuoteCancel({ freeUntilMs: freeUntil, nowMs: FIRST + 10 * HOUR, initiator: 'admin_prestigo' })).toBe('free')
    expect(evaluateQuoteCancel({ freeUntilMs: freeUntil, nowMs: freeUntil + 1, initiator: 'admin_prestigo' })).toBe('free')
  })

  it('admin_client is free at or before freeUntilMs and late after', () => {
    const freeUntil = quoteFreeUntilMs(FIRST, 24)
    expect(evaluateQuoteCancel({ freeUntilMs: freeUntil, nowMs: freeUntil - 1, initiator: 'admin_client' })).toBe('free')
    expect(evaluateQuoteCancel({ freeUntilMs: freeUntil, nowMs: freeUntil, initiator: 'admin_client' })).toBe('free')
    expect(evaluateQuoteCancel({ freeUntilMs: freeUntil, nowMs: freeUntil + 1, initiator: 'admin_client' })).toBe('late')
  })
})

describe('keptDepositMinor (D-11: never more than the deposit)', () => {
  it('is the percent of the deposit', () => {
    expect(keptDepositMinor(20000, 100)).toBe(20000)
    expect(keptDepositMinor(20000, 50)).toBe(10000)
  })

  it('never exceeds the deposit even for a percent above 100', () => {
    expect(keptDepositMinor(20000, 150)).toBe(20000)
  })

  it('is 0 when there is no deposit', () => {
    expect(keptDepositMinor(0, 100)).toBe(0)
  })
})
