// Cancelling a paid quote and refunding money on it (Phase 92, plan 92-22; QUOTE-03, QUOTE-04; D-03, D-06, D-11, D-12, D-13).
//
// One decision for the whole quote, made from the terms frozen into the accepted version and measured against the FIRST
// trip (D-06): free until the first pickup minus the stored free hours, late after; "Prestigo cancels" is always free.
//   free  the whole deposit goes back (what was not already refunded), no person involved (D-11);
//   late  the stored percent of the deposit is kept (default all of it, never more than the deposit); the operator
//         confirms how much of the rest goes back, 0 .. deposit minus what was already refunded;
//   both  a remainder the client paid on the quote page is refunded in full (D-11).
// The deposit belongs to the whole quote: cancelling ONE trip never moves it (D-12). The operator returns a part of the
// deposit (or of a paid remainder) by hand with refundQuotePayment, at any time, bounded by paid minus refunded.
//
// Every linked trip that has not started is cancelled through cancelBooking with suppressClientEmail, so the engine
// releases holds and saved cards without fees (92-11) and the client gets ONE quote email. A quote of which any trip
// has started cannot be cancelled as a whole.
//
// Order (the order is the safety of the money, tests/quote-cancel.test.ts pins it):
//   1. checks that write nothing: the quote exists, is paid and not cancelled, no trip has started, the refund the
//      operator confirmed is inside the bounds;
//   2. the trips are cancelled one by one (a trip already cancelled is skipped, so a click after a partial failure
//      finishes the job); a trip that could not be cancelled answers 'busy' and the quote is not touched;
//   3. the quote compare-and-set on cancelled_at IS NULL decides the winner of two clicks; the loser answers 'busy'
//      and refunds nothing;
//   4. the admin_action event is written, THEN Stripe is called: a refund with no audit row can not happen;
//   5. refunds, keyed with the amount (stripeKeys.quoteRefund); a failed refund keeps the cancel, records refund_failed
//      and alerts the operator once;
//   6. one email to the client (never throws).
//
// Server only. The service client is created inside each call. Logs and events carry ids, amounts and codes only: never
// a name, an address or an email.

import { STARTED_BOOKING_STATUSES } from '@/lib/booking-status'
import { cancelBooking } from '@/lib/payments/cancel'
import { getPaymentsStripe, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendQuoteOperatorAlert } from '@/lib/quotes/alerts'
import { renderQuoteCancelledEmail, renderQuoteRefundedEmail } from '@/lib/quotes/emails/cancelled'
import { sendQuoteEmail } from '@/lib/quotes/emails/shell'
import { appendQuoteEvent, type QuoteEventInput } from '@/lib/quotes/events'
import { firstPickupMs } from '@/lib/quotes/status'
import { evaluateQuoteCancel, keptDepositMinor, quoteFreeUntilMs, termsFromSnapshot } from '@/lib/quotes/terms'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

type Supabase = ReturnType<typeof createSupabaseServiceClient>
type Initiator = 'admin_client' | 'admin_prestigo'
type PickupFields = { pickup_date: string; pickup_time: string }

export interface QuoteCancelPreview {
  outcome: 'free' | 'late'
  /** Free cancellation ends at this instant (first pickup minus the stored free hours). */
  freeUntilMs: number
  /** The deposit the client paid, in minor units of the quote currency. */
  depositMinor: number
  /** Already refunded of the deposit (earlier partial refunds, the Stripe Dashboard). */
  refundedMinor: number
  /** What the terms let Prestigo keep of the deposit: 0 when free, the stored percent when late. */
  keptMinor: number
  /** What the dialog proposes to refund of the deposit: deposit minus kept minus already refunded, never below 0. */
  proposedRefundMinor: number
  /** A remainder paid on the quote page that is refunded in full on any cancel; 0 when none or already refunded. */
  remainderRefundMinor: number
}

export type CancelQuoteResult =
  | { ok: true; outcome: 'free' | 'late'; refundedMinor: number; refundFailed: boolean }
  | { ok: false; code: 'not_found' | 'not_paid' | 'already_cancelled' | 'trips_started' | 'refund_out_of_range' | 'busy' }

