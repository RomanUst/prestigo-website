import { describe, it, expect } from 'vitest'
import {
  buildLlmsTxt,
  buildLlmsFullTxt,
  airportFromPrice,
  type LlmsData,
} from '@/lib/llms-content'
import type { PricingRates } from '@/lib/pricing-config'

const pricing: PricingRates = {
  globals: {
    airportPromoActive: true,
    airportRegularPriceEur: 69,
    airportPromoPriceEur: 59,
    airportFee: 0, nightCoefficient: 1, holidayCoefficient: 1,
    extraChildSeat: 0, extraLuggage: 0, holidayDates: [],
    returnDiscountPercent: 0, hourlyMinHours: 1, hourlyMaxHours: 12,
    notificationFlags: null,
  },
  hourlyRate: { business: 59, first_class: 98, business_van: 85 },
  ratePerKm: {},
  dailyRate: {},
  minFare: {},
}

const data: LlmsData = {
  routes: [
    {
      slug: 'prague-vienna',
      fromLabel: 'Prague',
      toLabel: 'Vienna',
      distanceKm: 330,
      eClassEur: 455,
      sClassEur: 750,
      vClassEur: 505,
      displayOrder: 1,
      placeIds: [],
    },
    {
      slug: 'prague-warsaw',
      fromLabel: 'Prague',
      toLabel: 'Warsaw',
      distanceKm: 680,
      eClassEur: 1090,
      sClassEur: 1690,
      vClassEur: 1210,
      displayOrder: 2,
      placeIds: [],
    },
  ],
  pricing,
  posts: [
    {
      slug: 'prague-vienna-transfer-vs-train',
      title: 'Prague to Vienna 2026',
      description: 'Honest comparison.',
      date: '2026-04-09',
      coverImage: '/vienna.png',
      category: 'Intercity Routes',
      author: 'roman-ustyugov',
      source: 'jsx',
    },
  ],
}

describe('airportFromPrice', () => {
  it('uses the promo price when the promo is active', () => {
    expect(airportFromPrice(pricing)).toBe(59)
  })

  it('uses the regular price when the promo is inactive', () => {
    expect(
      airportFromPrice({
        ...pricing,
        globals: { ...pricing.globals, airportPromoActive: false },
      }),
    ).toBe(69)
  })
})

describe('buildLlmsTxt', () => {
  const txt = buildLlmsTxt(data)

  it('interpolates live route prices from the DB rows', () => {
    expect(txt).toContain('[Prague to Vienna](https://rideprestigo.com/routes/prague-vienna): From €455')
    expect(txt).toContain('From €1,090')
  })

  it('uses the live airport price on the airport transfer line', () => {
    expect(txt).toContain('From €59, meet-and-greet')
  })

  it('contains no dead prague-to-* links and no removed /guides|/compare paths', () => {
    expect(txt).not.toContain('/routes/prague-to-')
    expect(txt).not.toContain('/guides/')
    expect(txt).not.toContain('/compare/')
  })

  it('links blog posts under /blog/', () => {
    expect(txt).toContain('https://rideprestigo.com/blog/prague-vienna-transfer-vs-train')
  })

  it('degrades to the routes hub when no route rows are available', () => {
    const empty = buildLlmsTxt({ ...data, routes: [] })
    expect(empty).toContain('[All intercity routes](https://rideprestigo.com/routes)')
    expect(empty).not.toContain('undefined')
  })
})

describe('buildLlmsFullTxt', () => {
  const txt = buildLlmsFullTxt(data)

  it('builds the price list from live rows', () => {
    expect(txt).toContain('Vienna €455 · Warsaw €1,090')
  })

  it('uses one consistent airport price with the pages', () => {
    expect(txt).toContain('From €59 (E-Class)')
    expect(txt).not.toContain('From €69')
  })

  it('derives fleet hourly prices from the hourly rate table', () => {
    expect(txt).toContain('Hourly hire from €59/hour')
    expect(txt).toContain('Hourly hire from €98/hour')
    expect(txt).toContain('Hourly hire from €85/hour')
  })

  it('has no dead prague-to-* or legacy editorial links', () => {
    expect(txt).not.toContain('/routes/prague-to-')
    expect(txt).not.toContain('/guides/')
    expect(txt).not.toContain('/compare/')
  })

  it('stamps a current last-updated date', () => {
    expect(txt).toContain(`*Last updated: ${new Date().toISOString().slice(0, 10)}*`)
  })
})
