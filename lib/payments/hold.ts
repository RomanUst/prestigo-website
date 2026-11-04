// Scheduled off-session hold, its failure handling and the release primitives (Phase 88, plan 88-11;
// HOLD-02, D-02, D-04, D-13, Research Pitfall 2).
//
// The payment tick (lib/payments/tick.ts) claims due bookings; this module places the full-amount hold for
// one claimed booking and moves it authorized / back to card_saved / failed. Nothing here decides whether a
// client "may" use the card flow: a booking that already holds a card is processed whatever the owner's
// client-facing switch says now (D-09a), and partner bookings are never touched (D-02).
//
// Money safety:
//   - the hold is for the booking's CURRENT payment_amount_minor in its payment_currency, never more;
//   - the Stripe call carries the idempotency key hold:<bookingId>:<hold_attempts>. A transient error returns
//     the row to card_saved with the SAME attempt number, so the next tick replays the same key and can not
//     create a second PaymentIntent; a definitive failure advances hold_attempts inside the same transition
//     that records it, so the following attempt gets a fresh key;
//   - every state change goes through applyTransition (single writer), the ledger event keys make a replay a no-op.

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { pickupInstantMs } from '@/lib/prague-date'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import {
  applyTransition,
  type LedgerActor,
  type PaymentPatch,
  type PaymentState,
} from '@/lib/payments/state'
import {
  cardMetadata,
  classifyStripeError,
  getPaymentsStripe,
  stripeErrorCode,
  stripeKeys,
} from '@/lib/payments/stripe'
import { handlePaymentFailure } from '@/lib/payments/recovery'
import { retryAt } from '@/lib/payments/timing'
import { deactivateBookingPaymentLink } from '@/lib/stripe-payment-links'

type BookingRow = Record<string, unknown>

export type HoldOutcome = 'authorized' | 'transient' | 'failed' | 'skipped'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const attemptsOf = (b: BookingRow): number =>
  typeof b.hold_attempts === 'number' && Number.isInteger(b.hold_attempts) && b.hold_attempts >= 0 ? b.hold_attempts : 0

function pickupOf(b: BookingRow): number | null {
  return pickupInstantMs({
    pickup_utc: typeof b.pickup_utc === 'string' ? b.pickup_utc : null,
    pickup_date: str(b.pickup_date),
    pickup_time: str(b.pickup_time),
  })
}

/** Stripe expandable field -> id string (or null). */
function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

/** The latest charge's card capture_before (seconds) as an ISO instant, expanding the PaymentIntent when needed. */
export async function captureBeforeIso(pi: Stripe.PaymentIntent): Promise<string | null> {
  const fromCharge = (charge: unknown): string | null => {
    const seconds = (charge as { payment_method_details?: { card?: { capture_before?: unknown } } } | null)
      ?.payment_method_details?.card?.capture_before
    return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null
  }
  if (pi.latest_charge && typeof pi.latest_charge === 'object') {
    const direct = fromCharge(pi.latest_charge)
    if (direct) return direct
  }
  try {
    const full = await getPaymentsStripe().paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] })
    return fromCharge(full.latest_charge)
  } catch {
    // capture_before is informational (the tick replaces a hold before it lapses); never block the hold on it.
    console.error('[hold] capture_before lookup failed', { stripeObjectId: pi.id })
    return null
  }
}

/**
 * The patch of a definitive hold failure (decline, authentication needed, invalid request): the attempt
 * counter advances so the next attempt gets a fresh idempotency key, the Stripe code (never a message) is kept,
 * and the retry instant is 12 h later clamped to 2 h before pickup (null when there is no useful retry).
 * Shared with the payment_failed webhook backup so both paths write the same thing.
 */
