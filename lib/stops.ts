import { eurToCzk } from '@/lib/currency'

/**
 * Phase 91: stop and waiting rules shared by the quote (calculate-price), the checkout, the extra
 * charge after a trip and the booking UI. Pure and client-safe: no I/O, no secrets. The rate per
 * 15-minute block is never defined here; it comes from the admin pricing config (CLAUDE.md: no
 * hard-coded prices).
 */

/** D-17: at most 5 intermediate stops per transfer. */
export const MAX_STOPS = 5
/** D-04: the first 15 minutes at every stop are free, per stop (never pooled across stops). */
export const STOP_FREE_WAIT_MIN = 15
/** D-04: every started 15 minutes after the free time is one paid block. */
export const WAIT_BLOCK_MIN = 15
/** A client can ask for at most 2 hours of waiting at one stop. */
export const MAX_STOP_WAIT_MIN = 120
/** D-16: the most waiting time the driver can charge after the trip in one extra charge (8 hours). */
export const MAX_EXTRA_WAIT_MIN = 480

export interface StopInput {
  address?: string
  lat: number
  lng: number
  waitMinutes: number
}

export interface PricedStop {
  position: number
  address: string
  lat: number
  lng: number
  waitMinutes: number
  freeMinutes: number
  blocks: number
  feePerBlockEur: number | null
  feeEur: number
}

/** A stop wait is an integer 0..120 minutes in steps of 15. */
export function isValidStopWait(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes <= MAX_STOP_WAIT_MIN &&
    minutes % WAIT_BLOCK_MIN === 0
  )
}

/** Paid blocks for one stop: 0 when the wait is not finite or within the free 15 minutes. */
export function waitingBlocks(waitMinutes: number): number {
  if (!Number.isFinite(waitMinutes) || waitMinutes <= STOP_FREE_WAIT_MIN) return 0
  return Math.ceil((waitMinutes - STOP_FREE_WAIT_MIN) / WAIT_BLOCK_MIN)
}

/** Paid blocks over all stops. The free time applies per stop, so it is never pooled. */
export function totalWaitingBlocks(stops: ReadonlyArray<{ waitMinutes: number }>): number {
  let total = 0
  for (const stop of stops) total += waitingBlocks(stop.waitMinutes)
  return total
}

/** Waiting amount of a booking in EUR. Rounded once per booking, never per stop. */
export function waitingFeeEur(blocks: number, ratePerBlockEur: number): number {
  return Math.round(blocks * ratePerBlockEur)
}

/**
 * Per-stop rows for storage and display. feeEur is unrounded (blocks x rate) so the booking total is
 * rounded once from the sum; feePerBlockEur is null when the stop has nothing to pay.
 */
export function priceStops(stops: ReadonlyArray<StopInput>, ratePerBlockEur: number | null): PricedStop[] {
  return stops.map((stop, index) => {
    const blocks = waitingBlocks(stop.waitMinutes)
    const rate = ratePerBlockEur ?? 0
    return {
      position: index + 1,
      address: stop.address ?? '',
      lat: stop.lat,
      lng: stop.lng,
      waitMinutes: stop.waitMinutes,
      freeMinutes: STOP_FREE_WAIT_MIN,
      blocks,
      feePerBlockEur: blocks > 0 ? ratePerBlockEur : null,
      feeEur: blocks > 0 ? blocks * rate : 0,
    }
  })
}

/** Booking waiting total for already stored rows (displays): sum of the row fees, rounded once. */
export function waitingTotalEur(stops: ReadonlyArray<{ feeEur: number }>): number {
  let sum = 0
  for (const stop of stops) sum += stop.feeEur
  return Math.round(sum)
}

/** D-16: blocks of an extra charge after the trip. Every started 15 minutes counts, no free deduction. */
export function extraWaitingBlocks(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.ceil(minutes / WAIT_BLOCK_MIN)
}

/** D-16: the extra-charge amount in minor units (cents or haléř-style hundredths of the currency). */
export function extraWaitingAmountMinor(
  minutes: number,
  ratePerBlockEur: number,
  currency: 'eur' | 'czk',
): number {
  const eur = Math.round(extraWaitingBlocks(minutes) * ratePerBlockEur)
  return currency === 'czk' ? eurToCzk(eur) * 100 : eur * 100
}
