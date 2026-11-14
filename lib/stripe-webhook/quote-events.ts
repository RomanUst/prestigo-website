// Webhook handlers for the quote payments (Phase 92, plan 92-31; QUOTE-03, QUOTE-05, D-18; T-92-57, T-92-60, T-92-99).
//
// dispatch.ts routes every PaymentIntent of metadata.kind card_quote_deposit (and the failure / cancel / dispute events of a
// quote's payments) here BEFORE the legacy chain, which builds a booking from payment_intent.succeeded and must never see a
// quote payment.
//
//   handleQuoteDepositPaid     a succeeded deposit -> applyQuoteDepositPaid (lib/quotes/convert.ts), the very function the
//                              payment tick uses to reconcile a lost event. It THROWS when money arrived without bookings or an
//                              orphan refund failed: the route then answers 500 and Stripe delivers the event again. Every other
//                              outcome (converted, replayed, orphan_refunded, ignored) is a normal return, answered 200.
//   handleQuoteRemainderPaid   a succeeded remainder -> applyQuoteRemainderPaid (lib/quotes/remainder.ts), also the tick's function; a throw answers 500.
//   handleQuotePaymentFailed   a declined deposit or remainder: one quote event (the decline code) and one operator alert; no
//                              state change anywhere, the hold engine is never involved.
//   handleQuotePaymentCanceled a cancelled deposit intent: one deposit_canceled event only.
//   handleQuoteDispute         a dispute on a quote's deposit or remainder payment: one dispute_opened event, one operator alert.
//
// Every write is keyed in the quote event ledger, so a redelivery adds nothing. Logs carry ids and codes only, never a client name,
// email, phone, address or a database message. This file never reads the card-flow switch and never names a payment RPC
// (tests/payment-state-writers-gate.test.ts).

import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'
import type { LedgerActor } from '@/lib/payments/state'
import { getPaymentsStripe } from '@/lib/payments/stripe'
import { sendQuoteOperatorAlert } from '@/lib/quotes/alerts'
import { applyQuoteDepositPaid } from '@/lib/quotes/convert'
import { appendQuoteEvent } from '@/lib/quotes/events'
import { applyQuoteRemainderPaid } from '@/lib/quotes/remainder'
import type { QuoteRow } from '@/lib/quotes/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEPOSIT_KIND = 'card_quote_deposit'
const REMAINDER_KIND = 'card_quote_remainder'

export const WEBHOOK_ACTOR: LedgerActor = { type: 'webhook', id: null }

type QuoteKey = Pick<QuoteRow, 'id' | 'reference'> & { current_version_id: string | null }

const idOf = (v: string | { id?: string } | null | undefined): string | null =>
  typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : null

const metaOf = (pi: Stripe.PaymentIntent): Record<string, string | undefined> =>
  (pi.metadata ?? {}) as Record<string, string | undefined>

/** The quote a payment's metadata names, or null (a log line, never a throw: no retry can make an unknown quote appear). */
async function quoteOfMetadata(pi: Stripe.PaymentIntent): Promise<QuoteKey | null> {
  const quoteId = metaOf(pi).quoteId
  if (!quoteId || !UUID_RE.test(quoteId)) {
    console.error('[quote-webhook] payment without a valid quote id', { stripeObjectId: pi.id })
    return null
  }
  const { data, error } = await createSupabaseServiceClient()
    .from('quotes')
    .select('id, reference, current_version_id')
    .eq('id', quoteId)
    .maybeSingle()
  if (error) throw new Error('quote lookup failed')
  if (!data) {
    console.error('[quote-webhook] payment for an unknown quote', { stripeObjectId: pi.id, quoteId })
    return null
  }
  return data as QuoteKey
}

function declineCodeOf(pi: Stripe.PaymentIntent): string {
  const err = pi.last_payment_error
  return (err?.decline_code || err?.code || 'unknown').slice(0, 60)
}

/**
 * payment_intent.succeeded of a quote deposit. The metadata must name a quote and a version (uuids) and carry the deposit kind;
 * anything else is acknowledged without a write (a retry can not fix it). A throw from the conversion is NOT caught: the route
 * answers 500 and Stripe redelivers (the conversion is exactly-once in the database).
 */
export async function handleQuoteDepositPaid(pi: Stripe.PaymentIntent, actor: LedgerActor = WEBHOOK_ACTOR): Promise<void> {
  const meta = metaOf(pi)
  if (
    meta.kind !== DEPOSIT_KIND ||
    !meta.quoteId ||
    !UUID_RE.test(meta.quoteId) ||
    !meta.versionId ||
    !UUID_RE.test(meta.versionId)
  ) {
    console.error('[quote-webhook] deposit event with unusable metadata', { stripeObjectId: pi.id })
    return
  }
  const result = await applyQuoteDepositPaid(pi, actor)
  console.log('[quote-webhook] deposit handled', { stripeObjectId: pi.id, quoteId: meta.quoteId, outcome: result.outcome })
}

/**
 * payment_intent.succeeded of a quote remainder (92-23, D-16): applyQuoteRemainderPaid, the very function the payment tick uses to
 * reconcile a lost event. Unusable metadata is acknowledged without a write; a throw is NOT caught, so the route answers 500 and
 * Stripe delivers the event again (the bookkeeping is exactly-once and a replay finishes an interrupted run).
 */
