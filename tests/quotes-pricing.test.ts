// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 92 plan 92-08 (QUOTE-01; D-04, Phase 91 rule): suggestLinePrice prices one quote line on the server from the
 * live tariffs - distance through ALL stops from computeRouteDistance, airport flag from the coordinates, per-class
 * waiting rate with the first 15 minutes free, one total that includes the waiting. The route-distance module and the
 * tariffs are mocked; the real pricing maths runs.
 */

const { computeRouteDistanceMock, state } = vi.hoisted(() => ({
  computeRouteDistanceMock: vi.fn(),
  state: { auth: 'admin' as 'admin' | '401' | '403', tariffsFail: false, rates: null as unknown },
}))

vi.mock('@/lib/route-distance', () => ({ computeRouteDistance: computeRouteDistanceMock }))
vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (state.auth === '401') return { user: null, error: '401' as const }
    if (state.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: '99999999-9999-4999-8999-999999999999' }, error: null }
  }),
}))
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: async () => {
    if (state.tariffsFail) throw new Error('tariffs down')
    return state.rates
  },
}))

import { POST as PRICE } from '@/app/api/admin/quotes/price/route'
import { computeExtrasTotal } from '@/lib/extras'
import { suggestLinePrice } from '@/lib/quotes/pricing'
import type { QuotePricingLine } from '@/lib/quotes/pricing'
import type { PricingRates } from '@/lib/pricing-config'

function makeRates(over: { waitingRate?: Record<string, number>; ratePerKm?: Record<string, number> } = {}): PricingRates {
  return {
    ratePerKm: over.ratePerKm ?? { business: 2, first_class: 3, business_van: 2.5 },
    hourlyRate: { business: 50, first_class: 70, business_van: 60 },
    dailyRate: { business: 200, first_class: 280, business_van: 240 },
    minFare: { business: 10, first_class: 10, business_van: 10 },
    waitingRate: over.waitingRate ?? { business: 12 },
    globals: {
      airportFee: 5,
      nightCoefficient: 1.2,
      holidayCoefficient: 1.3,
      extraChildSeat: 10,
      extraLuggage: 7,
      holidayDates: [],
      returnDiscountPercent: 10,
      hourlyMinHours: 2,
      hourlyMaxHours: 8,
      notificationFlags: null,
      airportPromoActive: false,
      airportRegularPriceEur: 69,
      airportPromoPriceEur: 59,
    },
  }
}

const PRAGUE = { address: 'Wenceslas Square, Prague', lat: 50.0813, lng: 14.4284 }
const VIENNA = { address: 'Stephansplatz, Vienna', lat: 48.2085, lng: 16.3721 }
const BRNO = { address: 'Brno', lat: 49.1951, lng: 16.6068 }
const AIRPORT = { address: 'Prague Airport', lat: 50.1008, lng: 14.26 }

function line(over: Partial<QuotePricingLine> = {}): QuotePricingLine {
  return {
    trip_type: 'transfer',
    pickup_date: '2027-05-10',
    pickup_time: '12:00',
    origin: PRAGUE,
    destination: VIENNA,
    stops: [],
    vehicle_class: 'business',
    hours: null,
    return_date: null,
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.auth = 'admin'
  state.tariffsFail = false
  state.rates = makeRates()
  computeRouteDistanceMock.mockResolvedValue({ ok: true, distanceKm: 130, durationMin: 90 })
})

describe('tracer: a transfer with one stop is priced on the server through all stops (D-04)', () => {
  it('distance comes from computeRouteDistance with the stops in order; one total includes the waiting', async () => {
    const result = await suggestLinePrice(
      line({ stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 45 }] }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(computeRouteDistanceMock).toHaveBeenCalledTimes(1)
    expect(computeRouteDistanceMock).toHaveBeenCalledWith({
      origin: { lat: PRAGUE.lat, lng: PRAGUE.lng },
      destination: { lat: VIENNA.lat, lng: VIENNA.lng },
      intermediates: [{ lat: BRNO.lat, lng: BRNO.lng }],
    })
    // 130 km x 2 = 260 EUR; 45 min wait = 2 paid blocks x 12 = 24 EUR; one total 284 EUR in cents.
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 28400, waitingUnavailable: false })
  })
})

