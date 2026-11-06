import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type Stripe from 'stripe'
import { czkToEur } from '@/lib/currency'
import { advanceBookingStatus, scheduleCancelRouteEmail } from '@/lib/booking-status-service'
import { enforceMaxBody } from '@/lib/request-guards'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
import { getPaymentsStripe, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { leaseLapsed, releaseHold } from '@/lib/payments/hold'

const cancelSchema = z.object({
  id: z.string().uuid(),
  leg: z.enum(['outbound', 'return']).optional(),
})

// no_show is terminal (D-09) like completed and cancelled.
const NON_CANCELLABLE_STATUSES = ['cancelled', 'completed', 'no_show']

type BookingRow = Record<string, unknown>

const BOOKING_COLUMNS =
  'id, status, payment_intent_id, outbound_amount_czk, return_amount_czk, payment_mode, payment_state, ' +
  'payment_currency, payment_amount_minor, booking_reference, booking_source, amount_eur, amount_czk, ' +
  'client_first_name, client_last_name, client_email, origin_address, destination_address, vehicle_class, ' +
  'pickup_date, pickup_time, hold_payment_intent_id, hold_amount_minor, hold_attempts, recovery_link_id, captured_amount_minor, payment_lease_until'

/** The payment side of the row after the status compare-and-set (88-REVIEW C-WR-01). */
const PAYMENT_COLUMNS =
  'payment_mode, payment_state, payment_currency, payment_amount_minor, payment_intent_id, ' +
  'hold_payment_intent_id, hold_amount_minor, hold_attempts, recovery_link_id, captured_amount_minor, payment_lease_until'

/** Payment states in which a cancelled card booking holds nothing: the cancel is complete. */
const NOTHING_HELD: ReadonlySet<string> = new Set(['released', 'none'])

/**
 * 88-REVIEW T4 (C-CR-01): money a card booking already COLLECTED before the trip (the client paid the recovery link
 * of a declined hold: failed -> captured while the status is still confirmed). Cancelling it refunds that payment.
 */
function collectedMinor(row: BookingRow): number {
  const captured = num(row.captured_amount_minor) ?? 0
  if (captured > 0) return captured
  return row.payment_state === 'captured' || row.payment_state === 'balance_due' ? (num(row.payment_amount_minor) ?? 0) : 0
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * What the failed money step was about, in minor units of the booking's money currency:
 *   leg refund        -> the leg amount in EUR cents (what the refund request carried)
 *   card hold release -> the held amount (or the booking amount) in the booking's payment currency
 *   card refund       -> the amount the card booking already collected, in its payment currency (T4)
 *   full refund       -> the booking's EUR amount (the pay-now charge is in EUR)
 */
function failedAmount(
  booking: BookingRow,
  legAmountCents: number | null,
  isHold: boolean,
  cardCollectedMinor: number | null = null,
): { amount_minor: number; currency: 'eur' | 'czk' } {
  if (isHold && cardCollectedMinor !== null) {
    return { amount_minor: cardCollectedMinor, currency: booking.payment_currency === 'czk' ? 'czk' : 'eur' }
  }
  if (isHold) {
    const minor = num(booking.hold_amount_minor) ?? num(booking.payment_amount_minor) ?? 0
    return { amount_minor: minor, currency: booking.payment_currency === 'czk' ? 'czk' : 'eur' }
  }
  if (legAmountCents !== null) return { amount_minor: legAmountCents, currency: 'eur' }
  const eur = num(booking.amount_eur)
  if (eur !== null) return { amount_minor: Math.round(eur * 100), currency: 'eur' }
  return { amount_minor: num(booking.payment_amount_minor) ?? 0, currency: 'eur' }
}

export async function POST(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tooBig = enforceMaxBody(request, 10_000)
  if (tooBig) return tooBig

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', parsed.data.id)
    .single<BookingRow & { status: string }>()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  if (NON_CANCELLABLE_STATUSES.includes(booking.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a booking with status '${booking.status}'` },
      { status: 422 }
    )
  }

  const isHold = booking.payment_mode === 'card_hold'
  const refundsPayNow = !isHold && Boolean(booking.payment_intent_id)

  // D-04: a card booking whose hold is being placed or whose capture is running holds a lease; cancelling now
  // would race that worker. Nothing is written. 88-REVIEW A-WR-06: a hold placement whose lease lapsed (its worker
  // died) no longer blocks the cancel: releaseHold voids what it may have authorized.
  if (
    isHold &&
    (booking.payment_state === 'capturing' || (booking.payment_state === 'placing_hold' && !leaseLapsed(booking)))
  ) {
    return NextResponse.json({ error: 'payment_busy' }, { status: 409 })
  }

  // Build the refund request before any write: the per-leg amount must be computable (D-13).
  let refundParams: Stripe.RefundCreateParams | null = null
  let legAmountCents: number | null = null
  if (refundsPayNow) {
    refundParams = { payment_intent: booking.payment_intent_id as string }
    if (parsed.data.leg) {
      // Round-trip partial refund path (D-13)
      const legAmountCzk = parsed.data.leg === 'outbound'
        ? booking.outbound_amount_czk
        : booking.return_amount_czk

      if (legAmountCzk === null || legAmountCzk === undefined) {
        return NextResponse.json(
          { error: 'Cannot compute per-leg refund: missing leg amount' },
          { status: 422 }
        )
      }

      legAmountCents = Math.round(czkToEur(legAmountCzk as number) * 100)
      refundParams = {
        payment_intent: booking.payment_intent_id as string,
        amount: legAmountCents,
        metadata: { leg: parsed.data.leg }, // Phase 27 webhook contract
      }
    }
  }

  const actor: LedgerActor = { type: 'admin', id: user?.id ?? null }
  const legKey = parsed.data.leg ?? 'full'
  const previousStatus = booking.status

  // D-20 / Phase 87 WR-01: the status compare-and-set runs FIRST. A lost race answers 409 and no money has moved;
  // only the writer whose cancel applied may refund or release.
  // D-13: the status write is scoped to `id` ONLY (inside the service) — never to payment_intent_id — so the
  // paired leg is untouched. The profile runs no side effects (no link, QStash or GNet push); the client's email
  // follows below, once the money step succeeded, so a failed refund never promises one.
  const cancelled = await advanceBookingStatus({
    bookingId: parsed.data.id,
    to: 'cancelled',
    actor: { type: 'admin', id: user?.id ?? null },
    source: 'admin_cancel',
    profile: 'cancel-route',
    current: booking,
    // Compare-and-set against the status this route validated.
    expectedFrom: booking.status as string,
  })

  if (!cancelled.ok) {
    if (cancelled.code === 'conflict') {
      return NextResponse.json(
        { error: 'status_conflict', currentStatus: cancelled.currentStatus },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  // The cancel applied. From here a money failure never rolls it back: it leaves a refund_failed ledger row and an
  // operator alert instead (D-20).
  const moneyFailed = async (err: unknown, kind: 'refund' | 'release', cardCollected: number | null = null) => {
    const code =
      err instanceof Error && ['busy', 'state_moved', 'no_payment_intent'].includes(err.message)
        ? err.message
        : stripeErrorCode(err)
    const { amount_minor, currency } = failedAmount(booking, legAmountCents, isHold, cardCollected)
    console.error('[cancel] money step failed after the cancel applied', { bookingId: booking.id, kind, code })
    try {
      await appendPaymentEvent(String(booking.id), {
        key: `refund_failed:${booking.id}:${legKey}`,
        kind: 'refund_failed',
        amountMinor: amount_minor,
        currency,
        errorCode: code,
        actor,
      })
    } catch {
      console.error('[cancel] refund_failed ledger row not written', { bookingId: booking.id })
    }
    try {
      await sendPaymentOperatorAlert(
        'refund_failed',
        { ...booking, payment_currency: currency },
        {
          eventKey: `alert:refund_failed:${booking.id}:${legKey}`,
          code,
          amountMinor: amount_minor,
          note: kind === 'release' ? 'release' : undefined,
        },
      )
    } catch {
      console.error('[cancel] refund_failed alert not sent', { bookingId: booking.id })
    }
    return NextResponse.json(
      { error: 'refund_failed', cancelled: true, amount_minor, currency },
      { status: 502 }
    )
  }

  if (isHold) {
    // C-WR-01: the payment snapshot read above predates the status compare-and-set, and the payment tick may have
    // claimed the row in between (card_saved -> placing_hold). Release from a fresh read. The hold engine itself
    // refuses to authorize a cancelled booking (status-gated transition, migration 086), so a placement that was in
    // flight voids its own authorization; 'busy' still alerts the operator in case that worker died mid-call.
    let current: BookingRow = booking
    try {
      const { data: fresh, error: freshError } = await supabase
        .from('bookings')
        .select(PAYMENT_COLUMNS)
        .eq('id', parsed.data.id)
        .maybeSingle<BookingRow>()
      if (!freshError && fresh) current = { ...booking, ...fresh }
    } catch {
      // Fall back to the snapshot: releaseHold's own compare-and-set still refuses a stale state.
      console.error('[cancel] fresh payment read failed', { bookingId: booking.id })
    }

    // T4 (C-CR-01): the card booking already collected money (a paid recovery link before the trip). D-20: the
    // cancel stands; the payment is refunded in full (deterministic key refund:<id>:full, the same key a retry of this
    // cancel would use); a refund that fails leaves the refund_failed row + operator alert and answers 502.
    const collected = collectedMinor(current)
    if (collected > 0) {
      const paymentIntentId = typeof current.payment_intent_id === 'string' ? current.payment_intent_id : ''
      try {
        if (!paymentIntentId) throw new Error('no_payment_intent')
        const refund = await getPaymentsStripe().refunds.create(
          { payment_intent: paymentIntentId },
          { idempotencyKey: stripeKeys.refund(String(booking.id), legKey) },
        )
        scheduleCancelRouteEmail(booking, previousStatus, 'refund')
        return NextResponse.json({ ok: true, refund_id: refund.id })
      } catch (err) {
        return moneyFailed(err, 'refund', collected)
      }
    }

    // D-04: release the hold (authorized -> PaymentIntent cancelled; any other state -> released without Stripe).
    try {
      const released = await releaseHold(current, { actor, reason: 'cancel' })
      if (released === 'busy') throw new Error('busy')
      if (released === 'released') {
        scheduleCancelRouteEmail(booking, previousStatus, 'no_charge')
        return NextResponse.json({ ok: true, released: true })
      }
      // noop: fine only when nothing is held any more; never answer ok while a hold or card is still live.
      if (!NOTHING_HELD.has(String(current.payment_state ?? 'none'))) throw new Error('state_moved')
      scheduleCancelRouteEmail(booking, previousStatus, 'no_charge')
      return NextResponse.json({ ok: true })
    } catch (err) {
      return moneyFailed(err, 'release')
    }
  }

  if (refundParams) {
    try {
      const refund = await getPaymentsStripe().refunds.create(refundParams, {
        idempotencyKey: stripeKeys.refund(String(booking.id), legKey),
      })
      scheduleCancelRouteEmail(booking, previousStatus, 'refund')
      return NextResponse.json({ ok: true, refund_id: refund.id })
    } catch (err) {
      return moneyFailed(err, 'refund')
    }
  }

  // Manual booking — no Stripe, the status change was all there was to do.
  scheduleCancelRouteEmail(booking, previousStatus, null)
  return NextResponse.json({ ok: true })
}
