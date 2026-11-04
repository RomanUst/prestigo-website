// Webhook handlers for failure recovery and disputes (Phase 88, plan 88-14; HOLD-05, PAYF-03).
//
// handleRecoveryPaid: the client paid a recovery Payment Link (kind card_recovery, cofBookingId metadata, never the
//   legacy booking-id key, so the legacy chain can not build a booking from it). The booking moves failed | balance_due
//   -> captured with captured_amount_minor increased by the paid amount, payment_intent_id set when it is still NULL,
//   the link deactivated and the charged email sent once. Both checkout.session.completed (payment_status paid) and
//   payment_intent.succeeded arrive; they share ONE ledger key, recovery_paid:<PaymentIntent>, so whichever comes
//   second is a duplicate. The key is its own: a declined difference already holds captured:<mainPi>.
// handleDispute: charge.dispute.created on a card booking's payment sends one operator alert. No state change.
//
// Rules: the booking is found through metadata.cofBookingId (dispute: through the PaymentIntent); only a failed or
// balance_due booking is closed by a recovery payment. A booking that is mid-flight (placing_hold, capturing, ...)
// makes the handler throw so Stripe redelivers once the state settles. Nothing here asks whether the card flow is
// switched on for the client (D-09a).
//
// Duplicate payments (88-REVIEW T1: A-CR-01, B-CR-02, C-CR-02). Every engine path that secures the money another way
// deactivates the recovery link, but a Checkout Session the client opened before that can still be paid. Money that
// arrives for a booking in any other state (authorized, captured, released, card_saved, expired, ...) is therefore a
// SECOND payment for the same debt. The chosen behaviour, the same in every such state:
//   - the engine's own collection stays the source of truth (the hold is captured at completion, a captured booking
//     stays as it is, a released / cancelled booking owes nothing), so nothing about the booking changes;
//   - the link payment is refunded in full automatically (key refund:<bookingId>:recovery:<pi>, deterministic, so a
//     redelivery or the second event of the same payment replays the same refund instead of a second one);
//   - one recovery_paid ledger row records it, plus a refund_failed row when the refund did not go through (the admin
//     panel then shows the refund-failed banner), and the operator always gets a duplicate_payment alert.
// Adopting the link payment instead (releasing the hold, moving authorized -> captured) was rejected: it collects
// before the trip, can not cover a changed amount and needs a second Stripe call that can fail half-way.

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { appendPaymentEvent, applyTransition, type LedgerActor, type PaymentPatch } from '@/lib/payments/state'
import { getPaymentsStripe, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { RECOVERY_LINK_CLEARED } from '@/lib/payments/recovery-link'
import { deactivateBookingPaymentLink } from '@/lib/stripe-payment-links'

const WEBHOOK_ACTOR: LedgerActor = { type: 'webhook', id: null }

type BookingRow = Record<string, unknown> & { id: string }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

interface RecoveryPayment {
  bookingId: string
  paidMinor: number
  paymentIntentId: string | null
  /** The object the ledger rows point at: the PaymentIntent, else the session. */
  stripeObjectId: string
}

/** What a recovery payment event says, or null when it is not a paid card_recovery payment (acknowledged, no write). */
function readRecoveryPayment(event: Stripe.Event): RecoveryPayment | null {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.kind !== 'card_recovery') return null
    // 'unpaid' = a delayed method still in flight (the link is card only, so this is defensive).
    if (session.payment_status !== 'paid') return null
    const bookingId = session.metadata?.cofBookingId
    const paymentIntentId = idOf(session.payment_intent)
    const paidMinor = session.amount_total
    if (!bookingId || typeof paidMinor !== 'number' || !Number.isInteger(paidMinor) || paidMinor <= 0) {
      console.warn('[webhook] recovery session without a usable booking or amount', { stripeObjectId: session.id })
      return null
    }
    return { bookingId, paidMinor, paymentIntentId, stripeObjectId: paymentIntentId ?? session.id }
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    if (pi.metadata?.kind !== 'card_recovery') return null
    const bookingId = pi.metadata?.cofBookingId
    const paidMinor = pi.amount_received || pi.amount
    if (!bookingId || typeof paidMinor !== 'number' || !Number.isInteger(paidMinor) || paidMinor <= 0) {
      console.warn('[webhook] recovery payment without a usable booking or amount', { stripeObjectId: pi.id })
      return null
    }
    return { bookingId, paidMinor, paymentIntentId: pi.id, stripeObjectId: pi.id }
  }
  return null
}

async function loadBooking(label: string, bookingId: string, stripeObjectId: string): Promise<BookingRow | null> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) throw new Error('recovery booking lookup failed')
  const booking = (data as BookingRow | null) ?? null
  if (!booking) {
    console.warn(`[webhook] ${label} for an unknown booking`, { stripeObjectId, bookingId })
    return null
  }
  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn(`[webhook] ${label} for a partner booking ignored`, { stripeObjectId, bookingId })
      return null
    }
    throw err
  }
  return booking
}

