import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: vi.fn() }))

import { applyDistanceFares, type RoutePrice } from '@/lib/route-prices'
import type { PricingRates } from '@/lib/pricing-config'

const route: RoutePrice = {
  slug: 'prague-vienna',
  fromLabel: 'Prague',
  toLabel: 'Vienna',
  distanceKm: 333,
  eClassEur: 455,
  sClassEur: 750,
  vClassEur: 505,
  displayOrder: 1,
  placeIds: [],
}

const rates = {
  ratePerKm: { business: 1.75, first_class: 2.55, business_van: 1.9 },
  minFare: { business: 0, first_class: 0, business_van: 0 },
} as unknown as PricingRates

describe('applyDistanceFares', () => {
  it('prices each class as distance x per-km rate (same as the booking form)', () => {
    const r = applyDistanceFares(route, rates)
    expect(r.eClassEur).toBe(Math.round(333 * 1.75))
    expect(r.sClassEur).toBe(Math.round(333 * 2.55))
    expect(r.vClassEur).toBe(Math.round(333 * 1.9))
  })

  it('clamps to the class minimum fare', () => {
    const r = applyDistanceFares({ ...route, distanceKm: 10 }, {
      ...rates,
      minFare: { business: 60, first_class: 90, business_van: 70 },
    } as PricingRates)
    expect([r.eClassEur, r.sClassEur, r.vClassEur]).toEqual([60, 90, 70])
  })

  it('keeps the stored fares when rates are missing (pricing config fallback)', () => {
    const r = applyDistanceFares(route, { ratePerKm: {}, minFare: {} } as unknown as PricingRates)
    expect([r.eClassEur, r.sClassEur, r.vClassEur]).toEqual([455, 750, 505])
  })
})
