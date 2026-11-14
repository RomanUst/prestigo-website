import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { generateBookingReference } from '@/lib/booking-reference'
import { pickupInstantMs } from '@/lib/prague-date'
import { DEFAULT_HOLD_LEAD_HOURS } from '@/lib/payments/config'
import { computeHoldAt } from '@/lib/payments/timing'
import { convertQuoteToBookings, type LedgerActor } from '@/lib/payments/state'
import { getPaymentsStripe, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { sendQuoteOperatorAlert } from '@/lib/quotes/alerts'
import { renderQuoteConfirmedEmail } from '@/lib/quotes/emails/confirmed'
import { sendQuoteEmail } from '@/lib/quotes/emails/shell'
import { appendQuoteEvent, hasQuoteEvent } from '@/lib/quotes/events'
import { remainderDueMinor } from '@/lib/quotes/money'
import type { QuoteAcceptanceRow, QuoteLineRow, QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

/**
 * Phase 92 (QUOTE-03, QUOTE-04, QUOTE-05; D-15, D-18): the conversion core. One function turns a succeeded deposit
 * PaymentIntent of a quote into one booking per line, exactly once; the Stripe webhook route and the tick reconcile that
 * call it are plan 92-31.
 *
 * Decision order (the order is the safety of the money path, tests/quote-convert.test.ts pins every step):
 *   1. a PaymentIntent that is not a succeeded quote deposit (any other status or kind, bad metadata, unknown quote)
 *      is ignored;
 *   2. RECORDED (W2): the intent is the one the quote recorded (deposit_payment_intent_id) and the quote is paid
 *      (paid_at set): 'replayed' with the booking ids, whatever cancelled_at, voided_at or current_version_id say now,
 *      and no Stripe call, ever. Only the quote cancel and the refund dialog return deposit money, never a replay;
 *   3. OWNED: the recorded intent of the current version of a live quote: the lines are built (a fresh booking reference
 *      per line, hold_at for a saved-card line with a remainder) and the wrapper convertQuoteToBookings makes the
 *      bookings in one transaction; first_time false is 'replayed'. A conversion that fails inside the database (money taken,
 *      no bookings) records convert_failed once, alerts the operator once and throws, so the caller answers 500 and
 *      Stripe delivers the event again;
 *   4. NOT OWNED (D-18): a succeeded payment the quote never recorded (another intent, a superseded version, a quote
 *      voided or cancelled before it was paid, or the database answering so under a race) is refunded in full,
 *      automatically, under the fixed key refund:quote:<id>:orphan:<pi>, recorded as orphan_refunded and alerted once.
 *      This is the ONLY automatic refund of the quote flow; it never applies to a deposit the quote recorded (step 2).
 * The wrapper in lib/payments/state.ts is the only caller of the database function.
 * After a conversion (and after a replay) runQuotePaidEffects (plan 92-21) finishes what the client, the accountant, the
 * operator and the trip reminders are owed, each at most once.
 *
 * Server only. Errors and logs carry ids and codes, never a client name, an email or an address.
 */

export interface QuoteDepositOutcome {
  outcome: 'converted' | 'replayed' | 'orphan_refunded' | 'ignored'
  bookingIds?: string[]
}

/** What the database answers when the payment is not the live quote's (an ownership refusal): the money goes back. */
const NOT_OWNED_REASONS = new Set(['intent_mismatch', 'version_mismatch', 'voided', 'cancelled'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEPOSIT_KIND = 'card_quote_deposit'

const idOf = (v: string | { id?: string } | null | undefined): string | null =>
  typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : null

/** One quote-table read; a database error throws (the webhook answers 500 and Stripe retries). */
async function readOne<T>(table: string, column: string, value: string): Promise<T | null> {
  const { data, error } = await createSupabaseServiceClient().from(table).select('*').eq(column, value).maybeSingle()
  if (error) throw new Error(`quote ${table} lookup failed`)
  return (data as T | null) ?? null
}

async function readMany<T>(table: string, column: string, value: string, orderBy: string): Promise<T[]> {
  const { data, error } = await createSupabaseServiceClient()
    .from(table)
    .select('*')
    .eq(column, value)
    .order(orderBy, { ascending: true })
  if (error) throw new Error(`quote ${table} lookup failed`)
  return (Array.isArray(data) ? data : []) as T[]
}

/** The booking ids of a converted quote, in line order. */
async function bookingIdsOfQuote(quoteId: string): Promise<string[]> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('id, quote_line_id').eq('quote_id', quoteId)
  if (error) throw new Error('quote bookings lookup failed')
  const bookings = (Array.isArray(data) ? data : []) as Array<{ id: string; quote_line_id: string | null }>
  const lineIds = bookings.map((b) => b.quote_line_id).filter((id): id is string => typeof id === 'string')
  if (lineIds.length === 0) return bookings.map((b) => b.id)
  const lines = await createSupabaseServiceClient().from('quote_version_lines').select('id, position').in('id', lineIds)
  if (lines.error) throw new Error('quote lines lookup failed')
  const position = new Map(((lines.data ?? []) as Array<{ id: string; position: number }>).map((l) => [l.id, l.position]))
  return [...bookings]
    .sort((a, b) => (position.get(a.quote_line_id ?? '') ?? 0) - (position.get(b.quote_line_id ?? '') ?? 0))
    .map((b) => b.id)
}

/** A booking reference per line, unique inside the call (the database enforces uniqueness across bookings). */
function freshReferences(count: number): string[] {
  const out = new Set<string>()
  while (out.size < count) out.add(generateBookingReference())
  return [...out]
}

/**
 * Applies one succeeded deposit PaymentIntent to its quote. Returns what happened; throws (so the caller answers 500 and
 * Stripe delivers the event again) when money arrived and the conversion could not be completed.
 */
export async function applyQuoteDepositPaid(pi: Stripe.PaymentIntent, actor: LedgerActor): Promise<QuoteDepositOutcome> {
  // 1. Only a succeeded quote deposit with well-formed ids is ours to handle.
  if (pi.status !== 'succeeded') return { outcome: 'ignored' }
  const meta = pi.metadata ?? {}
  const quoteId = meta.quoteId
  const metaVersionId = meta.versionId
  if (meta.kind !== DEPOSIT_KIND || !quoteId || !UUID_RE.test(quoteId) || !metaVersionId || !UUID_RE.test(metaVersionId)) {
    console.warn('[quote-convert] not a quote deposit', { stripeObjectId: pi.id })
    return { outcome: 'ignored' }
  }
  const quote = await readOne<QuoteRow>('quotes', 'id', quoteId)
  if (!quote) {
    console.error('[quote-convert] deposit for an unknown quote', { stripeObjectId: pi.id, quoteId })
    return { outcome: 'ignored' }
  }

  // 2. RECORDED (W2): a deposit this quote already recorded is never decided again, whatever became of the quote since.
  if (quote.deposit_payment_intent_id === pi.id && quote.paid_at) {
    const bookingIds = await bookingIdsOfQuote(quote.id)
    await finishQuotePaid(quote.id)
    return { outcome: 'replayed', bookingIds }
  }

  // 3. OWNED: the recorded intent of the current version of a quote that is neither voided nor cancelled.
  const owned =
    quote.deposit_payment_intent_id === pi.id &&
    metaVersionId === quote.current_version_id &&
    !quote.voided_at &&
    !quote.cancelled_at &&
    quote.status !== 'voided'
  if (!owned) return refundOrphan(quote, pi, actor, notOwnedReason(quote, pi.id, metaVersionId))

  // Money is in and the quote is live: from here every failure is a conversion failure, recorded and alerted once.
  let result: Awaited<ReturnType<typeof convertQuoteToBookings>>
  try {
    const version = await readOne<QuoteVersionRow>('quote_versions', 'id', metaVersionId)
    const acceptance = await readAcceptance(quote.id, pi.id)
    const lines = await readMany<QuoteLineRow>('quote_version_lines', 'version_id', metaVersionId, 'position')
    const leadHours = acceptance?.hold_lead_hours ?? DEFAULT_HOLD_LEAD_HOURS
    const cardHold = version?.remainder_method === 'saved_card'
    const references = freshReferences(lines.length)

    result = await convertQuoteToBookings({
      quoteId: quote.id,
      versionId: metaVersionId,
      paymentIntentId: pi.id,
      customerId: idOf(pi.customer as string | { id?: string } | null),
      paymentMethodId: idOf(pi.payment_method as string | { id?: string } | null),
      lines: lines.map((line, i) => ({
        position: line.position,
        bookingReference: references[i],
        holdAt: cardHold && (line.remainder_minor ?? 0) > 0 ? holdAtFor(line, leadHours) : null,
      })),
      actor,
    })
  } catch (err) {
    await recordConvertFailed(quote, pi, actor, err instanceof Error && err.message === 'quote conversion failed' ? 'rpc_error' : 'prepare_error')
    throw err
  }

  if (!result.converted) {
    // The database saw something the reads above could not (a void or cancel that raced the payment): not the live
    // quote's money, so it goes back. Any other refusal is a conversion failure to be retried by a person or a redelivery.
    if (NOT_OWNED_REASONS.has(result.reason)) return refundOrphan(quote, pi, actor, result.reason)
    await recordConvertFailed(quote, pi, actor, result.reason)
    throw new Error(`quote conversion refused: ${result.reason}`)
  }
  await finishQuotePaid(quote.id)
  return { outcome: result.firstTime ? 'converted' : 'replayed', bookingIds: result.bookingIds }
}

/** The effects of a paid deposit never undo a committed conversion and never fail the webhook: a failure is logged by id. */
async function finishQuotePaid(quoteId: string): Promise<void> {
  try {
    await runQuotePaidEffects(quoteId)
  } catch {
    console.error('[quote-effects] effects failed', { quoteId })
  }
}

/** Why the payment is not the quote's, as a short code for the event row and the alert. */
function notOwnedReason(quote: QuoteRow, paymentIntentId: string, versionId: string): string {
  if (quote.voided_at || quote.status === 'voided') return 'voided'
  if (quote.cancelled_at) return 'cancelled'
  if (quote.deposit_payment_intent_id !== paymentIntentId) return 'intent_mismatch'
  if (versionId !== quote.current_version_id) return 'version_mismatch'
  return 'not_owned'
}

const moneyOf = (pi: Stripe.PaymentIntent): { amountMinor: number; currency: 'eur' | 'czk' } => ({
  amountMinor: pi.amount_received || pi.amount,
  currency: pi.currency === 'czk' ? 'czk' : 'eur',
})

/**
 * The payment is not the live quote's (D-18): refund it in full, record it, tell the operator. Each step is exactly-once
 * on its own key, so a redelivery after a crash between two of them completes the rest and repeats nothing: the refund key
 * is fixed (Stripe replays the first answer), the orphan_refunded row and the alert are claimed by their keys, and a
 * redelivery that finds the row refunds nothing more. A refund that fails is recorded and alerted once and thrown, so
 * Stripe delivers the event again.
 */
async function refundOrphan(quote: QuoteRow, pi: Stripe.PaymentIntent, actor: LedgerActor, reason: string): Promise<QuoteDepositOutcome> {
  const { amountMinor, currency } = moneyOf(pi)
  const quoteRef = { id: quote.id, reference: quote.reference }

  if (!(await hasQuoteEvent(quote.id, `orphan_refunded:${pi.id}`))) {
    try {
      await getPaymentsStripe().refunds.create(
        { payment_intent: pi.id },
        { idempotencyKey: stripeKeys.quoteRefund(quote.id, `orphan:${pi.id}`) },
      )
    } catch (err) {
      const code = stripeErrorCode(err)
      // Already refunded in full (the first refund went through and its row was not written): treat as refunded.
      if (code !== 'charge_already_refunded') {
        console.error('[quote-convert] orphan deposit not refunded', { quoteId: quote.id, stripeObjectId: pi.id, code })
        try {
          await appendQuoteEvent(quote.id, {
            key: `refund_failed:orphan:${pi.id}`,
            kind: 'refund_failed',
            stripeObjectId: pi.id,
            amountMinor,
            currency,
            errorCode: code,
            actor,
          })
          await sendQuoteOperatorAlert('quote_refund_failed', quoteRef, {
            eventKey: `alert:quote_refund_failed:orphan:${pi.id}`,
            code,
            amountMinor,
            currency,
          })
        } catch {
          console.error('[quote-convert] refund failure not recorded', { quoteId: quote.id, stripeObjectId: pi.id })
        }
        throw err
      }
    }
    await appendQuoteEvent(quote.id, {
      key: `orphan_refunded:${pi.id}`,
      kind: 'orphan_refunded',
      stripeObjectId: pi.id,
      amountMinor,
      currency,
      errorCode: reason,
      actor,
    })
  }

  await sendQuoteOperatorAlert('quote_orphan_refunded', quoteRef, {
    eventKey: `alert:quote_orphan_refunded:${pi.id}`,
    code: reason,
    amountMinor,
    currency,
  })
  return { outcome: 'orphan_refunded' }
}

/** Money taken, no bookings: one convert_failed row and one alert per payment, however often Stripe retries. Never throws. */
async function recordConvertFailed(quote: QuoteRow, pi: Stripe.PaymentIntent, actor: LedgerActor, code: string): Promise<void> {
  const { amountMinor, currency } = moneyOf(pi)
  console.error('[quote-convert] conversion failed', { quoteId: quote.id, stripeObjectId: pi.id, code })
  try {
    await appendQuoteEvent(quote.id, {
      key: `convert_failed:${pi.id}`,
      kind: 'convert_failed',
      versionId: pi.metadata?.versionId ?? null,
      stripeObjectId: pi.id,
      amountMinor,
      currency,
      errorCode: code,
      actor,
    })
    await sendQuoteOperatorAlert('quote_convert_failed', { id: quote.id, reference: quote.reference }, {
      eventKey: `alert:quote_convert_failed:${pi.id}`,
      code,
      amountMinor,
      currency,
    })
  } catch {
    console.error('[quote-convert] conversion failure not recorded', { quoteId: quote.id, stripeObjectId: pi.id })
  }
}

async function readAcceptance(quoteId: string, paymentIntentId: string): Promise<QuoteAcceptanceRow | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from('quote_acceptances')
    .select('*')
    .eq('quote_id', quoteId)
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (error) throw new Error('quote acceptance lookup failed')
  return (data as QuoteAcceptanceRow | null) ?? null
}

/** The instant the tick places the hold: computeHoldAt of the pickup instant, or null when the pickup does not parse. */
function holdAtFor(line: QuoteLineRow, leadHours: number): string | null {
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: line.pickup_date, pickup_time: line.pickup_time })
  if (pickupMs === null) return null
  return new Date(computeHoldAt(pickupMs, leadHours).holdAtMs).toISOString()
}

