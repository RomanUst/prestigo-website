import { NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { logEmail } from '@/lib/email-log'
import { sendStatusConfirmedEmail, sendStatusCancelledEmail, sendPostTripEmail } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { deactivateBookingPaymentLink } from '@/lib/stripe-payment-links'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
import { pushGnetForTransition } from '@/lib/gnet-push'

/**
 * The one writer of bookings.status for admin-driven transitions
 * (Phase 87 D-01, PAYF-02). Server-only: imported by API routes, no auth of
 * its own — every caller authenticates before calling (admin session, driver
 * trip token, or a system job).
 *
 * Plan 87-01 is a behaviour-preserving extraction of the admin PATCH status
 * branch. The compare-and-set write (87-03) and the driver route (87-08)
 * build on this contract; keep the names.
 */

export type StatusActor =
  | { type: 'admin'; id: string | null }
  | { type: 'driver'; id: string }
  | { type: 'system'; id: string }

/**
 * Which side effects follow a successful write.
 *  - 'full':         admin PATCH — stale payment-link clear + deactivate, flag-gated
 *                    deduped status email, 2 h QStash reminder on confirmed, GNet push
 *  - 'cancel-route': the admin cancel route — no side effect at all (today's behaviour)
 *  - 'assign-route': the admin assign route — GNet push only
 */
export type StatusSideEffectProfile = 'full' | 'cancel-route' | 'assign-route'

export interface AdvanceBookingStatusInput {
  bookingId: string
  to: string
  actor: StatusActor
  /** 'admin_patch' | 'admin_cancel' | 'admin_assign' | 'driver_trip' | 'admin_no_show' */
  source: string
  profile: StatusSideEffectProfile
  /**
   * A row the caller already read. When present the service skips its own
   * select (keeps the cancel / assign call order identical to today).
   */
  current?: Record<string, unknown>
  patch?: {
    operator_notes?: string
    driver_price_czk?: number | null
    driver_id?: string
  }
}

export type AdvanceBookingStatusResult =
  | {
      ok: true
      applied: true
      previous: string
      current: string
      booking: Record<string, unknown>
    }
  | {
      ok: false
      // 'conflict' is declared now and first produced by plan 87-03 (compare-and-set)
      code: 'not_found' | 'invalid_transition' | 'conflict' | 'db_error'
      message: string
      currentStatus?: string
    }

type StatusEmailInput = Parameters<typeof sendStatusConfirmedEmail>[0]

export async function advanceBookingStatus(
  input: AdvanceBookingStatusInput,
): Promise<AdvanceBookingStatusResult> {
  const { bookingId, to, profile, patch } = input
  const supabase = createSupabaseServiceClient()

  let current = input.current
  if (!current) {
    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (fetchError || !data) {
      return { ok: false, code: 'not_found', message: 'Booking not found' }
    }
    current = data as Record<string, unknown>
  }

  const previousStatus = current.status as string
  const allowed = VALID_TRANSITIONS[previousStatus] ?? []
  if (!allowed.includes(to)) {
    return {
      ok: false,
      code: 'invalid_transition',
      message: `Cannot transition from '${previousStatus}' to '${to}'`,
    }
  }

  // Build the update payload field-by-field (mass-assignment guard).
  const updatePayload: Record<string, unknown> = {}
  updatePayload.status = to
  if (profile === 'full') {
    if (patch?.operator_notes !== undefined) updatePayload.operator_notes = patch.operator_notes
    if (patch?.driver_price_czk !== undefined) updatePayload.driver_price_czk = patch.driver_price_czk
  }

  // CR-02: a manual transition to a terminal state (confirmed/cancelled) makes any
  // live payment link stale — the booking has left the payable state by a path other
  // than the link itself. Clear the link fields now and deactivate it in Stripe after
  // the row is updated, so a client can no longer pay a forgotten link.
  let staleLinkIdOnStatus: string | null = null
  if (
    profile === 'full' &&
    current.payment_link_id &&
    previousStatus !== to &&
    (to === 'confirmed' || to === 'cancelled')
  ) {
    staleLinkIdOnStatus = current.payment_link_id as string
    updatePayload.payment_link_url = null
    updatePayload.payment_link_id = null
  }

  const { error: dbError } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId)

  if (dbError) {
    return { ok: false, code: 'db_error', message: 'DB update failed' }
  }

  const booking = { ...current, ...updatePayload }
  const result: AdvanceBookingStatusResult = {
    ok: true,
    applied: true,
    previous: previousStatus,
    current: to,
    booking,
  }

  // Profiles 'cancel-route' and 'assign-route' are wired in Tasks 2-3 of plan
  // 87-01; until then they run no side effects.
  if (profile !== 'full') return result

  // ── profile 'full' ──

  // CR-02: deactivate the now-cleared Stripe link (fire-and-forget; failure never
  // blocks the transition — the webhook's stale-capture alert remains the backstop).
  if (staleLinkIdOnStatus) {
    const staleId = staleLinkIdOnStatus
    after(() => deactivateBookingPaymentLink(staleId).catch(err =>
      console.error('[admin/bookings.PATCH] payment-link deactivate (status):', err)
    ))
  }

  // D-11: Only fire email when status actually changed
  if (previousStatus !== to) {
    // D-12: Check notification_flags from pricing_globals
    const { data: flagsRow } = await supabase
      .from('pricing_globals')
      .select('notification_flags')
      .eq('id', 1)
      .single()

    const flags = flagsRow?.notification_flags as Record<string, boolean> | null

    const statusToFlagKey: Record<string, string> = {
      confirmed: 'confirmed',
      cancelled: 'cancelled',
      completed: 'completed',
    }
    const flagKey = statusToFlagKey[to]

    // If flags is null, treat as all-enabled (per D-12)
    const isEnabled = !flags || flags[flagKey] !== false

    if (flagKey && isEnabled) {
      // D-15: logEmail BEFORE Resend — dedup gate
      const shouldSend = await logEmail({
        bookingId: current.id as string,
        emailType: `booking_${to}`,
        recipient: current.client_email as string,
      })

      if (shouldSend) {
        const emailBooking = current as unknown as StatusEmailInput
        // Use after() so Vercel serverless runtime keeps the promise alive
        // past the response return — void fn() was being killed on response.
        if (to === 'confirmed') {
          after(() => sendStatusConfirmedEmail(emailBooking).catch(err =>
            console.error('[booking-notify] confirmed:', err)
          ))
        } else if (to === 'cancelled') {
          after(() => sendStatusCancelledEmail(emailBooking).catch(err =>
            console.error('[booking-notify] cancelled:', err)
          ))
        } else if (to === 'completed') {
          after(() => sendPostTripEmail(emailBooking).catch(err =>
            console.error('[booking-notify] post-trip:', err)
          ))
        }
      }
    }
  }

  // Phase 41 D-01: Schedule 2h QStash reminder on transition to confirmed
  if (previousStatus !== to && to === 'confirmed') {
    if (current.pickup_utc) {
      const bookingIdForReminder = current.id as string
      const pickupMs = new Date(current.pickup_utc as string).getTime()
      after(() => scheduleQStashReminder(bookingIdForReminder, pickupMs))
    }
  }

  // Phase 50 — GNet status push (STATUS-01..04). Fire-and-forget per D-04;
  // guarded by booking_source per D-03; mapping per D-01 (inside the helper).
  if (current.booking_source === 'gnet' && previousStatus !== to) {
    after(() =>
      pushGnetForTransition({
        bookingId: current.id as string,
        bookingSource: current.booking_source as string | null,
        status: to,
        amountEur: current.amount_eur,
        logTag: '[gnet-status-push]',
      }),
    )
  }

  return result
}

/**
 * Maps a failed result to the admin HTTP response; null when the result is ok.
 */
export function advanceResultToResponse(
  result: AdvanceBookingStatusResult,
): NextResponse | null {
  if (result.ok) return null
  switch (result.code) {
    case 'not_found':
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    case 'invalid_transition':
      return NextResponse.json({ error: result.message }, { status: 422 })
    case 'conflict':
      return NextResponse.json(
        { error: 'status_conflict', currentStatus: result.currentStatus },
        { status: 409 },
      )
    case 'db_error':
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }
}
