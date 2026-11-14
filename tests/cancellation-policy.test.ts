// Phase 89 plan 03 (CANC-01, D-06, D-18): the pure cancellation policy and its guarded settings reader.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createClientMock, chain } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return { createClientMock: vi.fn(), chain }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: createClientMock,
}))

import {
  CANCELLATION_POLICY_VERSION,
  DEFAULT_POLICY,
  LEGACY_POLICY,
  POLICY_BOUNDS,
  evaluateCancellation,
  freeHoursFor,
  policyFromSnapshot,
  proposedFeeMinor,
  tripFactsFromRow,
  type CancellationPolicy,
} from '@/lib/cancellation-policy'
import { buildPolicySnapshot, getCancellationPolicy } from '@/lib/cancellation-settings'

const HOUR = 3_600_000
const POLICY: CancellationPolicy = {
  version: CANCELLATION_POLICY_VERSION,
  kmThreshold: 100,
  freeHoursShort: 1,
  freeHoursLong: 12,
  freeHoursHourly: 12,
  feePercent: 100,
}
const PICKUP = Date.UTC(2026, 11, 15, 12, 0)

function transfer(distanceKm: number | null) {
  return { tripType: 'transfer', distanceKm, pickupMs: PICKUP }
}

describe('freeHoursFor', () => {
  it('uses the short window up to and including the threshold', () => {
    expect(freeHoursFor(POLICY, transfer(100))).toBe(1)
    expect(freeHoursFor(POLICY, transfer(10))).toBe(1)
  })
  it('uses the long window above the threshold and for unknown distance', () => {
    expect(freeHoursFor(POLICY, transfer(101))).toBe(12)
    expect(freeHoursFor(POLICY, transfer(null))).toBe(12)
    expect(freeHoursFor(POLICY, transfer(Number.NaN))).toBe(12)
  })
  it('uses the hourly window for hourly bookings whatever the distance', () => {
    const p = { ...POLICY, freeHoursHourly: 7 }
    expect(freeHoursFor(p, { tripType: 'hourly', distanceKm: 5, pickupMs: PICKUP })).toBe(7)
    expect(freeHoursFor(p, { tripType: 'hourly', distanceKm: null, pickupMs: PICKUP })).toBe(7)
  })
})

describe('evaluateCancellation', () => {
  it('100 km, pickup in 2 h: free', () => {
    expect(evaluateCancellation(POLICY, transfer(100), PICKUP - 2 * HOUR).kind).toBe('free')
  })
  it('100 km, pickup in 30 min: late', () => {
    expect(evaluateCancellation(POLICY, transfer(100), PICKUP - 0.5 * HOUR).kind).toBe('late')
  })
  it('101 km, pickup in 13 h: free; in 11 h: late', () => {
    expect(evaluateCancellation(POLICY, transfer(101), PICKUP - 13 * HOUR).kind).toBe('free')
    expect(evaluateCancellation(POLICY, transfer(101), PICKUP - 11 * HOUR).kind).toBe('late')
  })
  it('unknown distance uses the long window', () => {
    expect(evaluateCancellation(POLICY, transfer(null), PICKUP - 13 * HOUR).kind).toBe('free')
    expect(evaluateCancellation(POLICY, transfer(null), PICKUP - 11 * HOUR).kind).toBe('late')
  })
  it('hourly uses the hourly window whatever the distance', () => {
    const p = { ...POLICY, freeHoursHourly: 24 }
    const hourly = { tripType: 'hourly', distanceKm: 5, pickupMs: PICKUP }
    expect(evaluateCancellation(p, hourly, PICKUP - 25 * HOUR).kind).toBe('free')
    expect(evaluateCancellation(p, hourly, PICKUP - 23 * HOUR).kind).toBe('late')
  })
  it('now exactly at the deadline is free (inclusive); one ms later is late', () => {
    const deadline = PICKUP - 12 * HOUR
    const out = evaluateCancellation(POLICY, transfer(500), deadline)
    expect(out).toEqual({ kind: 'free', freeUntilMs: deadline })
    expect(evaluateCancellation(POLICY, transfer(500), deadline + 1).kind).toBe('late')
  })
  it('now at pickup (or after) is too_late and still carries freeUntilMs', () => {
    expect(evaluateCancellation(POLICY, transfer(500), PICKUP)).toEqual({
      kind: 'too_late',
      freeUntilMs: PICKUP - 12 * HOUR,
    })
    expect(evaluateCancellation(POLICY, transfer(500), PICKUP + HOUR).kind).toBe('too_late')
  })
  it('a pickup across a DST change counts real hours', () => {
    // Prague clocks go forward on 2026-03-29 at 02:00; pickup 12:00 local that day is 10:00 UTC (CEST).
    const pickup = Date.UTC(2026, 2, 29, 10, 0)
    const trip = { tripType: 'transfer', distanceKm: 500, pickupMs: pickup }
    // 12 real hours before is 22:00 UTC on the 28th (23:00 CET), regardless of the lost local hour
    expect(evaluateCancellation(POLICY, trip, Date.UTC(2026, 2, 28, 22, 0)).kind).toBe('free')
    expect(evaluateCancellation(POLICY, trip, Date.UTC(2026, 2, 28, 22, 1)).kind).toBe('late')
  })
  it('a zero-hour window makes everything before pickup free up to the pickup instant', () => {
    const p = { ...POLICY, freeHoursShort: 0 }
    expect(evaluateCancellation(p, transfer(10), PICKUP - 1).kind).toBe('free')
    expect(evaluateCancellation(p, transfer(10), PICKUP).kind).toBe('too_late')
  })
})

