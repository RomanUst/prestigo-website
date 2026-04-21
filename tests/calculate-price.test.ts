import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isInAnyZone } from '@/lib/zones'

// Prague test polygon: covers roughly 14.35-14.50 lng, 50.05-50.12 lat
const pragueZone = {
  geojson: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[14.35, 50.05], [14.50, 50.05], [14.50, 50.12], [14.35, 50.12], [14.35, 50.05]]]
    },
    properties: {}
  }
}

describe('isInAnyZone helper (ZONES-06)', () => {
  it('returns true when point is inside the zone (Prague center)', () => {
    expect(isInAnyZone(50.08, 14.42, [pragueZone])).toBe(true)
  })

  it('returns false when point is outside all zones', () => {
    expect(isInAnyZone(48.00, 16.00, [pragueZone])).toBe(false)
  })

  it('returns true when inside one of multiple zones (OR-logic)', () => {
    const viennaZone = {
      geojson: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[16.20, 47.95], [16.60, 47.95], [16.60, 48.30], [16.20, 48.30], [16.20, 47.95]]]
        },
        properties: {}
      }
    }
    expect(isInAnyZone(48.20, 16.37, [pragueZone, viennaZone])).toBe(true)
  })

  it('returns false when zones array is empty (no restriction)', () => {
    expect(isInAnyZone(50.08, 14.42, [])).toBe(false)
  })
})

describe('/api/calculate-price route', () => {
  describe('PRICE-01: API route proxies Google Routes API', () => {
    it.skip('POST returns prices for transfer with valid origin/destination')
    it.skip('POST returns quoteMode: true when origin is missing')
    it.skip('POST returns quoteMode: true when Google API key is missing')
    it.skip('POST returns quoteMode: true when Google API returns error')
  })

  describe('PRICE-03: Hourly pricing via API', () => {
    it.skip('POST returns prices for hourly trip type without calling Google Routes')
    it.skip('POST uses hours from request body')
  })

  describe('PRICE-04: Daily pricing via API', () => {
    it.skip('POST returns prices for daily trip type with pickupDate and returnDate')
    it.skip('POST returns quoteMode: true when dates are missing for daily')
  })

  describe('PRICE-06: API key not exposed', () => {
    it.skip('response body does not contain API key')
    it.skip('API key is sent via X-Goog-Api-Key header to Google (server-side)')
  })
})

// -----------------------------------------------------------------------
// Shared mocks and helpers for round-trip return leg pricing tests
// -----------------------------------------------------------------------

// Mock globals used across all return leg tests
const mockGlobals = {
  airportFee: 500,         // EUR cents: 5 EUR
  nightCoefficient: 1.5,
  holidayCoefficient: 1.3,
  extraChildSeat: 1000,
  extraLuggage: 500,
  holidayDates: ['2026-12-25', '2026-01-01'],
  returnDiscountPercent: 10,
}

const mockRates = {
  ratePerKm: { business: 200, first_class: 300, business_van: 250 },  // per km in cents
  hourlyRate: { business: 5000, first_class: 7000, business_van: 6000 },
  dailyRate:  { business: 20000, first_class: 28000, business_van: 24000 },
  globals: mockGlobals,
  minFare:    { business: 2000, first_class: 3000, business_van: 2500 },
}

// Mock Supabase clients — returns one coverage zone so transfer path proceeds
const supabaseZoneClient = {
  from: () => ({
    select: () => ({
      eq: () => Promise.resolve({ data: [pragueZone], error: null }),
    }),
  }),
}
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => supabaseZoneClient,
  createSupabasePublicReadClient: () => supabaseZoneClient,
}))

// Mock getPricingConfig to return our controlled rates
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: vi.fn().mockResolvedValue(mockRates),
}))

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 99, limit: 100 }),
  getClientIp: () => '127.0.0.1',
}))

// Standard Google Routes mock — returns 15 km
function mockGoogleRoutes15km() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ routes: [{ distanceMeters: 15000 }] }),
  }))
}

// Build a minimal Next.js-like Request object
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/calculate-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Standard transfer body (non-airport, daytime, no return).
// NOTE: `hours` is omitted — the route's zod schema requires
// `hours: z.number().int().min(1).max(24).optional().default(2)` so we must
// either leave it unset (default kicks in) or send a value >= 1. Transfer trips
// ignore `hours` internally anyway. Historical fixtures sent `hours: 0`, which
// fails validation because zod `.default()` only applies to undefined, not 0.
const baseTransferBody = {
  origin:      { lat: 50.08, lng: 14.42 },
  destination: { lat: 50.09, lng: 14.43 },
  tripType:    'transfer',
  pickupDate:  '2026-05-10',
  pickupTime:  '12:00',
  returnDate:  null,
  returnTime:  null,
  isAirport:   false,
}

