// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { pickupInstantMs } from '@/lib/prague-date'
import {
  computeHoldAt,
  decideHoldMode,
  holdDateIso,
  meetsBookingLeadTime,
  retryAt,
  needsReplace,
  MIN_BOOKING_LEAD_MS,
} from '@/lib/payments/timing'
import * as config from '@/lib/payments/config'

// Phase 88 plan 88-06 (HOLD-02, D-11, D-12, D-13, D-18): hold timing is integer-millisecond
// arithmetic on instants; the Prague wall clock only matters for the date and the 23:30 cutoff.

const H = 3_600_000
const MIN = 60_000

function prague(date: string, time: string): number {
  const ms = pickupInstantMs({ pickup_utc: null, pickup_date: date, pickup_time: time })
  if (ms === null) throw new Error(`bad fixture ${date} ${time}`)
  return ms
}

describe('DST fixtures (2027)', () => {
  it('spring forward: pickup 2027-03-28 12:00 Prague = 10:00Z, 72 h lead -> hold 2027-03-25 10:00Z (11:00 Prague)', () => {
    const pickup = prague('2027-03-28', '12:00')
    expect(new Date(pickup).toISOString()).toBe('2027-03-28T10:00:00.000Z')
    const { holdAtMs, rawHoldAtMs } = computeHoldAt(pickup, 72)
    expect(new Date(holdAtMs).toISOString()).toBe('2027-03-25T10:00:00.000Z')
    expect(rawHoldAtMs).toBe(holdAtMs)
    expect(holdDateIso(holdAtMs)).toBe('2027-03-25')
    // absolute elapsed hours, not wall-clock days: 72 h = 259_200_000 ms exactly
    expect(pickup - holdAtMs).toBe(72 * H)
  })

  it('nonexistent wall time 2027-03-28 02:30 resolves to 01:30Z', () => {
    expect(new Date(prague('2027-03-28', '02:30')).toISOString()).toBe('2027-03-28T01:30:00.000Z')
  })

  it('ambiguous wall time 2027-10-31 02:30 resolves to 01:30Z', () => {
    expect(new Date(prague('2027-10-31', '02:30')).toISOString()).toBe('2027-10-31T01:30:00.000Z')
  })

  it('fall back: pickup 2027-10-31 12:00 Prague = 11:00Z, 72 h lead -> hold 2027-10-28 11:00Z (13:00 Prague)', () => {
    const pickup = prague('2027-10-31', '12:00')
    expect(new Date(pickup).toISOString()).toBe('2027-10-31T11:00:00.000Z')
    const { holdAtMs } = computeHoldAt(pickup, 72)
    expect(new Date(holdAtMs).toISOString()).toBe('2027-10-28T11:00:00.000Z')
    expect(holdDateIso(holdAtMs)).toBe('2027-10-28')
    expect(pickup - holdAtMs).toBe(72 * H)
  })
})

