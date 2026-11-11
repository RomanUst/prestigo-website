import { describe, it, expect, vi, beforeEach } from 'vitest'

const { computeRouteDistanceMock, getPricingConfigMock, getRoutePriceMock, findRouteMock } = vi.hoisted(() => ({
  computeRouteDistanceMock: vi.fn(),
  getPricingConfigMock: vi.fn(),
  getRoutePriceMock: vi.fn(),
  findRouteMock: vi.fn(),
}))

const pragueZone = {
  id: 1,
  geojson: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[14.0, 50.0], [15.0, 50.0], [15.0, 51.0], [14.0, 51.0], [14.0, 50.0]]],
    },
    properties: {},
  },
}

const zoneClient = {
  from: () => ({
    select: () => ({
      eq: () => Promise.resolve({ data: [pragueZone], error: null }),
    }),
  }),
}

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => zoneClient,
  createSupabasePublicReadClient: () => zoneClient,
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 99, limit: 100 }),
  getClientIp: () => '127.0.0.1',
}))
vi.mock('@/lib/pricing-config', () => ({ getPricingConfig: getPricingConfigMock }))
vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: computeRouteDistanceMock }))
vi.mock('@/lib/route-prices', () => ({
  getRoutePrice: getRoutePriceMock,
  findRouteByPlaceIds: findRouteMock,
  getAllRoutes: vi.fn(),
}))

import { POST } from '@/app/api/calculate-price/route'

type Globals = {
  airportFee: number
  nightCoefficient: number
  holidayCoefficient: number
  extraChildSeat: number
  extraLuggage: number
  holidayDates: string[]
  returnDiscountPercent: number
}

function makeRates(overrides: { waitingRate?: Record<string, number>; globals?: Partial<Globals>; minFare?: Record<string, number> } = {}) {
  return {
    ratePerKm: { business: 2, first_class: 3, business_van: 2.5 },
    hourlyRate: { business: 50, first_class: 70, business_van: 60 },
    dailyRate: { business: 200, first_class: 280, business_van: 240 },
    minFare: overrides.minFare ?? { business: 10, first_class: 10, business_van: 10 },
    waitingRate: overrides.waitingRate ?? { business: 12 },
    globals: {
      airportFee: 5,
      nightCoefficient: 1.2,
      holidayCoefficient: 1.3,
      extraChildSeat: 10,
      extraLuggage: 5,
      holidayDates: [],
      returnDiscountPercent: 10,
      ...overrides.globals,
    },
  }
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/calculate-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const baseBody = {
  origin: { lat: 50.08, lng: 14.42 },
  destination: { lat: 50.09, lng: 14.43 },
  tripType: 'transfer',
  pickupDate: '2026-05-10',
  pickupTime: '12:00',
  returnDate: null,
  returnTime: null,
}

const STOP = { lat: 50.085, lng: 14.4 }

describe('POST /api/calculate-price with stops', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPricingConfigMock.mockResolvedValue(makeRates())
    computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 20, durationMin: 30 })
  })

  it('tracer: one stop waiting 45 minutes is priced per km through the stop plus 2 waiting blocks', async () => {
    const res = await POST(makeRequest({ ...baseBody, intermediates: [{ ...STOP, waitMinutes: 45 }] }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(computeRouteDistanceMock).toHaveBeenCalledTimes(1)
    expect(computeRouteDistanceMock).toHaveBeenCalledWith({
      origin: baseBody.origin,
      destination: baseBody.destination,
      intermediates: [{ lat: STOP.lat, lng: STOP.lng }],
    })

    // 20 km x 2 EUR = 40, daytime, no airport, minFare 10 -> leg 40; waiting 2 blocks x 12 = 24
    expect(json.quoteMode).toBe(false)
    expect(json.distanceKm).toBe(20)
    expect(json.prices.business.waitingEur).toBe(24)
    expect(json.prices.business.base).toBe(40 + 24)
    expect(json.prices.business.total).toBe(40 + 24)
    expect(json.prices.business.extras).toBe(0)
    expect(json.prices.first_class.waitingEur).toBeNull()
    expect(json.prices.first_class.base).toBe(60)
    expect(json.prices.business_van.waitingEur).toBeNull()
    expect(json.waitingUnavailable).toEqual(['first_class', 'business_van'])
  })
})
