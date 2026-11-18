// Quote cancellation terms (Phase 92, plan 92-02; QUOTE-04; D-03, D-06, D-11, D-13; T-92-08).
//
// The terms of a quote are resolved once, when the version is frozen, and stored in the standard cancellation snapshot
// shape (the three free-hour fields equal) with a version that starts with 'quote-'. That prefix is what lets
// policyFromSnapshot keep up to 720 hours instead of silently turning a long custom window into the legacy one-hour
// policy. The free window is measured from the FIRST trip (D-06); the fee is a percent of the DEPOSIT, so a client
// is never charged more than the deposit for cancelling (D-11). An empty fee percent means all of the deposit, an
// empty free-hours field means the global policy's hours for the first trip. Pure and client-safe.

import {
  POLICY_BOUNDS,
  QUOTE_POLICY_VERSION_PREFIX,
  freeHoursFor,
  policyFromSnapshot,
  proposedFeeMinor,
  type CancellationPolicy,
} from '@/lib/cancellation-policy'

export { QUOTE_POLICY_VERSION_PREFIX }

/** Fee percent when the operator leaves it empty (D-11: "default all of it"). */
export const QUOTE_DEFAULT_FEE_PERCENT = 100

const HOUR_MS = 3_600_000

function assertCustom(name: string, value: number | null, min: number, max: number): void {
  if (value === null) return
  if (!Number.isInteger(value) || value < min || value > max) {
    // Money and terms: refuse instead of clamping. The builder and the API validate before they get here.
    throw new RangeError(`resolveQuotePolicy: ${name} must be a whole number from ${min} to ${max}`)
  }
}

export interface ResolvedQuotePolicy {
  version: string
  snapshot: Record<string, string | number>
  freeHours: number
  feePercent: number
}

/**
 * The terms to store on a version being frozen: custom free hours (0..720) or the global policy's hours for the
 * first trip, and the custom fee percent (1..100) or 100.
 */
export function resolveQuotePolicy(input: {
  customFreeHours: number | null
  customFeePercent: number | null
  globalPolicy: CancellationPolicy
  firstLine: { trip_type: string; distance_km: number | null }
}): ResolvedQuotePolicy {
  const { customFreeHours, customFeePercent, globalPolicy, firstLine } = input
  assertCustom('customFreeHours', customFreeHours, POLICY_BOUNDS.quoteHours.min, POLICY_BOUNDS.quoteHours.max)
  assertCustom('customFeePercent', customFeePercent, POLICY_BOUNDS.percent.min, POLICY_BOUNDS.percent.max)

  const freeHours =
    customFreeHours ?? freeHoursFor(globalPolicy, { tripType: firstLine.trip_type, distanceKm: firstLine.distance_km })
  const feePercent = customFeePercent ?? QUOTE_DEFAULT_FEE_PERCENT
  const version = `${QUOTE_POLICY_VERSION_PREFIX}${globalPolicy.version}`

  return {
    version,
    snapshot: {
      version,
      kmThreshold: globalPolicy.kmThreshold,
      freeHoursShort: freeHours,
      freeHoursLong: freeHours,
      freeHoursHourly: freeHours,
      feePercent,
    },
    freeHours,
    feePercent,
  }
}

/** The terms stored in a quote snapshot. An unreadable snapshot gives the legacy terms (one hour, all of the deposit). */
export function termsFromSnapshot(snapshot: unknown): { freeHours: number; feePercent: number } {
  const p = policyFromSnapshot(snapshot)
  return { freeHours: p.freeHoursShort, feePercent: p.feePercent }
}

/** Free cancellation ends this long before the FIRST pickup (D-06). Real milliseconds, so DST never shifts it. */
export function quoteFreeUntilMs(firstPickupMs: number, freeHours: number): number {
  return firstPickupMs - Math.round(freeHours * HOUR_MS)
}

/** Prestigo cancelling is always free for the client; the client asking is free up to and including the deadline. */
export function evaluateQuoteCancel(input: {
  freeUntilMs: number
  nowMs: number
  initiator: 'admin_client' | 'admin_prestigo'
}): 'free' | 'late' {
  if (input.initiator === 'admin_prestigo') return 'free'
  return input.nowMs <= input.freeUntilMs ? 'free' : 'late'
}

/** The part of the deposit Prestigo keeps after a late cancel: the percent of the deposit, never more than the deposit. */
export function keptDepositMinor(depositMinor: number, feePercent: number): number {
  if (!Number.isFinite(depositMinor) || depositMinor <= 0) return 0
  return proposedFeeMinor(depositMinor, feePercent)
}
