// Pure cancellation-policy rules (Phase 89, plan 89-03; CANC-01, D-06, D-18).
//
// One function decides "free, late or too late" for the server, checkout, the manage page and the
// admin dialogs, so the answer is identical everywhere. Integer-millisecond arithmetic on instants,
// no floating hours, no wall-clock offsets (so a DST change counts real hours). Client-safe: no
// server imports.

import { pickupInstantMs } from '@/lib/prague-date'

const HOUR_MS = 3_600_000

/** Bumps when the policy wording changes, not when an admin changes a number. */
export const CANCELLATION_POLICY_VERSION = '2026-11-1'

export interface CancellationPolicy {
  /** Version label; bumps with the wording. */
  version: string
  /** Trips up to and including this distance use the short window. */
  kmThreshold: number
  freeHoursShort: number
  freeHoursLong: number
  /** Hourly bookings have no distance and use their own window (D-06). */
  freeHoursHourly: number
  /** The fee the admin dialog proposes; the hard cap is the booking amount. */
  feePercent: number
}

export type CancelOutcome =
  | { kind: 'free'; freeUntilMs: number }
  | { kind: 'late'; freeUntilMs: number }
  /** The pickup instant has been reached: the client cannot self-cancel. */
  | { kind: 'too_late'; freeUntilMs: number }

export interface TripFacts {
  tripType: string
  distanceKm: number | null
  pickupMs: number
}

/** Bounds shared with the settings route and the pricing_globals CHECKs (UI-SPEC 7.1). */
export const POLICY_BOUNDS = {
  km: { min: 1, max: 1000 },
  hours: { min: 0, max: 72 },
  percent: { min: 1, max: 100 },
} as const

/** Used when the settings row cannot be read, and as the admin form's fallbacks. */
export const DEFAULT_POLICY: CancellationPolicy = {
  version: CANCELLATION_POLICY_VERSION,
  kmThreshold: 100,
  freeHoursShort: 1,
  freeHoursLong: 12,
  freeHoursHourly: 12,
  feePercent: 100,
}

/** Terms of a booking made before the policy existed: free up to one hour, whatever the distance. */
export const LEGACY_POLICY: CancellationPolicy = {
  version: 'legacy',
  kmThreshold: DEFAULT_POLICY.kmThreshold,
  freeHoursShort: 1,
  freeHoursLong: 1,
  freeHoursHourly: 1,
  feePercent: 100,
}

/** Free-cancellation hours for a trip: hourly has its own, up to the km threshold is short, else (or unknown) long. */
export function freeHoursFor(p: CancellationPolicy, b: Pick<TripFacts, 'tripType' | 'distanceKm'> & { pickupMs?: number }): number {
  if (b.tripType === 'hourly') return p.freeHoursHourly
  if (b.distanceKm !== null && Number.isFinite(b.distanceKm) && b.distanceKm <= p.kmThreshold) return p.freeHoursShort
  return p.freeHoursLong
}

/** Free is inclusive at the deadline; at or after the pickup instant the answer is too_late. */
export function evaluateCancellation(p: CancellationPolicy, b: TripFacts, nowMs: number): CancelOutcome {
  const freeUntilMs = b.pickupMs - Math.round(freeHoursFor(p, b) * HOUR_MS)
  if (nowMs >= b.pickupMs) return { kind: 'too_late', freeUntilMs }
  return nowMs <= freeUntilMs ? { kind: 'free', freeUntilMs } : { kind: 'late', freeUntilMs }
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

/**
 * The policy a booking was made under (D-18). NULL, unparseable or out-of-bounds data is a booking
 * from before the policy existed and gets the legacy terms, never today's settings.
 */
export function policyFromSnapshot(snapshot: unknown): CancellationPolicy {
  let raw = snapshot
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return LEGACY_POLICY
    }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return LEGACY_POLICY
  const s = raw as Record<string, unknown>
  const { km, hours, percent } = POLICY_BOUNDS
  if (
    typeof s.version !== 'string' ||
    s.version.length === 0 ||
    !isIntInRange(s.kmThreshold, km.min, km.max) ||
    !isIntInRange(s.freeHoursShort, hours.min, hours.max) ||
    !isIntInRange(s.freeHoursLong, hours.min, hours.max) ||
    !isIntInRange(s.freeHoursHourly, hours.min, hours.max) ||
    !isIntInRange(s.feePercent, percent.min, percent.max)
  ) {
    return LEGACY_POLICY
  }
  return {
    version: s.version,
    kmThreshold: s.kmThreshold,
    freeHoursShort: s.freeHoursShort,
    freeHoursLong: s.freeHoursLong,
    freeHoursHourly: s.freeHoursHourly,
    feePercent: s.feePercent,
  }
}

/** The fee an operator dialog proposes, in minor units: the percent of the base, within 1..base. */
export function proposedFeeMinor(baseMinor: number, percent: number): number {
  const raw = Math.round((baseMinor * percent) / 100)
  return Math.max(1, Math.min(baseMinor, raw))
}

/** Trip facts from a bookings row; null when the pickup instant cannot be determined. */
export function tripFactsFromRow(row: {
  trip_type: string
  distance_km: number | null
  pickup_utc: string | null
  pickup_date: string
  pickup_time: string
}): TripFacts | null {
  const pickupMs = pickupInstantMs(row)
  if (pickupMs === null) return null
  const km = row.distance_km
  return {
    tripType: row.trip_type,
    distanceKm: typeof km === 'number' && Number.isFinite(km) ? km : null,
    pickupMs,
  }
}
