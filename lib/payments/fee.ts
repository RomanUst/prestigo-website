// Late-cancel / no-show fee cases and the two person-triggered charges of Phase 89 (plan 89-06; CASH-03, HOLD-06,
// D-10, D-14, D-21, Research Pattern 4, Pitfalls 6 and 15).
//
// This file is the ONLY writer of booking_fee_cases. It never writes payment_state and never calls Stripe: every
// cent is collected by settleBooking (lib/payments/settle.ts) with opts.collect, through its CAS claim. What lives
// here is the case itself and the rules around the amount:
//
//   - the amount is chosen by a person and LOCKED on the case row at the first charge click (decided_minor +
//     charge_requested_at). A second request with another amount while a charge is in flight answers amount_locked;
//     the same amount is allowed (a retry after a transient error replays the same Stripe key);
//   - the Stripe keys of a fee derive from the case id and the attempt, never from the amount (stripeKeys.feeCapture /
//     feeCharge), so a retry can neither double charge nor loop on a reused key (T-89-18, T-89-19);
//   - a definitive decline unlocks the amount and advances the attempt (settle does that in its failure transition), so
//     the next click is a new, deliberate charge. Nothing is ever charged again without a person (no automatic retry);
//   - free text (reason, contact note) lives on the deny-all case row, never in the append-only ledger (T-89-22);
//   - the operator action is on record first: an admin_action ledger row with a short code, before anything else
//     (T-89-21). The decision (decided_by, decided_at) is stamped on the case when the money is collected.
//
// Partner bookings never reach any of this: assertMoneyEligible comes first (Pitfall 15). bookings.fee_case_status is
// a database trigger mirror of the case status; no code here touches it.
//
// Plan 89-12 adds the two decisions that move money without the single collector:
//   - waiveFee            the operator forgives the fee: a live hold or saved card is released, money already collected is
//                         refunded in full, the case becomes waived with the operator's reason (D-05, D-07);
//   - chargeFromCollected the operator keeps a fee out of money ALREADY collected (a pay-now booking, or a card booking that
//                         was captured): nothing is charged again, the rest is refunded (D-07).
// Both refund through one deterministic Stripe key, refund:<bookingId>:fee:<caseId>, so a retry replays. A refund that
// fails leaves a refund_failed ledger row and an operator alert, and the case stays pending (D-20).
//
// The money of a decision is what Stripe still holds at that moment, never what the case or the row remembers: a refund
// made by hand in the Dashboard (or an earlier attempt whose answer was lost) lowers it, so a repeat can not refund on top
// of it. After a definitive refund failure the lock is released, so the operator can waive or choose another amount; it
// stays only while the request may still have executed (a transient error) and lapses after the lease. When the money was
// settled outside the site, closeAfterManualRefund ends the case with no Stripe call and a note (money CR-04).