export function holdFailurePatch(booking: BookingRow, code: string, nowMs: number): PaymentPatch {
  const pickupMs = pickupOf(booking)
  // D-13: exactly one automatic retry. Once it has been claimed (payment_retry_count >= 1) no further retry is scheduled.
  const retriesUsed = typeof booking.payment_retry_count === 'number' ? booking.payment_retry_count : 0
  const retry = pickupMs === null || retriesUsed >= 1 ? null : retryAt(nowMs, pickupMs)
  return {
    hold_attempts: attemptsOf(booking) + 1,
    last_payment_error: code.slice(0, 60),
    payment_failed_at: new Date(nowMs).toISOString(),
    payment_retry_at: retry === null ? null : new Date(retry).toISOString(),
    payment_lease_until: null,
  }
}

/**
 * Admin "place hold now" claim: card_saved | expired | failed -> placing_hold with a lease. A row that is
 * already being placed (live lease) or in any other state is not applied. The tick claims through claimDueHolds.
 */
export async function claimForHold(
  bookingId: string,
  actor: LedgerActor,
  /** Extra columns written in the same transition (the automatic retry marks payment_retry_count here, D-13). */
  extraPatch: PaymentPatch = {},
): Promise<{ applied: boolean; booking?: BookingRow }> {
  const nowMs = Date.now()
  const moved = await applyTransition({
    bookingId,
    from: ['card_saved', 'expired', 'failed'],
    to: 'placing_hold',
    patch: { ...extraPatch, payment_lease_until: new Date(nowMs + LEASE_SECONDS * 1000).toISOString() },
    event: { key: `hold_started:${actor.type}:${nowMs}`, kind: 'hold_started', actor },
  })
  return moved.applied ? { applied: true, booking: moved.booking } : { applied: false }
}

/** placing_hold -> failed with the shared patch and one hold_failed ledger row (key unique per PaymentIntent and attempt). */
async function recordDefinitiveFailure(
  booking: BookingRow,
  info: { code: string; paymentIntentId: string | null },
  actor: LedgerActor,
  nowMs: number,
): Promise<{ outcome: 'failed'; code: string }> {
  const moved = await applyTransition({
    bookingId: str(booking.id),
    from: ['placing_hold'],
    to: 'failed',
    patch: holdFailurePatch(booking, info.code, nowMs),
    event: {
      key: `hold_failed:${info.paymentIntentId ?? 'none'}:${attemptsOf(booking)}`,
      kind: 'hold_failed',
      stripeObjectId: info.paymentIntentId ?? undefined,
      errorCode: info.code.slice(0, 60),
      actor,
    },
  })
  // HOLD-05, D-13, D-14: recovery link + localized email + operator alert, once per attempt. Only the writer that
  // actually moved the row does this (the webhook backup runs the same step on its own win); a recovery problem
  // never throws out of the tick.
  if (moved.applied) {
    try {
      await handlePaymentFailure(
        { ...booking, ...(moved.booking ?? {}) },
        {
          phase: 'hold',
          code: info.code,
          amountMinor: typeof booking.payment_amount_minor === 'number' ? booking.payment_amount_minor : 0,
          attempt: attemptsOf(booking) + 1,
        },
      )
    } catch {
      console.error('[hold] failure recovery step failed', { bookingId: str(booking.id) })
    }
  }
  return { outcome: 'failed', code: info.code }
}

/** Cancel a PaymentIntent by id; an already-canceled one counts as success. Any other error is rethrown. */
async function cancelPaymentIntent(piId: string, idempotencyKey: string): Promise<void> {
  const stripe = getPaymentsStripe()
  try {
    await stripe.paymentIntents.cancel(piId, { cancellation_reason: 'requested_by_customer' }, { idempotencyKey })
  } catch (err) {
    try {
      const current = await stripe.paymentIntents.retrieve(piId)
      if (current.status === 'canceled') return
    } catch {
      // fall through to the original error
    }
    throw err
  }
}

/** Cancel the booking's current hold PaymentIntent (key rel:<bookingId>:<hold_attempts>). */
export async function cancelHoldIntent(booking: BookingRow): Promise<void> {
  const piId = str(booking.hold_payment_intent_id)
  if (!piId) return
  await cancelPaymentIntent(piId, stripeKeys.release(str(booking.id), attemptsOf(booking)))
}

