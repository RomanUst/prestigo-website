// WR-02 (Phase 64 review): a cheap, no-API sanity check on a client-supplied
// `distance_km` price input. NOT a replacement for a real routing engine —
// road distance is always >= straight-line distance, so this only catches a
// distance_km value that is IMPOSSIBLY small for the given coordinates
// (the direction a compromised admin session would want to submit to shrink
// the recomputed price). See app/api/admin/bookings/route.ts callers.

/** Great-circle (haversine) distance between two lat/lng points, in kilometers. */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const EARTH_RADIUS_KM = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

// Chauffeur routes are rarely more than 2x the straight-line distance. Used
// as a generous lower-bound divisor: a submitted distance_km smaller than
// (haversine / DISTANCE_SANITY_MULTIPLIER) is implausible for real-world
// roads and requires an explicit override_price to accept.
export const DISTANCE_SANITY_MULTIPLIER = 2
