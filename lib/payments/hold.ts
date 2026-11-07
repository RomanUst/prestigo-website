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
import { assertMoneyEligible, BOOKING_STATUSES, CALENDAR_ACTIVE_STATUSES, PartnerBookingMoneyError } from '@/lib/booking-status'
import { evaluateCancellation, policyFromSnapshot, tripFactsFromRow } from '@/lib/cancellation-policy'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { loadFeeCase } from '@/lib/payments/fee'
import { pickupInstantMs } from '@/lib/prague-date'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import {
  appendPaymentEvent,
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
import { RECOVERY_LINK_CLEARED, retireRecoveryLink } from '@/lib/payments/recovery-link'
import { retryAt } from '@/lib/payments/timing'

type BookingRow = Record<string, unknown>

export type HoldOutcome = 'authorized' | 'transient' | 'failed' | 'skipped'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const attemptsOf = (b: BookingRow): number =>
  typeof b.hold_attempts === 'number' && Number.isInteger(b.hold_attempts) && b.hold_attempts >= 0 ? b.hold_attempts : 0

/**
 * Statuses of a booking whose trip is still ahead: the only ones a hold may be claimed for (the same set the
 * scheduled-hold claim of migration 085 filters on, derived from the shared vocabulary). 88-REVIEW A-WR-04 / C-WR-01:
 * the admin / retry claim passes it as requireStatus, so the status is checked INSIDE the compare-and-set (migration
 * 086, under the row lock); the exits of placing_hold pass HOLD_OPEN_STATUSES, so a cancel that lands while Stripe is
 * authorizing can never end in a live hold.
 */
export const HOLD_ACTIVE_STATUSES: readonly string[] = [...CALENDAR_ACTIVE_STATUSES].filter(
  (s) => s !== 'on_board' && s !== 'completed' && s !== 'no_show',
)

/**
 * Statuses in which a hold that is already being placed may still settle (authorized / failed): every status except
 * the closed ones. A trip that started (on_board) or completed while Stripe answered keeps its authorization, because
 * the settle captures it; only a cancelled or no-show booking is refused and released (abandonHoldForClosedBooking).
 */
export const HOLD_OPEN_STATUSES: readonly string[] = BOOKING_STATUSES.filter((s) => s !== 'cancelled' && s !== 'no_show')

/**
 * 88-REVIEW A-WR-06: a placing_hold / capturing row whose worker died keeps its state, but its lease runs out. True when
 * the row carries an expired (or missing) lease; a row read without the lease column counts as leased (never guess).
 */
export function leaseLapsed(b: BookingRow, nowMs: number = Date.now()): boolean {
  if (!('payment_lease_until' in b)) return false
  const until = typeof b.payment_lease_until === 'string' ? Date.parse(b.payment_lease_until) : NaN
  return !Number.isFinite(until) || until <= nowMs
}

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
    // A cancelled / no-show booking is never claimed for a hold (A-WR-04), checked under the row lock.
    requireStatus: HOLD_ACTIVE_STATUSES,
  })
  return moved.applied ? { applied: true, booking: moved.booking } : { applied: false }
}

/**
 * The closing request writes the status first and opens the fee case after it, so a placement that lands in between sees no
 * case yet. Read fresh: `booking` here is the snapshot from before the close. A no-show always gets a case; a cancel does
 * when the stored terms make it late now (money WR-03). A cancel by Prestigo inside that window also keeps the card: the
 * row then offers release, and card_saved can be undone where released can not.
 */
async function closedWithFeeComing(bookingId: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error) throw new Error('closed booking lookup failed')
  const row = (data as BookingRow | null) ?? null
  if (row?.status === 'no_show') return true
  if (row?.status !== 'cancelled') return false
  const facts = tripFactsFromRow(row as unknown as Parameters<typeof tripFactsFromRow>[0])
  return facts !== null && evaluateCancellation(policyFromSnapshot(row.cancel_policy), facts, Date.now()).kind !== 'free'
}

/**
 * The booking was cancelled or marked no-show while its hold was being placed (the status-gated transition out of
 * placing_hold was refused): void whatever PaymentIntent this attempt produced and leave placing_hold.
 *   nothing to decide     -> released (terminal) and the recovery link dropped: the booking owes nothing;
 *   a fee case pending, or about to open
 *                         -> card_saved (89 Pitfall 2): released is terminal and would destroy the saved card the
 *                            operator may still charge (D-15). Only the authorization of this attempt is voided.
 * A void that fails leaves the D-20 trail (refund_failed ledger row + operator alert to cancel the hold by hand).
 */
