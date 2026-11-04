// Settle a completed card_hold trip: capture the held amount (Phase 88, plan 88-13; HOLD-04, D-05, D-06).
//
// One function, three entry points (the single Phase 87 completion event, the payment tick's completion sweep,
// the admin "capture" action), all calling settleBooking(bookingId, actor). Nothing else collects client money.
//
// Never twice (T-88-38):
//   1. CAS claim: authorized | expired | card_saved | failed | capturing -> capturing through applyTransition.
//      Exactly one caller wins; a row already in capturing can only be re-claimed after its lease expired (SQL rule).
//   2. Attempt-numbered idempotency keys cap:<id>:<charge_attempts>. A transient Stripe error leaves the row in
//      capturing with its lease and the SAME attempt number, so the next sweep replays the same key and Stripe
//      returns the original result. A definitive failure advances charge_attempts inside the transition that
//      records it, so the following attempt gets a fresh key.
//   3. Ledger event keys on every money row (captured:<pi>, ...): a replay of the same fact is a no-op.
//
// Amounts (T-88-39): the money is the row's CURRENT payment_amount_minor in its payment_currency, never anything a
// client or request supplied. All values are integer minor units of payment_currency; nothing converts EUR <-> CZK.
// The capture is limited to min(due, amount_capturable); no code path collects before the trip is completed.

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { applyTransition, type LedgerActor, type PaymentPatch, type PaymentState } from '@/lib/payments/state'
import { classifyStripeError, getPaymentsStripe, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'

type BookingRow = Record<string, unknown>

export type SettleOutcome = 'captured' | 'balance_due' | 'failed' | 'transient' | 'busy' | 'noop' | 'skipped'

export interface SettleResult {
  outcome: SettleOutcome
  code?: string
  capturedMinor?: number
  diffMinor?: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const attemptsOf = (b: BookingRow): number =>
  typeof b.charge_attempts === 'number' && Number.isInteger(b.charge_attempts) && b.charge_attempts >= 0 ? b.charge_attempts : 0

/** States a settle may claim. 'capturing' is claimable only after its lease expired (SQL lease rule). */
const CLAIMABLE: PaymentState[] = ['authorized', 'expired', 'card_saved', 'failed', 'capturing']
/** States in which there is nothing left to collect (or nothing a settle may do). */
const SETTLED_STATES: ReadonlySet<string> = new Set(['captured', 'released', 'balance_due'])

/**
 * The trip is over: the status is completed, or the durable completed_at fact is set on a row whose status moved
 * on (a NULL completed_at on a historic completed row still counts through its status). Cancelled and no-show
 * trips are never settled here.
 */
function isCompleted(b: BookingRow): boolean {
  if (b.status === 'completed') return true
  if (b.status === 'cancelled' || b.status === 'no_show') return false
  return typeof b.completed_at === 'string' && b.completed_at.length > 0
}

type Collected =
  | { kind: 'ok'; pi: Stripe.PaymentIntent; capturedMinor: number }
  | { kind: 'transient' }
  | { kind: 'failed'; code: string; paymentIntentId: string | null }

interface Ctx {
  booking: BookingRow
  bookingId: string
  attempt: number
  dueMinor: number
  currency: 'eur' | 'czk'
  actor: LedgerActor
}

/** Capture the held PaymentIntent for min(due, capturable), or reconcile one that is already captured. */
async function collectFromHold(ctx: Ctx, holdId: string): Promise<Collected> {
  const stripe = getPaymentsStripe()

  let pi: Stripe.PaymentIntent
  try {
    pi = (await stripe.paymentIntents.retrieve(holdId)) as Stripe.PaymentIntent
  } catch (err) {
    if (classifyStripeError(err) === 'transient') return { kind: 'transient' }
    return { kind: 'failed', code: stripeErrorCode(err), paymentIntentId: holdId }
  }

  if (pi.status === 'succeeded') {
    // A previous attempt captured but its response (or the state write) was lost: reconcile, never capture again.
    return { kind: 'ok', pi, capturedMinor: pi.amount_received }
  }

  if (pi.status === 'requires_capture') {
    const toCapture = Math.min(ctx.dueMinor, pi.amount_capturable)
    try {
      const captured = (await stripe.paymentIntents.capture(
        pi.id,
        { amount_to_capture: toCapture },
        { idempotencyKey: stripeKeys.capture(ctx.bookingId, ctx.attempt) },
      )) as Stripe.PaymentIntent
      return { kind: 'ok', pi: captured, capturedMinor: captured.amount_received }
    } catch (err) {
      if (classifyStripeError(err) === 'transient') return { kind: 'transient' }
      return { kind: 'failed', code: stripeErrorCode(err), paymentIntentId: pi.id }
    }
  }

  return { kind: 'failed', code: 'hold_unavailable', paymentIntentId: holdId }
}

/** capturing -> failed with the attempt counter advanced and the Stripe code (never a message) kept. */
async function recordFailure(
  ctx: Ctx,
  info: { code: string; paymentIntentId: string | null },
  nowMs: number,
): Promise<SettleResult> {
  const code = info.code.slice(0, 60)
  await applyTransition({
    bookingId: ctx.bookingId,
    from: ['capturing'],
    to: 'failed',
    patch: {
      charge_attempts: ctx.attempt + 1,
      last_payment_error: code,
      payment_failed_at: new Date(nowMs).toISOString(),
      payment_lease_until: null,
    },
    event: {
      key: `charge_failed:${info.paymentIntentId ?? 'none'}:${ctx.attempt}`,
      kind: 'charge_failed',
      stripeObjectId: info.paymentIntentId ?? undefined,
      amountMinor: ctx.dueMinor,
      currency: ctx.currency,
      errorCode: code,
      actor: ctx.actor,
    },
  })
  // The client recovery link, the client email and the operator alert for this branch are added by plan 88-14.
  return { outcome: 'failed', code }
}

export async function settleBooking(bookingId: string, actor: LedgerActor): Promise<SettleResult> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) throw new Error('settle booking lookup failed')
  const loaded = (data as BookingRow | null) ?? null
  if (!loaded) return { outcome: 'skipped', code: 'not_found' }

  try {
    assertMoneyEligible({ booking_source: typeof loaded.booking_source === 'string' ? loaded.booking_source : null })
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) {
      console.warn('[settle] partner booking skipped', { bookingId })
      return { outcome: 'skipped', code: 'partner_booking' }
    }
    throw err
  }
  if (loaded.payment_mode !== 'card_hold') return { outcome: 'skipped', code: 'not_card_hold' }
  if (!isCompleted(loaded)) return { outcome: 'skipped', code: 'not_completed' }

  const loadedState = str(loaded.payment_state)
  if (SETTLED_STATES.has(loadedState)) return { outcome: 'noop', code: loadedState }

  const nowMs = Date.now()
  const claim = await applyTransition({
    bookingId,
    from: CLAIMABLE,
    to: 'capturing',
    patch: { payment_lease_until: new Date(nowMs + LEASE_SECONDS * 1000).toISOString() },
    event: { key: `capture_started:${attemptsOf(loaded)}:${nowMs}`, kind: 'capture_started', actor },
  })
  if (!claim.applied) {
    return SETTLED_STATES.has(claim.currentState ?? '')
      ? { outcome: 'noop', code: claim.currentState }
      : { outcome: 'busy' }
  }

  // From here this caller owns the row. Work from the claimed row (fresh amounts and counters).
  const booking: BookingRow = { ...loaded, ...(claim.booking ?? {}) }
  const attempt = attemptsOf(booking)
  const due = booking.payment_amount_minor
  const currency = booking.payment_currency === 'czk' ? 'czk' : booking.payment_currency === 'eur' ? 'eur' : null
  const ctx: Ctx = {
    booking,
    bookingId,
    attempt,
    dueMinor: typeof due === 'number' ? due : 0,
    currency: currency ?? 'eur',
    actor,
  }
  if (typeof due !== 'number' || !Number.isInteger(due) || due <= 0 || !currency) {
    return recordFailure(ctx, { code: 'missing_payment_details', paymentIntentId: null }, nowMs)
  }

  const holdId = str(booking.hold_payment_intent_id)
  const collected: Collected = holdId
    ? await collectFromHold(ctx, holdId)
    : { kind: 'failed', code: 'hold_unavailable', paymentIntentId: null }

  if (collected.kind === 'transient') return { outcome: 'transient', code: 'transient' }
  if (collected.kind === 'failed') return recordFailure(ctx, collected, nowMs)

  const mainPi = collected.pi
  const capturedMinor = collected.capturedMinor
  const patch: PaymentPatch = {
    payment_intent_id: mainPi.id,
    captured_amount_minor: capturedMinor,
    captured_at: new Date().toISOString(),
    payment_lease_until: null,
    last_payment_error: null,
    payment_failed_at: null,
  }
  const moved = await applyTransition({
    bookingId,
    from: ['capturing'],
    to: 'captured',
    patch,
    event: {
      key: `captured:${mainPi.id}`,
      kind: 'captured',
      stripeObjectId: mainPi.id,
      amountMinor: capturedMinor,
      currency: ctx.currency,
      actor,
    },
  })
  if (!moved.applied && moved.duplicate !== true) {
    return SETTLED_STATES.has(moved.currentState ?? '') ? { outcome: 'noop', code: moved.currentState } : { outcome: 'busy' }
  }

  try {
    await sendPaymentEmail({
      kind: 'charged',
      booking: { ...booking, ...(moved.booking ?? {}) },
      eventKey: `email:charged:${bookingId}`,
    })
  } catch {
    // The money is collected; a mail problem never undoes it (the send keeps its own ledger claim).
    console.error('[settle] charged email failed', { bookingId })
  }
  return { outcome: 'captured', capturedMinor, diffMinor: 0 }
}
