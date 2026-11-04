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
// balance_due booking is closed by a recovery payment. Money that arrives for a booking in another state is never
// dropped silently: it gets a recovery_paid ledger row and an error log (ids only), and a booking that is mid-flight
// (placing_hold, capturing, ...) makes the handler throw so Stripe redelivers once the state settles. Nothing here asks
// whether the card flow is switched on for the client (D-09a).

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { appendPaymentEvent, applyTransition, type LedgerActor, type PaymentPatch } from '@/lib/payments/state'
import { getPaymentsStripe } from '@/lib/payments/stripe'
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
    await parkUnmatchedPayment(booking.id, paid, ledgerKey, currency, moved.currentState ?? state)
    return
  }

  if (BUSY_STATES.has(state)) throw new Error('recovery payment while the booking is busy')
  await parkUnmatchedPayment(booking.id, paid, ledgerKey, currency, state)
}

/** Money arrived for a booking that is not payable (already captured, released, ...): visible in the ledger and the log. */
async function parkUnmatchedPayment(
  bookingId: string,
  paid: RecoveryPayment,
  ledgerKey: string,
  currency: 'eur' | 'czk' | undefined,
  state: string,
): Promise<void> {
  const { inserted } = await appendPaymentEvent(bookingId, {
    key: ledgerKey,
    kind: 'recovery_paid',
    stripeObjectId: paid.stripeObjectId,
    amountMinor: paid.paidMinor,
    currency,
    actor: WEBHOOK_ACTOR,
  })
  // The key already exists: the other event of the same payment (session / PaymentIntent) closed the booking earlier.
  if (!inserted) return
  console.error('[webhook] recovery payment for a booking that is not payable, review in the Stripe Dashboard', {
    bookingId,
    stripeObjectId: paid.stripeObjectId,
    state,
  })
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
