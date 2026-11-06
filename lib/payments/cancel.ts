// The one cancellation orchestrator (Phase 89, plan 89-08; HOLD-06, CANC-01, D-03 to D-07, D-09, D-20, D-24).
//
// The admin cancel route, the manage page and My trips all call cancelBooking. The cancellation POLICY decides what
// happens to the money (lib/cancellation-policy.ts, from the terms the booking was made under), the order is fixed:
//
//   1. checks that write nothing: the booking exists, may be cancelled by this initiator, the client's view of the terms
//      is current (acknowledge), no payment worker holds the row (busy), a per-leg refund amount can be computed;
//   2. the status compare-and-set (advanceBookingStatus, profile cancel-route). A lost race answers conflict and NO
//      money has moved (88 D-20, T-89-26). From here the cancel stands whatever happens next;
//   3. late (outside the free window): a fee case is opened in this same request, before any early return, and the
//      recovery link is retired. The hold, the saved card and money already paid are left exactly as they are (D-07):
//      a late cancel never calls releaseHold and never refunds. A person decides later (D-05);
//   4. in time (free): an uncaptured hold is cancelled at no Stripe cost, a saved card is freed, collected money is
//      refunded, with nobody involved (D-04).
//
// Who cancelled is never defaulted (D-20): admin_prestigo is always free whatever the time; admin_client follows the
// policy and counts as late when the pickup time has passed; client_token cannot cancel at or after pickup, nor an
// on_board trip, and must acknowledge the outcome it was shown. A failed money step keeps the cancel: a refund_failed
// ledger row, an operator alert and a money_failed answer.
//
// Partner bookings get a status change only (assertMoneyEligible, Pitfall 15).