/**
 * Place the full-amount off-session hold for a booking that is in placing_hold (claimed by the tick or by
 * claimForHold). Never throws for a Stripe problem: the outcome says what happened.
 */
export async function placeHold(
  booking: BookingRow,
  actor: LedgerActor,
  now: Date = new Date(),
): Promise<{ outcome: HoldOutcome; code?: string }> {
  const bookingId = str(booking.id)

  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn('[hold] partner booking skipped', { bookingId })
      return { outcome: 'skipped', code: 'partner_booking' }
    }
    throw err
  }
  if (booking.payment_mode !== 'card_hold') return { outcome: 'skipped', code: 'not_card_hold' }
  if (booking.payment_state !== 'placing_hold') return { outcome: 'skipped', code: 'not_claimed' }

  const attempts = attemptsOf(booking)
  const nowMs = now.getTime()

  // The pickup must be known and still ahead: a hold for a trip that is over or undatable is never placed.
  const pickupMs = pickupOf(booking)
  if (pickupMs === null || pickupMs <= nowMs) {
    const reason = pickupMs === null ? 'pickup_unknown' : 'pickup_passed'
    await applyTransition({
      bookingId,
      from: ['placing_hold'],
      to: 'card_saved',
      patch: { payment_lease_until: null },
      event: { key: `hold_failed:${reason}:${attempts}`, kind: 'hold_failed', errorCode: reason, actor },
    })
    return { outcome: 'skipped', code: reason }
  }

  const amount = booking.payment_amount_minor
  const currency = booking.payment_currency === 'czk' ? 'czk' : booking.payment_currency === 'eur' ? 'eur' : null
  const customer = str(booking.stripe_customer_id)
  const paymentMethod = str(booking.stripe_payment_method_id)
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || !currency || !customer || !paymentMethod) {
    return recordDefinitiveFailure(booking, { code: 'missing_payment_details', paymentIntentId: null }, actor, nowMs)
  }

  let pi: Stripe.PaymentIntent
  try {
    pi = await getPaymentsStripe().paymentIntents.create(
      {
        amount,
        currency,
        customer,
        payment_method: paymentMethod,
        payment_method_types: ['card'],
        capture_method: 'manual',
        off_session: true,
        confirm: true,
        metadata: cardMetadata('card_hold', {
          bookingId,
          attempt: attempts,
          bookingReference: str(booking.booking_reference),
        }),
        expand: ['latest_charge'],
      },
      { idempotencyKey: stripeKeys.hold(bookingId, attempts) },
    )
  } catch (err) {
    const kind = classifyStripeError(err)
    if (kind === 'transient') {
      // Same attempt number: the next tick replays the same idempotency key.
      await applyTransition({
        bookingId,
        from: ['placing_hold'],
        to: 'card_saved',
        patch: { payment_lease_until: null },
        event: { key: `hold_failed:transient:${attempts}:${nowMs}`, kind: 'hold_failed', errorCode: 'transient', actor },
      })
      return { outcome: 'transient', code: 'transient' }
    }
    const failedIntent = (err as { payment_intent?: unknown } | null)?.payment_intent
    const code = kind === 'auth_required' ? 'authentication_required' : stripeErrorCode(err)
    return recordDefinitiveFailure(booking, { code, paymentIntentId: idOf(failedIntent) }, actor, nowMs)
  }

  if (pi.status !== 'requires_capture') {
    // An off-session confirm that did not end in an authorization (for example it still wants the card holder).
    const code = pi.status === 'requires_action' ? 'authentication_required' : 'unexpected_status'
    return recordDefinitiveFailure(booking, { code, paymentIntentId: pi.id }, actor, nowMs)
  }

  const amountMinor = pi.amount_capturable || pi.amount
  const captureBefore = await captureBeforeIso(pi)
  const moved = await applyTransition({
    bookingId,
    from: ['placing_hold'],
    to: 'authorized',
    patch: {
      hold_payment_intent_id: pi.id,
      hold_amount_minor: amountMinor,
      hold_placed_at: now.toISOString(),
      capture_before: captureBefore,
      payment_lease_until: null,
    },
    event: {
      key: `hold_authorized:${pi.id}`,
      kind: 'hold_authorized',
      stripeObjectId: pi.id,
      amountMinor,
      currency,
      actor,
    },
  })

  if (!moved.applied && moved.duplicate !== true) {
    // The booking left placing_hold meanwhile (released, cancelled): the authorization has no owner. Void it.
    try {
      await cancelPaymentIntent(pi.id, stripeKeys.voidHoldNow(pi.id))
    } catch {
      console.error('[hold] orphan authorization not voided', { bookingId, stripeObjectId: pi.id })
    }
    return { outcome: 'skipped', code: 'state_moved' }
  }

  try {
    await sendPaymentEmail({
      kind: 'hold_placed',
      variant: 'scheduled',
      booking: { ...booking, ...(moved.booking ?? {}) },
      eventKey: `email:hold_placed_scheduled:${bookingId}:${attempts}`,
    })
  } catch {
    // The hold is placed; a mail problem never undoes it (the send keeps its own ledger claim).
    console.error('[hold] hold_placed email failed', { bookingId })
  }
  return { outcome: 'authorized' }
}

