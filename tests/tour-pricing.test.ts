// Phase 93 plan 05 (TRIP-03, TRIP-04, T-93-11): pure tour price math. Prices here are plain test numbers.
import { describe, it, expect } from 'vitest'
import { TourPriceError, classesForPassengers, lowestFittingPrice, totalTripHours, tourFare } from '@/lib/tours/pricing'

const TOUR = { price_e_eur: 100, price_s_eur: 180, price_v_eur: 120 }
const EXTRA = { extra_hour_e_eur: 40, extra_hour_s_eur: 60, extra_hour_v_eur: 50 }

function codeOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof TourPriceError ? e.code : 'OTHER'
  }
}

describe('tourFare', () => {
  it('is the class price plus extra hours times the class extra-hour price', () => {
    expect(tourFare(TOUR, EXTRA, 'first_class', 2)).toBe(300)
    expect(tourFare(TOUR, EXTRA, 'business', 3)).toBe(220)
    expect(tourFare(TOUR, EXTRA, 'business_van', 1)).toBe(170)
  })
  it('returns the base for 0 extra hours, even when no extra price is set', () => {
    expect(tourFare(TOUR, EXTRA, 'business', 0)).toBe(100)
    expect(tourFare(TOUR, { extra_hour_e_eur: null, extra_hour_s_eur: null, extra_hour_v_eur: null }, 'business', 0)).toBe(100)
  })
  it('allows 12 extra hours and refuses 13, -1 and 1.5', () => {
    expect(tourFare(TOUR, EXTRA, 'business', 12)).toBe(580)
    expect(codeOf(() => tourFare(TOUR, EXTRA, 'business', 13))).toBe('BAD_EXTRA_HOURS')
    expect(codeOf(() => tourFare(TOUR, EXTRA, 'business', -1))).toBe('BAD_EXTRA_HOURS')
    expect(codeOf(() => tourFare(TOUR, EXTRA, 'business', 1.5))).toBe('BAD_EXTRA_HOURS')
    expect(codeOf(() => tourFare(TOUR, EXTRA, 'business', Number.NaN))).toBe('BAD_EXTRA_HOURS')
  })
  it('throws NO_PRICE for a missing class price', () => {
    expect(codeOf(() => tourFare({ ...TOUR, price_s_eur: null }, EXTRA, 'first_class', 0))).toBe('NO_PRICE')
  })
  it('throws NO_EXTRA_PRICE for extra hours without an extra-hour price', () => {
    expect(codeOf(() => tourFare(TOUR, { ...EXTRA, extra_hour_v_eur: null }, 'business_van', 2))).toBe('NO_EXTRA_PRICE')
  })
  it('refuses an unknown class key from an untrusted body', () => {
    expect(codeOf(() => tourFare(TOUR, EXTRA, 'limo' as never, 0))).toBe('NO_PRICE')
  })
  it('rounds to 2 decimals', () => {
    expect(tourFare({ ...TOUR, price_e_eur: 100.005 }, EXTRA, 'business', 0)).toBe(100.01)
  })
})

describe('classesForPassengers', () => {
  it('lists the fitting classes in order', () => {
    expect(classesForPassengers(1)).toEqual(['business', 'first_class', 'business_van'])
    expect(classesForPassengers(3)).toEqual(['business', 'first_class', 'business_van'])
    expect(classesForPassengers(4)).toEqual(['business_van'])
    expect(classesForPassengers(6)).toEqual(['business_van'])
    expect(classesForPassengers(7)).toEqual([])
  })
})

describe('lowestFittingPrice', () => {
  it('uses only the classes that fit the passengers', () => {
    expect(lowestFittingPrice(TOUR)).toBe(100)
    expect(lowestFittingPrice(TOUR, 4)).toBe(120)
  })
  it('is null when nothing fits or nothing is priced', () => {
    expect(lowestFittingPrice(TOUR, 7)).toBeNull()
    expect(lowestFittingPrice({ price_e_eur: null, price_s_eur: null, price_v_eur: null })).toBeNull()
    expect(lowestFittingPrice({ ...TOUR, price_v_eur: null }, 4)).toBeNull()
  })
  it('skips unpriced classes', () => {
    expect(lowestFittingPrice({ price_e_eur: null, price_s_eur: 180, price_v_eur: 120 })).toBe(120)
  })
})

describe('totalTripHours', () => {
  it('is round((2 x drive + 60 x hours) / 60)', () => {
    expect(totalTripHours({ drive_minutes_each_way: 150, hours_included: 5 })).toBe(10)
    expect(totalTripHours({ drive_minutes_each_way: 100, hours_included: 4 })).toBe(7)
  })
  it('is null when the drive time is unknown', () => {
    expect(totalTripHours({ drive_minutes_each_way: null, hours_included: 5 })).toBeNull()
  })
})
