// Phase 49: GNet Farm In webhook endpoint.
// Wave 1 — Basic Auth + Zod perimeter (Plan 02).
// Wave 2 — QUOTE branch + business validation (Plan 03).
// Wave 3 — BOOKING insert + idempotency (Plan 04).

import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import { findRouteByPlaceIds, type RoutePrice } from '@/lib/route-prices'
import { mapGnetVehicle } from '@/lib/gnet-vehicle-map'
import { generateBookingReference } from '@/lib/booking-reference'
import { createSupabaseServiceClient } from '@/lib/supabase'
import type { VehicleClass } from '@/types/booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 50_000

// ── Zod schemas ────────────────────────────────────────────────────────────
const GnetCommonSchema = z.object({
  providerId:     z.string().min(1).max(200),
  transactionId:  z.string().min(1).max(200),
  vehicleType:    z.string().min(1).max(50),
  pickupPlaceId:  z.string().min(1).max(500),
  dropoffPlaceId: z.string().min(1).max(500),
  passengerCount: z.number().int().min(1).max(20).optional(),
  passengerName:  z.string().max(200).optional(),
  passengerEmail: z.string().email().max(200).optional(),
  passengerPhone: z.string().max(50).optional(),
}).passthrough()

const GnetQuoteSchema = GnetCommonSchema.extend({
  reservationType: z.literal('QUOTE'),
  pickupDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pickupTime:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
})

const GnetBookingSchema = GnetCommonSchema.extend({
  reservationType: z.literal('BOOKING'),
  gnetResNo:       z.string().min(1).max(200),
  pickupDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupTime:      z.string().regex(/^\d{2}:\d{2}$/),
})

export const GnetPayloadSchema = z.discriminatedUnion('reservationType', [
  GnetQuoteSchema,
  GnetBookingSchema,
])

export type GnetPayload = z.infer<typeof GnetPayloadSchema>