describe('currency', () => {
  it('czk converts the whole total once with the lib/currency rate, in hundredths', async () => {
    const result = await suggestLinePrice(
      line({ stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 45 }] }),
      { rates: makeRates(), currency: 'czk' },
    )
    // 284 EUR x 25 = 7100 CZK = 710000 hundredths.
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 710000, waitingUnavailable: false })
  })
})

describe('waiting', () => {
  it('the first 15 minutes at a stop are free and cost nothing', async () => {
    const result = await suggestLinePrice(
      line({ stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 15 }] }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 26000, waitingUnavailable: false })
  })

  it('a class without a waiting rate and a 45-minute wait: waitingUnavailable true, suggestion without paid waiting', async () => {
    const result = await suggestLinePrice(
      line({
        vehicle_class: 'first_class',
        stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 45 }],
      }),
      { rates: makeRates(), currency: 'eur' },
    )
    // 130 km x 3 = 390 EUR, no waiting fee.
    expect(result).toEqual({ ok: true, distanceKm: 130, suggestedMinor: 39000, waitingUnavailable: true })
  })

  it('a class without a waiting rate and only free waiting is not "unavailable"', async () => {
    const result = await suggestLinePrice(
      line({
        vehicle_class: 'first_class',
        stops: [{ address: 'Brno', lat: BRNO.lat, lng: BRNO.lng, wait_minutes: 15 }],
      }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(result).toMatchObject({ ok: true, waitingUnavailable: false })
  })
})

describe('airport and extras', () => {
  it('the airport fee comes from the coordinates', async () => {
    const result = await suggestLinePrice(line({ origin: AIRPORT }), { rates: makeRates(), currency: 'eur' })
    expect(result).toMatchObject({ ok: true, suggestedMinor: 26500 })
  })

  it('extras go through computeExtrasTotal, the same function the manual booking uses', async () => {
    const rates = makeRates()
    const extras = computeExtrasTotal(
      { infantSeat: false, childSeat: true, boosterSeat: false, meetAndGreet: false, extraLuggage: true },
      { infantSeat: 0, childSeat: rates.globals.extraChildSeat, boosterSeat: 0, meetAndGreet: 0, extraLuggage: rates.globals.extraLuggage },
    )
    const result = await suggestLinePrice(line({ extra_child_seat: true, extra_luggage: true }), { rates, currency: 'eur' })
    // 130 km x 2 = 260 EUR plus whatever the site currently charges for the two extras.
    expect(result).toMatchObject({ ok: true, suggestedMinor: (260 + extras) * 100 })
  })
})

describe('other trip types never ask Google for a distance', () => {
  it('hourly: hours x the hourly rate', async () => {
    const result = await suggestLinePrice(line({ trip_type: 'hourly', destination: null, hours: 3 }), {
      rates: makeRates(),
      currency: 'eur',
    })
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, distanceKm: null, suggestedMinor: 15000, waitingUnavailable: false })
  })

  it('daily: the days between pickup and return x the daily rate', async () => {
    const result = await suggestLinePrice(
      line({ trip_type: 'daily', destination: null, return_date: '2027-05-12' }),
      { rates: makeRates(), currency: 'eur' },
    )
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, distanceKm: null, suggestedMinor: 40000, waitingUnavailable: false })
  })
})

describe('failures are answered, never guessed (Phase 91 rule)', () => {
  it('a route that cannot be computed is route_unavailable, with no fallback distance', async () => {
    computeRouteDistanceMock.mockResolvedValue({ ok: false, reason: 'timeout' })
    const result = await suggestLinePrice(line(), { rates: makeRates(), currency: 'eur' })
    expect(result).toEqual({ ok: false, reason: 'route_unavailable' })
  })

  it('a class with no tariff at all is pricing_unavailable', async () => {
    const result = await suggestLinePrice(line(), { rates: makeRates({ ratePerKm: {} }), currency: 'eur' })
    expect(result).toEqual({ ok: false, reason: 'pricing_unavailable' })
  })

  it('a transfer without a destination cannot be priced', async () => {
    const result = await suggestLinePrice(line({ destination: null }), { rates: makeRates(), currency: 'eur' })
    expect(result).toEqual({ ok: false, reason: 'pricing_unavailable' })
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
  })
})

