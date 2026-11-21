// Phase 93 (plan 93-05; TRIP-04; D-12): the cancellation terms of a tour booking.
// A tour has one free-cancellation window (tour_settings.free_cancel_hours, default 24 h) and a 100 % fee
// after it. The terms shown at booking are stored on the booking as a `tour-` prefixed snapshot, so a later
// settings change never rewrites an accepted booking. Pure and client-safe: the snapshot shape is built here
// (same fields as buildPolicySnapshot in lib/cancellation-settings.ts, which is server-only; a test pins them equal).

import {
  CANCELLATION_POLICY_VERSION,
  DEFAULT_POLICY,
  POLICY_BOUNDS,
  type CancellationPolicy,
} from '@/lib/cancellation-policy'

/** Version prefix of a snapshot made for a tour; the stored snapshot stays within POLICY_BOUNDS.hours (0..72). */
export const TOUR_POLICY_VERSION_PREFIX = 'tour-'

const FALLBACK_FREE_HOURS = 24

function clampHours(h: number): number {
  if (!Number.isFinite(h)) return FALLBACK_FREE_HOURS
  const { min, max } = POLICY_BOUNDS.hours
  return Math.min(max, Math.max(min, Math.round(h)))
}

/** The policy of a tour booking: all three windows equal freeHours (clamped to 0..72), fee 100 %. */
export function tourPolicy(freeHours: number): CancellationPolicy {
  const hours = clampHours(freeHours)
  return {
    ...DEFAULT_POLICY,
    version: TOUR_POLICY_VERSION_PREFIX + CANCELLATION_POLICY_VERSION,
    freeHoursShort: hours,
    freeHoursLong: hours,
    freeHoursHourly: hours,
    feePercent: 100,
  }
}

/** The values stored on a new tour booking: bookings.cancel_policy_version and bookings.cancel_policy. */
export function buildTourPolicySnapshot(freeHours: number): { version: string; snapshot: Record<string, string | number> } {
  const policy = tourPolicy(freeHours)
  return {
    version: policy.version,
    snapshot: {
      version: policy.version,
      kmThreshold: policy.kmThreshold,
      freeHoursShort: policy.freeHoursShort,
      freeHoursLong: policy.freeHoursLong,
      freeHoursHourly: policy.freeHoursHourly,
      feePercent: policy.feePercent,
    },
  }
}
