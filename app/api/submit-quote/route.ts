import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { saveBooking, withRetry, buildBookingRow } from '@/lib/supabase'
import { sendManagerAlert, sendEmergencyAlert } from '@/lib/email'
import type { BookingEmailData } from '@/lib/email'

const submitQuoteSchema = z.object({
  tripType: z.enum(['transfer', 'hourly', 'daily']),
  origin: z.string().min(1).max(300),
  destination: z.string().min(1).max(300),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM'),
  vehicleClass: z.enum(['economy', 'business', 'first_class', 'business_van']),
  passengers: z.number().int().min(1).max(20),
  luggage: z.number().int().min(0).max(20),
  hours: z.number().int().min(1).max(24).optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  distanceKm: z.number().min(0).max(10000).optional(),
  extras: z.object({
    childSeat: z.boolean().optional(),
    meetAndGreet: z.boolean().optional(),
    extraLuggage: z.boolean().optional(),
  }).optional(),
  passengerDetails: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email().max(200),
    phone: z.string().min(5).max(30),
    flightNumber: z.string().max(20).optional(),
    terminal: z.string().max(50).optional(),
    specialRequests: z.string().max(1000).optional(),
  }),
})

function generateQuoteReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = randomBytes(3).toString('hex').toUpperCase() // 16^6 = 16.7M combinations
  return `QR-${datePart}-${suffix}`
}

export async function POST(req: Request) {
  const { allowed, remaining, limit } = await checkRateLimit('/api/submit-quote', getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  try {
    const raw = await req.json()
    const parsed = submitQuoteSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const body = parsed.data

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
      firstName: body.passengerDetails.firstName,
      lastName: body.passengerDetails.lastName,
      email: body.passengerDetails.email,
      phone: body.passengerDetails.phone,
      flightNumber: body.passengerDetails.flightNumber || '',
      terminal: body.passengerDetails.terminal || '',
      specialRequests: body.passengerDetails.specialRequests || '',
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
