// Phase 93 (plan 93-12; TRIP-04; D-10): start-time chips and bookable days of the tour booking box.
// Times are Europe/Prague wall clock; the 12-hour lead time is evaluated on the real instant (pickupInstantMs),
// so it holds across the daylight-saving changes. Pure and client-safe.

import { getPragueTodayISO, pickupInstantMs } from '@/lib/prague-date'
import { meetsBookingLeadTime } from '@/lib/payments/timing'

const TIME_RE = /^([01]\d|2[0-3]):(00|30)$/

function toMinutes(t: string): number | null {
  const m = TIME_RE.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** 'HH:MM' chips every 30 minutes from min to max inclusive ('08:00', '11:00' gives 7 chips); [] for bad input. */
export function startTimeOptions(min: string, max: string): string[] {
  const a = toMinutes(min)
  const b = toMinutes(max)
  if (a === null || b === null || b < a) return []
  const out: string[] = []
  for (let m = a; m <= b; m += 30) {
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
