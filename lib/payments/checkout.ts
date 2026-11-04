// Card-on-file checkout, server half (Phase 88, plan 88-08; HOLD-01, D-05, D-11, D-12).
//
// createCardCheckoutIntent (setup mode): one unpaid card_hold booking per attemptId, one Stripe Customer
// per booking, the consent record, a SetupIntent, then none|checkout_pending -> checkout_pending. Nothing
// is charged or authorised here: there is no PaymentIntent in this module's setup path and the booking
// keeps payment_intent_id NULL. The booking row and the consent exist BEFORE Stripe talks to the browser,
// so the webhook (plan 88-09) can confirm exactly one booking by metadata.cofBookingId (Pitfall 13).
//
// The caller (the intent route) has already validated, priced, checked eligibility and decided the mode.

import { generateBookingReference } from '@/lib/booking-reference'
import { buildBookingRow, captureUnpaidBooking, createSupabaseServiceClient } from '@/lib/supabase'
import { buildCheckoutMeta, type CheckoutBookingData, type PricedCheckout } from '@/lib/checkout/compute'
import { normalizeSiteLocale } from '@/i18n/locales'
import { buildConsentText, consentSha256 } from '@/lib/payments/consent'
import { CARD_CONSENT_VERSION, type ConsentMode } from '@/lib/payments/consent-text'
import type { PaymentCurrency } from '@/lib/payments/money'
import { applyTransition } from '@/lib/payments/state'
import { cardMetadata, getPaymentsStripe, stripeKeys } from '@/lib/payments/stripe'
import { holdDateIso } from '@/lib/payments/timing'

const USER_AGENT_MAX = 300
const IP_MAX = 64

export interface RecordConsentInput {
  bookingId: string
  mode: ConsentMode
  locale: unknown
  amountMinor: number
  currency: PaymentCurrency
  holdAtIso: string | null
  holdDateIso: string | null
  ip: string
  userAgent: string
}

/**
 * Stores what the client agreed to: the version, the full server-rendered text (never a client string),
 * its sha256, the locale, amount, planned hold time, acceptance time, IP and user agent (clamped).
 * Must complete before the SetupIntent client secret leaves the server.
 */
export async function recordConsent(input: RecordConsentInput): Promise<{ consentId: string; textSha256: string }> {
  const locale = normalizeSiteLocale(input.locale)
  const text = await buildConsentText({
    locale,
    mode: input.mode,
    amountMinor: input.amountMinor,
    currency: input.currency,
    holdDateIso: input.holdDateIso,
  })
  const textSha256 = consentSha256(text)

  const { data, error } = await createSupabaseServiceClient()
    .from('booking_payment_consents')
    .insert({
      booking_id: input.bookingId,
      mode: input.mode,
      text_version: CARD_CONSENT_VERSION,
      text_sha256: textSha256,
      text_rendered: text,
      locale,
      amount_minor: input.amountMinor,
      currency: input.currency,
      planned_hold_at: input.holdAtIso,
      accepted_at: new Date().toISOString(),
      ip: input.ip.slice(0, IP_MAX),
      user_agent: input.userAgent.slice(0, USER_AGENT_MAX),
    })
    .select('id')
    .single()
  const row = data as { id?: unknown } | null
  if (error || !row || typeof row.id !== 'string') throw new Error('consent record failed')
  return { consentId: row.id, textSha256 }
}

export interface CardCheckoutIntentInput {
  bookingData: CheckoutBookingData
  priced: PricedCheckout
  currency: PaymentCurrency
  attemptId: string
  /** Planned hold instant (computeHoldAt), epoch ms. */
  holdAtMs: number
  authenticatedUserId: string | null
  ip: string
  userAgent: string
}

export type CardCheckoutIntentResult =
  | { kind: 'secret'; clientSecret: string; bookingReference: string }
  | { kind: 'already_confirmed'; bookingReference: string }

interface CapturedBooking {
  id: string
  booking_reference: string
  client_first_name: string | null
  client_last_name: string | null
  client_email: string | null
  client_phone: string | null
  stripe_customer_id: string | null
}

