import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { calculatePrice, dateDiffDays, VEHICLE_CLASSES } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { computeExtrasTotal } from '@/lib/extras'
import { eurToCzk } from '@/lib/currency'
import { generateBookingReference } from '@/lib/booking-reference'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import type { TripType, VehicleClass } from '@/types/booking'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  httpClient: Stripe.createFetchHttpClient(),
  maxNetworkRetries: 0,
})

const TRIP_TYPES: TripType[] = ['transfer', 'hourly', 'daily']

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
    const body = await req.json()
    const { bookingData } = body as { bookingData: Record<string, string> }

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

    let rates
    try {
      rates = await getPricingConfig()
    } catch (err) {
      console.error('Failed to load pricing config:', err)
      return NextResponse.json({ error: 'Pricing configuration unavailable' }, { status: 503 })
    }

    const basePrice = calculatePrice(tripType, vehicleClass, distanceKm, hours, days, rates)
    const extrasTotal = computeExtrasTotal(
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

    let adjustedBase = basePrice.base
    const isAirport = bookingData.isAirport === 'true'
    const pickupTime = bookingData.pickupTime || null
    const isNight = pickupTime ? (() => { const h = parseInt(pickupTime.split(':')[0], 10); return h >= 22 || h < 6 })() : false
    const coefficient = isNight ? rates.globals.nightCoefficient : 1.0
    adjustedBase = Math.round(adjustedBase * coefficient)
    if (isAirport) adjustedBase += rates.globals.airportFee

    const totalEur = adjustedBase + extrasTotal

    if (totalEur <= 0) {
      return NextResponse.json({ error: 'Computed amount must be positive' }, { status: 400 })
    }

    // Promo code atomic claim (PROMO-04)
    const promoCode = bookingData.promoCode?.trim().toUpperCase() || null
    let finalTotalEur = totalEur
    let appliedDiscountPct = 0

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
      appliedDiscountPct = Number(claimed[0].discount_value)
      finalTotalEur = Math.round(totalEur * (1 - appliedDiscountPct / 100))
      if (finalTotalEur <= 0) finalTotalEur = 1 // minimum 1 EUR to avoid Stripe error
    }

    const totalCzk = eurToCzk(finalTotalEur)

    const bookingReference = generateBookingReference()

    // Stripe amount in smallest currency unit: euro-cents for EUR, halers for CZK
    const stripeAmount = paymentCurrency === 'eur'
      ? Math.round(finalTotalEur * 100)
      : Math.round(totalCzk * 100)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: paymentCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        bookingReference,
        // Enumerate only the keys the webhook handler and email builder consume.
        // Never spread the full client payload — Stripe has a 50-key / 500-char limit
        // and arbitrary client keys should not reach Stripe.
        tripType: bookingData.tripType ?? '',
        originAddress: bookingData.originAddress ?? '',
        destinationAddress: bookingData.destinationAddress ?? '',
        pickupDate: bookingData.pickupDate ?? '',
        pickupTime: bookingData.pickupTime ?? '',
        returnDate: bookingData.returnDate ?? '',
        vehicleClass: bookingData.vehicleClass ?? '',
        passengers: bookingData.passengers ?? '',
        luggage: bookingData.luggage ?? '',
        hours: bookingData.hours ?? '',
        distanceKm: bookingData.distanceKm ?? '',
        extraChildSeat: bookingData.extraChildSeat ?? 'false',
        extraMeetGreet: bookingData.extraMeetGreet ?? 'false',
        extraLuggage: bookingData.extraLuggage ?? 'false',
        firstName: bookingData.firstName ?? '',
        lastName: bookingData.lastName ?? '',
        email: bookingData.email ?? '',
        phone: bookingData.phone ?? '',
        flightNumber: bookingData.flightNumber ?? '',
        terminal: bookingData.terminal ?? '',
        specialRequests: bookingData.specialRequests ?? '',
        amountEur: String(finalTotalEur),
        amountCzk: String(totalCzk),
        promoCode: promoCode || '',
        discountPct: String(appliedDiscountPct),
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingReference,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('create-payment-intent error:', msg)
    return NextResponse.json(
      { error: msg || 'Failed to create payment intent' },
      { status: 500 }
    )
  }
}