export type RefundQuotePaymentResult =
  | { ok: true }
  | { ok: false; code: 'not_found' | 'not_paid' | 'out_of_range' | 'refund_failed' }

export interface QuoteCancelActor {
  id: string
}

const num = (v: unknown): number => Number(v)

/** Statuses of a trip that has started (the driver is on the way, at the pickup, or the trip is over). */
// The shared list (lib/booking-status.ts): a hand-written status list here would drift from the status vocabulary.
const STARTED_STATUSES: ReadonlySet<string> = STARTED_BOOKING_STATUSES

const fail = (what: string, quoteId: string, code: string | null | undefined): never => {
  console.error('[quotes/cancel] database error', { quoteId, what, code: code ?? null })
  throw new Error(`quote cancel failed: ${what}`)
}

/** The audit trail never blocks an action that already happened: appendQuoteEvent logs its own failure. */
async function recordEvent(quoteId: string, event: QuoteEventInput): Promise<void> {
  try {
    await appendQuoteEvent(quoteId, event)
  } catch {
    // Logged inside appendQuoteEvent (ids and code only).
  }
}

// == the decision ====================================================================================================

/**
 * The one decision of a quote cancel, pure. The terms are read once from the frozen snapshot of the accepted version
 * and measured against the first trip (D-06): free until first pickup minus the free hours, late after, always free
 * when Prestigo cancels. A late cancel keeps the stored percent of the deposit (D-11). Throws RangeError when the
 * version has no deposit or no line has a readable pickup: a paid quote always has both, and money is never guessed.
 */
export function previewQuoteCancel(
  quote: Pick<QuoteRow, 'deposit_refunded_minor' | 'remainder_refunded_minor' | 'remainder_paid_at' | 'remainder_amount_minor'>,
  version: Pick<QuoteVersionRow, 'deposit_minor' | 'cancel_policy'>,
  lines: readonly PickupFields[],
  nowMs: number,
  initiator: Initiator,
): QuoteCancelPreview {
  if (version.deposit_minor === null || version.deposit_minor === undefined) {
    throw new RangeError('previewQuoteCancel: the version has no deposit')
  }
  const first = firstPickupMs(lines)
  if (first === null) throw new RangeError('previewQuoteCancel: no trip has a readable pickup')

  const depositMinor = num(version.deposit_minor)
  const refundedMinor = num(quote.deposit_refunded_minor ?? 0)
  const terms = termsFromSnapshot(version.cancel_policy)
  const freeUntilMs = quoteFreeUntilMs(first, terms.freeHours)
  const outcome = evaluateQuoteCancel({ freeUntilMs, nowMs, initiator })

  const keptMinor = outcome === 'free' ? 0 : keptDepositMinor(depositMinor, terms.feePercent)
  const proposedRefundMinor = Math.max(0, depositMinor - keptMinor - refundedMinor)

  const remainderPaid = quote.remainder_paid_at ? num(quote.remainder_amount_minor ?? 0) : 0
  const remainderRefundMinor = Math.max(0, remainderPaid - num(quote.remainder_refunded_minor ?? 0))

  return { outcome, freeUntilMs, depositMinor, refundedMinor, keptMinor, proposedRefundMinor, remainderRefundMinor }
}

// == reads ===========================================================================================================

async function readQuote(supabase: Supabase, quoteId: string): Promise<QuoteRow | null> {
  const { data, error } = await supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (error) fail('read quote', quoteId, error.code)
  return data ? (data as QuoteRow) : null
}

/** The version the deposit was paid for. */
async function readPaidVersion(supabase: Supabase, quote: QuoteRow): Promise<QuoteVersionRow | null> {
  const versionId = quote.accepted_version_id ?? quote.current_version_id
  if (!versionId) return null
  const { data, error } = await supabase.from('quote_versions').select('*').eq('id', versionId).eq('quote_id', quote.id).maybeSingle()
  if (error) fail('read version', quote.id, error.code)
  return data ? (data as QuoteVersionRow) : null
}