/**
 * Release a booking's hold/card without taking money (admin, cancellation, waiver):
 *   authorized                       -> cancel the PaymentIntent (requested by us), released
 *   card_saved/failed/expired/checkout_pending -> released, no Stripe call
 *   balance_due + reason 'waive'     -> released with a waived ledger row
 *   placing_hold / capturing         -> 'busy' (a worker holds the lease)
 *   anything else                    -> 'noop' (captured and released are terminal; partner bookings have no money flow)
 */
export async function releaseHold(
  booking: BookingRow,
  opts: { actor: LedgerActor; reason: 'operator' | 'cancel' | 'waive' },
): Promise<'released' | 'busy' | 'noop'> {
  const bookingId = str(booking.id)
  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) return 'noop'
    throw err
  }

  // Only a card_hold booking has a hold or a saved card to release (a pay-now booking never leaves 'none').
  if (booking.payment_mode !== 'card_hold') return 'noop'

  const state = booking.payment_state as PaymentState
  if (state === 'placing_hold' || state === 'capturing') return 'busy'

  let from: PaymentState[]
  let event: Parameters<typeof applyTransition>[0]['event']

  if (state === 'authorized') {
    await cancelHoldIntent(booking)
    const piId = str(booking.hold_payment_intent_id)
    from = ['authorized']
    event = { key: `hold_released:${piId}`, kind: 'hold_released', stripeObjectId: piId || undefined, actor: opts.actor }
  } else if (state === 'card_saved' || state === 'failed' || state === 'expired' || state === 'checkout_pending') {
    from = [state]
    event = { key: `hold_released:${state}:${bookingId}`, kind: 'hold_released', actor: opts.actor }
  } else if (state === 'balance_due' && opts.reason === 'waive') {
    from = ['balance_due']
    event = { key: `waived:${bookingId}`, kind: 'waived', actor: opts.actor }
  } else {
    return 'noop'
  }

  const moved = await applyTransition({
    bookingId,
    from,
    to: 'released',
    patch: { payment_lease_until: null },
    event,
  })

  if (!moved.applied && moved.duplicate !== true) {
    return moved.currentState === 'placing_hold' || moved.currentState === 'capturing' ? 'busy' : 'noop'
  }

  const linkId = str(booking.recovery_link_id)
  if (linkId) {
    try {
      await deactivateBookingPaymentLink(linkId)
    } catch {
      console.error('[hold] recovery link not deactivated', { bookingId })
    }
  }
  return 'released'
}
