import { createSupabaseServiceClient } from '@/lib/supabase'
import type { PricedStop } from '@/lib/stops'

/**
 * Phase 91 (STOP-04, Pitfalls 5 and 9): the stops of a booking, stored with the price snapshot taken at checkout and
 * read through ONE loader by every display surface (admin, driver, emails, calendar).
 *
 * Server only. The table is deny-all (migration 089): every read and write goes through the service client, which is
 * created inside each function and never at module load. Stop addresses are client PII, so errors and logs carry
 * booking ids and fixed codes only, never an address or a coordinate.
 */

export interface BookingStop {
  position: number
  address: string | null
  lat: number | null
  lng: number | null
  waitMinutes: number
  freeMinutes: number
  blocks: number
  feePerBlockEur: number | null
  feeEur: number
}

/** Ids per `in` filter, so a long list never builds an oversized request URL. */
const ID_CHUNK = 200

const STOP_COLUMNS =
  'booking_id, position, address, lat, lng, wait_minutes, free_minutes, blocks, fee_per_block_eur, fee_eur'

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/**
 * Replaces ALL stops of a booking with the priced ones: delete by booking id, then insert when the list is not empty.
 * An empty list therefore clears the stops of an earlier attempt. Safe to repeat (a retry of the same attempt).
 * Throws Error('booking stops save failed') on any database error; the message never carries an address.
 */
export async function saveBookingStops(bookingId: string, stops: ReadonlyArray<PricedStop>): Promise<void> {
  const supabase = createSupabaseServiceClient()

  const { error: deleteError } = await supabase.from('booking_stops').delete().eq('booking_id', bookingId)
  if (deleteError) throw new Error('booking stops save failed')
  if (stops.length === 0) return

  const rows = stops.map((stop) => ({
    booking_id: bookingId,
    position: stop.position,
    // The column holds NULL or 1..500 characters; a stop without a typed address is stored as NULL.
    address: stop.address.trim() === '' ? null : stop.address,
    lat: stop.lat,
    lng: stop.lng,
    wait_minutes: stop.waitMinutes,
    free_minutes: stop.freeMinutes,
    blocks: stop.blocks,
    fee_per_block_eur: stop.feePerBlockEur,
    fee_eur: stop.feeEur,
  }))
  const { error: insertError } = await supabase.from('booking_stops').insert(rows)
  if (insertError) throw new Error('booking stops save failed')
}

/**
 * Stops of many bookings, ordered by position inside each booking. A booking without stops has no entry. Numeric
 * columns are cast with Number() (the driver returns numeric as a string). No query for an empty list; chunks of 200
 * ids. Throws Error('booking stops read failed') on a read error.
 */
export async function loadStopsByBookingIds(ids: ReadonlyArray<string>): Promise<Map<string, BookingStop[]>> {
  const byBooking = new Map<string, BookingStop[]>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return byBooking

  const supabase = createSupabaseServiceClient()
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK)
    const { data, error } = await supabase
      .from('booking_stops')
      .select(STOP_COLUMNS)
      .in('booking_id', chunk)
      .order('position', { ascending: true })
    if (error) throw new Error('booking stops read failed')
    for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
      const bookingId = String(raw.booking_id)
      const stop: BookingStop = {
        position: Number(raw.position),
        address: typeof raw.address === 'string' ? raw.address : null,
        lat: numOrNull(raw.lat),
        lng: numOrNull(raw.lng),
        waitMinutes: Number(raw.wait_minutes),
        freeMinutes: Number(raw.free_minutes),
        blocks: Number(raw.blocks),
        feePerBlockEur: numOrNull(raw.fee_per_block_eur),
        feeEur: Number(raw.fee_eur),
      }
      const list = byBooking.get(bookingId)
      if (list) list.push(stop)
      else byBooking.set(bookingId, [stop])
    }
  }
  for (const list of byBooking.values()) list.sort((a, b) => a.position - b.position)
  return byBooking
}

/** Adds `stops` to every row: the stored stops of that booking, or [] when it has none. One query for the whole list. */
export async function attachStops<T extends { id: string }>(rows: T[]): Promise<Array<T & { stops: BookingStop[] }>> {
  const stopsById = await loadStopsByBookingIds(rows.map((row) => row.id))
  return rows.map((row) => ({ ...row, stops: stopsById.get(row.id) ?? [] }))
}

/**
 * The stops of one booking for a surface that must still render when the read fails (an email, a calendar event):
 * [] on any error. Logs the booking id only.
 */
export async function loadStopsSafe(bookingId: string): Promise<BookingStop[]> {
  try {
    return (await loadStopsByBookingIds([bookingId])).get(bookingId) ?? []
  } catch {
    console.error('[booking-stops] stops could not be read', { bookingId })
    return []
  }
}
