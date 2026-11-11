import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: vi.fn(async () => ({
    globals: { returnDiscountPercent: 10, airportPromoActive: false, airportRegularPriceEur: 69, airportPromoPriceEur: 59 },
    hourlyRate: { business: 49, business_van: 76, first_class: 120 },
  })),
}))
vi.mock('@/lib/route-prices', () => ({
  getAllRoutes: vi.fn(async () => [
    { slug: 'prague-cesky-krumlov', eClassEur: 301, vClassEur: 327, sClassEur: 439 },
    { slug: 'prague-kutna-hora', eClassEur: 147, vClassEur: 160, sClassEur: 214 },
  ]),
}))

import { dayTripFare, getLandingPrices, DAY_TRIP_ROUTES, LANDING_PAGES } from '@/lib/landing-pages'
import { DAY_TRIP_FALLBACK } from '@/lib/price-fallbacks'

describe('day trip fares', () => {
  it('is the outbound fare plus the discounted return leg (same sum as a round-trip booking)', () => {
    expect(dayTripFare(301, 10)).toBe(301 + 271)
    expect(dayTripFare(147, 0)).toBe(294)
  })

  it('exposes E/V/S tokens for every destination, from live route fares', async () => {
    const p = await getLandingPrices()
    expect(p.dayKrumlovE).toBe(572)
    expect(p.dayKrumlovV).toBe(327 + 294)
    expect(p.dayKutnaS).toBe(214 + 193)
    for (const dest of Object.keys(DAY_TRIP_ROUTES)) {
      for (const c of ['E', 'V', 'S']) expect(p[`day${dest}${c}`]).toBeGreaterThan(0)
    }
  })

  it('falls back to the stored figures when a route is missing', async () => {
    const p = await getLandingPrices()
    expect(p.dayDresdenE).toBe(DAY_TRIP_FALLBACK.Dresden.e)
    expect(p.dayKarlovyV).toBe(DAY_TRIP_FALLBACK.Karlovy.v)
  })

  it('registers the hub and the four destination pages', () => {
    const slugs = LANDING_PAGES.filter((l) => l.section === 'services').map((l) => l.slug)
    for (const s of ['day-trips-from-prague', 'cesky-krumlov-day-trip', 'kutna-hora-day-trip', 'karlovy-vary-day-trip', 'dresden-day-trip']) {
      expect(slugs).toContain(s)
    }
  })
})
