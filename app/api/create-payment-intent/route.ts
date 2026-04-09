import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { calculatePrice, dateDiffDays, VEHICLE_CLASSES } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { computeExtrasTotal } from '@/lib/extras'
import { eurToCzk } from '@/lib/currency'
import { generateBookingReference } from '@/lib/booking-reference'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
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
// Uses .passthrough() on bookingData to allow PII and extra string fields without
// listing each one explicitly. Amount-shaped fields (combinedTotal, amountEur, etc.)
// are permitted in the passthrough but are never read — server always recomputes.
const createPaymentIntentSchema = z.object({
  bookingData: z.object({
    tripType: z.enum(['transfer', 'hourly', 'daily', 'round_trip']),
    vehicleClass: z.enum(['business', 'first_class', 'business_van']),
    currency: z.string().optional(),
    distanceKm: z.string().optional(),
    hours: z.string().optional(),
    pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    pickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    returnTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    quoteMode: z.string().optional(),
  }).passthrough(), // Allow extra string fields (PII, extras, addresses) without listing each
})

export async function POST(req: Request) {
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
    const { bookingData } = parsed.data as { bookingData: Record<string, string> }

    if (!bookingData) {
      return NextResponse.json({ error: 'Missing bookingData' }, { status: 400 })
    }

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

    let rates
    try {
      rates = await getPricingConfig()
    } catch (err) {
      console.error('Failed to load pricing config:', err)
      return NextResponse.json({ error: 'Pricing configuration unavailable' }, { status: 503 })
    }

    const extrasTotalEur = computeExtrasTotal(
      {
        childSeat: bookingData.extraChildSeat === 'true',
        meetAndGreet: bookingData.extraMeetGreet === 'true',
        extraLuggage: bookingData.extraLuggage === 'true',
      },
      {
        childSeat: rates.globals.extraChildSeat,
        meetAndGreet: rates.globals.extraMeetGreet,
        extraLuggage: rates.globals.extraLuggage,
      }
    )

    const isAirport = bookingData.isAirport === 'true'
    const pickupTimeOrNull = bookingData.pickupTime || null
    const pickupDateOrNull = bookingData.pickupDate || null

    let outboundLegEur: number
    let returnLegEur: number = 0

    if (tripType === 'round_trip') {
      // Round-trip: use server-pricing helpers for BOTH legs
      outboundLegEur = computeOutboundLegTotal(
        vehicleClass,
        distanceKm,
        hours,
        days,
        'transfer', // round_trip uses transfer pricing for the outbound leg
        pickupDateOrNull,
        pickupTimeOrNull,
        isAirport,
        rates,
      )
      returnLegEur = computeReturnLegTotal(
        vehicleClass,
        distanceKm as number, // guarded above
        bookingData.returnDate,
        bookingData.returnTime,
        isAirport,
        rates,
      )
    } else {
      // One-way: PRESERVE existing behavior (calculatePrice + manual coefficient)
      // to keep PROMO-04 tests green byte-for-byte
      const basePrice = calculatePrice(tripType, vehicleClass, distanceKm, hours, days, rates)
      let adjustedBase = basePrice.base
      const isNight = pickupTimeOrNull
        ? (() => { const h = parseInt(pickupTimeOrNull.split(':')[0], 10); return h >= 22 || h < 6 })()
        : false
      const coefficient = isNight ? rates.globals.nightCoefficient : 1.0
      adjustedBase = Math.round(adjustedBase * coefficient)
      if (isAirport) adjustedBase += rates.globals.airportFee
      outboundLegEur = adjustedBase
    }

    const totalEur = outboundLegEur + extrasTotalEur + returnLegEur

    if (totalEur <= 0) {
      return NextResponse.json({ error: 'Computed amount must be positive' }, { status: 400 })
    }

    // Promo code atomic claim (PROMO-04 / T-26-09: claimed AFTER input validation and combined-total computation)
    const promoCode = bookingData.promoCode?.trim().toUpperCase() || null
    let appliedPromoPct = 0

    if (promoCode) {
      const supabaseService = createSupabaseServiceClient()
      const { data: claimed, error: claimError } = await supabaseService
        .rpc('claim_promo_code', { p_code: promoCode })

      if (claimError || !claimed || claimed.length === 0) {
        return NextResponse.json(
          { error: 'Promo code is invalid, expired, or has reached its usage limit.' },
          { status: 400 }
        )
      }
      appliedPromoPct = Number(claimed[0].discount_value)
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

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: stripeAmount,
      currency: paymentCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        bookingReference,
        returnBookingReference, // empty string for one-way
        // Enumerate only the keys the webhook handler and email builder consume.
        // Never spread the full client payload — Stripe has a 50-key / 500-char limit
        // and arbitrary client keys should not reach Stripe.
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
      },
    })

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
