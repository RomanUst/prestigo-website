import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { checkoutBookingSchema, validateCheckoutBooking, priceCheckout } from '@/lib/checkout/compute'
import { getPaymentSettings, isCardFlowEligible } from '@/lib/payments/config'
import { computeHoldAt, decideHoldMode, holdDateIso, meetsBookingLeadTime } from '@/lib/payments/timing'
import { createCardCheckoutIntent } from '@/lib/payments/checkout'
import { classifyStripeError } from '@/lib/payments/stripe'
import { pickupInstantMs } from '@/lib/prague-date'
import { createClient } from '@/lib/supabase/server'

// POST /api/card-checkout/intent (Phase 88, plan 88-08; HOLD-01, D-05, D-09a, D-11, D-12).
//
// Setup mode: recompute the price, capture one unpaid card_hold booking per attemptId, ensure the Stripe
// Customer, store the consent record and create a SetupIntent. Nothing is charged.
// hold_now mode (plan 88-12, HOLD-03): the pickup is inside the hold lead, so an on-session manual-capture
// PaymentIntent for the full server amount is created instead (still nothing is captured). The amount comes from
// priceCheckout only; displayedAmountMinor is a cross-check (409 PRICE_CHANGED). The mode is decided by
// the server (decideHoldMode); the client's mode is a cross-check (409 MODE_CHANGED).
//
// Two-step parse: a malformed body is 400 INVALID_REQUEST, every business failure is 422 or 409.
// Logs carry ids and codes only, never the request body.

const intentSchema = checkoutBookingSchema.extend({
  currency: z.enum(['eur', 'czk']),
  mode: z.enum(['setup', 'hold_now']),
  consent: z.unknown(),
  displayedAmountMinor: z.number().int().positive().max(100_000_000),
})

/** The wizard sends the step-5 email as typed; surrounding spaces would fail the strict format check. */
function trimEmail(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const data = (body as { bookingData?: unknown }).bookingData
  if (!data || typeof data !== 'object') return body
  const email = (data as { email?: unknown }).email
  if (typeof email !== 'string') return body
  return { ...body, bookingData: { ...data, email: email.trim() } }
}

function fail(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status })
}

export async function POST(req: Request) {
  const { allowed, remaining, limit } = await checkRateLimit('/api/card-checkout/intent', getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
        },
      },
    )
  }

  const tooBig = enforceMaxBody(req, 16_384)
  if (tooBig) return tooBig

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return fail(400, 'INVALID_REQUEST', 'Invalid request body')
  }
  const parsed = intentSchema.safeParse(trimEmail(rawBody))
  if (!parsed.success || !parsed.data.bookingData.attemptId) {
    return fail(400, 'INVALID_REQUEST', 'Invalid request body')
  }
  const { bookingData, currency, mode: clientMode, consent, displayedAmountMinor } = parsed.data
  const attemptId = bookingData.attemptId as string

  try {
    // D-09a: eligibility is re-checked server-side on every new checkout.
    const settings = await getPaymentSettings()
    if (!isCardFlowEligible(settings, { email: bookingData.email ?? '', tripType: bookingData.tripType })) {
      return fail(422, 'NOT_ELIGIBLE', 'Card checkout is not available for this booking')
    }

    // Only the JSON boolean true is a consent. The stored text is the server rendering, never a client string.
    const consented = consent === true
    if (!consented) {
      return fail(422, 'CONSENT_REQUIRED', 'The card authorisation must be accepted')
    }

    const validated = validateCheckoutBooking(bookingData)
    if (!validated.ok) return fail(validated.status, validated.code, validated.error)

    // The card flow has its own lead rule on the real pickup instant (Prague wall clock, DST-safe).
    const pickupMs = pickupInstantMs({
      pickup_utc: null,
      pickup_date: bookingData.pickupDate ?? '',
      pickup_time: bookingData.pickupTime ?? '',
    })
    const nowMs = Date.now()
    if (pickupMs === null || !meetsBookingLeadTime(pickupMs, nowMs)) {
      return fail(422, 'LEAD_TIME', 'Bookings must be made at least 12 hours in advance.')
    }

    const priced = await priceCheckout({ bookingData, validated, currency })
    if (!priced.ok) return fail(priced.status, priced.code, priced.error)

    const serverAmountMinor = priced.combined.stripeAmountMinor
    if (displayedAmountMinor !== serverAmountMinor) {
      return fail(409, 'PRICE_CHANGED', 'The price has changed', { amountMinor: serverAmountMinor })
    }

    const { holdAtMs, rawHoldAtMs } = computeHoldAt(pickupMs, settings.leadHours)
    const serverMode = decideHoldMode(rawHoldAtMs, nowMs)
    if (clientMode !== serverMode) {
      return fail(409, 'MODE_CHANGED', 'The payment mode has changed', {
        mode: serverMode,
        holdAtIso: serverMode === 'setup' ? new Date(holdAtMs).toISOString() : null,
        holdDateIso: serverMode === 'setup' ? holdDateIso(holdAtMs) : null,
      })
    }
    // A signed-in account is resolved server-side, never from the body. Best effort: a guest checkout is normal.
    let authenticatedUserId: string | null = null
    try {
      const supabaseUser = await createClient()
      const {
        data: { user },
      } = await supabaseUser.auth.getUser()
      authenticatedUserId = user?.id ?? null
    } catch {
      authenticatedUserId = null
    }

    const result = await createCardCheckoutIntent({
      mode: serverMode,
      bookingData,
      priced,
      currency,
      attemptId,
      holdAtMs,
      authenticatedUserId,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent') ?? '',
    })

    if (result.kind === 'already_confirmed') {
      return NextResponse.json({ alreadyConfirmed: true, bookingReference: result.bookingReference })
    }
    return NextResponse.json({
      clientSecret: result.clientSecret,
      mode: serverMode,
      bookingReference: result.bookingReference,
      amountMinor: serverAmountMinor,
      currency,
    })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'type' in err ? classifyStripeError(err) : 'internal'
    console.error('card-checkout/intent failed:', JSON.stringify({ attemptId, code }))
    return fail(500, 'INTERNAL', 'Failed to start the card checkout. Please try again.')
  }
}