import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { czkToEur } from '@/lib/currency'
import { sendPaymentOperatorAlert } from '@/lib/payments/alerts'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { releaseHold } from '@/lib/payments/hold'
import { listPaymentRefunds, loadPayNowFacts, type PaymentLeg } from '@/lib/payments/pay-now'
import { settleBooking, type SettleResult } from '@/lib/payments/settle'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
import { classifyStripeError, getPaymentsStripe, isNotTheClientsFault, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'

type BookingRow = Record<string, unknown>

export type FeeKind = 'late_cancel' | 'no_show'
export type FeeCaseStatus = 'pending' | 'charged' | 'waived'
export type FeeCurrency = 'eur' | 'czk'

/** A row of booking_fee_cases (migration 087). */
export interface FeeCaseRow {
  id: string
  booking_id: string
  kind: FeeKind
  status: FeeCaseStatus
  currency: FeeCurrency
  base_minor: number
  proposed_minor: number
  decided_minor: number | null
  charge_requested_at: string | null
  free_until: string | null
  evidence: Record<string, unknown>
  reason: string | null
  contact_note: string | null
  opened_at: string
  opened_by: string | null
  decided_at: string | null
  decided_by: string | null
}

export type FeeChargeError = 'amount_locked' | 'payment_busy' | 'action_not_allowed'
export type FeeChargeResult = { outcome: 'ok' | 'declined' } | { error: FeeChargeError }

const TABLE = 'booking_fee_cases'
const REASON_MAX = 500
const NOTE_MAX = 1000
/** error_code of the admin_action ledger row that closes the refund failures before it (88-REVIEW C-WR-05). */
export const REFUND_RESOLVED = 'refund_resolved'
/** No request holding the amount lock outlives its lease (lib/payments/stripe.ts sizes it for the longest Stripe chain). */
const FEE_LOCK_LIVE_MS = LEASE_SECONDS * 1000

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const isMinor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const currencyOf = (v: unknown): FeeCurrency | null => (v === 'eur' || v === 'czk' ? v : null)
/** decided_by / opened_by columns hold at most 64 characters. */
const actorLabel = (actor: LedgerActor): string => (actor.id ?? actor.type).slice(0, 64)

/** True when the booking is a partner booking (or its source says nothing money may touch). */
function isPartner(booking: BookingRow): boolean {
  try {
    assertMoneyEligible({ booking_source: typeof booking.booking_source === 'string' ? booking.booking_source : null })
    return false
  } catch (err) {
    if (err instanceof PartnerBookingMoneyError) return true
    throw err
  }
}

/** The trip is over (same fact settle uses): status completed, or the durable completed_at on a row that moved on. */
function tripCompleted(b: BookingRow): boolean {
  if (b.status === 'completed') return true
  if (b.status === 'cancelled' || b.status === 'no_show') return false
  return typeof b.completed_at === 'string' && b.completed_at.length > 0
}

/**
 * Whether a fee can be taken at all: a saved card or a live hold on a card_hold / cash_guarantee row, or money
 * already collected (pay-now with a payment intent, or a card row that was captured). Never for a partner booking.
 */
export function isFeeEligible(booking: BookingRow): boolean {
  if (isPartner(booking)) return false
  const mode = booking.payment_mode
  const state = str(booking.payment_state)
  // An unpaid row has a PaymentIntent from the moment its checkout started, and no money behind it.
  if (mode === 'pay_now') return str(booking.payment_intent_id) !== '' && booking.status !== 'unpaid'
  if (mode !== 'card_hold' && mode !== 'cash_guarantee') return false
  if (state === 'captured' || state === 'balance_due') return true
  // Nothing saved yet, already released, or settled in cash: there is no card to take a fee from.
  if (state === '' || state === 'none' || state === 'checkout_pending' || state === 'released' || state === 'cash_settled') {
    return false
  }
  return str(booking.stripe_payment_method_id) !== '' || str(booking.hold_payment_intent_id) !== ''
}

/**
 * The amount a fee is a share of, from the row alone, and its currency. Card and cash rows: the row's own
 * payment_amount_minor in its payment_currency, which is the real figure. Pay-now: only an ESTIMATE in EUR cents (the leg
 * amount when a leg is given, else amount_eur) for a page that can not read Stripe: a pay-now case is never opened from
 * it, the PaymentIntent decides (lib/payments/pay-now.ts). Null when the facts are missing.
 */
export function feeBaseFor(
  booking: BookingRow,
  leg?: 'outbound' | 'return',
): { baseMinor: number; currency: FeeCurrency } | null {
  const mode = booking.payment_mode
  if (mode === 'card_hold' || mode === 'cash_guarantee') {
    const currency = currencyOf(booking.payment_currency)
    return isMinor(booking.payment_amount_minor) && currency ? { baseMinor: booking.payment_amount_minor, currency } : null
  }
  if (leg) {
    const czk = num(leg === 'outbound' ? booking.outbound_amount_czk : booking.return_amount_czk)
    if (czk === null || czk <= 0) return null
    const baseMinor = Math.round(czkToEur(czk) * 100)
    return baseMinor > 0 ? { baseMinor, currency: 'eur' } : null
  }
  const eur = num(booking.amount_eur)
  if (eur === null || eur <= 0) return null
  const baseMinor = Math.round(eur * 100)
  return baseMinor > 0 ? { baseMinor, currency: 'eur' } : null
}

/**
 * The base of a new case as it is now. Pay-now: this row's share of what the PaymentIntent received, minus what went back,
 * in its currency (CR-01, CR-03); null when nothing is left to keep. Card and cash rows: what was collected (captured or
 * balance_due), else the row amount. Throws when Stripe can not be read.
 */
export async function feeBaseNow(booking: BookingRow): Promise<{ baseMinor: number; currency: FeeCurrency } | null> {
  if (booking.payment_mode !== 'pay_now') {
    const state = str(booking.payment_state)
    const currency = currencyOf(booking.payment_currency)
    const captured = num(booking.captured_amount_minor) ?? 0
    const collected = state === 'captured' || state === 'balance_due' ? captured || (num(booking.payment_amount_minor) ?? 0) : 0
    return collected > 0 && currency ? { baseMinor: collected, currency } : feeBaseFor(booking)
  }
  const facts = await loadPayNowFacts(booking)
  return facts.collectedMinor > 0 ? { baseMinor: facts.collectedMinor, currency: facts.currency } : null
}

export async function loadFeeCase(bookingId: string): Promise<FeeCaseRow | null> {
  const { data, error } = await createSupabaseServiceClient().from(TABLE).select('*').eq('booking_id', bookingId).maybeSingle()
  if (error) throw new Error('fee case lookup failed')
  return (data as FeeCaseRow | null) ?? null
}

async function loadFeeCaseById(caseId: string): Promise<FeeCaseRow | null> {
  const { data, error } = await createSupabaseServiceClient().from(TABLE).select('*').eq('id', caseId).maybeSingle()
  if (error) throw new Error('fee case lookup failed')
  return (data as FeeCaseRow | null) ?? null
}

/**
 * Open the one case of a booking (idempotent on booking_id) and record fee_opened:<caseId> in the ledger. A second call
 * for the same booking returns the existing case with created:false; the ledger row is (re)appended either way, its key
 * makes that a no-op, and it heals a crash between the insert and the append.
 */
export async function openFeeCase(input: {
  booking: BookingRow
  kind: FeeKind
  baseMinor: number
  currency: FeeCurrency
  proposedMinor: number
  freeUntilIso?: string | null
  /** Short facts only (timestamps, thresholds, counts). Never a message from the client. */
  evidence?: Record<string, unknown>
  actor: LedgerActor
}): Promise<{ caseRow: FeeCaseRow; created: boolean }> {
  const { booking, kind, baseMinor, currency, proposedMinor, actor } = input
  if (isPartner(booking)) throw new PartnerBookingMoneyError()
  const bookingId = str(booking.id)
  if (!bookingId) throw new Error('fee case needs a booking id')
  if (!isMinor(baseMinor) || !isMinor(proposedMinor) || proposedMinor > baseMinor) throw new Error('invalid fee case amounts')

  const db = createSupabaseServiceClient()
  let caseRow: FeeCaseRow | null = null
  let created = false
  const { data, error } = await db
    .from(TABLE)
    .insert({
      booking_id: bookingId,
      kind,
      currency,
      base_minor: baseMinor,
      proposed_minor: proposedMinor,
      free_until: input.freeUntilIso ?? null,
      evidence: input.evidence ?? {},
      opened_by: actorLabel(actor),
    })
    .select('*')
    .single()
  if (!error && data) {
    caseRow = data as FeeCaseRow
    created = true
  } else if ((error as { code?: string } | null)?.code === '23505') {
    caseRow = await loadFeeCase(bookingId)
  }
  if (!caseRow) throw new Error('fee case open failed')

  await appendPaymentEvent(bookingId, {
    key: `fee_opened:${caseRow.id}`,
    kind: 'fee_opened',
    amountMinor: caseRow.proposed_minor,
    currency: caseRow.currency,
    // A short code only: the kind of case. Evidence and notes stay on the case row.
    errorCode: caseRow.kind,
    actor,
  })
  return { caseRow, created }
}

/**
 * Lock the amount of a charge on the case (D-14). One conditional update that wins only while the case is pending and no
 * charge is in flight; the same amount again is allowed (retry after a transient error), another amount answers
 * amount_locked, and a decided case answers action_not_allowed. Reason and contact note are stored on the case row only.
 */
export async function lockFeeAmount(
  caseId: string,
  amountMinor: number,
  opts: { reason?: string; contactNote?: string } = {},
): Promise<'locked' | 'amount_locked' | 'action_not_allowed'> {
  const current = await loadFeeCaseById(caseId)
  if (!current || current.status !== 'pending') return 'action_not_allowed'
  if (!isMinor(amountMinor) || amountMinor > current.base_minor) return 'action_not_allowed'

  const patch: Record<string, unknown> = { decided_minor: amountMinor, charge_requested_at: new Date().toISOString() }
  if (opts.reason !== undefined) patch.reason = opts.reason.slice(0, REASON_MAX)
  if (opts.contactNote !== undefined) patch.contact_note = opts.contactNote.slice(0, NOTE_MAX)

  const db = createSupabaseServiceClient()
  // Twice at most: a lock released between the failed update and the read below is simply taken on the second pass.
  for (let pass = 0; pass < 2; pass += 1) {
    const { data, error } = await db
      .from(TABLE)
      .update(patch)
      .eq('id', caseId)
      .eq('status', 'pending')
      .is('charge_requested_at', null)
      .select('id')
    if (error) throw new Error('fee amount lock failed')
    if (Array.isArray(data) && data.length > 0) return 'locked'

    const now = await loadFeeCaseById(caseId)
    if (!now || now.status !== 'pending') return 'action_not_allowed'
    if (now.charge_requested_at) return now.decided_minor === amountMinor ? 'locked' : 'amount_locked'
  }
  return 'amount_locked'
}

/** Release the lock after a definitive failure (or a refused charge): the next click may choose another amount. */
export async function unlockFeeAmount(caseId: string): Promise<void> {
  const { error } = await createSupabaseServiceClient()
    .from(TABLE)
    .update({ charge_requested_at: null })
    .eq('id', caseId)
    .eq('status', 'pending')
  if (error) throw new Error('fee amount unlock failed')
}

/** True while the request that took the amount lock may still be running. */
export function feeLockIsLive(caseRow: Pick<FeeCaseRow, 'charge_requested_at'>, nowMs: number = Date.now()): boolean {
  if (!caseRow.charge_requested_at) return false
  const since = nowMs - Date.parse(caseRow.charge_requested_at)
  return !(since >= FEE_LOCK_LIVE_MS)
}

/**
 * Release a lock nobody can still be working under: its lease time passed and no worker holds the row (a request that
 * crashed, or a transient answer nobody repeated). A row in `capturing` is left alone: the tick finishes that charge.
 * Conditional on the same lock, so a click that re-took it meanwhile keeps it. True when no lock remains.
 */
async function freeStaleLock(caseId: string, booking: BookingRow): Promise<boolean> {
  const current = await loadFeeCaseById(caseId)
  if (!current?.charge_requested_at) return true
  if (booking.payment_state === 'capturing' || feeLockIsLive(current)) return false
  const { data, error } = await createSupabaseServiceClient()
    .from(TABLE)
    .update({ charge_requested_at: null })
    .eq('id', caseId)
    .eq('status', 'pending')
    .eq('charge_requested_at', current.charge_requested_at)
    .select('id')
  if (error) throw new Error('fee amount unlock failed')
  return Array.isArray(data) && data.length > 0
}

/**
 * pending -> charged, stamping who decided and when. Conditional on pending, so a replay changes nothing (returns false).
 * `decidedMinor` is stored only when given (the amount actually collected).
 */
export async function markFeeCharged(caseId: string, input: { decidedBy: string; decidedMinor?: number }): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from(TABLE)
    .update({
      status: 'charged',
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy.slice(0, 64),
      ...(input.decidedMinor !== undefined ? { decided_minor: input.decidedMinor } : {}),
    })
    .eq('id', caseId)
    .eq('status', 'pending')
    .select('id')
  if (error) throw new Error('fee case close failed')
  return Array.isArray(data) && data.length > 0
}

