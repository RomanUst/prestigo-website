import Stripe from 'stripe'

// Lazy init — STRIPE_SECRET_KEY is Production-only; avoid module-load crash in Preview.
// Verbatim pattern from app/api/create-payment-intent/route.ts:26-37.
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 0,
    })
  }
  return _stripe
}

export interface CreateBookingPaymentLinkParams {
  bookingId: string
  bookingReference: string
  /** Server-recomputed/tolerance-checked amount — NEVER a client-submitted figure (T-64-01). */
  amountEur: number
  leg: 'outbound' | 'return' | null
  linkedBookingId?: string
}

/**
 * Create a Stripe Payment Link for a booking (ANEW-02). Payment Links are
 * stable, non-expiring, reusable URLs — Stripe mints a fresh internal
 * Checkout Session per visit, but the outward URL never changes (D-04).
 *
 * Metadata is set on BOTH the link and payment_intent_data: Payment Link
 * metadata is copied to the Checkout Session as a one-time snapshot, but is
 * NOT automatically copied to the resulting PaymentIntent
 * (docs.stripe.com/metadata "Copy metadata to another object > Exceptions").
 * The webhook reads session.metadata as the reconciliation source of truth
 * (see app/api/webhooks/stripe/route.ts); payment_intent_data.metadata is set
 * here only for Stripe Dashboard visibility / secondary convenience.
 *
 * restrictions.completed_sessions.limit: 1 auto-deactivates the link after
 * the first successful payment — defense in depth on top of webhook
 * idempotency, not a substitute for it (RESEARCH A3).
 */
export async function createBookingPaymentLink(
  params: CreateBookingPaymentLinkParams
): Promise<{ url: string; id: string }> {
  const metadata: Record<string, string> = {
    bookingId: params.bookingId,
    leg: params.leg ?? '',
    ...(params.linkedBookingId ? { linkedBookingId: params.linkedBookingId } : {}),
  }

  const paymentLink = await getStripe().paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(params.amountEur * 100),
          product_data: { name: `PRESTIGO Transfer — ${params.bookingReference}` },
        },
        quantity: 1,
      },
    ],
    // Restrict to card only — avoids the delayed/async payment-method
    // completion state machine (checkout.session.async_payment_succeeded).
    payment_method_types: ['card'],
    restrictions: { completed_sessions: { limit: 1 } },
    metadata,
    payment_intent_data: { metadata },
  })

  return { url: paymentLink.url, id: paymentLink.id }
}

/**
 * Deactivate a Payment Link so its URL can no longer be paid (CR-02).
 *
 * Payment Links are static/reusable, so a link minted for one amount keeps
 * charging that amount forever. When a booking leaves the payable state by a
 * path OTHER than the link itself — an operator manually confirms/cancels it,
 * or edits its price under override_price — the old link is stale: a client
 * paying it would capture money the webhook can no longer reconcile in place.
 * `paymentLinks.update(id, { active: false })` makes the URL show Stripe's
 * "no longer available" page. Idempotent and safe to call on an already
 * inactive link.
 */
export async function deactivateBookingPaymentLink(paymentLinkId: string): Promise<void> {
  await getStripe().paymentLinks.update(paymentLinkId, { active: false })
}