// -- after the conversion (plan 92-21) --------------------------------------------------------------------------------------

const SYSTEM_ACTOR = { type: 'system', id: null } as const

interface PaidBooking {
  id: string
  quote_line_id: string | null
  status: string
  paid_at: string | null
  payment_mode: string
  booking_reference: string
  pickup_date: string
  pickup_time: string
  pickup_utc: string | null
  origin_address: string
  destination_address: string | null
}

/** One effect: a failure is logged with the quote id and the step name and never stops the other effects. */
async function effect(quoteId: string, step: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch {
    console.error('[quote-effects] step failed', { quoteId, step })
  }
}

async function readPaidBookings(quoteId: string, lineOrder: Map<string, number>): Promise<PaidBooking[]> {
  const { data, error } = await createSupabaseServiceClient()
    .from('bookings')
    .select(
      'id, quote_line_id, status, paid_at, payment_mode, booking_reference, pickup_date, pickup_time, pickup_utc, origin_address, destination_address',
    )
    .eq('quote_id', quoteId)
  if (error) throw new Error('quote bookings lookup failed')
  const rows = (Array.isArray(data) ? data : []) as PaidBooking[]
  return [...rows].sort((a, b) => (lineOrder.get(a.quote_line_id ?? '') ?? 0) - (lineOrder.get(b.quote_line_id ?? '') ?? 0))
}