/**
 * pending -> waived. Conditional on pending AND on no charge being in flight: a waive can never race a charge that
 * already took the amount lock.
 */
export async function markFeeWaived(
  caseId: string,
  input: { decidedBy: string; reason?: string; contactNote?: string },
): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from(TABLE)
    .update({
      status: 'waived',
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy.slice(0, 64),
      ...(input.reason !== undefined ? { reason: input.reason.slice(0, REASON_MAX) } : {}),
      ...(input.contactNote !== undefined ? { contact_note: input.contactNote.slice(0, NOTE_MAX) } : {}),
    })
    .eq('id', caseId)
    .eq('status', 'pending')
    .is('charge_requested_at', null)
    .select('id')
  if (error) throw new Error('fee case waive failed')
  return Array.isArray(data) && data.length > 0
}

async function loadBooking(bookingId: string, fallback: BookingRow): Promise<BookingRow> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('*').eq('id', bookingId).maybeSingle()
  return !error && data ? (data as BookingRow) : fallback
}

/**
 * Send the receipt once (the ledger event key makes a replay a no-op). A mail problem never undoes collected money.
 */
async function sendReceipt(args: Parameters<typeof sendPaymentEmail>[0]): Promise<void> {
  let result: Awaited<ReturnType<typeof sendPaymentEmail>> | 'threw' = 'threw'
  try {
    result = await sendPaymentEmail(args)
  } catch {
    // reported below
  }
  if (result === 'threw' || result === 'failed') {
    console.error('[fee] receipt email failed', { bookingId: str(args.booking.id), kind: args.kind })
  }
}

