// Phase 94 plan 94-03 (D-11, D-12): server-side label helpers shared by the offers and rides lists.
// Pure functions, no I/O. Only data a driver may see goes through here: first name, route, day, class, driver fee.

import { formatCZK } from '@/lib/currency'
import { shiftIsoDate } from '@/lib/prague-date'

/** The driver's own fee as '2 500 Kč', or null unless it is a positive integer (never '0 Kč', D-12). */
export function driverFeeLabel(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null
  return formatCZK(value)
}

/** The passenger's first name, trimmed and capped at 60 characters. The last name never reaches the cabinet (D-11). */
export function firstNameOf(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().slice(0, 60)
}

const DAY_PARTS = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/**
 * 'Today' | 'Tomorrow' | 'Fri 27 Nov' | 'Fri 8 Jan 2027' (the year only when it differs from today's).
 * Both inputs are Europe/Prague calendar dates (YYYY-MM-DD). The date is formatted at UTC noon in the UTC zone, so the
 * label never shifts with the server or browser zone or with a DST change.
 */
export function pragueDayLabel(isoDate: string, todayIso: string): string {
  if (isoDate === todayIso) return 'Today'
  if (isoDate === shiftIsoDate(todayIso, 1)) return 'Tomorrow'

  const d = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return isoDate

  const parts: Record<string, string> = {}
  for (const p of DAY_PARTS.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value
  }
  const base = `${parts.weekday} ${parts.day} ${parts.month}`
  const year = isoDate.slice(0, 4)
  return year === todayIso.slice(0, 4) ? base : `${base} ${year}`
}

/** The text before the first comma (a short place name), cut with an ellipsis so the result is at most `max` characters. */
export function placeLabel(address: string | null | undefined, max = 28): string {
  if (typeof address !== 'string') return ''
  const first = address.split(',')[0].trim()
  if (first.length <= max) return first
  return `${first.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** The drop-off line: 'As directed' when the booking has none (hourly / open-ended). */
export function dropoffText(address: string | null | undefined): string {
  const text = typeof address === 'string' ? address.trim() : ''
  return text === '' ? 'As directed' : text
}

/** A vehicle plate for display (trimmed, upper case, at most 16 characters), or null when empty. */
export function plateLabel(plate: string | null | undefined): string | null {
  if (typeof plate !== 'string') return null
  const text = plate.trim().toUpperCase().slice(0, 16)
  return text === '' ? null : text
}
