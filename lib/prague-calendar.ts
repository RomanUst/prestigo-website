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

// ── Overlap layout (D-13) ──────────────────────────────────────────────────

/** Every block reserves at least this many minutes of vertical space so short trips stay clickable. */
export const MIN_BLOCK_MIN = 30

export interface Placed<T> {
  item: T
  startMin: number
  endMin: number
  col: number
  cols: number
}

/**
 * Greedy cluster packing for one Prague day (inputs already clipped to minutes 0..1440).
 * Blocks that overlap share a cluster and sit in side-by-side columns; blocks that merely touch
 * (one ends exactly when the next starts) do not overlap. Sorted by start, longer block first.
 */
export function layoutDay<T>(items: { item: T; startMin: number; endMin: number }[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const out: Placed<T>[] = []
  let cluster: Placed<T>[] = []
  let clusterEnd = -1
  let colEnds: number[] = []

  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length
    out.push(...cluster)
    cluster = []
    colEnds = []
    clusterEnd = -1
  }

  for (const it of sorted) {
    if (it.startMin >= clusterEnd && cluster.length) flush()
    let col = colEnds.findIndex((e) => e <= it.startMin)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(0)
    }
    colEnds[col] = Math.max(it.endMin, it.startMin + MIN_BLOCK_MIN)
    clusterEnd = Math.max(clusterEnd, colEnds[col])
    cluster.push({ ...it, col, cols: 1 })
  }
  flush()
  return out
}

// ── Month grid and calendar windows (D-15) ─────────────────────────────────

/** Monday-first month grid: from the Monday on or before the 1st to the Sunday on or after the last day. */
export function monthGrid(iso: string): { start: string; end: string; weeks: string[][] } {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7)) // 1..12
  const first = `${iso.slice(0, 7)}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate() // day 0 of next month = last day of this one
  const last = `${iso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
  const start = mondayOf(first)
  const end = shiftIsoDate(mondayOf(last), 6)
  const weeks: string[][] = []
  for (let monday = start; monday <= end; monday = shiftIsoDate(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => shiftIsoDate(monday, i)))
  }
  return { start, end, weeks }
}

export type CalendarView = 'day' | 'week' | 'month'

/** The inclusive date window a calendar view needs to fetch around an anchor date. */
export function calendarWindow(view: CalendarView, anchorIso: string): { startDate: string; endDate: string } {
  if (view === 'day') return { startDate: anchorIso, endDate: anchorIso }
  if (view === 'week') {
    const monday = mondayOf(anchorIso)
    return { startDate: monday, endDate: shiftIsoDate(monday, 6) }
  }
  const grid = monthGrid(anchorIso)
  return { startDate: grid.start, endDate: grid.end }
}

// ── Dispatch ranges (D-07) ─────────────────────────────────────────────────

export type RangePreset = 'today' | 'tomorrow' | '7days'

/** Prague calendar dates for a range preset (the UTC date can differ from Prague's near midnight). */
export function dispatchRange(preset: RangePreset, now: Date = new Date()): { startDate: string; endDate: string } {
  const today = getPragueTodayISO(now)
  if (preset === 'today') return { startDate: today, endDate: today }
  if (preset === 'tomorrow') {
    const tomorrow = shiftIsoDate(today, 1)
    return { startDate: tomorrow, endDate: tomorrow }
  }
  return { startDate: today, endDate: shiftIsoDate(today, 6) }
}

/** Longest custom range, inclusive, in days. */
export const MAX_RANGE_DAYS = 62

const STRICT_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/** Calendar-date check by UTC round trip: rejects malformed strings and impossible dates (30 February). */
function isoDayNumber(iso: string): number | null {
  const m = STRICT_ISO_DATE.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(y, mo - 1, d)
  const check = new Date(ms)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return ms / DAY_MS
}

/**
 * A custom range is valid when both ends are real YYYY-MM-DD dates, start is not after end and
 * the inclusive span is at most MAX_RANGE_DAYS. Returns the range, or null when invalid.
 */
export function validateCustomRange(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } | null {
  const s = isoDayNumber(startDate)
  const e = isoDayNumber(endDate)
  if (s === null || e === null || s > e) return null
  if (e - s + 1 > MAX_RANGE_DAYS) return null
  return { startDate, endDate }
}
