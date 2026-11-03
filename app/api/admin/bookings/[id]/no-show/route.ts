import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { advanceResultToResponse } from '@/lib/booking-status-service'
import { BOOKING_STATUSES } from '@/lib/booking-status'
import { clearNoShowRequest, confirmNoShow } from '@/lib/no-show'

/**
 * Phase 87 D-16(a): the operator's side of a driver's no-show request. The route lives under
 * /api/admin, so middleware's strict Origin CSRF check applies.
 *
 *  - GET: { status, noShowRequestedAt, driverName } for the admin banner.
 *  - POST { action: 'confirm' }: on_location -> no_show through the status service (the only way
 *    a booking becomes no_show; the driver route cannot).
 *  - POST { action: 'dismiss' } ("Client found"): clears the request so the driver may ask again.
 *
 * This route never writes bookings.status itself.
 */

const postSchema = z
  .object({
    action: z.enum(['confirm', 'dismiss']),
    expected_status: z.enum(BOOKING_STATUSES).optional(),
  })
  .strict()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: bookingId } = await params
  if (!z.string().uuid().safeParse(bookingId).success) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('status, no_show_requested_at, driver_id')
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const row = booking as { status: string; no_show_requested_at: string | null; driver_id: string | null }
  let driverName: string | null = null
  if (row.driver_id) {
    const { data: driver } = await supabase
      .from('drivers')
      .select('name')
      .eq('id', row.driver_id)
      .single()
    driverName = (driver as { name?: string | null } | null)?.name ?? null
  }

  return NextResponse.json({
    status: row.status,
    noShowRequestedAt: row.no_show_requested_at ?? null,
    driverName,
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const tooBig = enforceMaxBody(request, 2_000)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: bookingId } = await params
  if (!z.string().uuid().safeParse(bookingId).success) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const actor = { type: 'admin' as const, id: user?.id ?? null }

  if (parsed.data.action === 'confirm') {
    const result = await confirmNoShow({
      bookingId,
      actor,
      expectedFrom: parsed.data.expected_status,
    })
    const failure = advanceResultToResponse(result)
    if (failure) return failure
    return NextResponse.json({ ok: true, status: 'no_show' })
  }

  // dismiss: idempotent, a missing request is not an error
  const cleared = await clearNoShowRequest({ bookingId, actor })
  if (!cleared.ok) {
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, noShowRequestedAt: null })
}