// == POST /api/admin/quotes/price (the builder asks for a suggestion before saving) ==================================

function priceLine(over: Record<string, unknown> = {}) {
  return {
    trip_type: 'transfer',
    pickup_date: '2027-05-10',
    pickup_time: '12:00',
    origin: PRAGUE,
    destination: VIENNA,
    stops: [],
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    ...over,
  }
}

function price(body: unknown): Promise<Response> {
  return PRICE(
    new Request('http://localhost/api/admin/quotes/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

describe('POST /api/admin/quotes/price', () => {
  it('prices one line on the server: distance, suggestion and the waiting flag, no-store', async () => {
    const res = await price({ line: priceLine(), currency: 'eur' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ distanceKm: 130, suggestedMinor: 26000, waitingUnavailable: false })
  })

  it('the same line in czk gives the converted amount', async () => {
    const res = await price({ line: priceLine(), currency: 'czk' })
    expect(res.status).toBe(200)
    // 260 EUR x 25 = 6500 CZK = 650000 hundredths
    expect(await res.json()).toEqual({ distanceKm: 130, suggestedMinor: 650000, waitingUnavailable: false })
  })

  it('a class without a waiting rate and a 45-minute wait: waitingUnavailable true, suggestion without paid waiting', async () => {
    const res = await price({
      line: priceLine({ vehicle_class: 'first_class', stops: [{ ...BRNO, wait_minutes: 45 }] }),
      currency: 'eur',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ distanceKm: 130, suggestedMinor: 39000, waitingUnavailable: true })
  })

  it('the distance is the server route through the stops, never a number from the body', async () => {
    await price({ line: priceLine({ stops: [{ ...BRNO, wait_minutes: 0 }] }), currency: 'eur' })
    expect(computeRouteDistanceMock).toHaveBeenCalledWith({
      origin: { lat: PRAGUE.lat, lng: PRAGUE.lng },
      destination: { lat: VIENNA.lat, lng: VIENNA.lng },
      intermediates: [{ lat: BRNO.lat, lng: BRNO.lng }],
    })
    expect((await price({ line: { ...priceLine(), distance_km: 1 }, currency: 'eur' })).status).toBe(400)
    expect((await price({ line: { ...priceLine(), amount_minor: 100 }, currency: 'eur' })).status).toBe(400)
  })

  it('401 and 403 come before the body is read', async () => {
    for (const auth of ['401', '403'] as const) {
      state.auth = auth
      expect((await price('not json')).status).toBe(auth === '401' ? 401 : 403)
    }
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
  })

  it('a malformed line, malformed JSON, an unknown currency and an oversized body are refused', async () => {
    expect((await price('{"line":')).status).toBe(400)
    expect((await price({ line: priceLine({ stops: Array.from({ length: 6 }, () => ({ ...BRNO, wait_minutes: 0 })) }), currency: 'eur' })).status).toBe(400)
    expect((await price({ line: priceLine({ pickup_time: '25:00' }), currency: 'eur' })).status).toBe(400)
    expect((await price({ line: priceLine(), currency: 'usd' })).status).toBe(400)
    expect((await price({ line: priceLine(), currency: 'eur', extra: 1 })).status).toBe(400)
    expect((await price({ line: priceLine({ special_requests: 'x'.repeat(5_000) }), currency: 'eur' })).status).toBe(413)
    expect(computeRouteDistanceMock).not.toHaveBeenCalled()
  })

  it('503 pricing_unavailable when the route cannot be computed or the tariffs cannot be loaded', async () => {
    computeRouteDistanceMock.mockResolvedValue({ ok: false, reason: 'http_error' })
    let res = await price({ line: priceLine(), currency: 'eur' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'pricing_unavailable' })

    state.tariffsFail = true
    res = await price({ line: priceLine(), currency: 'eur' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'pricing_unavailable' })
  })
})
