// The remainder of a payment-link quote, paid on the quote page (Phase 92, plan 92-23; QUOTE-04; D-16, D-22).
//
//   createRemainderIntent    the client opens the paid quote page and pays what is still owed. The amount is computed HERE from
//                            the paid quote (the unpaid, not cancelled quote-mode trips, readRemainderDue); the request only echoes
//                            the amount it was shown (T-92-73). At most one live PaymentIntent exists per quote.
//   applyQuoteRemainderPaid  a succeeded remainder PaymentIntent (webhook or tick reconcile) marks the quote and its trips paid,
//                            exactly once (compare-and-set on quotes.remainder_paid_at).
//
// The intent carries the quote metadata of kind card_quote_remainder only and is NEVER written to a booking's payment_intent_id
// (D-18). It does not save the card: per D-22 the saved card is not charged by the operator on these quotes, the client pays on
// the page. Server only; logs carry ids and Stripe codes, never the token, a hash, an email or a Stripe message.

import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { ensureQuoteStripeCustomer } from '@/lib/payments/customer'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
import { classifyStripeError, getPaymentsStripe, quoteMetadata, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { sendQuoteOperatorAlert } from '@/lib/quotes/alerts'
import { renderQuoteRemainderPaidEmail } from '@/lib/quotes/emails/remainder-paid'
import { sendQuoteEmail } from '@/lib/quotes/emails/shell'
import { appendQuoteEvent, hasQuoteEvent } from '@/lib/quotes/events'
import { readRemainderDue } from '@/lib/quotes/invoice'
import { QUOTE_MIN_CHARGE_MINOR } from '@/lib/quotes/money'
import { resolveQuoteToken } from '@/lib/quotes/resolve'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

const REMAINDER_KIND = 'card_quote_remainder'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CreateRemainderResult =
  | { ok: true; clientSecret: string; amountMinor: number; currency: 'eur' | 'czk' }
  | {
      ok: false
      code: 'invalid_link' | 'not_payable' | 'nothing_due' | 'amount_changed' | 'already_paying' | 'busy' | 'stripe_error'
    }

const refuse = (code: Extract<CreateRemainderResult, { ok: false }>['code']): CreateRemainderResult => ({ ok: false, code })

/** A database write that failed: the route answers a generic 502; the message never reaches a log line or a client. */
class RemainderWriteError extends Error {}

function dbFailure(what: string): Error {
  return new RemainderWriteError(`quote remainder ${what} failed`)
}

/** Stripe's "no such object": a stored intent that is gone is replaced, like a canceled one. */
function isMissingResource(err: unknown): boolean {
  const e = err as { code?: unknown; statusCode?: unknown } | null
  return e?.code === 'resource_missing' || e?.statusCode === 404
}

const LIVE_STATUSES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action'])
const PAYING_STATUSES = new Set(['processing', 'succeeded', 'requires_capture'])

type StoredIntent =
  | { kind: 'live'; id: string; clientSecret: string }
  | { kind: 'paying'; id: string }
  | { kind: 'replace' }
  | { kind: 'busy' }

/**
 * Creates or reuses the one live remainder PaymentIntent of a paid payment-link quote.
 *
 * Order: the link decides validity (one null for every dead link), the quote must be paid and its method payment_link,
 * the amount due is read on the server, the displayed amount is only a cross-check, then the stored intent is inspected
 * (reuse / already paying / replace), and only then is Stripe asked for a new intent.
 */
export async function createRemainderIntent(input: {
  token: string
  displayedAmountMinor: number
  nowMs?: number
}): Promise<CreateRemainderResult> {
  const nowMs = input.nowMs ?? Date.now()

  // 1. The link: a cancelled, voided, superseded, revoked or unknown quote is the one invalid_link, no price data (D-05).
  const resolved = await resolveQuoteToken(input.token, nowMs)
  if (!resolved) return refuse('invalid_link')
  const { quote, version } = resolved

  // 2. Payable only for a paid quote of the payment-link method; an offer, a saved-card, cash or invoice quote is refused
  // without price data (D-16, D-22).
  if (resolved.state !== 'paid' || quote.status !== 'paid' || quote.cancelled_at) return refuse('not_payable')
  if (version.remainder_method !== 'payment_link') return refuse('not_payable')
  if (quote.accepted_version_id && quote.accepted_version_id !== version.id) return refuse('not_payable')

  // 3. The server is the price authority (T-92-73).
  const supabase = createSupabaseServiceClient()
  const dueMinor = await readRemainderDue(supabase, quote.id, version.id)
  if (!Number.isSafeInteger(dueMinor) || dueMinor <= 0) return refuse('nothing_due')
  // Below Stripe's minimum a card payment cannot be taken at all (Pitfall 11): the operator settles that rest by hand.
  if (dueMinor < QUOTE_MIN_CHARGE_MINOR[version.currency]) return refuse('not_payable')
  if (input.displayedAmountMinor !== dueMinor) return refuse('amount_changed')

  // 4. Stripe. One live intent per quote: a live one of this amount is reused, one that is processing or succeeded means the
  // client is already paying, a canceled or vanished one is replaced. Anything else is never guessed.
  const previousId = quote.remainder_payment_intent_id
  const previousAttempt = Number(quote.remainder_attempt ?? 0)
  try {
    const stripe = getPaymentsStripe()

    if (previousId) {
      const stored = await inspectStoredIntent(previousId, { versionId: version.id, amountMinor: dueMinor, currency: version.currency })
      if (stored.kind === 'busy') return refuse('busy')
      if (stored.kind === 'paying') return refuse('already_paying')
      if (stored.kind === 'live') {
        return { ok: true, clientSecret: stored.clientSecret, amountMinor: dueMinor, currency: version.currency }
      }
      // 'replace': fall through; previousId stays the compare-and-set guard of the store below.
    }

    // The attempt counter moves by compare-and-set: of two concurrent requests one gets the next attempt, the other is told
    // to retry (and then reuses the winner's intent).
    const attempt = previousAttempt + 1
    const { data: claimed, error: claimError } = await supabase
      .from('quotes')
      .update({ remainder_attempt: attempt })
      .eq('id', quote.id)
      .eq('remainder_attempt', previousAttempt)
      .select('id')
    if (claimError) throw dbFailure('attempt write')
    if (!Array.isArray(claimed) || claimed.length === 0) return refuse('busy')

    const customerId = await ensureQuoteStripeCustomer(quote)
    if (customerId !== quote.stripe_customer_id) {
      const { error } = await supabase.from('quotes').update({ stripe_customer_id: customerId }).eq('id', quote.id)
      if (error) throw dbFailure('customer write')
    }

    const pi = await stripe.paymentIntents.create(
      {
        amount: dueMinor,
        currency: version.currency,
        customer: customerId,
        payment_method_types: ['card'],
        metadata: quoteMetadata('card_quote_remainder', {
          quoteId: quote.id,
          versionId: version.id,
          quoteReference: quote.reference,
          attempt,
        }),
      },
      { idempotencyKey: stripeKeys.quoteRemainder(quote.id, attempt) },
    )
    if (!pi.client_secret) throw new Error('remainder payment intent has no client secret')

    // 5. Store the intent on the quote by compare-and-set against the intent we replaced (or null). A concurrent request that
    // stored its own intent first wins; ours is canceled and the client is told to retry.
    const base = supabase
      .from('quotes')
      .update({ remainder_payment_intent_id: pi.id, remainder_amount_minor: dueMinor, updated_at: new Date(nowMs).toISOString() })
      .eq('id', quote.id)
      .is('remainder_paid_at', null)
    const guarded = previousId ? base.eq('remainder_payment_intent_id', previousId) : base.is('remainder_payment_intent_id', null)
    const { data: stored, error: storeError } = await guarded.select('id')
    if (storeError) {
      await cancelOwnIntent(quote.id, pi.id)
      throw dbFailure('intent write')
    }
    if (!Array.isArray(stored) || stored.length === 0) {
      await cancelOwnIntent(quote.id, pi.id)
      return refuse('busy')
    }

    await appendQuoteEvent(quote.id, {
      key: `remainder_started:${pi.id}`,
      kind: 'remainder_started',
      versionId: version.id,
      stripeObjectId: pi.id,
      amountMinor: dueMinor,
      currency: version.currency,
      actor: { type: 'client' },
    })
    return { ok: true, clientSecret: pi.client_secret, amountMinor: dueMinor, currency: version.currency }
  } catch (err) {
    if (err instanceof RemainderWriteError) throw err
    console.error('[quote-remainder] stripe call failed', {
      quoteId: quote.id,
      class: classifyStripeError(err),
      code: stripeErrorCode(err),
    })
    return refuse('stripe_error')
  }
}

/**
 * What the stored remainder intent allows. A live intent that does not match the current amount (a trip was cancelled since,
 * T-92-73) is cancelled with the void key and replaced, never handed to the client. A cancel that fails is 'busy': the intent
 * may have moved on meanwhile (the client may be paying it right now), so nothing is guessed and the client retries.
 */
async function inspectStoredIntent(
  intentId: string,
  expected: { versionId: string; amountMinor: number; currency: string },
): Promise<StoredIntent> {
  const stripe = getPaymentsStripe()
  let pi: {
    id: string
    status: string
    amount?: number
    currency?: string
    client_secret?: string | null
    metadata?: Record<string, string> | null
  }
  try {
    pi = (await stripe.paymentIntents.retrieve(intentId)) as unknown as typeof pi
  } catch (err) {
    if (isMissingResource(err)) return { kind: 'replace' }
    throw err
  }

  if (pi.status === 'canceled') return { kind: 'replace' }
  if (PAYING_STATUSES.has(pi.status)) return { kind: 'paying', id: pi.id }
  if (!LIVE_STATUSES.has(pi.status)) return { kind: 'busy' }

  const matches =
    pi.amount === expected.amountMinor && pi.currency === expected.currency && pi.metadata?.versionId === expected.versionId
  if (matches && pi.client_secret) return { kind: 'live', id: pi.id, clientSecret: pi.client_secret }

  try {
    await stripe.paymentIntents.cancel(pi.id, undefined, { idempotencyKey: stripeKeys.quoteRemainderVoid(pi.id) })
  } catch (err) {
    console.warn('[quote-remainder] stale remainder intent not canceled', {
      class: classifyStripeError(err),
      code: stripeErrorCode(err),
    })
    return { kind: 'busy' }
  }
  return { kind: 'replace' }
}

/** Best effort: an intent that lost the compare-and-set was never handed to anyone, so a failed cancel is only logged. */
async function cancelOwnIntent(quoteId: string, intentId: string): Promise<void> {
  try {
    await getPaymentsStripe().paymentIntents.cancel(intentId, undefined, {
      idempotencyKey: stripeKeys.quoteRemainderVoid(intentId),
    })
  } catch (err) {
    console.warn('[quote-remainder] own remainder intent not canceled', {
      quoteId,
      class: classifyStripeError(err),
      code: stripeErrorCode(err),
    })
  }
}

// == the succeeded intent ============================================================================================

export interface QuoteRemainderOutcome {
  outcome: 'paid' | 'replayed' | 'orphan_refunded' | 'mismatch' | 'ignored'
}

type Row = Record<string, unknown>

interface RemainderTrip {
  id: string
  lineId: string
  paidAt: string | null
  remainderMinor: number
}

const moneyOf = (pi: Stripe.PaymentIntent): { amountMinor: number; currency: 'eur' | 'czk' } => ({
  amountMinor: pi.amount_received || pi.amount,
  currency: pi.currency === 'czk' ? 'czk' : 'eur',
})

async function readOne<T>(table: string, column: string, value: string): Promise<T | null> {
  const { data, error } = await createSupabaseServiceClient().from(table).select('*').eq(column, value).maybeSingle()
  if (error) throw new Error(`quote ${table} lookup failed`)
  return (data as T | null) ?? null
}

/** The version the client paid for: the accepted one, else the current one. */
async function readPaidVersion(quote: QuoteRow): Promise<QuoteVersionRow | null> {
  const versionId = quote.accepted_version_id ?? quote.current_version_id
  if (!versionId) return null
  const { data, error } = await createSupabaseServiceClient()
    .from('quote_versions')
    .select('*')
    .eq('id', versionId)
    .eq('quote_id', quote.id)
    .maybeSingle()
  if (error) throw new Error('quote version lookup failed')
  return (data as QuoteVersionRow | null) ?? null
}

/** The quote-mode trips that are not cancelled, with the remainder of their line (PostgREST sends bigint as text). */
async function readTrips(quoteId: string, versionId: string): Promise<RemainderTrip[]> {
  const supabase = createSupabaseServiceClient()
  const lines = await supabase.from('quote_version_lines').select('id, remainder_minor').eq('version_id', versionId)
  if (lines.error) throw new Error('quote lines lookup failed')
  const remainderOf = new Map(
    ((lines.data ?? []) as Row[]).map((l) => [String(l.id), l.remainder_minor == null ? 0 : Number(l.remainder_minor)]),
  )
  const bookings = await supabase
    .from('bookings')
    .select('id, quote_line_id, status, paid_at, payment_mode')
    .eq('quote_id', quoteId)
  if (bookings.error) throw new Error('quote bookings lookup failed')
  return ((bookings.data ?? []) as Row[])
    .filter((b) => b.payment_mode === 'quote' && b.status !== 'cancelled' && typeof b.quote_line_id === 'string')
    .map((b) => ({
      id: String(b.id),
      lineId: String(b.quote_line_id),
      paidAt: (b.paid_at as string | null) ?? null,
      remainderMinor: remainderOf.get(String(b.quote_line_id)) ?? 0,
    }))
}

/**
 * Applies one succeeded remainder PaymentIntent to its quote. Returns what happened; throws (so the caller answers 500 and
 * Stripe delivers the event again) when money arrived and the bookkeeping could not be finished.
 *
 *   ignored    not a succeeded remainder with usable metadata, or an unknown quote
 *   replayed   this very intent was already recorded: nothing is decided again, and an interrupted earlier run is finished
 *   paid       first time: the quote and its trips are marked paid
 */
export async function applyQuoteRemainderPaid(pi: Stripe.PaymentIntent, actor: LedgerActor): Promise<QuoteRemainderOutcome> {
  if (pi.status !== 'succeeded') return { outcome: 'ignored' }
  const meta = (pi.metadata ?? {}) as Record<string, string | undefined>
  const quoteId = meta.quoteId
  const metaVersionId = meta.versionId
  if (meta.kind !== REMAINDER_KIND || !quoteId || !UUID_RE.test(quoteId) || !metaVersionId || !UUID_RE.test(metaVersionId)) {
    console.warn('[quote-remainder] not a quote remainder', { stripeObjectId: pi.id })
    return { outcome: 'ignored' }
  }
  const quote = await readOne<QuoteRow>('quotes', 'id', quoteId)
  if (!quote) {
    console.error('[quote-remainder] remainder for an unknown quote', { stripeObjectId: pi.id, quoteId })
    return { outcome: 'ignored' }
  }

  const version = await readPaidVersion(quote)

  // RECORDED: a remainder this quote already recorded is never decided again; the bookkeeping is only completed.
  if (quote.remainder_payment_intent_id === pi.id && quote.remainder_paid_at) {
    if (!version) return { outcome: 'ignored' }
    await settle(quote, version, pi, actor, quote.remainder_paid_at)
    return { outcome: 'replayed' }
  }

  // OWNED: the intent the quote stored, for the paid version, while the quote is live and the remainder is not yet recorded.
  // Anything else (another or replaced intent, a second payment after the remainder was recorded, a quote cancelled or
  // voided before the money landed) is not this quote's money: it goes back (T-92-74).
  const owned =
    version !== null &&
    quote.remainder_payment_intent_id === pi.id &&
    !quote.remainder_paid_at &&
    metaVersionId === version.id &&
    quote.status === 'paid' &&
    !quote.cancelled_at &&
    !quote.voided_at
  if (!owned) return refundOrphan(quote, pi, actor, notOwnedReason(quote, pi.id, metaVersionId, version))

  const { amountMinor, currency } = moneyOf(pi)
  const trips = await readTrips(quote.id, version.id)
  const dueMinor = trips.filter((t) => !t.paidAt).reduce((sum, t) => sum + t.remainderMinor, 0)
  if (amountMinor !== dueMinor || currency !== version.currency) {
    return recordMismatch(quote, version, pi, actor)
  }

  // The exactly-once gate: only the call that changes remainder_paid_at from null carries on.
  const paidAt = new Date().toISOString()
  const { data, error } = await createSupabaseServiceClient()
    .from('quotes')
    .update({ remainder_paid_at: paidAt, remainder_amount_minor: amountMinor, updated_at: paidAt })
    .eq('id', quote.id)
    .eq('remainder_payment_intent_id', pi.id)
    .eq('status', 'paid')
    .is('remainder_paid_at', null)
    .is('cancelled_at', null)
    .select('id')
  if (error) throw new Error('quote remainder write failed')
  if (!Array.isArray(data) || data.length === 0) {
    const latest = await readOne<QuoteRow>('quotes', 'id', quote.id)
    if (latest?.remainder_payment_intent_id === pi.id && latest.remainder_paid_at) {
      await settle(latest, version, pi, actor, latest.remainder_paid_at)
      return { outcome: 'replayed' }
    }
    // The quote changed under the payment (cancelled or voided since the read): not this quote's money any more.
    return refundOrphan(latest ?? quote, pi, actor, 'cancelled')
  }

  await settle(quote, version, pi, actor, paidAt)
  return { outcome: 'paid' }
}

/** Why the payment is not the quote's, as a short code for the event row and the alert. */
function notOwnedReason(quote: QuoteRow, paymentIntentId: string, versionId: string, version: QuoteVersionRow | null): string {
  if (quote.voided_at || quote.status === 'voided') return 'voided'
  if (quote.cancelled_at) return 'cancelled'
  if (quote.remainder_payment_intent_id !== paymentIntentId) return quote.remainder_paid_at ? 'already_paid' : 'intent_mismatch'
  if (!version || versionId !== version.id) return 'version_mismatch'
  return 'not_owned'
}

/**
 * The payment is not the live quote's (T-92-74): refund it in full, record it, tell the operator. Each step is exactly-once on
 * its own key, so a redelivery after a crash between two of them completes the rest and repeats nothing: the refund key is
 * fixed (Stripe replays the first answer), the orphan_refunded row and the alert are claimed by their keys, and a redelivery
 * that finds the row refunds nothing more. A refund that fails is recorded and alerted once and thrown, so Stripe delivers
 * the event again.
 */
async function refundOrphan(quote: QuoteRow, pi: Stripe.PaymentIntent, actor: LedgerActor, reason: string): Promise<QuoteRemainderOutcome> {
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
        console.error('[quote-remainder] orphan remainder not refunded', { quoteId: quote.id, stripeObjectId: pi.id, code })
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
          console.error('[quote-remainder] refund failure not recorded', { quoteId: quote.id, stripeObjectId: pi.id })
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
      errorCode: `remainder_${reason}`,
      actor,
    })
  }

  await sendQuoteOperatorAlert('quote_orphan_refunded', quoteRef, {
    eventKey: `alert:quote_orphan_refunded:${pi.id}`,
    code: `remainder_${reason}`,
    amountMinor,
    currency,
  })
  return { outcome: 'orphan_refunded' }
}