export async function handleQuoteRemainderPaid(pi: Stripe.PaymentIntent, actor: LedgerActor = WEBHOOK_ACTOR): Promise<void> {
  const meta = metaOf(pi)
  if (
    meta.kind !== REMAINDER_KIND ||
    !meta.quoteId ||
    !UUID_RE.test(meta.quoteId) ||
    !meta.versionId ||
    !UUID_RE.test(meta.versionId)
  ) {
    console.error('[quote-webhook] remainder event with unusable metadata', { stripeObjectId: pi.id })
    return
  }
  const result = await applyQuoteRemainderPaid(pi, actor)
  console.log('[quote-webhook] remainder handled', { stripeObjectId: pi.id, quoteId: meta.quoteId, outcome: result.outcome })
}

/** payment_intent.payment_failed of a quote deposit or remainder: a ledger event with the decline code and one operator alert. */
export async function handleQuotePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const kind = metaOf(pi).kind
  if (kind !== DEPOSIT_KIND && kind !== REMAINDER_KIND) return
  const quote = await quoteOfMetadata(pi)
  if (!quote) return

  const code = declineCodeOf(pi)
  const isDeposit = kind === DEPOSIT_KIND
  const currency = pi.currency === 'czk' ? 'czk' : pi.currency === 'eur' ? 'eur' : null
  await appendQuoteEvent(quote.id, {
    key: `${isDeposit ? 'deposit_failed' : 'remainder_failed'}:${pi.id}`,
    kind: isDeposit ? 'deposit_failed' : 'remainder_failed',
    versionId: metaOf(pi).versionId && UUID_RE.test(metaOf(pi).versionId as string) ? (metaOf(pi).versionId as string) : null,
    stripeObjectId: pi.id,
    amountMinor: typeof pi.amount === 'number' ? pi.amount : null,
    currency,
    errorCode: code,
    actor: WEBHOOK_ACTOR,
  })
  await sendQuoteOperatorAlert('quote_payment_failed', quote, {
    eventKey: `alert:quote_payment_failed:${pi.id}`,
    code,
    amountMinor: typeof pi.amount === 'number' ? pi.amount : undefined,
    currency: currency ?? undefined,
  })
}

/** payment_intent.canceled of a quote deposit: one deposit_canceled event. A remainder intent's cancellation is plan 92-23's. */
export async function handleQuotePaymentCanceled(pi: Stripe.PaymentIntent): Promise<void> {
  if (metaOf(pi).kind !== DEPOSIT_KIND) return
  const quote = await quoteOfMetadata(pi)
  if (!quote) return
  const versionId = metaOf(pi).versionId
  await appendQuoteEvent(quote.id, {
    key: `deposit_canceled:${pi.id}`,
    kind: 'deposit_canceled',
    versionId: versionId && UUID_RE.test(versionId) ? versionId : null,
    stripeObjectId: pi.id,
    actor: WEBHOOK_ACTOR,
  })
}

/** The PaymentIntent id of a disputed charge: on the dispute itself, else through the charge. null when neither is readable. */
async function paymentIntentOfDispute(dispute: Stripe.Dispute): Promise<string | null> {
  const direct = idOf(dispute.payment_intent as string | { id?: string } | null | undefined)
  if (direct) return direct
  const chargeId = idOf(dispute.charge as string | { id?: string } | null | undefined)
  if (!chargeId) return null
  try {
    const charge = (await getPaymentsStripe().charges.retrieve(chargeId)) as Stripe.Charge
    return idOf(charge.payment_intent as string | { id?: string } | null | undefined)
  } catch {
    // A read error is retried through Stripe's redelivery of the event (the booking dispute handler logs the same way).
    console.error('[quote-webhook] dispute charge lookup failed', { stripeObjectId: chargeId })
    throw new Error('dispute charge lookup failed')
  }
}

/** charge.dispute.created on the deposit or the remainder charge of a quote: one dispute_opened event and one alert. */
export async function handleQuoteDispute(dispute: Stripe.Dispute): Promise<void> {
  if (!dispute?.id) return
  const paymentIntentId = await paymentIntentOfDispute(dispute)
  if (!paymentIntentId) return

  const supabase = createSupabaseServiceClient()
  const quotes = new Map<string, QuoteKey>()
  for (const column of ['deposit_payment_intent_id', 'remainder_payment_intent_id'] as const) {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, reference, current_version_id')
      .eq(column, paymentIntentId)
    if (error) throw new Error('dispute quote lookup failed')
    for (const row of Array.isArray(data) ? (data as QuoteKey[]) : []) quotes.set(row.id, row)
  }

  const currency = dispute.currency === 'czk' ? 'czk' : dispute.currency === 'eur' ? 'eur' : null
  for (const quote of quotes.values()) {
    await appendQuoteEvent(quote.id, {
      key: `dispute_opened:${dispute.id}`,
      kind: 'dispute_opened',
      stripeObjectId: dispute.id,
      amountMinor: typeof dispute.amount === 'number' ? dispute.amount : null,
      currency,
      errorCode: typeof dispute.reason === 'string' ? dispute.reason : null,
      actor: WEBHOOK_ACTOR,
    })
    await sendQuoteOperatorAlert('quote_dispute', quote, {
      eventKey: `alert:quote_dispute:${dispute.id}`,
      code: typeof dispute.reason === 'string' ? dispute.reason : undefined,
      amountMinor: typeof dispute.amount === 'number' ? dispute.amount : undefined,
      currency: currency ?? undefined,
    })
  }
}
