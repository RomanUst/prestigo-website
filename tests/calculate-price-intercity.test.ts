import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.hoisted: stubs available inside vi.mock factories
const { supabaseServiceStub, rateLimitStub, pricingConfigStub, fetchMock, findRouteMock } = vi.hoisted(() => {
  const supabaseServiceStub = {
    from: vi.fn(),
  }

  const rateLimitStub = {
    checkRateLimit: vi.fn(),
  }

  const pricingConfigStub = {
    getPricingConfig: vi.fn(),
  }

  const fetchMock = vi.fn()
  const findRouteMock = vi.fn()

  return { supabaseServiceStub, rateLimitStub, pricingConfigStub, fetchMock, findRouteMock }
})

// createSupabasePublicReadClient used for coverage_zones check in transfer fallback path
const supabasePublicReadStub = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({
        // Return one zone that covers Prague coords (50.08, 14.42)
        data: [{
          id: 1,
          geojson: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[[14.0, 50.0], [15.0, 50.0], [15.0, 51.0], [14.0, 51.0], [14.0, 50.0]]],
            },
            properties: {},
          },
        }],
        error: null,
      })),
    })),
  })),
}

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
  createSupabasePublicReadClient: vi.fn(() => supabasePublicReadStub),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitStub.checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: pricingConfigStub.getPricingConfig,
}))

vi.mock('@/lib/route-prices', () => ({
  getRoutePrice: vi.fn(),
  findRouteByPlaceIds: findRouteMock,
  getAllRoutes: vi.fn(),
}))

import { POST } from '@/app/api/calculate-price/route'

const ORIGIN_PLACE_ID = 'ChIJi3lNIT2UDkcRGBlSF2JiX1c'
const DEST_PLACE_ID = 'ChIJYXjBiRvMHkcRDGMvL1K0bCQ'

const mockedRoute = {
  slug: 'prague-brno',
  fromLabel: 'Prague',
  toLabel: 'Brno',
  distanceKm: 210,
  eClassEur: 150,
  sClassEur: 200,
  vClassEur: 175,
  displayOrder: 1,
  placeIds: [ORIGIN_PLACE_ID, DEST_PLACE_ID],
}

// PricingRates shape (camelCase) — matches what getPricingConfig() returns
const defaultPricingConfig = {
  ratePerKm: { business: 3.0, first_class: 4.5, business_van: 3.8 },
  hourlyRate: { business: 60, first_class: 90, business_van: 75 },
  dailyRate: { business: 350, first_class: 500, business_van: 420 },
  minFare: { business: 0, first_class: 0, business_van: 0 },
  globals: {
    airportFee: 0,
    nightCoefficient: 1.0,
    holidayCoefficient: 1.0,
    extraChildSeat: 15,
    extraLuggage: 20,
    returnDiscountPercent: 10,
    holidayDates: [],
    hourlyMinHours: 2,
    hourlyMaxHours: 8,
    notificationFlags: null,
    airportPromoActive: false,
    airportRegularPriceEur: 69,
    airportPromoPriceEur: 59,
  },
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/calculate-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()

  // Default: rate limit passes (matches { allowed, limit } shape in route.ts)
  rateLimitStub.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 99, limit: 100 })

  // Default: pricing config available
  pricingConfigStub.getPricingConfig.mockResolvedValue(defaultPricingConfig)

  // Google Maps API key required for Google Routes fallback path
  vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key-abc123')

  // Default: no Google Routes fetch (override per-test)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      routes: [{ distanceMeters: 210000, duration: '7200s' }],
    }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Coords inside the mocked coverage zone polygon (14.0-15.0 lng, 50.0-51.0 lat)
const PRAGUE_COORDS = { lat: 50.08, lng: 14.42 }
const BRNO_COORDS = { lat: 49.19, lng: 16.61 }

