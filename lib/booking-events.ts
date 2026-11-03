/**
 * The single in-process booking completion hook (Phase 87 D-06, DRV-03).
 * Server-only: called from lib/booking-status-service.ts inside after().
 *
 * emitBookingCompleted() fires exactly once per booking: only when the
 * compare-and-set (advance_booking_status RPC) that moved the booking to
 * 'completed' was APPLIED, for any actor (admin PATCH or the driver). It is
 * never called on a conflict, a 4xx, a db error or another target status.
 * Today it only records and returns the fact; it moves no money and calls no
 * payment provider.
 *
 * Durable facts (the event itself is best effort, after() can die):
 *   - bookings.completed_at, set by the RPC only on the applying call
 *   - the unique 'completed' row in booking_status_log (migration 084)
 *
 * PARTNER MARKER (D-05): BookingCompletedEvent.partner is true for GNet
 * bookings (isPartnerBooking in lib/booking-status.ts). A partner booking has
 * no Prestigo money flow.
 *
 * HANDOFF TO PHASE 88 / 89 (obligations, nothing here enforces them yet):
 *   - EVERY Phase 88 money entry point (the pre-trip hold AND the capture that
 *     consumes this event) and EVERY Phase 89 entry point (the no-show charge)
 *     MUST call assertMoneyEligible(booking) from lib/booking-status.ts
 *     BEFORE acting. It throws PartnerBookingMoneyError for partner bookings.
 *   - Phase 88 MUST also sweep bookings with completed_at IS NOT NULL that
 *     were never captured, so a lost after() never loses a capture. A NULL
 *     completed_at on a historic completed row means unknown, not not-completed.
 *   - Phase 88 extends this module (a consumer called from emitBookingCompleted);
 *     it does not add a second completion hook.
 */

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
 * Logs one line with ids only (no client name, email, phone or amount) and
 * returns the event unchanged.
 */
export function emitBookingCompleted(event: BookingCompletedEvent): BookingCompletedEvent {
  console.log(
    `[booking-events] completed bookingId=${event.bookingId} partner=${event.partner} actorType=${event.actorType} source=${event.source}`,
  )
  return event
}
