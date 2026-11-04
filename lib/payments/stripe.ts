// Stripe client, idempotency keys, metadata and error classification for the card-on-file flow
// (Phase 88, plan 88-08; HOLD-01, Research Pattern 5 rule 2, Pitfall 2).
//
// Server-only by use: it is imported by API routes and the payment engine, never by a component.
// (No `server-only` import: that package throws under vitest, and nothing client-side imports this file.)
//
// Conventions every later Phase 88 plan follows:
//   - every Stripe create carries an idempotency key from `stripeKeys` (deterministic, ids + purpose + an
//     integer, never personal data), which is what makes `maxNetworkRetries: 2` safe;
//   - every Stripe object carries `cardMetadata` only: kind + cofBookingId + attempt + reference (+ a promo
//     code). The legacy booking-id key is never used here, so the legacy webhook branches can not pick
//     a card object up (Research Pattern 5 rule 2).

import Stripe from 'stripe'

let _stripe: Stripe | null = null

/** Lazy client: STRIPE_SECRET_KEY is Production-only, so nothing may touch it at module load. */
export function getPaymentsStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      // Safe only because every create carries an idempotency key (stripeKeys below).
      maxNetworkRetries: 2,
    })
  }
  return _stripe
}

/**
 * Deterministic idempotency keys. `n` is the attempt counter the caller persists (hold_attempts,
 * charge_attempts, ...), `consentId` the booking_payment_consents row of the current attempt.
 */
export const stripeKeys = {
  customer: (bookingId: string) => `cus:${bookingId}`,
  setup: (bookingId: string, consentId: string) => `si:${bookingId}:${consentId}`,
  holdNow: (bookingId: string, consentId: string) => `pi_now:${bookingId}:${consentId}`,
  voidHoldNow: (piId: string) => `pi_void:${piId}`,
  hold: (bookingId: string, n: number) => `hold:${bookingId}:${n}`,
  release: (bookingId: string, n: number) => `rel:${bookingId}:${n}`,
  capture: (bookingId: string, n: number) => `cap:${bookingId}:${n}`,
  charge: (bookingId: string, n: number) => `chg:${bookingId}:${n}`,
  difference: (bookingId: string, n: number) => `diff:${bookingId}:${n}`,
  refund: (bookingId: string, leg: string) => `refund:${bookingId}:${leg}`,
  link: (bookingId: string, tag: string | number) => `link:${bookingId}:${tag}`,
} as const

export type CardKind =
  | 'card_setup'
  | 'card_hold_now'
  | 'card_hold'
  | 'card_charge'
  | 'card_difference'
  | 'card_recovery'

/**
 * The only metadata a card-flow Stripe object may carry. Ids and the public booking reference only;
 * `promoCode` is added solely when a promo applied, so the webhook can claim it after the money moves.
 */
export function cardMetadata(
  kind: CardKind,
  input: { bookingId: string; attempt: number | string; bookingReference: string; promoCode?: string | null },
): Record<string, string> {
  const meta: Record<string, string> = {
    kind,
    cofBookingId: input.bookingId,
    attempt: String(input.attempt),
    bookingReference: input.bookingReference,
  }
  const promo = input.promoCode?.trim()
  if (promo) meta.promoCode = promo
  return meta
}

export type StripeErrorClass = 'card_declined' | 'auth_required' | 'transient' | 'invalid'

interface StripeErrorShape {
  type?: unknown
  code?: unknown
  decline_code?: unknown
  statusCode?: unknown
}

function asShape(err: unknown): StripeErrorShape {
  return err && typeof err === 'object' ? (err as StripeErrorShape) : {}
}

/**
 * Duck-typed on the stripe-node error `type` (its class name), so it works with the real SDK, with a
 * mocked SDK and with the in-memory fake. Unknown errors are 'invalid': never retried blindly.
 */
export function classifyStripeError(err: unknown): StripeErrorClass {
  const e = asShape(err)
  const status = typeof e.statusCode === 'number' ? e.statusCode : undefined
  switch (e.type) {
    case 'StripeCardError':
      return e.code === 'authentication_required' || e.decline_code === 'authentication_required'
        ? 'auth_required'
        : 'card_declined'
    case 'StripeConnectionError':
    case 'StripeRateLimitError':
      return 'transient'
    case 'StripeAPIError':
      return status === undefined || status >= 500 ? 'transient' : 'invalid'
    case 'StripeInvalidRequestError':
    case 'StripeIdempotencyError':
      return 'invalid'
    default:
      return status !== undefined && status >= 500 ? 'transient' : 'invalid'
  }
}

/** The decline code, else the error code, else 'unknown'. At most 60 characters; never a message. */
export function stripeErrorCode(err: unknown): string {
  const e = asShape(err)
  const raw =
    typeof e.decline_code === 'string' && e.decline_code
      ? e.decline_code
      : typeof e.code === 'string' && e.code
        ? e.code
        : 'unknown'
  return raw.slice(0, 60)
}
