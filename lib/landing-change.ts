// Phase 91 plan 15 (STOP-05, D-08, D-11): the operator moves the landing and the pickup of an airport booking when the
// flight is late. One function owns the move: applyLandingChange.
//
// D-11: nothing moves by itself. This function is imported only by POST /api/admin/bookings/[id]/landing, which a
// person reaches through the "Move pickup" button of the booking panel. The flight-refresh routes and the cron never
// call it (tests/admin-landing-route.test.ts proves it by reading the import graph).
//
// The move is a normal trip-time edit, copied from the admin PATCH (app/api/admin/bookings/route.ts, trip-edit branch):
//   gates -> update with a compare-and-set -> reevaluateAfterEdit (hold date and amount stay consistent)
//   -> notification AND-gate (the "Notify client" tick AND the booking_changed flag, logEmail as the dedup gate)
//   -> one booking_edit_audit_log row per changed field -> the change email after the response.
// The pickup is never trusted from the client: it is recomputed here as landing + the stored offset and compared with
// the pickup the dialog showed (409 pickup_changed). The generated instant column of the booking is never written; it
// follows the date and time columns by itself and the calendar trigger fires through it.

import { after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { pickupFromLanding } from '@/lib/airport-pickup'
import { assertEditablePrecheck, reevaluateAfterEdit } from '@/lib/payments/edit-hook'
import { logEmail } from '@/lib/email-log'
import { sendBookingChangedEmail, type BookingChangeEntry } from '@/lib/email'

export type LandingChangeResult =
  | {
      status: 200
      pickupDate: string
      pickupTime: string
      landingDate: string
      landingTime: string
      paymentEffect: unknown | null
    }
  | { status: 404; error: 'not_found' }
  | { status: 422; error: 'no_landing' | 'final_status' | 'invalid_landing' }
  | { status: 409; error: 'pickup_changed'; pickupDate: string; pickupTime: string }
  | { status: 409; error: 'stale' | 'payment_in_progress' }

export interface LandingChangeInput {
  bookingId: string
  landingDate: string
  landingTime: string
  expectedPickupDate: string
  expectedPickupTime: string
  notifyClient: boolean
  actor: { id: string | null }
}

type AuditRow = { field: string; old_value: string | null; new_value: string | null }

const FINAL_STATUSES: readonly string[] = ['completed', 'cancelled', 'no_show']

const clock = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 5) : '')

const FIELD_LABELS = {
  landing_date: 'Landing date',
  landing_time: 'Landing time',
  pickup_date: 'Pickup date',
  pickup_time: 'Pickup time',
} as const

/**
 * Move the landing of an airport booking and, with it, the pickup (landing + the stored offset).
 * Throws on a database failure (the route logs ids only and answers 500); every business outcome is a result.
 */
