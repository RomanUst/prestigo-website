import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { checkFlight, FlightCheckError } from '@/lib/flight-status'
import { getFlightCache, setFlightCache } from '@/lib/flight-cache'

const querySchema = z.object({
  flight: z.string().min(3).max(8).regex(/^[A-Z0-9]+$/i),
  date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(req: Request) {
  // 1. Rate limit per IP (T-33-01: DoS protection)
  const { allowed } = await checkRateLimit('/api/check-flight', getClientIp(req))
  if (!allowed) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }

  // 2. Validate query params (T-33-02: Tampering — Zod schema)
  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    flight: searchParams.get('flight') ?? '',
    date:   searchParams.get('date') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid parameters' }, { status: 400 })
  }

  const { flight, date } = parsed.data
  // T-33-04: cache key normalised to uppercase + validated date
  const cacheKey = `flight:${flight.toUpperCase()}:${date}`

  // 3. Cache lookup (T-33-05: FlightStats quota protection)
  const cached = await getFlightCache(cacheKey)
  if (cached) {
    return NextResponse.json({ ok: true, ...cached })
  }

  // 4. Call FlightStats wrapper
  try {
    const info = await checkFlight(flight, date)
    const payload = {
      flight_iata:               flight.toUpperCase(),
      flight_status:             info.status,
      flight_estimated_arrival:  info.estimatedArrival,
      flight_delay_minutes:      info.delayMinutes,
      flight_departure_airport:  info.departureAirport,
      flight_arrival_airport:    info.arrivalAirport,
      flight_terminal:           info.terminal,
    }
    await setFlightCache(cacheKey, payload, 600)
    return NextResponse.json({ ok: true, ...payload })
  } catch (err) {
    // 5. Graceful degradation (D-08 per plan): always 200 with ok: false
    // T-33-03: only expose error code — never stack traces, API keys, internal URLs
    const code = err instanceof FlightCheckError ? err.code : 'UNKNOWN'
    return NextResponse.json({ ok: false, error: code }, { status: 200 })
  }
}
