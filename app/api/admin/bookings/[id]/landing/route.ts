import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { applyLandingChange } from '@/lib/landing-change'

// Phase 91 plan 15 (STOP-05, D-08, D-11): the operator moves the pickup of an airport booking to a new landing time.
//
//   POST { landing_date, landing_time, expected_pickup_date, expected_pickup_time, notify_client }
//   -> 200 { ok: true, landing_date, landing_time, pickup_date, pickup_time, payment_effect? }
//      | 404 | 422 { error: 'no_landing' | 'final_status' | 'invalid_landing' }
//      | 409 { error: 'pickup_changed' (+ the server pickup) | 'stale' | 'payment_in_progress' }
//
// This is the ONLY caller of applyLandingChange: nothing moves a pickup without a person pressing the button (D-11).
//
// Guard order (project API patterns): enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400)
// -> JSON parse (400) -> strict schema (400) -> the function (404 / 422 / 409). A shape error is 400; a well-formed
// request that the booking cannot take is 422 (two-step parse rule).

const MAX_BODY_BYTES = 2_048

const idSchema = z.string().uuid()

const DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

const bodySchema = z.strictObject({
  landing_date: z.string().regex(DATE),
  landing_time: z.string().regex(CLOCK),
  expected_pickup_date: z.string().regex(DATE),
  expected_pickup_time: z.string().regex(CLOCK),
  notify_client: z.boolean(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. Body size: the header check, then the real length (a chunked body carries no content-length).
  const bodyCheck = enforceMaxBody(request, MAX_BODY_BYTES)
  if (bodyCheck) return bodyCheck

  // 2. Admin guard: before anything of the body is read.
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 3. Booking id
  const { id: bookingId } = await params
  if (!idSchema.safeParse(bookingId).success) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  // 4. JSON parse (400), then the strict schema (400)
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const body = parsed.data

  // 5. The move. Ids only in the log: no names, e-mail addresses or notes.
  try {
    const result = await applyLandingChange({
      bookingId,
      landingDate: body.landing_date,
      landingTime: body.landing_time,
      expectedPickupDate: body.expected_pickup_date,
      expectedPickupTime: body.expected_pickup_time,
      notifyClient: body.notify_client,
      actor: { id: user.id ?? null },
    })

    if (result.status === 200) {
      return NextResponse.json({
        ok: true,
        landing_date: result.landingDate,
        landing_time: result.landingTime,
        pickup_date: result.pickupDate,
        pickup_time: result.pickupTime,
        ...(result.paymentEffect ? { payment_effect: result.paymentEffect } : {}),
      })
    }
    if (result.status === 409 && result.error === 'pickup_changed') {
      return NextResponse.json(
        { error: result.error, pickup_date: result.pickupDate, pickup_time: result.pickupTime },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: result.error }, { status: result.status })
  } catch (err) {
    console.error('[admin/bookings/landing.POST] failed', {
      bookingId,
      message: err instanceof Error ? err.message : 'unknown',
    })
    return NextResponse.json({ error: 'Move failed' }, { status: 500 })
  }
}
