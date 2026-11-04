// Webhook handlers for the scheduled hold lifecycle (Phase 88, plan 88-11; HOLD-02, PAYF-03).
//
// The synchronous answer of the payment tick (lib/payments/hold.ts) is the primary path; these handlers keep
// the booking truthful when Stripe reports the same facts out of band:
//   payment_intent.amount_capturable_updated (card_hold)  placing_hold -> authorized, when the synchronous
//                                                          response was lost (same ledger key as the tick)
//   payment_intent.canceled, reason expired | automatic   authorized -> expired (the authorization lapsed)
//   payment_intent.canceled, reason requested_by_customer our own release: one observation row, no state change
//   payment_intent.payment_failed (card_hold)             placing_hold -> failed (backup for the synchronous failure),
//                                                          then the recovery link / email / operator alert (88-14)
//
// Rules: the booking is found through metadata.cofBookingId; only legal from-states move; an event for a booking
// that is no longer in the expected state (captured, released, already authorized, ...) changes nothing, so a late
// or reordered event can never move a booking backwards. Nothing here asks whether the card flow is switched on
// for the client (D-09a): bookings that hold a card keep their lifecycle.

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { captureBeforeIso, holdFailurePatch } from '@/lib/payments/hold'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { handlePaymentFailure } from '@/lib/payments/recovery'
import { RECOVERY_LINK_CLEARED, retireRecoveryLink } from '@/lib/payments/recovery-link'
import { applyTransition, appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'

const WEBHOOK_ACTOR: LedgerActor = { type: 'webhook', id: null }

type BookingRow = Record<string, unknown> & { id: string }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const attemptsOf = (b: BookingRow): number =>
  typeof b.hold_attempts === 'number' && Number.isInteger(b.hold_attempts) && b.hold_attempts >= 0 ? b.hold_attempts : 0

/** The booking a card_hold PaymentIntent belongs to, or null (logged with ids only) when there is nothing to act on. */
async function resolveHoldBooking(label: string, pi: Stripe.PaymentIntent): Promise<BookingRow | null> {
  const kind = pi.metadata?.kind
  const bookingId = pi.metadata?.cofBookingId
  if (!bookingId) {
    console.warn(`[webhook] ${label} without cofBookingId`, { stripeObjectId: pi.id })
    return null
  }
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) throw new Error('hold booking lookup failed')
  const booking = (data as BookingRow | null) ?? null
  if (!booking) {
    console.warn(`[webhook] ${label} for an unknown booking`, { stripeObjectId: pi.id, bookingId, kind })
    return null
  }
  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn(`[webhook] ${label} for a partner booking ignored`, { stripeObjectId: pi.id, bookingId })
      return null
    }
    throw err
  }
  return booking
}

/** The event belongs to the booking's CURRENT attempt (a late event of an earlier attempt must not move it). */
function isCurrentAttempt(pi: Stripe.PaymentIntent, booking: BookingRow): boolean {
  return pi.metadata?.attempt === String(attemptsOf(booking))
}

/**
 * amount_capturable_updated on a card_hold PaymentIntent: the authorization exists at Stripe. A booking still in
 * placing_hold (the tick's response was lost) moves to authorized with the hold fields; the ledger key is the
 * tick's own, so exactly one of the two writes applies and the client email goes out once.
 */
