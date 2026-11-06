import { NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { logEmail } from '@/lib/email-log'
import { sendStatusConfirmedEmail, sendStatusCancelledEmail, sendPostTripEmail, type CancelMoneyOutcome } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { deactivateBookingPaymentLink } from '@/lib/stripe-payment-links'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
import { pushGnetForTransition } from '@/lib/gnet-push'
import { isPartnerBooking } from '@/lib/booking-status'
import { emitBookingCompleted } from '@/lib/booking-events'

/**
 * The one writer of bookings.status for admin-driven transitions
 * (Phase 87 D-01, PAYF-02). Server-only: imported by API routes, no auth of
 * its own — every caller authenticates before calling (admin session, driver
 * trip token, or a system job).
 *
 * Plan 87-01 extracted the admin PATCH status branch behaviour-preservingly;
 * plan 87-03 turned the write into a compare-and-set: bookings.status changes
 * only through the advance_booking_status RPC (migration 084) with
 * p_from = the status this service validated, so exactly one of two racing
 * writers is applied and the loser gets a 'conflict' result with the winner's
 * status and runs no side effect. The driver route (87-08) reuses this
 * unchanged; keep the names.
 */

export type StatusActor =
  | { type: 'admin'; id: string | null }
  | { type: 'driver'; id: string }
  | { type: 'system'; id: string }

/**
 * Which side effects follow a successful write.
 *  - 'full':         admin PATCH — stale payment-link clear + deactivate, flag-gated
 *                    deduped status email, 2 h QStash reminder on confirmed, GNet push
 *  - 'cancel-route': the admin cancel route — no side effect here; the route calls scheduleCancelRouteEmail
 *                    once the money step has succeeded, so the email can say what happened to the money
 *  - 'assign-route': the admin assign route — GNet push only
 *  - 'payment-engine': the card-on-file webhook / tick confirming a booking in place (Phase 88) —
 *                    no side effect at all; the payment engine sends its own ledger-keyed emails
 */
export type StatusSideEffectProfile = 'full' | 'cancel-route' | 'assign-route' | 'payment-engine'

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
  /**
   * The status the caller believes the booking has (the admin UI sends it as
   * expected_status). When present and different from the stored status the
   * service returns 'conflict' without calling the RPC.
   */
  expectedFrom?: string
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
      // 'conflict': the stored status is not the one this change was validated against
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

  // Stale-view guard (PAYF-02): the caller saw another status than the stored one.
  if (input.expectedFrom !== undefined && input.expectedFrom !== previousStatus) {
    return {
      ok: false,
      code: 'conflict',
      message: 'status_conflict',
      currentStatus: previousStatus,
    }
  }

  const allowed = VALID_TRANSITIONS[previousStatus] ?? []
  if (!allowed.includes(to)) {
    return {
      ok: false,
      code: 'invalid_transition',
      message: `Cannot transition from '${previousStatus}' to '${to}'`,
    }
  }

  // Build the RPC patch key-by-key (mass-assignment guard; the RPC re-checks the
  // same allowlist: operator_notes, driver_price_czk, driver_id, clear_payment_link).
  const rpcPatch: Record<string, unknown> = {}
  if (profile === 'assign-route' && patch?.driver_id !== undefined) rpcPatch.driver_id = patch.driver_id
  if (profile === 'full') {
    if (patch?.operator_notes !== undefined) rpcPatch.operator_notes = patch.operator_notes
    if (patch?.driver_price_czk !== undefined) rpcPatch.driver_price_czk = patch.driver_price_czk
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
    rpcPatch.clear_payment_link = true
  }

  // Compare-and-set: UPDATE ... WHERE id AND status = p_from inside one transaction;
  // the status-log trigger records the actor. Applied false = someone else moved the
  // booking first.
  const { data: rpcData, error: rpcError } = await supabase.rpc('advance_booking_status', {
    p_booking_id: bookingId,
    p_from: previousStatus,
    p_to: to,
    p_actor_type: input.actor.type,
    p_actor_id: input.actor.id ?? null,
    p_source: input.source,
    p_patch: rpcPatch,
  })

  const rpcResult = rpcData as
    | { applied?: boolean; current_status?: string | null; booking?: Record<string, unknown> | null }
    | null
    | undefined

  if (rpcError || !rpcResult || typeof rpcResult.applied !== 'boolean') {
    return { ok: false, code: 'db_error', message: 'DB update failed' }
  }

  if (!rpcResult.applied) {
    if (!rpcResult.current_status) {
      return { ok: false, code: 'not_found', message: 'Booking not found' }
    }
    return {
      ok: false,
      code: 'conflict',
      message: 'status_conflict',
      currentStatus: rpcResult.current_status,
    }
  }

  // The RPC row is authoritative (completed_at included); side effects below keep
  // using the pre-read row exactly as before.
  const booking = { ...current, ...(rpcResult.booking ?? {}) }
  const result: AdvanceBookingStatusResult = {
    ok: true,
    applied: true,
    previous: previousStatus,
    current: to,
    booking,
  }

  // D-06: exactly one completion event, only for the compare-and-set that applied the
  // move to 'completed', whoever the actor is (admin PATCH or driver). It records and
  // returns the fact; no money action here (Phase 88 consumes it, see booking-events.ts).
  if (to === 'completed') {
    const completedAt = (booking.completed_at as string | null | undefined) ?? null
    const partner = isPartnerBooking(booking as { booking_source?: string | null })
    after(() =>
      emitBookingCompleted({
        bookingId,
        completedAt,
        partner,
        actorType: input.actor.type,
        source: input.source,
      }),
    )
  }

  // 'cancel-route': no side effect at all (today's cancel route sends no email,
  // deactivates no link and pushes nothing to GNet). 'payment-engine' (Phase 88) is the same: the
  // card-flow webhook sends its own exactly-once emails, reminder and GA4 event.
  if (profile === 'cancel-route' || profile === 'payment-engine') return result

  // 'assign-route': the GNet push only. Scheduled last so the caller's next query
  // keeps its place in the call order.
  if (profile === 'assign-route') {
    if (current.booking_source === 'gnet' && previousStatus !== to) {
      after(() =>
        pushGnetForTransition({
          bookingId,
          bookingSource: current.booking_source as string | null,
          status: to,
          amountEur: current.amount_eur,
          logTag: '[assign:gnet-push]',
        }),
      )
    }
    return result
  }

  // ── profile 'full' ──

  // CR-02: deactivate the now-cleared Stripe link (fire-and-forget; failure never
  // blocks the transition — the webhook's stale-capture alert remains the backstop).
  if (staleLinkIdOnStatus) {
    const staleId = staleLinkIdOnStatus
    after(() => deactivateBookingPaymentLink(staleId).catch(err =>
      console.error('[admin/bookings.PATCH] payment-link deactivate (status):', err)
    ))
  }

  // D-11: Only fire email when status actually changed. Partner (GNet) passengers are the
  // partner's clients: their address is the partner's or a noreply@gnet.local placeholder, so
  // no confirmed / cancelled / post-trip email goes to them (WR-03).
  if (previousStatus !== to && !isPartnerBooking(current as { booking_source?: string | null })) {
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

/**
 * The client's cancelled email for the admin cancel route, after its refund or release succeeded. Same rules as the
 * 'full' profile: the notification flag, the dedup log and no email to partner passengers. An `unpaid` row is an
 * abandoned checkout the client never completed, so it gets none. Never throws into the route: the cancel stands.
 */
export function scheduleCancelRouteEmail(
  booking: Record<string, unknown>,
  previousStatus: string,
  money: CancelMoneyOutcome | null,
): void {
  const recipient = booking.client_email
  if (typeof recipient !== 'string' || !recipient) return
  if (previousStatus === 'unpaid' || isPartnerBooking(booking as { booking_source?: string | null })) return

  after(async () => {
    try {
      const { data: flagsRow } = await createSupabaseServiceClient()
        .from('pricing_globals')
        .select('notification_flags')
        .eq('id', 1)
        .single()
      const flags = flagsRow?.notification_flags as Record<string, boolean> | null
      if (flags && flags.cancelled === false) return

      const shouldSend = await logEmail({
        bookingId: booking.id as string,
        emailType: 'booking_cancelled',
        recipient,
      })
      if (shouldSend) await sendStatusCancelledEmail(booking as unknown as StatusEmailInput, money)
    } catch (err) {
      console.error('[booking-notify] cancelled:', err)
    }
  })
}