describe('policyFromSnapshot (D-18)', () => {
  it('null gives the legacy policy: one hour for every distance', () => {
    const p = policyFromSnapshot(null)
    expect(p).toBe(LEGACY_POLICY)
    expect(p.version).toBe('legacy')
    expect(freeHoursFor(p, transfer(5))).toBe(1)
    expect(freeHoursFor(p, transfer(900))).toBe(1)
    expect(freeHoursFor(p, transfer(null))).toBe(1)
    expect(freeHoursFor(p, { tripType: 'hourly', distanceKm: null, pickupMs: PICKUP })).toBe(1)
  })
  it('malformed values give the legacy policy', () => {
    expect(policyFromSnapshot(undefined)).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot('oops')).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot([])).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({})).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({ ...POLICY, kmThreshold: 'x' })).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({ ...POLICY, feePercent: 0 })).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({ ...POLICY, freeHoursLong: 99 })).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({ ...POLICY, version: '' })).toBe(LEGACY_POLICY)
  })
  it('a JSON string snapshot is parsed; invalid JSON gives legacy', () => {
    expect(policyFromSnapshot(JSON.stringify(POLICY))).toEqual(POLICY)
    expect(policyFromSnapshot('{not json')).toBe(LEGACY_POLICY)
  })
  it('a valid snapshot is returned as that snapshot, not today\'s settings', () => {
    const stored = { ...POLICY, version: '2026-01-1', kmThreshold: 50, freeHoursLong: 24, freeHoursShort: 3 }
    expect(policyFromSnapshot(stored)).toEqual(stored)
  })
  it('an old booking keeps its terms when the settings change afterwards', () => {
    const stored = policyFromSnapshot({ ...POLICY, freeHoursLong: 24 })
    // today's settings would say 12 h; the booking says 24 h
    const trip = transfer(500)
    expect(evaluateCancellation(stored, trip, PICKUP - 30 * HOUR).kind).toBe('free')
    expect(evaluateCancellation(stored, trip, PICKUP - 18 * HOUR).kind).toBe('late')
    expect(evaluateCancellation(POLICY, trip, PICKUP - 18 * HOUR).kind).toBe('free')
  })
})

describe('policyFromSnapshot quote bound (Phase 92, D-13, T-92-08)', () => {
  const quote = (hours: number) => ({
    ...POLICY,
    version: 'quote-2026-11-1',
    freeHoursShort: hours,
    freeHoursLong: hours,
    freeHoursHourly: hours,
  })
  it('POLICY_BOUNDS.quoteHours is 0..720 and the ordinary hours bound is still 0..72', () => {
    expect(POLICY_BOUNDS.quoteHours).toEqual({ min: 0, max: 720 })
    expect(POLICY_BOUNDS.hours).toEqual({ min: 0, max: 72 })
  })
  it('D-13: a quote- snapshot keeps 720 hours; 721 falls back to the legacy policy', () => {
    const kept = policyFromSnapshot(quote(720))
    expect(kept).not.toBe(LEGACY_POLICY)
    expect(kept.freeHoursShort).toBe(720)
    expect(kept.freeHoursLong).toBe(720)
    expect(kept.freeHoursHourly).toBe(720)
    expect(policyFromSnapshot(quote(721))).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot(quote(-1))).toBe(LEGACY_POLICY)
  })
  it('D-13: a quote- snapshot keeps an in-between value such as 336', () => {
    expect(policyFromSnapshot(quote(336)).freeHoursLong).toBe(336)
  })
  it('D-13: a non-quote snapshot with 73 hours still falls back to the legacy policy', () => {
    expect(policyFromSnapshot({ ...POLICY, freeHoursLong: 73 })).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({ ...POLICY, version: 'quote', freeHoursLong: 73 })).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({ ...POLICY, version: '2026-quote-1', freeHoursLong: 73 })).toBe(LEGACY_POLICY)
  })
  it('a quote- snapshot with a bad km threshold or fee percent still falls back', () => {
    expect(policyFromSnapshot({ ...quote(100), feePercent: 0 })).toBe(LEGACY_POLICY)
    expect(policyFromSnapshot({ ...quote(100), kmThreshold: 0 })).toBe(LEGACY_POLICY)
  })
})