/**
 * The quote's own intent was paid but the amount no longer matches what is due (a trip was cancelled meanwhile, T-92-75):
 * nothing is stamped and nothing is refunded (a person decides), one remainder_failed row and one operator alert per payment.
 * The intent stays on the quote as succeeded, so the page answers already_paying and the client can not pay a second time.
 */
async function recordMismatch(
  quote: QuoteRow,
  version: QuoteVersionRow,
  pi: Stripe.PaymentIntent,
  actor: LedgerActor,
): Promise<QuoteRemainderOutcome> {
  const { amountMinor, currency } = moneyOf(pi)
  console.error('[quote-remainder] paid amount does not match what is due', { quoteId: quote.id, stripeObjectId: pi.id })
  await appendQuoteEvent(quote.id, {
    key: `remainder_mismatch:${pi.id}`,
    kind: 'remainder_failed',
    versionId: version.id,
    stripeObjectId: pi.id,
    amountMinor,
    currency,
    errorCode: 'amount_mismatch',
    actor,
  })
  await sendQuoteOperatorAlert(
    'quote_remainder_mismatch',
    { id: quote.id, reference: quote.reference },
    { eventKey: `alert:quote_remainder_mismatch:${pi.id}`, code: 'amount_mismatch', amountMinor, currency },
  )
  return { outcome: 'mismatch' }
}

