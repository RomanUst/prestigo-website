// Phase 49: GNet Farm In webhook endpoint.
// Schema updated to match actual GNet payload format (griddID, preferredVehicleType,
// nested locations with lat/lon — NOT the originally assumed pickupPlaceId schema).

import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import { getAllRoutes, getRoutePrice, type RoutePrice } from '@/lib/route-prices'
import { mapGnetVehicle } from '@/lib/gnet-vehicle-map'
import { generateBookingReference } from '@/lib/booking-reference'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { eurToCzk } from '@/lib/currency'
import type { VehicleClass } from '@/types/booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 50_000

// ── Destination coordinate lookup (used when place_ids are unpopulated) ────
// Each entry: [lat, lon, slug-suffix-after-"prague-"]
const DEST_COORDS: Array<[number, number, string]> = [
  [49.95,  15.27, 'kutna-hora'],
  [49.74,  13.37, 'plzen'],
  [50.04,  15.78, 'pardubice'],
  [50.21,  15.83, 'hradec-kralove'],
  [50.77,  15.06, 'liberec'],
  [50.23,  12.87, 'karlovy-vary'],
  [49.97,  12.70, 'marianske-lazne'],
  [50.12,  12.35, 'frantiskovy-lazne'],
  [48.81,  14.32, 'cesky-krumlov'],
  [48.97,  14.47, 'ceske-budejovice'],
  [49.19,  16.61, 'brno'],
  [49.59,  17.25, 'olomouc'],
  [49.22,  17.66, 'zlin'],
  [49.82,  18.27, 'ostrava'],
  [51.05,  13.74, 'dresden'],
  [51.34,  12.38, 'leipzig'],
  [48.57,  13.46, 'passau'],
  [50.98,  11.03, 'erfurt'],
  [49.02,  12.10, 'regensburg'],
  [49.45,  11.08, 'nuremberg'],
  [48.14,  17.11, 'bratislava'],
  [48.20,  16.37, 'vienna'],
  [50.09,  14.42, 'prague'], // Prague city center (for reverse trips)
]

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function findRouteForGnet(
  dropoffLat: number,
  dropoffLon: number,
): Promise<RoutePrice | null> {
  if (!dropoffLat || !dropoffLon) return null

  // 1. Try coordinate proximity (within 20 km of known city)
  let bestSuffix: string | null = null
  let bestDist = Infinity
  for (const [cityLat, cityLon, suffix] of DEST_COORDS) {
    const d = haversineKm(dropoffLat, dropoffLon, cityLat, cityLon)
    if (d < bestDist && d < 20) {
      bestDist = d
      bestSuffix = suffix
    }
  }

  if (bestSuffix) {
    const slug = bestSuffix === 'prague' ? null : `prague-${bestSuffix}`
    if (slug) {
      const r = await getRoutePrice(slug)
      if (r) return r
    }
  }

  // 2. Fallback: label-based scan (if any routes still carry place_ids or have matching labels)
  const all = await getAllRoutes()
  const match = all.find((r) => {
    if (r.placeIds.length >= 2) return false // will never be reached until place_ids filled
    // Simple distance from Prague to our destination cities already handled above
    return false
  })
  return match ?? null
}

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
    time:     z.string().optional(), // pickup ISO datetime "2026-04-28T10:00:00"
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
    griddID:              z.string().min(1).max(200),  // Our provider GRiDD ID
    transactionId:        z.string().min(1).max(200),
    preferredVehicleType: z.string().min(1).max(50),
    locations: z.object({
      pickup:  GnetLocationSchema,
      dropOff: GnetLocationSchema,
    }),
    passengerCount: z.union([z.string(), z.number()]).optional(),
    passengers:     z.array(GnetPassengerSchema).optional(),
    reservationType: z.string().optional(), // "REGULAR", "QUOTE", etc.
    affiliateReservation: z
      .object({
        requesterResNo: z.string().optional(), // GNet reservation number
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

function parsePickupDateTime(isoStr: string): { date: string; time: string } | null {
  // Expect "2026-04-28T10:00:00" or similar ISO format
  const match = isoStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (!match) return null
  return { date: match[1], time: match[2] }
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

  // 5. griddID verification (our provider ID)
  if (parsed.data.griddID !== process.env.GNET_GRIDDID) {
    return businessFailure('Unknown griddID')
  }

  // 6. Vehicle type mapping
  const vehicleClass = mapGnetVehicle(parsed.data.preferredVehicleType)
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

  // 8. Route lookup using dropoff coordinates
  const dropoffLat = parseFloat(parsed.data.locations.dropOff.lat ?? '0')
  const dropoffLon = parseFloat(parsed.data.locations.dropOff.lon ?? '0')
  const route = await findRouteForGnet(dropoffLat, dropoffLon)
  if (!route) {
    return businessFailure('Route not found')
  }

  // 9. Price selection
  const price = priceForClass(route, vehicleClass)

  // 10. QUOTE branch — no DB writes
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

  // 11. BOOKING branch — dual insert with transaction_id idempotency
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
    distance_km:         route.distanceKm,
    amount_eur:          amountEur,
    amount_czk:          amountCzk,
    origin_address:      route.fromLabel,
    destination_address: route.toLabel,
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
