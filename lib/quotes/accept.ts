// Accept a quote and start its deposit payment (Phase 92, plan 92-16; QUOTE-03, QUOTE-05; D-05, D-07, D-08, D-18).
//
// Order is the contract (T-92-51): resolve the link (the only validity rule is quoteLinkState through the resolver, so a
// past first pickup, an expired, voided or superseded quote is the same null, D-05), cross-check what the client saw,
// render the consent text on the server, WRITE THE ACCEPTANCE ROW, and only then touch Stripe. The amount is the frozen
// version's deposit_minor and nothing the client sent (T-92-49): the request only echoes the version number and deposit
// it was shown, and any difference is quote_changed.
//
// The deposit is one PaymentIntent on the quote's own Stripe customer: card only, automatic capture,
// setup_future_usage 'off_session' (the card is saved for the remainder, D-21 / D-22), metadata from quoteMetadata
// ('card_quote_deposit') so no booking-keyed handler can match it, and its id is stored on the quote and on the
// acceptance, never on a booking (D-18).
//
// Server only. Logs carry ids and Stripe codes only: never the token, a hash, an email or a Stripe message.

import { createSupabaseServiceClient } from '@/lib/supabase'
import { getPaymentSettings } from '@/lib/payments/config'
import { ensureQuoteStripeCustomer } from '@/lib/payments/customer'
import { classifyStripeError, getPaymentsStripe, quoteMetadata, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
import { renderQuoteTerms } from '@/lib/quotes/consent'
import { appendQuoteEvent } from '@/lib/quotes/events'
import { resolveQuoteToken, type ResolvedQuote } from '@/lib/quotes/resolve'

const IP_MAX = 64
const USER_AGENT_MAX = 300

export type AcceptQuoteResult =
  | { ok: true; clientSecret: string; amountMinor: number; currency: 'eur' | 'czk' }
  | {
      ok: false
      code: 'invalid_link' | 'quote_changed' | 'already_paid' | 'already_paying' | 'busy' | 'stripe_error'
    }

const refuse = (code: Extract<AcceptQuoteResult, { ok: false }>['code']): AcceptQuoteResult => ({ ok: false, code })

/** A database write that failed: the route answers a generic 502; the message never reaches a log line or a client. */
function dbFailure(what: string): Error {
  return new Error(`quote accept ${what} failed`)
}

/**
 * Compare-and-set sent | viewed -> accepted on the version the client saw. A quote already accepted on this same version
 * continues (a retry, a second tab); anything else that is not an offer any more is a refusal. Returns the refusal, or
 * null to continue.
 */
async function markAccepted(resolved: ResolvedQuote, nowMs: number): Promise<AcceptQuoteResult | null> {
  const supabase = createSupabaseServiceClient()
  const { quote, version } = resolved
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'accepted', accepted_version_id: version.id, accepted_at: new Date(nowMs).toISOString() })
    .eq('id', quote.id)
    .eq('current_version_id', version.id)
    .in('status', ['sent', 'viewed'])
    .select('id')
  if (error) throw dbFailure('status write')

  if (Array.isArray(data) && data.length > 0) {
    await appendQuoteEvent(quote.id, {
      key: `accepted:${version.id}`,
      kind: 'accepted',
      versionId: version.id,
      actor: { type: 'client' },
    })
    return null
  }

  // Not changed by us: look at what the quote is now.
  const { data: now, error: readError } = await supabase
    .from('quotes')
    .select('status, current_version_id, accepted_version_id, cancelled_at')
    .eq('id', quote.id)
    .maybeSingle()
  if (readError) throw dbFailure('status read')
  const row = now as { status?: string; current_version_id?: string; accepted_version_id?: string | null; cancelled_at?: string | null } | null
  if (!row) return refuse('invalid_link')
  if (row.status === 'paid' && !row.cancelled_at) return refuse('already_paid')
  if (row.status === 'accepted' && row.current_version_id === version.id && row.accepted_version_id === version.id && !row.cancelled_at) {
    return null
  }
  return refuse('invalid_link')
}

