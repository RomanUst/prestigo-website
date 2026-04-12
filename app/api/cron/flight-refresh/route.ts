import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkFlight, FlightCheckError } from '@/lib/flight-status'

export const maxDuration = 300

export async function GET(request: Request) {
  // 1. CRON_SECRET guard (fail-closed: also 401 if var not set)
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Query today's airport bookings with a flight number
  const today = new Date().toISOString().slice(0, 10)
  const supabase = createSupabaseServiceClient()
  const { data: bookings, error: dbError } = await supabase
    .from('bookings')
    .select('id, flight_iata, pickup_date')
    .in('trip_type', ['airport_arrival', 'airport_departure'])
    .eq('pickup_date', today)
    .not('flight_iata', 'is', null)

  if (dbError) {
    console.error('[cron/flight-refresh] query failed:', dbError.message)
    return NextResponse.json({ ok: false, error: 'DB_QUERY_FAILED' }, { status: 500 })
  }

  // 3. Per-booking loop — skip-and-continue on any failure
  const results = { processed: 0, failed: 0 }
  for (const booking of (bookings ?? [])) {
    try {
      const info = await checkFlight(booking.flight_iata!, booking.pickup_date)
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          flight_status:            info.status,
          flight_estimated_arrival: info.estimatedArrival,
          flight_delay_minutes:     info.delayMinutes,
          flight_departure_airport: info.departureAirport,
          flight_arrival_airport:   info.arrivalAirport,
          flight_terminal:          info.terminal,
        })
        .eq('id', booking.id)
      if (updateError) {
        console.error('[cron/flight-refresh] update failed', booking.id, updateError.message)
        results.failed++
      } else {
        results.processed++
      }
    } catch (err) {
      const code = err instanceof FlightCheckError ? err.code : 'UNKNOWN'
      console.error('[cron/flight-refresh] FlightStats error for', booking.id, code)
      results.failed++
    }
  }

  return NextResponse.json({ ok: true, today, ...results })
}
