import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { calculatePrice, dateDiffDays, VEHICLE_CLASSES } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { computeExtrasTotal } from '@/lib/extras'
import { eurToCzk } from '@/lib/currency'
import type { TripType, VehicleClass } from '@/types/booking'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  httpClient: Stripe.createFetchHttpClient(),
  maxNetworkRetries: 0,
})

const TRIP_TYPES: TripType[] = ['transfer', 'hourly', 'daily']

function generateBookingReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = String(Math.floor(Math.random() * 9000) + 1000)
  return `PRG-${datePart}-${suffix}`
}

export async function POST(req: Request) {
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
    const extrasTotal = computeExtrasTotal({
      childSeat: bookingData.extraChildSeat === 'true',
      meetAndGreet: bookingData.extraMeetGreet === 'true',
      extraLuggage: bookingData.extraLuggage === 'true',
    })

    const totalEur = basePrice.base + extrasTotal
    const totalCzk = eurToCzk(totalEur)

    if (totalEur <= 0) {
      return NextResponse.json({ error: 'Computed amount must be positive' }, { status: 400 })
    }

    const bookingReference = generateBookingReference()

    // Stripe amount in smallest currency unit: euro-cents for EUR, halers for CZK
    const stripeAmount = paymentCurrency === 'eur'
      ? Math.round(totalEur * 100)
      : Math.round(totalCzk * 100)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: paymentCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        bookingReference,
        ...bookingData,
        amountEur: String(totalEur),
        amountCzk: String(totalCzk),
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