describe('round-trip return leg pricing (RTPR-01, RTPR-02, RTPR-03)', () => {
  beforeEach(() => {
    // Reset env and fetch mock before each test
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key')
    mockGoogleRoutes15km()
  })

  it('Test 1 (RTPR-01): night returnTime uses night coefficient; daytime pickupTime uses coefficient 1.0', async () => {
    // Import POST after mocks are set up
    const { POST } = await import('@/app/api/calculate-price/route')

    // Outbound: 12:00 (daytime, no holiday) — coefficient 1.0
    // Return:   23:30 (night) — coefficient 1.5 (nightCoefficient)
    const req = makeRequest({
      ...baseTransferBody,
      pickupTime: '12:00',
      returnDate: '2026-05-11',
      returnTime: '23:30',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.returnLegPrices).not.toBeNull()
    expect(json.prices).not.toBeNull()

    // outbound business price: 15 km * 200 = 3000; no airport, daytime → base stays 3000
    // applied min fare: max(3000, 2000) = 3000; total = 3000
    const outboundBase = json.prices.business.base
    expect(outboundBase).toBe(3000)

    // return leg: same 15km * 200 = 3000; night coeff 1.5 → 4500; airport fee not applied (not airport); min fare → 4500
    // discount: Math.round(4500 * (1 - 10/100)) = Math.round(4050) = 4050
    const returnBase = json.returnLegPrices.business.base
    expect(returnBase).toBe(4050)

    // Confirm return > outbound due to night coefficient
    expect(returnBase).toBeGreaterThan(outboundBase)
  })

  it('Test 2 (RTPR-01): holiday returnDate uses holiday coefficient; non-holiday pickupDate uses 1.0', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')

    const req = makeRequest({
      ...baseTransferBody,
      pickupDate:  '2026-05-10',         // not a holiday
      pickupTime:  '12:00',              // daytime
      returnDate:  '2026-12-25',         // holiday
      returnTime:  '14:00',              // daytime (so night does not interfere)
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.returnLegPrices).not.toBeNull()

    // outbound: 15 * 200 = 3000, no coeff, no airport → base = 3000
    expect(json.prices.business.base).toBe(3000)

    // return: 15 * 200 = 3000; holidayCoefficient 1.3 → 3900; discount 10% → Math.round(3900 * 0.9) = 3510
    expect(json.returnLegPrices.business.base).toBe(3510)
    expect(json.returnLegPrices.business.base).toBeGreaterThan(json.prices.business.base)
  })

  it('Test 3 (RTPR-02): returnLegPrices total equals Math.round(adjustedBase * (1 - discountPct/100))', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')

    // Daytime return (no night/holiday), non-airport
    const req = makeRequest({
      ...baseTransferBody,
      returnDate: '2026-05-11',
      returnTime: '10:00',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.returnLegPrices).not.toBeNull()
    expect(json.returnDiscountPercent).toBe(10)

    // return leg: 15 * 200 = 3000; no coefficient (daytime, no holiday); min fare max(3000, 2000) = 3000
    // discount: Math.round(3000 * (1 - 10/100)) = Math.round(2700) = 2700
    const expectedTotal = Math.round(3000 * (1 - 10 / 100))
    expect(json.returnLegPrices.business.base).toBe(expectedTotal)
    expect(json.returnLegPrices.business.total).toBe(expectedTotal)
  })

  it('Test 4 (RTPR-03): returnLegPrices extras are 0 for all vehicle classes', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')

    const req = makeRequest({
      ...baseTransferBody,
      returnDate: '2026-05-11',
      returnTime: '10:00',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.returnLegPrices).not.toBeNull()
    for (const vc of ['business', 'first_class', 'business_van']) {
      expect(json.returnLegPrices[vc].extras).toBe(0)
    }
  })

  it('Test 5: response shape has returnLegPrices and returnDiscountPercent; no roundTripPrices field', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')

    const req = makeRequest({
      ...baseTransferBody,
      returnDate: '2026-05-11',
      returnTime: '14:00',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json).toHaveProperty('returnLegPrices')
    expect(json).toHaveProperty('returnDiscountPercent')
    expect(json).not.toHaveProperty('roundTripPrices')
    expect(json).toHaveProperty('prices')
    expect(json).toHaveProperty('distanceKm')
    expect(json).toHaveProperty('quoteMode')
  })

  it('Test 6: returnLegPrices is null when returnDate and returnTime are both null', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')

    const req = makeRequest({
      ...baseTransferBody,
      returnDate: null,
      returnTime: null,
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.prices).not.toBeNull()
    expect(json.returnLegPrices).toBeNull()
  })

  it('Test 7: only ONE Google Routes API call is made even when returnTime is present', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')

    const req = makeRequest({
      ...baseTransferBody,
      returnDate: '2026-05-11',
      returnTime: '22:30',
    })
    await POST(req)

    // Symmetric distance reuse: fetch called exactly once
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('STOP-01 + STOP-03: intermediates / waypoints', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key')
    mockGoogleRoutes15km()
  })

  function getFetchBody(): Record<string, unknown> {
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call).toBeDefined()
    const init = call[1] as RequestInit
    return JSON.parse(init.body as string)
  }

  it('with intermediates=[], Google Routes body does NOT contain intermediates key', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    await POST(makeRequest({ ...baseTransferBody, intermediates: [] }))
    const body = getFetchBody()
    expect('intermediates' in body).toBe(false)
  })

  it('with one intermediate stop, Google Routes body contains the waypoint', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    await POST(
      makeRequest({
        ...baseTransferBody,
        intermediates: [{ lat: 50.085, lng: 14.4 }],
      })
    )
    const body = getFetchBody() as { intermediates?: Array<{ location: { latLng: { latitude: number; longitude: number } } }> }
    expect(body.intermediates).toBeDefined()
    expect(body.intermediates).toHaveLength(1)
    expect(body.intermediates![0]).toEqual({
      location: { latLng: { latitude: 50.085, longitude: 14.4 } },
    })
  })

  it('with three intermediate stops, order is preserved (no optimization)', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    const stops = [
      { lat: 50.081, lng: 14.41 },
      { lat: 50.082, lng: 14.42 },
      { lat: 50.083, lng: 14.43 },
    ]
    await POST(makeRequest({ ...baseTransferBody, intermediates: stops }))
    const body = getFetchBody() as { intermediates: Array<{ location: { latLng: { latitude: number; longitude: number } } }> }
    expect(body.intermediates).toHaveLength(3)
    expect(body.intermediates[0].location.latLng.latitude).toBe(50.081)
    expect(body.intermediates[1].location.latLng.latitude).toBe(50.082)
    expect(body.intermediates[2].location.latLng.latitude).toBe(50.083)
  })

  it('Google Routes body NEVER contains optimizeWaypointOrder', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    await POST(
      makeRequest({
        ...baseTransferBody,
        intermediates: [{ lat: 50.085, lng: 14.4 }],
      })
    )
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const rawBody = (call[1] as RequestInit).body as string
    expect(rawBody).not.toMatch(/optimizeWaypointOrder/)
  })

  it('intermediates of length 6 returns 400 and does NOT call Google Routes', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    const tooMany = Array.from({ length: 6 }, (_, i) => ({ lat: 50 + i * 0.001, lng: 14 + i * 0.001 }))
    const res = await POST(makeRequest({ ...baseTransferBody, intermediates: tooMany }))
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('intermediates containing lat=91 returns 400', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    const res = await POST(
      makeRequest({ ...baseTransferBody, intermediates: [{ lat: 91, lng: 14 }] })
    )
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('intermediates containing lng=181 returns 400', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    const res = await POST(
      makeRequest({ ...baseTransferBody, intermediates: [{ lat: 50, lng: 181 }] })
    )
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('omitting intermediates preserves legacy behavior (business base = 3000)', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    const res = await POST(makeRequest(baseTransferBody))
    const json = await res.json()
    expect(json.prices.business.base).toBe(3000)
    const body = getFetchBody()
    expect('intermediates' in body).toBe(false)
  })

  it('hourly tripType with intermediates=[] returns 200 and does not call Google', async () => {
    const { POST } = await import('@/app/api/calculate-price/route')
    const res = await POST(
      makeRequest({
        origin: null,
        destination: null,
        tripType: 'hourly',
        hours: 3,
        pickupDate: '2026-05-10',
        pickupTime: '12:00',
        returnDate: null,
        returnTime: null,
        isAirport: false,
        intermediates: [],
      })
    )
    expect(res.status).toBe(200)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