/**
 * The receipt, once per payment: the sent row (key email:remainder_paid:<pi>) means delivered; a failed send leaves a failed
 * row under another key and no sent row, so a later delivery of the event sends it again (Resend drops a double through the
 * idempotency key). It never throws: a receipt must not fail a payment that is already recorded.
 */
async function sendReceipt(quote: QuoteRow, version: QuoteVersionRow, pi: Stripe.PaymentIntent, actor: LedgerActor): Promise<void> {
  const sentKey = `email:remainder_paid:${pi.id}`
  const { amountMinor } = moneyOf(pi)
  try {
    if (await hasQuoteEvent(quote.id, sentKey)) return
    let outcome: 'sent' | 'failed' = 'failed'
    let errorCode = 'send_failed'
    try {
      const rendered = await renderQuoteRemainderPaidEmail({ quote, version, amountMinor })
      outcome = await sendQuoteEmail({
        to: quote.client_email,
        subject: rendered.subject,
        html: rendered.html,
        idempotencyKey: `quote-remainder-paid:${quote.id}:${pi.id}`,
      })
    } catch {
      errorCode = 'render_failed'
    }
    await appendQuoteEvent(
      quote.id,
      outcome === 'sent'
        ? { key: sentKey, kind: 'email_sent', versionId: version.id, actor }
        : { key: `email_failed:remainder_paid:${pi.id}`, kind: 'email_failed', versionId: version.id, errorCode, actor },
    )
  } catch {
    console.error('[quote-remainder] receipt not recorded', { quoteId: quote.id, stripeObjectId: pi.id })
  }
}

