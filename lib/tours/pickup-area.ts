// Phase 93 (plan 93-05; TRIP-04; D-05, D-22): where a tour pickup is allowed.
// A tour has a fixed price for a pickup in Prague, never at the airport. One pure, client-safe function
// serves the checkout UX and the server (93-16), so a pickup that the page refuses can never slip through
// the API. The radius comes from tour_settings.pickup_radius_km via the caller.

import { isAirportPickup } from '@/lib/no-show-wait'

/** Prague Old Town Square; the centre of the pickup area. */
export const OLD_TOWN_SQUARE = { lat: 50.0875, lng: 14.4213 } as const

const EARTH_RADIUS_KM = 6371

function rad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type TourPickupCheck = 'ok' | 'airport' | 'out_of_area'

/** The airport rule wins over the radius: an airport pickup is never a tour pickup. Unusable coordinates are out_of_area. */
export function checkTourPickup(
  input: { lat: number; lng: number; address: string | null },
  radiusKm: number,
): TourPickupCheck {
  const finite = Number.isFinite(input.lat) && Number.isFinite(input.lng)
  if (isAirportPickup({ origin_lat: finite ? input.lat : null, origin_lng: finite ? input.lng : null, origin_address: input.address })) {
    return 'airport'
  }
  if (!finite || !Number.isFinite(radiusKm)) return 'out_of_area'
  return distanceKm(OLD_TOWN_SQUARE, input) <= radiusKm ? 'ok' : 'out_of_area'
}
