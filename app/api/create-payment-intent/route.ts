import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { dateDiffDays, VEHICLE_CLASSES } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { computeExtrasTotal } from '@/lib/extras'
import { eurToCzk } from '@/lib/currency'
import { generateBookingReference } from '@/lib/booking-reference'
import {
  createSupabaseServiceClient,
  buildBookingRow,
  buildBookingRows,
  saveBooking,
  captureUnpaidBooking,
} from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody, NO_LINE_BREAKS } from '@/lib/request-guards'
import {
  computeOutboundLegTotal,
  computeReturnLegTotal,
  computeCombinedTotalMinor,
} from '@/lib/server-pricing'
import type { TripType, VehicleClass } from '@/types/booking'

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

const TRIP_TYPES: TripType[] = ['transfer', 'hourly', 'daily', 'round_trip']

// Defense-in-depth zod schema — validates primitives BEFORE any RPC or pricing call.
// Uses .catchall() with a bounded string to allow PII + extras fields without
// enumerating each one, while still enforcing a hard per-field length cap so a
// client can't blow up memory with a single 10 MB field that passes .passthrough().
// Amount-shaped fields (combinedTotal, amountEur, etc.) are tolerated but never
// read — the server always recomputes.
//
// NO_LINE_BREAKS is enforced on email/name/phone/flight/terminal below to block
// SMTP header injection downstream. Address fields and specialRequests allow
// newlines (they're only embedded in HTML-escaped email bodies, not headers).
const BOUNDED_STRING = z.string().max(2000)

const createPaymentIntentSchema = z.object({
  bookingData: z.object({
    tripType: z.enum(['transfer', 'hourly', 'daily', 'round_trip']),
    vehicleClass: z.enum(['business', 'first_class', 'business_van']),
    currency: z.string().max(10).optional(),
    distanceKm: z.string().max(20).optional(),
    hours: z.string().max(5).optional(),
    pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    pickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    returnTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    quoteMode: z.string().max(10).optional(),
    // PII fields — strict length + anti header injection on single-line fields
    firstName:   z.string().max(100).regex(NO_LINE_BREAKS).optional(),
    lastName:    z.string().max(100).regex(NO_LINE_BREAKS).optional(),
    email:       z.string().email().max(200).regex(NO_LINE_BREAKS).optional(),
    phone:       z.string().max(30).regex(NO_LINE_BREAKS).optional(),
    flightNumber: z.string().max(20).regex(NO_LINE_BREAKS).optional(),
    terminal:     z.string().max(50).regex(NO_LINE_BREAKS).optional(),
    // Phase 62 D-06/ASVS-V5: client-generated per-attempt dedup key — must be
    // a well-formed UUID before it is ever used as a DB query key.
    attemptId: z.string().uuid().optional(),
  }).catchall(BOUNDED_STRING), // anything else must be string ≤ 2000 chars
})