export async function abandonHoldForClosedBooking(
  booking: BookingRow,
  paymentIntentId: string | null,
  actor: LedgerActor,
): Promise<void> {
  const bookingId = str(booking.id)
  let voidError: string | null = null
  if (paymentIntentId) {
    try {
      await cancelPaymentIntent(paymentIntentId, stripeKeys.voidHoldNow(paymentIntentId))
    } catch (err) {
      voidError = stripeErrorCode(err)
      console.error('[hold] authorization on a closed booking not voided', { bookingId, stripeObjectId: paymentIntentId })
    }
  }

  // A lookup that fails keeps the fee option (card_saved): released can not be undone, card_saved can.
  let keepCard = false
  try {
    keepCard = (await loadFeeCase(bookingId))?.status === 'pending' || (await closedWithFeeComing(bookingId))
  } catch {
    keepCard = true
    console.error('[hold] fee case lookup failed, keeping the saved card', { bookingId })
  }

  const attemptKey = paymentIntentId ?? `${bookingId}:${attemptsOf(booking)}`
  const moved = keepCard
    ? await applyTransition({
        bookingId,
        from: ['placing_hold'],
        to: 'card_saved',
        patch: { payment_lease_until: null },
        event: {
          key: `hold_voided:closed:${attemptKey}`,
          kind: 'hold_released',
          stripeObjectId: paymentIntentId ?? undefined,
          errorCode: 'fee_pending',
          actor,
        },
      })
    : await applyTransition({
        bookingId,
        from: ['placing_hold'],
        to: 'released',
        patch: { payment_lease_until: null, ...RECOVERY_LINK_CLEARED },
        event: {
          key: `hold_released:closed:${attemptKey}`,
          kind: 'hold_released',
          stripeObjectId: paymentIntentId ?? undefined,
          errorCode: 'booking_closed',
          actor,
        },
      })
  if (moved.applied && !keepCard) await retireRecoveryLink(booking)

  if (voidError && paymentIntentId) {
    const amountMinor = typeof booking.payment_amount_minor === 'number' ? booking.payment_amount_minor : undefined
    const currency = booking.payment_currency === 'czk' ? 'czk' : 'eur'
    try {
      await appendPaymentEvent(bookingId, {
        key: `refund_failed:${bookingId}:hold:${paymentIntentId}`,
        kind: 'refund_failed',
        stripeObjectId: paymentIntentId,
        amountMinor,
        currency,
        errorCode: voidError,
        actor,
      })
    } catch {
      console.error('[hold] refund_failed row not written', { bookingId })
    }
    try {
      await sendPaymentOperatorAlert('refund_failed', booking, {
        eventKey: `alert:refund_failed:${bookingId}:hold:${paymentIntentId}`,
        code: voidError,
        amountMinor,
        note: 'release',
      })
    } catch {
      console.error('[hold] closed-booking hold alert failed', { bookingId })
    }
  }
}

/** placing_hold -> failed with the shared patch and one hold_failed ledger row (key unique per PaymentIntent and attempt). */
async function recordDefinitiveFailure(
  booking: BookingRow,
  info: { code: string; paymentIntentId: string | null },
  actor: LedgerActor,
  nowMs: number,
): Promise<{ outcome: 'failed' | 'skipped'; code: string }> {
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
    // A booking cancelled meanwhile gets no "payment failed" email and no recovery link (A-WR-04).
    requireStatus: HOLD_OPEN_STATUSES,
  })
  if (moved.statusBlocked) {
    await abandonHoldForClosedBooking(booking, info.paymentIntentId, actor)
    return { outcome: 'skipped', code: 'booking_closed' }
  }
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

/**
 * 88-REVIEW A-WR-02: Stripe refused OUR key (revoked, expired, restricted). Once per booking, phase and attempt the
 * operator is told; the client never is. Never throws.
 */
export async function alertStripeConfig(
  booking: BookingRow,
  phase: 'hold' | 'charge',
  attempt: number,
  code: string,
): Promise<void> {
  const bookingId = str(booking.id)
  try {
    await sendPaymentOperatorAlert('stripe_config', booking, {
      eventKey: `alert:stripe_config:${bookingId}:${phase}:${attempt}`,
      code,
    })
  } catch {
    console.error('[hold] stripe configuration alert failed', { bookingId })
  }
}

/** PaymentIntent states that still block (or may still block) money on the client's card. */
const VOIDABLE_STATUSES: ReadonlySet<string> = new Set([
  'requires_capture',
  'requires_confirmation',
  'requires_action',
  'requires_payment_method',
  'processing',
])

