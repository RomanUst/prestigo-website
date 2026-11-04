// Pure hold-timing rules for the card-on-file flow (Phase 88, plan 88-06; HOLD-02, D-11, D-12, D-13, D-18).
//
// Everything here is integer-millisecond arithmetic on instants: no floating hours, no wall-clock
// offsets, no month rule. The only wall-clock work is the Prague calendar date / minute of an instant
// (Intl, so DST is handled by the ICU data) and the Prague midnight that follows it. Client-safe: no
// server imports, so the checkout UI can show the same hold date the server computes.

import { getPragueTodayISO, pickupInstantMs, shiftIsoDate } from '@/lib/prague-date'

const HOUR_MS = 3_600_000

// These constants live here (client-safe) and are re-exported by lib/payments/config.ts.

/** Pickup must be at least this far away for the card flow (D-10). */
export const MIN_BOOKING_LEAD_MS = 12 * HOUR_MS
/** A failed charge or hold is retried this long after the failure, but never later than before pickup. */
export const RETRY_DELAY_MS = 12 * HOUR_MS
/** A retry closer than this to the failure is pointless: give up (null). */
export const RETRY_MIN_GAP_MS = 1 * HOUR_MS
/** The last retry must happen at least this long before pickup. */
export const RETRY_BEFORE_PICKUP_MS = 2 * HOUR_MS
/** A hold must outlive the (new) pickup by this margin or it is replaced. */
export const REPLACE_MARGIN_MS = 6 * HOUR_MS
/** A hold whose raw time falls at or after this Prague wall-clock time moves to the next Prague midnight (D-12). */
export const HOLD_DAY_CUTOFF_PRAGUE = '23:30'
const HOLD_DAY_CUTOFF_MINUTES = 23 * 60 + 30

const pragueClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

/** Minutes since Prague midnight of an instant (0..1439). */
function pragueMinuteOfDay(ms: number): number {
  let hour = 0
  let minute = 0
  for (const p of pragueClock.formatToParts(new Date(ms))) {
    if (p.type === 'hour') hour = Number(p.value)
    else if (p.type === 'minute') minute = Number(p.value)
  }
  return hour * 60 + minute
}

/** The Prague calendar date (YYYY-MM-DD) of an instant. */
export function holdDateIso(holdAtMs: number): string {
  return getPragueTodayISO(new Date(holdAtMs))
}

/**
 * When the hold is placed: `leadHours` absolute elapsed hours before pickup. A raw hold whose Prague
 * wall clock is 23:30 or later moves forward to the next Prague midnight, so a hold placed by the
 * 15-minute tick lands on the date the client was shown (D-12). The shift is at most 30 minutes.
 *
 * `rawHoldAtMs` is the unshifted instant: decideHoldMode and the money-never-held-longer-than-the-lead
 * rule (D-11) use it.
 */
export function computeHoldAt(pickupMs: number, leadHours: number): { holdAtMs: number; rawHoldAtMs: number } {
  const rawHoldAtMs = pickupMs - Math.round(leadHours * HOUR_MS)
  if (pragueMinuteOfDay(rawHoldAtMs) < HOLD_DAY_CUTOFF_MINUTES) {
    return { holdAtMs: rawHoldAtMs, rawHoldAtMs }
  }
  const nextMidnight = pickupInstantMs({
    pickup_utc: null,
    pickup_date: shiftIsoDate(holdDateIso(rawHoldAtMs), 1),
    pickup_time: '00:00',
  })
  // Prague midnight always exists (DST changes at 02:00 / 03:00); the fallback is defensive only.
  return { holdAtMs: nextMidnight ?? rawHoldAtMs, rawHoldAtMs }
}

/**
 * 'hold_now' when the raw hold instant has already passed (or is now): the card is authorised at
 * checkout. Otherwise 'setup': the card is saved and the tick places the hold later (D-11).
 */
export function decideHoldMode(rawHoldAtMs: number, nowMs: number): 'setup' | 'hold_now' {
  return rawHoldAtMs <= nowMs ? 'hold_now' : 'setup'
}

/** Pickup is far enough away for the card flow. Takes an instant (pickupInstantMs), never the month rule. */
export function meetsBookingLeadTime(pickupMs: number, nowMs: number): boolean {
  return pickupMs - nowMs >= MIN_BOOKING_LEAD_MS
}

/**
 * The next attempt after a failed hold / charge: 12 h later, clamped to 2 h before pickup. Null when the
 * clamped instant is less than 1 h after the failure (too close to pickup to retry usefully).
 */
export function retryAt(failedAtMs: number, pickupMs: number): number | null {
  const candidate = Math.min(failedAtMs + RETRY_DELAY_MS, pickupMs - RETRY_BEFORE_PICKUP_MS)
  return candidate < failedAtMs + RETRY_MIN_GAP_MS ? null : candidate
}

/**
 * After a pickup edit: must the existing hold be replaced? Yes when it has no known expiry, when it
 * would expire less than 6 h after the new pickup, or when the new raw hold instant is still in the
 * future (the hold would be taken earlier than the client consented to).
 */
export function needsReplace(args: {
  captureBeforeMs: number | null
  newPickupMs: number
  newRawHoldAtMs: number
  nowMs: number
}): boolean {
  const { captureBeforeMs, newPickupMs, newRawHoldAtMs, nowMs } = args
  if (captureBeforeMs === null) return true
  if (captureBeforeMs < newPickupMs + REPLACE_MARGIN_MS) return true
  return newRawHoldAtMs > nowMs
}
