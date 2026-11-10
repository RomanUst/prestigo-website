// Pure, client-safe Europe/Prague calendar helpers for the dispatch views (Phase 90).
//
// DISP-03: a booking around midnight must land on the correct Prague day regardless of the
// browser's or server's timezone, including the DST-change weeks. Every helper here derives
// day, minute and weekday through Intl with timeZone Europe/Prague, or through the existing
// pickupInstantMs / getPragueTodayISO / shiftIsoDate. Never use local Date getters, the
// Date(y, m, d) constructor or toISOString on a local date in this file.
//
// No React, no Next, no server-only imports: importable from client components.

import { getPragueTodayISO, pickupInstantMs, shiftIsoDate } from '@/lib/prague-date'

const PRAGUE_TZ = 'Europe/Prague'

const minuteParts = new Intl.DateTimeFormat('en-US', {
  timeZone: PRAGUE_TZ,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

/** Prague wall-clock hour and minute of an instant. */
function pragueHourMinute(ms: number): { hour: number; minute: number } {
  let hour = 0
  let minute = 0
  for (const p of minuteParts.formatToParts(new Date(ms))) {
    if (p.type === 'hour') hour = Number(p.value)
    else if (p.type === 'minute') minute = Number(p.value)
  }
  // Some ICU builds print midnight as "24" even with h23; fold it back.
  return { hour: hour === 24 ? 0 : hour, minute }
}

/** The Prague calendar date (YYYY-MM-DD) of an instant. */
export function pragueDateOf(ms: number): string {
  return getPragueTodayISO(new Date(ms))
}

/** Wall-clock minutes since Prague midnight for an instant (0..1439). */
export function pragueMinuteOfDay(ms: number): number {
  const { hour, minute } = pragueHourMinute(ms)
  return hour * 60 + minute
}

/** The instant of Prague midnight at the start of a calendar date. */
export function pragueDayStartMs(iso: string): number {
  return pickupInstantMs({ pickup_utc: null, pickup_date: iso, pickup_time: '00:00' }) as number
}

/** The Monday on or before a calendar date (weeks are Monday-first, D-15). Calendar-date math only. */
export function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return shiftIsoDate(iso, dow === 0 ? -6 : 1 - dow)
}

/** 'HH:MM', 24 h, Prague wall clock. */
export function formatPragueTime(ms: number): string {
  const { hour, minute } = pragueHourMinute(ms)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export interface PickupRow {
  pickup_utc?: string | null
  pickup_date: string
  pickup_time: string
  booking_reference: string
}

/**
 * D-08: earliest pickup instant first, booking_reference as the tie-break, rows whose instant
 * does not parse last. Deterministic for equal inputs.
 */
export function comparePickup(a: PickupRow, b: PickupRow): number {
  const am = pickupInstantMs({ pickup_utc: a.pickup_utc ?? null, pickup_date: a.pickup_date, pickup_time: a.pickup_time })
  const bm = pickupInstantMs({ pickup_utc: b.pickup_utc ?? null, pickup_date: b.pickup_date, pickup_time: b.pickup_time })
  if (am !== null && bm !== null) {
    if (am !== bm) return am - bm
  } else if (am !== null) {
    return -1
  } else if (bm !== null) {
    return 1
  }
  return a.booking_reference.localeCompare(b.booking_reference)
}
