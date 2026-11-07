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

import { after } from 'next/server'
import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import {
  advanceBookingStatus,
  scheduleCancelRouteEmail,
  type CancelNotice,
  type StatusActor,
} from '@/lib/booking-status-service'
import { getAcceptedDriver, sendDriverCancelledEmail } from '@/lib/email'
import { logEmail } from '@/lib/email-log'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
import { evaluateCancellation, policyFromSnapshot, proposedFeeMinor, tripFactsFromRow } from '@/lib/cancellation-policy'
import { czkToEur } from '@/lib/currency'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { feeBaseNow, isFeeEligible, openFeeCase } from '@/lib/payments/fee'
import { leaseLapsed, releaseHold } from '@/lib/payments/hold'
import { loadPayNowFacts, resolvePayNowSplit, type PayNowFacts, type PayNowSplit } from '@/lib/payments/pay-now'
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
  'distance_km, pickup_utc, stripe_payment_method_id, locale, capture_before, leg'

/** The payment side of the row after the status compare-and-set (88-REVIEW C-WR-01). */
const PAYMENT_COLUMNS =
  'payment_mode, payment_state, payment_currency, payment_amount_minor, payment_intent_id, ' +
  'hold_payment_intent_id, hold_amount_minor, hold_attempts, recovery_link_id, recovery_link_url, ' +
  'captured_amount_minor, payment_lease_until, stripe_payment_method_id'

/** Payment states in which a cancelled card booking holds nothing: the cancel is complete. */
const NOTHING_HELD: ReadonlySet<string> = new Set(['released', 'none'])

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
 *   pay-now refund    -> what the PaymentIntent still holds for this row, in its currency (CR-01). Only when Stripe could
 *                        not be read at all: the row's EUR figure, an estimate for the operator.
 */