describe('computeHoldAt: day cutoff (D-12)', () => {
  // Choose a pickup so that the raw hold lands on the wanted Prague wall clock (winter, CET = UTC+1).
  const rawAt = (time: string) => computeHoldAt(prague('2027-01-14', time) + 72 * H, 72)

  it('a raw hold at 23:29 Prague stays', () => {
    const { holdAtMs, rawHoldAtMs } = rawAt('23:29')
    expect(holdAtMs).toBe(rawHoldAtMs)
    expect(new Date(holdAtMs).toISOString()).toBe('2027-01-14T22:29:00.000Z')
    expect(holdDateIso(holdAtMs)).toBe('2027-01-14')
  })

  it.each(['23:30', '23:59'])('a raw hold at %s Prague moves to 00:00 Prague of the next day', (time) => {
    const { holdAtMs, rawHoldAtMs } = rawAt(time)
    expect(new Date(holdAtMs).toISOString()).toBe('2027-01-14T23:00:00.000Z') // 00:00 Prague 15 Jan
    expect(holdDateIso(holdAtMs)).toBe('2027-01-15')
    expect(holdAtMs).toBeGreaterThanOrEqual(rawHoldAtMs)
    expect(holdAtMs - rawHoldAtMs).toBeLessThanOrEqual(30 * MIN)
  })

  it('a raw hold at 00:00 Prague stays (no shift at the start of the day)', () => {
    const { holdAtMs, rawHoldAtMs } = rawAt('00:00')
    expect(holdAtMs).toBe(rawHoldAtMs)
  })

  it('the shift crosses a month end and a summer-time offset correctly', () => {
    // Raw hold 2027-07-31 23:45 Prague (CEST) -> 2027-08-01 00:00 Prague = 2027-07-31T22:00Z
    const { holdAtMs, rawHoldAtMs } = computeHoldAt(prague('2027-07-31', '23:45') + 72 * H, 72)
    expect(new Date(holdAtMs).toISOString()).toBe('2027-07-31T22:00:00.000Z')
    expect(holdDateIso(holdAtMs)).toBe('2027-08-01')
    expect(holdAtMs - rawHoldAtMs).toBe(15 * MIN)
  })

  it('holdAtMs >= rawHoldAtMs and within 30 minutes for every quarter hour of a day', () => {
    const base = prague('2027-05-10', '00:00')
    for (let m = 0; m < 24 * 60; m += 15) {
      const pickup = base + m * MIN + 96 * H
      const { holdAtMs, rawHoldAtMs } = computeHoldAt(pickup, 96)
      expect(holdAtMs).toBeGreaterThanOrEqual(rawHoldAtMs)
      expect(holdAtMs - rawHoldAtMs).toBeLessThanOrEqual(30 * MIN)
      expect(Number.isInteger(holdAtMs)).toBe(true)
    }
  })

  it('accepts the minimum (6) and maximum (96) lead hours', () => {
    const pickup = prague('2027-02-10', '12:00')
    expect(computeHoldAt(pickup, 6).rawHoldAtMs).toBe(pickup - 6 * H)
    expect(computeHoldAt(pickup, 96).rawHoldAtMs).toBe(pickup - 96 * H)
  })
})

describe('decideHoldMode (D-11)', () => {
  const now = Date.parse('2027-01-10T09:00:00Z')
  it('raw hold at now -> hold_now', () => expect(decideHoldMode(now, now)).toBe('hold_now'))
  it('raw hold in the past -> hold_now', () => expect(decideHoldMode(now - 1, now)).toBe('hold_now'))
  it('raw hold one millisecond ahead -> setup', () => expect(decideHoldMode(now + 1, now)).toBe('setup'))

  it('uses the unshifted instant: a hold shifted later by the cutoff is still decided on the raw value', () => {
    const pickup = prague('2027-01-14', '23:45') + 72 * H
    const { holdAtMs, rawHoldAtMs } = computeHoldAt(pickup, 72)
    const between = rawHoldAtMs + 5 * MIN
    expect(holdAtMs).toBeGreaterThan(between)
    expect(decideHoldMode(rawHoldAtMs, between)).toBe('hold_now')
  })
})

describe('meetsBookingLeadTime', () => {
  const now = Date.parse('2027-01-10T09:00:00Z')
  it('exactly 12 h passes, 12 h minus 1 ms fails', () => {
    expect(MIN_BOOKING_LEAD_MS).toBe(12 * H)
    expect(meetsBookingLeadTime(now + 12 * H, now)).toBe(true)
    expect(meetsBookingLeadTime(now + 12 * H - 1, now)).toBe(false)
  })
  it('is instant-based: across the 2027-03-28 spring-forward night the real elapsed time counts', () => {
    const justBefore = Date.parse('2027-03-27T20:30:00Z') // 21:30 Prague
    const pickup = prague('2027-03-28', '09:00') // 07:00Z
    expect(pickup - justBefore).toBe(10.5 * H)
    expect(meetsBookingLeadTime(pickup, justBefore)).toBe(false)
  })
})