// ── Auth ───────────────────────────────────────────────────────────────────
function verifyBasicAuth(authHeader: string | null): boolean {
  const key    = process.env.GNET_WEBHOOK_KEY
  const secret = process.env.GNET_WEBHOOK_SECRET
  if (!key || !secret || !authHeader) return false
  if (!authHeader.startsWith('Basic ')) return false
  const expected = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`
  if (authHeader.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function businessFailure(message: string): Response {
  // GNet retries on non-2xx — business failures are 200 with success:false.
  return Response.json({ success: false, message }, { status: 200 })
}

function priceForClass(route: RoutePrice, vClass: VehicleClass): number {
  switch (vClass) {
    case 'business':     return route.eClassEur
    case 'first_class':  return route.sClassEur
    case 'business_van': return route.vClassEur
  }
}

// ── Handlers ───────────────────────────────────────────────────────────────
export function GET(): Response {
  return Response.json({ success: true }, { status: 200 })
}

export async function POST(req: Request): Promise<Response> {
  // 1. Body-size guard (before reading body)
  const tooBig = enforceMaxBody(req, MAX_BODY_BYTES)
  if (tooBig) return tooBig

  // 2. Basic Auth
  if (!verifyBasicAuth(req.headers.get('authorization'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Parse JSON (malformed body → 200 success:false per GNet retry contract)
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return businessFailure('Invalid JSON payload')
  }

  // 4. Zod validation
  const parsed = GnetPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    return businessFailure('Invalid payload schema')
  }

  // 5. providerId verification (FARMIN-04)
  if (parsed.data.providerId !== process.env.GNET_GRIDDID) {
    return businessFailure('Unknown providerId')
  }

  // 6. Vehicle type mapping (FARMIN-08)
  const vehicleClass = mapGnetVehicle(parsed.data.vehicleType)
  if (!vehicleClass) {
    return businessFailure('Unknown vehicle type')
  }

  // 7. Route lookup (FARMIN-09)
  const route = await findRouteByPlaceIds(parsed.data.pickupPlaceId, parsed.data.dropoffPlaceId)
  if (!route) {
    return businessFailure('Route not found')
  }

  // 8. Price selection
  const price = priceForClass(route, vehicleClass)

  // 9. Branch on reservationType
  if (parsed.data.reservationType === 'QUOTE') {
    // FARMIN-05: no DB writes for QUOTE
    return Response.json(
      {
        success: true,
        reservationId: generateBookingReference(),
        totalAmount: price.toFixed(2),
        transactionId: parsed.data.transactionId,
      },
      { status: 200 },
    )
  }

  // BOOKING branch — dual insert with transaction_id idempotency (Plan 04).
  const supabase = createSupabaseServiceClient()
  const bookingReference = generateBookingReference()
  const amountEur = price
  const amountCzk = Math.round(price * 25) // TODO: use eurToCzk() helper once exported from lib/currency

  // Step 1: Insert bookings row (booking_id NOT NULL in gnet_bookings requires this first)
  const bookingsRow = {
    booking_reference:   bookingReference,
    booking_type:        'confirmed',
    status:              'pending',
    leg:                 'outbound',
    trip_type:           'transfer',
    booking_source:      'gnet',
    passengers:          parsed.data.passengerCount ?? 1,
    luggage:             0,
    pickup_date:         parsed.data.pickupDate,
    pickup_time:         parsed.data.pickupTime,
    vehicle_class:       vehicleClass,
    distance_km:         route.distanceKm,
    amount_eur:          amountEur,
    amount_czk:          amountCzk,
    origin_address:      route.fromLabel,
    destination_address: route.toLabel,
    client_first_name:   (parsed.data.passengerName?.split(' ')[0]) ?? 'GNet',
    client_last_name:    (parsed.data.passengerName?.split(' ').slice(1).join(' ')) || 'Partner',
    client_email:        parsed.data.passengerEmail ?? 'noreply@gnet.local',
    client_phone:        parsed.data.passengerPhone ?? 'unknown',
  }

  const { data: insertedBooking, error: bookingErr } = await supabase
    .from('bookings')
    .insert([bookingsRow])
    .select('id, booking_reference')
    .single()

  if (bookingErr || !insertedBooking) {
    console.error('[gnet-farmin] bookings insert failed', bookingErr)
    return Response.json({ success: false, message: 'Internal error' }, { status: 500 })
  }

  // Step 2: Upsert gnet_bookings (idempotent on transaction_id)
  const gnetRow = {
    booking_id:     insertedBooking.id,
    gnet_res_no:    parsed.data.gnetResNo,
    transaction_id: parsed.data.transactionId,
    raw_payload:    parsed.data,
  }

  const { data: upsertData, error: upsertErr } = await supabase
    .from('gnet_bookings')
    .upsert([gnetRow], { onConflict: 'transaction_id', ignoreDuplicates: true })
    .select('id, booking_id')

  if (upsertErr) {
    console.error('[gnet-farmin] gnet_bookings upsert failed', upsertErr)
    // Roll back the orphan bookings row
    await supabase.from('bookings').delete().eq('id', insertedBooking.id)
    return Response.json({ success: false, message: 'Internal error' }, { status: 500 })
  }

  if (upsertData && upsertData.length > 0) {
    // Step 3a: New row created — return new reservationId
    return Response.json(
      {
        success:       true,
        reservationId: insertedBooking.booking_reference,
        totalAmount:   price.toFixed(2),
        transactionId: parsed.data.transactionId,
      },
      { status: 200 },
    )
  }

  // Step 3b: Duplicate transaction_id — find existing, clean up orphan bookings row
  const { data: existingGnet, error: existingErr } = await supabase
    .from('gnet_bookings')
    .select('id, booking_id')
    .eq('transaction_id', parsed.data.transactionId)
    .single()

  if (existingErr || !existingGnet) {
    console.error('[gnet-farmin] failed to read existing gnet_bookings', existingErr)
    await supabase.from('bookings').delete().eq('id', insertedBooking.id)
    return Response.json({ success: false, message: 'Internal error' }, { status: 500 })
  }

  const { data: existingBooking, error: refErr } = await supabase
    .from('bookings')
    .select('booking_reference')
    .eq('id', existingGnet.booking_id)
    .single()

  if (refErr || !existingBooking) {
    console.error('[gnet-farmin] failed to read existing bookings reference', refErr)
    await supabase.from('bookings').delete().eq('id', insertedBooking.id)
    return Response.json({ success: false, message: 'Internal error' }, { status: 500 })
  }

  // Clean up orphan bookings row created in Step 1 (will never be linked to gnet_bookings)
  await supabase.from('bookings').delete().eq('id', insertedBooking.id)

  return Response.json(
    {
      success:       true,
      reservationId: existingBooking.booking_reference,
      totalAmount:   price.toFixed(2),
      transactionId: parsed.data.transactionId,
    },
    { status: 200 },
  )
}
