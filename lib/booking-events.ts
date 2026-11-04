/**
 * The single in-process booking completion hook (Phase 87 D-06, DRV-03).
 * Server-only: called from lib/booking-status-service.ts inside after().
 *
 * emitBookingCompleted() fires exactly once per booking: only when the
 * compare-and-set (advance_booking_status RPC) that moved the booking to
 * 'completed' was APPLIED, for any actor (admin PATCH or the driver). It is
 * never called on a conflict, a 4xx, a db error or another target status.
 * It records the fact and, for a Prestigo (non-partner) booking, awaits the one
 * money consumer, settleBooking (Phase 88 D-06: the capture of a card hold, or the
 * saved-card charge, happens on this event and on no other status write).
 *
 * Durable facts (the event itself is best effort, after() can die):
 *   - bookings.completed_at, set by the RPC only on the applying call
 *   - the unique 'completed' row in booking_status_log (migration 084)
 *
 * PARTNER MARKER (D-05): BookingCompletedEvent.partner is true for GNet
 * bookings (isPartnerBooking in lib/booking-status.ts). A partner booking has
 * no Prestigo money flow.
 *
 * HANDOFF (Phase 88 done here, Phase 89 still open):
 *   - EVERY money entry point (the pre-trip hold, the capture below, and the
 *     Phase 89 no-show charge) calls assertMoneyEligible(booking) from
 *     lib/booking-status.ts BEFORE acting. settleBooking does.
 *   - The durable backstop for a lost after() is tick step C
 *     (lib/payments/tick.ts): it settles card_hold bookings with
 *     completed_at IS NOT NULL that were never captured. A NULL completed_at on
 *     a historic completed row means unknown, not not-completed.
 *   - This module is the only completion hook; consumers are called from here.
 */

import { settleBooking } from '@/lib/payments/settle'

export interface BookingCompletedEvent {
  bookingId: string
  /** bookings.completed_at as returned by the RPC row (ISO string), null when unknown */
  completedAt: string | null
  /** true for a partner (GNet) booking, which carries no Prestigo money flow */
  partner: boolean
  actorType: 'admin' | 'driver' | 'system'
  /** the status-change source, e.g. 'admin_patch' | 'driver_trip' */
  source: string
}

/**
 * Logs one line with ids only (no client name, email, phone or amount), then
 * lets settleBooking collect the money of a card booking. Never throws into
 * after(): a settle problem is logged with the booking id only and the tick
 * sweep (step C) picks the booking up again. Pay-now bookings are skipped by
 * settleBooking itself (payment_mode check); partner bookings never reach it.
 * Resolves with the event unchanged.
 */
export async function emitBookingCompleted(event: BookingCompletedEvent): Promise<BookingCompletedEvent> {
  console.log(
    `[booking-events] completed bookingId=${event.bookingId} partner=${event.partner} actorType=${event.actorType} source=${event.source}`,
  )
  if (event.partner) return event
  try {
    await settleBooking(event.bookingId, { type: 'system', id: 'completion_event' })
  } catch {
    console.error('[booking-events] settle failed', { bookingId: event.bookingId })
  }
  return event
}