describe('retryAt', () => {
  const failed = Date.parse('2027-01-10T10:00:00Z')
  it('pickup 3 days later -> failed + 12 h', () => {
    expect(retryAt(failed, failed + 72 * H)).toBe(failed + 12 * H)
  })
  it('pickup in 5 h -> pickup - 2 h (= failed + 3 h)', () => {
    expect(retryAt(failed, failed + 5 * H)).toBe(failed + 3 * H)
  })
  it('pickup in 3 h -> pickup - 2 h = failed + 1 h (the minimum gap is allowed)', () => {
    expect(retryAt(failed, failed + 3 * H)).toBe(failed + 1 * H)
  })
  it('pickup in 2.5 h -> null (pickup - 2 h is earlier than failed + 1 h)', () => {
    expect(retryAt(failed, failed + 2.5 * H)).toBeNull()
  })
  it('pickup already passed -> null', () => {
    expect(retryAt(failed, failed - H)).toBeNull()
  })
})

describe('needsReplace (lead 72 h)', () => {
  const now = Date.parse('2027-01-10T09:00:00Z')
  const D = 24 * H
  const args = (captureBefore: number | null, pickup: number) => ({
    captureBeforeMs: captureBefore,
    newPickupMs: pickup,
    newRawHoldAtMs: computeHoldAt(pickup, 72).rawHoldAtMs,
    nowMs: now,
  })

  it('hold outlives the trip and the new raw hold is already due -> false', () => {
    expect(needsReplace(args(now + 6 * D, now + 2 * D))).toBe(false)
  })
  it('new raw hold is in the future -> true', () => {
    expect(needsReplace(args(now + 6 * D, now + 3 * D + 20 * H))).toBe(true)
  })
  it('hold expires less than 6 h after the pickup -> true', () => {
    expect(needsReplace(args(now + 2 * D, now + 2 * D))).toBe(true)
  })
  it('hold expires exactly 6 h after the pickup -> false', () => {
    expect(needsReplace(args(now + 2 * D + 6 * H, now + 2 * D))).toBe(false)
  })
  it('no capture_before known -> true', () => {
    expect(needsReplace(args(null, now + 2 * D))).toBe(true)
  })
})

describe('lib/payments/config exports the engine constants (plan contract)', () => {
  it('has the documented values', () => {
    expect(config.CARD_FLOW_TRIP_TYPES).toEqual(['transfer', 'hourly'])
    expect(config.MIN_BOOKING_LEAD_MS).toBe(12 * H)
    expect(config.RETRY_DELAY_MS).toBe(12 * H)
    expect(config.RETRY_MIN_GAP_MS).toBe(1 * H)
    expect(config.RETRY_BEFORE_PICKUP_MS).toBe(2 * H)
    expect(config.REPLACE_MARGIN_MS).toBe(6 * H)
    expect(config.HOLD_CLAIM_LIMIT).toBe(20)
    expect(config.LEASE_SECONDS).toBe(600)
    expect(config.NO_VALID_HOLD_ALERT_MS).toBe(24 * H)
    expect(config.EXPIRING_HOLD_ALERT_MS).toBe(12 * H)
    expect(config.STALE_CHECKOUT_MS).toBe(10 * MIN)
    expect(config.CHECKOUT_RECONCILE_MAX_AGE_MS).toBe(48 * H)
    expect(config.LEASE_SEARCH_AFTER_MS).toBe(20 * H)
    expect(config.HOLD_DAY_CUTOFF_PRAGUE).toBe('23:30')
  })

  it('isCardFlowEligible matches the normalised email exactly', () => {
    const s = { mode: 'canary' as const, leadHours: 72, canaryEmails: ['owner@example.com'] }
    expect(config.isCardFlowEligible(s, { email: ' Owner@Example.com ', tripType: 'transfer' })).toBe(true)
    expect(config.isCardFlowEligible(s, { email: 'owner@example.com.evil', tripType: 'transfer' })).toBe(false)
    expect(config.isCardFlowEligible(s, { email: 'xowner@example.com', tripType: 'transfer' })).toBe(false)
    expect(config.isCardFlowEligible(s, { email: 'owner@example.com', tripType: 'daily' })).toBe(false)
    expect(config.isCardFlowEligible({ ...s, mode: 'off' }, { email: 'owner@example.com', tripType: 'transfer' })).toBe(false)
    expect(config.isCardFlowEligible({ ...s, canaryEmails: [] }, { email: 'owner@example.com', tripType: 'hourly' })).toBe(false)
    expect(config.normalizeEmail('  A@X.com ')).toBe('a@x.com')
  })
})
