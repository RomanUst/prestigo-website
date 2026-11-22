// Phase 93 plan 05 (TRIP-04, D-12, T-93-12): the tour cancellation snapshot must survive the round trip
// through policyFromSnapshot (never the legacy fallback) and count real hours across Prague DST changes.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))

import {
  CANCELLATION_POLICY_VERSION,
  LEGACY_POLICY,
  evaluateCancellation,
  freeHoursFor,
  policyFromSnapshot,
  tripFactsFromRow,
} from '@/lib/cancellation-policy'
import { buildPolicySnapshot } from '@/lib/cancellation-settings'
import { TOUR_POLICY_VERSION_PREFIX, buildTourPolicySnapshot, tourPolicy } from '@/lib/tours/policy'

const HOUR = 3_600_000
const MIN = 60_000

describe('tour policy snapshot', () => {
  it.each([0, 24, 72])('round-trips %s h through policyFromSnapshot, not LEGACY_POLICY', (h) => {
    const { version, snapshot } = buildTourPolicySnapshot(h)
    const policy = policyFromSnapshot(snapshot)
    expect(policy).not.toEqual(LEGACY_POLICY)
    expect(policy.version).toBe(version)
    expect(policy.version.startsWith(TOUR_POLICY_VERSION_PREFIX)).toBe(true)
    expect(policy.version).toBe(`tour-${CANCELLATION_POLICY_VERSION}`)
    expect(policy.feePercent).toBe(100)
    expect(freeHoursFor(policy, { tripType: 'tour', distanceKm: null })).toBe(h)
  })

  it('also survives the JSON-string form a jsonb read can return', () => {
    const { snapshot } = buildTourPolicySnapshot(24)
    expect(freeHoursFor(policyFromSnapshot(JSON.stringify(snapshot)), { tripType: 'tour', distanceKm: 300 })).toBe(24)
  })

  it('clamps 80 h to 72 h and floors negatives at 0', () => {
    expect(tourPolicy(80).freeHoursLong).toBe(72)
    expect(freeHoursFor(policyFromSnapshot(buildTourPolicySnapshot(80).snapshot), { tripType: 'tour', distanceKm: null })).toBe(72)
    expect(tourPolicy(-5).freeHoursLong).toBe(0)
    expect(tourPolicy(Number.NaN).freeHoursLong).toBe(24)
  })

  it('has the same shape as buildPolicySnapshot of the tour policy', () => {
    expect(buildTourPolicySnapshot(24)).toEqual(buildPolicySnapshot(tourPolicy(24)))
  })

  it('a tour window does not depend on distance', () => {
    const p = tourPolicy(24)
    expect(freeHoursFor(p, { tripType: 'tour', distanceKm: 5 })).toBe(24)
    expect(freeHoursFor(p, { tripType: 'tour', distanceKm: 900 })).toBe(24)
  })

  it('leaves transfer and hourly windows unchanged', () => {
    const p = { ...tourPolicy(24), freeHoursShort: 1, freeHoursLong: 12, freeHoursHourly: 7 }
    expect(freeHoursFor(p, { tripType: 'transfer', distanceKm: 10 })).toBe(1)
    expect(freeHoursFor(p, { tripType: 'transfer', distanceKm: 500 })).toBe(12)
    expect(freeHoursFor(p, { tripType: 'hourly', distanceKm: null })).toBe(7)
  })
})

function tourFacts(date: string, time: string) {
  const facts = tripFactsFromRow({ trip_type: 'tour', distance_km: null, pickup_utc: null, pickup_date: date, pickup_time: time })
  if (!facts) throw new Error('pickup instant not resolved')
  return facts
}

describe('evaluateCancellation with a 24 h tour policy', () => {
  const policy = tourPolicy(24)

  it('2027-03-28 (Prague clocks go forward): free 24 h + 1 min before, late 23 h 59 min before', () => {
    const facts = tourFacts('2027-03-28', '09:00')
    expect(evaluateCancellation(policy, facts, facts.pickupMs - 24 * HOUR - MIN).kind).toBe('free')
    expect(evaluateCancellation(policy, facts, facts.pickupMs - 24 * HOUR).kind).toBe('free')
    expect(evaluateCancellation(policy, facts, facts.pickupMs - 24 * HOUR + MIN).kind).toBe('late')
    expect(evaluateCancellation(policy, facts, facts.pickupMs).kind).toBe('too_late')
  })

  it('2027-10-31 (Prague clocks go back): free 24 h + 1 min before, late 23 h 59 min before', () => {
    const facts = tourFacts('2027-10-31', '09:00')
    expect(evaluateCancellation(policy, facts, facts.pickupMs - 24 * HOUR - MIN).kind).toBe('free')
    expect(evaluateCancellation(policy, facts, facts.pickupMs - 24 * HOUR + MIN).kind).toBe('late')
  })
})