async function readLines(supabase: Supabase, quoteId: string, versionId: string): Promise<PickupFields[]> {
  const { data, error } = await supabase.from('quote_version_lines').select('pickup_date, pickup_time').eq('version_id', versionId)
  if (error) fail('read lines', quoteId, error.code)
  return (data ?? []) as PickupFields[]
}

async function readTrips(supabase: Supabase, quoteId: string): Promise<Array<{ id: string; status: string }>> {
  const { data, error } = await supabase.from('bookings').select('id, status').eq('quote_id', quoteId)
  if (error) fail('read trips', quoteId, error.code)
  return ((data ?? []) as Array<{ id: string; status: string }>).map((b) => ({ id: String(b.id), status: String(b.status) }))
}

type CancelContext =
  | { ok: true; quote: QuoteRow; version: QuoteVersionRow; lines: PickupFields[]; trips: Array<{ id: string; status: string }> }
  | { ok: false; code: 'not_found' | 'not_paid' | 'already_cancelled' | 'trips_started' }

/** The checks that write nothing, shared by the preview and the cancel. */
async function loadCancelContext(supabase: Supabase, quoteId: string): Promise<CancelContext> {
  const quote = await readQuote(supabase, quoteId)
  if (!quote) return { ok: false, code: 'not_found' }
  if (quote.cancelled_at) return { ok: false, code: 'already_cancelled' }
  if (!quote.paid_at || quote.voided_at || quote.status === 'voided') return { ok: false, code: 'not_paid' }

  const version = await readPaidVersion(supabase, quote)
  if (!version) return { ok: false, code: 'not_found' }
  const lines = await readLines(supabase, quoteId, version.id)
  const trips = await readTrips(supabase, quoteId)
  if (trips.some((t) => STARTED_STATUSES.has(t.status))) return { ok: false, code: 'trips_started' }
  return { ok: true, quote, version, lines, trips }
}

/** What the cancel dialog shows (GET): the same decision cancelQuote will make, evaluated now. */
export async function readQuoteCancelPreview(
  quoteId: string,
  initiator: Initiator,
  nowMs: number = Date.now(),
): Promise<{ ok: true; preview: QuoteCancelPreview } | { ok: false; code: 'not_found' | 'not_paid' | 'already_cancelled' | 'trips_started' }> {
  const ctx = await loadCancelContext(createSupabaseServiceClient(), quoteId)
  if (!ctx.ok) return ctx
  return { ok: true, preview: previewQuoteCancel(ctx.quote, ctx.version, ctx.lines, nowMs, initiator) }
}

// == the refund ======================================================================================================

type RefundSource = 'deposit' | 'remainder'

const COLUMN: Record<RefundSource, 'deposit_refunded_minor' | 'remainder_refunded_minor'> = {
  deposit: 'deposit_refunded_minor',
  remainder: 'remainder_refunded_minor',
}

/**
 * Raises the stored refunded total to at least `target` with a compare-and-set on the value read. A refund observed
 * from Stripe (charge.refunded) can raise the same column first; then there is nothing left to do. Never lowers a total.
 */
async function raiseRefunded(supabase: Supabase, quoteId: string, source: RefundSource, target: number): Promise<void> {
  const column = COLUMN[source]
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.from('quotes').select(column).eq('id', quoteId).maybeSingle()
    if (error) fail('read refunded', quoteId, error.code)
    const current = num((data as Record<string, unknown> | null)?.[column] ?? 0)
    if (current >= target) return
    const updated = await supabase
      .from('quotes')
      .update({ [column]: target, updated_at: new Date().toISOString() })
      .eq('id', quoteId)
      .eq(column, current)
      .select('id')
    if (updated.error) fail('write refunded', quoteId, updated.error.code)
    if (Array.isArray(updated.data) && updated.data.length > 0) return
  }
  fail('write refunded', quoteId, 'busy')
}

