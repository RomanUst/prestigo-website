import { describe, it, expect } from 'vitest'
import { buildRouteJsonLd, buildAirportTransferJsonLd } from '@/lib/jsonld'
import type { RoutePrice } from '@/lib/route-prices'
import type { PricingGlobals } from '@/lib/pricing-config'

const promoActiveGlobals: PricingGlobals = {
  airportFee: 0, nightCoefficient: 1.3, holidayCoefficient: 1.3,
  extraChildSeat: 15, extraLuggage: 10, holidayDates: [],
  returnDiscountPercent: 10, hourlyMinHours: 2, hourlyMaxHours: 8,
  notificationFlags: null,
  airportPromoActive: true,
  airportRegularPriceEur: 69,
  airportPromoPriceEur: 59,
}
const promoInactiveGlobals: PricingGlobals = { ...promoActiveGlobals, airportPromoActive: false }

const routeFixture: RoutePrice = {
  slug: 'prague-brno', fromLabel: 'Prague', toLabel: 'Brno',
  distanceKm: 200, eClassEur: 290, sClassEur: 430, vClassEur: 335,
  displayOrder: 2, placeIds: [],
}

describe('buildRouteJsonLd', () => {
  it('emits Offer per class with price/priceCurrency/availability/priceValidUntil', () => {
    const result = buildRouteJsonLd(routeFixture, 'prague-brno')
    const items = (result['@graph'][0] as Record<string, unknown>)['hasOfferCatalog'] as Record<string, unknown>
    const list = items['itemListElement'] as Array<Record<string, unknown>>
    expect(list).toHaveLength(3)
    expect(list[0].price).toBe('290')
    expect(list[1].price).toBe('430')
    expect(list[2].price).toBe('335')
    list.forEach(offer => {
      expect(offer.priceCurrency).toBe('EUR')
      expect(offer.availability).toBe('https://schema.org/InStock')
      expect(offer.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('Service has correct @id and provider', () => {
    const result = buildRouteJsonLd(routeFixture, 'prague-brno')
    const service = result['@graph'][0] as Record<string, unknown>
    expect(service['@type']).toBe('Service')
    expect(service['@id']).toBe('https://rideprestigo.com/routes/prague-brno#service')
    const provider = service['provider'] as Record<string, unknown>
    expect(provider['@id']).toBe('https://rideprestigo.com/#business')
  })
})

describe('buildAirportTransferJsonLd', () => {
  it('emits promo price when active', () => {
    const result = buildAirportTransferJsonLd(promoActiveGlobals, 120, 76)
    const service = result['@graph'][0] as Record<string, unknown>
    const catalog = service['hasOfferCatalog'] as Record<string, unknown>
    const list = catalog['itemListElement'] as Array<Record<string, unknown>>
    const businessOffer = list.find(o => String(o.name).includes('E-Class'))
    expect(businessOffer?.price).toBe('59')
  })

  it('emits regular price when inactive', () => {
    const result = buildAirportTransferJsonLd(promoInactiveGlobals, 120, 76)
    const service = result['@graph'][0] as Record<string, unknown>
    const catalog = service['hasOfferCatalog'] as Record<string, unknown>
    const list = catalog['itemListElement'] as Array<Record<string, unknown>>
    const businessOffer = list.find(o => String(o.name).includes('E-Class'))
    expect(businessOffer?.price).toBe('69')
  })

  it('always has 3 Offers (E/S/V)', () => {
    const result = buildAirportTransferJsonLd(promoActiveGlobals, 120, 76)
    const service = result['@graph'][0] as Record<string, unknown>
    const catalog = service['hasOfferCatalog'] as Record<string, unknown>
    const list = catalog['itemListElement'] as Array<Record<string, unknown>>
    expect(list).toHaveLength(3)
    const names = list.map(o => String(o.name))
    expect(names.some(n => n.includes('E-Class'))).toBe(true)
    expect(names.some(n => n.includes('S-Class'))).toBe(true)
    expect(names.some(n => n.includes('V-Class'))).toBe(true)
  })
})
