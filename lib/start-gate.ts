import { pickupInstantMs } from '@/lib/prague-date'
import { haversineDistanceKm } from '@/lib/geo-distance'

/**
 * Start gate for the driver's first step (Phase 87 D-14, DRV-01).
 *
 * The "On my way" step unlocks at  pickup instant - (2 h + travel time from Prague centre).
 * A pickup within CENTRE_RADIUS_KM of the centre needs no travel time, so it unlocks exactly
 * 2 h before pickup. The instant comes from pickupInstantMs (UTC ms, DST-safe); no string
 * arithmetic on wall-clock times happens here.
 *
 * The Maps estimate never blocks a driver: any failure (missing key, timeout, HTTP error,
 * unreadable answer) falls back to a haversine estimate. The tunable constants below are
 * assumptions (RESEARCH A1-A3); changing them is a one-file edit.
 */

/** Old Town Square, the reference point for "central Prague" (RESEARCH A1). */
export const PRAGUE_CENTRE = { lat: 50.0875, lng: 14.4208 } as const
/** A pickup closer than this to the centre needs no travel time. */
export const CENTRE_RADIUS_KM = 5
/** The driver may start this long before pickup, plus the travel time. */
export const START_LEAD_MINUTES = 120
/** Upper bound on the travel allowance, from Maps or from the fallback. */
export const MAX_TRAVEL_MINUTES = 240

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUTES_TIMEOUT_MS = 3000
const FALLBACK_DETOUR_FACTOR = 1.4
const FALLBACK_SPEED_KMH = 45
const CACHE_MAX_ENTRIES = 500
const MS_PER_MINUTE = 60_000

// Module-level cache for the lambda lifetime: bookingId:lat:lng -> travel minutes.
const travelCache = new Map<string, number>()

/** Test hook: forget every cached travel estimate. */
export function clearStartGateCache(): void {
  travelCache.clear()
}

/** Straight-line km -> minutes at a typical city speed with a detour factor. */
export function fallbackTravelMinutes(km: number): number {
  return Math.ceil(((km * FALLBACK_DETOUR_FACTOR) / FALLBACK_SPEED_KMH) * 60)
}

export function startUnlockAtMs(pickupMs: number, travelMinutes: number): number {
  return pickupMs - (START_LEAD_MINUTES + travelMinutes) * MS_PER_MINUTE
}

export interface StartGateOptions {
  bookingId?: string
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function capTravel(minutes: number): number {
  return Math.min(Math.max(minutes, 0), MAX_TRAVEL_MINUTES)
}

async function routesDurationMinutes(
  dest: { lat: number; lng: number },
  opts: StartGateOptions,
): Promise<number | null> {
  // Same key handling as app/api/calculate-price: a Vercel env value saved with a trailing
  // literal "\n" is cleaned. Read inside the function, never at module level, never logged.
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.replace(/\\n$/, '').trim()
  if (!apiKey) return null

  const doFetch = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? ROUTES_TIMEOUT_MS)
  try {
    const res = await doFetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration',
        Referer: 'https://rideprestigo.com',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: PRAGUE_CENTRE.lat, longitude: PRAGUE_CENTRE.lng } } },
        destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
        travelMode: 'DRIVE',
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { routes?: Array<{ duration?: string }> }
    // duration is a protobuf-style string such as "1500s" (possibly "1500.5s").
    const raw = data?.routes?.[0]?.duration
    if (typeof raw !== 'string') return null
    const seconds = Number.parseFloat(raw.replace(/s$/, ''))
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return Math.ceil(seconds / 60)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Travel allowance in minutes from the Prague centre to the pickup: 0 for a missing origin or a
 * pickup within CENTRE_RADIUS_KM, else the Routes API duration, else the haversine estimate.
 */
export async function travelMinutesFromCentre(
  origin: { lat: number | null; lng: number | null } | null,
  opts: StartGateOptions = {},
): Promise<number> {
  if (!origin || origin.lat === null || origin.lng === null) return 0
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return 0

  const km = haversineDistanceKm(PRAGUE_CENTRE.lat, PRAGUE_CENTRE.lng, origin.lat, origin.lng)
  if (km <= CENTRE_RADIUS_KM) return 0

  const key = `${opts.bookingId ?? ''}:${origin.lat}:${origin.lng}`
  const cached = travelCache.get(key)
  if (cached !== undefined) return cached

  const fromMaps = await routesDurationMinutes({ lat: origin.lat, lng: origin.lng }, opts)
  const minutes = capTravel(fromMaps ?? fallbackTravelMinutes(km))

  if (travelCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = travelCache.keys().next().value
    if (oldest !== undefined) travelCache.delete(oldest)
  }
  travelCache.set(key, minutes)
  return minutes
}

export interface StartGate {
  /** When the first step unlocks; null when the pickup instant is unknown. */
  unlocksAtMs: number | null
  open: boolean
}

export async function getStartGate(
  booking: {
    id?: string
    pickup_utc: string | null
    pickup_date: string
    pickup_time: string
    origin_lat: number | null
    origin_lng: number | null
  },
  nowMs: number,
  opts: StartGateOptions = {},
): Promise<StartGate> {
  const pickupMs = pickupInstantMs(booking)
  if (pickupMs === null) return { unlocksAtMs: null, open: true }

  const travel = await travelMinutesFromCentre(
    { lat: booking.origin_lat, lng: booking.origin_lng },
    { ...opts, bookingId: opts.bookingId ?? booking.id },
  )
  const unlocksAtMs = startUnlockAtMs(pickupMs, travel)
  return { unlocksAtMs, open: nowMs >= unlocksAtMs }
}
