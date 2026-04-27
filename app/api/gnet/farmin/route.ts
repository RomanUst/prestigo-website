// Phase 49: GNet Farm In webhook endpoint.
// Pricing uses the SAME engine as /api/calculate-price:
//   distanceKm × ratePerKm (admin-configured) + airport fee + night/holiday coefficients + minFare clamp.
// Distance comes from Google Routes API.

import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import { mapGnetVehicle } from '@/lib/gnet-vehicle-map'
import { generateBookingReference } from '@/lib/booking-reference'
import { createSupabaseServiceClient, createSupabasePublicReadClient } from '@/lib/supabase'
import { eurToCzk } from '@/lib/currency'
import { getPricingConfig } from '@/lib/pricing-config'
import { computeOutboundLegTotal } from '@/lib/server-pricing'
import { isInAnyZone } from '@/lib/zones'
import type { VehicleClass } from '@/types/booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 50_000

// Prague Václav Havel Airport (PRG) — used when pickup or dropoff is an airport
// without lat/lon in the GNet payload (typical for IATA-only entries).
const PRG_LAT = 50.1008
const PRG_LNG = 14.26

// ── Zod schemas (actual GNet payload format) ───────────────────────────────
const GnetLocationSchema = z
  .object({
    address:  z.string().optional(),
    lat:      z.string().optional(),
    lon:      z.string().optional(),
    locationType: z.string().optional(),
    country:  z.string().optional(),
    city:     z.string().optional(),
    state:    z.string().optional(),
    zipCode:  z.string().optional(),
    landmark: z.string().optional(),
    time:     z.string().optional(),
    flightInfo: z
      .object({
        airlineCode:  z.string().optional(),
        flightNumber: z.string().optional(),
      })
      .optional(),
  })
  .passthrough()

const GnetPassengerSchema = z
  .object({
    firstName:   z.string().optional(),
    lastName:    z.string().optional(),
    email:       z.string().optional(),
    phoneNumber: z.string().optional(),
  })
  .passthrough()

export const GnetPayloadSchema = z
  .object({
    griddID:              z.string().min(1).max(200),
    transactionId:        z.string().min(1).max(200),
    preferredVehicleType: z.string().min(1).max(50),
    locations: z.object({
      pickup:  GnetLocationSchema,
      dropOff: GnetLocationSchema,
    }),
    passengerCount: z.union([z.string(), z.number()]).optional(),
    passengers:     z.array(GnetPassengerSchema).optional(),
    reservationType: z.string().optional(),
    affiliateReservation: z
      .object({
        requesterResNo: z.string().optional(),
        providerResNo:  z.string().optional(),
        requesterId:    z.string().optional(),
        providerId:     z.string().optional(),
        status:         z.string().optional(),
        action:         z.string().optional(),
      })
      .optional(),
  })
  .passthrough()

export type GnetPayload = z.infer<typeof GnetPayloadSchema>

// ── Auth ───────────────────────────────────────────────────────────────────
function verifyBasicAuth(authHeader: string | null): boolean {
  const key    = process.env.GNET_WEBHOOK_KEY?.trim()
  const secret = process.env.GNET_WEBHOOK_SECRET?.trim()
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

function parsePickupDateTime(isoStr: string): { date: string; time: string } | null {
  const match = isoStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (!match) return null
  return { date: match[1], time: match[2] }
}

function resolveCoords(
  loc: { lat?: string; lon?: string; locationType?: string; address?: string },
): { lat: number; lng: number } | null {
  // Airport without lat/lon → assume PRG (Prestigo only operates from PRG anyway).
  if (loc.locationType === 'airport') {
    if (loc.lat && loc.lon) {
      const lat = parseFloat(loc.lat)
      const lng = parseFloat(loc.lon)
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
    return { lat: PRG_LAT, lng: PRG_LNG }
  }
  if (loc.lat && loc.lon) {
    const lat = parseFloat(loc.lat)
    const lng = parseFloat(loc.lon)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

async function googleRoutesDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error('[gnet-farmin] GOOGLE_MAPS_API_KEY not configured')
    return null
  }
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters',
        'Referer': 'https://rideprestigo.com',
      },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: origin.lat,      longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode:  'DRIVE',
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error('[gnet-farmin] Google Routes error:', res.status, errBody)
      return null
    }
    const data = await res.json()
    const meters = data?.routes?.[0]?.distanceMeters
    if (!Number.isFinite(meters) || meters <= 0) {
      console.error('[gnet-farmin] No distanceMeters in Google Routes response')
      return null
    }
    return meters / 1000
  } catch (err) {
    console.error('[gnet-farmin] Google Routes fetch failed:', err)
    return null
  }
}