/** What the client paid on this payment of the quote and what is still refundable, from the quote row and the version. */
function refundableOf(quote: QuoteRow, version: QuoteVersionRow, source: RefundSource): { paidMinor: number; refundedMinor: number; intentId: string | null } | null {
  if (source === 'deposit') {
    if (!quote.paid_at || version.deposit_minor === null || version.deposit_minor === undefined) return null
    return { paidMinor: num(version.deposit_minor), refundedMinor: num(quote.deposit_refunded_minor ?? 0), intentId: quote.deposit_payment_intent_id }
  }
  if (!quote.remainder_paid_at || !quote.remainder_amount_minor) return null
  return { paidMinor: num(quote.remainder_amount_minor), refundedMinor: num(quote.remainder_refunded_minor ?? 0), intentId: quote.remainder_payment_intent_id }
}

/**
 * One Stripe refund of part of a quote payment, recorded. The caller has checked the bounds and written the admin_action
 * event. The idempotency key carries the amount (a second refund of a different amount is a new key) and, once something
 * was refunded already, the total before it: two legitimate refunds of the SAME amount are two keys, while a retry of
 * one refund (same total before) replays the first answer and never moves money twice. A failure is recorded and alerted
 * once and answered; it never throws.
 */
async function executeRefund(
  supabase: Supabase,
  quote: QuoteRow,
  version: QuoteVersionRow,
  source: RefundSource,
  amountMinor: number,
  actor: QuoteCancelActor,
): Promise<{ ok: true } | { ok: false }> {
  const money = refundableOf(quote, version, source)
  const currency = version.currency
  const quoteRef = { id: quote.id, reference: quote.reference }
  const base = money?.refundedMinor ?? 0
  const purpose = base === 0 ? `${source}:${amountMinor}` : `${source}:${amountMinor}:${base}`
  const failKey = `${source}:${amountMinor}:${base}`

  const fails = async (code: string): Promise<{ ok: false }> => {
    console.error('[quotes/cancel] refund failed', { quoteId: quote.id, source, code })
    await recordEvent(quote.id, {
      key: `refund_failed:${failKey}`,
      kind: 'refund_failed',
      stripeObjectId: money?.intentId ?? null,
      amountMinor,
      currency,
      errorCode: code,
      actor: { type: 'admin', id: actor.id },
    })
    try {
      await sendQuoteOperatorAlert('quote_refund_failed', quoteRef, {
        eventKey: `alert:quote_refund_failed:${failKey}`,
        code,
        amountMinor,
        currency,
      })
    } catch {
      console.error('[quotes/cancel] refund alert not sent', { quoteId: quote.id })
    }
    return { ok: false }
  }

  if (!money || !money.intentId) return fails('no_payment')

  let refundId: string | null = null
  try {
    const refund = await getPaymentsStripe().refunds.create(
      { payment_intent: money.intentId, amount: amountMinor },
      { idempotencyKey: stripeKeys.quoteRefund(quote.id, purpose) },
    )
    refundId = typeof refund?.id === 'string' ? refund.id : null
  } catch (err) {
    return fails(stripeErrorCode(err))
  }

  // The money moved. From here nothing may turn the answer into a failure: the totals are also raised by the
  // charge.refunded observation, so a write that fails here is repaired by Stripe's own event.
  const after = base + amountMinor
  try {
    await raiseRefunded(supabase, quote.id, source, after)
  } catch {
    console.error('[quotes/cancel] refund total not stored', { quoteId: quote.id, source })
  }
  await recordEvent(quote.id, {
    key: `${source}_refunded:${after}`,
    kind: source === 'deposit' ? 'deposit_refunded' : 'remainder_refunded',
    versionId: version.id,
    stripeObjectId: refundId ?? money.intentId,
    amountMinor,
    currency,
    actor: { type: 'admin', id: actor.id },
  })
  return { ok: true }
}

// == the client email ================================================================================================

