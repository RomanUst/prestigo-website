import type { TripType, VehicleClass, PriceBreakdown } from '@/types/booking'

export interface Rates {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
}

const RATE_PER_KM: Record<VehicleClass, number> = {
  business: 2.80,
  first_class: 4.20,
  business_van: 3.50,
}

const HOURLY_RATE: Record<VehicleClass, number> = {
  business: 55,
  first_class: 85,
  business_van: 70,
}

const DAILY_RATE: Record<VehicleClass, number> = {
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