describe('proposedFeeMinor', () => {
  it('is the percent of the base, never above the base, never below 1', () => {
    expect(proposedFeeMinor(10000, 100)).toBe(10000)
    expect(proposedFeeMinor(10000, 50)).toBe(5000)
    expect(proposedFeeMinor(10000, 150)).toBe(10000)
    expect(proposedFeeMinor(1, 1)).toBe(1)
    expect(proposedFeeMinor(10050, 33)).toBe(3317)
  })
})

describe('tripFactsFromRow', () => {
  it('reads trip type, distance and the pickup instant', () => {
    const f = tripFactsFromRow({
      trip_type: 'transfer',
      distance_km: 42,
      pickup_utc: '2026-12-15T12:00:00Z',
      pickup_date: '2026-12-15',
      pickup_time: '13:00',
    })
    expect(f).toEqual({ tripType: 'transfer', distanceKm: 42, pickupMs: PICKUP })
  })
  it('null distance stays null and an unparseable pickup gives null', () => {
    expect(
      tripFactsFromRow({ trip_type: 'hourly', distance_km: null, pickup_utc: null, pickup_date: '2026-12-15', pickup_time: '13:00' })
        ?.distanceKm,
    ).toBeNull()
    expect(
      tripFactsFromRow({ trip_type: 'transfer', distance_km: 3, pickup_utc: null, pickup_date: 'x', pickup_time: 'y' }),
    ).toBeNull()
  })
})

describe('getCancellationPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    createClientMock.mockReturnValue({ from: vi.fn(() => chain) })
  })

  it('returns the row numbers and the version constant', async () => {
    chain.single.mockResolvedValue({
      data: {
        cancel_free_km_threshold: 80,
        cancel_free_hours_short: 2,
        cancel_free_hours_long: 24,
        cancel_free_hours_hourly: 6,
        cancel_fee_percent: 50,
      },
      error: null,
    })
    expect(await getCancellationPolicy()).toEqual({
      version: CANCELLATION_POLICY_VERSION,
      kmThreshold: 80,
      freeHoursShort: 2,
      freeHoursLong: 24,
      freeHoursHourly: 6,
      feePercent: 50,
    })
    expect(chain.select).toHaveBeenCalledWith(
      'cancel_free_km_threshold, cancel_free_hours_short, cancel_free_hours_long, cancel_free_hours_hourly, cancel_fee_percent',
    )
  })

  it('falls back to the defaults 100, 1, 12, 12, 100 on a read error', async () => {
    chain.single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const p = await getCancellationPolicy()
    expect(p).toEqual(DEFAULT_POLICY)
    expect([p.kmThreshold, p.freeHoursShort, p.freeHoursLong, p.freeHoursHourly, p.feePercent]).toEqual([100, 1, 12, 12, 100])
  })

  it('falls back to the defaults when client construction throws', async () => {
    createClientMock.mockImplementation(() => {
      throw new Error('SUPABASE_URL missing')
    })
    expect(await getCancellationPolicy()).toEqual(DEFAULT_POLICY)
  })

  it('falls back per field when a column is missing or invalid (migration pending)', async () => {
    chain.single.mockResolvedValue({ data: { cancel_free_km_threshold: 60, cancel_free_hours_long: null }, error: null })
    expect(await getCancellationPolicy()).toEqual({ ...DEFAULT_POLICY, kmThreshold: 60 })
  })
})

describe('buildPolicySnapshot', () => {
  it('returns the version and a plain snapshot that round-trips through policyFromSnapshot', () => {
    const { version, snapshot } = buildPolicySnapshot(POLICY)
    expect(version).toBe(CANCELLATION_POLICY_VERSION)
    expect(policyFromSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(POLICY)
  })
})