function failedAmount(
  booking: BookingRow,
  legAmountCents: number | null,
  isHold: boolean,
  cardCollectedMinor: number | null = null,
  payNow: PayNowFacts | null = null,
): { amount_minor: number; currency: 'eur' | 'czk' } {
  if (payNow) return { amount_minor: payNow.collectedMinor, currency: payNow.currency }
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

/** What the notices after a cancel need to know; set by runCancel once the status change applied. */
interface AppliedCancel {
  booking: BookingRow
  outcome: 'free' | 'late'
  freeUntilMs: number | null
  /** The fee the late-cancel case proposes (minor units), when it could be computed. */
  proposedMinor: number | null
}

export async function cancelBooking(input: CancelBookingInput): Promise<CancelResult> {
  const holder: { applied: AppliedCancel | null } = { applied: null }
  const result = await runCancel(input, holder)
  if (holder.applied) scheduleCancelNotices(input, holder.applied, result)
  return result
}

/** The client's cancelled email for a free path (the late path builds its own notice). */
function freeNotice(initiator: CancelInitiator, money: CancelNotice['moneyOutcome'], refundMinor?: number): CancelNotice {
  return {
    variant: initiator === 'admin_prestigo' ? 'by_prestigo' : 'free',
    moneyOutcome: money,
    ...(refundMinor !== undefined ? { refundMinor } : {}),
  }
}

/**
 * Everyone who must know about a cancel that applied, besides the client's mail (sent inline by runCancel):
 *   - the assigned driver, at once, on every path (D-03; the trip is cancelled whatever happens to the money);
 *   - the operator: a late cancel (decision needed), a late cancel whose case could not be opened (the orphan of plan
 *     89-08: without this alert nobody would ever see it), every other cancel by the client (client_cancelled, flagged late
 *     when no fee could be taken: a group-paid trip dropped late must reach the office too).
 * All of it runs after the response, each part isolated: a failed email never changes the result of a cancel.
 */
function scheduleCancelNotices(input: CancelBookingInput, applied: AppliedCancel, result: CancelResult): void {
  const nowMs = input.nowMs ?? Date.now()
  const { booking } = applied
  const bookingId = input.bookingId
  const isClient = input.initiator === 'client_token'

  const alerts: Array<() => Promise<unknown>> = []
  const detailsBase = {
    cancelledAt: new Date(nowMs).toISOString(),
    freeUntil: applied.freeUntilMs !== null ? new Date(applied.freeUntilMs).toISOString() : null,
    ...(applied.proposedMinor !== null ? { proposedMinor: applied.proposedMinor } : {}),
  }
  if (result.kind === 'ok' && result.money === 'kept') {
    alerts.push(() =>
      sendPaymentOperatorAlert('fee_decision_needed', booking, {
        eventKey: `alert:fee_decision_needed:${bookingId}`,
        ...detailsBase,
      }),
    )
  } else if (result.kind === 'db_failed' && result.cancelled) {
    // The cancel stands but its fee case does not exist: say so, the case is never opened on its own.
    alerts.push(() =>
      sendPaymentOperatorAlert('fee_decision_needed', booking, {
        eventKey: `alert:fee_decision_needed:${bookingId}:case_missing`,
        note: 'case_missing',
        ...detailsBase,
      }),
    )
  } else if (result.kind === 'ok' && isClient) {
    alerts.push(() =>
      sendPaymentOperatorAlert('client_cancelled', booking, {
        eventKey: `alert:client_cancelled:${bookingId}`,
        moneyOutcome: result.money === 'released' ? 'released' : result.money === 'refunded' ? 'refunded' : 'none',
        ...(result.outcome === 'late' ? { late: true } : {}),
        ...(result.money === 'refunded' && result.refundedMinor !== undefined ? { amountMinor: result.refundedMinor } : {}),
      }),
    )
  }

  try {
    after(async () => {
      const driverPart = async () => {
        try {
          await notifyAssignedDriver(bookingId, booking, input.initiator === 'admin_prestigo' ? 'prestigo' : 'client')
        } catch (err) {
          console.error('[cancel] driver notice failed', { bookingId, reason: err instanceof Error ? err.message : 'unknown' })
        }
      }
      const alertPart = async (send: () => Promise<unknown>) => {
        try {
          await send()
        } catch (err) {
          console.error('[cancel] operator alert failed', { bookingId, reason: err instanceof Error ? err.message : 'unknown' })
        }
      }
      await Promise.all([driverPart(), ...alerts.map(alertPart)])
    })
  } catch (err) {
    console.error('[cancel] notices not scheduled', { bookingId, reason: err instanceof Error ? err.message : 'unknown' })
  }
}

/**
 * The accepted driver of the booking gets one plain email "Trip cancelled" (D-03, T-89-29): the reference, the pickup
 * time and the trip link. Nothing about money and nothing about the client beyond the reference. No accepted driver,
 * no mail. Deduped with the email log.
 */
async function notifyAssignedDriver(bookingId: string, booking: BookingRow, cancelledBy: 'client' | 'prestigo'): Promise<void> {
  const { data, error } = await createSupabaseServiceClient()
    .from('driver_assignments')
    .select('status, trip_token, drivers!inner(name, email, vehicle_info)')
    .eq('booking_id', bookingId)
    .eq('status', 'accepted')
  if (error) throw new Error('driver lookup failed')
  const assignments = (data ?? []) as unknown as Array<{ status: string; trip_token?: string | null; drivers?: unknown }>
  const driver = getAcceptedDriver(assignments)
  if (!driver?.email) return

  const accepted = assignments.find((a) => a.status === 'accepted')
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com').trim().replace(/\/+$/, '')
  const tripUrl = accepted?.trip_token ? `${siteUrl}/driver/trip/${accepted.trip_token}` : null

  const allowed = await logEmail({ bookingId, emailType: 'driver_cancelled', recipient: driver.email })
  if (!allowed) return
  await sendDriverCancelledEmail({
    driverEmail: driver.email,
    bookingReference: str(booking.booking_reference),
    pickupDate: str(booking.pickup_date),
    pickupTime: str(booking.pickup_time),
    tripUrl,
    cancelledBy,
  })
}

async function runCancel(input: CancelBookingInput, holder: { applied: AppliedCancel | null }): Promise<CancelResult> {
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
  // An unpaid row carries the PaymentIntent of a checkout nobody finished: there is nothing to refund or to keep. The row
  // has to have left `unpaid` before its intent counts as money (the PaymentIntent itself is still read below).
  const refundsPayNow = !partner && !isHold && Boolean(booking.payment_intent_id) && previousStatus !== 'unpaid'

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

  // D-24, CR-02: which part of the payment this row stands for is the server's to know, from the row and the shared
  // PaymentIntent, for every initiator. It must be known before any write (D-13): a guess here refunds both legs.
  let split: PayNowSplit | null = null
  let legAmountCents: number | null = null
  if (refundsPayNow) {
    try {
      const resolved = await resolvePayNowSplit(booking)
      if (resolved === 'leg_amount_missing') return { kind: 'leg_amount_missing' }
      split = resolved
    } catch {
      console.error('[cancel] sibling lookup failed, nothing was changed', { bookingId })
      return { kind: 'db_failed' }
    }
    const legCzk = split.leg === 'outbound' ? split.outboundCzk : split.leg === 'return' ? split.returnCzk : null
    if (legCzk !== null) legAmountCents = Math.round(czkToEur(legCzk) * 100)
  }

  const legKey = split?.leg ?? 'full'
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

  // CR-01: pay-now money facts come from the PaymentIntent, read only now: a Stripe outage must never stop a cancel.
  let payNow: PayNowFacts | null = null
  let payNowError: unknown = null
  if (refundsPayNow) {
    try {
      payNow = await loadPayNowFacts(booking, split ?? undefined)
    } catch (err) {
      payNowError = err
      console.error('[cancel] payment could not be read after the cancel applied', { bookingId })
    }
  }
  // A pay-now row has no payment_currency: every mail and alert below speaks the currency that was paid.
  const moneyRow: BookingRow = payNow ? { ...booking, payment_currency: payNow.currency } : booking

  // From here the cancel stands and the notices after it are due, whatever happens to the money.
  const applied: AppliedCancel = { booking: moneyRow, outcome, freeUntilMs, proposedMinor: null }
  holder.applied = applied

  // Partner bookings: the status change was all there was to do.
  if (partner) {
    scheduleCancelRouteEmail(booking, previousStatus, freeNotice(initiator, 'none'))
    return { kind: 'ok', outcome, money: 'none' }
  }

  // The cancel applied. From here a money failure never rolls it back: it leaves a refund_failed ledger row and an
  // operator alert instead (D-20).
  const moneyFailed = async (
    err: unknown,
    kind: 'refund' | 'release' | 'cash',
    cardCollected: number | null = null,
  ): Promise<CancelResult> => {
    const code =
      err instanceof Error && ['busy', 'state_moved', 'no_payment_intent', 'cash_settled'].includes(err.message)
        ? err.message
        : stripeErrorCode(err)
    const { amount_minor, currency } = failedAmount(booking, legAmountCents, isHold, cardCollected, payNow)
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
          note: kind === 'release' ? 'release' : kind === 'cash' ? 'cash_settled' : undefined,
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
  // Pay-now: nothing paid, or everything already back, means there is nothing a fee could be kept from.
  const payNowEmpty = refundsPayNow && payNow !== null && payNow.collectedMinor <= 0
  if (outcome === 'late' && isFeeEligible(current) && !payNowEmpty) {
    // The client is told it was a late cancel whether or not the case could be opened: the operator hears about a
    // missing case through the alert scheduleCancelNotices sends for db_failed { cancelled: true }.
    const lateNotice = (): CancelNotice => ({
      variant: 'late',
      moneyOutcome: 'none',
      ...(applied.proposedMinor !== null ? { feeMinor: applied.proposedMinor } : {}),
      freeUntilMs,
    })
    const base = refundsPayNow
      ? payNow && { baseMinor: payNow.collectedMinor, currency: payNow.currency }
      : await feeBaseNow(current)
    if (!base) {
      console.error('[cancel] late cancel without a computable fee base', { bookingId })
      scheduleCancelRouteEmail(moneyRow, previousStatus, lateNotice())
      return { kind: 'db_failed', cancelled: true }
    }
    try {
      const policy = policyFromSnapshot(booking.cancel_policy)
      applied.proposedMinor = proposedFeeMinor(base.baseMinor, policy.feePercent)
      const { caseRow } = await openFeeCase({
        booking: current,
        kind: 'late_cancel',
        baseMinor: base.baseMinor,
        currency: base.currency,
        proposedMinor: applied.proposedMinor,
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
      scheduleCancelRouteEmail(moneyRow, previousStatus, lateNotice())
      return { kind: 'db_failed', cancelled: true }
    }
    scheduleCancelRouteEmail(moneyRow, previousStatus, lateNotice())
    return { kind: 'ok', outcome: 'late', money: 'kept' }
  }

  // ── 4. in time (or nothing a fee can be taken from): release, refund or nothing ───────────────────────────────────
  if (isHold) {
    // Money WR-10: the cash was recorded before the trip (CASH_TRIP_STATUSES allows it) and the booking is now off. Stripe
    // holds none of it, so only a person can give it back: the same trail as a refund that failed, and no mail that says
    // nothing was taken.
    if (current.payment_state === 'cash_settled') {
      return moneyFailed(new Error('cash_settled'), 'cash', num(current.payment_amount_minor) ?? 0)
    }

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
        scheduleCancelRouteEmail(booking, previousStatus, freeNotice(initiator, 'refunded', collected))
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
        scheduleCancelRouteEmail(booking, previousStatus, freeNotice(initiator, 'released'))
        return { kind: 'ok', outcome, money: 'released' }
      }
      // noop: fine only when nothing is held any more; never answer ok while a hold or card is still live.
      if (!NOTHING_HELD.has(str(current.payment_state) || 'none')) throw new Error('state_moved')
      scheduleCancelRouteEmail(booking, previousStatus, freeNotice(initiator, 'none'))
      return { kind: 'ok', outcome, money: 'none' }
    } catch (err) {
      return moneyFailed(err, 'release')
    }
  }

  if (refundsPayNow && !payNowEmpty) {
    try {
      if (!payNow) throw payNowError
      // One row owns the payment: refund what is left of it. A leg: exactly its share, tagged (Phase 27 webhook contract).
      const params: Stripe.RefundCreateParams = payNow.leg
        ? { payment_intent: payNow.paymentIntentId, amount: payNow.collectedMinor, metadata: { leg: payNow.leg } }
        : { payment_intent: payNow.paymentIntentId }
      const refund = await getPaymentsStripe().refunds.create(params, {
        idempotencyKey: stripeKeys.refund(bookingId, legKey),
      })
      const refunded = failedAmount(booking, legAmountCents, false, null, payNow)
      scheduleCancelRouteEmail(moneyRow, previousStatus, freeNotice(initiator, 'refunded', refunded.amount_minor))
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
  scheduleCancelRouteEmail(booking, previousStatus, freeNotice(initiator, 'none'))
  return { kind: 'ok', outcome, money: 'none' }
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
