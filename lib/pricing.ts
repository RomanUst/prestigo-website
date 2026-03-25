import type { TripType, VehicleClass, PriceBreakdown } from '@/types/booking'

export const RATE_PER_KM: Record<VehicleClass, number> = {
  business: 2.80,
  first_class: 4.20,
  business_van: 3.50,
}

export const HOURLY_RATE: Record<VehicleClass, number> = {
  business: 55,
  first_class: 85,
  business_van: 70,
}

export const DAILY_RATE: Record<VehicleClass, number> = {
  business: 320,
  first_class: 480,
  business_van: 400,
}

// TODO: set production rates — these are placeholders

export const VEHICLE_CLASSES: VehicleClass[] = ['business', 'first_class', 'business_van']

export function calculatePrice(
  tripType: TripType,
  vehicleClass: VehicleClass,
  distanceKm: number | null,
  hours: number,
  days: number
): PriceBreakdown {
  let base = 0
  // 'transfer' covers all distance-based trips including airport pickup/dropoff
  // Phase 1 TripType union is 'transfer' | 'hourly' | 'daily' — airport types
  // are mapped to 'transfer' by the UI (TripTypeTabs sets tripType='transfer'
  // for Airport Pickup and Airport Dropoff). No 'airport_*' values exist at runtime.
  if (tripType === 'transfer') {
    if (distanceKm === null) throw new Error('distance required for transfer')
    base = Math.round(distanceKm * RATE_PER_KM[vehicleClass])
  } else if (tripType === 'hourly') {
    base = Math.round(hours * HOURLY_RATE[vehicleClass])
  } else if (tripType === 'daily') {
    base = Math.round(days * DAILY_RATE[vehicleClass])
  }
  return { base, extras: 0, total: base, currency: 'EUR' }
}

export function buildPriceMap(
  tripType: TripType,
  distanceKm: number | null,
  hours: number,
  days: number
): Record<VehicleClass, PriceBreakdown> {
  return Object.fromEntries(
    VEHICLE_CLASSES.map((vc) => [vc, calculatePrice(tripType, vc, distanceKm, hours, days)])
  ) as Record<VehicleClass, PriceBreakdown>
}

export function dateDiffDays(pickupDate: string, returnDate: string): number {
  const pickup = new Date(pickupDate + 'T00:00:00')
  const ret = new Date(returnDate + 'T00:00:00')
  const diff = Math.round((ret.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff) // minimum 1 day
}
