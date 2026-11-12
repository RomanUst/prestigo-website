// Prague Václav Havel Airport coordinates. Shared by the price calculator (airport promo / flat
// airport fare) and the no-show waiting time (a longer free wait applies to airport pickups).
export const PRG_LAT = 50.1008
export const PRG_LNG = 14.26
// ~3 km radius (degree tolerance)
export const PRG_RADIUS_DEG = 0.027

export function isNearAirport(pt: { lat: number; lng: number } | null | undefined): boolean {
  if (!pt) return false
  return (
    Math.abs(pt.lat - PRG_LAT) < PRG_RADIUS_DEG &&
    Math.abs(pt.lng - PRG_LNG) < PRG_RADIUS_DEG
  )
}

/**
 * Phase 91: the airport flag of a trip, from coordinates only. The quote and the checkout both use this
 * so a browser-supplied airport flag can never change the price (T-91-05).
 */
export function isAirportTrip(
  origin: { lat: number; lng: number } | null | undefined,
  destination: { lat: number; lng: number } | null | undefined,
): boolean {
  return isNearAirport(origin) || isNearAirport(destination)
}