/** States in which a worker still owns the row: a recovery payment is redelivered later instead of being parked. */
const BUSY_STATES: ReadonlySet<string> = new Set(['checkout_pending', 'placing_hold', 'capturing'])

export async function handleRecoveryPaid(event: Stripe.Event): Promise<void> {
  const paid = readRecoveryPayment(event)
  if (!paid) return

  const booking = await loadBooking(event.type, paid.bookingId, paid.stripeObjectId)
  if (!booking) return

  const state = str(booking.payment_state)
  const currency = booking.payment_currency === 'czk' ? 'czk' : booking.payment_currency === 'eur' ? 'eur' : undefined
  const ledgerKey = `recovery_paid:${paid.stripeObjectId}`

  if (state === 'failed' || state === 'balance_due') {
    const capturedBefore = typeof booking.captured_amount_minor === 'number' ? booking.captured_amount_minor : 0
    const due = typeof booking.payment_amount_minor === 'number' ? booking.payment_amount_minor : null
    if (due !== null && paid.paidMinor !== due - capturedBefore) {
      // The money has arrived either way; the difference is visible to the operator in the ledger amounts.
      console.warn('[webhook] recovery payment differs from the outstanding amount', {
        bookingId: booking.id,
        stripeObjectId: paid.stripeObjectId,
      })
    }

    const patch: PaymentPatch = {
      captured_amount_minor: capturedBefore + paid.paidMinor,
      captured_at: new Date().toISOString(),
      payment_failed_at: null,
      last_payment_error: null,
      payment_retry_at: null,
      payment_lease_until: null,
      ...RECOVERY_LINK_CLEARED,
      // The main capture of a balance_due booking already set it; a failed booking collects for the first time here.
      ...(!str(booking.payment_intent_id) && paid.paymentIntentId ? { payment_intent_id: paid.paymentIntentId } : {}),
    }
    const moved = await applyTransition({
      bookingId: booking.id,
      from: [state],
      to: 'captured',
      patch,
      event: {
        key: ledgerKey,
        kind: 'recovery_paid',
        stripeObjectId: paid.stripeObjectId,
        amountMinor: paid.paidMinor,
        currency,
        actor: WEBHOOK_ACTOR,
      },
    })

    if (moved.applied) {
      const linkId = str(booking.recovery_link_id)
      if (linkId) {
        try {
          await deactivateBookingPaymentLink(linkId)
        } catch {
          console.error('[webhook] recovery link not deactivated', { bookingId: booking.id })
        }
      }
      try {
        await sendPaymentEmail({
          kind: 'charged',
          booking: { ...booking, ...(moved.booking ?? {}) },
          eventKey: `email:charged:${booking.id}`,
          ...(state === 'balance_due' ? { diffMinor: paid.paidMinor } : {}),
        })
      } catch {
        // The money is collected; a mail problem never undoes it (the send keeps its own ledger claim).
        console.error('[webhook] charged email failed', { bookingId: booking.id })
      }
      return
    }
    if (moved.duplicate === true) return // the other event of the same payment already closed the booking
    if (BUSY_STATES.has(moved.currentState ?? '')) throw new Error('recovery payment while the booking is busy')
    await refundDuplicatePayment(booking, paid, ledgerKey, currency, moved.currentState ?? state)
    return
  }

  if (BUSY_STATES.has(state)) throw new Error('recovery payment while the booking is busy')
  await refundDuplicatePayment(booking, paid, ledgerKey, currency, state)
}

/** True when this payment already has its recovery_paid row (it closed the booking, or it was refunded before). */
async function paymentRecorded(bookingId: string, ledgerKey: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('event_key', ledgerKey)
    .limit(1)
  if (error) throw new Error('recovery ledger lookup failed')
  return Array.isArray(data) && data.length > 0
}

/**
 * Money arrived for a booking whose debt is already secured or gone (see the header): refund it in full, record it and
 * alert the operator. The booking itself is never changed. Never refunds the same payment twice: the second event of
 * one payment finds its ledger row, and the refund key is deterministic per PaymentIntent.
 */