export async function createCardCheckoutIntent(input: CardCheckoutIntentInput): Promise<CardCheckoutIntentResult> {
  const { bookingData, priced, currency, attemptId, holdAtMs } = input
  const supabase = createSupabaseServiceClient()
  const amountMinor = priced.combined.stripeAmountMinor

  // A retry of the same attempt keeps its reference; a row that is no longer unpaid is never touched (T-62-01).
  const { data: existingData, error: existingError } = await supabase
    .from('bookings')
    .select('id, status, booking_reference')
    .eq('attempt_id', attemptId)
    .eq('leg', 'outbound')
    .maybeSingle()
  if (existingError) throw new Error('card checkout lookup failed')
  const existing = existingData as { id: string; status: string; booking_reference: string } | null
  if (existing && existing.status !== 'unpaid') {
    return { kind: 'already_confirmed', bookingReference: existing.booking_reference }
  }
  const bookingReference = existing?.booking_reference || generateBookingReference()

  const meta = buildCheckoutMeta({
    bookingData,
    priced,
    bookingReference,
    returnBookingReference: '',
    authenticatedUserId: input.authenticatedUserId,
  })
  const row = { ...buildBookingRow(meta, null, 'unpaid'), payment_mode: 'card_hold' }
  const affected = await captureUnpaidBooking(row, attemptId, 'outbound')
  if (affected.length === 0) {
    // The row was confirmed between the lookup and the write.
    return { kind: 'already_confirmed', bookingReference }
  }

  const { data: capturedData, error: capturedError } = await supabase
    .from('bookings')
    .select(
      'id, booking_reference, client_first_name, client_last_name, client_email, client_phone, stripe_customer_id',
    )
    .eq('id', affected[0].id)
    .single()
  if (capturedError || !capturedData) throw new Error('card checkout booking read failed')
  const booking = capturedData as CapturedBooking
  const stripe = getPaymentsStripe()

  const customerId = await ensureCustomer(stripe, booking)

  const holdAtIso = new Date(holdAtMs).toISOString()
  const { consentId } = await recordConsent({
    bookingId: booking.id,
    mode: 'setup',
    locale: meta.locale,
    amountMinor,
    currency,
    holdAtIso,
    holdDateIso: holdDateIso(holdAtMs),
    ip: input.ip,
    userAgent: input.userAgent,
  })

  const si = await stripe.setupIntents.create(
    {
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      payment_method_options: { card: { request_three_d_secure: 'any' } },
      metadata: cardMetadata('card_setup', {
        bookingId: booking.id,
        attempt: 1,
        bookingReference,
        promoCode: priced.promoCode,
      }),
    },
    { idempotencyKey: stripeKeys.setup(booking.id, consentId) },
  )
  if (!si.client_secret) throw new Error('setup intent has no client secret')

  const moved = await applyTransition({
    bookingId: booking.id,
    from: ['none', 'checkout_pending'],
    to: 'checkout_pending',
    patch: {
      payment_currency: currency,
      payment_amount_minor: amountMinor,
      stripe_customer_id: customerId,
      setup_intent_id: si.id,
      hold_at: holdAtIso,
    },
    event: {
      key: `setup_started:${si.id}`,
      kind: 'setup_started',
      stripeObjectId: si.id,
      amountMinor,
      currency,
      actor: { type: 'system', id: null },
    },
  })
  if (!moved.applied && !moved.duplicate) {
    // The money flow already moved past checkout (for example the card was saved by a parallel tab).
    if (moved.currentState && moved.currentState !== 'none' && moved.currentState !== 'checkout_pending') {
      return { kind: 'already_confirmed', bookingReference }
    }
    throw new Error('payment transition not applied')
  }

  return { kind: 'secret', clientSecret: si.client_secret, bookingReference }
}

/** Task 1 minimal Customer handling; plan task 2 moves it to lib/payments/customer.ts. */
async function ensureCustomer(stripe: ReturnType<typeof getPaymentsStripe>, booking: CapturedBooking): Promise<string> {
  if (booking.stripe_customer_id) return booking.stripe_customer_id
  const name = [booking.client_first_name, booking.client_last_name].filter(Boolean).join(' ')
  const customer = await stripe.customers.create(
    {
      ...(booking.client_email ? { email: booking.client_email } : {}),
      ...(name ? { name } : {}),
      ...(booking.client_phone ? { phone: booking.client_phone } : {}),
      metadata: { prestigoBookingId: booking.id },
    },
    { idempotencyKey: stripeKeys.customer(booking.id) },
  )
  return customer.id
}