import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { advanceBookingStatus, scheduleCancelRouteEmail, type StatusActor } from '@/lib/booking-status-service'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
import { evaluateCancellation, policyFromSnapshot, proposedFeeMinor, tripFactsFromRow } from '@/lib/cancellation-policy'
import { czkToEur } from '@/lib/currency'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { feeBaseFor, isFeeEligible, openFeeCase } from '@/lib/payments/fee'
import { leaseLapsed, releaseHold } from '@/lib/payments/hold'
import { RECOVERY_LINK_CLEARED, retireRecoveryLink } from '@/lib/payments/recovery-link'
import { appendPaymentEvent, applyTransition, type LedgerActor, type PaymentState } from '@/lib/payments/state'
import { getPaymentsStripe, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'

type BookingRow = Record<string, unknown>

export type CancelInitiator = 'admin_client' | 'admin_prestigo' | 'client_token'

export type CancelResult =
  | {
      kind: 'ok'
      outcome: 'free' | 'late'
      money: 'released' | 'refunded' | 'kept' | 'none'
      refundedMinor?: number
      currency?: 'eur' | 'czk'
      /** The Stripe refund, when money was refunded (the admin route answers it as refund_id). */
      refundId?: string
    }
  | { kind: 'already_cancelled' }
  | { kind: 'busy' }
  | { kind: 'conflict'; currentStatus: string | null }
  | { kind: 'not_cancellable'; status: string }
  | { kind: 'too_late' }
  | { kind: 'policy_changed'; outcome: 'free' | 'late' }
  | { kind: 'money_failed'; amount_minor: number; currency: 'eur' | 'czk' }
  | { kind: 'leg_amount_missing' }
  /** The cancel did not apply, or (cancelled: true) it applied but the late-cancel case could not be opened. */
  | { kind: 'db_failed'; cancelled?: boolean }
  | { kind: 'not_found' }

export interface CancelBookingInput {
  bookingId: string
  /** Pay-now round trips: which leg's amount is refunded or kept (the booking row is that leg's row, D-24). */
  leg?: 'outbound' | 'return'
  initiator: CancelInitiator
  actor: LedgerActor
  /** client_token only: the outcome the client saw and confirmed. A different current outcome cancels nothing. */
  acknowledge?: 'free' | 'late'
  nowMs?: number
}

/**
 * Whether the initiator may cancel a booking in this status. An admin: anything the transition map allows (the terminal
 * statuses completed, cancelled and no_show are refused, D-09). A client (D-03): up to the pickup, also with the driver
 * on the way, but never once the passenger is on board. Derived from the shared vocabulary, no hand-written list.
 */
function statusAllowsCancel(status: string, isClient: boolean): boolean {
  if (!(VALID_TRANSITIONS[status] ?? []).includes('cancelled')) return false
  return !(isClient && status === 'on_board')
}

const BOOKING_COLUMNS =
  'id, status, payment_intent_id, outbound_amount_czk, return_amount_czk, payment_mode, payment_state, ' +
  'payment_currency, payment_amount_minor, booking_reference, booking_source, amount_eur, amount_czk, ' +
  'client_first_name, client_last_name, client_email, origin_address, destination_address, vehicle_class, ' +
  'pickup_date, pickup_time, hold_payment_intent_id, hold_amount_minor, hold_attempts, recovery_link_id, ' +
  'recovery_link_url, captured_amount_minor, payment_lease_until, cancel_policy, cancel_policy_version, trip_type, ' +
  'distance_km, pickup_utc, stripe_payment_method_id'

/** The payment side of the row after the status compare-and-set (88-REVIEW C-WR-01). */
const PAYMENT_COLUMNS =
  'payment_mode, payment_state, payment_currency, payment_amount_minor, payment_intent_id, ' +
  'hold_payment_intent_id, hold_amount_minor, hold_attempts, recovery_link_id, recovery_link_url, ' +
  'captured_amount_minor, payment_lease_until, stripe_payment_method_id'

/** Payment states in which a cancelled card booking holds nothing: the cancel is complete. */
const NOTHING_HELD: ReadonlySet<string> = new Set(['released', 'none', 'cash_settled'])

/** States with a legal self-loop in which a payable recovery link can sit. */
const LINK_STATES: ReadonlySet<string> = new Set(['card_saved', 'failed', 'expired'])

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * 88-REVIEW T4 (C-CR-01): money a card booking already COLLECTED before the trip (the client paid the recovery link
 * of a declined hold: failed -> captured while the status is still confirmed). Cancelling it in time refunds that payment.
 */
function collectedMinor(row: BookingRow): number {
  const captured = num(row.captured_amount_minor) ?? 0
  if (captured > 0) return captured
  return row.payment_state === 'captured' || row.payment_state === 'balance_due' ? (num(row.payment_amount_minor) ?? 0) : 0
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

function isPartner(booking: BookingRow): boolean {
  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
    return false
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) return true
    throw err
  }
}

