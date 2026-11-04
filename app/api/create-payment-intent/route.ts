import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { generateBookingReference } from '@/lib/booking-reference'
import {
  buildBookingRow,
  buildBookingRows,
  saveBooking,
  captureUnpaidBooking,
} from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import {
  checkoutBookingSchema,
  validateCheckoutBooking,
  priceCheckout,
  buildCheckoutMeta,
} from '@/lib/checkout/compute'

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

    const bookingReference = generateBookingReference()
    const returnBookingReference = tripType === 'round_trip' ? generateBookingReference() : ''

    // Single metadata map — sent to Stripe AND reused (below) as the `meta`
    // input to buildBookingRow for the Phase 62 unpaid-capture write, so the
    // capture row and the PaymentIntent's metadata never drift apart.
    const meta = buildCheckoutMeta({
      bookingData,
      priced,
      bookingReference,
      returnBookingReference,
      authenticatedUserId,
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
          await captureUnpaidBooking(outboundUnpaid, bookingData.attemptId, 'outbound')
          await captureUnpaidBooking(returnUnpaid, bookingData.attemptId, 'return')
        } else {
          const unpaidRow = buildBookingRow(meta, paymentIntent.id, 'unpaid')
          await captureUnpaidBooking(unpaidRow, bookingData.attemptId, 'outbound')
        }
      } catch (captureErr) {
        console.error(
          'create-payment-intent capture failed:',
          captureErr instanceof Error ? captureErr.message : String(captureErr)
        )
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