/**
 * The bookkeeping after the quote is stamped, every step idempotent so a replay finishes an interrupted run: paid_at on the
 * quote-mode trips that are not paid, one quote_remainder ledger row per trip with a remainder, one remainder_paid event.
 */
async function settle(
  quote: QuoteRow,
  version: QuoteVersionRow,
  pi: Stripe.PaymentIntent,
  actor: LedgerActor,
  paidAt: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { amountMinor, currency } = moneyOf(pi)
  const trips = await readTrips(quote.id, version.id)

  const unpaid = trips.filter((t) => !t.paidAt).map((t) => t.id)
  if (unpaid.length > 0) {
    const { error } = await supabase.from('bookings').update({ paid_at: paidAt }).in('id', unpaid).is('paid_at', null)
    if (error) throw new Error('quote remainder bookings write failed')
  }

  for (const trip of trips) {
    if (trip.remainderMinor <= 0) continue
    await appendPaymentEvent(trip.id, {
      key: `quote_remainder:${pi.id}`,
      kind: 'quote_remainder',
      stripeObjectId: pi.id,
      amountMinor: trip.remainderMinor,
      currency,
      actor,
    })
  }

  await appendQuoteEvent(quote.id, {
    key: `remainder_paid:${pi.id}`,
    kind: 'remainder_paid',
    versionId: version.id,
    stripeObjectId: pi.id,
    amountMinor,
    currency,
    actor,
  })

  await sendReceipt(quote, version, pi, actor)
}
