import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { saveBooking, withRetry, buildBookingRow, createSupabaseServiceClient } from '@/lib/supabase'
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

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    if (charge.payment_intent && charge.refunded) {
      const supabase = createSupabaseServiceClient()
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('payment_intent_id', charge.payment_intent as string)
      if (updateErr) {
        console.error('charge.refunded webhook: DB update failed:', updateErr.message)
      }
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const meta = paymentIntent.metadata
    const bookingReference = meta.bookingReference || 'UNKNOWN'

    // Idempotency guard — Stripe retries webhooks on non-2xx or network errors,
    // so the same event can arrive more than once. Skip processing if a booking
    // for this PaymentIntent already exists to prevent duplicate emails.
    const supabase = createSupabaseServiceClient()
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_intent_id', paymentIntent.id)
      .single()

    if (existing) {
      return NextResponse.json({ received: true })
    }

    // 1. Build row from metadata
    const bookingRow = buildBookingRow(meta, paymentIntent.id, 'confirmed')

    // 2. Save to Supabase with retry (3 attempts, exponential backoff)
    try {
      await withRetry(() => saveBooking(bookingRow), 3, 1000)
    } catch (err) {
      // Log only the error message — never log the full bookingRow which
      // contains PII (email, phone, special requests).
      console.error('Supabase save failed after 3 retries:', err instanceof Error ? err.message : 'Unknown error')
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
    try {
      await sendClientConfirmation(emailData)
    } catch (err) {
      console.error('sendClientConfirmation unexpected error:', err)
    }

    // 5. Send manager alert email (non-fatal)
    try {
      await sendManagerAlert(emailData)
    } catch (err) {
      console.error('sendManagerAlert unexpected error:', err)
    }
  }

  return NextResponse.json({ received: true })
}
