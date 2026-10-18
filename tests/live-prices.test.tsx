import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/route-prices', () => ({
  getAllRoutes: vi.fn(async () => [
    { slug: 'prague-vienna', fromLabel: 'Prague', toLabel: 'Vienna', distanceKm: 295, eClassEur: 455, sClassEur: 750, vClassEur: 505, displayOrder: 1, placeIds: [] },
  ]),
}))

vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: vi.fn(async () => ({
    globals: { airportPromoActive: true, airportPromoPriceEur: 59, airportRegularPriceEur: 69, nightCoefficient: 1.2 },
    hourlyRate: {}, ratePerKm: {}, dailyRate: {}, minFare: {},
  })),
}))

import LivePrice from '@/components/LivePrice'
import { getFares, perPerson } from '@/lib/live-prices'
import { AIRPORT_FALLBACK } from '@/lib/price-fallbacks'

async function html(el: Promise<React.ReactElement | null>) {
  const resolved = await el
  return resolved ? renderToStaticMarkup(resolved) : ''
}

describe('LivePrice', () => {
  it('renders the admin fare for a route and vehicle class', async () => {
    expect(await html(LivePrice({ route: 'prague-vienna' }))).toBe('<bdi>455</bdi>')
    expect(await html(LivePrice({ route: 'prague-vienna', car: 'v' }))).toBe('<bdi>505</bdi>')
    expect(await html(LivePrice({ route: 'prague-vienna', car: 's' }))).toBe('<bdi>750</bdi>')
  })

  it('splits per person and applies the night tariff', async () => {
    expect(await html(LivePrice({ route: 'prague-vienna', car: 'v', per: 6 }))).toBe('<bdi>84</bdi>')
    expect(await html(LivePrice({ route: 'airport', night: true }))).toBe('<bdi>71</bdi>')
  })

  it('uses the active airport promo price', async () => {
    expect(await html(LivePrice({ route: 'airport' }))).toBe('<bdi>59</bdi>')
    expect(await html(LivePrice({ route: 'airport', car: 's' }))).toBe(`<bdi>${AIRPORT_FALLBACK.sClass}</bdi>`)
  })

  it('renders nothing for a route without a live price', async () => {
    expect(await html(LivePrice({ route: 'prague-nowhere' }))).toBe('')
  })
})

describe('getFares', () => {
  it('returns all classes plus night fares', async () => {
    const fares = await getFares('prague-vienna')
    expect(fares).toMatchObject({ e: 455, s: 750, v: 505, night: { e: 546 } })
    expect(perPerson(fares.e, 3)).toBe(152)
  })
})
