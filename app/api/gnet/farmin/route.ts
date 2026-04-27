// Phase 49: GNet Farm In webhook endpoint.
// Wave 1 — Basic Auth + Zod perimeter. Plans 03/04 wire QUOTE/BOOKING branches.

import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'

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

  // 5. Plans 03/04 replace this with QUOTE/BOOKING branches.
  // For Wave 1, return a placeholder so auth+Zod tests can verify a 200 path exists.
  return Response.json(
    {
      success: true,
      reservationId: 'TODO-WAVE-2',
      totalAmount: '0.00',
      transactionId: parsed.data.transactionId,
    },
    { status: 200 },
  )
}
