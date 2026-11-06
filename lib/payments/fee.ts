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

import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { czkToEur } from '@/lib/currency'
import { sendPaymentEmail } from '@/lib/payments/emails/send'
import { settleBooking, type SettleResult } from '@/lib/payments/settle'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
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
  if (mode === 'pay_now') return str(booking.payment_intent_id) !== ''
  if (mode !== 'card_hold' && mode !== 'cash_guarantee') return false
  if (state === 'captured' || state === 'balance_due') return true
  // Nothing saved yet, already released, or settled in cash: there is no card to take a fee from.
  if (state === '' || state === 'none' || state === 'checkout_pending' || state === 'released' || state === 'cash_settled') {
    return false
  }
  return str(booking.stripe_payment_method_id) !== '' || str(booking.hold_payment_intent_id) !== ''
}

/**
 * The amount a fee is a share of (the case's base_minor) and its currency. Card and cash rows: the row's own
 * payment_amount_minor in its payment_currency. Pay-now: the leg amount in EUR cents when a leg is given (the same
 * czkToEur rounding the cancel route uses for a leg refund), else amount_eur in cents. Null when the facts are missing.
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
  try {
    await sendPaymentEmail(args)
  } catch {
    console.error('[fee] receipt email failed', { bookingId: str(args.booking.id), kind: args.kind })
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
    key: `admin:fee_charge:${caseId}:${Date.now()}`,
    kind: 'admin_action',
    errorCode: 'fee_charge',
    ...(isMinor(amountMinor) ? { amountMinor } : {}),
    currency: caseRow.currency,
    actor,
  })

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
    booking: fresh,
    eventKey: `email:fee_charged:${caseRow.id}`,
    feeMinor: amountMinor,
    ...(caseRow.free_until ? { freeUntil: caseRow.free_until } : {}),
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
    key: `admin:cash_card_charge:${bookingId}:${Date.now()}`,
    kind: 'admin_action',
    errorCode: 'cash_card_charge',
    actor,
  })

  const result = await settleBooking(bookingId, actor, { collect: { kind: 'cash_card' } })

  switch (result.outcome) {
    case 'captured': {
      const fresh = await loadBooking(bookingId, booking)
      await sendReceipt({
        kind: 'fee_charged',
        variant: tripCompleted(fresh) ? 'cash_unpaid' : 'cash_card',
        booking: fresh,
        eventKey: `email:fee_charged:${bookingId}`,
      })
      return { outcome: 'ok' }
    }
    case 'failed':
    case 'balance_due':
      return { outcome: 'declined' }
    case 'busy':
    case 'transient':
      return { error: 'payment_busy' }
    default:
      return { error: 'action_not_allowed' }
  }
}
