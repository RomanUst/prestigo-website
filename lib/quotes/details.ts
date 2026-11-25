// The TBC fields of a sent quote, filled in by the operator (migration 099, owner request 2026-11-24).
//
// A quote may be sent with fields still to be confirmed (pickup date, time, addresses, hours, return date, tour title).
// fillQuoteDetails writes, line by line, only the fields that are still empty on the version the client has: the
// database function quote_fill_line_details refuses to change anything the client was shown, and drops the stored PDF so
// the next download shows the new details. A transfer whose two addresses are now known gets its server distance. When the
// quote was already paid with its bookings waiting and every line is now complete, the bookings are made at once
// (createQuoteBookingsWhenComplete) and the client gets the confirmation with the booking references.
//
// Server only. Logs carry ids and codes only, never an address.

import { createSupabaseServiceClient } from '@/lib/supabase'
import { computeRouteDistance } from '@/lib/route-distance'
import { createQuoteBookingsWhenComplete, type PendingBookingsOutcome } from '@/lib/quotes/convert'
import type { QuoteDetailsPayload } from '@/lib/quotes/schemas'
import type { QuoteLineRow, QuoteRow } from '@/lib/quotes/types'

export type FillQuoteDetailsResult =
  | { ok: true; complete: boolean; bookings: PendingBookingsOutcome | null }
  | { ok: false; code: 'not_found' | 'not_sendable' | 'unknown_line' | 'closed' | 'not_current' }

type Row = Record<string, unknown>

export async function fillQuoteDetails(
  quoteId: string,
  payload: QuoteDetailsPayload,
  actor: { id: string },
): Promise<FillQuoteDetailsResult> {
  const supabase = createSupabaseServiceClient()
  const { data: quoteData, error: quoteError } = await supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (quoteError) throw new Error('quote details read failed')
  const quote = quoteData as QuoteRow | null
  if (!quote) return { ok: false, code: 'not_found' }
  if (quote.voided_at || quote.cancelled_at || quote.anonymised_at) return { ok: false, code: 'closed' }
  if (!['sent', 'viewed', 'accepted', 'paid'].includes(quote.status)) return { ok: false, code: 'not_sendable' }
  const versionId = quote.accepted_version_id ?? quote.current_version_id
  if (!versionId) return { ok: false, code: 'not_found' }

  const { data: lineData, error: lineError } = await supabase
    .from('quote_version_lines')
    .select('*')
    .eq('version_id', versionId)
    .order('position', { ascending: true })
  if (lineError) throw new Error('quote details read failed')
  const lines = (lineData ?? []) as QuoteLineRow[]
  const byPosition = new Map(lines.map((l) => [Number(l.position), l]))
  if (payload.lines.some((p) => !byPosition.has(p.position))) return { ok: false, code: 'unknown_line' }

  let complete = false
  for (const p of payload.lines) {
    const line = byPosition.get(p.position) as QuoteLineRow
    const patch: Row = {}
    if (p.pickup_date) patch.pickup_date = p.pickup_date
    if (p.pickup_time) patch.pickup_time = p.pickup_time
    if (p.origin) Object.assign(patch, { origin_address: p.origin.address, origin_lat: p.origin.lat, origin_lng: p.origin.lng })
    if (p.destination) {
      Object.assign(patch, { destination_address: p.destination.address, destination_lat: p.destination.lat, destination_lng: p.destination.lng })
    }
    if (p.hours) patch.hours = p.hours
    if (p.return_date) patch.return_date = p.return_date
    if (p.title && line.trip_type === 'tour') patch.title = p.title.trim()
    if (p.flight_number) patch.flight_number = p.flight_number.trim()
    if (p.terminal) patch.terminal = p.terminal.trim()

    // A transfer that now has both addresses gets its server distance (a failed route leaves it empty, never guessed).
    const origin = line.origin_address ? { lat: line.origin_lat, lng: line.origin_lng } : p.origin ?? null
    const destination = line.destination_address ? { lat: line.destination_lat, lng: line.destination_lng } : p.destination ?? null
    if (line.trip_type === 'transfer' && line.distance_km == null && origin?.lat != null && destination?.lat != null) {
      try {
        const route = await computeRouteDistance({
          origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
          destination: { lat: Number(destination.lat), lng: Number(destination.lng) },
          intermediates: [],
        })
        if (route.ok) patch.distance_km = route.distanceKm
      } catch {
        console.warn('[quotes/details] route distance failed', { quoteId })
      }
    }
    if (Object.keys(patch).length === 0) continue

    const { data, error } = await supabase.rpc('quote_fill_line_details', { p_line_id: line.id, p_patch: patch, p_actor_id: actor.id })
    const result = data as { filled?: unknown; complete?: unknown; reason?: unknown } | null
    if (error || !result) {
      console.error('[quotes/details] fill failed', { quoteId, code: error?.code ?? null })
      throw new Error('quote details fill failed')
    }
    if (result.filled !== true) {
      const reason = result.reason === 'not_current' ? 'not_current' : 'closed'
      return { ok: false, code: reason }
    }
    complete = result.complete === true
  }

  // The answer reads the lines again: a payload with nothing to write still reports whether the quote is complete.
  if (!complete) {
    const { data: again } = await supabase.from('quote_version_lines').select('*').eq('version_id', versionId)
    complete = ((again ?? []) as QuoteLineRow[]).every((l) => isComplete(l))
  }

  let bookings: PendingBookingsOutcome | null = null
  if (complete && quote.status === 'paid' && quote.bookings_pending) {
    bookings = await createQuoteBookingsWhenComplete(quoteId, { type: 'admin', id: actor.id })
  }
  return { ok: true, complete, bookings }
}

function isComplete(l: QuoteLineRow): boolean {
  if (!l.pickup_date || !l.pickup_time || !l.origin_address) return false
  if (l.trip_type === 'transfer' && !l.destination_address) return false
  if (l.trip_type === 'hourly' && l.hours == null) return false
  if (l.trip_type === 'daily' && !l.return_date) return false
  if (l.trip_type === 'tour' && (!l.title || l.hours == null)) return false
  return true
}