export async function applyLandingChange(input: LandingChangeInput): Promise<LandingChangeResult> {
  const supabase = createSupabaseServiceClient()

  const { data, error: readError } = await supabase.from('bookings').select('*').eq('id', input.bookingId).maybeSingle()
  if (readError) throw new Error('booking read failed')
  if (!data) return { status: 404, error: 'not_found' }
  const current = data as Record<string, unknown>

  const hasLanding =
    typeof current.landing_date === 'string' &&
    typeof current.landing_time === 'string' &&
    current.pickup_offset_min !== null &&
    current.pickup_offset_min !== undefined
  if (!hasLanding) return { status: 422, error: 'no_landing' }

  // Completed, cancelled and no-show bookings are final: a no-show can carry a fee case based on the pickup.
  if (typeof current.status === 'string' && FINAL_STATUSES.includes(current.status)) {
    return { status: 422, error: 'final_status' }
  }

  // A card or cash booking whose checkout, hold placement or capture is running is not editable (T-88-52).
  const inFlight = assertEditablePrecheck(current)
  if (inFlight) return { status: 409, error: 'payment_in_progress' }

  const derived = pickupFromLanding(input.landingDate, input.landingTime, Number(current.pickup_offset_min))
  if (derived === null) return { status: 422, error: 'invalid_landing' }

  if (derived.pickupDate !== input.expectedPickupDate || derived.pickupTime !== input.expectedPickupTime) {
    return { status: 409, error: 'pickup_changed', pickupDate: derived.pickupDate, pickupTime: derived.pickupTime }
  }

  const before = {
    landing_date: current.landing_date as string,
    landing_time: clock(current.landing_time),
    pickup_date: current.pickup_date as string,
    pickup_time: clock(current.pickup_time),
  }
  const moved = {
    landing_date: input.landingDate,
    landing_time: input.landingTime,
    pickup_date: derived.pickupDate,
    pickup_time: derived.pickupTime,
  }

  const changedFields = (Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).filter(
    (field) => before[field] !== moved[field],
  )
  const result: LandingChangeResult = {
    status: 200,
    landingDate: moved.landing_date,
    landingTime: moved.landing_time,
    pickupDate: moved.pickup_date,
    pickupTime: moved.pickup_time,
    paymentEffect: null,
  }
  // The landing is already what the operator asked for: nothing to write, audit, re-evaluate or send.
  if (changedFields.length === 0) return result

  // Compare-and-set on the landing and the pickup this move was computed from: a row changed meanwhile (another
  // operator, a trip edit) matches no row and answers 409 stale.
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({
      landing_date: moved.landing_date,
      landing_time: moved.landing_time,
      pickup_date: moved.pickup_date,
      pickup_time: moved.pickup_time,
    })
    .eq('id', input.bookingId)
    .eq('pickup_date', current.pickup_date as string)
    .eq('pickup_time', current.pickup_time as string)
    .eq('landing_date', current.landing_date as string)
    .eq('landing_time', current.landing_time as string)
    .select('id')
  if (updateError) throw new Error('booking update failed')
  if (!updated || updated.length === 0) return { status: 409, error: 'stale' }

  const pickupChanged = before.pickup_date !== moved.pickup_date || before.pickup_time !== moved.pickup_time
  const paymentEffect = await reevaluateAfterEdit({
    bookingId: input.bookingId,
    before: current,
    priceChanged: false,
    pickupChanged,
    actor: { type: 'admin', id: input.actor.id },
  })

  const entries: BookingChangeEntry[] = changedFields.map((field) => ({
    field,
    label: FIELD_LABELS[field],
    oldValue: before[field],
    newValue: moved[field],
  }))
  const auditRows: AuditRow[] = changedFields.map((field) => ({
    field,
    old_value: before[field],
    new_value: moved[field],
  }))
  const updatedBooking: Record<string, unknown> = { ...current, ...moved }

  // Notification AND-gate (D-08 of the trip edit): the operator's tick AND the global booking_changed flag; logEmail is
  // the dedup gate before Resend and runs before the audit rows so their `notified` column is the real outcome.
  let shouldSend = false
  if (input.notifyClient) {
    const { data: flagsRow } = await supabase.from('pricing_globals').select('notification_flags').eq('id', 1).single()
    const flags = (flagsRow as { notification_flags?: Record<string, boolean> | null } | null)?.notification_flags ?? null
    const flagEnabled = !flags || flags['booking_changed'] !== false
    if (flagEnabled) {
      shouldSend = await logEmail({
        bookingId: input.bookingId,
        emailType: 'booking_changed',
        recipient: updatedBooking.client_email as string,
      })
    }
  }

  const changedAt = new Date().toISOString()
  const { error: auditError } = await supabase.from('booking_edit_audit_log').insert(
    auditRows.map((row) => ({
      booking_id: input.bookingId,
      field: row.field,
      old_value: row.old_value,
      new_value: row.new_value,
      operator_id: input.actor.id,
      changed_at: changedAt,
      notified: shouldSend,
    })),
  )
  if (auditError) {
    console.error('[landing-change] audit log insert failed:', auditError.message)
  }

  if (shouldSend) {
    after(() =>
      sendBookingChangedEmail(updatedBooking as unknown as Parameters<typeof sendBookingChangedEmail>[0], entries).catch(
        (err) => console.error('[landing-change] change email failed:', err instanceof Error ? err.message : 'unknown'),
      ),
    )
  }

  return { ...result, paymentEffect }
}
