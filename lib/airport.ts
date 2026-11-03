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
