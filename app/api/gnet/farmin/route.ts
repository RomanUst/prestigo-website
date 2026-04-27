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

  // BOOKING branch — Plan 04 implements DB insert + idempotency.
  return Response.json(
    {
      success: true,
      reservationId: 'TODO-WAVE-3',
      totalAmount: price.toFixed(2),
      transactionId: parsed.data.transactionId,
    },
    { status: 200 },
  )
}
