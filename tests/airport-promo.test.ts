import { describe, it, expect } from 'vitest'
import { getEffectiveAirportPrice } from '@/lib/airport-promo'
import type { PricingGlobals } from '@/lib/pricing-config'

const baseGlobals = (overrides: Partial<PricingGlobals> = {}): PricingGlobals => ({
  airportFee: 0,
  nightCoefficient: 1.2,
  holidayCoefficient: 1.3,
  extraChildSeat: 15,
  extraLuggage: 10,
  holidayDates: [],
  returnDiscountPercent: 10,
  hourlyMinHours: 2,
  hourlyMaxHours: 8,
  notificationFlags: null,
  airportPromoActive: false,
  airportRegularPriceEur: 69,
  airportPromoPriceEur: 59,
  ...overrides,
})

describe('PRICE-07 / D-14: getEffectiveAirportPrice', () => {
  it('returns promo price for business class when promo active', () => {
    const cfg = baseGlobals({ airportPromoActive: true })
    expect(getEffectiveAirportPrice('business', cfg, 120, 76)).toBe(59)
  })

  it('returns regular price for business class when promo inactive', () => {
    const cfg = baseGlobals({ airportPromoActive: false })
    expect(getEffectiveAirportPrice('business', cfg, 120, 76)).toBe(69)
  })

  it('returns sClassPrice parameter for first_class regardless of promo', () => {
    expect(getEffectiveAirportPrice('first_class', baseGlobals({ airportPromoActive: true }), 120, 76)).toBe(120)
    expect(getEffectiveAirportPrice('first_class', baseGlobals({ airportPromoActive: false }), 120, 76)).toBe(120)
  })

  it('returns vClassPrice parameter for business_van regardless of promo', () => {
    expect(getEffectiveAirportPrice('business_van', baseGlobals({ airportPromoActive: true }), 120, 76)).toBe(76)
    expect(getEffectiveAirportPrice('business_van', baseGlobals({ airportPromoActive: false }), 120, 76)).toBe(76)
  })

  it('returns 0 for unknown vehicle class', () => {
    expect(getEffectiveAirportPrice('unknown', baseGlobals(), 120, 76)).toBe(0)
  })
})