/**
 * What a fee receipt needs from the case itself. The stored policy can not answer it: a pay-now row has no amount for the
 * policy box and a booking made before the policy went public has no stored policy, so the render would fail and the client
 * would be charged with no mail (money WR-01).
 */
export function feeReceiptTerms(caseRow: FeeCaseRow): { freeUntil?: string; waitMin?: number } {
  const wait = caseRow.evidence?.threshold_min
  return {
    ...(caseRow.free_until ? { freeUntil: caseRow.free_until } : {}),
    ...(typeof wait === 'number' && wait > 0 ? { waitMin: wait } : {}),
  }
}

/**
 * Charge the amount a person chose for a fee case. Order: the operator action on record first (T-89-21), then the
 * amount lock, then the single collector. Answers:
 *   ok               the money is collected (partial capture of the hold, or the saved card) and the case is charged
 *   declined         a definitive decline: the case stays pending and unlocked, the recovery link, the fee mail and the
 *                    operator alert were handled by the failure step of settle; no automatic retry exists
 *   payment_busy     another request holds the row, or Stripe answered transiently: the lock stays, the same click may be
 *                    repeated and replays the same Stripe key
 *   amount_locked    a charge for another amount is still in flight
 *   action_not_allowed  partner booking, decided case, a booking the policy does not allow, or an invalid amount
 */
export async function runFeeCharge(input: {
  booking: BookingRow
  caseRow: FeeCaseRow
  amountMinor: number
  actor: LedgerActor
  reason?: string
  contactNote?: string
}): Promise<FeeChargeResult> {
  const { booking, caseRow, amountMinor, actor } = input
  const bookingId = str(booking.id)
  const caseId = caseRow.id
  if (!bookingId || caseRow.booking_id !== bookingId || isPartner(booking)) return { error: 'action_not_allowed' }

  // T-89-21: on record before anything can fail.
  await appendPaymentEvent(bookingId, {
    key: `admin:fee_charge:${caseId}:${Date.now()}:${randomUUID().slice(0, 8)}`,
    kind: 'admin_action',
    errorCode: 'fee_charge',
    ...(isMinor(amountMinor) ? { amountMinor } : {}),
    currency: caseRow.currency,
    actor,
  })

  await freeStaleLock(caseId, await loadBooking(bookingId, booking))
  const lock = await lockFeeAmount(caseId, amountMinor, { reason: input.reason, contactNote: input.contactNote })
  if (lock !== 'locked') return { error: lock }

  const feeLabel = caseRow.kind === 'no_show' ? 'no_show' : 'cancellation'
  const result: SettleResult = await settleBooking(bookingId, actor, {
    collect: { kind: 'fee', caseId, amountMinor, feeLabel },
  })

  switch (result.outcome) {
    case 'captured':
      return closeCharged(booking, caseRow, amountMinor, actor)

    case 'failed':
    case 'balance_due':
      // A definitive decline: the attempt advanced inside settle, so the next click gets a fresh key.
      await unlockFeeAmount(caseId)
      return { outcome: 'declined' }

    case 'busy':
    case 'transient':
      // Keep the lock: the amount stays what it was, and a repeat of the same click replays the same Stripe key.
      return { error: 'payment_busy' }

    case 'noop': {
      // The money may already be collected by an earlier click whose answer was lost before the case was closed.
      const fresh = await loadBooking(bookingId, booking)
      if (
        result.code === 'captured' &&
        fresh.payment_state === 'captured' &&
        num(fresh.captured_amount_minor) === amountMinor
      ) {
        return closeCharged(fresh, caseRow, amountMinor, actor)
      }
      await unlockFeeAmount(caseId)
      return { error: 'action_not_allowed' }
    }

    default:
      // skipped: nothing started (mode, status or amount not allowed). Free the amount for another try.
      await unlockFeeAmount(caseId)
      return { error: 'action_not_allowed' }
  }
}

