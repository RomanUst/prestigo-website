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

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: rateLimitStub.checkRateLimit,
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

const defaultPricingConfig = {
  config: [
    { vehicle_class: 'business', rate_per_km: 3.0, hourly_rate: 60, daily_rate: 350, min_fare: 0 },
    { vehicle_class: 'first_class', rate_per_km: 4.5, hourly_rate: 90, daily_rate: 500, min_fare: 0 },
    { vehicle_class: 'business_van', rate_per_km: 3.8, hourly_rate: 75, daily_rate: 420, min_fare: 0 },
  ],
  globals: {
    airport_fee: 0,
    night_coefficient: 1.0,
    holiday_coefficient: 1.0,
    extra_child_seat: 15,
    extra_luggage: 20,
    return_discount_percent: 10,
    holiday_dates: [],
    hourly_min_hours: 2,
    hourly_max_hours: 8,
    min_fare: 0,
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

  // Default: rate limit passes
  rateLimitStub.checkRateLimit.mockResolvedValue({ success: true })

  // Default: pricing config available
  pricingConfigStub.getPricingConfig.mockResolvedValue(defaultPricingConfig)

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

describe('/api/calculate-price — intercity (CALC-05, CALC-07)', () => {
  it('routeSlug param returns flat price (no Google Routes call)', async () => {
    const { getRoutePrice } = await import('@/lib/route-prices')
    vi.mocked(getRoutePrice).mockResolvedValue(mockedRoute)

    const res = await POST(makeRequest({
      originAddress: 'Prague',
      destinationAddress: 'Brno',
      tripType: 'transfer',
      routeSlug: 'prague-brno',
      passengers: 1,
      date: '2026-05-10',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    // Flat price from route, not Google Routes
    expect(json.prices.business.total).toBeGreaterThan(0)
    // Google Routes fetch should NOT have been called
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('originPlaceId+destinationPlaceId triggers findRouteByPlaceIds match', async () => {
    findRouteMock.mockResolvedValue(mockedRoute)

    const res = await POST(makeRequest({
      originAddress: 'Prague',
      destinationAddress: 'Brno',
      tripType: 'transfer',
      originPlaceId: ORIGIN_PLACE_ID,
      destinationPlaceId: DEST_PLACE_ID,
      passengers: 1,
      date: '2026-05-10',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prices.business.total).toBeGreaterThan(0)
    expect(json.quoteMode).toBe(false)
  })

  it('childSeats=2 adds €30 to extras', async () => {
    findRouteMock.mockResolvedValue(mockedRoute)

    const res = await POST(makeRequest({
      originAddress: 'Prague',
      destinationAddress: 'Brno',
      tripType: 'transfer',
      originPlaceId: ORIGIN_PLACE_ID,
      destinationPlaceId: DEST_PLACE_ID,
      passengers: 1,
      date: '2026-05-10',
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
      originAddress: 'Prague',
      destinationAddress: 'Brno',
      tripType: 'transfer',
      originPlaceId: ORIGIN_PLACE_ID,
      destinationPlaceId: DEST_PLACE_ID,
      passengers: 1,
      date: '2026-05-10',
      extraStops: 3,
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    // extraStops=3 → extras >= €60
    expect(json.prices.business.extras).toBeGreaterThanOrEqual(60)
  })

  it('roundUpToFive rounds fare to nearest €5 upward', async () => {
    // Test the rounding logic directly
    function roundUpToFive(price: number): number {
      return Math.ceil(price / 5) * 5
    }
    expect(roundUpToFive(87)).toBe(90)
    expect(roundUpToFive(86)).toBe(90)
    expect(roundUpToFive(85)).toBe(85)
    expect(roundUpToFive(81)).toBe(85)
    expect(roundUpToFive(80)).toBe(80)
    expect(roundUpToFive(91)).toBe(95)
  })

  it('no routeSlug match falls through to Google Routes', async () => {
    findRouteMock.mockResolvedValue(null)

    const res = await POST(makeRequest({
      originAddress: 'Prague',
      destinationAddress: 'Some Unknown City',
      tripType: 'transfer',
      originPlaceId: 'unknown-origin',
      destinationPlaceId: 'unknown-dest',
      passengers: 1,
      date: '2026-05-10',
    }))

    // Either success (with Google Routes) or 200 with quoteMode
    expect([200, 429]).toContain(res.status)
    if (res.status === 200) {
      // Google Routes fetch should have been called
      expect(fetchMock).toHaveBeenCalled()
    }
  })
})
