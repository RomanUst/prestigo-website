// Webhook observation of card captures and off-session charges (Phase 88, plan 88-13; HOLD-04, PAYF-03).
//
// settleBooking (lib/payments/settle.ts) is the only writer of the capture / charge outcome: it records the
// state change and the ledger rows from the synchronous Stripe answer, and a settle whose response was lost is
// completed by the tick sweep replaying the same idempotency key. These handlers therefore only OBSERVE what
// Stripe reports out of band, as one append-only ledger row per PaymentIntent, with no state change and never
// through the legacy chain (a card object must not build a booking):
//   payment_intent.succeeded, kind card_hold | card_hold_now | card_charge | card_difference | card_fee
//                                      -> charge_succeeded:<pi>
//   payment_intent.payment_failed, kind card_charge | card_difference | card_fee (89-26)
//                                      -> charge_failed_obs:<pi> / difference_failed_obs:<pi> / fee_failed_obs:<pi>
// A card_extra event (91-08) writes NO generic observation row (Phase 91 review WR-03): one money event is one ledger meaning,
// and settle's cash logic reads charge_succeeded / charge_failed rows as "the trip charge". It only finalises its
// booking_extra_charges row (finalizeExtraFromWebhook, lib/payments/extra.ts), whose extra_charged / extra_failed rows (same
// keys as the synchronous path) are the only ledger rows of an extra; it never touches the booking's own payment.
// The observation keys differ from settle's own keys (captured:<pi>, charge_failed:<pi>:<n>, ...), so an
// observation can never roll a settle transition back as a duplicate, and a replayed event adds no second row.

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { finalizeExtraFromWebhook } from '@/lib/payments/extra'
import { announceLateCashCharge } from '@/lib/payments/fee'
import { adoptLateCashCharge, cashChargeFacts } from '@/lib/payments/settle'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
import { getPaymentsStripe, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'

const WEBHOOK_ACTOR: LedgerActor = { type: 'webhook', id: null }

const SUCCEEDED_KINDS: readonly string[] = [
  'card_hold',
  'card_hold_now',
  'card_charge',
  'card_difference',
  'card_fee',
  // card_extra is routed here too (so it is never unrouted) but handled apart: see handleCardChargeSucceeded.
  'card_extra',
]

/** The booking the PaymentIntent belongs to (metadata.cofBookingId), or null (logged with ids only) when there is nothing to record. */
async function resolveBookingId(label: string, pi: Stripe.PaymentIntent): Promise<string | null> {
  const bookingId = pi.metadata?.cofBookingId
  if (!bookingId) {
    console.warn(`[webhook] ${label} without cofBookingId`, { stripeObjectId: pi.id })
    return null
  }
  const { data, error } = await createSupabaseServiceClient()
    .from('bookings')
    .select('id, booking_source')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw new Error('charge booking lookup failed')
  const booking = (data as { id: string; booking_source?: string | null } | null) ?? null
  if (!booking) {
    console.warn(`[webhook] ${label} for an unknown booking`, { stripeObjectId: pi.id, bookingId })
    return null
  }
  try {
    assertMoneyEligible({ booking_source: booking.booking_source ?? null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn(`[webhook] ${label} for a partner booking ignored`, { stripeObjectId: pi.id, bookingId })
      return null
    }
    throw err
  }
  return booking.id
}

const currencyOf = (pi: Stripe.PaymentIntent): 'eur' | 'czk' | undefined =>
  pi.currency === 'czk' ? 'czk' : pi.currency === 'eur' ? 'eur' : undefined

/** payment_intent.succeeded on a card PaymentIntent: one charge_succeeded observation row per PaymentIntent. */
export async function handleCardChargeSucceeded(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent
  if (!SUCCEEDED_KINDS.includes(pi.metadata?.kind ?? '')) return

  const bookingId = await resolveBookingId('payment_intent.succeeded', pi)
  if (!bookingId) return

  // WR-03: an extra is never a trip or cash charge. No charge_succeeded row: extra_charged is its only ledger row.
  if (pi.metadata?.kind === 'card_extra') {
    await finalizeExtraFromWebhook(bookingId, pi, 'succeeded')
    return
  }

  await appendPaymentEvent(bookingId, {
    key: `charge_succeeded:${pi.id}`,
    kind: 'charge_succeeded',
    stripeObjectId: pi.id,
    amountMinor: pi.amount_received || pi.amount,
    currency: currencyOf(pi),
    actor: WEBHOOK_ACTOR,
  })

  if (pi.metadata?.kind === 'card_charge') await reconcileLateCashCharge(bookingId, pi)
}

/**
 * Money CR-05: a cash card charge whose answer never reached us, so the row went back to unpaid, did execute after all.
 * Still unpaid: the payment is recorded. Nothing owed any more (cash confirmed, booking released, another card payment
 * recorded; money review 2, WR-01): the card money goes back at once
 * (deterministic key, a redelivery replays it) and the operator is told either way. A row still capturing has the event
 * delivered again (money review 2, CR-02). Every other row is left alone.
 */
async function reconcileLateCashCharge(bookingId: string, pi: Stripe.PaymentIntent): Promise<void> {
  const outcome = await adoptLateCashCharge(bookingId, pi, WEBHOOK_ACTOR)
  // Money review 2, CR-02: the row is still claimed, and its owner may free it without having seen this charge. The
  // observation above is written (the owner reads it before freeing anything); the event is not consumed: the throw answers
  // 500 and Stripe delivers it again, like a recovery payment on a busy booking.
  if (outcome === 'busy') throw new Error('cash card charge while the booking is capturing')
  if (outcome === 'adopted') {
    // Money review 2, CR-01: the panel told the operator the charge was not confirmed, so the client may have paid the
    // driver as well. Recorded, receipted, and the operator is always told.
    await announceLateCashCharge(bookingId, { id: bookingId }, cashChargeFacts(pi))
    return
  }
  if (outcome !== 'already_paid') return

  let refunded = false
  let code = 'cash_card'
  try {
    await getPaymentsStripe().refunds.create(
      { payment_intent: pi.id },
      { idempotencyKey: stripeKeys.refund(bookingId, `cash_dup:${pi.id}`) },
    )
    refunded = true
  } catch (err) {
    code = stripeErrorCode(err)
    console.error('[webhook] cash duplicate not refunded', { bookingId, stripeObjectId: pi.id, code })
    await appendPaymentEvent(bookingId, {
      key: `refund_failed:${bookingId}:cash_dup:${pi.id}`,
      kind: 'refund_failed',
      stripeObjectId: pi.id,
      amountMinor: pi.amount_received || pi.amount,
      currency: currencyOf(pi),
      errorCode: code,
      actor: WEBHOOK_ACTOR,
    })
  }
  const { data } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  await sendPaymentOperatorAlert(
    'duplicate_payment',
    { ...((data as Record<string, unknown> | null) ?? { id: bookingId }), payment_currency: currencyOf(pi) },
    {
      eventKey: `alert:duplicate_payment:${bookingId}:${pi.id}`,
      code: 'cash_card',
      amountMinor: pi.amount_received || pi.amount,
      note: refunded ? 'refunded' : 'refund_failed',
    },
  )
}

/**
 * payment_intent.payment_failed on a card_charge / card_difference / card_fee / card_extra PaymentIntent: the decline is already
 * recorded by settleBooking from the synchronous answer (and a lost answer is replayed by the sweep with the same
 * idempotency key, which returns the same decline). This only adds an observation row (none for card_extra, WR-03); plan 88-14
 * attaches the recovery link, client email and operator alert to the settle failure branches.
 */
export async function handleCardChargeFailed(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent
  const kind = pi.metadata?.kind
  if (kind !== 'card_charge' && kind !== 'card_difference' && kind !== 'card_fee' && kind !== 'card_extra') return

  const bookingId = await resolveBookingId('payment_intent.payment_failed', pi)
  if (!bookingId) return

  // WR-03: no charge_failed observation for an extra: extra_failed is its only ledger row.
  if (kind === 'card_extra') {
    await finalizeExtraFromWebhook(bookingId, pi, 'failed')
    return
  }

  const err = pi.last_payment_error
  const code = (err?.decline_code || err?.code || 'unknown').slice(0, 60)
  const observationPrefix =
    kind === 'card_difference' ? 'difference_failed_obs' : kind === 'card_fee' ? 'fee_failed_obs' : 'charge_failed_obs'
  await appendPaymentEvent(bookingId, {
    key: `${observationPrefix}:${pi.id}`,
    kind: kind === 'card_difference' ? 'difference_failed' : 'charge_failed',
    stripeObjectId: pi.id,
    amountMinor: pi.amount,
    currency: currencyOf(pi),
    errorCode: code,
    actor: WEBHOOK_ACTOR,
  })
}