/** The fee is collected: close the case (decided_by, decided_at) and send the receipt of its kind. */
async function closeCharged(
  booking: BookingRow,
  caseRow: FeeCaseRow,
  amountMinor: number,
  actor: LedgerActor,
): Promise<FeeChargeResult> {
  await markFeeCharged(caseRow.id, { decidedBy: actorLabel(actor), decidedMinor: amountMinor })
  const fresh = await loadBooking(str(booking.id), booking)
  await sendReceipt({
    kind: 'fee_charged',
    variant: caseRow.kind === 'no_show' ? 'no_show' : 'late_cancel',
    // A pay-now row has no payment_currency: the receipt speaks the currency of the case.
    booking: { ...fresh, payment_currency: caseRow.currency },
    eventKey: `email:fee_charged:${caseRow.id}`,
    feeMinor: amountMinor,
    ...feeReceiptTerms(caseRow),
  })
  return { outcome: 'ok' }
}

/**
 * Charge the full amount of a cash booking to its saved card because the driver was not paid (D-21). No case, no
 * lock: the CAS claim of settle is the guard, and the amount is the row's own. A decline before the trip is completed
 * stays silent (no link, no email, no alert); after completion it goes through the recovery flow.
 */
export async function runCashCardCharge(input: {
  booking: BookingRow
  actor: LedgerActor
}): Promise<FeeChargeResult> {
  const { booking, actor } = input
  const bookingId = str(booking.id)
  if (!bookingId || isPartner(booking) || booking.payment_mode !== 'cash_guarantee') return { error: 'action_not_allowed' }

  await appendPaymentEvent(bookingId, {
    key: `admin:cash_card_charge:${bookingId}:${Date.now()}:${randomUUID().slice(0, 8)}`,
    kind: 'admin_action',
    errorCode: 'cash_card_charge',
    actor,
  })

  const result = await settleBooking(bookingId, actor, { collect: { kind: 'cash_card' } })

  switch (result.outcome) {
    case 'captured':
      await sendCashCardReceipt(bookingId, booking)
      return { outcome: 'ok' }
    case 'failed':
    case 'balance_due':
      return { outcome: 'declined' }
    case 'busy':
    case 'transient':
      // A transient answer has released the row (settle reconciles it at once, CR-05): the driver can confirm cash, and a
      // repeat of this click replays the same Stripe key.
      return { error: 'payment_busy' }
    default:
      return { error: 'action_not_allowed' }
  }
}

/** The receipt of a cash card charge, once (its ledger key): before the trip ended, or for a trip that was not paid. */
export async function sendCashCardReceipt(bookingId: string, fallback: BookingRow): Promise<void> {
  const fresh = await loadBooking(bookingId, fallback)
  await sendReceipt({
    kind: 'fee_charged',
    variant: tripCompleted(fresh) ? 'cash_unpaid' : 'cash_card',
    booking: fresh,
    eventKey: `email:fee_charged:${bookingId}`,
  })
}

// ── Plan 89-12: waive, and a fee out of money that is already collected ────────────────────────────────────────────────

export type FeeDecisionError = FeeChargeError | 'refund_failed' | 'amount_above_cap'
export type FeeDecisionResult = { outcome: 'ok' | 'declined' } | { error: FeeDecisionError }

/**
 * What the row alone says the client has paid for this case, in minor units of the case currency (0 = nothing collected):
 *   pay-now           the case base once a payment intent exists: enough to route the decision. The amount that moves is
 *                     read from the PaymentIntent (moneyHeld), never from here;
 *   card / cash row   captured or balance_due: what was captured (the row amount when no amount is stored).
 * A fee capture of the single collector also lands here (row captured, captured_amount_minor = the fee): the case is then
 * closed by chargeFromCollected on a replay with the same amount, never charged twice. Do NOT derive an amount owed from
 * a captured row: after a fee its captured_amount_minor is below payment_amount_minor and nothing more is due.
 */
