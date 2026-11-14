import { MAX_STOPS } from '@/lib/stops'

/**
 * Server-side Google Routes distance through the client's stops (Phase 91, STOP-02).
 *
 * The request body is deliberately limited to origin, destination, travelMode and intermediates so it
 * stays on the Essentials tier and Google never reorders the stops (D-17): no routingPreference, no
 * departureTime, no optimizeWaypointOrder, no via waypoints. The function never throws and logs only
 * a status or a reason, never coordinates or the response body.
 */

export interface RoutePoint {
  lat: number
  lng: number
}

export type RouteDistanceResult =
  | { ok: true; distanceKm: number; durationMin: number | null }
  | { ok: false; reason: 'no_key' | 'invalid_input' | 'http_error' | 'no_route' | 'timeout' | 'network' }

export const ROUTES_TIMEOUT_MS = 8000

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

function validPoint(p: RoutePoint | null | undefined): p is RoutePoint {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  )
}

function toWaypoint(p: RoutePoint) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } }
}

function isTimeout(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    ((err as { name?: string }).name === 'TimeoutError' || (err as { name?: string }).name === 'AbortError')
  )
}

export async function computeRouteDistance(input: {
  origin: RoutePoint
  destination: RoutePoint
  intermediates?: ReadonlyArray<RoutePoint>
}): Promise<RouteDistanceResult> {
  const intermediates = input.intermediates ?? []
  if (
    !validPoint(input.origin) ||
    !validPoint(input.destination) ||
    intermediates.length > MAX_STOPS ||
    !intermediates.every(validPoint)
  ) {
    return { ok: false, reason: 'invalid_input' }
  }

  // .replace(/\\n$/, '').trim() defends against Vercel env values that were saved with a trailing
  // literal "\n" (backslash + n) suffix.
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.replace(/\\n$/, '').trim()
  if (!apiKey) {
    console.error('route-distance: GOOGLE_MAPS_API_KEY not configured')
    return { ok: false, reason: 'no_key' }
  }

  const body: Record<string, unknown> = {
    origin: toWaypoint(input.origin),
    destination: toWaypoint(input.destination),
    travelMode: 'DRIVE',
  }
  // The client's stop order is the route order: never optimised, never merged, never deduplicated.
  if (intermediates.length > 0) {
    body.intermediates = intermediates.map(toWaypoint)
  }

  let res: Response
  try {
    res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
        Referer: 'https://rideprestigo.com',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ROUTES_TIMEOUT_MS),
    })
  } catch (err) {
    const reason = isTimeout(err) ? 'timeout' : 'network'
    console.error('route-distance: request failed:', reason)
    return { ok: false, reason }
  }

  if (!res.ok) {
    console.error('route-distance: Google Routes HTTP status', res.status)
    return { ok: false, reason: 'http_error' }
  }

  let data: { routes?: Array<{ distanceMeters?: number; duration?: string }> } | null
  try {
    data = await res.json()
  } catch {
    console.error('route-distance: unreadable response')
    return { ok: false, reason: 'no_route' }
  }

  const distanceMeters = data?.routes?.[0]?.distanceMeters
  if (!distanceMeters) {
    console.error('route-distance: no route in response')
    return { ok: false, reason: 'no_route' }
  }

  // Real drive time from the same response. `duration` is a protobuf-style string like "14523s";
  // parse to minutes, null so the client falls back to its distance-based estimate.
  const durationRaw = data?.routes?.[0]?.duration
  const durationSec = durationRaw ? parseInt(durationRaw.replace(/[^0-9]/g, ''), 10) : NaN
  const durationMin = Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec / 60) : null

  return { ok: true, distanceKm: distanceMeters / 1000, durationMin }
}
