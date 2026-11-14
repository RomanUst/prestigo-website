// Card-on-file checkout, server half (Phase 88, plans 88-08 and 88-12; HOLD-01, HOLD-03, D-05, D-11, D-12).
//
// createCardCheckoutIntent: one unpaid card_hold booking per attemptId, one Stripe Customer per booking,
// the consent record, then none|checkout_pending -> checkout_pending.
//   - setup mode: a SetupIntent. Nothing is charged or authorised, payment_intent_id stays NULL.
//   - hold_now mode (pickup inside the hold lead, D-11): an on-session manual-capture PaymentIntent for
//     the full server amount that also saves the card for later off-session use, stored ONLY as hold_payment_intent_id.
//     payment_intent_id is never set here: it means "the PaymentIntent that collected the money".
// The booking row and the consent exist BEFORE Stripe talks to the browser, so the webhook (plan 88-09)
// can confirm exactly one booking by metadata.cofBookingId (Pitfall 13).
//
// Phase 89 (89-10, CASH-01, D-08, D-09): the same engine also books "pay cash to the driver". payment 'cash' writes
// payment_mode cash_guarantee with a SetupIntent only (never hold_now, even inside the hold lead) and hold_at NULL.
// The tick's claim query selects payment_mode = 'card_hold' only, so no hold can ever be placed on a cash booking.
//
// The caller (the intent route) has already validated, priced, checked eligibility and decided the mode.

import { generateBookingReference } from '@/lib/booking-reference'
import { AttemptFlowConflictError, buildBookingRow, captureUnpaidBooking, createSupabaseServiceClient } from '@/lib/supabase'
import { saveBookingStops } from '@/lib/booking-stops'
import { buildCheckoutMeta, type CheckoutBookingData, type PricedCheckout } from '@/lib/checkout/compute'
import { normalizeSiteLocale } from '@/i18n/locales'
import { buildConsentText, consentSha256 } from '@/lib/payments/consent'
import { CARD_CONSENT_VERSION, type ConsentMode } from '@/lib/payments/consent-text'
import type { PaymentCurrency } from '@/lib/payments/money'
import { applyTransition } from '@/lib/payments/state'
import { ensureStripeCustomer } from '@/lib/payments/customer'
import { cardMetadata, classifyStripeError, getPaymentsStripe, stripeKeys } from '@/lib/payments/stripe'
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
  /** The booking's free-cancellation moment (epoch ms) named in the text (89-10, D-16). */
  freeUntilMs: number | null
  /** True when that moment has already passed at checkout: the NoFree wording is stored. */
  freeUntilPassed: boolean
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
    freeUntilMs: input.freeUntilMs,
    freeUntilPassed: input.freeUntilPassed,
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
  /**
   * Which way the client pays (89-10, D-08): 'card' (default) is the Phase 88 card flow, 'cash' is cash to the driver
   * with the card saved as a guarantee. Cash ignores `mode`: it is always a SetupIntent, never a hold.
   */
  payment?: 'card' | 'cash'
  /** Decided by the server (decideHoldMode); defaults to the save-card flow. Ignored for cash. */
  mode?: Exclude<ConsentMode, 'cash_setup'>
  bookingData: CheckoutBookingData
  priced: PricedCheckout
  currency: PaymentCurrency
  attemptId: string
  /** Planned hold instant (computeHoldAt), epoch ms. */
  holdAtMs: number
  /** The booking's free-cancellation moment (epoch ms), from the same policy read as `cancelPolicy` (89-10, D-16). */
  freeUntilMs: number
  /** True when that moment has passed at checkout; the consent drops "after {freeUntil}". */
  freeUntilPassed: boolean
  authenticatedUserId: string | null
  /**
   * Phase 89 D-18: the cancellation terms the client was shown, from the same policy read that decided eligibility
   * (buildPolicySnapshot). Stored on the booking row through meta.cancelPolicy; absent means no terms are stored.
   */
  cancelPolicy?: { version: string; snapshot: Record<string, string | number> } | null
  ip: string
  userAgent: string
}

export type CardCheckoutIntentResult =
  | { kind: 'secret'; clientSecret: string; bookingReference: string }
  | { kind: 'already_confirmed'; bookingReference: string }
  /**
   * 88-REVIEW B-WR-02 / B-WR-03: this attemptId can not become a card booking (it was cancelled, or it belongs to the
   * pay-now flow). The client must start a new attempt; it is never told that a booking exists.
   */
  | { kind: 'attempt_closed' }

/** Booking statuses after which an attempt is over without a booking the client can rely on. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'no_show'])

interface CapturedBooking {
  id: string
  booking_reference: string
  client_first_name: string | null
  client_last_name: string | null
  client_email: string | null
  client_phone: string | null
  stripe_customer_id: string | null
  hold_payment_intent_id: string | null
}

/** Stripe "no such object" (a stale id); anything else from a lookup must stop the checkout. */
function isMissingResource(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'resource_missing'
}