export function collectedForCase(booking: BookingRow, caseRow: FeeCaseRow): number {
  if (booking.payment_mode === 'pay_now') return str(booking.payment_intent_id) !== '' ? caseRow.base_minor : 0
  if (booking.payment_mode !== 'card_hold' && booking.payment_mode !== 'cash_guarantee') return 0
  const state = str(booking.payment_state)
  if (state !== 'captured' && state !== 'balance_due') return 0
  const captured = num(booking.captured_amount_minor) ?? 0
  if (captured > 0) return captured
  return num(booking.payment_amount_minor) ?? 0
}

/** True when the fee of this case is kept out of money that was already collected. */
export function isMoneyCollected(booking: BookingRow, caseRow: FeeCaseRow): boolean {
  return collectedForCase(booking, caseRow) > 0
}

interface HeldMoney {
  /** Money Stripe still holds for this row: what a refund can return and the most a fee can keep. */
  collectedMinor: number
  /** What already went back, a refund by hand included. */
  refundedMinor: number
  leg: PaymentLeg | null
}

/**
 * The money behind a decision, as it is now. Pay-now: read from the PaymentIntent (CR-01), this row's share of it minus what
 * went back; a case in another currency than the payment moves nothing. A captured card row: what was captured minus the
 * refunds of its payment (CR-04: a repeat never refunds on top of a hand refund). Throws when Stripe can not be read: the
 * decision then answers payment_busy and nothing has moved.
 */
async function moneyHeld(booking: BookingRow, caseRow: FeeCaseRow): Promise<HeldMoney | 'currency_mismatch'> {
  const paymentIntentId = str(booking.payment_intent_id)
  if (booking.payment_mode === 'pay_now' && paymentIntentId) {
    const facts = await loadPayNowFacts(booking)
    if (facts.currency !== caseRow.currency) {
      console.error('[fee] case currency is not the payment currency', { bookingId: str(booking.id), caseId: caseRow.id })
      return 'currency_mismatch'
    }
    return { collectedMinor: facts.collectedMinor, refundedMinor: facts.refundedMinor, leg: facts.leg }
  }
  const captured = collectedForCase(booking, caseRow)
  if (captured <= 0 || !paymentIntentId) return { collectedMinor: captured, refundedMinor: 0, leg: null }
  const refundedMinor = (await listPaymentRefunds(paymentIntentId)).reduce((sum, r) => sum + r.amountMinor, 0)
  return { collectedMinor: Math.max(captured - refundedMinor, 0), refundedMinor, leg: null }
}

/** A failed refund: on record and alerted. Definitive: nothing moved, so the lock goes. Otherwise it may have executed. */
async function afterRefundFailure(
  booking: BookingRow,
  caseRow: FeeCaseRow,
  amountMinor: number,
  err: unknown,
  actor: LedgerActor,
): Promise<void> {
  await refundFailed(booking, caseRow, amountMinor, err, actor)
  if (!isNotTheClientsFault(classifyStripeError(err))) await unlockFeeAmount(caseRow.id)
}

/**
 * Refund part of the payment that collected the money, with the deterministic key of the case and always an explicit
 * amount in the payment's currency. The leg stays in the metadata of a leg row (the Phase 27 webhook reads it there).
 */
async function refundForCase(booking: BookingRow, caseRow: FeeCaseRow, amountMinor: number, leg: PaymentLeg | null): Promise<string> {
  const bookingId = str(booking.id)
  const paymentIntentId = str(booking.payment_intent_id)
  if (!paymentIntentId) throw new Error('no_payment_intent')
  const params: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    amount: amountMinor,
    ...(leg ? { metadata: { leg } } : {}),
  }
  const refund = await getPaymentsStripe().refunds.create(params, {
    idempotencyKey: stripeKeys.refund(bookingId, `fee:${caseRow.id}`),
  })
  return refund.id
}

/** A refund of a fee decision failed: on record in the ledger, the operator alerted, the case stays pending (D-20). */
async function refundFailed(
  booking: BookingRow,
  caseRow: FeeCaseRow,
  amountMinor: number,
  err: unknown,
  actor: LedgerActor,
): Promise<void> {
  const bookingId = str(booking.id)
  const code = err instanceof Error && err.message === 'no_payment_intent' ? 'no_payment_intent' : stripeErrorCode(err)
  console.error('[fee] refund failed', { bookingId, caseId: caseRow.id, code })
  try {
    await appendPaymentEvent(bookingId, {
      key: `refund_failed:${bookingId}:fee:${caseRow.id}`,
      kind: 'refund_failed',
      amountMinor,
      currency: caseRow.currency,
      errorCode: code,
      actor,
    })
  } catch {
    console.error('[fee] refund_failed ledger row not written', { bookingId })
  }
  try {
    await sendPaymentOperatorAlert(
      'refund_failed',
      { ...booking, payment_currency: caseRow.currency },
      { eventKey: `alert:refund_failed:${bookingId}:fee:${caseRow.id}`, code, amountMinor },
    )
  } catch {
    console.error('[fee] refund_failed alert not sent', { bookingId })
  }
}

