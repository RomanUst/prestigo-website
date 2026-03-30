import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { saveBooking, withRetry, buildBookingRow } from '@/lib/supabase'
import { sendClientConfirmation, sendManagerAlert, sendEmergencyAlert } from '@/lib/email'
import type { BookingEmailData } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature')
  const body = await request.text() // MUST be .text() — NOT .json()

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const meta = paymentIntent.metadata
    const bookingReference = meta.bookingReference || 'UNKNOWN'

    // 1. Build row from metadata
    const bookingRow = buildBookingRow(meta, paymentIntent.id, 'confirmed')

    // 2. Save to Supabase with retry (3 attempts, exponential backoff)
    try {
      await withRetry(() => saveBooking(bookingRow), 3, 1000)
    } catch (err) {
      console.error('Supabase save failed after 3 retries:', err)
      // Emergency fallback: send booking data to manager via email
      await sendEmergencyAlert(bookingReference, bookingRow)
    }

    // 3. Build email data from metadata
    const emailData: BookingEmailData = {
      bookingReference,
      tripType: meta.tripType || '',
      originAddress: meta.originAddress || meta.origin || '',
      destinationAddress: meta.destinationAddress || meta.destination || '',
      pickupDate: meta.pickupDate || '',
      pickupTime: meta.pickupTime || '',
      returnDate: meta.returnDate || undefined,
      vehicleClass: meta.vehicleClass || '',
      passengers: parseInt(meta.passengers) || 1,
      luggage: parseInt(meta.luggage) || 0,
      hours: meta.hours ? parseInt(meta.hours) : undefined,
      distanceKm: meta.distanceKm ? parseFloat(meta.distanceKm) : undefined,
      amountCzk: parseInt(meta.amountCzk) || Math.round(paymentIntent.amount / 100),
      extraChildSeat: meta.extraChildSeat === 'true',
      extraMeetGreet: meta.extraMeetGreet === 'true',
      extraLuggage: meta.extraLuggage === 'true',
      firstName: meta.firstName || '',
      lastName: meta.lastName || '',
      email: meta.email || '',
      phone: meta.phone || '',
      flightNumber: meta.flightNumber || undefined,
      terminal: meta.terminal || undefined,
      specialRequests: meta.specialRequests || undefined,
    }

    // 4. Send client confirmation email (non-fatal)
    await sendClientConfirmation(emailData)

    // 5. Send manager alert email (non-fatal)
    await sendManagerAlert(emailData)
  }

  return NextResponse.json({ received: true })
}
