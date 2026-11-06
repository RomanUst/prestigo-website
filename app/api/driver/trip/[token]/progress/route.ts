import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import {
  driverConfirmCash,
  driverTripRequestSchema,
  driverTripNote,
  driverTripStep,
  hasTripIdentity,
  loadDriverTripForStep,
} from '@/lib/driver-trip-step'
import { requestNoShowForDriver } from '@/lib/no-show'

/**
 * DTRIP-03/04/08 (Phase 67) rebuilt for Phase 87 (D-01, D-07, D-12): unauthenticated,
 * token-gated write route for the driver's step flow.
 *
 * Invariant (replaces the v2.2 "driver_assignments only" rule): this route never touches the
 * bookings table. A status change goes through lib/driver-trip-step.ts, which calls the status
 * service (compare-and-set, actor 'driver'); the route only guards, parses and delegates. It
 * imports no GNet client and no Chatwoot/EspoCRM module. The path stays under /api/driver/trip
 * (CSRF prefix in middleware.ts) and keeps the literal rate-limit key below.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const tooBig = enforceMaxBody(request, 10000)
  if (tooBig) return tooBig

  const { allowed } = await checkRateLimit('/api/driver/trip/progress', getClientIp(request))
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params
  const parsedToken = z.string().uuid().safeParse(token)
  if (!parsedToken.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = driverTripRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // Single read-only lookup, re-run live on every request (TOCTOU-closed).
  const trip = await loadDriverTripForStep(supabase, parsedToken.data)
  if (!trip || !hasTripIdentity(trip)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const data = parsed.data
  let result
  if ('step' in data) {
    result = await driverTripStep({ supabase, trip, step: data.step, nowMs: Date.now() })
  } else if ('note' in data) {
    result = await driverTripNote({ supabase, trip, note: data.note })
  } else {
    switch (data.action) {
      case 'request_no_show':
        result = await requestNoShowForDriver({ supabase, trip, nowMs: Date.now() })
        break
      case 'confirm_cash':
        // D-11: the settle goes through lib/payments/cash.ts (the one writer of payment_state); no amount is read.
        result = await driverConfirmCash({ trip })
        break
    }
  }

  return NextResponse.json(result.body, { status: result.httpStatus })
}
