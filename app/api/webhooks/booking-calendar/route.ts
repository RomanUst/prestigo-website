import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import { syncBookingToCalendar } from '@/lib/google-calendar'

// Called by the Postgres trigger `bookings_gcal_sync` (pg_net) whenever a
// booking enters, changes within, or leaves an accepted status. The handler
// re-reads the booking and makes Google Calendar match it, so retries and
// out-of-order calls are harmless.

const bodySchema = z.object({ booking_id: z.string().uuid() })

export async function POST(request: Request) {
  const sizeError = enforceMaxBody(request, 1024)
  if (sizeError) return sizeError

  // Fail-closed shared-secret check (timing-safe)
  const secret = process.env.GCAL_SYNC_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || !authHeader) return new Response('Unauthorized', { status: 401 })
  const expected = Buffer.from(`Bearer ${secret}`)
  const got = Buffer.from(authHeader)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 422 })

  try {
    const result = await syncBookingToCalendar(parsed.data.booking_id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[booking-calendar] sync failed', parsed.data.booking_id, err)
    return NextResponse.json({ ok: false, error: 'sync_failed' }, { status: 502 })
  }
}