export async function createCardCheckoutIntent(input: CardCheckoutIntentInput): Promise<CardCheckoutIntentResult> {
  const { bookingData, priced, currency, attemptId, holdAtMs } = input
  const cash = input.payment === 'cash'
  const flow = cash ? 'cash_guarantee' : 'card_hold'
  const supabase = createSupabaseServiceClient()
  const amountMinor = priced.combined.stripeAmountMinor

  // A retry of the same attempt keeps its reference; a row that is no longer unpaid is never touched (T-62-01).
  const { data: existingData, error: existingError } = await supabase
    .from('bookings')
    .select('id, status, booking_reference, payment_mode, payment_intent_id')
    .eq('attempt_id', attemptId)
    .eq('leg', 'outbound')
    .maybeSingle()
  if (existingError) throw new Error('card checkout lookup failed')
  const existing = existingData as {
    id: string
    status: string
    booking_reference: string
    payment_mode?: string | null
    payment_intent_id?: string | null
  } | null
  // B-WR-03: a cancelled booking is never reported as confirmed (the client would see "Booking confirmed").
  if (existing && CLOSED_STATUSES.has(existing.status)) return { kind: 'attempt_closed' }
  if (existing && existing.status !== 'unpaid') {
    return { kind: 'already_confirmed', bookingReference: existing.booking_reference }
  }
  // B-WR-02: an unpaid pay-now row of this attempt is never turned into a card booking, and (89-10, Pitfall 5) a card
  // row never into a cash booking or the other way round: a client who switches card and cash gets a new attempt.
  if (existing && ((existing.payment_mode && existing.payment_mode !== flow) || existing.payment_intent_id)) {
    return { kind: 'attempt_closed' }
  }
  const bookingReference = existing?.booking_reference || generateBookingReference()

  const meta = buildCheckoutMeta({
    bookingData,
    priced,
    bookingReference,
    returnBookingReference: '',
    authenticatedUserId: input.authenticatedUserId,
    cancelPolicy: input.cancelPolicy ?? null,
  })
  const row = { ...buildBookingRow(meta, null, 'unpaid'), payment_mode: flow }
  let affected: { id: string }[]
  try {
    affected = await captureUnpaidBooking(row, attemptId, 'outbound', flow)
  } catch (err) {
    if (err instanceof AttemptFlowConflictError) return { kind: 'attempt_closed' }
    throw err
  }
  if (affected.length === 0) {
    // The row left unpaid between the lookup and the write: confirmed (already_confirmed) or cancelled (closed).
    const { data: after } = await supabase.from('bookings').select('status').eq('attempt_id', attemptId).eq('leg', 'outbound').maybeSingle()
    const status = (after as { status?: string } | null)?.status
    if (status && CLOSED_STATUSES.has(status)) return { kind: 'attempt_closed' }
    return { kind: 'already_confirmed', bookingReference }
  }

  // Phase 91 (STOP-04): the stops of the captured unpaid row are exactly the ones just priced. Always written, so an
  // empty list clears the stops of an earlier attempt. Reached only when the capture affected an unpaid row (T-91-19);
  // an error propagates (the route answers its 500 and the client retries the same attempt: replace-all is safe).
  await saveBookingStops(affected[0].id, priced.stops)

  const { data: capturedData, error: capturedError } = await supabase
    .from('bookings')
    .select(
      'id, booking_reference, client_first_name, client_last_name, client_email, client_phone, stripe_customer_id, hold_payment_intent_id',
    )
    .eq('id', affected[0].id)
    .single()
  if (capturedError || !capturedData) throw new Error('card checkout booking read failed')
  const booking = capturedData as CapturedBooking
  const stripe = getPaymentsStripe()

  const customerId = await ensureStripeCustomer(booking)

  if (!cash && input.mode === 'hold_now') {
    return createHoldNowIntent({ input, booking, bookingReference, customerId, amountMinor, localeSource: meta.locale })
  }

  // Cash: no planned hold at all (hold_at stays NULL, the consent names no hold date). Card: the Phase 88 setup flow.
  const holdAtIso = cash ? null : new Date(holdAtMs).toISOString()
  const { consentId } = await recordConsent({
    bookingId: booking.id,
    mode: cash ? 'cash_setup' : 'setup',
    locale: meta.locale,
    amountMinor,
    currency,
    holdAtIso,
    holdDateIso: cash ? null : holdDateIso(holdAtMs),
    freeUntilMs: input.freeUntilMs,
    freeUntilPassed: input.freeUntilPassed,
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

  // The webhook confirms the consent by this id (card-confirm ledgerGuardedEffects): store it before the secret leaves.
  const { error: consentError } = await createSupabaseServiceClient()
    .from('booking_payment_consents')
    .update({ setup_intent_id: si.id })
    .eq('id', consentId)
  if (consentError) throw new Error('consent setup intent link failed')

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
    // The money flow already moved past checkout (for example the card was saved by a parallel tab). A released row
    // was cancelled meanwhile (B-WR-03): never reported as confirmed.
    if (moved.currentState === 'released') return { kind: 'attempt_closed' }
    if (moved.currentState && moved.currentState !== 'none' && moved.currentState !== 'checkout_pending') {
      return { kind: 'already_confirmed', bookingReference }
    }
    throw new Error('payment transition not applied')
  }

  return { kind: 'secret', clientSecret: si.client_secret, bookingReference }
}

interface HoldNowArgs {
  input: CardCheckoutIntentInput
  booking: CapturedBooking
  bookingReference: string
  customerId: string
  amountMinor: number
  localeSource: unknown
}

/**
 * hold_now (HOLD-03, D-11): the pickup is inside the hold lead, so the amount is authorised right away
 * while the client is present (customer-initiated, longer card-network window than a later off-session hold).
 * A booking never carries two live authorisations: a predecessor that already reached requires_capture
 * answers already_confirmed, an unconfirmed one is cancelled (pi_void key) before the new one is created.
 */
async function createHoldNowIntent(args: HoldNowArgs): Promise<CardCheckoutIntentResult> {
  const { input, booking, bookingReference, customerId, amountMinor } = args
  const { priced, currency } = input
  const stripe = getPaymentsStripe()

  if (booking.hold_payment_intent_id) {
    let previous: { id: string; status: string } | null = null
    try {
      previous = await stripe.paymentIntents.retrieve(booking.hold_payment_intent_id)
    } catch (err) {
      if (!isMissingResource(err)) throw err
    }
    if (previous && previous.status === 'requires_capture') {
      return { kind: 'already_confirmed', bookingReference }
    }
    if (previous && previous.status !== 'canceled' && previous.status !== 'succeeded') {
      try {
        await stripe.paymentIntents.cancel(previous.id, undefined, { idempotencyKey: stripeKeys.voidHoldNow(previous.id) })
      } catch (err) {
        // Best effort: an unconfirmed authorisation holds no money, and tick step E sweeps stale ones.
        console.warn('[card-checkout] earlier hold-now PaymentIntent not cancelled', {
          bookingId: booking.id,
          code: classifyStripeError(err),
        })
      }
    }
  }

  const { consentId } = await recordConsent({
    bookingId: booking.id,
    mode: 'hold_now',
    locale: args.localeSource,
    amountMinor,
    currency,
    holdAtIso: null,
    holdDateIso: null,
    freeUntilMs: input.freeUntilMs,
    freeUntilPassed: input.freeUntilPassed,
    ip: input.ip,
    userAgent: input.userAgent,
  })

  const pi = await stripe.paymentIntents.create(
    {
      amount: amountMinor,
      currency,
      customer: customerId,
      payment_method_types: ['card'],
      capture_method: 'manual',
      setup_future_usage: 'off_session',
      metadata: cardMetadata('card_hold_now', {
        bookingId: booking.id,
        attempt: 1,
        bookingReference,
        promoCode: priced.promoCode,
      }),
    },
    { idempotencyKey: stripeKeys.holdNow(booking.id, consentId) },
  )
  if (!pi.client_secret) throw new Error('hold payment intent has no client secret')

  // The webhook confirms the consent by this id (card-confirm ledgerGuardedEffects): store it before the secret leaves.
  const { error: consentError } = await createSupabaseServiceClient()
    .from('booking_payment_consents')
    .update({ payment_intent_id: pi.id })
    .eq('id', consentId)
  if (consentError) throw new Error('consent payment intent link failed')

  const moved = await applyTransition({
    bookingId: booking.id,
    from: ['none', 'checkout_pending'],
    to: 'checkout_pending',
    patch: {
      payment_currency: currency,
      payment_amount_minor: amountMinor,
      stripe_customer_id: customerId,
      hold_payment_intent_id: pi.id,
      hold_amount_minor: amountMinor,
      hold_at: null,
    },
    event: {
      key: `setup_started:${pi.id}`,
      kind: 'setup_started',
      stripeObjectId: pi.id,
      amountMinor,
      currency,
      actor: { type: 'system', id: null },
    },
  })
  if (!moved.applied && !moved.duplicate) {
    if (moved.currentState === 'released') return { kind: 'attempt_closed' }
    if (moved.currentState && moved.currentState !== 'none' && moved.currentState !== 'checkout_pending') {
      return { kind: 'already_confirmed', bookingReference }
    }
    throw new Error('payment transition not applied')
  }

  return { kind: 'secret', clientSecret: pi.client_secret, bookingReference }
}
