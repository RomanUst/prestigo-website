import { describe, it, expect } from 'vitest'
import { calculatePrice, buildPriceMap, dateDiffDays } from '@/lib/pricing'
import type { Rates } from '@/lib/pricing'

const testRates: Rates = {
  ratePerKm: { business: 2.80, first_class: 4.20, business_van: 3.50 },
  hourlyRate: { business: 55, first_class: 85, business_van: 70 },
  dailyRate:  { business: 320, first_class: 480, business_van: 400 },
}

describe('pricing module', () => {
  describe('PRICE-02: Transfer pricing', () => {
    it('calculates base = distanceKm * ratePerKm for business class', () => {
      const result = calculatePrice('transfer', 'business', 10, 0, 0, testRates)
      expect(result).toEqual({ base: 28, extras: 0, total: 28, currency: 'EUR' })
    })

    it('calculates base = distanceKm * ratePerKm for first_class', () => {
      const result = calculatePrice('transfer', 'first_class', 10, 0, 0, testRates)
      expect(result).toEqual({ base: 42, extras: 0, total: 42, currency: 'EUR' })
    })

    it('calculates base = distanceKm * ratePerKm for business_van', () => {
      const result = calculatePrice('transfer', 'business_van', 10, 0, 0, testRates)
      expect(result).toEqual({ base: 35, extras: 0, total: 35, currency: 'EUR' })
    })

    it('throws error when distanceKm is null for transfer trip type', () => {
      expect(() => calculatePrice('transfer', 'business', null, 0, 0, testRates)).toThrow('distance required for transfer')
    })
  })

  describe('PRICE-03: Hourly pricing', () => {
    it('calculates base = hours * hourlyRate for business class', () => {
      const result = calculatePrice('hourly', 'business', null, 3, 0, testRates)
      expect(result).toEqual({ base: 165, extras: 0, total: 165, currency: 'EUR' })
    })

    it('calculates base = hours * hourlyRate for first_class', () => {
      const result = calculatePrice('hourly', 'first_class', null, 2, 0, testRates)
      expect(result).toEqual({ base: 170, extras: 0, total: 170, currency: 'EUR' })
    })

    it('calculates base = hours * hourlyRate for business_van', () => {
      const result = calculatePrice('hourly', 'business_van', null, 2, 0, testRates)
      expect(result).toEqual({ base: 140, extras: 0, total: 140, currency: 'EUR' })
    })
  })

  describe('PRICE-04: Daily pricing', () => {
    it('calculates base = days * dailyRate for business class', () => {
      const result = calculatePrice('daily', 'business', null, 0, 2, testRates)
      expect(result).toEqual({ base: 640, extras: 0, total: 640, currency: 'EUR' })
    })

    it('calculates base = days * dailyRate for first_class', () => {
      const result = calculatePrice('daily', 'first_class', null, 0, 1, testRates)
      expect(result).toEqual({ base: 480, extras: 0, total: 480, currency: 'EUR' })
    })

    it('dateDiffDays returns minimum 1 day', () => {
      expect(dateDiffDays('2026-01-01', '2026-01-01')).toBe(1)
    })

    it('dateDiffDays calculates correct day difference', () => {
      expect(dateDiffDays('2026-01-01', '2026-01-03')).toBe(2)
    })
  })

  describe('buildPriceMap', () => {
    it('returns prices for all 3 vehicle classes in a single call', () => {
      const result = buildPriceMap('transfer', 10, 0, 0, testRates)
      expect(result).toHaveProperty('business')
      expect(result).toHaveProperty('first_class')
      expect(result).toHaveProperty('business_van')
    })

    it('each PriceBreakdown has base, extras, total, currency fields', () => {
      const result = buildPriceMap('transfer', 10, 0, 0, testRates)
      for (const vc of ['business', 'first_class', 'business_van'] as const) {
        expect(result[vc]).toHaveProperty('base')
        expect(result[vc]).toHaveProperty('extras')
        expect(result[vc]).toHaveProperty('total')
        expect(result[vc]).toHaveProperty('currency')
      }
    })

    it('total equals base + extras', () => {
      const result = buildPriceMap('transfer', 10, 0, 0, testRates)
      for (const vc of ['business', 'first_class', 'business_van'] as const) {
        expect(result[vc].total).toBe(result[vc].base + result[vc].extras)
      }
    })
  })
})
