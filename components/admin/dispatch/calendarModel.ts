// Pure placement model for the dispatch calendar (Phase 90 plan 08, DISP-03).
//
// A booking's calendar day, start minute and end minute come only from its pickup instant through the
// Prague helpers in lib/prague-calendar.ts, never from a local Date getter, so a booking around midnight
// lands on the right Prague day whatever the browser timezone is, including the DST-change weeks.
// No React, no Next: importable from the client component and from tests.

import { CALENDAR_ACTIVE_STATUSES, isBookingStatus } from '@/lib/booking-status'
import { estimateDurationMinutes } from '@/lib/trip-duration'
import { pickupInstantMs, shiftIsoDate } from '@/lib/prague-date'
import {
  comparePickup,
  layoutDay,
  pragueDateOf,
  pragueDayStartMs,
  pragueMinuteOfDay,
  type Placed,
} from '@/lib/prague-calendar'

/** The booking fields the calendar reads. AdminBooking satisfies it. */
export interface CalendarRow {
  status: string
  pickup_utc?: string | null
  pickup_date: string
  pickup_time: string
  booking_reference: string
  hours?: number | null
  distance_km?: number | null
}

export interface CalendarItem<T> {
  item: T
  /** Prague calendar day of the pickup instant (YYYY-MM-DD). */
  dayIso: string
  /** Prague wall-clock minute of the pickup (0..1439). */
  startMin: number
  /** Prague wall-clock minute the block ends, at most 1440 (clipped at midnight). */
  endMin: number
  /** The trip runs past Prague midnight; the block is clipped to its start day. */
  continues: boolean
  /** Shown only because "Show all" is on (unpaid, pending, cancelled, unknown status). */
  faded: boolean
}

const MINUTE_MS = 60_000
const DAY_END_MIN = 1440

/**
 * Turns booking rows into calendar items. Rows whose pickup does not parse are skipped. Unless `showAll`
 * is on, only CALENDAR_ACTIVE_STATUSES are kept (D-14); with it on the rest come back `faded`.
 */
export function toCalendarItems<T extends CalendarRow>(rows: T[], opts: { showAll: boolean }): CalendarItem<T>[] {
  const out: CalendarItem<T>[] = []
  for (const row of rows) {
    const active = isBookingStatus(row.status) && CALENDAR_ACTIVE_STATUSES.has(row.status)
    if (!active && !opts.showAll) continue

    const startMs = pickupInstantMs({
      pickup_utc: row.pickup_utc ?? null,
      pickup_date: row.pickup_date,
      pickup_time: row.pickup_time,
    })
    if (startMs === null) continue

    const dayIso = pragueDateOf(startMs)
    const startMin = pragueMinuteOfDay(startMs)
    const length = estimateDurationMinutes(row)
    const endMs = startMs + length * MINUTE_MS

    let endMin: number
    let continues = false
    if (pragueDateOf(endMs) === dayIso) {
      const wallEnd = pragueMinuteOfDay(endMs)
      // The wall clock only runs backwards inside the repeated 02:xx hour of the 25 h day; keep the real length there.
      endMin = wallEnd > startMin ? wallEnd : Math.min(DAY_END_MIN, startMin + length)
    } else {
      endMin = DAY_END_MIN
      // Ending exactly at the next Prague midnight is a full day, not a spill-over.
      continues = endMs !== pragueDayStartMs(shiftIsoDate(dayIso, 1))
    }

    out.push({ item: row, dayIso, startMin, endMin, continues, faded: !active })
  }
  return out
}

/**
 * Groups items by Prague day and lays each day out in side-by-side columns. Items are put in a fixed
 * order first (pickup instant, then reference), so the same data always gets the same columns.
 */
export function itemsByDay<T extends CalendarRow>(items: CalendarItem<T>[]): Record<string, Placed<CalendarItem<T>>[]> {
  const byDay: Record<string, CalendarItem<T>[]> = {}
  for (const it of items) (byDay[it.dayIso] ??= []).push(it)
  const out: Record<string, Placed<CalendarItem<T>>[]> = {}
  for (const [day, list] of Object.entries(byDay)) {
    const sorted = [...list].sort((a, b) => comparePickup(a.item, b.item))
    out[day] = layoutDay(sorted.map(it => ({ item: it, startMin: it.startMin, endMin: it.endMin })))
  }
  return out
}

/** 'HH:MM' from minutes since Prague midnight. */
export function formatMinute(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