describe('/api/calculate-price — intercity (CALC-05, CALC-07)', () => {
  it('routeSlug param returns flat price (no Google Routes call)', async () => {
    const { getRoutePrice } = await import('@/lib/route-prices')
    vi.mocked(getRoutePrice).mockResolvedValue(mockedRoute)

    const res = await POST(makeRequest({
      origin: PRAGUE_COORDS,
      destination: BRNO_COORDS,
      tripType: 'transfer',
      pickupDate: '2026-05-10',
      pickupTime: '10:00',
      routeSlug: 'prague-brno',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    // Flat price from route, not Google Routes
    expect(json.prices.business.total).toBeGreaterThan(0)
    expect(json.matchedRouteSlug).toBe('prague-brno')
    // Google Routes fetch should NOT have been called
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('originPlaceId+destinationPlaceId triggers findRouteByPlaceIds match', async () => {
    findRouteMock.mockResolvedValue(mockedRoute)

    const res = await POST(makeRequest({
      origin: PRAGUE_COORDS,
      destination: BRNO_COORDS,
      tripType: 'transfer',
      pickupDate: '2026-05-10',
      pickupTime: '10:00',
      originPlaceId: ORIGIN_PLACE_ID,
      destinationPlaceId: DEST_PLACE_ID,
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prices.business.total).toBeGreaterThan(0)
    expect(json.quoteMode).toBe(false)
    expect(json.matchedRouteSlug).toBe('prague-brno')
  })

  it('childSeats=2 adds €30 to extras', async () => {
    findRouteMock.mockResolvedValue(mockedRoute)

    const res = await POST(makeRequest({
      origin: PRAGUE_COORDS,
      destination: BRNO_COORDS,
      tripType: 'transfer',
      pickupDate: '2026-05-10',
      pickupTime: '10:00',
      originPlaceId: ORIGIN_PLACE_ID,
      destinationPlaceId: DEST_PLACE_ID,
      childSeats: 2,
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    // childSeats=2 → extras >= €30
    expect(json.prices.business.extras).toBeGreaterThanOrEqual(30)
  })

  it('extraStops=3 adds €60 to extras', async () => {
    findRouteMock.mockResolvedValue(mockedRoute)

    const res = await POST(makeRequest({
      origin: PRAGUE_COORDS,
      destination: BRNO_COORDS,
      tripType: 'transfer',
      pickupDate: '2026-05-10',
      pickupTime: '10:00',
      originPlaceId: ORIGIN_PLACE_ID,
      destinationPlaceId: DEST_PLACE_ID,
      extraStops: 3,
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    // extraStops=3 → extras >= €60
    expect(json.prices.business.extras).toBeGreaterThanOrEqual(60)
  })

  it('roundUpToFive rounds fare to nearest €5 upward', async () => {
    // Test the rounding logic directly via pricing-helpers
    const { roundUpToFive } = await import('@/lib/pricing-helpers')
    expect(roundUpToFive(87)).toBe(90)
    expect(roundUpToFive(86)).toBe(90)
    expect(roundUpToFive(85)).toBe(85)
    expect(roundUpToFive(81)).toBe(85)
    expect(roundUpToFive(80)).toBe(80)
    expect(roundUpToFive(91)).toBe(95)
  })

  it('no routeSlug match falls through to Google Routes', async () => {
    findRouteMock.mockResolvedValue(null)
    const { getRoutePrice } = await import('@/lib/route-prices')
    vi.mocked(getRoutePrice).mockResolvedValue(null)

    const res = await POST(makeRequest({
      origin: PRAGUE_COORDS,
      destination: BRNO_COORDS,
      tripType: 'transfer',
      pickupDate: '2026-05-10',
      pickupTime: '10:00',
      originPlaceId: 'unknown-origin',
      destinationPlaceId: 'unknown-dest',
    }))

    // With Google Routes mock returning 15km, should be 200
    expect(res.status).toBe(200)
    const json = await res.json()
    // Google Routes fetch should have been called
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('routes.googleapis.com'),
      expect.anything()
    )
    expect(json.matchedRouteSlug).toBeNull()
  })
})