export async function cancelBooking(input: CancelBookingInput): Promise<CancelResult> {
  const nowMs = input.nowMs ?? Date.now()
  const { bookingId, initiator, actor } = input
  const isClient = initiator === 'client_token'
  const supabase = createSupabaseServiceClient()

  const { data, error: fetchError } = await supabase.from('bookings').select(BOOKING_COLUMNS).eq('id', bookingId).single()
  if (fetchError || !data) return { kind: 'not_found' }
  const booking = data as unknown as BookingRow
  const previousStatus = str(booking.status)
  const partner = isPartner(booking)

  // ── 1. checks that write nothing ──────────────────────────────────────────────────────────────────────────────────
  if (isClient) {
    if (partner) return { kind: 'not_cancellable', status: previousStatus }
    if (previousStatus === 'cancelled') return { kind: 'already_cancelled' }
  }
  if (!statusAllowsCancel(previousStatus, isClient)) return { kind: 'not_cancellable', status: previousStatus }

  // The outcome from the terms the booking was made under (D-18), never today's settings. Cancelled by Prestigo is
  // always free (D-20, T-89-28); an admin cancel for the client after the pickup time counts as late.
  let outcome: 'free' | 'late' = 'free'
  let freeUntilMs: number | null = null
  let pickupMs: number | null = null
  let policyVersion = ''
  if (initiator !== 'admin_prestigo') {
    const policy = policyFromSnapshot(booking.cancel_policy)
    policyVersion = policy.version
    const facts = tripFactsFromRow(
      booking as unknown as Parameters<typeof tripFactsFromRow>[0],
    )
    if (facts) {
      pickupMs = facts.pickupMs
      const evaluated = evaluateCancellation(policy, facts, nowMs)
      freeUntilMs = evaluated.freeUntilMs
      if (evaluated.kind === 'too_late') {
        if (isClient) return { kind: 'too_late' }
        outcome = 'late'
      } else {
        outcome = evaluated.kind
      }
    } else if (isClient) {
      // No pickup instant to measure against: the client page can not promise anything, the operator can.
      return { kind: 'too_late' }
    }
  }

  // T-89-27: the server recomputes; a client who confirmed other terms cancels nothing and learns the current ones.
  if (isClient && input.acknowledge !== outcome) return { kind: 'policy_changed', outcome }

  const mode = str(booking.payment_mode)
  const isHold = mode === 'card_hold' || mode === 'cash_guarantee'
  const refundsPayNow = !partner && !isHold && Boolean(booking.payment_intent_id)

  // D-04: a card booking whose hold is being placed or whose capture is running holds a lease; cancelling now would
  // race that worker. Nothing is written. 88-REVIEW A-WR-06: a hold placement whose lease lapsed (its worker died) no
  // longer blocks the cancel: releaseHold voids what it may have authorized.
  if (
    !partner &&
    isHold &&
    (booking.payment_state === 'capturing' || (booking.payment_state === 'placing_hold' && !leaseLapsed(booking)))
  ) {
    return { kind: 'busy' }
  }

  // The per-leg amount must be computable before any write (D-13, D-24).
  let refundParams: Stripe.RefundCreateParams | null = null
  let legAmountCents: number | null = null
  if (refundsPayNow) {
    refundParams = { payment_intent: booking.payment_intent_id as string }
    if (input.leg) {
      const legAmountCzk = input.leg === 'outbound' ? booking.outbound_amount_czk : booking.return_amount_czk
      const czk = num(legAmountCzk)
      if (czk === null) return { kind: 'leg_amount_missing' }
      legAmountCents = Math.round(czkToEur(czk) * 100)
      refundParams = {
        payment_intent: booking.payment_intent_id as string,
        amount: legAmountCents,
        metadata: { leg: input.leg }, // Phase 27 webhook contract
      }
    }
  }

  const legKey = input.leg ?? 'full'
  const statusActor: StatusActor = isClient
    ? { type: 'system', id: 'client_token' }
    : { type: 'admin', id: actor.id }

  // ── 2. the status compare-and-set, before any money step ──────────────────────────────────────────────────────────
  // D-13: the status write is scoped to the booking id only (inside the service) so a paired leg is untouched. The
  // profile runs no side effects; the client's email follows once the money step succeeded, so a failed refund never
  // promises one.
  const cancelled = await advanceBookingStatus({
    bookingId,
    to: 'cancelled',
    actor: statusActor,
    source: isClient ? 'client_cancel' : 'admin_cancel',
    profile: 'cancel-route',
    current: booking,
    expectedFrom: previousStatus,
  })
  if (!cancelled.ok) {
    if (cancelled.code === 'conflict') {
      if (isClient && cancelled.currentStatus === 'cancelled') return { kind: 'already_cancelled' }
      return { kind: 'conflict', currentStatus: cancelled.currentStatus ?? null }
    }
    if (cancelled.code === 'not_found') return { kind: 'not_found' }
    if (cancelled.code === 'invalid_transition') return { kind: 'not_cancellable', status: previousStatus }
    return { kind: 'db_failed' }
  }

  // T-89-30: who cancelled is on record (the status log has the actor and the source; the payment ledger gets the
  // operator's choice). Best effort: the cancel stands.
  if (!isClient && !partner && (isHold || refundsPayNow)) {
    try {
      await appendPaymentEvent(bookingId, {
        key: `admin:cancel:${bookingId}`,
        kind: 'admin_action',
        errorCode: initiator === 'admin_client' ? 'cancel_client' : 'cancel_prestigo',
        actor,
      })
    } catch {
      console.error('[cancel] admin_action ledger row not written', { bookingId })
    }
  }

  // Partner bookings: the status change was all there was to do.
  if (partner) {
    scheduleCancelRouteEmail(booking, previousStatus, null)
    return { kind: 'ok', outcome, money: 'none' }
  }

  // The cancel applied. From here a money failure never rolls it back: it leaves a refund_failed ledger row and an
  // operator alert instead (D-20).
  const moneyFailed = async (
    err: unknown,
    kind: 'refund' | 'release',
    cardCollected: number | null = null,
  ): Promise<CancelResult> => {
    const code =
      err instanceof Error && ['busy', 'state_moved', 'no_payment_intent'].includes(err.message)
        ? err.message
        : stripeErrorCode(err)
    const { amount_minor, currency } = failedAmount(booking, legAmountCents, isHold, cardCollected)
    console.error('[cancel] money step failed after the cancel applied', { bookingId, kind, code })
    try {
      await appendPaymentEvent(bookingId, {
        key: `refund_failed:${bookingId}:${legKey}`,
        kind: 'refund_failed',
        amountMinor: amount_minor,
        currency,
        errorCode: code,
        actor,
      })
    } catch {
      console.error('[cancel] refund_failed ledger row not written', { bookingId })
    }
    try {
      await sendPaymentOperatorAlert(
        'refund_failed',
        { ...booking, payment_currency: currency },
        {
          eventKey: `alert:refund_failed:${bookingId}:${legKey}`,
          code,
          amountMinor: amount_minor,
          note: kind === 'release' ? 'release' : undefined,
        },
      )
    } catch {
      console.error('[cancel] refund_failed alert not sent', { bookingId })
    }
    return { kind: 'money_failed', amount_minor, currency }
  }

  // C-WR-01: the payment snapshot read above predates the status compare-and-set, and the payment tick may have
  // claimed the row in between (card_saved -> placing_hold). Decide from a fresh read. The hold engine itself refuses
  // to authorize a cancelled booking (status-gated transition, migration 086), so a placement that was in flight voids
  // its own authorization; 'busy' still alerts the operator in case that worker died mid-call.
  let current: BookingRow = booking
  if (isHold) {
    try {
      const { data: fresh, error: freshError } = await supabase
        .from('bookings')
        .select(PAYMENT_COLUMNS)
        .eq('id', bookingId)
        .maybeSingle()
      if (!freshError && fresh) current = { ...booking, ...(fresh as unknown as BookingRow) }
    } catch {
      // Fall back to the snapshot: releaseHold's own compare-and-set still refuses a stale state.
      console.error('[cancel] fresh payment read failed', { bookingId })
    }
  }

  // ── 3. late: the money option stays alive and a person decides (D-05, D-07, D-09) ─────────────────────────────────
  if (outcome === 'late' && isFeeEligible(current)) {
    const base = feeCaseBase(current, input.leg)
    if (!base) {
      console.error('[cancel] late cancel without a computable fee base', { bookingId })
      return { kind: 'db_failed', cancelled: true }
    }
    try {
      const policy = policyFromSnapshot(booking.cancel_policy)
      const { caseRow } = await openFeeCase({
        booking: current,
        kind: 'late_cancel',
        baseMinor: base.baseMinor,
        currency: base.currency,
        proposedMinor: proposedFeeMinor(base.baseMinor, policy.feePercent),
        freeUntilIso: freeUntilMs !== null ? new Date(freeUntilMs).toISOString() : null,
        evidence: {
          initiator,
          policyVersion,
          cancelledMinBeforePickup: pickupMs !== null ? Math.round((pickupMs - nowMs) / 60_000) : null,
        },
        actor,
      })
      await retireLinkForCase(bookingId, current, caseRow.id, actor)
    } catch (err) {
      console.error('[cancel] fee case not opened after a late cancel', {
        bookingId,
        reason: err instanceof Error ? err.message : 'unknown',
      })
      return { kind: 'db_failed', cancelled: true }
    }
    return { kind: 'ok', outcome: 'late', money: 'kept' }
  }

  // ── 4. in time (or nothing a fee can be taken from): release, refund or nothing ───────────────────────────────────
  if (isHold) {
    // T4 (C-CR-01): the card booking already collected money (a paid recovery link before the trip). D-20: the cancel
    // stands; the payment is refunded in full (deterministic key refund:<id>:full, the same key a retry of this cancel
    // would use); a refund that fails leaves the refund_failed row + operator alert.
    const collected = collectedMinor(current)
    if (collected > 0) {
      const paymentIntentId = str(current.payment_intent_id)
      try {
        if (!paymentIntentId) throw new Error('no_payment_intent')
        const refund = await getPaymentsStripe().refunds.create(
          { payment_intent: paymentIntentId },
          { idempotencyKey: stripeKeys.refund(bookingId, legKey) },
        )
        scheduleCancelRouteEmail(booking, previousStatus, 'refund')
        return {
          kind: 'ok',
          outcome,
          money: 'refunded',
          refundedMinor: collected,
          currency: current.payment_currency === 'czk' ? 'czk' : 'eur',
          refundId: refund.id,
        }
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
        return { kind: 'ok', outcome, money: 'released' }
      }
      // noop: fine only when nothing is held any more; never answer ok while a hold or card is still live.
      if (!NOTHING_HELD.has(str(current.payment_state) || 'none')) throw new Error('state_moved')
      scheduleCancelRouteEmail(booking, previousStatus, 'no_charge')
      return { kind: 'ok', outcome, money: 'none' }
    } catch (err) {
      return moneyFailed(err, 'release')
    }
  }

  if (refundParams) {
    try {
      const refund = await getPaymentsStripe().refunds.create(refundParams, {
        idempotencyKey: stripeKeys.refund(bookingId, legKey),
      })
      scheduleCancelRouteEmail(booking, previousStatus, 'refund')
      const refunded = failedAmount(booking, legAmountCents, false)
      return {
        kind: 'ok',
        outcome,
        money: 'refunded',
        refundedMinor: refunded.amount_minor,
        currency: refunded.currency,
        refundId: refund.id,
      }
    } catch (err) {
      return moneyFailed(err, 'refund')
    }
  }

  // Manual booking, or a pay-now booking nothing was paid for: the status change was all there was to do.
  scheduleCancelRouteEmail(booking, previousStatus, null)
  return { kind: 'ok', outcome, money: 'none' }
}