/**
 * Void every PaymentIntent that the scheduled-hold attempt `attempt` of a booking created (found by its metadata), so
 * a request whose answer was lost can never leave an authorization behind (88-REVIEW A-WR-03). Returns false when
 * Stripe could not be searched or a void failed: the caller must then keep the attempt number, so the next try meets
 * the same key again instead of placing a second hold.
 */
export async function voidHoldAttempt(bookingId: string, attempt: number): Promise<boolean> {
  const stripe = getPaymentsStripe()
  let found: Stripe.PaymentIntent[]
  try {
    const result = await stripe.paymentIntents.search({
      query: `metadata['cofBookingId']:'${bookingId}' AND metadata['attempt']:'${attempt}' AND metadata['kind']:'card_hold'`,
      limit: 10,
    })
    found = result.data
  } catch {
    console.error('[hold] attempt lookup failed', { bookingId, attempt })
    return false
  }
  let ok = true
  for (const pi of found) {
    if (!VOIDABLE_STATUSES.has(pi.status)) continue
    try {
      await cancelPaymentIntent(pi.id, stripeKeys.voidHoldNow(pi.id))
    } catch {
      ok = false
      console.error('[hold] earlier attempt authorization not voided', { bookingId, stripeObjectId: pi.id })
    }
  }
  return ok
}

/**
 * The hold key of this attempt was already used with different parameters (StripeIdempotencyError): the earlier
 * request executed, for another amount. Its PaymentIntent is voided and the booking goes back to card_saved with the
 * NEXT attempt number, so the following run creates a fresh hold for the current amount. No client email: nothing
 * was declined. When the earlier PaymentIntent can not be voided the attempt number stays (the next run tries again).
 */
async function recoverFromKeyReuse(
  booking: BookingRow,
  actor: LedgerActor,
  nowMs: number,
): Promise<{ outcome: HoldOutcome; code: string }> {
  const bookingId = str(booking.id)
  const attempts = attemptsOf(booking)
  const voided = await voidHoldAttempt(bookingId, attempts)
  await applyTransition({
    bookingId,
    from: ['placing_hold'],
    to: 'card_saved',
    patch: { payment_lease_until: null, ...(voided ? { hold_attempts: attempts + 1 } : {}) },
    event: {
      key: `hold_failed:key_reused:${attempts}:${nowMs}`,
      kind: 'hold_failed',
      errorCode: voided ? 'idempotency_key_reused' : 'idempotency_void_pending',
      actor,
    },
  })
  return { outcome: 'transient', code: 'key_reused' }
}

