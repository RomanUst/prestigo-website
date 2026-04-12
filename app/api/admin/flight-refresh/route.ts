import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkFlight, FlightCheckError } from '@/lib/flight-status'
import { enforceMaxBody } from '@/lib/request-guards'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const refreshSchema = z.object({
  bookingId: z.string().uuid(),
})

export async function POST(request: Request) {
  // 1. Body size guard
  const tooBig = enforceMaxBody(request, 1_000)
  if (tooBig) return tooBig

  // 2. Admin auth
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 3. Zod parse (400 on failure)
  const body = await request.json()
  const parsed = refreshSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
  }

  // 4. Business logic — fetch booking from DB (pickup_date from DB, never from client, per D-12 / T-34-06)
  const supabase = createSupabaseServiceClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select('flight_iata, pickup_date')
    .eq('id', parsed.data.bookingId)
    .single()

  if (!booking?.flight_iata) {
    return NextResponse.json({ error: 'No flight number on this booking' }, { status: 422 })
  }

  try {
    const info = await checkFlight(booking.flight_iata, booking.pickup_date)
    const updatePayload = {
      flight_status:              info.status,
      flight_estimated_arrival:   info.estimatedArrival,
      flight_delay_minutes:       info.delayMinutes,
      flight_departure_airport:   info.departureAirport,
      flight_arrival_airport:     info.arrivalAirport,
      flight_terminal:            info.terminal,
    }
    await supabase.from('bookings').update(updatePayload).eq('id', parsed.data.bookingId)
    return NextResponse.json({ ok: true, ...updatePayload })
  } catch (err) {
    const code = err instanceof FlightCheckError ? err.code : 'UNKNOWN'
    return NextResponse.json({ ok: false, error: code }, { status: 503 })
  }
}