/**
 * Charge the amount a person chose out of money the client already paid (pay-now, or a captured card booking): no new
 * charge exists, so the difference between what was collected and the fee is refunded (D-07). A fee equal to what was
 * collected refunds nothing. Same order as runFeeCharge: operator action on record, amount lock, then the money step.
 * Answers ok; refund_failed (the case stays pending; a definitive failure releases the lock, a transient one keeps it and a
 * repeat of the same click finds out from Stripe what happened); amount_above_cap (less is left than this fee);
 * amount_locked; payment_busy (Stripe could not be read); action_not_allowed (partner, decided case, nothing collected).
 */
export async function chargeFromCollected(input: {
  booking: BookingRow
  caseRow: FeeCaseRow
  amountMinor: number
  actor: LedgerActor
  reason?: string
  contactNote?: string
}): Promise<FeeDecisionResult> {
  const { caseRow, amountMinor, actor } = input
  const bookingId = str(input.booking.id)
  if (!bookingId || caseRow.booking_id !== bookingId || isPartner(input.booking)) return { error: 'action_not_allowed' }
  if (!isMinor(amountMinor) || amountMinor > caseRow.base_minor) return { error: 'action_not_allowed' }

  // Money moves on the row as it is now, not as the request read it a moment ago.
  const booking = await loadBooking(bookingId, input.booking)
  let held: Awaited<ReturnType<typeof moneyHeld>>
  try {
    held = await moneyHeld(booking, caseRow)
  } catch {
    console.error('[fee] payment could not be read', { bookingId, caseId: caseRow.id })
    return { error: 'payment_busy' }
  }
  if (held === 'currency_mismatch') return { error: 'action_not_allowed' }
  const collected = held.collectedMinor
  if (collected <= 0) return { error: 'action_not_allowed' }
  if (amountMinor > collected) return { error: 'amount_above_cap' }

  await appendPaymentEvent(bookingId, {
    key: `admin:fee_charge:${caseRow.id}:${Date.now()}:${randomUUID().slice(0, 8)}`,
    kind: 'admin_action',
    errorCode: 'fee_charge',
    amountMinor,
    currency: caseRow.currency,
    actor,
  })

  await freeStaleLock(caseRow.id, booking)
  const lock = await lockFeeAmount(caseRow.id, amountMinor, { reason: input.reason, contactNote: input.contactNote })
  if (lock !== 'locked') return { error: lock }

  const refundMinor = collected - amountMinor
  if (refundMinor > 0) {
    try {
      await refundForCase(booking, caseRow, refundMinor, held.leg)
    } catch (err) {
      await afterRefundFailure(booking, caseRow, refundMinor, err, actor)
      return { error: 'refund_failed' }
    }
  }
  return closeCharged(booking, caseRow, amountMinor, actor)
}

/**
 * Waive the fee of a pending case (D-05): the operator's reason goes on the case row (never the ledger or a client mail).
 *   a live hold or a saved card       released, nothing charged;
 *   money still held                  refunded in full (key refund:<id>:fee:<caseId>); a failed refund leaves refund_failed
 *                                     and an alert and the case stays pending;
 *   money already back (by hand)      nothing more moves, the case closes;
 *   a charge for this case in flight  payment_busy (a waive never races a charge that took the amount lock). A lock whose
 *                                     request can no longer be running is taken over (freeStaleLock).
 * Then a `waived` ledger row (key waived:fee:<caseId>), the case waived, and the fee_waived mail once.
 */
export async function waiveFee(input: {
  booking: BookingRow
  caseRow: FeeCaseRow
  reason: string
  actor: LedgerActor
}): Promise<FeeDecisionResult> {
  const { caseRow, actor } = input
  const bookingId = str(input.booking.id)
  const reason = input.reason.trim().slice(0, REASON_MAX)
  if (!bookingId || caseRow.booking_id !== bookingId || isPartner(input.booking) || !reason) return { error: 'action_not_allowed' }

  const current = await loadFeeCaseById(caseRow.id)
  if (!current || current.status !== 'pending') return { error: 'action_not_allowed' }
  const booking = await loadBooking(bookingId, input.booking)
  if (!(await freeStaleLock(caseRow.id, booking))) return { error: 'payment_busy' }

  // T-89-42: on record before anything can fail.
  await appendPaymentEvent(bookingId, {
    key: `admin:fee_waive:${caseRow.id}:${Date.now()}:${randomUUID().slice(0, 8)}`,
    kind: 'admin_action',
    errorCode: 'fee_waive',
    currency: current.currency,
    actor,
  })

  let held: Awaited<ReturnType<typeof moneyHeld>>
  try {
    held = await moneyHeld(booking, current)
  } catch {
    console.error('[fee] payment could not be read', { bookingId, caseId: caseRow.id })
    return { error: 'payment_busy' }
  }
  if (held === 'currency_mismatch') return { error: 'action_not_allowed' }
  const collected = held.collectedMinor
  let moneyOutcome: 'released' | 'refunded' | 'none' = 'released'

  if (collected > 0) {
    try {
      await refundForCase(booking, current, collected, held.leg)
    } catch (err) {
      await afterRefundFailure(booking, current, collected, err, actor)
      return { error: 'refund_failed' }
    }
    moneyOutcome = 'refunded'
  } else if (held.refundedMinor > 0) {
    // Everything went back by hand: no Stripe call, and no second refund.
    moneyOutcome = 'refunded'
  } else if (booking.payment_mode === 'pay_now') {
    moneyOutcome = 'none'
  } else if (booking.payment_mode === 'card_hold' || booking.payment_mode === 'cash_guarantee') {
    const released = await releaseHold(booking, { actor, reason: 'operator' })
    if (released === 'busy') return { error: 'payment_busy' }
    // noop is fine only when an earlier attempt already released it (a crash before the case was closed).
    if (released === 'noop' && str(booking.payment_state) !== 'released') return { error: 'action_not_allowed' }
  } else {
    return { error: 'action_not_allowed' }
  }

  await appendPaymentEvent(bookingId, {
    key: `waived:fee:${caseRow.id}`,
    kind: 'waived',
    amountMinor: current.base_minor,
    currency: current.currency,
    errorCode: 'fee_waive',
    actor,
  })

  const closed = await markFeeWaived(caseRow.id, { decidedBy: actorLabel(actor), reason })
  if (!closed) {
    // A replay (an earlier click closed it) is fine; anything else means a charge took the lock meanwhile.
    const after = await loadFeeCaseById(caseRow.id)
    if (!after || after.status !== 'waived') return { error: 'payment_busy' }
  }

  await sendReceipt({
    kind: 'fee_waived',
    booking: { ...(await loadBooking(bookingId, booking)), payment_currency: current.currency },
    eventKey: `email:fee_waived:${caseRow.id}`,
    moneyOutcome,
    ...(moneyOutcome === 'refunded' ? { refundMinor: collected > 0 ? collected + held.refundedMinor : held.refundedMinor } : {}),
  })
  return { outcome: 'ok' }
}