async function emailClient(
  quote: QuoteRow,
  version: QuoteVersionRow,
  key: string,
  render: () => Promise<{ subject: string; html: string }>,
): Promise<void> {
  try {
    const mail = await render()
    const result = await sendQuoteEmail({ to: quote.client_email, subject: mail.subject, html: mail.html, idempotencyKey: key })
    await recordEvent(quote.id, {
      key: `email:${key}`,
      kind: result === 'sent' ? 'email_sent' : 'email_failed',
      versionId: version.id,
      actor: { type: 'system' },
    })
  } catch {
    console.error('[quotes/cancel] email not sent', { quoteId: quote.id })
    await recordEvent(quote.id, { key: `email:${key}`, kind: 'email_failed', versionId: version.id, actor: { type: 'system' } })
  }
}

// == cancel ==========================================================================================================

/**
 * Cancels a paid quote as a whole (operator only). `refundMinor` is ignored when the outcome is free (the whole deposit
 * not yet refunded goes back) and required when late: what the operator confirms to return of the deposit,
 * 0 .. deposit minus already refunded. A remainder the client paid on the page is always refunded in full.
 */
export async function cancelQuote(input: {
  quoteId: string
  initiator: Initiator
  refundMinor: number | null
  actor: QuoteCancelActor
}): Promise<CancelQuoteResult> {
  const { quoteId, initiator, actor } = input
  const supabase = createSupabaseServiceClient()

  // 1. checks that write nothing
  const ctx = await loadCancelContext(supabase, quoteId)
  if (!ctx.ok) return ctx
  const { quote, version, lines, trips } = ctx

  const nowMs = Date.now()
  const preview = previewQuoteCancel(quote, version, lines, nowMs, initiator)
  const maxDepositRefund = Math.max(0, preview.depositMinor - preview.refundedMinor)

  let depositRefund: number
  if (preview.outcome === 'free') {
    depositRefund = maxDepositRefund
  } else {
    const asked = input.refundMinor
    if (asked === null || !Number.isSafeInteger(asked) || asked < 0 || asked > maxDepositRefund) {
      return { ok: false, code: 'refund_out_of_range' }
    }
    depositRefund = asked
  }
  const remainderRefund = preview.remainderRefundMinor

  // 2. the trips, one by one, through the one cancel engine: no fee, no per-trip email to the client
  for (const trip of trips) {
    if (trip.status === 'cancelled') continue
    const result = await cancelBooking({
      bookingId: trip.id,
      initiator,
      actor: { type: 'admin', id: actor.id },
      nowMs,
      suppressClientEmail: true,
    })
    const cancelled =
      result.kind === 'ok' ||
      result.kind === 'already_cancelled' ||
      // The cancel stands even when a money step of the trip failed (the engine records it and alerts).
      result.kind === 'money_failed' ||
      (result.kind === 'db_failed' && result.cancelled === true) ||
      (result.kind === 'not_cancellable' && result.status === 'cancelled')
    if (!cancelled) {
      // Nothing about the quote changed; another click finishes the remaining trips.
      console.error('[quotes/cancel] a trip could not be cancelled', { quoteId, bookingId: trip.id, result: result.kind })
      return { ok: false, code: 'busy' }
    }
  }

  // 3. the quote itself: the compare-and-set decides the winner of two clicks
  const won = await supabase
    .from('quotes')
    .update({
      cancelled_at: new Date(nowMs).toISOString(),
      cancel_initiator: initiator,
      cancel_outcome: preview.outcome,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .is('cancelled_at', null)
    .eq('status', 'paid')
    .select('id')
  if (won.error) fail('cancel quote', quoteId, won.error.code)
  if (!Array.isArray(won.data) || won.data.length === 0) return { ok: false, code: 'busy' }

  // 4. audit first, then money. The admin_action row is the one event that must exist before Stripe is called: when it
  // can not be written no refund is attempted (the cancel stands) and the operator is told to refund by hand.
  let audited = true
  try {
    await appendQuoteEvent(quoteId, {
      key: `admin_action:cancel:${quoteId}`,
      kind: 'admin_action',
      versionId: version.id,
      amountMinor: depositRefund + remainderRefund,
      currency: version.currency,
      errorCode: `cancel:${initiator}:${preview.outcome}`,
      actor: { type: 'admin', id: actor.id },
    })
  } catch {
    audited = false
  }
  await recordEvent(quoteId, {
    key: `cancelled:${quoteId}`,
    kind: 'cancelled',
    versionId: version.id,
    errorCode: `${initiator}:${preview.outcome}`,
    actor: { type: 'admin', id: actor.id },
  })

  // 5. refunds
  let refundedMinor = 0
  let refundFailed = false
  if (!audited) {
    refundFailed = depositRefund + remainderRefund > 0
    if (refundFailed) {
      try {
        await sendQuoteOperatorAlert('quote_refund_failed', { id: quote.id, reference: quote.reference }, {
          eventKey: `alert:quote_refund_failed:cancel:${quoteId}`,
          code: 'audit_write_failed',
          amountMinor: depositRefund + remainderRefund,
          currency: version.currency,
        })
      } catch {
        console.error('[quotes/cancel] refund alert not sent', { quoteId })
      }
    }
  } else {
    if (depositRefund > 0) {
      const r = await executeRefund(supabase, quote, version, 'deposit', depositRefund, actor)
      if (r.ok) refundedMinor += depositRefund
      else refundFailed = true
    }
    if (remainderRefund > 0) {
      const r = await executeRefund(supabase, quote, version, 'remainder', remainderRefund, actor)
      if (r.ok) refundedMinor += remainderRefund
      else refundFailed = true
    }
  }

  // 6. one email. What the client reads is what happened: a failed refund promises no money, and a kept amount is only
  // named when part of the deposit really stays (the deposit not returned, however it came about).
  const keptMinor = refundFailed ? 0 : Math.max(0, preview.depositMinor - preview.refundedMinor - depositRefund)
  await emailClient(quote, version, `quote-cancelled:${quoteId}`, () =>
    renderQuoteCancelledEmail({ quote, version, initiator, refundMinor: refundedMinor, keptMinor }),
  )

  return { ok: true, outcome: preview.outcome, refundedMinor, refundFailed }
}

// == partial refund ==================================================================================================

/**
 * The operator returns part of the deposit or of a paid remainder (D-12), on a paid quote at any time (also after a
 * cancel, which is how a failed refund is retried). Bounded by what was paid minus what was refunded; the client gets a
 * refund email.
 */
export async function refundQuotePayment(input: {
  quoteId: string
  source: RefundSource
  amountMinor: number
  actor: QuoteCancelActor
}): Promise<RefundQuotePaymentResult> {
  const { quoteId, source, amountMinor, actor } = input
  const supabase = createSupabaseServiceClient()

  const quote = await readQuote(supabase, quoteId)
  if (!quote) return { ok: false, code: 'not_found' }
  const version = await readPaidVersion(supabase, quote)
  if (!version) return { ok: false, code: 'not_found' }

  const money = refundableOf(quote, version, source)
  if (!money || !money.intentId) return { ok: false, code: 'not_paid' }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > money.paidMinor - money.refundedMinor) {
    return { ok: false, code: 'out_of_range' }
  }

  // Audit first, then Stripe (T-92-69): a failed audit write throws before any money moves. The key names what is being
  // asked, so a repeat of the same click adds no row.
  await appendQuoteEvent(quoteId, {
    key: `admin_action:refund:${source}:${amountMinor}:${money.refundedMinor}`,
    kind: 'admin_action',
    versionId: version.id,
    amountMinor,
    currency: version.currency,
    errorCode: `refund:${source}`,
    actor: { type: 'admin', id: actor.id },
  })

  const result = await executeRefund(supabase, quote, version, source, amountMinor, actor)
  if (!result.ok) return { ok: false, code: 'refund_failed' }

  await emailClient(quote, version, `quote-refunded:${source}:${money.refundedMinor + amountMinor}`, () =>
    renderQuoteRefundedEmail({ quote, version, amountMinor }),
  )
  return { ok: true }
}
