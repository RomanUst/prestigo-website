import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { readEnv } from '@/lib/env'
import { isTripLinkValid } from '@/lib/trip-token'
import { buildDriverWidgetConfig } from '@/lib/chatwoot-identity'

/**
 * Phase 87 UAT gap 3: token-gated driver Help chat identity (D-07).
 *
 * Turns a live trip link into a Chatwoot widget config that identifies the driver and names the
 * booking, so the chat is not an anonymous visitor chat (which would become a CRM Lead). The public
 * /api/chatwoot/identity route derives identity only from the Supabase session and drivers have none,
 * hence this separate route under the CSRF-protected /api/driver/trip prefix.
 *
 * The trip token never leaves this route: the response holds the public website token, the driver
 * identifier and its HMAC, a display name and the booking reference, nothing else. The route reads env
 * and computes the HMAC locally (no VPS call, Phase 76 D-19). Never log the token, a name or the HMAC.
 */
export const dynamic = 'force-dynamic'

interface HelpLookupRow {
  id: string
  driver_id: string
  status: string | null
  bookings: { booking_reference: string; status: string; driver_id: string | null } | null
  drivers: { name: string | null } | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const tooBig = enforceMaxBody(request, 1_000)
  if (tooBig) return tooBig

  const { allowed } = await checkRateLimit('/api/driver/trip/help', getClientIp(request))
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params
  const parsedToken = z.string().uuid().safeParse(token)
  if (!parsedToken.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('driver_assignments')
    .select('id, driver_id, status, bookings!inner(booking_reference, status, driver_id), drivers(name)')
    .eq('trip_token', parsedToken.data)
    .single()

  const row = data as unknown as HelpLookupRow | null
  if (
    error ||
    !row ||
    !row.bookings ||
    !isTripLinkValid({
      assignmentDriverId: row.driver_id,
      bookingDriverId: row.bookings.driver_id,
      bookingStatus: row.bookings.status,
      assignmentStatus: row.status,
    })
  ) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const config = buildDriverWidgetConfig({
    baseUrl: readEnv('CHATWOOT_BASE_URL'),
    websiteToken: readEnv('CHATWOOT_WEBSITE_TOKEN'),
    hmacSecret: readEnv('CHATWOOT_WIDGET_HMAC_SECRET'),
    driverId: row.driver_id,
    driverName: row.drivers?.name ?? null,
    bookingReference: row.bookings.booking_reference,
  })

  return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } })
}