/**
 * The amount a late-cancel case is a share of. Money already collected on a card row (captured / balance_due) is the
 * base (what the client paid), otherwise the booking amount (feeBaseFor: the row's own amount, or the leg amount of a
 * pay-now round trip, D-24).
 */
function feeCaseBase(
  row: BookingRow,
  leg: 'outbound' | 'return' | undefined,
): { baseMinor: number; currency: 'eur' | 'czk' } | null {
  const state = str(row.payment_state)
  if ((row.payment_mode === 'card_hold' || row.payment_mode === 'cash_guarantee') && (state === 'captured' || state === 'balance_due')) {
    const collected = collectedMinor(row)
    if (collected > 0) return { baseMinor: collected, currency: row.payment_currency === 'czk' ? 'czk' : 'eur' }
  }
  return feeBaseFor(row, leg)
}

/**
 * A late-cancelled row in a state that can still hold a payable recovery link (a failed hold): drop the link columns in
 * one self-loop transition keyed by the case, then deactivate the Stripe link. The email of that link says "pay to
 * confirm your booking", which is wrong for a cancelled booking. A failure here never undoes the case (a payment that
 * still slips through is refunded by the recovery webhook).
 */
async function retireLinkForCase(
  bookingId: string,
  current: BookingRow,
  caseId: string,
  actor: LedgerActor,
): Promise<void> {
  const state = str(current.payment_state)
  if (!LINK_STATES.has(state)) return
  if (!str(current.recovery_link_id) && !str(current.recovery_link_url)) return
  try {
    const moved = await applyTransition({
      bookingId,
      from: [state as PaymentState],
      to: state as PaymentState,
      patch: { ...RECOVERY_LINK_CLEARED },
      event: { key: `fee_link_retired:${caseId}`, kind: 'fee_opened', actor },
    })
    if (moved.applied || moved.duplicate) await retireRecoveryLink({ ...current, id: bookingId })
  } catch {
    console.error('[cancel] recovery link not retired', { bookingId })
  }
}
