// Phase 94 plan 94-03 (D-08, D-10, D-15, D-17; DCAB-05, DCAB-07, DCAB-08): the one accept / decline code path.
//
// Two callers answer an offer: the emailed bearer link (POST /api/driver/respond, caller kind 'token') and the signed-in
// cabinet (POST /api/driver/cabinet/offers/[assignmentId]/respond, caller kind 'session'). Both run through
// respondToOffer and return the same runEffects closure: the accepted-trip email or the decline notice to the operator.
//
// Token caller: byte-for-byte the pre-94 behaviour (uniform invalid_token for unknown / used / expired, 'used' on a lost
// race). Session caller: the offer stays answerable until the operator reassigns or cancels it, so token_expires_at is
// never read (D-10); token_used_at is still set so the emailed link reads 'used' afterwards (D-17).

import { sendDriverDeclineNotification } from '@/lib/email'
import { sendDriverAcceptedTripEmail } from '@/lib/driver-accept-email'
import { newestAssignmentByBooking } from '@/lib/driver-cabinet/assignments'
import { TERMINAL_BOOKING_STATUSES, type BookingStatus } from '@/lib/booking-status'

export type OfferAction = 'accepted' | 'declined'

export type OfferCaller =
  | { kind: 'token'; token: string }
  | { kind: 'session'; driverId: string; assignmentId: string }

export type OfferResult =
  | { ok: true; assignmentId: string; action: OfferAction; runEffects: () => Promise<void> }
  | { ok: false; error: 'invalid_token' | 'used' | 'not_available' }

// Minimal structural type of the service client: the tests pass an in-memory stand-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

/** The car is on its way, at the pickup or carrying the client: the offer can no longer be answered. */
const STARTED_STATUSES: ReadonlySet<string> = new Set(['en_route', 'on_location', 'on_board'])

interface AssignmentRef {
  id: string
  booking_id: string
  driver_id: string
}

/**
 * The effects of an answered offer. Never throws: a failing lookup or sender is logged with the existing tags and
 * never changes the answer (D-21).
 */
function buildEffects(supabase: ServiceClient, assignment: AssignmentRef, action: OfferAction): () => Promise<void> {
  return async () => {
    if (action === 'declined') {
      try {
        const { data: driver } = await supabase.from('drivers').select('name').eq('id', assignment.driver_id).single()

        const { data: booking } = await supabase
          .from('bookings')
          .select('booking_reference, pickup_date, pickup_time, origin_address, destination_address')
          .eq('id', assignment.booking_id)
          .single()

        if (driver && booking) {
          await sendDriverDeclineNotification({
            bookingReference: booking.booking_reference,
            pickupDate: booking.pickup_date,
            pickupTime: booking.pickup_time,
            originAddress: booking.origin_address,
            destinationAddress: booking.destination_address,
            driverName: driver.name,
          })
        }
      } catch (err) {
        console.error('[driver-decline]:', err)
      }
      return
    }

    // Accepted: email the driver the order details and the trip link (87-UAT gap 1).
    try {
      await sendDriverAcceptedTripEmail(assignment.id)
    } catch (err) {
      console.error('[driver-accept]:', err)
    }
  }
}

async function respondByToken(
  supabase: ServiceClient,
  action: OfferAction,
  token: string,
): Promise<OfferResult> {
  // Look up assignment by token
  const { data: assignment, error: lookupError } = await supabase
    .from('driver_assignments')
    .select('id, booking_id, driver_id, status, token_used_at, token_expires_at')
    .eq('token', token)
    .single()

  if (lookupError || !assignment) {
    return { ok: false, error: 'invalid_token' }
  }

  // Check if already used or expired — use uniform error to prevent oracle enumeration
  if (assignment.token_used_at || new Date(assignment.token_expires_at) < new Date()) {
    return { ok: false, error: 'invalid_token' }
  }

  // Atomically update: set status + token_used_at
  // Use gt(token_expires_at, now) + is(token_used_at, null) as double guard
  const { data: updated, error: updateError } = await supabase
    .from('driver_assignments')
    .update({ status: action, token_used_at: new Date().toISOString() })
    .eq('id', assignment.id)
    .gt('token_expires_at', new Date().toISOString())
    .is('token_used_at', null)
    .select('id, status, token_used_at')
    .single()

  if (updateError || !updated) {
    // Race condition — token was used or expired between check and update
    return { ok: false, error: 'used' }
  }

  return {
    ok: true,
    assignmentId: assignment.id,
    action,
    runEffects: buildEffects(supabase, assignment as AssignmentRef, action),
  }
}

async function respondBySession(
  supabase: ServiceClient,
  action: OfferAction,
  driverId: string,
  assignmentId: string,
): Promise<OfferResult> {
  const notAvailable: OfferResult = { ok: false, error: 'not_available' }

  // D-10: token_expires_at is deliberately neither selected nor compared on this path.
  const { data: row, error: lookupError } = await supabase
    .from('driver_assignments')
    .select('id, driver_id, booking_id, status, bookings!inner(id, status)')
    .eq('id', assignmentId)
    .eq('driver_id', driverId)
    .maybeSingle()

  if (lookupError || !row) return notAvailable
  if (row.status !== 'pending') return notAvailable

  const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
  const bookingStatus = booking?.status as string | undefined
  if (!bookingStatus) return notAvailable
  if (TERMINAL_BOOKING_STATUSES.has(bookingStatus as BookingStatus)) return notAvailable
  if (STARTED_STATUSES.has(bookingStatus)) return notAvailable

  // Only the newest assignment of a booking is the driver's live offer.
  const newest = await newestAssignmentByBooking(supabase, [row.booking_id])
  if (newest.get(row.booking_id) !== row.id) return notAvailable

  // Compare-and-set: a concurrent answer (the other tab, the emailed link) leaves no row to update.
  const { data: updated, error: updateError } = await supabase
    .from('driver_assignments')
    .update({ status: action, token_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('driver_id', driverId)
    .eq('status', 'pending')
    .select('id, status, token_used_at')
    .single()

  if (updateError || !updated) return notAvailable

  return {
    ok: true,
    assignmentId: row.id,
    action,
    runEffects: buildEffects(
      supabase,
      { id: row.id, booking_id: row.booking_id, driver_id: row.driver_id },
      action,
    ),
  }
}

export async function respondToOffer(
  supabase: ServiceClient,
  input: { action: OfferAction; caller: OfferCaller },
): Promise<OfferResult> {
  const { action, caller } = input
  if (caller.kind === 'token') return respondByToken(supabase, action, caller.token)
  return respondBySession(supabase, action, caller.driverId, caller.assignmentId)
}
