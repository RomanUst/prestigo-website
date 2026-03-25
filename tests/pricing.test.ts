import { describe, it } from 'vitest'

describe('pricing module', () => {
  describe('PRICE-02: Transfer pricing', () => {
    it.todo('calculates base = distanceKm * RATE_PER_KM for business class')
    it.todo('calculates base = distanceKm * RATE_PER_KM for first_class')
    it.todo('calculates base = distanceKm * RATE_PER_KM for business_van')
    it.todo('throws error when distanceKm is null for transfer trip type')
  })

  describe('PRICE-03: Hourly pricing', () => {
    it.todo('calculates base = hours * HOURLY_RATE for each vehicle class')
    it.todo('uses minimum 2 hours when hours is 0')
  })

  describe('PRICE-04: Daily pricing', () => {
    it.todo('calculates base = days * DAILY_RATE for each vehicle class')
    it.todo('dateDiffDays returns minimum 1 day')
    it.todo('dateDiffDays calculates correct day difference')
  })

  describe('PRICE-05: Rate tables server-side only', () => {
    it.todo('RATE_PER_KM contains all 3 vehicle classes')
    it.todo('HOURLY_RATE contains all 3 vehicle classes')
    it.todo('DAILY_RATE contains all 3 vehicle classes')
  })

  describe('buildPriceMap', () => {
    it.todo('returns prices for all 3 vehicle classes in a single call')
    it.todo('each PriceBreakdown has base, extras, total, currency fields')
    it.todo('total equals base + extras')
  })
})
