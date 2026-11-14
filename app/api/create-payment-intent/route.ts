import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { generateBookingReference } from '@/lib/booking-reference'
import {
  buildBookingRow,
  buildBookingRows,
  saveBooking,
  captureUnpaidBooking,
} from '@/lib/supabase'
import { saveBookingStops } from '@/lib/booking-stops'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import {
  checkoutBookingSchema,
  validateCheckoutBooking,
  priceCheckout,
  buildCheckoutMeta,
} from '@/lib/checkout/compute'
import { getPaymentSettings, isPolicyPublic } from '@/lib/payments/config'
import { buildPolicySnapshot, getCancellationPolicy } from '@/lib/cancellation-settings'

// Lazy init — STRIPE_SECRET_KEY is Production-only; avoid module-load crash in Preview
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

export async function POST(req: Request) {
  // 50 KB handles even the largest realistic booking payload. Anything
  // beyond this is abusive — short-circuit before buffering the body.
  const tooBig = enforceMaxBody(req, 50_000)
  if (tooBig) return tooBig

  const { allowed, remaining, limit } = await checkRateLimit('/api/create-payment-intent', getClientIp(req))
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
      }
    )
  }

  try {
    const rawBody = await req.json()
    const parsed = checkoutBookingSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 })
    }
    // SEC-16: use inferred Zod type directly — no cast to Record<string,string>
    const bookingData = parsed.data.bookingData

    // Shared server-authoritative validation (phone, trip type, vehicle, seats,
    // distance, round-trip rules) — lib/checkout/compute.ts.
    const validated = validateCheckoutBooking(bookingData)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error, code: validated.code }, { status: validated.status })
    }

    // Resolve authenticated user server-side — never trust client-supplied userId
    const supabaseUser = await createClient()
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    const authenticatedUserId: string | null = authUser?.id ?? null

    const paymentCurrency = bookingData.currency === 'czk' ? 'czk' : 'eur'

    // Business rule: bookings must be at least 12 hours in advance.
    // Legacy pay-now rule — intentionally NOT part of lib/checkout/compute.ts,
    // so the card-on-file flow cannot inherit it.
    if (bookingData.pickupDate && bookingData.pickupTime) {
      // SEC-13: interpret pickup as Prague local time (CET/CEST) to avoid off-by-2h UTC mismatch.
      const month = new Date().getUTCMonth() + 1
      const pragueOffset = month >= 4 && month <= 10 ? '+02:00' : '+01:00'
      const pickupDT = new Date(`${bookingData.pickupDate}T${bookingData.pickupTime}:00${pragueOffset}`)
      const minAllowedDT = new Date(Date.now() + 12 * 60 * 60 * 1000)
      if (!isFinite(pickupDT.getTime()) || pickupDT < minAllowedDT) {
        return NextResponse.json(
          { error: 'Bookings must be made at least 12 hours in advance.', code: 'LEAD_TIME' },
          { status: 422 }
        )
      }
    }

    // Single call site for the server-side price (config, extras, legs, promo, combined total)
    const priced = await priceCheckout({ bookingData, validated, currency: paymentCurrency })
    if (!priced.ok) {
      return NextResponse.json({ error: priced.error, code: priced.code }, { status: priced.status })
    }

    const tripType = validated.tripType
    const stripeAmount = priced.combined.stripeAmountMinor

    // Phase 91 (STOP-04, T-91-20): a pay-now booking with stops takes payment only once its stops are stored. The
    // stops are written on the attempt-keyed capture row, so an attemptId is required for them; without one there
    // would be no row to hold them and the driver would never see the stops.
    const hasStops = priced.stops.length > 0
    if (hasStops && !bookingData.attemptId) {
      return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 })
    }

    const bookingReference = generateBookingReference()
    const returnBookingReference = tripType === 'round_trip' ? generateBookingReference() : ''

    // Single metadata map — sent to Stripe AND reused (below) as the `meta`
    // input to buildBookingRow for the Phase 62 unpaid-capture write, so the
    // capture row and the PaymentIntent's metadata never drift apart.
    // Phase 89 D-18, D-24: the stored terms are the go-live gate. Built server-side from pricing_globals and only
    // while the policy is public for this email (mode on, or canary with the email listed); otherwise the columns stay
    // NULL and the legacy terms apply. A read failure means no snapshot, never a failed booking.
    let cancelPolicy: ReturnType<typeof buildPolicySnapshot> | null = null
    try {
      const paymentSettings = await getPaymentSettings()
      if (isPolicyPublic(paymentSettings, bookingData.email ?? '')) {
        cancelPolicy = buildPolicySnapshot(await getCancellationPolicy())
      }
    } catch (policyErr) {
      console.error(
        'create-payment-intent policy snapshot skipped:',
        policyErr instanceof Error ? policyErr.message : String(policyErr)
      )
      cancelPolicy = null
    }

    const meta = buildCheckoutMeta({
      bookingData,
      priced,
      bookingReference,
      returnBookingReference,
      authenticatedUserId,
      cancelPolicy,
    })

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: stripeAmount,
      currency: paymentCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: meta,
    })

    // Phase 62 D-05/ABND-01: capture an `unpaid` bookings row NOW, before the
    // client completes payment — the revenue-recovery follow-up queue.
    // Best-effort: a capture failure must never block the payment flow, so
    // it is caught and logged, not rethrown — the webhook's defensive
    // fallback insert covers a lost capture.
    if (bookingData.attemptId) {
      // Phase 62-02 D-06/D-07: attempt-keyed capture — a retry / currency
      // toggle re-POST with the SAME attemptId UPDATEs the existing unpaid
      // row(s) in place instead of inserting a duplicate. Round-trip attempts
      // capture TWO rows (outbound + return), keyed per leg, sharing the
      // attempt and the single PaymentIntent.
      try {
        if (tripType === 'round_trip') {
          const { outbound: outboundUnpaid, return: returnUnpaid } = buildBookingRows(
            meta,
            paymentIntent.id,
            'unpaid'
          )
          const capturedOutbound = await captureUnpaidBooking(outboundUnpaid, bookingData.attemptId, 'outbound', 'pay_now')
          await captureUnpaidBooking(returnUnpaid, bookingData.attemptId, 'return', 'pay_now')
          // A round trip carries no stops (the server refuses them), so priced.stops is []: this clears the stops of an
          // earlier one-way attempt that reused the same attemptId. Only for a captured (still unpaid) row (T-91-19).
          if (capturedOutbound.length > 0) await saveBookingStops(capturedOutbound[0].id, priced.stops)
        } else {
          const unpaidRow = buildBookingRow(meta, paymentIntent.id, 'unpaid')
          // 88-REVIEW B-WR-02: an attempt the card flow already captured is never overwritten (AttemptFlowConflictError,
          // logged below); the pay-now booking is then created by the webhook's defensive insert on payment.
          const captured = await captureUnpaidBooking(unpaidRow, bookingData.attemptId, 'outbound', 'pay_now')
          // An empty result means the row left unpaid (already confirmed): its stops are never touched (T-91-19).
          // Always written for a captured row, also without stops: the stored stops are exactly the ones just priced,
          // so a retry of the same attempt after the client removed every stop clears the earlier ones (as the card
          // flow does). A failed clear on a request without stops is logged below and does not block the payment.
          if (captured.length > 0) await saveBookingStops(captured[0].id, priced.stops)
        }
      } catch (captureErr) {
        console.error(
          'create-payment-intent capture failed:',
          captureErr instanceof Error ? captureErr.message : String(captureErr)
        )
        if (hasStops) {
          // Fail closed: the client must never pay for a trip whose stops were not stored. The PaymentIntent just
          // created is cancelled (best effort, its own try) and the client retries the same attempt.
          try {
            await getStripe().paymentIntents.cancel(paymentIntent.id)
          } catch (cancelErr) {
            const code = (cancelErr as { code?: unknown } | null)?.code
            console.error('create-payment-intent stops cancel failed:', typeof code === 'string' ? code : 'unknown')
          }
          return NextResponse.json(
            { error: 'Your stops could not be saved. Please try again.', code: 'STOPS_NOT_SAVED' },
            { status: 503 }
          )
        }
      }
    } else if (tripType !== 'round_trip') {
      // Phase 62-01 fallback (no attemptId supplied): payment_intent_id-keyed
      // insert, one-way only. Retained for backward compatibility with any
      // caller that has not yet adopted attemptId.
      try {
        const unpaidRow = buildBookingRow(meta, paymentIntent.id, 'unpaid')
        await saveBooking(unpaidRow)
      } catch (captureErr) {
        console.error(
          'create-payment-intent capture failed:',
          captureErr instanceof Error ? captureErr.message : String(captureErr)
        )
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingReference,
      returnBookingReference: returnBookingReference || undefined,
    })
  } catch (error) {
    console.error('create-payment-intent error:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: 'Failed to create payment intent. Please try again.', code: 'INTERNAL' },
      { status: 500 }
    )
  }
}