export async function handleHoldAuthorized(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent
  if (pi.metadata?.kind !== 'card_hold') return
  if (typeof pi.status === 'string' && pi.status !== 'requires_capture') return

  const booking = await resolveHoldBooking('payment_intent.amount_capturable_updated', pi)
  if (!booking) return
  if (booking.payment_state !== 'placing_hold' || !isCurrentAttempt(pi, booking)) return

  const amountMinor = pi.amount_capturable || pi.amount
  const currency = pi.currency === 'czk' ? 'czk' : pi.currency === 'eur' ? 'eur' : undefined
  const captureBefore = await captureBeforeIso(pi)
  const moved = await applyTransition({
    bookingId: booking.id,
    from: ['placing_hold'],
    to: 'authorized',
    patch: {
      hold_payment_intent_id: pi.id,
      hold_amount_minor: amountMinor,
      hold_placed_at: new Date().toISOString(),
      capture_before: captureBefore,
      payment_lease_until: null,
      // 88-REVIEW T1: the hold secures the money; an earlier recovery link must not stay payable.
      ...RECOVERY_LINK_CLEARED,
    },
    event: {
      key: `hold_authorized:${pi.id}`,
      kind: 'hold_authorized',
      stripeObjectId: pi.id,
      amountMinor,
      currency,
      actor: WEBHOOK_ACTOR,
    },
  })
  if (!moved.applied && moved.duplicate !== true) return
  await retireRecoveryLink(booking)

  // Same ledger key as the tick's email: whichever of the two reaches it first sends, the other is a duplicate.
  try {
    await sendPaymentEmail({
      kind: 'hold_placed',
      variant: 'scheduled',
      booking: { ...booking, ...(moved.booking ?? {}) },
      eventKey: `email:hold_placed_scheduled:${booking.id}:${attemptsOf(booking)}`,
    })
  } catch {
    console.error('[webhook] hold_placed email failed', { bookingId: booking.id })
  }
}

/**
 * payment_intent.canceled on a booking's current hold:
 *   cancellation_reason 'expired' | 'automatic'  the authorization lapsed -> authorized becomes expired
 *   cancellation_reason 'requested_by_customer'  our own release (releaseHold owns the state): observation row only
 * A PaymentIntent that is not the booking's current hold (an earlier, replaced one) is ignored without a ledger row.
 */
export async function handleHoldCanceled(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent
  const booking = await resolveHoldBooking('payment_intent.canceled', pi)
  if (!booking) return
  if (str(booking.hold_payment_intent_id) !== pi.id) return

  const reason = pi.cancellation_reason
  if (reason === 'expired' || reason === 'automatic') {
    if (booking.payment_state !== 'authorized') return
    await applyTransition({
      bookingId: booking.id,
      from: ['authorized'],
      to: 'expired',
      patch: { payment_lease_until: null },
      event: { key: `hold_expired:${pi.id}`, kind: 'hold_expired', stripeObjectId: pi.id, actor: WEBHOOK_ACTOR },
    })
    return
  }

  if (reason === 'requested_by_customer') {
    await appendPaymentEvent(booking.id, {
      key: `hold_released_obs:${pi.id}`,
      kind: 'hold_released',
      stripeObjectId: pi.id,
      actor: WEBHOOK_ACTOR,
    })
  }
}

/**
 * payment_intent.payment_failed on a card_hold PaymentIntent: backup for the tick's synchronous failure. A booking
 * still in placing_hold fails with the very patch the synchronous path writes (same ledger key); a booking that
 * already failed, was authorized or moved on is left alone.
 */
export async function handleHoldFailed(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent
  if (pi.metadata?.kind !== 'card_hold') return

  const booking = await resolveHoldBooking('payment_intent.payment_failed', pi)
  if (!booking) return
  if (booking.payment_state !== 'placing_hold' || !isCurrentAttempt(pi, booking)) return

  const err = pi.last_payment_error
  const code = (err?.decline_code || err?.code || 'unknown').slice(0, 60)
  const moved = await applyTransition({
    bookingId: booking.id,
    from: ['placing_hold'],
    to: 'failed',
    patch: holdFailurePatch(booking, code, Date.now()),
    event: {
      key: `hold_failed:${pi.id}:${attemptsOf(booking)}`,
      kind: 'hold_failed',
      stripeObjectId: pi.id,
      errorCode: code,
      actor: WEBHOOK_ACTOR,
    },
  })

  // HOLD-05: whichever writer (the tick's synchronous answer or this webhook) moves the row runs the recovery step;
  // its ledger keys (attempt = hold_attempts after the failure) make a second call send nothing twice.
  if (moved.applied) {
    try {
      await handlePaymentFailure(
        { ...booking, ...(moved.booking ?? {}) },
        {
          phase: 'hold',
          code,
          amountMinor: typeof booking.payment_amount_minor === 'number' ? booking.payment_amount_minor : 0,
          attempt: attemptsOf(booking) + 1,
        },
      )
    } catch {
      console.error('[webhook] hold failure recovery step failed', { bookingId: booking.id })
    }
  }
}