/** Cancel a PaymentIntent by id; an already-canceled one counts as success. Any other error is rethrown. */
export async function cancelPaymentIntent(piId: string, idempotencyKey: string): Promise<void> {
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

/**
 * Void an authorization that outlived the decision it was for (money WR-04): a failed or expired row can still have a live
 * hold, for example one smaller than a fee the card then declined. Only a hold that really is live is cancelled; one that
 * lapsed or no longer exists holds nothing. Any other read or cancel problem is rethrown.
 */
export async function voidLeftoverHold(paymentIntentId: string): Promise<void> {
  let pi: Stripe.PaymentIntent
  try {
    pi = (await getPaymentsStripe().paymentIntents.retrieve(paymentIntentId)) as Stripe.PaymentIntent
  } catch (err) {
    if (stripeErrorCode(err) === 'resource_missing') return
    throw err
  }
  if (pi.status === 'requires_capture') await cancelPaymentIntent(paymentIntentId, stripeKeys.voidHoldNow(paymentIntentId))
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
    // 88-REVIEW A-WR-03: the key of this attempt already ran with other parameters (the price changed after a request
    // that may have authorized): void what that request created, then move to a fresh key.
    if (kind === 'idempotency') return recoverFromKeyReuse(booking, actor, nowMs)
    if (kind === 'transient' || kind === 'config') {
      // Same attempt number: the next tick replays the same idempotency key. 88-REVIEW A-WR-01 / A-WR-02: a busy key
      // (409) or a broken Stripe key is not the client's decline: no attempt is used up and the client is not emailed.
      const code = kind === 'config' ? 'stripe_config' : 'transient'
      await applyTransition({
        bookingId,
        from: ['placing_hold'],
        to: 'card_saved',
        patch: { payment_lease_until: null },
        event: { key: `hold_failed:${code}:${attempts}:${nowMs}`, kind: 'hold_failed', errorCode: code, actor },
      })
      if (kind === 'config') await alertStripeConfig(booking, 'hold', attempts, stripeErrorCode(err))
      return { outcome: 'transient', code }
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
      // T1: the hold secures the money, so a recovery link from an earlier decline must not stay payable.
      ...RECOVERY_LINK_CLEARED,
    },
    event: {
      key: `hold_authorized:${pi.id}`,
      kind: 'hold_authorized',
      stripeObjectId: pi.id,
      amountMinor,
      currency,
      actor,
    },
    // A-WR-04 / C-WR-01: the booking was cancelled (or marked no-show) during the Stripe call -> never authorized.
    requireStatus: HOLD_OPEN_STATUSES,
  })

  if (moved.statusBlocked) {
    await abandonHoldForClosedBooking(booking, pi.id, actor)
    return { outcome: 'skipped', code: 'booking_closed' }
  }
  if (!moved.applied && moved.duplicate !== true) {
    // The booking left placing_hold meanwhile (released, cancelled): the authorization has no owner. Void it.
    try {
      await cancelPaymentIntent(pi.id, stripeKeys.voidHoldNow(pi.id))
    } catch {
      console.error('[hold] orphan authorization not voided', { bookingId, stripeObjectId: pi.id })
    }
    return { outcome: 'skipped', code: 'state_moved' }
  }
  await retireRecoveryLink(booking)

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
 *   checkout_pending                 -> cancel the hold-now PaymentIntent if the checkout created one (88-REVIEW T6:
 *                                       the client could still finish 3DS and leave a full authorization on a
 *                                       released booking), released
 *   card_saved/failed/expired        -> released, no Stripe call
 *   balance_due + reason 'waive'     -> released with a waived ledger row
 *   placing_hold, lease lapsed       -> void what the dead attempt may have authorized, released (88-REVIEW A-WR-06)
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

  // Only a card_hold or cash_guarantee booking has a hold or a saved card to release (a pay-now booking never leaves
  // 'none'). A cash booking never holds money: card_saved, failed, checkout_pending, no Stripe call but the setup void.
  if (booking.payment_mode !== 'card_hold' && booking.payment_mode !== 'cash_guarantee') return 'noop'

  const state = booking.payment_state as PaymentState
  if (state === 'capturing') return 'busy'
  if (state === 'placing_hold' && !leaseLapsed(booking)) return 'busy'

  let from: PaymentState[]
  let event: Parameters<typeof applyTransition>[0]['event']

  if (state === 'authorized') {
    await cancelHoldIntent(booking)
    const piId = str(booking.hold_payment_intent_id)
    from = ['authorized']
    event = { key: `hold_released:${piId}`, kind: 'hold_released', stripeObjectId: piId || undefined, actor: opts.actor }
  } else if (state === 'checkout_pending') {
    // A hold-now checkout already created its PaymentIntent (the client holds its secret). Void it first, so a
    // 3DS completed later can not authorize anything; a failure throws and the caller reports it (D-20).
    const piId = str(booking.hold_payment_intent_id)
    if (piId) await cancelPaymentIntent(piId, stripeKeys.voidHoldNow(piId))
    from = ['checkout_pending']
    event = { key: `hold_released:checkout_pending:${bookingId}`, kind: 'hold_released', stripeObjectId: piId || undefined, actor: opts.actor }
  } else if (state === 'placing_hold') {
    // The lease lapsed: the worker that was placing this hold is gone. Whatever its request authorized is voided first;
    // a void that can not be confirmed answers busy (the caller alerts, nothing is released blind).
    if (!(await voidHoldAttempt(bookingId, attemptsOf(booking)))) return 'busy'
    from = ['placing_hold']
    event = { key: `hold_released:stale_lease:${bookingId}:${attemptsOf(booking)}`, kind: 'hold_released', errorCode: 'lease_lapsed', actor: opts.actor }
  } else if (state === 'card_saved' || state === 'failed' || state === 'expired') {
    // `failed` does not mean nothing is at Stripe: a void that can not be confirmed throws, the caller reports it (D-20).
    const leftover = str(booking.hold_payment_intent_id)
    if (leftover && state !== 'card_saved') await voidLeftoverHold(leftover)
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
    patch: { payment_lease_until: null, ...RECOVERY_LINK_CLEARED },
    event,
  })

  if (!moved.applied && moved.duplicate !== true) {
    return moved.currentState === 'placing_hold' || moved.currentState === 'capturing' ? 'busy' : 'noop'
  }

  await retireRecoveryLink(booking)
  return 'released'
}
