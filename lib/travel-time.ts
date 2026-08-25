// Shared travel-time estimation for the booking flow.
//
// `distanceKm` is real road distance (Google Routes `distanceMeters / 1000`,
// or the road distances defined in lib/routes.ts).
//
// A flat 45 km/h average badly overstated long intercity routes: Prague→Munich
// (~378 km road) showed ~8.5h for what is really a ~4h drive. We use a
// two-segment model instead — the first stretch is slower city/suburban
// driving, the remainder is highway.
const CITY_KM = 20 // first leg treated as city/suburban
const CITY_SPEED_KMH = 40 // avg incl. traffic, lights, pickup manoeuvring
const HIGHWAY_SPEED_KMH = 95 // sustained motorway cruising
const BUFFER_MIN = 5 // small fixed buffer

/**
 * Estimate driving time in minutes for a given road distance.
 * Returns null when distance is unknown.
 */
export function estimateTravelMinutes(distanceKm: number | null): number | null {
  if (!distanceKm) return null
  const cityKm = Math.min(distanceKm, CITY_KM)
  const highwayKm = Math.max(distanceKm - CITY_KM, 0)
  return Math.round((cityKm / CITY_SPEED_KMH) * 60 + (highwayKm / HIGHWAY_SPEED_KMH) * 60) + BUFFER_MIN
}
