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
import { isAirportTrip, PRG_LAT, PRG_LNG } from '@/lib/airport'

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

  describe('D-01: stops switch the trip to per-km pricing', () => {
    const matchedRoute = {
      slug: 'prague-brno',
      fromLabel: 'Prague',
      toLabel: 'Brno',
      distanceKm: 210,
      eClassEur: 150,
      sClassEur: 200,
      vClassEur: 175,
      displayOrder: 1,
      placeIds: ['o', 'd'],
    }

    it('D-01: routeSlug plus one stop does not use the fixed route price; priced per km, matchedRouteSlug null', async () => {
      getRoutePriceMock.mockResolvedValue(matchedRoute)
      findRouteMock.mockResolvedValue(matchedRoute)
      const res = await POST(makeRequest({
        ...baseBody,
        routeSlug: 'prague-brno',
        originPlaceId: 'o',
        destinationPlaceId: 'd',
        intermediates: [{ ...STOP, waitMinutes: 0 }],
      }))
      const json = await res.json()
      expect(getRoutePriceMock).not.toHaveBeenCalled()
      expect(findRouteMock).not.toHaveBeenCalled()
      expect(computeRouteDistanceMock).toHaveBeenCalledTimes(1)
      expect(json.matchedRouteSlug).toBeNull()
      expect(json.prices.business.base).toBe(40)
    })

    it('D-03: routeSlug with no stops keeps the fixed route price and calls no Google', async () => {
      getRoutePriceMock.mockResolvedValue(matchedRoute)
      const res = await POST(makeRequest({ ...baseBody, routeSlug: 'prague-brno' }))
      const json = await res.json()
      expect(computeRouteDistanceMock).not.toHaveBeenCalled()
      expect(json.matchedRouteSlug).toBe('prague-brno')
      expect(json.prices.business.base).toBe(150)
      expect('waitingUnavailable' in json).toBe(false)
      expect('waitingEur' in json.prices.business).toBe(false)
    })
  })

  describe('D-03: a quote without stops is unchanged', () => {
    it('D-03: distance quote with no stops has the pre-phase shape (no waiting keys)', async () => {
      const res = await POST(makeRequest(baseBody))
      const json = await res.json()
      expect(computeRouteDistanceMock).toHaveBeenCalledWith({ origin: baseBody.origin, destination: baseBody.destination, intermediates: [] })
      expect(Object.keys(json).sort()).toEqual(
        ['distanceKm', 'durationMin', 'matchedRouteSlug', 'prices', 'quoteMode', 'returnDiscountPercent', 'returnLegPrices'],
      )
      expect(json.prices).toEqual({
        business: { base: 40, extras: 0, total: 40, currency: 'EUR' },
        first_class: { base: 60, extras: 0, total: 60, currency: 'EUR' },
        business_van: { base: 50, extras: 0, total: 50, currency: 'EUR' },
      })
    })

    it('D-03: stops with 15 minutes or less add waitingEur 0 and an empty unavailable list', async () => {
      const res = await POST(makeRequest({ ...baseBody, intermediates: [{ ...STOP, waitMinutes: 15 }] }))
      const json = await res.json()
      expect(json.waitingUnavailable).toEqual([])
      expect(json.prices.business.waitingEur).toBe(0)
      // free wait is priced even for a class without a rate
      expect(json.prices.first_class.waitingEur).toBe(0)
      expect(json.prices.first_class.base).toBe(60)
    })
  })

  describe('D-02: no flat fee per stop', () => {
    it('D-02: a body that still sends extraStops is priced exactly like the same body without it', async () => {
      const without = await (await POST(makeRequest({ ...baseBody, intermediates: [{ ...STOP, waitMinutes: 30 }] }))).json()
      const withOld = await (await POST(makeRequest({ ...baseBody, intermediates: [{ ...STOP, waitMinutes: 30 }], extraStops: 3 }))).json()
      expect(withOld).toEqual(without)
      expect(withOld.prices.business.extras).toBe(0)
    })

    it('D-02: no stops and the old field gives the plain per-km price', async () => {
      const res = await POST(makeRequest({ ...baseBody, extraStops: 5 }))
      const json = await res.json()
      expect(res.status).toBe(200)
      expect(json.prices.business.extras).toBe(0)
      expect(json.prices.business.base).toBe(40)
    })
  })

  describe('D-14: waiting is added after the adjustments', () => {
    it('D-14: night coefficient scales the leg but not the waiting (2 blocks at 10 = 20)', async () => {
      getPricingConfigMock.mockResolvedValue(makeRates({ waitingRate: { business: 10 } }))
      const res = await POST(makeRequest({ ...baseBody, pickupTime: '23:30', intermediates: [{ ...STOP, waitMinutes: 45 }] }))
      const json = await res.json()
      // 40 x 1.2 = 48 + 20
      expect(json.prices.business.waitingEur).toBe(20)
      expect(json.prices.business.base).toBe(48 + 20)
    })

    it('D-14: the airport fee is part of the leg, not of the waiting', async () => {
      getPricingConfigMock.mockResolvedValue(makeRates({ waitingRate: { business: 10 } }))
      const res = await POST(makeRequest({
        ...baseBody,
        origin: { lat: 50.1008, lng: 14.26 },
        intermediates: [{ ...STOP, waitMinutes: 45 }],
      }))
      const json = await res.json()
      expect(json.prices.business.waitingEur).toBe(20)
      expect(json.prices.business.base).toBe(40 + 5 + 20)
    })

    it('D-14: a minimum fare above the leg does not absorb the waiting', async () => {
      getPricingConfigMock.mockResolvedValue(makeRates({ waitingRate: { business: 10 }, minFare: { business: 100, first_class: 10, business_van: 10 } }))
      const res = await POST(makeRequest({ ...baseBody, intermediates: [{ ...STOP, waitMinutes: 45 }] }))
      const json = await res.json()
      expect(json.prices.business.base).toBe(100 + 20)
      expect(json.prices.business.total).toBe(100 + 20)
    })

    it('D-14: child seats are extras; total = leg + extras + waiting', async () => {
      const res = await POST(makeRequest({ ...baseBody, childSeats: 2, intermediates: [{ ...STOP, waitMinutes: 45 }] }))
      const json = await res.json()
      expect(json.prices.business.base).toBe(40 + 24)
      expect(json.prices.business.extras).toBe(30)
      expect(json.prices.business.total).toBe(40 + 24 + 30)
    })
  })

  describe('limits', () => {
    it('0, 1 and 5 stops are priced', async () => {
      for (const n of [0, 1, 5]) {
        const stops = Array.from({ length: n }, (_, i) => ({ lat: 50.01 + i * 0.01, lng: 14.4 }))
        const res = await POST(makeRequest({ ...baseBody, intermediates: stops }))
        expect(res.status).toBe(200)
      }
      expect(computeRouteDistanceMock).toHaveBeenCalledTimes(3)
    })

    it('6 intermediates -> 400 and Google is not called', async () => {
      const stops = Array.from({ length: 6 }, (_, i) => ({ lat: 50.01 + i * 0.01, lng: 14.4 }))
      const res = await POST(makeRequest({ ...baseBody, intermediates: stops }))
      expect(res.status).toBe(400)
      expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    })

    it.each([20, 135, -15, 7.5, 121])('waitMinutes %s -> 400', async (waitMinutes) => {
      const res = await POST(makeRequest({ ...baseBody, intermediates: [{ ...STOP, waitMinutes }] }))
      expect(res.status).toBe(400)
      expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    })

    it('an intermediate without lat -> 400', async () => {
      const res = await POST(makeRequest({ ...baseBody, intermediates: [{ lng: 14.4, waitMinutes: 0 }] }))
      expect(res.status).toBe(400)
      expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    })

    it('a stop without waitMinutes waits 0', async () => {
      const res = await POST(makeRequest({ ...baseBody, intermediates: [STOP] }))
      const json = await res.json()
      expect(res.status).toBe(200)
      expect(json.prices.business.waitingEur).toBe(0)
    })

    it('stops reach Google in the order received; identical neighbours and a stop equal to the origin are not merged', async () => {
      const stops = [STOP, STOP, baseBody.origin]
      await POST(makeRequest({ ...baseBody, intermediates: stops }))
      expect(computeRouteDistanceMock).toHaveBeenCalledWith({
        origin: baseBody.origin,
        destination: baseBody.destination,
        intermediates: [
          { lat: STOP.lat, lng: STOP.lng },
          { lat: STOP.lat, lng: STOP.lng },
          { lat: baseBody.origin.lat, lng: baseBody.origin.lng },
        ],
      })
    })

    it('the same inputs always give the same total and the distance is not rounded', async () => {
      computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 12.345, durationMin: null })
      const a = await (await POST(makeRequest({ ...baseBody, intermediates: [STOP] }))).json()
      const b = await (await POST(makeRequest({ ...baseBody, intermediates: [STOP] }))).json()
      expect(a.distanceKm).toBe(12.345)
      expect(a).toEqual(b)
    })

    it('the waiting amount does not depend on the order of the stops', async () => {
      const s1 = { ...STOP, waitMinutes: 45 }
      const s2 = { lat: 50.09, lng: 14.41, waitMinutes: 30 }
      const a = await (await POST(makeRequest({ ...baseBody, intermediates: [s1, s2] }))).json()
      const b = await (await POST(makeRequest({ ...baseBody, intermediates: [s2, s1] }))).json()
      expect(a.prices.business.waitingEur).toBe(b.prices.business.waitingEur)
      expect(a.prices.business.waitingEur).toBe(36)
    })

    it('the free 15 minutes apply per stop and are never pooled', async () => {
      const free = await (await POST(makeRequest({
        ...baseBody,
        intermediates: [{ ...STOP, waitMinutes: 15 }, { lat: 50.09, lng: 14.41, waitMinutes: 15 }],
      }))).json()
      expect(free.prices.business.waitingEur).toBe(0)
      const paid = await (await POST(makeRequest({
        ...baseBody,
        intermediates: [{ ...STOP, waitMinutes: 30 }, { lat: 50.09, lng: 14.41, waitMinutes: 30 }],
      }))).json()
      expect(paid.prices.business.waitingEur).toBe(24)
    })

    it('rounds once per booking (1 block at 12.5 gives 13)', async () => {
      getPricingConfigMock.mockResolvedValue(makeRates({ waitingRate: { business: 12.5 } }))
      const res = await POST(makeRequest({ ...baseBody, intermediates: [{ ...STOP, waitMinutes: 30 }] }))
      expect((await res.json()).prices.business.waitingEur).toBe(13)
    })

    it('a failed Google call falls back to a manual quote', async () => {
      computeRouteDistanceMock.mockResolvedValue({ ok: false, reason: 'timeout' })
      const res = await POST(makeRequest({ ...baseBody, intermediates: [STOP] }))
      expect(await res.json()).toEqual({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true, matchedRouteSlug: null })
    })
  })

  describe('airport flag comes from coordinates only (T-91-05)', () => {
    it('isAirportTrip: airport origin or destination -> true; city points and nulls -> false', () => {
      const airport = { lat: PRG_LAT, lng: PRG_LNG }
      const city = { lat: 50.08, lng: 14.42 }
      expect(isAirportTrip(airport, city)).toBe(true)
      expect(isAirportTrip(city, airport)).toBe(true)
      expect(isAirportTrip(city, city)).toBe(false)
      expect(isAirportTrip(null, null)).toBe(false)
      expect(isAirportTrip(undefined, city)).toBe(false)
    })

    it('city coordinates with isAirport true in the body: no airport fee (client flag ignored)', async () => {
      const res = await POST(makeRequest({ ...baseBody, isAirport: true }))
      const json = await res.json()
      expect(json.prices.business.base).toBe(40)
    })

    it('city coordinates with isAirport true and a stop: no airport fee either', async () => {
      const res = await POST(makeRequest({ ...baseBody, isAirport: true, intermediates: [{ ...STOP, waitMinutes: 0 }] }))
      expect((await res.json()).prices.business.base).toBe(40)
    })

    it('airport-origin coordinates with isAirport false: the airport fee is applied', async () => {
      const res = await POST(makeRequest({ ...baseBody, origin: { lat: PRG_LAT, lng: PRG_LNG }, isAirport: false }))
      expect((await res.json()).prices.business.base).toBe(40 + 5)
    })

    it('airport destination coordinates: the airport fee is applied', async () => {
      const res = await POST(makeRequest({ ...baseBody, destination: { lat: PRG_LAT, lng: PRG_LNG } }))
      expect((await res.json()).prices.business.base).toBe(40 + 5)
    })
  })
})