export async function POST(req: Request) {
  // 50 KB handles even the largest realistic booking payload. Anything
  // beyond this is abusive — short-circuit before buffering the body.
  const tooBig = enforceMaxBody(req, 50_000)
  if (tooBig) return tooBig

  const { allowed, remaining, limit } = await checkRateLimit('/api/create-payment-intent', getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
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
    const parsed = createPaymentIntentSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    // SEC-16: use inferred Zod type directly — no cast to Record<string,string>
    const bookingData = parsed.data.bookingData

    // Resolve authenticated user server-side — never trust client-supplied userId
    const supabaseUser = await createClient()
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    const authenticatedUserId: string | null = authUser?.id ?? null

    const tripType = bookingData.tripType as TripType
    const vehicleClass = bookingData.vehicleClass as VehicleClass
    const paymentCurrency = bookingData.currency === 'czk' ? 'czk' : 'eur'

    if (!TRIP_TYPES.includes(tripType)) {
      return NextResponse.json({ error: 'Invalid tripType' }, { status: 400 })
    }
    if (!VEHICLE_CLASSES.includes(vehicleClass)) {
      return NextResponse.json({ error: 'Invalid vehicleClass' }, { status: 400 })
    }

    const distanceKm = bookingData.distanceKm ? parseFloat(bookingData.distanceKm) : null
    const hours = bookingData.hours ? parseInt(bookingData.hours) : 2
    const days =
      bookingData.pickupDate && bookingData.returnDate
        ? dateDiffDays(bookingData.pickupDate, bookingData.returnDate)
        : 1

    if (tripType === 'transfer' && (distanceKm === null || !isFinite(distanceKm) || distanceKm <= 0)) {
      return NextResponse.json({ error: 'Invalid distanceKm for transfer' }, { status: 400 })
    }

    // Round-trip specific validation (T-26-01, T-26-06, T-26-09)
    if (tripType === 'round_trip') {
      if (distanceKm === null || !isFinite(distanceKm) || distanceKm <= 0) {
        return NextResponse.json({ error: 'Invalid distanceKm for round_trip' }, { status: 400 })
      }
      if (!bookingData.returnDate || !bookingData.returnTime) {
        return NextResponse.json({ error: 'Round trip requires returnDate and returnTime' }, { status: 400 })
      }
      if (!bookingData.pickupDate || !bookingData.pickupTime) {
        return NextResponse.json({ error: 'Round trip requires pickupDate and pickupTime' }, { status: 400 })
      }
      // Strict ordering: return datetime must be AFTER pickup datetime (ISO string compare)
      const pickupDT = `${bookingData.pickupDate}T${bookingData.pickupTime}`
      const returnDT = `${bookingData.returnDate}T${bookingData.returnTime}`
      if (returnDT <= pickupDT) {
        return NextResponse.json({ error: 'Return datetime must be after pickup datetime' }, { status: 400 })
      }
      // T-26-06: quoteMode bypass defense — require client to explicitly set quoteMode='false'
      if (bookingData.quoteMode === 'true') {
        return NextResponse.json({ error: 'This route requires a custom quote.' }, { status: 400 })
      }
    }

    // Business rule: bookings must be at least 12 hours in advance
    if (bookingData.pickupDate && bookingData.pickupTime) {
      // SEC-13: interpret pickup as Prague local time (CET/CEST) to avoid off-by-2h UTC mismatch.
      const month = new Date().getUTCMonth() + 1
      const pragueOffset = month >= 4 && month <= 10 ? '+02:00' : '+01:00'
      const pickupDT = new Date(`${bookingData.pickupDate}T${bookingData.pickupTime}:00${pragueOffset}`)
      const minAllowedDT = new Date(Date.now() + 12 * 60 * 60 * 1000)
      if (!isFinite(pickupDT.getTime()) || pickupDT < minAllowedDT) {
        return NextResponse.json(
          { error: 'Bookings must be made at least 12 hours in advance.' },
          { status: 422 }
        )
      }
    }

    let rates
    try {
      rates = await getPricingConfig()
    } catch (err) {
      console.error('Failed to load pricing config:', err)
      return NextResponse.json({ error: 'Pricing configuration unavailable' }, { status: 503 })
    }

    const extrasTotalEur = computeExtrasTotal(
      {
        infantSeat: false,
        childSeat: bookingData.extraChildSeat === 'true',
        boosterSeat: false,
        meetAndGreet: bookingData.extraMeetGreet === 'true',
        extraLuggage: bookingData.extraLuggage === 'true',
      },
      {
        infantSeat: 0,
        childSeat: rates.globals.extraChildSeat,
        boosterSeat: 0,
        meetAndGreet: 0,
        extraLuggage: rates.globals.extraLuggage,
      }
    )

    const isAirport = bookingData.isAirport === 'true'
    const pickupTimeOrNull = bookingData.pickupTime || null
    const pickupDateOrNull = bookingData.pickupDate || null

    let returnLegEur: number = 0

    const outboundLegEur = computeOutboundLegTotal(
      vehicleClass,
      distanceKm,
      hours,
      days,
      tripType === 'round_trip' ? 'transfer' : tripType,
      pickupDateOrNull,
      pickupTimeOrNull,
      isAirport,
      rates,
    )
    if (tripType === 'round_trip') {
      returnLegEur = computeReturnLegTotal(
        vehicleClass,
        distanceKm as number, // guarded above
        bookingData.returnDate ?? '',
        bookingData.returnTime ?? '',
        isAirport,
        rates,
      )
    }

    const totalEur = outboundLegEur + extrasTotalEur + returnLegEur

    if (totalEur <= 0) {
      return NextResponse.json({ error: 'Computed amount must be positive' }, { status: 400 })
    }

    // Promo code atomic claim (PROMO-04 / T-26-09: claimed AFTER input validation and combined-total computation)
    const promoCode = bookingData.promoCode?.trim().toUpperCase() || null
    let appliedPromoPct = 0

    if (promoCode) {
      // SEC-01: validate without incrementing current_uses — counter is claimed in
      // the webhook after payment_intent.succeeded confirms the charge. This prevents
      // an attacker from exhausting a limited-use code by creating PaymentIntents
      // without completing payment.
      const supabaseService = createSupabaseServiceClient()
      const { data: promoRow, error: promoError } = await supabaseService
        .from('promo_codes')
        .select('discount_value, max_uses, current_uses, is_active')
        .eq('code', promoCode)
        .eq('is_active', true)
        .maybeSingle()

      if (promoError || !promoRow) {
        return NextResponse.json(
          { error: 'Promo code is invalid, expired, or has reached its usage limit.' },
          { status: 400 }
        )
      }
      if (promoRow.max_uses !== null && promoRow.current_uses >= promoRow.max_uses) {
        return NextResponse.json(
          { error: 'Promo code is invalid, expired, or has reached its usage limit.' },
          { status: 400 }
        )
      }
      appliedPromoPct = Number(promoRow.discount_value)
    }

    // Single call site for combined-total computation + promo rounding + Stripe amount minor unit (T-26-03)
    const combined = computeCombinedTotalMinor({
      outboundLegEur,
      extrasEur: extrasTotalEur,
      returnLegEur,
      promoPct: appliedPromoPct,
      currency: paymentCurrency,
    })

    const finalTotalEur = combined.finalTotalEur
    const totalCzk = combined.finalTotalCzk
    const stripeAmount = combined.stripeAmountMinor

    const bookingReference = generateBookingReference()
    const returnBookingReference = tripType === 'round_trip' ? generateBookingReference() : ''

    // Per-leg amounts PRE-promo (for Phase 23 outbound_amount_czk / return_amount_czk columns).
    // Phase 28 refund math: refundRatio = finalTotalCzk / combinedBeforePromoCzk;
    //                       actualRefund = leg_amount_czk * refundRatio.
    const outboundAmountCzk = eurToCzk(outboundLegEur + extrasTotalEur) // extras attributed to outbound
    const returnAmountCzk = eurToCzk(returnLegEur)

    // Defense-in-depth: truncate every metadata string to 500 chars (T-26-04)
    const clamp500 = (s: string) => (s.length > 500 ? s.slice(0, 500) : s)

    // Single metadata map — sent to Stripe AND reused (below) as the `meta`
    // input to buildBookingRow for the Phase 62 unpaid-capture write, so the
    // capture row and the PaymentIntent's metadata never drift apart.
    // Enumerate only the keys the webhook handler and email builder consume.
    // Never spread the full client payload — Stripe has a 50-key / 500-char limit
    // and arbitrary client keys should not reach Stripe.
    const meta: Record<string, string> = {
      bookingReference,
      returnBookingReference, // empty string for one-way
      tripType: bookingData.tripType ?? '',
      originAddress: clamp500(bookingData.originAddress ?? ''),
      originLat: bookingData.originLat ?? '',
      originLng: bookingData.originLng ?? '',
      destinationAddress: clamp500(bookingData.destinationAddress ?? ''),
      destinationLat: bookingData.destinationLat ?? '',
      destinationLng: bookingData.destinationLng ?? '',
      pickupDate: bookingData.pickupDate ?? '',
      pickupTime: bookingData.pickupTime ?? '',
      returnDate: bookingData.returnDate ?? '',
      returnTime: bookingData.returnTime ?? '',
      vehicleClass: bookingData.vehicleClass ?? '',
      passengers: bookingData.passengers ?? '',
      luggage: bookingData.luggage ?? '',
      hours: bookingData.hours ?? '',
      distanceKm: bookingData.distanceKm ?? '',
      extraChildSeat: bookingData.extraChildSeat ?? 'false',
      extraMeetGreet: bookingData.extraMeetGreet ?? 'false',
      extraLuggage: bookingData.extraLuggage ?? 'false',
      firstName: clamp500(bookingData.firstName ?? ''),
      lastName: clamp500(bookingData.lastName ?? ''),
      email: clamp500(bookingData.email ?? ''),
      phone: clamp500(bookingData.phone ?? ''),
      flightNumber: clamp500(bookingData.flightNumber ?? ''),
      terminal: clamp500(bookingData.terminal ?? ''),
      specialRequests: clamp500((bookingData.specialRequests ?? '').slice(0, 490)),
      amountEur: String(finalTotalEur),
      amountCzk: String(totalCzk),
      outboundAmountCzk: String(outboundAmountCzk),
      returnAmountCzk: String(returnAmountCzk),
      returnDiscountPct: String(rates.globals.returnDiscountPercent),
      promoCode: promoCode || '',
      discountPct: String(appliedPromoPct),
      userId: authenticatedUserId ?? '',
    }

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
      { error: 'Failed to create payment intent. Please try again.' },
      { status: 500 }
    )
  }
}
