// Phase 93 (plan 93-05; TRIP-03, TRIP-04; D-01, D-02, D-10, D-20): pure tour price math.
// Client-safe: no server imports. The page, the booking box and the server (93-16) all call tourFare,
// so the displayed price and the charged price can never drift apart. Prices come only from the
// tours / tour_settings columns (admin-set), never from literals here.

import { VEHICLE_CONFIG } from '@/types/booking'
import { MAX_EXTRA_HOURS, TOUR_CAR_KEYS, type TourCarKey, type TourRow, type TourSettingsRow } from '@/lib/tours/types'

export type TourPriceErrorCode = 'NO_PRICE' | 'NO_EXTRA_PRICE' | 'BAD_EXTRA_HOURS'

export class TourPriceError extends Error {
  readonly code: TourPriceErrorCode
  constructor(code: TourPriceErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'TourPriceError'
    this.code = code
  }
}

type TourPrices = Pick<TourRow, 'price_e_eur' | 'price_s_eur' | 'price_v_eur'>
type ExtraPrices = Pick<TourSettingsRow, 'extra_hour_e_eur' | 'extra_hour_s_eur' | 'extra_hour_v_eur'>

const BASE_COLUMN: Record<TourCarKey, keyof TourPrices> = {
  business: 'price_e_eur',
  first_class: 'price_s_eur',
  business_van: 'price_v_eur',
}

const EXTRA_COLUMN: Record<TourCarKey, keyof ExtraPrices> = {
  business: 'extra_hour_e_eur',
  first_class: 'extra_hour_s_eur',
  business_van: 'extra_hour_v_eur',
}

function validPrice(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

/**
 * EUR price of a tour for a car class and a number of extra hours (D-01, D-02):
 * the class price plus extraHours x the class's extra-hour price. extraHours must be an integer
 * 0..MAX_EXTRA_HOURS (D-20); anything else, an unknown class, or a missing price throws a TourPriceError.
 */
export function tourFare(tour: TourPrices, settings: ExtraPrices, car: TourCarKey, extraHours: number): number {
  if (!(TOUR_CAR_KEYS as readonly string[]).includes(car)) {
    throw new TourPriceError('NO_PRICE', 'unknown car class')
  }
  if (!Number.isInteger(extraHours) || extraHours < 0 || extraHours > MAX_EXTRA_HOURS) {
    throw new TourPriceError('BAD_EXTRA_HOURS')
  }
  const base = tour[BASE_COLUMN[car]]
  if (!validPrice(base)) throw new TourPriceError('NO_PRICE')
  if (extraHours === 0) return Math.round(base * 100) / 100
  const extra = settings[EXTRA_COLUMN[car]]
  if (!validPrice(extra)) throw new TourPriceError('NO_EXTRA_PRICE')
  return Math.round((base + extraHours * extra) * 100) / 100
}

/** D-10: the classes whose cabin holds n passengers, in the order business, first_class, business_van. */
export function classesForPassengers(n: number): TourCarKey[] {
  if (!Number.isFinite(n)) return []
  const fits = new Set<string>(VEHICLE_CONFIG.filter((v) => v.maxPassengers >= n).map((v) => v.key))
  return TOUR_CAR_KEYS.filter((k) => fits.has(k))
}

/** Lowest class price among the classes that fit n passengers; null when none fits or none is priced. */
export function lowestFittingPrice(tour: TourPrices, n = 1): number | null {
  const prices = classesForPassengers(n)
    .map((k) => tour[BASE_COLUMN[k]])
    .filter(validPrice)
  return prices.length === 0 ? null : Math.min(...prices)
}

/** Whole hours of a tour day: drive there and back plus the included hours; null when the drive time is unknown. */
export function totalTripHours(tour: Pick<TourRow, 'drive_minutes_each_way' | 'hours_included'>): number | null {
  const drive = tour.drive_minutes_each_way
  if (typeof drive !== 'number' || !Number.isFinite(drive)) return null
  return Math.round((2 * drive + 60 * tour.hours_included) / 60)
}
