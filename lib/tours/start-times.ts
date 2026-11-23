// Phase 93 (plan 93-12; TRIP-04; D-10): start times and bookable days of the tour booking box.
// The box picks the start like the main booking engine: an hour column and a minute column in 15-minute steps,
// limited to the tour's start window (start_time_min..start_time_max).
// Times are Europe/Prague wall clock; the 12-hour lead time is evaluated on the real instant (pickupInstantMs),
// so it holds across the daylight-saving changes. Pure and client-safe.

import { getPragueTodayISO, pickupInstantMs } from '@/lib/prague-date'
import { meetsBookingLeadTime } from '@/lib/payments/timing'

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/

/** Minute step of the start-time picker. */
export const START_MINUTE_STEP = 15
/** The minute column of the picker. */
export const START_MINUTES = ['00', '15', '30', '45'] as const

function toMinutes(t: string): number | null {
  const m = TIME_RE.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** 'HH:MM' start times every 15 minutes from min to max inclusive ('08:00', '09:00' gives 5); [] for bad input. */
export function startTimeOptions(min: string, max: string): string[] {
  const a = toMinutes(min)
  const b = toMinutes(max)
  if (a === null || b === null || b < a) return []
  const out: string[] = []
  for (let m = a; m <= b; m += START_MINUTE_STEP) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
}

/** True when a start at date (YYYY-MM-DD) + time (HH:MM), Prague time, is at least 12 hours after nowMs. */
export function isStartBookable(date: string, time: string, nowMs: number): boolean {
  const ms = pickupInstantMs({ pickup_utc: null, pickup_date: date, pickup_time: time })
  return ms !== null && meetsBookingLeadTime(ms, nowMs)
}

/**
 * True when the day is not before today (Prague) and at least one start time of the window is 12 hours ahead.
 * The lead time only shrinks as the time grows, so the latest start decides.
 */
export function isDateBookable(date: string, min: string, max: string, nowMs: number): boolean {
  const options = startTimeOptions(min, max)
  if (options.length === 0) return false
  if (date < getPragueTodayISO(new Date(nowMs))) return false
  return isStartBookable(date, options[options.length - 1], nowMs)
}

/** The hour column: every hour ('HH') that has at least one start time of the window, in order. */
export function startHours(options: readonly string[]): string[] {
  return Array.from(new Set(options.map((o) => o.slice(0, 2))))
}