/** True when a refund of this case failed and is on record. */
async function caseRefundFailed(bookingId: string, caseId: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_events')
    .select('event_key')
    .eq('booking_id', bookingId)
    .eq('kind', 'refund_failed')
  if (error) throw new Error('refund ledger read failed')
  const prefix = `refund_failed:${bookingId}:fee:${caseId}`
  return (Array.isArray(data) ? (data as Array<{ event_key?: unknown }>) : []).some(
    (e) => typeof e.event_key === 'string' && e.event_key.startsWith(prefix),
  )
}

/**
 * The operator settled the money outside the site (a refund by hand in the Stripe Dashboard, a bank transfer, a dispute
 * that took it back) and closes the case (CR-04). No Stripe money call, no amount in the request and no client mail: whoever
 * refunded by hand told the client. The note is required and stays on the case row, never in the ledger. Allowed only on
 * collected money, with a refund failure of this case on record or a refund visible at Stripe, and never while a worker
 * holds the row. The case ends as waived; to keep part of the money the operator charges what is left instead, which moves
 * nothing and sends the receipt. The open refund failure is resolved with it.
 */
export async function closeAfterManualRefund(input: {
  booking: BookingRow
  caseRow: FeeCaseRow
  note: string
  actor: LedgerActor
}): Promise<FeeDecisionResult> {
  const { caseRow, actor } = input
  const bookingId = str(input.booking.id)
  const note = input.note.trim().slice(0, REASON_MAX)
  if (!bookingId || caseRow.booking_id !== bookingId || isPartner(input.booking) || !note) return { error: 'action_not_allowed' }

  const current = await loadFeeCaseById(caseRow.id)
  if (!current || current.status !== 'pending') return { error: 'action_not_allowed' }
  const booking = await loadBooking(bookingId, input.booking)
  if (booking.payment_state === 'capturing') return { error: 'payment_busy' }
  if (!isMoneyCollected(booking, current)) return { error: 'action_not_allowed' }

  let held: Awaited<ReturnType<typeof moneyHeld>>
  try {
    held = await moneyHeld(booking, current)
  } catch {
    console.error('[fee] payment could not be read', { bookingId, caseId: caseRow.id })
    return { error: 'payment_busy' }
  }
  if (held === 'currency_mismatch') return { error: 'action_not_allowed' }
  if (held.refundedMinor <= 0 && !(await caseRefundFailed(bookingId, caseRow.id))) return { error: 'action_not_allowed' }

  await appendPaymentEvent(bookingId, {
    key: `admin:fee_close_manual:${caseRow.id}:${Date.now()}:${randomUUID().slice(0, 8)}`,
    kind: 'admin_action',
    errorCode: 'fee_close_manual',
    currency: current.currency,
    actor,
  })
  // The operator's word ends whatever the lock was waiting for.
  await unlockFeeAmount(caseRow.id)
  await appendPaymentEvent(bookingId, {
    key: `waived:fee:${caseRow.id}`,
    kind: 'waived',
    amountMinor: current.base_minor,
    currency: current.currency,
    errorCode: 'fee_close_manual',
    actor,
  })
  const closed = await markFeeWaived(caseRow.id, { decidedBy: actorLabel(actor), reason: note })
  if (!closed) return { error: 'payment_busy' }
  await appendPaymentEvent(bookingId, {
    key: `refund_resolved:${bookingId}:fee:${caseRow.id}`,
    kind: 'admin_action',
    errorCode: REFUND_RESOLVED,
    actor,
  })
  return { outcome: 'ok' }
}