async function refundDuplicatePayment(
  booking: BookingRow,
  paid: RecoveryPayment,
  ledgerKey: string,
  currency: 'eur' | 'czk' | undefined,
  state: string,
): Promise<void> {
  // The other event of the same payment (session / PaymentIntent) closed the booking or was refunded already.
  if (await paymentRecorded(booking.id, ledgerKey)) return

  let refunded = false
  let code = 'no_payment_intent'
  if (paid.paymentIntentId) {
    try {
      await getPaymentsStripe().refunds.create(
        { payment_intent: paid.paymentIntentId },
        { idempotencyKey: stripeKeys.refund(booking.id, `recovery:${paid.paymentIntentId}`) },
      )
      refunded = true
    } catch (err) {
      code = stripeErrorCode(err)
    }
  }

  const { inserted } = await appendPaymentEvent(booking.id, {
    key: ledgerKey,
    kind: 'recovery_paid',
    stripeObjectId: paid.stripeObjectId,
    amountMinor: paid.paidMinor,
    currency,
    errorCode: refunded ? 'duplicate_refunded' : 'duplicate_not_refunded',
    actor: WEBHOOK_ACTOR,
  })
  // A concurrent delivery of the same payment got here first (its refund used the same key): nothing more to do.
  if (!inserted) return

  if (!refunded) {
    try {
      await appendPaymentEvent(booking.id, {
        key: `refund_failed:${booking.id}:recovery:${paid.stripeObjectId}`,
        kind: 'refund_failed',
        stripeObjectId: paid.stripeObjectId,
        amountMinor: paid.paidMinor,
        currency,
        errorCode: code,
        actor: WEBHOOK_ACTOR,
      })
    } catch {
      console.error('[webhook] duplicate payment refund_failed row not written', { bookingId: booking.id })
    }
  }

  console.error('[webhook] recovery payment for a booking that is not payable', {
    bookingId: booking.id,
    stripeObjectId: paid.stripeObjectId,
    state,
    refunded,
  })
  try {
    await sendPaymentOperatorAlert(
      'duplicate_payment',
      { ...booking, ...(currency ? { payment_currency: currency } : {}) },
      {
        eventKey: `alert:duplicate_payment:${booking.id}:${paid.stripeObjectId}`,
        code: refunded ? 'refunded' : code,
        amountMinor: paid.paidMinor,
        note: refunded ? 'refunded' : 'refund_failed',
      },
    )
  } catch {
    console.error('[webhook] duplicate payment alert failed', { bookingId: booking.id })
  }
}

/**
 * 88-REVIEW B-WR-04: the card booking a PaymentIntent was created for, read from its own metadata (kind card_*,
 * cofBookingId). The off-session difference charge (card_difference) is only in the ledger, never in a bookings
 * column, so a dispute or refund on it is matched this way. null when the PaymentIntent is not a card-flow object or
 * can not be read.
 */
export async function cardBookingIdForPaymentIntent(paymentIntentId: string): Promise<string | null> {
  try {
    const pi = (await getPaymentsStripe().paymentIntents.retrieve(paymentIntentId)) as Stripe.PaymentIntent
    const kind = typeof pi.metadata?.kind === 'string' ? pi.metadata.kind : ''
    const bookingId = typeof pi.metadata?.cofBookingId === 'string' ? pi.metadata.cofBookingId : ''
    return kind.startsWith('card_') && bookingId ? bookingId : null
  } catch {
    console.error('[webhook] payment intent lookup failed', { stripeObjectId: paymentIntentId })
    return null
  }
}

/** The booking(s) a disputed charge belongs to: through the charge's PaymentIntent. */
async function findDisputedBookings(dispute: Stripe.Dispute): Promise<BookingRow[]> {
  let paymentIntentId = idOf(dispute.payment_intent)
  const chargeId = idOf(dispute.charge)
  if (!paymentIntentId && chargeId) {
    try {
      const charge = (await getPaymentsStripe().charges.retrieve(chargeId)) as Stripe.Charge
      paymentIntentId = idOf(charge.payment_intent)
    } catch {
      console.error('[webhook] dispute charge lookup failed', { stripeObjectId: chargeId })
    }
  }
  if (!paymentIntentId) return []

  const supabase = createSupabaseServiceClient()
  const rows: BookingRow[] = []
  for (const column of ['payment_intent_id', 'hold_payment_intent_id'] as const) {
    const { data, error } = await supabase.from('bookings').select('*').eq(column, paymentIntentId)
    if (error) throw new Error('dispute booking lookup failed')
    for (const row of Array.isArray(data) ? (data as BookingRow[]) : []) {
      if (!rows.some((r) => r.id === row.id)) rows.push(row)
    }
  }
  if (rows.length === 0) {
    // B-WR-04: a difference charge (or any other card PaymentIntent the row does not name) is matched by its metadata.
    const bookingId = await cardBookingIdForPaymentIntent(paymentIntentId)
    if (bookingId) {
      const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle()
      if (error) throw new Error('dispute booking lookup failed')
      if (data) rows.push(data as BookingRow)
    }
  }
  return rows
}

/** charge.dispute.created: one operator alert per disputed card booking; no state change. */
export async function handleDispute(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute
  if (!dispute?.id) return

  for (const booking of await findDisputedBookings(dispute)) {
    if (booking.payment_mode !== 'card_hold') continue
    try {
      assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
    } catch (err) {
      if (err instanceof PartnerBookingMoneyError) continue
      throw err
    }
    await sendPaymentOperatorAlert('dispute', booking, {
      eventKey: `alert:dispute:${booking.id}:${dispute.id}`,
      code: typeof dispute.reason === 'string' ? dispute.reason : undefined,
      amountMinor: typeof dispute.amount === 'number' ? dispute.amount : undefined,
    })
  }
}