export async function acceptQuote(input: {
  token: string
  displayedVersionNo: number
  displayedDepositMinor: number
  ip: string
  userAgent: string
  nowMs?: number
}): Promise<AcceptQuoteResult> {
  const nowMs = input.nowMs ?? Date.now()

  // 1. The link decides everything: one null for every dead link, no price data leaves with it (D-05).
  const resolved = await resolveQuoteToken(input.token, nowMs)
  if (!resolved) return refuse('invalid_link')
  if (resolved.state === 'paid') return refuse('already_paid')
  const { quote, version } = resolved

  // 2. The server is the price authority: the deposit is the frozen version's, the request only cross-checks (T-92-49).
  const depositMinor = version.deposit_minor
  if (typeof depositMinor !== 'number' || !Number.isInteger(depositMinor) || depositMinor <= 0) return refuse('invalid_link')
  if (input.displayedVersionNo !== version.version_no || input.displayedDepositMinor !== depositMinor) {
    return refuse('quote_changed')
  }

  // 3. The exact text the client agrees to, rendered here (D-08), and the planned hold lead time of the remainder.
  const terms = await renderQuoteTerms({ resolved, nowMs })
  const settings = await getPaymentSettings()

  const supabase = createSupabaseServiceClient()

  // 4. The acceptance is on record BEFORE any Stripe call (T-92-51).
  const { data: acceptanceRow, error: acceptanceError } = await supabase
    .from('quote_acceptances')
    .insert({
      quote_id: quote.id,
      version_id: version.id,
      link_id: resolved.linkId,
      accepted_at: new Date(nowMs).toISOString(),
      ip: input.ip.slice(0, IP_MAX),
      user_agent: input.userAgent.slice(0, USER_AGENT_MAX),
      locale: version.locale,
      terms_version: terms.version,
      terms_sha256: terms.sha256,
      terms_rendered: terms.text,
      deposit_minor: depositMinor,
      currency: version.currency,
      hold_lead_hours: settings.leadHours,
    })
    .select('id')
    .single()
  const acceptanceId = (acceptanceRow as { id?: unknown } | null)?.id
  if (acceptanceError || typeof acceptanceId !== 'string') throw dbFailure('acceptance write')

  // 5. The quote is accepted on this version.
  const refused = await markAccepted(resolved, nowMs)
  if (refused) return refused

  // 6. Stripe: the quote's customer, then the one deposit PaymentIntent.
  let clientSecret: string
  let intentId: string
  try {
    const stripe = getPaymentsStripe()
    const customerId = await ensureQuoteStripeCustomer(quote)
    if (customerId !== quote.stripe_customer_id) {
      const { error } = await supabase.from('quotes').update({ stripe_customer_id: customerId }).eq('id', quote.id)
      if (error) throw dbFailure('customer write')
    }

    const pi = await stripe.paymentIntents.create(
      {
        amount: depositMinor,
        currency: version.currency,
        customer: customerId,
        payment_method_types: ['card'],
        setup_future_usage: 'off_session',
        metadata: quoteMetadata('card_quote_deposit', {
          quoteId: quote.id,
          versionId: version.id,
          quoteReference: quote.reference,
          acceptanceId,
        }),
      },
      { idempotencyKey: stripeKeys.quoteDeposit(version.id, acceptanceId) },
    )
    if (!pi.client_secret) throw new Error('deposit payment intent has no client secret')
    clientSecret = pi.client_secret
    intentId = pi.id
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('quote accept ')) throw err
    console.error('[quote-accept] stripe call failed', {
      quoteId: quote.id,
      class: classifyStripeError(err),
      code: stripeErrorCode(err),
    })
    return refuse('stripe_error')
  }

  // 7. Store the intent on the quote and on the acceptance, then the ledger event.
  {
    const { error } = await supabase.from('quotes').update({ deposit_payment_intent_id: intentId }).eq('id', quote.id)
    if (error) throw dbFailure('intent write')
  }
  {
    const { error } = await supabase.from('quote_acceptances').update({ payment_intent_id: intentId }).eq('id', acceptanceId)
    if (error) throw dbFailure('acceptance link')
  }
  await appendQuoteEvent(quote.id, {
    key: `deposit_started:${intentId}`,
    kind: 'deposit_started',
    versionId: version.id,
    stripeObjectId: intentId,
    amountMinor: depositMinor,
    currency: version.currency,
    actor: { type: 'client' },
  })

  return { ok: true, clientSecret, amountMinor: depositMinor, currency: version.currency }
}
