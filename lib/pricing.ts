import type { TripType, VehicleClass, PriceBreakdown } from '@/types/booking'

export interface Rates {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
}

export const VEHICLE_CLASSES: VehicleClass[] = ['business', 'first_class', 'business_van']

export function calculatePrice(
  tripType: TripType,
  vehicleClass: VehicleClass,
  distanceKm: number | null,
  hours: number,
  days: number,
  rates: Rates
): PriceBreakdown {
  let base = 0
  // 'transfer' covers all distance-based trips including airport pickup/dropoff
  // Phase 1 TripType union is 'transfer' | 'hourly' | 'daily' — airport types
  // are mapped to 'transfer' by the UI (TripTypeTabs sets tripType='transfer'
  // for Airport Pickup and Airport Dropoff). No 'airport_*' values exist at runtime.
  if (tripType === 'transfer') {
    if (distanceKm === null) throw new Error('distance required for transfer')
    base = Math.round(distanceKm * rates.ratePerKm[vehicleClass])
  } else if (tripType === 'hourly') {
    base = Math.round(hours * rates.hourlyRate[vehicleClass])
  } else if (tripType === 'daily') {
    base = Math.round(days * rates.dailyRate[vehicleClass])
  }
  return { base, extras: 0, total: base, currency: 'EUR' }
}

export function buildPriceMap(
  tripType: TripType,
  distanceKm: number | null,
  hours: number,
  days: number,
  rates: Rates
): Record<VehicleClass, PriceBreakdown> {
  return Object.fromEntries(
    VEHICLE_CLASSES.map((vc) => [vc, calculatePrice(tripType, vc, distanceKm, hours, days, rates)])
  ) as Record<VehicleClass, PriceBreakdown>
}

export function dateDiffDays(pickupDate: string, returnDate: string): number {
  const pickup = new Date(pickupDate + 'T00:00:00')
  const ret = new Date(returnDate + 'T00:00:00')
  const diff = Math.round((ret.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff) // minimum 1 day
}