/** A message of the quote is recorded as sent, or as failed under its own key (a later delivery tries again). */
async function recordEmail(quoteId: string, key: string, outcome: 'sent' | 'failed', versionId: string): Promise<void> {
  if (outcome === 'sent') {
    await appendQuoteEvent(quoteId, { key, kind: 'email_sent', versionId, actor: SYSTEM_ACTOR })
    return
  }
  await appendQuoteEvent(quoteId, { key: `${key}:failed`, kind: 'email_failed', versionId, errorCode: 'send_failed', actor: SYSTEM_ACTOR })
}

/**
 * What a paid deposit still owes after the bookings exist (QUOTE-05; Q8 "After the commit"). Each step is claimed by a
 * quote event key and every email carries a Resend idempotency key derived from the quote id: send THEN record, so a
 * redelivery after a crash finishes what is missing and a message that went out without its row is dropped by Resend.
 *
 * W2: a quote cancelled (or erased) in the meantime gets no client-facing effect. A step that fails is logged and does not
 * stop the others; the function itself throws only when the quote can not be read.
 */
export async function runQuotePaidEffects(quoteId: string): Promise<void> {
  const quote = await readOne<QuoteRow>('quotes', 'id', quoteId)
  const versionId = quote?.accepted_version_id ?? quote?.current_version_id ?? null
  if (!quote || !quote.paid_at || !versionId) {
    console.error('[quote-effects] quote is not a paid quote', { quoteId })
    return
  }
  const version = await readOne<QuoteVersionRow>('quote_versions', 'id', versionId)
  if (!version) {
    console.error('[quote-effects] version missing', { quoteId })
    return
  }
  const rawLines = await readMany<QuoteLineRow>('quote_version_lines', 'version_id', versionId, 'position')
  // PostgREST sends bigint as text: every amount is a number from here on.
  const lines = rawLines.map((l) => ({
    ...l,
    amount_minor: Number(l.amount_minor),
    deposit_share_minor: l.deposit_share_minor === null ? null : Number(l.deposit_share_minor),
    remainder_minor: l.remainder_minor === null ? null : Number(l.remainder_minor),
  }))
  const lineOrder = new Map(lines.map((l) => [l.id, l.position]))
  const bookings = await readPaidBookings(quoteId, lineOrder)

  // W2: nothing client-facing for a quote that was cancelled or erased, however the deposit came to be replayed. The state is
  // read again before each client step, so a cancel that lands between two steps is seen by the next one.
  const clientBlocked = async (): Promise<boolean> => {
    const fresh = await readOne<QuoteRow>('quotes', 'id', quoteId)
    return !fresh || Boolean(fresh.cancelled_at) || Boolean(fresh.anonymised_at) || Boolean(fresh.voided_at)
  }

  await effect(quoteId, 'email:confirmed', async () => {
    if (await hasQuoteEvent(quoteId, 'email:confirmed')) return
    if (await clientBlocked()) return
    const live = bookings.filter((b) => b.status !== 'cancelled')
    const liveLines = new Set(live.map((b) => b.quote_line_id))
    // A payment link or an invoice is collected through quote-mode bookings; a card or cash remainder is what the lines carry.
    const dueMinor =
      version.remainder_method === 'payment_link' || version.remainder_method === 'invoice'
        ? remainderDueMinor(
            lines.map((l) => ({ id: l.id, remainder_minor: l.remainder_minor })),
            bookings,
          )
        : lines.filter((l) => liveLines.has(l.id)).reduce((sum, l) => sum + (l.remainder_minor ?? 0), 0)
    // The PDF of the quote is attached by plan 92-20; nothing is attached here (seam: pass `attachments` to sendQuoteEmail).
    const mail = await renderQuoteConfirmedEmail({ quote, version, bookings: live, remainderDueMinor: dueMinor, quoteUrl: null })
    const outcome = await sendQuoteEmail({
      to: quote.client_email,
      subject: mail.subject,
      html: mail.html,
      idempotencyKey: `quote-confirmed:${quoteId}`,
    })
    await recordEmail(quoteId, 'email:confirmed', outcome, versionId)
  })
}
