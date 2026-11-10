// Phase 90 plan 07 (DISP-01, DISP-02): the pure model of the dispatch board. No React, no fetch.
//
// Column order is the D-05 flow order, written out here. It is deliberately NOT derived from
// BOOKING_STATUSES (that list follows the database CHECK, not the operator's flow).
// What may move where is read from UI_TRANSITIONS only; the server keeps VALID_TRANSITIONS and the
// compare-and-set as the authority, the board is not a security boundary.

import { comparePickup, formatPragueTime, type PickupRow } from '@/lib/prague-calendar'
import { pickupInstantMs } from '@/lib/prague-date'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'

/** Seven flexible columns for the live part of a trip. */
export const ACTIVE_COLUMNS = ['unpaid', 'pending', 'confirmed', 'assigned', 'en_route', 'on_location', 'on_board'] as const

/** Three narrow rails for finished bookings; collapsed until clicked. */
export const TERMINAL_COLUMNS = ['completed', 'cancelled', 'no_show'] as const

export const BOARD_COLUMNS = [...ACTIVE_COLUMNS, ...TERMINAL_COLUMNS] as const

export type BoardColumn = (typeof BOARD_COLUMNS)[number]

export function isTerminalColumn(column: string): boolean {
  return (TERMINAL_COLUMNS as readonly string[]).includes(column)
}

/**
 * One list per column, each sorted by pickup instant (earliest first) with booking_reference as the
 * tie-break (D-08). Flags never change the order, so the same data gives the same order after every
 * poll. A row with a status outside the ten columns is not shown (the database CHECK makes that
 * unreachable).
 */
export function groupByColumn<T extends PickupRow & { status: string }>(rows: T[]): Record<BoardColumn, T[]> {
  const out = {} as Record<BoardColumn, T[]>
  for (const column of BOARD_COLUMNS) out[column] = []
  for (const row of rows) {
    const list = out[row.status as BoardColumn]
    if (list) list.push(row)
  }
  for (const column of BOARD_COLUMNS) out[column].sort(comparePickup)
  return out
}

/** The statuses a booking in `status` may be moved to from the UI. */
export function allowedTargets(status: string): ReadonlySet<string> {
  return new Set(UI_TRANSITIONS[status] ?? [])
}

/**
 * Where a drop lands: the over id when it is a column the dragged booking may move to, otherwise
 * null (no column, the card's own column, or a column UI_TRANSITIONS does not allow).
 */
export function resolveDrop(b: { status: string }, overId: string | null | undefined): string | null {
  if (!overId) return null
  if (overId === b.status) return null
  return allowedTargets(b.status).has(overId) ? overId : null
}

export type ColumnDropState = 'idle' | 'allowed' | 'blocked'

/** What a column looks like while a card is dragged: idle (nothing dragged), allowed or blocked. */
export function columnDropState(column: string, draggingStatus: string | null): ColumnDropState {
  if (draggingStatus === null) return 'idle'
  return allowedTargets(draggingStatus).has(column) ? 'allowed' : 'blocked'
}

const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', day: 'numeric', month: 'short' })

/**
 * The Prague pickup time shown on a card, derived from the pickup instant and never from the raw
 * pickup_time text. With `withDate` (a multi-day range) the Prague day comes first. Falls back to
 * '--:--' when the instant does not parse.
 */
export function pickupLabel(b: PickupRow, withDate: boolean): string {
  const ms = pickupInstantMs({ pickup_utc: b.pickup_utc ?? null, pickup_date: b.pickup_date, pickup_time: b.pickup_time })
  if (ms === null) return '--:--'
  const time = formatPragueTime(ms)
  if (!withDate) return time
  return `${shortDate.format(new Date(ms))} ${time}`
}
