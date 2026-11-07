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

/**
 * Per-request timeout and automatic retries of the payments client (88-REVIEW A-WR-01). The worst case of ONE engine
 * call is (STRIPE_MAX_NETWORK_RETRIES + 1) x STRIPE_TIMEOUT_MS plus the SDK's short backoff; the engine lease
 * (lib/payments/config.ts LEASE_SECONDS) is sized for the longest call chain of one booking with that worst case, so a
 * lease can not lapse while its worker still waits on Stripe (tests/payments-stripe-errors.test.ts pins the sum).
 */
export const STRIPE_TIMEOUT_MS = 20_000
export const STRIPE_MAX_NETWORK_RETRIES = 2
/** The most Stripe calls one booking makes under one lease (settle: retrieve, capture, retrieve, search, difference). */
export const STRIPE_CALLS_PER_LEASE = 5

/** Lazy client: STRIPE_SECRET_KEY is Production-only, so nothing may touch it at module load. */
export function getPaymentsStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      // Safe only because every create carries an idempotency key (stripeKeys below).
      maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
      timeout: STRIPE_TIMEOUT_MS,
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
  // Phase 89 fee keys: case id + attempt, NEVER the amount (T-89-19). The amount is locked on the case, and a new
  // amount needs a definitive failure, which advances the attempt and so the key.
  feeCapture: (caseId: string, n: number) => `feecap:${caseId}:${n}`,
  feeCharge: (caseId: string, n: number) => `fee:${caseId}:${n}`,
  // `purpose`: full, a leg, recovery:<pi>, or fee:<caseId>:<amount>. A fee refund is the one key with the amount in it: the
  // operator may decide again with another amount, and the same key would answer an idempotency error (money WR-05).
  refund: (bookingId: string, purpose: string) => `refund:${bookingId}:${purpose}`,
  link: (bookingId: string, tag: string | number) => `link:${bookingId}:${tag}`,
} as const

export type CardKind =
  | 'card_setup'
  | 'card_hold_now'
  | 'card_hold'
  | 'card_charge'
  | 'card_difference'
  | 'card_recovery'
  | 'card_fee'

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

/**
 *   card_declined / auth_required  the client's card said no: the only classes that may email the client
 *   transient    retry later with the SAME idempotency key: network, rate limit, Stripe 5xx, and a 409 / lock (the
 *                same key is still in flight in another request, 88-REVIEW A-WR-01)
 *   config       our side is broken (revoked / expired / restricted key, 401 / 403): retry later, alert the operator,
 *                never charge an attempt to the client (88-REVIEW A-WR-02)
 *   idempotency  the key was already used with DIFFERENT parameters (for example the amount changed since a request
 *                that may have executed): the caller must look for what that request created and move to a new key
 *   invalid      anything else: a definitive failure
 */
export type StripeErrorClass = 'card_declined' | 'auth_required' | 'transient' | 'config' | 'idempotency' | 'invalid'

interface StripeErrorShape {
  type?: unknown
  code?: unknown
  decline_code?: unknown
  statusCode?: unknown
}

function asShape(err: unknown): StripeErrorShape {
  return err && typeof err === 'object' ? (err as StripeErrorShape) : {}
}

/** Codes of a request that collided with the same key (or object) still being processed: busy, not failed. */
const BUSY_CODES: ReadonlySet<string> = new Set(['idempotency_key_in_use', 'lock_timeout', 'rate_limit'])
/** Codes of a key problem on our side (Stripe answers some of them as invalid_request_error). */
const CONFIG_CODES: ReadonlySet<string> = new Set([
  'api_key_expired',
  'secret_key_required',
  'platform_api_key_expired',
  'testmode_charges_only',
  'livemode_mismatch',
])

/**
 * Duck-typed on the stripe-node error `type` (its class name), so it works with the real SDK, with a
 * mocked SDK and with the in-memory fake. Unknown errors are 'invalid': never retried blindly.
 */
export function classifyStripeError(err: unknown): StripeErrorClass {
  const e = asShape(err)
  const status = typeof e.statusCode === 'number' ? e.statusCode : undefined
  const code = typeof e.code === 'string' ? e.code : ''
  if (e.type === 'StripeCardError') {
    return e.code === 'authentication_required' || e.decline_code === 'authentication_required'
      ? 'auth_required'
      : 'card_declined'
  }
  // A 409 is the same idempotency key (or the same object) still in flight elsewhere: busy, never a failure.
  if (status === 409) return 'transient'
  // Any other idempotency error is a key reused with different parameters (HTTP 400, type idempotency_error).
  if (e.type === 'StripeIdempotencyError') return 'idempotency'
  if (BUSY_CODES.has(code)) return 'transient'
  if (CONFIG_CODES.has(code)) return 'config'
  switch (e.type) {
    case 'StripeConnectionError':
    case 'StripeRateLimitError':
      return 'transient'
    case 'StripeAuthenticationError':
    case 'StripePermissionError':
      return 'config'
    case 'StripeAPIError':
      return status === undefined || status >= 500 ? 'transient' : 'invalid'
    case 'StripeInvalidRequestError':
      return 'invalid'
    default:
      if (status === 401 || status === 403) return 'config'
      return status !== undefined && status >= 500 ? 'transient' : 'invalid'
  }
}

/** A Stripe error that says nothing about the client's card: it must never use up an attempt or email the client. */
export function isNotTheClientsFault(kind: StripeErrorClass): boolean {
  return kind === 'transient' || kind === 'config' || kind === 'idempotency'
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
