import { NextResponse } from 'next/server'
import { saveBooking, withRetry, buildBookingRow } from '@/lib/supabase'
import { sendManagerAlert, sendEmergencyAlert } from '@/lib/email'
import type { BookingEmailData } from '@/lib/email'

function generateQuoteReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = String(Math.floor(Math.random() * 9000) + 1000)
  return `QR-${datePart}-${suffix}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const quoteReference = generateQuoteReference()

    // Normalize body into metadata-style Record<string, string> for buildBookingRow
    const meta: Record<string, string> = {
      bookingReference: quoteReference,
      tripType: body.tripType || '',
      originAddress: body.origin || '',
      destinationAddress: body.destination || '',
      pickupDate: body.pickupDate || '',
      pickupTime: body.pickupTime || '',
      vehicleClass: body.vehicleClass || '',
      passengers: String(body.passengers || 1),
      luggage: String(body.luggage || 0),
      hours: body.hours ? String(body.hours) : '',
      returnDate: body.returnDate || '',
      distanceKm: body.distanceKm ? String(body.distanceKm) : '',
      amountCzk: '0', // quotes have no payment
      extraChildSeat: String(body.extras?.childSeat ?? false),
      extraMeetGreet: String(body.extras?.meetAndGreet ?? false),
      extraLuggage: String(body.extras?.extraLuggage ?? false),
      firstName: body.passengerDetails?.firstName || '',
      lastName: body.passengerDetails?.lastName || '',
      email: body.passengerDetails?.email || '',
      phone: body.passengerDetails?.phone || '',
      flightNumber: body.passengerDetails?.flightNumber || '',
      terminal: body.passengerDetails?.terminal || '',
      specialRequests: body.passengerDetails?.specialRequests || '',
    }

    // Save to Supabase (quote mode — no payment_intent_id)
    const bookingRow = buildBookingRow(meta, null, 'quote')
    try {
      await withRetry(() => saveBooking(bookingRow), 3, 1000)
    } catch (err) {
      console.error('Supabase save failed for quote:', err)
      await sendEmergencyAlert(quoteReference, bookingRow)
    }

    // Send manager alert (no client email for quotes — not confirmed yet)
    const emailData: BookingEmailData = {
      bookingReference: quoteReference,
      tripType: meta.tripType,
      originAddress: meta.originAddress,
      destinationAddress: meta.destinationAddress,
      pickupDate: meta.pickupDate,
      pickupTime: meta.pickupTime,
      returnDate: meta.returnDate || undefined,
      vehicleClass: meta.vehicleClass,
      passengers: parseInt(meta.passengers) || 1,
      luggage: parseInt(meta.luggage) || 0,
      hours: meta.hours ? parseInt(meta.hours) : undefined,
      amountCzk: 0,
      extraChildSeat: meta.extraChildSeat === 'true',
      extraMeetGreet: meta.extraMeetGreet === 'true',
      extraLuggage: meta.extraLuggage === 'true',
      firstName: meta.firstName,
      lastName: meta.lastName,
      email: meta.email,
      phone: meta.phone,
      flightNumber: meta.flightNumber || undefined,
      terminal: meta.terminal || undefined,
      specialRequests: meta.specialRequests || undefined,
    }
    await sendManagerAlert(emailData)

    return NextResponse.json({ quoteReference })
  } catch (error) {
    console.error('submit-quote error:', error)
    return NextResponse.json(
      { error: 'Failed to submit quote' },
      { status: 500 }
    )
  }
}
