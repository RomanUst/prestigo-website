import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { isTripLinkValid } from '@/lib/trip-token'

/**
 * DTRIP-03/04/08 (Phase 67, D-03/D-04): unauthenticated, token-gated write
 * route for driver-reported trip progress.
 *
 * D-03/DTRIP-04 isolation (hard rule): this file touches ONLY
 * driver_assignments. It intentionally imports nothing beyond next/server,
 * zod, the service client, the rate-limit/body-guard helpers, and the pure
 * trip-link validity predicate — there is structurally no call site here
 * that could push a status to the external dispatch system or write to the
 * bookings table's own status column.
 */

const TRIP_PROGRESS_VALUES = ['en_route', 'arrived', 'on_board', 'completed', 'no_show'] as const

const progressSchema = z
  .object({
    progress: z.enum(TRIP_PROGRESS_VALUES).optional(),
    note: z.string().max(2000).optional(),
  })
  .refine((data) => data.progress !== undefined || data.note !== undefined, {
    message: 'At least one of progress or note is required',
  })

interface TripProgressBookingRow {
  driver_id: string | null
  status: string
}

interface TripProgressAssignmentRow {
  id: string
  driver_id: string
  bookings: TripProgressBookingRow | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
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

  const parsed = progressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // Single read-only lookup, re-run live on every request (TOCTOU-closed) —
  // resolves the assignment and its own booking's driver_id + status only.
  const { data: rawAssignment, error: lookupError } = await supabase
    .from('driver_assignments')
    .select('id, driver_id, bookings!inner(driver_id, status)')
    .eq('trip_token', parsedToken.data)
    .single()

  const assignment = rawAssignment as unknown as TripProgressAssignmentRow | null

  if (lookupError || !assignment || !assignment.bookings) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  // D-03 security boundary, re-checked live: driver_id match (self-invalidates
  // on reassignment) AND non-terminal booking status.
  const valid = isTripLinkValid({
    assignmentDriverId: assignment.driver_id,
    bookingDriverId: assignment.bookings.driver_id,
    bookingStatus: assignment.bookings.status,
  })

  if (!valid) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const { progress, note } = parsed.data
  const updatePayload: Record<string, unknown> = {
    trip_progress_updated_at: new Date().toISOString(),
  }
  if (progress !== undefined) updatePayload.trip_progress = progress
  if (note !== undefined) updatePayload.trip_note = note

  const { error: updateError } = await supabase
    .from('driver_assignments')
    .update(updatePayload)
    .eq('id', assignment.id)

  if (updateError) {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