// ── Handlers ───────────────────────────────────────────────────────────────
export function GET(): Response {
  return Response.json({ success: true }, { status: 200 })
}

export async function POST(req: Request): Promise<Response> {
  // 1. Body-size guard
  const tooBig = enforceMaxBody(req, MAX_BODY_BYTES)
  if (tooBig) return tooBig

  // 2. Basic Auth
  if (!verifyBasicAuth(req.headers.get('authorization'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Parse JSON
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return businessFailure('Invalid JSON payload')
  }

  // 4. Zod validation
  const parsed = GnetPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[gnet-farmin] zod validation failed', parsed.error.flatten())
    return businessFailure('Invalid payload schema')
  }

  // 5. griddID verification
  if (parsed.data.griddID !== process.env.GNET_GRIDDID?.trim()) {
    return businessFailure('Unknown griddID')
  }

  // 6. Vehicle type mapping
  const vehicleClass: VehicleClass | null = mapGnetVehicle(parsed.data.preferredVehicleType)
  if (!vehicleClass) {
    return businessFailure('Unknown vehicle type')
  }

  // 7. Parse pickup date/time
  const pickupTimeRaw = parsed.data.locations.pickup.time
  if (!pickupTimeRaw) {
    return businessFailure('Missing pickup time')
  }
  const dt = parsePickupDateTime(pickupTimeRaw)
  if (!dt) {
    return businessFailure('Invalid pickup time format')
  }

  // 8. Resolve pickup + dropoff coords
  const originCoords = resolveCoords(parsed.data.locations.pickup)
  const destCoords   = resolveCoords(parsed.data.locations.dropOff)
  if (!originCoords) return businessFailure('Cannot resolve pickup coordinates')
  if (!destCoords)   return businessFailure('Cannot resolve dropoff coordinates')

  // 9. Coverage zone check — at least pickup OR dropoff must be in an active zone.
  // Mirrors /api/calculate-price ZONES-04 + ZONES-05. GNet has no quote-mode,
  // so out-of-coverage requests are rejected as business failures.
  {
    const supabasePublic = createSupabasePublicReadClient()
    const { data: zones } = await supabasePublic
      .from('coverage_zones')
      .select('id, geojson')
      .eq('active', true)
    if (zones && zones.length > 0) {
      const originInZone = isInAnyZone(originCoords.lat, originCoords.lng, zones)
      const destInZone   = isInAnyZone(destCoords.lat,   destCoords.lng,   zones)
      if (!originInZone && !destInZone) {
        return businessFailure('Outside coverage area')
      }
    }
  }

  // 10. Distance via Google Routes API
  const distanceKm = await googleRoutesDistanceKm(originCoords, destCoords)
  if (distanceKm === null) {
    return businessFailure('Distance calculation failed')
  }

  // 10. Load admin-configured pricing
  let rates
  try {
    rates = await getPricingConfig()
  } catch (err) {
    console.error('[gnet-farmin] getPricingConfig failed:', err)
    return businessFailure('Pricing config unavailable')
  }

  // 11. Compute price using the same engine as /api/calculate-price
  const isAirport =
    parsed.data.locations.pickup.locationType === 'airport' ||
    parsed.data.locations.dropOff.locationType === 'airport'
  const price = computeOutboundLegTotal(
    vehicleClass,
    distanceKm,
    0,
    0,
    'transfer',
    dt.date,
    dt.time,
    isAirport,
    rates,
  )

  // 12. QUOTE branch — no DB writes
  if (parsed.data.reservationType?.toUpperCase() === 'QUOTE') {
    return Response.json(
      {
        success:       true,
        reservationId: generateBookingReference(),
        totalAmount:   price.toFixed(2),
        transactionId: parsed.data.transactionId,
      },
      { status: 200 },
    )
  }

  // 13. BOOKING branch — dual insert with transaction_id idempotency
  const supabase = createSupabaseServiceClient()
  const bookingReference = generateBookingReference()
  const amountEur = price
  const amountCzk = eurToCzk(price)

  const firstPassenger = parsed.data.passengers?.[0]
  const passengerCount =
    typeof parsed.data.passengerCount === 'string'
      ? parseInt(parsed.data.passengerCount, 10) || 1
      : (parsed.data.passengerCount ?? 1)

  const gnetResNo =
    parsed.data.affiliateReservation?.requesterResNo ??
    parsed.data.transactionId

  const originAddress =
    parsed.data.locations.pickup.address ?? parsed.data.locations.pickup.landmark ?? 'Unknown pickup'
  const destinationAddress =
    parsed.data.locations.dropOff.address ?? parsed.data.locations.dropOff.landmark ?? 'Unknown dropoff'

  const bookingsRow = {
    booking_reference:   bookingReference,
    booking_type:        'confirmed',
    status:              'pending',
    leg:                 'outbound',
    trip_type:           'transfer',
    booking_source:      'gnet',
    passengers:          passengerCount,
    luggage:             0,
    pickup_date:         dt.date,
    pickup_time:         dt.time,
    vehicle_class:       vehicleClass,
    distance_km:         Math.round(distanceKm * 10) / 10,
    amount_eur:          amountEur,
    amount_czk:          amountCzk,
    origin_address:      originAddress,
    destination_address: destinationAddress,
    client_first_name:   firstPassenger?.firstName ?? 'GNet',
    client_last_name:    firstPassenger?.lastName ?? 'Partner',
    client_email:        firstPassenger?.email || 'noreply@gnet.local',
    client_phone:        firstPassenger?.phoneNumber || 'unknown',
  }

  const { data: insertedBooking, error: bookingErr } = await supabase
    .from('bookings')
    .insert([bookingsRow])
    .select('id, booking_reference')
    .single()

  if (bookingErr || !insertedBooking) {
    console.error('[gnet-farmin] bookings insert failed', bookingErr)
    return businessFailure('Internal error (booking insert)')
  }

  const gnetRow = {
    booking_id:     insertedBooking.id,
    gnet_res_no:    gnetResNo,
    transaction_id: parsed.data.transactionId,
    raw_payload:    parsed.data,
  }

  const { data: upsertData, error: upsertErr } = await supabase
    .from('gnet_bookings')
    .upsert([gnetRow], { onConflict: 'transaction_id', ignoreDuplicates: true })
    .select('id, booking_id')

  if (upsertErr) {
    console.error('[gnet-farmin] gnet_bookings upsert failed', upsertErr)
    await supabase.from('bookings').delete().eq('id', insertedBooking.id)
    return businessFailure('Internal error (gnet upsert)')
  }

  if (!upsertData) {
    console.error('[gnet-farmin] gnet_bookings upsert returned null')
    await supabase.from('bookings').delete().eq('id', insertedBooking.id)
    return businessFailure('Internal error (upsert null response)')
  }

  if (upsertData.length > 0) {
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

  // Duplicate transaction_id — return existing reservation reference
  const { data: existingGnet, error: existingErr } = await supabase
    .from('gnet_bookings')
    .select('id, booking_id')
    .eq('transaction_id', parsed.data.transactionId)
    .single()

  if (existingErr || !existingGnet) {
    await supabase.from('bookings').delete().eq('id', insertedBooking.id)
    return businessFailure('Internal error (duplicate lookup)')
  }

  const { data: existingBooking, error: refErr } = await supabase
    .from('bookings')
    .select('booking_reference')
    .eq('id', existingGnet.booking_id)
    .single()

  if (refErr || !existingBooking) {
    await supabase.from('bookings').delete().eq('id', insertedBooking.id)
    return businessFailure('Internal error (booking reference lookup)')
  }

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
